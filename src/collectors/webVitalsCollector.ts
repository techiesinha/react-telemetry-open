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

import type { ResolvedConfig } from "../types/internal";
import { MetricName, SignalType, VitalRating, PerformanceEntryType } from "../types/internal";
import type { SignalBus } from "../core/signalBus";
import { Locale } from "../locale";
import { interpolate } from "../utils/interpolate";
import { getWallClockTime } from "../utils/timing";
import { addDocumentListener } from "../utils/browserEnvironment";
import {
  LCP_GOOD_THRESHOLD_MS,
  LCP_POOR_THRESHOLD_MS,
  FCP_GOOD_THRESHOLD_MS,
  FCP_POOR_THRESHOLD_MS,
  FID_GOOD_THRESHOLD_MS,
  FID_POOR_THRESHOLD_MS,
  CLS_GOOD_THRESHOLD,
  CLS_POOR_THRESHOLD,
  INP_GOOD_THRESHOLD_MS,
  INP_POOR_THRESHOLD_MS,
  INP_DURATION_THRESHOLD_MS,
} from "../constants";

/**
 * WebVitalsCollector measures Google Core Web Vitals using PerformanceObserver.
 *
 * Signals collected:
 *   FCP — First Contentful Paint (all modern browsers)
 *   LCP — Largest Contentful Paint (Chrome/Edge only)
 *   FID — First Input Delay (Chrome/Edge only)
 *   CLS — Cumulative Layout Shift (Chrome/Edge only)
 *   INP — Interaction to Next Paint (Chrome 96+ only)
 *
 * LCP, CLS and INP are emitted on page hide (visibilitychange to 'hidden')
 * as they can be updated multiple times during a session.
 * FCP and FID are emitted immediately when they fire.
 *
 * CLS excludes input-triggered layout shifts — only unexpected shifts counted.
 */
export class WebVitalsCollector {
  private static isInitialised = false;
  private static observer: PerformanceObserver | null = null;

  /** LCP accumulates — only the final value is emitted */
  private static lcpValue: number | null = null;
  private static lcpTimestamp: number | null = null;

  /** CLS accumulates across entire session */
  private static clsScore = 0;

  /** INP tracks worst interaction delay across session */
  private static inpValue = 0;

  /** Cleanup for visibilitychange listener */
  private static visibilityCleanup: (() => void) | null = null;

  static init(signalBus: SignalBus, config: ResolvedConfig): void {
    if (WebVitalsCollector.isInitialised) return;
    if (!config.signals.webVitals) return;
    if (typeof PerformanceObserver === "undefined") return;

    WebVitalsCollector.isInitialised = true;

    WebVitalsCollector.observer = new PerformanceObserver((entryList) => {
      try {
        entryList.getEntries().forEach((entry) => {
          WebVitalsCollector.handleEntry(entry, signalBus, config);
        });
      } catch {
        // Observer callback errors are isolated
      }
    });

    // Observe all supported entry types — try each separately
    const entryTypesToObserve = [
      PerformanceEntryType.LargestContentfulPaint,
      PerformanceEntryType.FirstInput,
      PerformanceEntryType.LayoutShift,
      PerformanceEntryType.Paint,
      PerformanceEntryType.Event,
    ];

    for (const entryType of entryTypesToObserve) {
      if (PerformanceObserver.supportedEntryTypes?.includes(entryType)) {
        try {
          const observeOptions: PerformanceObserverInit & { durationThreshold?: number } = {
            type: entryType,
            buffered: true, // Capture entries that fired before observer was created
          };
          // INP requires durationThreshold
          if (entryType === PerformanceEntryType.Event) {
            observeOptions.durationThreshold = INP_DURATION_THRESHOLD_MS;
          }
          WebVitalsCollector.observer!.observe(observeOptions);
        } catch {
          // Some browsers throw even for listed supported types — ignore
          if (config.debug) {
            console.warn(
              interpolate(Locale.webVitals.entryTypeUnsupported, { entryType })
            );
          }
        }
      }
    }

    // LCP and CLS must be finalised on page hide
    WebVitalsCollector.visibilityCleanup = addDocumentListener(
      "visibilitychange",
      () => {
        if (document.visibilityState !== "hidden") return;
        WebVitalsCollector.emitFinalVitals(signalBus, config);
      },
      { once: true }
    );
  }

  static destroy(): void {
    WebVitalsCollector.observer?.disconnect();
    WebVitalsCollector.observer = null;
    WebVitalsCollector.visibilityCleanup?.();
    WebVitalsCollector.visibilityCleanup = null;
    WebVitalsCollector.lcpValue = null;
    WebVitalsCollector.lcpTimestamp = null;
    WebVitalsCollector.clsScore = 0;
    WebVitalsCollector.inpValue = 0;
    WebVitalsCollector.isInitialised = false;
  }

  private static handleEntry(
    entry: PerformanceEntry,
    signalBus: SignalBus,
    config: ResolvedConfig
  ): void {
    switch (entry.entryType) {
      case PerformanceEntryType.LargestContentfulPaint: {
        // LCP updates multiple times — store latest, emit on page hide
        const lcpEntry = entry as PerformanceEntry & { startTime: number };
        WebVitalsCollector.lcpValue = lcpEntry.startTime;
        // Convert to absolute wall clock timestamp
        WebVitalsCollector.lcpTimestamp = performance.timeOrigin + lcpEntry.startTime;
        break;
      }

      case PerformanceEntryType.Paint: {
        // FCP — emit immediately when it fires
        if (entry.name === "first-contentful-paint") {
          signalBus.emit({
            type: SignalType.Metric,
            name: MetricName.WebVitalFcp,
            timestamp: performance.timeOrigin + entry.startTime,
            route: "",
            sessionId: "",
            value: entry.startTime,
            unit: "ms",
            attributes: {
              rating: WebVitalsCollector.rateFcp(entry.startTime),
            },
          });
        }
        break;
      }

      case PerformanceEntryType.FirstInput: {
        // FID — emit immediately on first input
        const fidEntry = entry as PerformanceEntry & {
          processingStart: number;
          startTime: number;
          name: string;
        };
        const firstInputDelay = fidEntry.processingStart - fidEntry.startTime;

        signalBus.emit({
          type: SignalType.Metric,
          name: MetricName.WebVitalFid,
          timestamp: performance.timeOrigin + fidEntry.startTime,
          route: "",
          sessionId: "",
          value: firstInputDelay,
          unit: "ms",
          attributes: {
            rating: WebVitalsCollector.rateFid(firstInputDelay),
            inputType: fidEntry.name,
          },
        });
        break;
      }

      case PerformanceEntryType.LayoutShift: {
        // CLS — accumulate, excluding input-triggered shifts
        const clsEntry = entry as PerformanceEntry & {
          hadRecentInput: boolean;
          value: number;
        };
        if (!clsEntry.hadRecentInput) {
          WebVitalsCollector.clsScore += clsEntry.value;
        }
        break;
      }

      case PerformanceEntryType.Event: {
        // INP — track worst interaction delay across session
        const eventEntry = entry as PerformanceEntry & { duration: number };
        if (eventEntry.duration > WebVitalsCollector.inpValue) {
          WebVitalsCollector.inpValue = eventEntry.duration;
        }
        break;
      }
    }
  }

  /** Emits LCP, CLS, and INP on page hide — these are their final values */
  private static emitFinalVitals(
    signalBus: SignalBus,
    _config: ResolvedConfig
  ): void {
    const hideTimestamp = getWallClockTime();

    if (WebVitalsCollector.lcpValue !== null) {
      signalBus.emit({
        type: SignalType.Metric,
        name: MetricName.WebVitalLcp,
        timestamp: WebVitalsCollector.lcpTimestamp ?? hideTimestamp,
        route: "",
        sessionId: "",
        value: WebVitalsCollector.lcpValue,
        unit: "ms",
        attributes: {
          rating: WebVitalsCollector.rateLcp(WebVitalsCollector.lcpValue),
        },
      });
    }

    signalBus.emit({
      type: SignalType.Metric,
      name: MetricName.WebVitalCls,
      timestamp: hideTimestamp,
      route: "",
      sessionId: "",
      value: WebVitalsCollector.clsScore,
      unit: "score",
      attributes: {
        rating: WebVitalsCollector.rateCls(WebVitalsCollector.clsScore),
      },
    });

    if (WebVitalsCollector.inpValue > 0) {
      signalBus.emit({
        type: SignalType.Metric,
        name: MetricName.WebVitalInp,
        timestamp: hideTimestamp,
        route: "",
        sessionId: "",
        value: WebVitalsCollector.inpValue,
        unit: "ms",
        attributes: {
          rating: WebVitalsCollector.rateInp(WebVitalsCollector.inpValue),
        },
      });
    }
  }

  private static rateLcp = (value: number): VitalRating =>
    value < LCP_GOOD_THRESHOLD_MS
      ? VitalRating.Good
      : value < LCP_POOR_THRESHOLD_MS
      ? VitalRating.NeedsImprovement
      : VitalRating.Poor;

  private static rateFcp = (value: number): VitalRating =>
    value < FCP_GOOD_THRESHOLD_MS
      ? VitalRating.Good
      : value < FCP_POOR_THRESHOLD_MS
      ? VitalRating.NeedsImprovement
      : VitalRating.Poor;

  private static rateFid = (value: number): VitalRating =>
    value < FID_GOOD_THRESHOLD_MS
      ? VitalRating.Good
      : value < FID_POOR_THRESHOLD_MS
      ? VitalRating.NeedsImprovement
      : VitalRating.Poor;

  private static rateCls = (value: number): VitalRating =>
    value < CLS_GOOD_THRESHOLD
      ? VitalRating.Good
      : value < CLS_POOR_THRESHOLD
      ? VitalRating.NeedsImprovement
      : VitalRating.Poor;

  private static rateInp = (value: number): VitalRating =>
    value < INP_GOOD_THRESHOLD_MS
      ? VitalRating.Good
      : value < INP_POOR_THRESHOLD_MS
      ? VitalRating.NeedsImprovement
      : VitalRating.Poor;
}
