# Configuration Reference

Copyright 2026 Abhishek Sinha (sinha@live.in) — Apache 2.0

---

## How configuration works

react-telemetry-open resolves config from four sources in this priority order:

```
1. TelemetryProvider config prop      ← highest priority
2. telemetry.config.{NODE_ENV}.json   ← environment-specific override
3. telemetry.config.json              ← base config
4. Package defaults                   ← lowest priority
```

The environment file is deep-merged on top of the base file. The `config` prop
overrides both. Missing fields always fall back to defaults — configuration is
never required for the package to work.

---

## Creating your config file

```bash
npx react-telemetry-open init
```

This generates `telemetry.config.json` and `telemetry.config.prod.json` in
your project root with sensible defaults.

Or create `telemetry.config.json` manually in your project root (not inside `src/`).

---

## Environment variables

Use `$VAR_NAME` syntax for secrets and environment-specific values:

```json
{
  "exporter": {
    "url": "$REACT_APP_OTEL_URL",
    "apiKey": "$REACT_APP_OTEL_KEY"
  }
}
```

The `$VAR_NAME` reference is resolved from `process.env` at build time.
Never hardcode secrets in config files — they will be committed to source control.

---

## Array merge behaviour

When base config and environment override both define arrays:

- `ignore.components` and `ignore.urls` — **concatenated** (combined from both files)
- All other arrays — **replaced** by the environment override value

---

## Validation

Config Manager validates all fields and never crashes. Invalid values are:
- Clamped to valid ranges (numeric fields)
- Replaced with defaults (wrong types)
- Filtered (invalid array items)

All validation issues are reported as warnings in development when `debug: true`.

---

## Complete field reference

### `app`

**`app.name`**
Type: `string` | Default: package.json `name` field

Your application's display name. Appears on every event in your observability backend.
Use a consistent slug — lowercase, hyphen-separated.

```json
{ "app": { "name": "analytics-portal" } }
```

**`app.version`**
Type: `string` | Default: auto-detected (see below)

Your application version. Appears on every telemetry event — use it to correlate performance
regressions with specific releases in your observability backend.

**Auto-detection resolution order (no config required if one of these is set):**

| Framework | How to expose version | Env var read |
|---|---|---|
| Vite | Add to `.env`: `VITE_APP_VERSION=$npm_package_version` | `VITE_APP_VERSION` |
| Next.js | Add to `.env`: `NEXT_PUBLIC_APP_VERSION=$npm_package_version` | `NEXT_PUBLIC_APP_VERSION` |
| CRA | Add to `.env`: `REACT_APP_VERSION=$npm_package_version` | `REACT_APP_VERSION` |
| Any | Set `app.version` in `telemetry.config.json` | direct config |

**For Vite apps (recommended):** add one line to your `.env` file:
```
VITE_APP_VERSION=$npm_package_version
```
`npm` substitutes `$npm_package_version` with the actual version from your `package.json`
when running any `npm run` script. No other setup needed.

If none of these are set, version defaults to `"0.0.0"` and a warning appears in debug mode.

**`app.environment`**
Type: `string` | Default: `NODE_ENV`

The deployment environment. Used to separate production from staging in your observability backend.
Common values: `"production"`, `"staging"`, `"development"`.

**`app.buildId`**
Type: `string` | Default: `"unknown"`

A unique identifier for this specific build — typically a git commit hash.
Set via CI: `REACT_APP_BUILD_ID=$(git rev-parse --short HEAD)`.

---

### `exporter`

**`exporter.type`**
Type: `"console" | "otlp"` | Default: `"console"`

Where to send telemetry data:
- `"console"` — prints to browser DevTools. Use in development.
- `"otlp"` — sends to an OTel Collector endpoint. Use in production.

**`exporter.url`**
Type: `string` | Default: `""`

The OTLP/HTTP endpoint URL. Required when `type` is `"otlp"`.
Always use `$VAR_NAME` — never hardcode.

For managed OTel backends: check your provider's documentation for the OTLP/HTTP endpoint URL.
For self-hosted OTel Collector: typically `http://your-collector:4318`

**`exporter.apiKey`**
Type: `string` | Default: `""`

Authentication key for your Collector. Use `$VAR_NAME` syntax.
Note: `sendBeacon` (used on page unload) cannot send headers — see Limitations.

**`exporter.headers`**
Type: `Record<string, string>` | Default: `{}`

Additional HTTP headers for every export request. For custom authentication.
`Content-Type` and `Authorization` are handled automatically — do not duplicate.

---

### `sampling`

**`sampling.rate`**
Type: `number` | Range: `0.0–1.0` | Default: `1.0`

The fraction of events to record.
- `1.0` — record everything (development, low-traffic production)
- `0.1` — record 10% (high-traffic production)
- `0.0` — record nothing (effectively disables collection)

Errors always pass through regardless of sampling rate.

When a user has `saveData` enabled, the effective rate is automatically reduced
to `min(rate, 0.01)` without changing the config.

---

### `signals`

Each signal can be independently enabled or disabled. Disabled signals
have zero footprint — their collectors never initialise.

**`signals.renders`** | Default: `true`
Track component render count and timing via `useTraceRender`.

**`signals.interactions`** | Default: `true`
Enable `useTrackInteraction` and boot `RageClickCollector`.

**`signals.routes`** | Default: `true`
Track route changes via `useRouteTrace`. Requires React Router 6 or Next.js.

**`signals.errors`** | Default: `true`
Boot `ErrorCollector` for JS errors, rejections, and React boundary catches.
Strongly recommended to keep enabled.

**`signals.network`** | Default: `true`
Boot `NetworkCollector` to wrap fetch() and XHR.

**`signals.memory`** | Default: `true`
Boot `MemoryCollector`. Chrome/Edge only — no data in Firefox/Safari.

**`signals.longTasks`** | Default: `true`
Boot `LongTaskCollector`. Chrome/Edge only.

**`signals.webVitals`** | Default: `true`
Boot `WebVitalsCollector`. Full vitals in Chrome/Edge, FCP in all browsers.
Strongly recommended to keep enabled.

**`signals.customEvents`** | Default: `true`
Enable `useTrackEvent` and `telemetry.track()`.

**`signals.resourceTiming`** | Default: `false`
Boot `ResourceTimingCollector` for asset load tracking. Opt-in — disabled by default
to avoid collecting data developers may not expect.

---

### `batch`

**`batch.size`**
Type: `integer` | Range: `1–1000` | Default: `50`

Events to accumulate before flushing. Flush happens immediately when this
size is reached, or when `flushIntervalMs` elapses, whichever comes first.

Lower → more frequent smaller requests → higher Collector load
Higher → less frequent larger requests → lower Collector load

**`batch.flushIntervalMs`**
Type: `integer` | Range: `1000–60000` | Unit: ms | Default: `5000`

Maximum time before flushing a partial batch. Ensures events reach your backend
within `flushIntervalMs + network latency` even during quiet periods.

**`batch.maxQueueSize`**
Type: `integer` | Range: `50–2000` | Default: `500`

Maximum events held in queue. During Collector outages events accumulate here.
When full, oldest events are dropped. Prevents unbounded memory growth.

---

### `privacy`

**`privacy.stripQueryParams`**
Type: `boolean` | Default: `true`

Remove query parameters and fragments from all recorded URLs.
Strongly recommended — query params frequently contain user IDs, tokens, PII.

Example with `true`: `/api/users?token=abc123` → `/api/users`

**`privacy.respectDoNotTrack`**
Type: `boolean` | Default: `true`

Disable all telemetry for users who have enabled the Do Not Track browser setting.

---

### `ignore`

**`ignore.components`**
Type: `string[]` | Default: `[]`

Component names to exclude from render tracking. Names must match exactly what
is passed to `useTraceRender()`. Case-sensitive.

Use for high-frequency, low-value components: Tooltip, Popover, Spinner.

```json
{ "ignore": { "components": ["Tooltip", "Popover", "LoadingSpinner"] } }
```

**`ignore.urls`**
Type: `string[]` | Default: `[]`

URL substrings to exclude from network tracking. Substring match — `/health`
matches `/api/health`, `/health/check`, `/healthz`.

Patterns are treated as literal substrings — not regular expressions.

```json
{ "ignore": { "urls": ["/health", "/ping", "analytics.google.com"] } }
```

---

### `interactions`

**`interactions.inputDebounceMs`**
Type: `integer` | Range: `0–5000` | Unit: ms | Default: `300`

Debounce delay for input change events. Prevents one event per keystroke.
300ms is the standard typing debounce.

**`interactions.rageClick.threshold`**
Type: `integer` | Range: `2–10` | Default: `3`

Number of clicks within `windowMs` to qualify as a rage click.
Increase to `4–5` for apps with intentional rapid clicking (games, music apps).

**`interactions.rageClick.windowMs`**
Type: `integer` | Range: `200–2000` | Unit: ms | Default: `500`

Sliding window for rage click detection. Detection is window-based — any
`threshold` consecutive clicks within this duration qualifies.
The 501ms edge case is handled correctly by the sliding window approach.

**`interactions.customEvents.maxPropertiesSizeBytes`**
Type: `integer` | Range: `1–65536` | Unit: bytes | Default: `4096`

Maximum serialised size of custom event properties. Events with larger
properties are dropped with a warning. Prevents large JSON.stringify calls
from blocking the main thread.

---

### `debug`

Type: `boolean` | Default: `false`

Enable verbose logging to the browser console. Shows:
- Every event collected
- Every export attempt
- Circuit breaker state changes
- Startup validation report
- All configuration warnings

Never enable in production — pollutes the console and may expose telemetry
data to users who open DevTools.

---

## Complete defaults

```json
{
  "app": {
    "name": "<from package.json>",
    "version": "<from package.json>",
    "environment": "<from NODE_ENV>",
    "buildId": "unknown"
  },
  "exporter": {
    "type": "console",
    "url": "",
    "apiKey": "",
    "headers": {}
  },
  "sampling": {
    "rate": 1.0
  },
  "signals": {
    "renders": true,
    "interactions": true,
    "routes": true,
    "errors": true,
    "network": true,
    "memory": true,
    "longTasks": true,
    "webVitals": true,
    "customEvents": true,
    "resourceTiming": false
  },
  "batch": {
    "size": 50,
    "flushIntervalMs": 5000,
    "maxQueueSize": 500
  },
  "privacy": {
    "stripQueryParams": true,
    "respectDoNotTrack": true
  },
  "ignore": {
    "components": [],
    "urls": []
  },
  "interactions": {
    "inputDebounceMs": 300,
    "rageClick": {
      "threshold": 3,
      "windowMs": 500
    },
    "customEvents": {
      "maxPropertiesSizeBytes": 4096
    }
  },
  "debug": false
}
```

---

© 2026 Abhishek Sinha. Licensed under Apache 2.0.
