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

import { useCallback, useContext, useRef } from "react";
import { TelemetryContext } from "../../core/telemetryContext";
import { MetricName, SignalType } from "../../types/internal";
import { Locale } from "../../locale";
import { interpolate } from "../../utils/interpolate";
import { getWallClockTime } from "../../utils/timing";

/** Options for useTrackInteraction */
export interface InteractionOptions {
  /** Parent component name for grouping in dashboards */
  readonly component?: string;
  /** Mark as sensitive — omit value from event attributes */
  readonly sensitive?: boolean;
}

/** Handlers returned by useTrackInteraction */
export interface InteractionHandlers {
  readonly onClick: (event: React.MouseEvent) => void;
  readonly onFocus: (event: React.FocusEvent) => void;
  readonly onBlur: (event: React.FocusEvent) => void;
  readonly onChange: (event: React.ChangeEvent<HTMLElement>) => void;
}

/**
 * useTrackInteraction — tracks user interactions on a named element.
 *
 * ```tsx
 * function CheckoutButton() {
 *   const { onClick } = useTrackInteraction('checkout-submit');
 *   return <button onClick={onClick}>Buy Now</button>;
 * }
 * ```
 *
 * Protections:
 * - Input changes are debounced per inputDebounceMs config
 * - Null context check — silent return if outside Provider
 * - Options must be stable — primitive deps used in useCallback
 */
export const useTrackInteraction = (
  elementName: string,
  options?: InteractionOptions
): InteractionHandlers => {
  const telemetryContext = useContext(TelemetryContext);
  const inputDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const noopHandlers: InteractionHandlers = {
    onClick: () => {},
    onFocus: () => {},
    onBlur: () => {},
    onChange: () => {},
  };

  const componentName = options?.component;

  const emitInteraction = useCallback(
    (interactionType: string, additionalAttributes: Record<string, string | number | boolean | null> = {}) => {
      if (!telemetryContext || !telemetryContext.config.signals.interactions) return;
      const { signalBus, getCurrentRoute, sessionId } = telemetryContext;
      const metricName = interactionType === "input"
        ? MetricName.InteractionInput
        : MetricName.InteractionClick;
      signalBus.emit({
        type: SignalType.Log,
        name: metricName,
        timestamp: getWallClockTime(),
        route: getCurrentRoute(),
        sessionId,
        attributes: {
          element: elementName,
          interactionType,
          ...(componentName ? { component: componentName } : {}),
          ...additionalAttributes,
        },
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [telemetryContext, elementName, componentName]
  );

  const handleClick = useCallback(
    (_event: React.MouseEvent) => { emitInteraction("click"); },
    [emitInteraction]
  );

  const handleFocus = useCallback(
    (_event: React.FocusEvent) => { emitInteraction("focus"); },
    [emitInteraction]
  );

  const handleBlur = useCallback(
    (_event: React.FocusEvent) => { emitInteraction("blur"); },
    [emitInteraction]
  );

  const handleChange = useCallback(
    (_event: React.ChangeEvent<HTMLElement>) => {
      if (inputDebounceTimerRef.current !== null) {
        clearTimeout(inputDebounceTimerRef.current);
      }
      const debounceMs = telemetryContext?.config.interactions.inputDebounceMs ?? 300;
      inputDebounceTimerRef.current = setTimeout(() => {
        inputDebounceTimerRef.current = null;
        emitInteraction("input");
      }, debounceMs);
    },
    [emitInteraction, telemetryContext]
  );

  if (!telemetryContext) {
    if ((import.meta as { env?: { MODE?: string } }).env?.MODE !== "production") {
      console.error(
        interpolate(Locale.hooks.outsideProvider, { hookName: "useTrackInteraction" })
      );
    }
    return noopHandlers;
  }

  return { onClick: handleClick, onFocus: handleFocus, onBlur: handleBlur, onChange: handleChange };
};
