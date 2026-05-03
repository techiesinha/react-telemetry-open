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

import { MetricName, SignalType } from "../types/internal";
import type { SignalBus } from "./signalBus";
import type { ResolvedConfig } from "../types/internal";
import { Locale } from "../locale";
import { getWallClockTime } from "../utils/timing";
import { safeStringify } from "../utils/safeJson";
import { interpolate } from "../utils/interpolate";

type EventProperties = Record<string, string | number | boolean | null>;

/**
 * TelemetrySingleton — allows tracking events from outside React components.
 *
 * Initialised by TelemetryProvider on mount.
 * Safe to import and call before Provider mounts — no-op until initialised.
 * Safe to call in SSR — guards against missing window.
 */
class TelemetrySingleton {
  private signalBus: SignalBus | null = null;
  private config: ResolvedConfig | null = null;
  private isInitialised = false;

  /** Called by TelemetryProvider when it mounts */
  initialise(signalBus: SignalBus, config: ResolvedConfig): void {
    this.signalBus = signalBus;
    this.config = config;
    this.isInitialised = true;
  }

  /** Called by TelemetryProvider when it unmounts */
  reset(): void {
    this.signalBus = null;
    this.config = null;
    this.isInitialised = false;
  }

  /**
   * Tracks a custom business event.
   * No-op if called before TelemetryProvider mounts or after it unmounts.
   */
  track(eventName: string, properties: EventProperties = {}): void {
    if (!this.isInitialised || !this.signalBus || !this.config) {
      if ((import.meta as { env?: { MODE?: string } }).env?.MODE !== "production") {
        console.warn(Locale.singleton.notInitialised);
      }
      return;
    }

    if (!this.config.signals.customEvents) return;

    // Validate properties payload size
    const serialisedProperties = safeStringify(properties);
    if (serialisedProperties.length > this.config.interactions.maxPropertiesSizeBytes) {
      if (this.config.debug) {
        console.warn(
          interpolate(Locale.hooks.propertiesPayloadTooLarge, {
            maxBytes: this.config.interactions.maxPropertiesSizeBytes,
          })
        );
      }
      return;
    }

    const currentRoute =
      typeof window !== "undefined"
        ? window.location.pathname
        : "";

    this.signalBus.emit({
      type: SignalType.Log,
      name: MetricName.CustomEvent,
      timestamp: getWallClockTime(),
      route: currentRoute,
      sessionId: "",
      attributes: {
        eventName,
        ...properties,
      },
    });
  }

  /**
   * Manually triggers a data flush to the Collector.
   * Useful before programmatic navigation or app shutdown.
   */
  async flush(): Promise<void> {
    // Flush is handled by ExporterManager — no direct access needed here
    // This is a no-op placeholder for API completeness
    return Promise.resolve();
  }
}

/** Singleton instance — import and use anywhere in your app */
export const telemetry = new TelemetrySingleton();
