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
 * All user-facing strings for react-telemetry-open.
 * Use the interpolate() utility for strings containing {placeholder} tokens.
 * No hardcoded strings are permitted anywhere else in the source.
 */
export const Locale = {
  provider: {
    noConfigFound:
      "[react-telemetry-open] No telemetry.config.json found. Running with defaults — data going to console.\n" +
      "To configure: run `npx react-telemetry-open init`",

    missingAppConfig:
      "[react-telemetry-open] app.name and app.version are not set — events appear as 'unknown-app' v0.0.0 in your dashboard.\n" +
      "If you have not run the setup CLI yet:\n" +
      "  npx react-telemetry-open init\n" +
      "If you have already run init, wire up the generated config:\n" +
      "  import appConfig from '../telemetry.config.json'\n" +
      "  <TelemetryProvider appConfig={appConfig}>",

    productionConsoleExporter:
      "[react-telemetry-open] Running in production with console exporter. " +
      "Telemetry data is not being exported to any backend. " +
      "Set exporter.type to 'otlp' in telemetry.config.prod.json.",

    rapidUnmountWarning:
      "[react-telemetry-open] TelemetryProvider unmounted after only {duration}ms. " +
      "Ensure TelemetryProvider wraps your entire app at the root, not individual routes.",

    duplicateInstance:
      "[react-telemetry-open] Multiple TelemetryProvider instances detected. " +
      "Only the first instance initialises automatic collectors. " +
      "Remove the duplicate TelemetryProvider from your component tree.",

    nonBrowserEnvironment:
      "[react-telemetry-open] Non-browser environment detected. " +
      "react-telemetry-open only supports browser-based React applications. " +
      "React Native is not supported. All telemetry collection has been disabled.",

    configChangedAfterMount:
      "[react-telemetry-open] The config prop changed after TelemetryProvider mounted. " +
      "Config is resolved once at mount time — changes are ignored. " +
      "Remount TelemetryProvider to apply a new config.",

    allSignalsDisabled:
      "[react-telemetry-open] All signals are disabled in config. " +
      "No telemetry will be collected. " +
      "Enable at least one signal in telemetry.config.json.",
  },

  config: {
    invalidJson:
      "[react-telemetry-open] telemetry.config.json has invalid JSON syntax. " +
      "Falling back to all defaults. Fix the syntax error and restart.",

    invalidSamplingRate:
      "[react-telemetry-open] sampling.rate must be between 0 and 1. " +
      "Got: {value}. Using clamped value: {clamped}.",

    missingOtlpUrl:
      "[react-telemetry-open] exporter.url is required when exporter.type is 'otlp'. " +
      "Falling back to console exporter. Set exporter.url in your config.",

    unknownSignal:
      "[react-telemetry-open] Unknown signal key: '{signal}'. " +
      "Valid keys are: {validSignals}. This key will be ignored.",

    batchSizeClamped:
      "[react-telemetry-open] batch.size must be between {min} and {max}. " +
      "Got: {value}. Using clamped value: {clamped}.",

    flushIntervalClamped:
      "[react-telemetry-open] batch.flushIntervalMs must be between {min} and {max}. " +
      "Got: {value}. Using clamped value: {clamped}.",

    hardcodedApiKey:
      "[react-telemetry-open] API key appears hardcoded in config. " +
      "This exposes your key in source control. " +
      'Use $VAR_NAME syntax: "apiKey": "$REACT_APP_OTEL_KEY"',

    localhostInProduction:
      "[react-telemetry-open] Collector URL points to localhost in production environment. " +
      "Did you forget to set the production Collector URL?",

    envVarNotSet:
      "[react-telemetry-open] Environment variable '{varName}' is not set. " +
      "This config field will be empty.",

    signalsMustBeObject:
      "[react-telemetry-open] signals must be an object with boolean fields. " +
      "Got: {received}. Using default signals config (all enabled).",

    typeMismatchInMerge:
      "[react-telemetry-open] Type mismatch merging config field '{field}': " +
      "base type '{baseType}' cannot be overridden with '{overrideType}'. " +
      "Base value preserved.",
  },

  hooks: {
    outsideProvider:
      "[react-telemetry-open] {hookName}() called outside <TelemetryProvider>. " +
      "Wrap your app root with <TelemetryProvider> to use this hook.",

    missingComponentName:
      "[react-telemetry-open] useTraceRender() called without a component name. " +
      "Events will appear as 'Unknown' in production due to minification. " +
      'Add an explicit name: useTraceRender("MyComponent")',

    routeTracerNoRouter:
      "[react-telemetry-open] useRouteTrace() requires React Router 6 or Next.js. " +
      "No compatible router detected. Route tracking is disabled.",

    interactionOptionsUnstable:
      "[react-telemetry-open] useTrackInteraction() received a new options object on every render. " +
      "Wrap options in useMemo() to prevent unnecessary re-renders.",

    propertiesPayloadTooLarge:
      "[react-telemetry-open] Custom event properties exceed the {maxBytes} byte limit. " +
      "Event properties have been dropped. " +
      "Reduce the size of properties or increase signals.customEvents.maxPropertiesSizeBytes.",
  },

  network: {
    fetchUnavailable:
      "[react-telemetry-open] window.fetch is not available. " +
      "Network tracking via fetch() has been disabled.",

    xhrUnavailable:
      "[react-telemetry-open] XMLHttpRequest is not available. " +
      "Network tracking via XHR has been disabled.",

    cspViolation:
      "[react-telemetry-open] Telemetry export failed — possible CSP violation. " +
      "Add to your Content-Security-Policy: connect-src {collectorOrigin}",
  },

  errors: {
    crossOriginScript:
      "[react-telemetry-open] A cross-origin script error was suppressed. " +
      'Add crossorigin="anonymous" to script tags for full error details.',
  },

  exporter: {
    exportFailed:
      "[react-telemetry-open] Export failed (attempt {attempt} of {maxAttempts}): {errorMessage}",

    retryingIn:
      "[react-telemetry-open] Retrying export in {delayMs}ms.",

    circuitOpen:
      "[react-telemetry-open] Circuit breaker OPEN after {failures} consecutive failures. " +
      "Exports blocked for {resetMs}ms. Check your Collector endpoint.",

    circuitHalfOpen:
      "[react-telemetry-open] Circuit breaker testing connection with one export attempt.",

    circuitClosed:
      "[react-telemetry-open] Circuit breaker CLOSED. Telemetry export resumed.",

    invalidCollectorUrl:
      "[react-telemetry-open] Invalid or unsupported collector URL: '{url}'. " +
      "URL must start with https:// or http:// and be a valid URL. " +
      "Example: https://otlp-gateway-prod-ap-south-1.grafana.net/otlp — no trailing slash, no /v1/* path.",

    payloadTooLarge:
      "[react-telemetry-open] Export payload too large ({sizeBytes} bytes). " +
      "Splitting batch and retrying.",

    beaconPayloadTooLarge:
      "[react-telemetry-open] sendBeacon payload exceeds 64KB limit. " +
      "Splitting into smaller chunks.",

    exportSuccess:
      "[react-telemetry-open] Exported {eventCount} events in {durationMs}ms.",

    noApiKeyBeacon:
      "[react-telemetry-open] sendBeacon cannot include authentication headers. " +
      "Configure your Collector to accept unauthenticated requests from your origin, " +
      "or use a backend proxy to add authentication server-side.",
  },

  signalBus: {
    maxListenersExceeded:
      "[react-telemetry-open] Maximum listeners ({max}) reached for event type '{eventType}'. " +
      "Possible memory leak — check that hooks clean up listeners on unmount.",

    emitAfterDestroy:
      "[react-telemetry-open] SignalBus.emit() called after destroy(). Event dropped silently.",
  },

  memory: {
    apiUnavailable:
      "[react-telemetry-open] performance.memory is not available in this browser. " +
      "Memory tracking is supported in Chrome and Edge only.",

    apiReturningZeros:
      "[react-telemetry-open] performance.memory returned all zeros. " +
      "This occurs when cross-origin isolation is not enabled. " +
      "Memory data will not be emitted to avoid misleading zeros.",
  },

  longTask: {
    apiUnavailable:
      "[react-telemetry-open] PerformanceObserver 'longtask' entry type is not supported in this browser. " +
      "Long task tracking is supported in Chrome and Edge only.",
  },

  webVitals: {
    entryTypeUnsupported:
      "[react-telemetry-open] PerformanceObserver entry type '{entryType}' is not supported in this browser. " +
      "This vital will not be collected.",
  },

  singleton: {
    notInitialised:
      "[react-telemetry-open] telemetry.track() called before TelemetryProvider mounted. " +
      "Ensure TelemetryProvider is mounted before using the telemetry singleton.",
  },

  cli: {
    fileExists:
      "telemetry.config.json already exists. Your config has not been changed.\n" +
      "To regenerate: npx react-telemetry-open init --force",

    forceConfirmation:
      "This will overwrite your existing telemetry.config.json. This cannot be undone.",

    ciDetected:
      "CI environment detected. The init command is for local development only. Exiting.",

    noPackageJson:
      "No package.json found in the current directory. " +
      "Are you in your project root?",

    monoRepoDetected:
      "Multiple package.json files detected. This appears to be a monorepo.",

    initSuccess:
      "Created {files}\n\nNext steps:\n" +
      "  1. Wrap your app: <TelemetryProvider><App /></TelemetryProvider>\n" +
      "  2. Open DevTools console — telemetry appears immediately\n" +
      "  3. For production: set REACT_APP_OTEL_URL in .env.production",

    wrongDirectory:
      "No package.json found. This command must be run from your project root.",
  },
} as const;

export type LocaleKey = typeof Locale;
