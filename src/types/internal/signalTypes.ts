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

/** OTel signal primitive types */
export const SignalType = {
  Span: "span",
  Metric: "metric",
  Log: "log",
} as const;

export type SignalType = (typeof SignalType)[keyof typeof SignalType];

/** All metric and event names used throughout the package */
export const MetricName = {
  // Render signals
  // react.render.duration carries all render data including count and priority.
  // There is no separate render.count event — query attributes.renderCount instead.
  RenderDuration: "react.render.duration",
  /** @blocked — requires React concurrent mode scheduler hooks (not public API in any React version) */
  RenderInterrupted: "react.render.interrupted",

  // Network signals
  // Network quality (type, downlink, rtt, saveData) is captured as context on EVERY event —
  // not as a separate change event. Query network.type on any event to see connection quality
  // at the time that event occurred. There is no separate quality_changed event.
  NetworkFetch: "network.fetch",
  NetworkXhr: "network.xhr",
  NetworkErrorRate: "network.error_rate",
  NetworkOnline: "network.online",
  NetworkOffline: "network.offline",

  // Long tasks
  LongTaskDuration: "browser.long_task.duration",

  // Memory
  MemoryHeapUsed: "browser.memory.heap_used",

  // Web Vitals
  WebVitalFcp: "web_vital.fcp",
  WebVitalLcp: "web_vital.lcp",
  WebVitalFid: "web_vital.fid",
  WebVitalCls: "web_vital.cls",
  WebVitalInp: "web_vital.inp",

  // Interactions
  InteractionClick: "interaction.click",
  InteractionInput: "interaction.input",
  InteractionRageClick: "interaction.rage_click",
  /** @blocked — detecting elements with no React handler requires fiber tree access (not public API) */
  InteractionDeadClick: "interaction.dead_click",
  InteractionTimeToFirst: "interaction.time_to_first",

  // Route
  RouteChange: "route.change",

  // Suspense
  /** @blocked — React exposes no public lifecycle event for Suspense fallback state changes */
  SuspenseDuration: "suspense.duration",

  // Errors
  JsError: "js.error",
  UnhandledRejection: "js.unhandled_rejection",
  // react.error includes componentStack for full React tree attribution.
  // ErrorBoundary fallback/retry/dismiss lifecycle is not separately tracked —
  // wire the onError prop of your error boundary library to useTrackEvent() instead.
  ReactError: "react.error",
  /** @blocked — requires wrapping React ErrorBoundary internals (no public lifecycle API) */
  ErrorBoundaryFallbackShown: "react.error_boundary.fallback_shown",
  /** @blocked — requires wrapping React ErrorBoundary internals (no public lifecycle API) */
  ErrorBoundaryRetried: "react.error_boundary.retried",
  /** @blocked — requires wrapping React ErrorBoundary internals (no public lifecycle API) */
  ErrorBoundaryFallbackDismissed: "react.error_boundary.fallback_dismissed",

  // Resource timing
  ResourceLoad: "resource.load.duration",

  // Custom events
  CustomEvent: "custom.event",
} as const;

export type MetricName = (typeof MetricName)[keyof typeof MetricName];

/** Config signal key names matching telemetry.config.json */
export const SignalName = {
  Renders: "renders",
  Interactions: "interactions",
  Routes: "routes",
  Errors: "errors",
  Network: "network",
  Memory: "memory",
  LongTasks: "longTasks",
  WebVitals: "webVitals",
  CustomEvents: "customEvents",
  ResourceTiming: "resourceTiming",
} as const;

export type SignalName = (typeof SignalName)[keyof typeof SignalName];
