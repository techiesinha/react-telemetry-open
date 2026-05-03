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

import { createContext } from "react";
import type { SignalBus } from "./signalBus";
import type { ResolvedConfig } from "../types/internal";

/**
 * TelemetryContext — holds only stable references.
 * No mutable state — zero re-renders caused by context changes.
 *
 * All five values are stable for the lifetime of TelemetryProvider:
 * - signalBus: created once at mount
 * - config: frozen object, created once at mount
 * - sessionId: anonymous UUID, generated once per session
 * - getCurrentRoute: function reference, stable
 * - flush: function reference, stable
 */
export interface TelemetryContextValue {
  readonly signalBus: SignalBus;
  readonly config: ResolvedConfig;
  readonly sessionId: string;
  readonly getCurrentRoute: () => string;
  readonly flush: () => Promise<void>;
  readonly incrementPageViews: () => void;
}

export const TelemetryContext = createContext<TelemetryContextValue | null>(null);
