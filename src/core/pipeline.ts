/**
 * Copyright 2026 Abhishek Sinha (sinha@live.in)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import type { RawEvent, EnrichedEvent, ProcessedEvent } from "../types/internal";
import { MetricName, SignalType } from "../types/internal";
import type { ResolvedConfig } from "../types/internal";
import type { SessionManager } from "./sessionManager";
import type { ExporterManager } from "./exporterManager";
import { getCompiledIgnoreUrls, getCompiledIgnoreComponents } from "./configManager";
import { scheduleMicrotask, getWallClockTime } from "../utils/timing";
import {
  DEFAULT_BATCH_SIZE,
  DEFAULT_FLUSH_INTERVAL_MS,
  DEFAULT_MAX_QUEUE_SIZE,
  SAVE_DATA_SAMPLING_RATE,
  SAVE_DATA_FLUSH_INTERVAL_MS,
  PACKAGE_VERSION,
} from "../constants";

/**
 * Pipeline processes every event emitted to the Signal Bus.
 *
 * Stages:
 *   1. Enrich — attach stable context (device, browser, app metadata)
 *   2. Sample — probabilistically drop events based on sampling rate
 *   3. Filter — drop events on the ignore list
 *   4. Batch  — accumulate events and flush when full or timer fires
 *
 * Volatile context (timestamp, route, sessionId) is captured synchronously
 * at the hook — not here. Stable context that never changes during a session
 * is attached here in the async microtask path.
 *
 * The pipeline runs in a single queueMicrotask — N events = 1 microtask,
 * preventing microtask queue starvation under high event frequency.
 */
export class Pipeline {
  private readonly config: ResolvedConfig;
  private readonly sessionManager: SessionManager;
  private exporterManager: ExporterManager | null = null;

  /** Batch queue — swapped by reference on flush for O(1) operation */
  private batchQueue: ProcessedEvent[] = [];

  /** Flush timer — stored for cleanup */
  private flushTimerId: ReturnType<typeof setInterval> | null = null;

  /** Pending events waiting for single microtask processing */
  private readonly pendingEventQueue: RawEvent[] = [];

  /** Flag to prevent scheduling multiple microtasks simultaneously */
  private isMicrotaskScheduled = false;

  constructor(config: ResolvedConfig, sessionManager: SessionManager) {
    this.config = config;
    this.sessionManager = sessionManager;
    this.startFlushTimer();
  }

  /** Connects the Pipeline to an ExporterManager */
  connect(exporterManager: ExporterManager): void {
    this.exporterManager = exporterManager;
  }

  /**
   * Entry point — receives events from Signal Bus.
   * Queues event and schedules a single microtask to process all pending events.
   *
   * Optimisation: Single microtask for N events prevents starvation.
   * See docs/optimisations.md entry — queueMicrotask starvation fix.
   */
  process(event: RawEvent): void {
    this.pendingEventQueue.push(event);
    this.scheduleProcessing();
  }

  /** Forces an immediate synchronous flush of the batch queue */
  flushSync(): void {
    this.flush();
  }

  /** Cleans up timers */
  destroy(): void {
    if (this.flushTimerId !== null) {
      clearInterval(this.flushTimerId);
      this.flushTimerId = null;
    }
  }

  /**
   * Schedules a single microtask to process all currently pending events.
   * No-op if a microtask is already scheduled.
   */
  private scheduleProcessing(): void {
    if (this.isMicrotaskScheduled) return;
    this.isMicrotaskScheduled = true;

    scheduleMicrotask(() => {
      this.isMicrotaskScheduled = false;
      // Take all pending events in one operation — clears the pending queue
      const eventsToProcess = this.pendingEventQueue.splice(0);
      for (const pendingEvent of eventsToProcess) {
        try {
          this.processEvent(pendingEvent);
        } catch (pipelineError) {
          // Surface pipeline errors — previously failed silently in microtask
          console.error("[react-telemetry-open] Pipeline processing error:", pipelineError);
        }
      }
    });
  }

  private processEvent(event: RawEvent): void {
    // Stage 1 — Enrich with stable context
    const enrichedEvent = this.enrich(event);

    // Stage 2 — Sample
    if (!this.shouldSample(enrichedEvent)) return;

    // Stage 3 — Filter
    if (this.shouldFilter(enrichedEvent)) return;

    // Stage 4 — Batch add
    this.addToBatch(enrichedEvent);
  }

  /**
   * Attaches stable session context to the event.
   * Volatile context (timestamp, route, sessionId) is already on the event
   * from synchronous capture at the hook.
   */
  private enrich(rawEvent: RawEvent): EnrichedEvent {
    const sessionSnapshot = this.sessionManager.getSnapshot();
    const sessionDuration = this.sessionManager.getSessionDuration();

    return {
      ...rawEvent,
      app: {
        name: this.config.app.name,
        version: this.config.app.version,
        environment: this.config.app.environment,
        buildId: this.config.app.buildId,
      },
      session: {
        id: sessionSnapshot.sessionId,
        startTime: sessionSnapshot.sessionStartTime,
        duration: sessionDuration,
        pageViews: sessionSnapshot.pageViews,
      },
      device: sessionSnapshot.device,
      browser: sessionSnapshot.browser,
      os: sessionSnapshot.os,
      network: sessionSnapshot.network,
      react: {
        version: this.getReactVersion(),
        mode: "concurrent",
        strictMode: false,
      },
      deployment: {
        packageVersion: PACKAGE_VERSION,
        collectorEndpoint: this.config.exporter.url,
      },
    };
  }

  /**
   * Determines whether to record this event based on sampling rate.
   * Errors always pass through — never sampled out.
   *
   * saveData flag overrides config sampling rate at the effective rate level,
   * not by mutating the frozen config object.
   */
  private shouldSample(event: EnrichedEvent): boolean {
    // Errors always recorded regardless of sampling rate
    const isErrorEvent =
      event.type === SignalType.Log &&
      (event.name === MetricName.JsError ||
        event.name === MetricName.UnhandledRejection ||
        event.name === MetricName.ReactError);

    if (isErrorEvent) return true;

    // Derive effective sampling rate — does not mutate frozen config
    const effectiveSamplingRate =
      event.network.saveData
        ? Math.min(this.config.sampling.rate, SAVE_DATA_SAMPLING_RATE)
        : this.config.sampling.rate;

    return Math.random() < effectiveSamplingRate;
  }

  /**
   * Determines whether to drop this event based on ignore lists.
   *
   * Optimisation: Set.has() for components O(1), RegExp.test() for URLs O(1).
   * See docs/optimisations.md entries #2 and #3.
   */
  private shouldFilter(event: EnrichedEvent): boolean {
    const componentName = event.attributes["component"] as string | undefined;
    const eventUrl = event.attributes["url"] as string | undefined;

    // Component filter — O(1) Set lookup
    if (componentName) {
      const ignoredComponents = getCompiledIgnoreComponents();
      if (ignoredComponents?.has(componentName)) return true;
    }

    // URL filter — O(1) RegExp test on combined pattern
    if (eventUrl) {
      const ignoredUrlPattern = getCompiledIgnoreUrls();
      if (ignoredUrlPattern?.test(eventUrl)) return true;
    }

    return false;
  }

  /**
   * Adds a processed event to the batch queue.
   * Flushes immediately if batch size limit is reached.
   *
   * Optimisation: Array push O(1), no intermediate copies.
   */
  private addToBatch(event: ProcessedEvent): void {
    // Enforce queue size cap — drop oldest events first
    if (this.batchQueue.length >= this.config.batch.maxQueueSize) {
      this.batchQueue.shift(); // O(n) but only at cap — acceptable
    }

    this.batchQueue.push(event);

    if (this.batchQueue.length >= this.config.batch.size) {
      this.flush();
    }
  }

  /**
   * Flushes the batch queue to the ExporterManager.
   *
   * Optimisation: Array reference swap O(1) instead of splice O(n).
   * See docs/optimisations.md entry #8.
   */
  private flush(): void {
    if (this.batchQueue.length === 0 || !this.exporterManager) return;

    // Reference swap — O(1) — give old array to exporter, continue with empty array
    const batchToExport = this.batchQueue;
    this.batchQueue = [];

    this.exporterManager.export(batchToExport).catch(() => {
      // Export failure handled inside ExporterManager — never propagates here
    });
  }

  private startFlushTimer(): void {
    const flushInterval = this.getEffectiveFlushInterval();

    this.flushTimerId = setInterval(() => {
      this.flush();
    }, flushInterval);
  }

  private getEffectiveFlushInterval(): number {
    // Use longer flush interval when saveData is active
    if (
      typeof navigator !== "undefined" &&
      (navigator as { connection?: { saveData?: boolean } }).connection?.saveData
    ) {
      return SAVE_DATA_FLUSH_INTERVAL_MS;
    }
    return this.config.batch.flushIntervalMs;
  }

  private getReactVersion(): string {
    try {
      if (typeof require !== "undefined") {
        const react = require("react") as { version?: string };
        return react.version ?? "unknown";
      }
    } catch {
      // React not accessible
    }
    return "unknown";
  }
}
