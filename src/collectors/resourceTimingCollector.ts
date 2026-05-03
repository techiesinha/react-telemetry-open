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
import { MetricName, SignalType } from "../types/internal";
import type { SignalBus } from "../core/signalBus";
import { sanitiseUrl } from "../utils/sanitiseUrl";
import { getWallClockTime } from "../utils/timing";

/** Minimum resource size to track — filters out tiny favicon/icon files */
const DEFAULT_MIN_RESOURCE_SIZE_BYTES = 10_000;

/**
 * ResourceTimingCollector tracks asset load times and cache hit rates
 * using the PerformanceObserver 'resource' entry type.
 *
 * What it tracks: JS bundles, CSS files, images, fonts, third-party scripts.
 * What it does NOT track: fetch() and XHR calls (handled by NetworkCollector).
 *
 * Key features:
 * - buffered: true captures resources that loaded before observer was created
 * - Content hash stripping enables trend tracking across deploys
 * - transferSize === 0 indicates a browser cache hit
 * - Cross-origin resources labelled honestly — size data unavailable without CORS
 */
export class ResourceTimingCollector {
  private static isInitialised = false;
  private static observer: PerformanceObserver | null = null;

  static init(signalBus: SignalBus, config: ResolvedConfig): void {
    if (ResourceTimingCollector.isInitialised) return;
    if (!config.signals.resourceTiming) return;
    if (typeof PerformanceObserver === "undefined") return;

    if (!PerformanceObserver.supportedEntryTypes?.includes("resource")) return;

    ResourceTimingCollector.isInitialised = true;

    ResourceTimingCollector.observer = new PerformanceObserver((entryList) => {
      try {
        entryList.getEntries().forEach((entry) => {
          ResourceTimingCollector.handleResourceEntry(
            entry as PerformanceResourceTiming,
            signalBus,
            config
          );
        });
      } catch {
        // Observer callback errors are isolated
      }
    });

    try {
      // buffered: true is critical — most resources load before our observer mounts
      ResourceTimingCollector.observer.observe({
        type: "resource",
        buffered: true,
      });
    } catch {
      ResourceTimingCollector.observer = null;
      ResourceTimingCollector.isInitialised = false;
    }
  }

  static destroy(): void {
    ResourceTimingCollector.observer?.disconnect();
    ResourceTimingCollector.observer = null;
    ResourceTimingCollector.isInitialised = false;
  }

  private static handleResourceEntry(
    entry: PerformanceResourceTiming,
    signalBus: SignalBus,
    config: ResolvedConfig
  ): void {
    // Skip fetch and XHR — already tracked by NetworkCollector
    if (
      entry.initiatorType === "fetch" ||
      entry.initiatorType === "xmlhttprequest"
    ) {
      return;
    }

    // Skip tiny resources — noise reduction
    const transferSize = entry.transferSize ?? 0;
    const decodedSize = entry.decodedBodySize ?? 0;
    const minSize = DEFAULT_MIN_RESOURCE_SIZE_BYTES;

    if (transferSize < minSize && decodedSize < minSize) return;

    const isCacheHit = transferSize === 0 && decodedSize > 0;
    const isCrossOrigin = ResourceTimingCollector.isCrossOriginResource(entry.name);

    // Strip content hashes from URL for consistent naming across deploys
    const sanitisedUrl = sanitiseUrl(entry.name, config.privacy.stripQueryParams);
    const urlWithoutHash = ResourceTimingCollector.stripContentHash(sanitisedUrl);

    const compressionRatio =
      !isCrossOrigin && decodedSize > 0 && transferSize > 0
        ? Math.round((decodedSize / transferSize) * 10) / 10
        : null;

    signalBus.emit({
      type: SignalType.Metric,
      name: MetricName.ResourceLoad,
      timestamp: performance.timeOrigin + entry.startTime,
      route: "",
      sessionId: "",
      value: entry.duration,
      unit: "ms",
      duration: entry.duration,
      attributes: {
        url: urlWithoutHash,
        resourceType: entry.initiatorType,
        transferSizeBytes: isCrossOrigin ? null : transferSize,
        decodedSizeBytes: isCrossOrigin ? null : decodedSize,
        cacheHit: isCacheHit,
        crossOrigin: isCrossOrigin,
        // Compression ratio — null for cross-origin resources
        compressionRatio,
        // sizeAvailable false means browser restricted data due to CORS
        sizeAvailable: !isCrossOrigin,
      },
    });
  }

  /**
   * Strips content hash segments from URLs for consistent naming across builds.
   * Content hash pattern: 8+ hex characters in a filename segment.
   *
   * Example:
   *   /static/js/main.a3f9d2c1b4e5.chunk.js → /static/js/main.[hash].chunk.js
   */
  private static stripContentHash(url: string): string {
    return url.replace(/\.[0-9a-f]{8,}\./gi, ".[hash].");
  }

  private static isCrossOriginResource(resourceUrl: string): boolean {
    if (typeof window === "undefined") return false;
    try {
      const parsedUrl = new URL(resourceUrl);
      return parsedUrl.origin !== window.location.origin;
    } catch {
      return false;
    }
  }
}
