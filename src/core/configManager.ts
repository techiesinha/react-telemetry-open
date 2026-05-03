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

import type { TelemetryConfig } from "../types/public";
import type { ResolvedConfig } from "../types/internal";
import { ExporterType } from "../types/internal";
import { Locale } from "../locale";
import { interpolate } from "../utils/interpolate";
import { safeParse } from "../utils/safeJson";
import { deepMerge } from "../utils/deepMerge";
import { compileUrlIgnorePatterns } from "../utils/sanitiseUrl";
import {
  DEFAULT_BATCH_SIZE,
  DEFAULT_FLUSH_INTERVAL_MS,
  DEFAULT_MAX_QUEUE_SIZE,
  DEFAULT_SAMPLING_RATE,
  DEFAULT_INPUT_DEBOUNCE_MS,
  DEFAULT_MAX_PROPERTIES_SIZE_BYTES,
  ABSOLUTE_MAX_PROPERTIES_SIZE_BYTES,
  MAX_SAMPLING_RATE,
  MIN_SAMPLING_RATE,
  MIN_BATCH_SIZE,
  MAX_BATCH_SIZE,
  MIN_FLUSH_INTERVAL_MS,
  MAX_FLUSH_INTERVAL_MS,
  MIN_MAX_QUEUE_SIZE,
  MAX_MAX_QUEUE_SIZE,
  MIN_INPUT_DEBOUNCE_MS,
  MAX_INPUT_DEBOUNCE_MS,
  MIN_RAGE_CLICK_THRESHOLD,
  MAX_RAGE_CLICK_THRESHOLD,
  MIN_RAGE_CLICK_WINDOW_MS,
  MAX_RAGE_CLICK_WINDOW_MS,
  RAGE_CLICK_THRESHOLD,
  RAGE_CLICK_WINDOW_MS,
  MAX_APP_NAME_LENGTH,
  CONFIG_RETRY_DELAY_MS,
} from "../constants";

/** Compiled URL ignore pattern — built once during resolution */
let compiledIgnoreUrls: RegExp | null = null;

/** Compiled component ignore set — O(1) lookup */
let compiledIgnoreComponents: Set<string> | null = null;

/**
 * Safely reads an environment variable in any runtime:
 *   - Node.js        → process.env[name]
 *   - Vite browser   → import.meta.env[name] or import.meta.env[VITE_name]
 *   - Webpack/CRA    → process.env[name] (polyfilled by bundler)
 *   - Bare browser   → returns undefined safely (no crash)
 */
const safeGetEnv = (name: string): string | undefined => {
  try {
    if (typeof process !== "undefined" && process.env) {
      const value = (process.env as Record<string, string | undefined>)[name];
      if (value !== undefined) return value;
    }
  } catch { /* process not available in this environment */ }
  try {
    const metaEnv = (
      import.meta as { env?: Record<string, string | undefined> }
    ).env;
    if (metaEnv) {
      return metaEnv[name] ?? metaEnv[`VITE_${name}`];
    }
  } catch { /* import.meta.env not available */ }
  return undefined;
};

/**
 * Resolves $VAR_NAME references in string config values to process.env values.
 * Recurses into nested objects. Non-string values are returned unchanged.
 */
const resolveEnvVars = (
  configValue: unknown,
  debugEnabled: boolean
): unknown => {
  if (typeof configValue === "string" && configValue.startsWith("$")) {
    const envVarName = configValue.slice(1);
    const resolvedValue = safeGetEnv(envVarName);
    if (!resolvedValue && debugEnabled) {
      console.warn(
        interpolate(Locale.config.envVarNotSet, { varName: envVarName })
      );
    }
    return resolvedValue ?? "";
  }

  if (typeof configValue === "object" && configValue !== null) {
    const resolvedObject: Record<string, unknown> = {};
    for (const [objectKey, objectValue] of Object.entries(configValue)) {
      if (Object.hasOwn(configValue, objectKey)) {
        resolvedObject[objectKey] = resolveEnvVars(objectValue, debugEnabled);
      }
    }
    return resolvedObject;
  }

  return configValue;
};

/**
 * Clamps a numeric value to a valid range.
 * Warns in debug mode if the value was out of range.
 */
const clampNumber = (
  value: unknown,
  fieldName: string,
  minValue: number,
  maxValue: number,
  defaultValue: number,
  debugEnabled: boolean
): number => {
  if (typeof value !== "number" || isNaN(value)) {
    return defaultValue;
  }
  const clampedValue = Math.max(minValue, Math.min(maxValue, value));
  if (clampedValue !== value && debugEnabled) {
    console.warn(
      interpolate(Locale.config.batchSizeClamped, {
        min: minValue,
        max: maxValue,
        value,
        clamped: clampedValue,
      })
    );
  }
  return clampedValue;
};

/**
 * Detects if an API key string appears to be a real secret rather than a
 * $VAR_NAME reference. Used to warn developers about hardcoded secrets.
 */
const looksLikeHardcodedSecret = (apiKeyValue: string): boolean => {
  if (!apiKeyValue || apiKeyValue.startsWith("$")) return false;
  // Longer than 16 chars and contains mixed characters — likely a real key
  return apiKeyValue.length > 16 && /[A-Za-z0-9+/=_-]/.test(apiKeyValue);
};

/**
 * Reads a package.json file safely and returns the name field.
 * Used as fallback for app.name when not configured.
 */
const readPackageJsonName = (): string => {
  try {
    if (typeof require !== "undefined") {
      const packageJson = require(`${process.cwd()}/package.json`) as {
        name?: string;
        version?: string;
      };
      return packageJson?.name ?? "unknown-app";
    }
  } catch {
    // Cannot read package.json in this environment
  }
  return "unknown-app";
};

/**
 * Reads the app version from the host application.
 *
 * Resolution order:
 * 1. VITE_APP_VERSION      — Vite: define in .env as VITE_APP_VERSION=1.2.3
 * 2. NEXT_PUBLIC_APP_VERSION — Next.js: define in .env as NEXT_PUBLIC_APP_VERSION=1.2.3
 * 3. REACT_APP_VERSION     — CRA: define in .env as REACT_APP_VERSION=1.2.3
 * 4. npm_package_version   — available when running via npm scripts (SSR/Node builds)
 * 5. require(package.json) — Node.js environments only
 * 6. "0.0.0"               — fallback when none of the above are set
 *
 * For Vite apps, add to your .env file:
 *   VITE_APP_VERSION=$npm_package_version
 * npm will substitute the actual version from package.json at build time.
 */
const readPackageJsonVersion = (): string => {
  // Check import.meta.env — Vite and Next.js bundler-injected env vars
  try {
    const metaEnv = (import.meta as { env?: Record<string, string | undefined> }).env;
    if (metaEnv) {
      const viteVersion = metaEnv["VITE_APP_VERSION"];
      if (viteVersion && viteVersion !== "undefined") return viteVersion;

      const nextVersion = metaEnv["NEXT_PUBLIC_APP_VERSION"];
      if (nextVersion && nextVersion !== "undefined") return nextVersion;
    }
  } catch { /* import.meta.env not available */ }

  // Check process.env via safeGetEnv — CRA, Webpack, npm scripts
  const craVersion = safeGetEnv("REACT_APP_VERSION");
  if (craVersion && craVersion !== "undefined") return craVersion;

  const npmVersion = safeGetEnv("npm_package_version");
  if (npmVersion && npmVersion !== "undefined") return npmVersion;

  // Node.js only — require is not available in browsers
  try {
    if (typeof require !== "undefined") {
      const packageJson = require(`${process.cwd()}/package.json`) as { version?: string };
      if (packageJson?.version) return packageJson.version;
    }
  } catch { /* not available in this environment */ }

  return "0.0.0";
};

/**
 * ConfigManager resolves the final configuration from all sources.
 * Priority: TelemetryProvider prop > telemetry.config.prod.json > telemetry.config.json > defaults
 *
 * Rules:
 * - Never crashes — always produces a valid ResolvedConfig
 * - Warns about misconfigurations in debug mode
 * - Clamps numeric values to valid ranges
 * - Resolves $VAR_NAME env var references
 * - Returns a frozen object — never mutated after creation
 */
export const resolveConfig = (
  appConfig?: unknown,
  inlinePropConfig?: TelemetryConfig
): ResolvedConfig => {
  // Safely cast appConfig — it comes from a JSON import which TypeScript widens to string
  const safeAppConfig =
    appConfig !== null &&
    typeof appConfig === "object" &&
    !Array.isArray(appConfig)
      ? (appConfig as TelemetryConfig)
      : undefined;

  const isDebugEnabled = inlinePropConfig?.debug ?? safeAppConfig?.debug ?? false;

  // Step 1 — Read base config file (Node.js/SSR only)
  let fileConfig: TelemetryConfig = {};
  let prodFileConfig: TelemetryConfig = {};

  try {
    const baseContent = tryReadConfigFile("telemetry.config.json");
    if (baseContent) {
      const parsedBase = safeParse<TelemetryConfig>(baseContent);
      if (parsedBase && typeof parsedBase === "object" && !Array.isArray(parsedBase)) {
        fileConfig = parsedBase;
      } else if (parsedBase !== null && isDebugEnabled) {
        console.warn(
          interpolate(Locale.config.signalsMustBeObject, {
            received: typeof parsedBase,
          })
        );
      }
    }

    const prodContent = tryReadConfigFile(
      `telemetry.config.${safeGetEnv("NODE_ENV") ?? "development"}.json`
    );
    if (prodContent) {
      const parsedProd = safeParse<TelemetryConfig>(prodContent);
      if (parsedProd && typeof parsedProd === "object" && !Array.isArray(parsedProd)) {
        prodFileConfig = parsedProd;
      }
    }
  } catch {
    if (isDebugEnabled) {
      console.warn(Locale.config.invalidJson);
    }
  }

  // Step 2 — Deep merge: file → appConfig → runtime config (highest priority)
  const mergedConfig = deepMerge(
    deepMerge(
      deepMerge(fileConfig as Record<string, unknown>, prodFileConfig as Record<string, unknown>, isDebugEnabled),
      (safeAppConfig ?? {}) as Record<string, unknown>,
      isDebugEnabled
    ),
    (inlinePropConfig ?? {}) as Record<string, unknown>,
    isDebugEnabled
  ) as TelemetryConfig;

  // Step 3 — Resolve $VAR_NAME env references
  const envResolvedConfig = resolveEnvVars(mergedConfig, isDebugEnabled) as TelemetryConfig;

  const debugMode = typeof envResolvedConfig.debug === "boolean"
    ? envResolvedConfig.debug
    : false;

  // Step 4 — Apply defaults and validate all fields
  const appName = (typeof envResolvedConfig.app?.name === "string" &&
    envResolvedConfig.app.name.trim().length > 0)
    ? envResolvedConfig.app.name.trim().slice(0, MAX_APP_NAME_LENGTH)
    : readPackageJsonName();

  const exporterType: ExporterType =
    envResolvedConfig.exporter?.type === ExporterType.Otlp ||
    envResolvedConfig.exporter?.type === ExporterType.Console
      ? (envResolvedConfig.exporter.type as ExporterType)
      : ExporterType.Console;

  const exporterUrl = typeof envResolvedConfig.exporter?.url === "string"
    ? envResolvedConfig.exporter.url
    : "";

  // Warn if OTLP configured without URL
  if (exporterType === ExporterType.Otlp && !exporterUrl && debugMode) {
    console.warn(Locale.config.missingOtlpUrl);
  }

  // Warn if API key appears hardcoded
  const apiKey = typeof envResolvedConfig.exporter?.apiKey === "string"
    ? envResolvedConfig.exporter.apiKey
    : "";
  if (looksLikeHardcodedSecret(apiKey) && debugMode) {
    console.warn(Locale.config.hardcodedApiKey);
  }

  // Warn if localhost in production
  if (
    exporterUrl.includes("localhost") &&
    safeGetEnv("NODE_ENV") === "production" &&
    debugMode
  ) {
    console.warn(Locale.config.localhostInProduction);
  }

  const samplingRate = clampNumber(
    envResolvedConfig.sampling?.rate,
    "sampling.rate",
    MIN_SAMPLING_RATE,
    MAX_SAMPLING_RATE,
    DEFAULT_SAMPLING_RATE,
    debugMode
  );

  const batchSize = clampNumber(
    envResolvedConfig.batch?.size,
    "batch.size",
    MIN_BATCH_SIZE,
    MAX_BATCH_SIZE,
    DEFAULT_BATCH_SIZE,
    debugMode
  );

  const flushIntervalMs = clampNumber(
    envResolvedConfig.batch?.flushIntervalMs,
    "batch.flushIntervalMs",
    MIN_FLUSH_INTERVAL_MS,
    MAX_FLUSH_INTERVAL_MS,
    DEFAULT_FLUSH_INTERVAL_MS,
    debugMode
  );

  const maxQueueSize = clampNumber(
    envResolvedConfig.batch?.maxQueueSize,
    "batch.maxQueueSize",
    MIN_MAX_QUEUE_SIZE,
    MAX_MAX_QUEUE_SIZE,
    DEFAULT_MAX_QUEUE_SIZE,
    debugMode
  );

  const inputDebounceMs = clampNumber(
    envResolvedConfig.interactions?.inputDebounceMs,
    "interactions.inputDebounceMs",
    MIN_INPUT_DEBOUNCE_MS,
    MAX_INPUT_DEBOUNCE_MS,
    DEFAULT_INPUT_DEBOUNCE_MS,
    debugMode
  );

  const rageClickThreshold = clampNumber(
    envResolvedConfig.interactions?.rageClick?.threshold,
    "interactions.rageClick.threshold",
    MIN_RAGE_CLICK_THRESHOLD,
    MAX_RAGE_CLICK_THRESHOLD,
    RAGE_CLICK_THRESHOLD,
    debugMode
  );

  const rageClickWindowMs = clampNumber(
    envResolvedConfig.interactions?.rageClick?.windowMs,
    "interactions.rageClick.windowMs",
    MIN_RAGE_CLICK_WINDOW_MS,
    MAX_RAGE_CLICK_WINDOW_MS,
    RAGE_CLICK_WINDOW_MS,
    debugMode
  );

  const maxPropertiesSizeBytes = clampNumber(
    envResolvedConfig.interactions?.customEvents?.maxPropertiesSizeBytes,
    "interactions.customEvents.maxPropertiesSizeBytes",
    1,
    ABSOLUTE_MAX_PROPERTIES_SIZE_BYTES,
    DEFAULT_MAX_PROPERTIES_SIZE_BYTES,
    debugMode
  );

  // Build component ignore Set — O(1) lookup later
  const rawIgnoreComponents = Array.isArray(envResolvedConfig.ignore?.components)
    ? envResolvedConfig.ignore.components.filter(
        (item) => typeof item === "string" && item.length > 0
      )
    : [];
  compiledIgnoreComponents = new Set(rawIgnoreComponents);

  // Build URL ignore RegExp — O(1) test later
  const rawIgnoreUrls = Array.isArray(envResolvedConfig.ignore?.urls)
    ? envResolvedConfig.ignore.urls.filter(
        (item) => typeof item === "string" && item.length > 0
      )
    : [];
  compiledIgnoreUrls = compileUrlIgnorePatterns(rawIgnoreUrls);

  const resolvedConfiguration: ResolvedConfig = {
    app: {
      name: appName,
      version: typeof envResolvedConfig.app?.version === "string"
        ? envResolvedConfig.app.version
        : readPackageJsonVersion(),
      environment: typeof envResolvedConfig.app?.environment === "string"
        ? envResolvedConfig.app.environment
        : (safeGetEnv("NODE_ENV") ?? "development"),
      buildId: typeof envResolvedConfig.app?.buildId === "string"
        ? envResolvedConfig.app.buildId
        : (safeGetEnv("REACT_APP_BUILD_ID") ?? safeGetEnv("VITE_BUILD_ID") ?? "unknown"),
    },
    exporter: {
      type: exporterType,
      url: exporterUrl,
      apiKey,
      headers: typeof envResolvedConfig.exporter?.headers === "object" &&
        !Array.isArray(envResolvedConfig.exporter.headers) &&
        envResolvedConfig.exporter.headers !== null
        ? (envResolvedConfig.exporter.headers as Record<string, string>)
        : {},
    },
    sampling: { rate: samplingRate },
    signals: {
      renders: envResolvedConfig.signals?.renders !== false,
      interactions: envResolvedConfig.signals?.interactions !== false,
      routes: envResolvedConfig.signals?.routes !== false,
      errors: envResolvedConfig.signals?.errors !== false,
      network: envResolvedConfig.signals?.network !== false,
      memory: envResolvedConfig.signals?.memory !== false,
      longTasks: envResolvedConfig.signals?.longTasks !== false,
      webVitals: envResolvedConfig.signals?.webVitals !== false,
      customEvents: envResolvedConfig.signals?.customEvents !== false,
      resourceTiming: envResolvedConfig.signals?.resourceTiming === true,
    },
    batch: {
      size: Math.floor(batchSize),
      flushIntervalMs: Math.floor(flushIntervalMs),
      maxQueueSize: Math.floor(maxQueueSize),
    },
    privacy: {
      stripQueryParams: envResolvedConfig.privacy?.stripQueryParams !== false,
      respectDoNotTrack: envResolvedConfig.privacy?.respectDoNotTrack !== false,
    },
    ignore: {
      components: rawIgnoreComponents,
      urls: rawIgnoreUrls,
    },
    interactions: {
      inputDebounceMs: Math.floor(inputDebounceMs),
      rageClick: {
        threshold: Math.floor(rageClickThreshold),
        windowMs: Math.floor(rageClickWindowMs),
      },
      maxPropertiesSizeBytes: Math.floor(maxPropertiesSizeBytes),
    },
    debug: debugMode,
  };

  // Warn about all signals disabled
  const allSignalsDisabled = Object.values(resolvedConfiguration.signals).every(
    (enabled) => !enabled
  );
  if (allSignalsDisabled && debugMode) {
    console.warn(Locale.provider.allSignalsDisabled);
  }

  return Object.freeze(resolvedConfiguration);
};

/**
 * Returns the compiled URL ignore RegExp or null if no patterns configured.
 * Must be called after resolveConfig().
 */
export const getCompiledIgnoreUrls = (): RegExp | null => compiledIgnoreUrls;

/**
 * Returns the compiled component ignore Set or null if no components configured.
 * Must be called after resolveConfig().
 */
export const getCompiledIgnoreComponents = (): Set<string> | null =>
  compiledIgnoreComponents;

/**
 * Attempts to read a config file from the current working directory.
 * Returns null if file does not exist or cannot be read.
 * Uses retry once after CONFIG_RETRY_DELAY_MS for partial write safety.
 */
/**
 * Reads a config file by fetching it from the server.
 * Works in all browser environments — no Node.js fs required.
 * The config file must be in the project root (served as a static asset by Vite/Next.js/CRA).
 *
 * Returns null synchronously — config is resolved asynchronously after boot.
 * For synchronous boot we rely on inline prop config or defaults.
 *
 * In Node.js/SSR environments, falls back to require('fs') for server-side rendering.
 */
const tryReadConfigFile = (_fileName: string): string | null => {
  // Config files cannot be read synchronously in the browser.
  // Use the TelemetryProvider config prop or telemetry.config.json via
  // the Vite plugin (see docs/guides/vite-plugin.md) for build-time injection.
  // At runtime we rely on the prop config and defaults only.
  try {
    if (typeof require !== "undefined" && typeof process !== "undefined") {
      // Node.js / SSR — can read filesystem synchronously
      const filePath = `${process.cwd()}/${_fileName}`;
      const fileSystem = require("fs") as {
        readFileSync: (path: string, encoding: string) => string;
        existsSync: (path: string) => boolean;
      };
      if (!fileSystem.existsSync(filePath)) return null;
      return fileSystem.readFileSync(filePath, "utf-8");
    }
  } catch { /* filesystem not available */ }
  return null;
};
