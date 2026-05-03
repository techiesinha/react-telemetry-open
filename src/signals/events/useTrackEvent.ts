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

import { useCallback, useContext } from "react";
import { TelemetryContext } from "../../core/telemetryContext";
import { MetricName, SignalType } from "../../types/internal";
import { Locale } from "../../locale";
import { interpolate } from "../../utils/interpolate";
import { safeStringify } from "../../utils/safeJson";
import { getWallClockTime } from "../../utils/timing";

/** Custom event property values — no nested objects, no arrays */
export type EventProperties = Record<
  string,
  string | number | boolean | null
>;

/** Function signature for tracking custom business events */
export type TrackEventFunction = (
  eventName: string,
  properties?: EventProperties
) => void;

/**
 * useTrackEvent — returns a function for tracking custom business events.
 *
 * ```tsx
 * function CheckoutFlow() {
 *   const track = useTrackEvent();
 *
 *   const handlePurchase = () => {
 *     track('checkout:completed', { plan: 'pro', amount: 99 });
 *   };
 * }
 * ```
 *
 * Naming convention: 'feature:action' — e.g. 'onboarding:completed', 'search:performed'
 *
 * Protections:
 * - Properties serialised safely — circular references handled
 * - Properties size limited to maxPropertiesSizeBytes config value
 * - Null context check — silent no-op if outside Provider
 */
export const useTrackEvent = (): TrackEventFunction => {
  const telemetryContext = useContext(TelemetryContext);

  const trackEvent = useCallback<TrackEventFunction>(
    (eventName, properties = {}) => {
      if (!telemetryContext || !telemetryContext.config.signals.customEvents) return;

      const { signalBus, config, getCurrentRoute, sessionId } = telemetryContext;

      const serialisedProperties = safeStringify(properties);
      if (serialisedProperties.length > config.interactions.maxPropertiesSizeBytes) {
        if (config.debug) {
          console.warn(
            interpolate(Locale.hooks.propertiesPayloadTooLarge, {
              maxBytes: config.interactions.maxPropertiesSizeBytes,
            })
          );
        }
        return;
      }

      signalBus.emit({
        type: SignalType.Log,
        name: MetricName.CustomEvent,
        timestamp: getWallClockTime(),
        route: getCurrentRoute(),
        sessionId,
        attributes: { eventName, ...properties },
      });
    },
    [telemetryContext]
  );

  if (!telemetryContext) {
    if ((import.meta as { env?: { MODE?: string } }).env?.MODE !== "production") {
      console.error(
        interpolate(Locale.hooks.outsideProvider, { hookName: "useTrackEvent" })
      );
    }
  }

  return trackEvent;
};
