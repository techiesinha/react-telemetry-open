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

/**
 * react-telemetry-open — React-aware, vendor-neutral observability for React 18+ applications.
 *
 * Public API — everything exported from this file is part of the
 * versioned public contract. Changes here are breaking changes.
 *
 * Internal types, collectors, Signal Bus, and Pipeline are NOT exported.
 */

// Components
export { TelemetryProvider } from "./core/telemetryProvider";
export type { TelemetryProviderProps } from "./core/telemetryProvider";

// Hooks
export { useTraceRender } from "./signals/renders";
export { useTrackInteraction } from "./signals/interactions";
export type { InteractionOptions, InteractionHandlers } from "./signals/interactions";
export { useRouteTrace } from "./signals/routes";
export { useTrackEvent } from "./signals/events";
export type { TrackEventFunction, EventProperties } from "./signals/events";

// Singleton — for use outside React components
export { telemetry } from "./core/telemetry";

// Public types
export type { TelemetryConfig } from "./types/public";
