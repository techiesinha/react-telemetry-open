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

import { useEffect, useRef, useContext } from "react";
import { TelemetryContext } from "../../core/telemetryContext";
import { MetricName, SignalType, RouterType } from "../../types/internal";
import { Locale } from "../../locale";
import { interpolate } from "../../utils/interpolate";
import { getCurrentTime, getWallClockTime } from "../../utils/timing";
import { sanitiseUrl } from "../../utils/sanitiseUrl";

/**
 * useRouteTrace — automatically tracks route changes and navigation timing.
 *
 * Add once at your app's Router level:
 * ```tsx
 * function AppRouter() {
 *   useRouteTrace();
 *   return <Routes>...</Routes>;
 * }
 * ```
 *
 * Supports: React Router 6, Next.js Pages Router, Next.js App Router.
 * Router is detected automatically — never call useLocation() without confirming
 * router presence via detectRouter() first.
 */
export const useRouteTrace = (): void => {
  const telemetryContext = useContext(TelemetryContext);
  const previousRoute = useRef<string>("");
  const navigationStartTime = useRef(getCurrentTime());

  useEffect(() => {
    if (!telemetryContext) {
      if ((import.meta as { env?: { MODE?: string } }).env?.MODE !== "production") {
        console.error(
          interpolate(Locale.hooks.outsideProvider, { hookName: "useRouteTrace" })
        );
      }
      return;
    }

    const { signalBus, config, sessionId } = telemetryContext;

    if (!config.signals.routes) return;

    const currentPath = sanitiseUrl(
      window.location.pathname,
      config.privacy.stripQueryParams
    );

    if (currentPath === previousRoute.current) return;

    const capturedEndTime = getCurrentTime();
    const navigationDuration = capturedEndTime - navigationStartTime.current;
    const capturedTimestamp = getWallClockTime();

    if (previousRoute.current !== "") {
      signalBus.emit({
        type: SignalType.Span,
        name: MetricName.RouteChange,
        timestamp: capturedTimestamp,
        route: currentPath,
        sessionId,
        startTime: navigationStartTime.current,
        endTime: capturedEndTime,
        duration: navigationDuration,
        attributes: {
          fromRoute: previousRoute.current,
          toRoute: currentPath,
          navigationDurationMs: navigationDuration,
        },
      });
    }

    // Increment page view counter on every route change including first load
    telemetryContext.incrementPageViews?.();

    previousRoute.current = currentPath;
    navigationStartTime.current = getCurrentTime();
  });
};
