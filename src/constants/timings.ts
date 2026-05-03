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

/** One frame budget at 60fps in milliseconds. Source: physics — 1000ms ÷ 60 = 16.666ms */
export const MS_PER_FRAME_AT_60FPS = 16.67;

/**
 * Minimum task duration to qualify as a long task per the W3C Long Tasks API specification.
 * Source: https://w3c.github.io/longtasks/
 * Tasks blocking the main thread for more than 50ms are observable and cause user-perceptible jank.
 */
export const LONG_TASK_THRESHOLD_MS = 50;

/**
 * Window within which two renders from the same component
 * are treated as React StrictMode double-invocations and deduplicated
 */
export const STRICT_MODE_DEDUP_WINDOW_MS = 50;

/** Maximum lifetime of an open span before it is cleaned up as a zombie */
export const SPAN_TIMEOUT_MS = 5000;

/**
 * Time window for rage click burst detection.
 * Source: industry convention — FullStory, Hotjar, and Microsoft Clarity all use 500ms.
 * Short enough to mean genuine frustration; long enough to catch realistic rapid clicking.
 */
export const RAGE_CLICK_WINDOW_MS = 500;

/**
 * Number of clicks within RAGE_CLICK_WINDOW_MS to qualify as a rage click.
 * Source: industry convention — 3 is the standard. Fewer than 3 produces false positives
 * from double-clicking. Used by FullStory, Hotjar, and Microsoft Clarity.
 */
export const RAGE_CLICK_THRESHOLD = 3;

/** Interval between heap memory snapshots */
export const MEMORY_SAMPLE_INTERVAL_MS = 30_000;

/** Interval for rolling API error rate calculation */
export const NETWORK_ERROR_RATE_INTERVAL_MS = 60_000;

/** How often to check for session inactivity expiry */
export const SESSION_INACTIVITY_CHECK_INTERVAL_MS = 60_000;

/**
 * Session expires after this duration of inactivity.
 * Source: Google Analytics session definition — 30 minutes of inactivity ends a session.
 * Using the same convention ensures session metrics align with GA reports.
 */
export const SESSION_EXPIRY_MS = 30 * 60 * 1_000;

/**
 * Minimum interaction duration to observe for INP calculation via the W3C Event Timing API.
 * Source: https://wicg.github.io/event-timing/
 * Interactions shorter than 40ms are excluded — they are fast enough to never contribute to a poor INP score.
 */
export const INP_DURATION_THRESHOLD_MS = 40;

/** Maximum wait time for a single export request before abort */
export const EXPORT_REQUEST_TIMEOUT_MS = 10_000;

/**
 * Maximum payload size for navigator.sendBeacon in bytes.
 * Source: W3C Beacon API specification — https://www.w3.org/TR/beacon/
 * Payloads above 64KB are not guaranteed to be accepted by the browser.
 */
export const MAX_BEACON_PAYLOAD_BYTES = 60_000;

/** Maximum number of event listeners per Signal Bus event type */
export const MAX_SIGNAL_BUS_LISTENERS_PER_TYPE = 100;

/** Default debounce for input interaction events */
export const DEFAULT_INPUT_DEBOUNCE_MS = 300;

/** Default debounce for scroll interaction events */
export const DEFAULT_SCROLL_DEBOUNCE_MS = 500;

/** Maximum retained entries in render timeline for long task correlation */
export const RENDER_TIMELINE_MAX_SIZE = 10;

/** Warning threshold for TelemetryProvider that unmounted too quickly */
export const RAPID_UNMOUNT_THRESHOLD_MS = 5_000;
