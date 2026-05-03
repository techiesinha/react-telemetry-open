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

import { useRef, useLayoutEffect, useEffect, useContext } from "react";
import { TelemetryContext } from "../../core/telemetryContext";
import { MetricName, SignalType, RenderPriority } from "../../types/internal";
import { Locale } from "../../locale";
import { interpolate } from "../../utils/interpolate";
import { getCurrentTime, getWallClockTime } from "../../utils/timing";
import { LongTaskCollector } from "../../collectors/longTaskCollector";
import { STRICT_MODE_DEDUP_WINDOW_MS } from "../../constants";

/**
 * useTraceRender — tracks component render count and timing.
 *
 * Add to any component you want to measure:
 * ```tsx
 * function UserDashboard() {
 *   useTraceRender('UserDashboard');
 *   return <div>...</div>;
 * }
 * ```
 *
 * Emits: react.render.duration metric on every render completion.
 *
 * Protections:
 * - Null context check — silent return in production if outside Provider
 * - StrictMode deduplication — suppresses double renders within 50ms
 * - useLayoutEffect for accurate timing — fires synchronously after commit
 * - useEffect for Signal Bus emit — async, never blocks paint
 */
export const useTraceRender = (componentName?: string): void => {
  const telemetryContext = useContext(TelemetryContext);

  // Capture start time synchronously at the top of each render — this is the
  // accurate render start. useRef init only runs once; subsequent renders need
  // the time captured here, not from the previous render's reset.
  const thisRenderStartTime = getCurrentTime();
  const thisRenderTimestamp = getWallClockTime();

  const renderStartTime = useRef(thisRenderStartTime);
  const renderTimestamp = useRef(thisRenderTimestamp);
  const renderCount = useRef(0);
  const lastRenderTime = useRef(0);
  const resolvedName = componentName ?? "Unknown";

  // Always update refs with current render's time — handles remounts after
  // ErrorBoundary catches (refs survive remount with stale values otherwise)
  renderStartTime.current = thisRenderStartTime;
  renderTimestamp.current = thisRenderTimestamp;

  useEffect(() => {
    if (!componentName && telemetryContext?.config.debug) {
      console.warn(Locale.hooks.missingComponentName);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useLayoutEffect(() => {
    if (!telemetryContext) {
      if ((import.meta as { env?: { MODE?: string } }).env?.MODE !== "production") {
        console.error(
          interpolate(Locale.hooks.outsideProvider, { hookName: "useTraceRender" })
        );
      }
      return;
    }

    const { signalBus, config } = telemetryContext;
    if (!config.signals.renders) return;

    const renderEndTime = getCurrentTime();
    const renderDuration = renderEndTime - renderStartTime.current;
    const currentTimestamp = renderTimestamp.current;

    const timeSinceLastRender = currentTimestamp - lastRenderTime.current;
    if (timeSinceLastRender < STRICT_MODE_DEDUP_WINDOW_MS && renderCount.current > 0) {
      return; // StrictMode double — skip, next render will have fresh start time
    }

    lastRenderTime.current = currentTimestamp;
    renderCount.current++;

    LongTaskCollector.recordRender(
      resolvedName,
      renderStartTime.current,
      renderEndTime
    );

    const capturedDuration = renderDuration;
    const capturedTimestamp = currentTimestamp;
    const capturedCount = renderCount.current;
    const capturedStart = renderStartTime.current;
    const capturedEnd = renderEndTime;

    renderStartTime.current = thisRenderStartTime;
    renderTimestamp.current = thisRenderTimestamp;

    Promise.resolve().then(() => {
      signalBus.emit({
        type: SignalType.Metric,
        name: MetricName.RenderDuration,
        timestamp: capturedTimestamp,
        route: telemetryContext.getCurrentRoute(),
        sessionId: telemetryContext.sessionId,
        startTime: capturedStart,
        endTime: capturedEnd,
        duration: capturedDuration,
        value: capturedDuration,
        unit: "ms",
        attributes: {
          component: resolvedName,
          renderCount: capturedCount,
          priority: capturedDuration > 16.67
            ? RenderPriority.Urgent
            : RenderPriority.Deferred,
        },
      });
    });
  });
};
