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
import { MetricName, SignalType, SourceConfidence } from "../types/internal";
import type { SignalBus } from "../core/signalBus";
import { Locale } from "../locale";
import { getWallClockTime } from "../utils/timing";
import {
  MS_PER_FRAME_AT_60FPS,
  RENDER_TIMELINE_MAX_SIZE,
} from "../constants";

interface RenderTimelineEntry {
  readonly component: string;
  readonly startTime: number;
  readonly endTime: number;
}

/**
 * LongTaskCollector detects JavaScript operations that block the main thread
 * for more than 50ms using the PerformanceObserver longtask API.
 *
 * Source attribution is performed by correlating long task timestamps with
 * recent render events from the render timeline buffer. This is best-effort
 * and clearly labelled as inferred, not measured.
 *
 * Supported browsers: Chrome and Edge only.
 * PerformanceObserver longtask is not available in Firefox or Safari.
 */
export class LongTaskCollector {
  private static isInitialised = false;
  private static observer: PerformanceObserver | null = null;

  /**
   * Circular buffer of recent render events for source attribution.
   * Max size RENDER_TIMELINE_MAX_SIZE (10) — O(1) effective for correlation.
   */
  private static renderTimeline: RenderTimelineEntry[] = [];

  /** Records a completed render event for long task correlation */
  static recordRender(
    componentName: string,
    renderStartTime: number,
    renderEndTime: number
  ): void {
    LongTaskCollector.renderTimeline.push({
      component: componentName,
      startTime: renderStartTime,
      endTime: renderEndTime,
    });

    // Circular buffer — remove oldest entry when at max size
    if (LongTaskCollector.renderTimeline.length > RENDER_TIMELINE_MAX_SIZE) {
      LongTaskCollector.renderTimeline.shift();
    }
  }

  static init(signalBus: SignalBus, config: ResolvedConfig): void {
    if (LongTaskCollector.isInitialised) return;
    if (!config.signals.longTasks) return;
    if (typeof PerformanceObserver === "undefined") return;

    if (!PerformanceObserver.supportedEntryTypes?.includes("longtask")) {
      if (config.debug) {
        console.warn(Locale.longTask.apiUnavailable);
      }
      return;
    }

    LongTaskCollector.isInitialised = true;

    LongTaskCollector.observer = new PerformanceObserver((entryList) => {
      try {
        entryList.getEntries().forEach((performanceEntry) => {
          LongTaskCollector.handleLongTask(performanceEntry, signalBus);
        });
      } catch {
        // Observer callback errors are isolated — observer continues working
      }
    });

    try {
      LongTaskCollector.observer.observe({ entryTypes: ["longtask"] });
    } catch {
      // Some browsers throw even for supported entry types
      LongTaskCollector.observer = null;
      LongTaskCollector.isInitialised = false;
    }
  }

  static destroy(): void {
    LongTaskCollector.observer?.disconnect();
    LongTaskCollector.observer = null;
    LongTaskCollector.renderTimeline = [];
    LongTaskCollector.isInitialised = false;
  }

  private static handleLongTask(
    entry: PerformanceEntry,
    signalBus: SignalBus
  ): void {
    const taskDuration = entry.duration;
    const taskStartRelative = entry.startTime;
    const taskEndRelative = taskStartRelative + taskDuration;

    // Convert relative startTime to absolute wall clock timestamp
    // MANDATORY: performance.timeOrigin + entry.startTime for accurate timestamps
    const absoluteTimestamp =
      performance.timeOrigin + taskStartRelative;

    const likelyCause = LongTaskCollector.findLikelyCause(
      taskStartRelative,
      taskEndRelative
    );

    signalBus.emit({
      type: SignalType.Metric,
      name: MetricName.LongTaskDuration,
      // Absolute wall clock timestamp — not relative performance.now()
      timestamp: absoluteTimestamp,
      route: "",
      sessionId: "",
      startTime: taskStartRelative,
      endTime: taskEndRelative,
      duration: taskDuration,
      value: taskDuration,
      unit: "ms",
      attributes: {
        // Browser attribution — almost always "unknown" in practice
        browserAttribution:
          (entry as PerformanceEntry & {
            attribution?: Array<{ name?: string }>;
          }).attribution?.[0]?.name ?? "unknown",
        // Our correlation — clearly labelled as inferred, not measured
        likelyCause,
        sourceConfidence: likelyCause
          ? SourceConfidence.Inferred
          : SourceConfidence.Unknown,
        // Estimate frames dropped based on frame budget at 60fps
        estimatedFramesDropped: Math.floor(taskDuration / MS_PER_FRAME_AT_60FPS),
      },
    });
  }

  /**
   * Finds the render most likely to have caused a long task by checking
   * for temporal overlap between task and render windows.
   *
   * Returns the component with the most overlap, or null if none found.
   * This is circumstantial attribution — labelled as 'inferred'.
   *
   * Complexity: O(n) where n = renderTimeline.length (max 10) — effectively O(1).
   */
  private static findLikelyCause(
    taskStartTime: number,
    taskEndTime: number
  ): string | null {
    let bestMatchComponent: string | null = null;
    let bestOverlapDuration = 0;

    for (const renderEntry of LongTaskCollector.renderTimeline) {
      const doesOverlap =
        renderEntry.startTime < taskEndTime &&
        renderEntry.endTime > taskStartTime;

      if (!doesOverlap) continue;

      const overlapDuration =
        Math.min(renderEntry.endTime, taskEndTime) -
        Math.max(renderEntry.startTime, taskStartTime);

      if (overlapDuration > bestOverlapDuration) {
        bestOverlapDuration = overlapDuration;
        bestMatchComponent = renderEntry.component;
      }
    }

    return bestMatchComponent;
  }
}
