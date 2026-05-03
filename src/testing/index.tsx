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

import React, { type ReactNode, useMemo } from "react";
import { TelemetryContext, type TelemetryContextValue } from "../core/telemetryContext";
import { SignalBus } from "../core/signalBus";
import { resolveConfig } from "../core/configManager";
import { SessionManager } from "../core/sessionManager";
import type { TelemetryConfig } from "../types/public";
import type { RawEvent } from "../types/internal";

/**
 * TelemetryTestProvider — a lightweight Provider for use in tests.
 *
 * Does NOT initialise any automatic collectors, exporters, or network wrappers.
 * Makes all hooks work without side effects.
 *
 * ```tsx
 * import { TelemetryTestProvider } from 'react-telemetry-open/testing';
 *
 * render(
 *   <TelemetryTestProvider>
 *     <MyComponent />
 *   </TelemetryTestProvider>
 * );
 * ```
 */
export const TelemetryTestProvider = ({
  children,
  config,
  onEvent,
}: {
  readonly children: ReactNode;
  readonly config?: TelemetryConfig;
  /** Optional callback — called with every event emitted during the test */
  readonly onEvent?: (event: RawEvent) => void;
}): React.ReactElement => {
  const resolvedConfig = useMemo(() => resolveConfig(config), [config]);
  const signalBus = useMemo(() => {
    const bus = new SignalBus(false);
    if (onEvent) {
      bus.connectPipeline(onEvent);
    } else {
      bus.connectPipeline(() => {}); // no-op pipeline
    }
    return bus;
  }, [onEvent]);

  const sessionManager = useMemo(
    () => new SessionManager(false),
    []
  );

  const contextValue = useMemo((): TelemetryContextValue => ({
    signalBus,
    config: resolvedConfig,
    sessionId: sessionManager.getSnapshot().sessionId,
    getCurrentRoute: () => "/test",
    flush: async () => Promise.resolve(),
    incrementPageViews: () => sessionManager.incrementPageViews(),
  }), [signalBus, resolvedConfig, sessionManager]);

  return (
    <TelemetryContext.Provider value={contextValue}>
      {children}
    </TelemetryContext.Provider>
  );
};
