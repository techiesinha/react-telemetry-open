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

/** Google Core Web Vitals performance rating */
export const VitalRating = {
  Good: "good",
  NeedsImprovement: "needs-improvement",
  Poor: "poor",
} as const;

export type VitalRating = (typeof VitalRating)[keyof typeof VitalRating];

/** React component render priority */
export const RenderPriority = {
  Urgent: "urgent",
  Deferred: "deferred",
} as const;

export type RenderPriority =
  (typeof RenderPriority)[keyof typeof RenderPriority];

/** Confidence level for inferred data attribution */
export const SourceConfidence = {
  Measured: "measured",
  Inferred: "inferred",
  Unknown: "unknown",
} as const;

export type SourceConfidence =
  (typeof SourceConfidence)[keyof typeof SourceConfidence];

/** What triggered a React navigation */
export const NavigationTrigger = {
  LinkClick: "link-click",
  Programmatic: "programmatic",
  BrowserNavigation: "browser-navigation",
  Unknown: "unknown",
} as const;

export type NavigationTrigger =
  (typeof NavigationTrigger)[keyof typeof NavigationTrigger];

/** PerformanceObserver entry type strings */
export const PerformanceEntryType = {
  LongTask: "longtask",
  LargestContentfulPaint: "largest-contentful-paint",
  FirstInput: "first-input",
  LayoutShift: "layout-shift",
  Paint: "paint",
  Event: "event",
  Resource: "resource",
  Navigation: "navigation",
} as const;

export type PerformanceEntryType =
  (typeof PerformanceEntryType)[keyof typeof PerformanceEntryType];

/** Exporter destination type */
export const ExporterType = {
  Console: "console",
  Otlp: "otlp",
} as const;

export type ExporterType = (typeof ExporterType)[keyof typeof ExporterType];

/** Circuit breaker states */
export const CircuitState = {
  Closed: "closed",
  Open: "open",
  HalfOpen: "half-open",
} as const;

export type CircuitState = (typeof CircuitState)[keyof typeof CircuitState];

/** Device form factor */
export const DeviceType = {
  Mobile: "mobile",
  Tablet: "tablet",
  Desktop: "desktop",
} as const;

export type DeviceType = (typeof DeviceType)[keyof typeof DeviceType];

/** Detected router type */
export const RouterType = {
  ReactRouter: "react-router",
  NextJsPages: "nextjs-pages",
  NextJsApp: "nextjs-app",
  None: "none",
} as const;

export type RouterType = (typeof RouterType)[keyof typeof RouterType];

/** Resource type for resource timing collector */
export const ResourceType = {
  Script: "script",
  Css: "css",
  Image: "img",
  Font: "font",
  Other: "other",
} as const;

export type ResourceType = (typeof ResourceType)[keyof typeof ResourceType];

/** What triggered a memory sample */
export const MemorySampleTrigger = {
  Interval: "interval",
  LongTask: "long-task",
  NetworkResponse: "network-response",
  RouteChange: "route-change",
  PageHide: "page-hide",
} as const;

export type MemorySampleTrigger =
  (typeof MemorySampleTrigger)[keyof typeof MemorySampleTrigger];
