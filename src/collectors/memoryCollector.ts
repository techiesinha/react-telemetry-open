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
import { MetricName, SignalType, MemorySampleTrigger } from "../types/internal";
import type { SignalBus } from "../core/signalBus";
import { Locale } from "../locale";
import { getWallClockTime } from "../utils/timing";
import { MEMORY_SAMPLE_INTERVAL_MS, MIN_VALID_HEAP_SIZE_BYTES } from "../constants";

/** Chrome-only performance.memory interface */
interface ChromePerformanceMemory {
  readonly usedJSHeapSize: number;
  readonly totalJSHeapSize: number;
  readonly jsHeapSizeLimit: number;
}

/**
 * MemoryCollector samples JavaScript heap memory usage on a periodic interval.
 *
 * Browser support: Chrome and Edge only.
 * performance.memory is not available in Firefox or Safari.
 *
 * Samples on:
 *   - 30-second interval (trend detection)
 *   - Tab hide (final snapshot before page goes to background)
 *
 * Protections:
 *   - Returns immediately in SSR or non-Chrome browsers
 *   - Skips emit when performance.memory returns all zeros (cross-origin isolation restriction)
 *   - Interval ID always stored and cleared on destroy — no leaked intervals
 *   - All values labelled with precision:approximate — GC timing uncertainty
 */
export class MemoryCollector {
  private static isInitialised = false;
  private static samplingIntervalId: ReturnType<typeof setInterval> | null = null;
  private static visibilityCleanup: (() => void) | null = null;
  private static signalBus: SignalBus | null = null;
  private static config: ResolvedConfig | null = null;

  static init(signalBus: SignalBus, config: ResolvedConfig): void {
    if (MemoryCollector.isInitialised) return;
    if (!config.signals.memory) return;

    // Double guard — SSR and non-browser environments
    if (typeof window === "undefined") return;
    if (typeof performance === "undefined") return;
    if (!("memory" in performance)) {
      if (config.debug) {
        console.warn(Locale.memory.apiUnavailable);
      }
      return;
    }

    MemoryCollector.isInitialised = true;
    MemoryCollector.signalBus = signalBus;
    MemoryCollector.config = config;

    // Start periodic sampling
    MemoryCollector.samplingIntervalId = setInterval(() => {
      // Pause sampling when tab is not visible
      if (document.visibilityState === "hidden") return;
      MemoryCollector.sampleNow(MemorySampleTrigger.Interval);
    }, MEMORY_SAMPLE_INTERVAL_MS);

    // Take a snapshot when tab becomes hidden
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        MemoryCollector.sampleNow(MemorySampleTrigger.PageHide);
      }
    };

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibilityChange);
      MemoryCollector.visibilityCleanup = () => {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      };
    }

    // Initial sample at boot
    MemoryCollector.sampleNow(MemorySampleTrigger.Interval);
  }

  static destroy(): void {
    if (MemoryCollector.samplingIntervalId !== null) {
      clearInterval(MemoryCollector.samplingIntervalId);
      MemoryCollector.samplingIntervalId = null;
    }
    MemoryCollector.visibilityCleanup?.();
    MemoryCollector.visibilityCleanup = null;
    MemoryCollector.signalBus = null;
    MemoryCollector.config = null;
    MemoryCollector.isInitialised = false;
  }

  /**
   * Takes an immediate memory snapshot and emits it to the Signal Bus.
   * Can be called externally by other collectors for correlation sampling.
   */
  static sampleNow(trigger: MemorySampleTrigger): void {
    if (!MemoryCollector.signalBus) return;

    const memoryApi = (performance as typeof performance & {
      memory?: ChromePerformanceMemory;
    }).memory;

    if (!memoryApi) return;

    const usedHeapBytes = memoryApi.usedJSHeapSize;
    const totalHeapBytes = memoryApi.totalJSHeapSize;
    const heapLimitBytes = memoryApi.jsHeapSizeLimit;

    // Validate — all zeros means API is restricted (cross-origin isolation not enabled)
    if (usedHeapBytes === 0 && heapLimitBytes === 0) {
      if (MemoryCollector.config?.debug) {
        console.warn(Locale.memory.apiReturningZeros);
      }
      return; // Never emit fabricated zeros
    }

    // Skip samples below minimum threshold — likely untrustworthy
    if (usedHeapBytes < MIN_VALID_HEAP_SIZE_BYTES) return;

    const usedHeapMb = Math.round(usedHeapBytes / 1_048_576);
    const totalHeapMb = Math.round(totalHeapBytes / 1_048_576);
    const heapLimitMb = Math.round(heapLimitBytes / 1_048_576);
    const heapUsagePercent =
      heapLimitBytes > 0
        ? Math.round((usedHeapBytes / heapLimitBytes) * 100 * 10) / 10
        : 0;

    MemoryCollector.signalBus.emit({
      type: SignalType.Metric,
      name: MetricName.MemoryHeapUsed,
      timestamp: getWallClockTime(),
      route: "",
      sessionId: "",
      value: usedHeapBytes,
      unit: "bytes",
      attributes: {
        heapUsedMb: usedHeapMb,
        heapTotalMb: totalHeapMb,
        heapLimitMb,
        heapUsagePercent,
        // All memory values are approximate — GC may not have run
        precision: "approximate",
        trigger,
        tabVisible: typeof document !== "undefined"
          ? document.visibilityState === "visible"
          : true,
      },
    });
  }
}
