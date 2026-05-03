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
 * Developer-facing configuration type.
 * All fields are optional — ConfigManager fills missing fields with defaults.
 * Pass as the `config` prop on TelemetryProvider for inline configuration.
 * For file-based configuration, use telemetry.config.json.
 */
export interface TelemetryConfig {
  app?: {
    /** Application name — appears on every event in your dashboard */
    name?: string;
    /** Application version — defaults to package.json version */
    version?: string;
    /** Deployment environment — defaults to NODE_ENV */
    environment?: string;
    /** Build identifier — use git commit hash for deployment tracking */
    buildId?: string;
  };

  exporter?: {
    /** Export destination — 'console' for development, 'otlp' for production */
    type?: "console" | "otlp";
    /** OTLP Collector endpoint URL — required when type is 'otlp' */
    url?: string;
    /** API key for Collector authentication — use $VAR_NAME for secrets */
    apiKey?: string;
    /** Additional HTTP headers sent with every export request */
    headers?: Record<string, string>;
  };

  sampling?: {
    /**
     * Fraction of events to record — 0.0 to 1.0.
     * Errors are always recorded regardless of sampling rate.
     * Recommended: 1.0 in development, 0.1 in high-traffic production.
     */
    rate?: number;
  };

  signals?: {
    /** Track component render count and timing via useTraceRender */
    renders?: boolean;
    /** Track interactions via useTrackInteraction and rage/dead clicks */
    interactions?: boolean;
    /** Track route changes and navigation timing */
    routes?: boolean;
    /** Capture JS errors, unhandled rejections and React boundary errors */
    errors?: boolean;
    /** Track fetch and XHR call timing, status codes and error rates */
    network?: boolean;
    /** Sample JavaScript heap usage (Chrome/Edge only) */
    memory?: boolean;
    /** Detect main thread blocking tasks >50ms (Chrome/Edge only) */
    longTasks?: boolean;
    /** Measure Core Web Vitals — FCP, LCP, FID, CLS, INP */
    webVitals?: boolean;
    /** Enable useTrackEvent for manual business event tracking */
    customEvents?: boolean;
    /** Track asset load times and cache hit rates */
    resourceTiming?: boolean;
  };

  batch?: {
    /** Events to accumulate before flushing — default 50, max 1000 */
    size?: number;
    /** Milliseconds between flushes — default 5000, range 1000-60000 */
    flushIntervalMs?: number;
    /** Maximum events in queue before oldest are dropped — default 500 */
    maxQueueSize?: number;
  };

  privacy?: {
    /** Remove URL query params before recording — default true */
    stripQueryParams?: boolean;
    /** Honour browser Do Not Track header — default true */
    respectDoNotTrack?: boolean;
  };

  ignore?: {
    /** Component names to exclude from render tracking */
    components?: string[];
    /** URL substrings to exclude from network tracking */
    urls?: string[];
  };

  interactions?: {
    /** Debounce delay for input change events in milliseconds — default 300 */
    inputDebounceMs?: number;
    rageClick?: {
      /** Clicks within windowMs to qualify as rage click — default 3 */
      threshold?: number;
      /** Sliding window for rage click detection in milliseconds — default 500 */
      windowMs?: number;
    };
    customEvents?: {
      /** Maximum serialised size of custom event properties — default 4096 bytes */
      maxPropertiesSizeBytes?: number;
    };
  };

  /** Enable verbose logging — recommended in development only */
  debug?: boolean;
}
