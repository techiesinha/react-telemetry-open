# react-telemetry-open — Signal Reference

Copyright 2026 Abhishek Sinha (sinha@live.in) — Apache 2.0

This document covers every signal emitted by react-telemetry-open v1.0.0,
the data captured on each event, browser support, known limitations,
and scenarios where developer input is required for accurate tracking.

---

## Context on every event

Every event carries this data automatically — no configuration required.

| Field | Example | Browser support |
|---|---|---|
| `app.name` | `"analytics-portal"` | All |
| `app.version` | `"1.0.0"` | All |
| `app.environment` | `"production"` | All |
| `app.buildId` | `"a3f9d2"` | All |
| `session.id` | `"550e8400-..."` | All — uses `crypto.randomUUID()` (Safari 15.4+) with Math.random() fallback |
| `session.duration` | `45230` | All |
| `session.pageViews` | `3` | All |
| `route` | `"/dashboard"` | All |
| `timestamp` | `1746201600000` | All |
| `device.type` | `"mobile"` | All |
| `device.memory` | `4` | Chrome, Edge only — `null` in Firefox, Safari |
| `device.cpuCores` | `8` | All browsers (Safari 12.1+) — fallback: 1 |
| `browser.name` | `"Chrome"` | All — uses `userAgentData` in Chrome/Edge, `userAgent` string parsing elsewhere |
| `browser.version` | `"124"` | All |
| `os.name` | `"macOS"` | All — parsed from `userAgent` |
| `network.type` | `"4g"` | Chrome, Edge only — `"unknown"` in Firefox, Safari |
| `network.downlink` | `10` | Chrome, Edge only — `null` elsewhere |
| `network.rtt` | `50` | Chrome, Edge only — `null` elsewhere |
| `network.saveData` | `false` | Chrome, Edge only — `false` elsewhere |
| `network.online` | `true` | All |
| `react.version` | `"18.3.0"` | All |

---

## Browser support summary

| Signal / Feature | Chrome | Edge | Firefox | Safari |
|---|---|---|---|---|
| All signals (core) | ✅ | ✅ | ✅ | ✅ |
| `web_vital.fcp` | ✅ | ✅ | ✅ | ✅ 15.4+ |
| `web_vital.lcp` | ✅ | ✅ | ❌ | ❌ |
| `web_vital.fid` | ✅ | ✅ | ❌ | ❌ |
| `web_vital.cls` | ✅ | ✅ | ❌ | ❌ |
| `web_vital.inp` | ✅ 96+ | ✅ | ❌ | ❌ |
| `browser.long_task.duration` | ✅ | ✅ | ❌ | ❌ |
| `browser.memory.heap_used` | ✅ | ✅ 124+ | ❌ | ❌ |
| `resource.load.duration` | ✅ | ✅ | ✅ | ✅ |
| `network.fetch` | ✅ | ✅ | ✅ | ✅ |
| `network.xhr` | ✅ | ✅ | ✅ | ✅ |
| `network.offline/online` | ✅ | ✅ | ✅ | ✅ |
| `network.type/downlink/rtt` | ✅ | ✅ | ❌ `"unknown"` | ❌ `"unknown"` |
| `device.memory` | ✅ | ✅ | ❌ `null` | ❌ `null` |
| `device.cpuCores` | ✅ | ✅ | ✅ | ✅ 12.1+ |
| `session.id` (UUID) | ✅ | ✅ | ✅ | ✅ 15.4+ (fallback for older) |
| gzip export compression | ✅ | ✅ | ✅ 113+ | ✅ 16.4+ (uncompressed fallback) |
| `navigator.doNotTrack` | ✅ | ✅ | ✅ | ⚠️ deprecated 17.4 |
| `browser.name` accuracy | ✅ `userAgentData` | ✅ `userAgentData` | ✅ `userAgent` | ✅ `userAgent` |

**Key:** ✅ Supported · ❌ Not supported (safe fallback used) · ⚠️ Partial/deprecated

---

## Signals reference

---

### `react.render.duration`

**Emitted by:** `useTraceRender(componentName)`
**Type:** metric
**Unit:** ms

```
component: "UserDashboard"
renderCount: 4
priority: "urgent" | "deferred"    ← urgent if > 16.67ms (one frame)
```

**Requires developer action:**
- Must be added manually to every component you want to track
- Must pass an explicit string name — minification removes function names in production
- Without `data` from `useTraceRender`, no render data is collected at all

**Ambiguities:**
- `priority: "urgent"` means render took longer than one 60fps frame budget. It does not mean the render blocked the user — React may have deferred it naturally in concurrent mode.
- `renderCount` resets on component unmount and remount. An ErrorBoundary remount resets it to 1.

---

### `react.render.duration` — StrictMode behavior

In development with `<React.StrictMode>`, React intentionally mounts every component twice. The package suppresses the first render and records only the second. In production, StrictMode is not active and every render is recorded normally.

---

### `interaction.click`

**Emitted by:** `useTrackInteraction(elementName)` → returned `onClick` handler
**Type:** log

```
element: "checkout-submit"    ← the name you pass to useTrackInteraction
interactionType: "click"
component: "CheckoutButton"   ← optional, from options.component
```

**Requires developer action:**
- Must attach the returned `onClick` to the element explicitly
- The `elementName` is your logical business name — choose something meaningful for your dashboard

---

### `interaction.input`

**Emitted by:** `useTrackInteraction(elementName)` → returned `onChange` handler
**Type:** log

```
element: "search-input"
interactionType: "input"
```

**Ambiguities:**
- Debounced by `interactions.inputDebounceMs` (default 300ms) — only fires after the user stops typing for 300ms, not on every keystroke
- The value typed is never captured — only that an input event occurred

---

### `interaction.rage_click`

**Emitted by:** `RageClickCollector` (automatic, no hook needed)
**Type:** log

```
element: "rage-target"          ← from data-testid, id, aria-label, or tag+class
elementType: "button"
clickCount: 4
burstDurationMs: 380
```

**Requires developer action:**
- Add `data-testid`, `id`, or `aria-label` to elements you want identified precisely
- Without these, the identifier falls back to `tag + class` which may match multiple elements
- Buttons with dynamic text (e.g. `Count: {count}`) must have `data-testid` — text content is deliberately excluded from identification to prevent different IDs per render

**Ambiguities:**
- Threshold is 3 clicks within 500ms by default — both configurable
- Excludes checkboxes, switches, sliders — intentional rapid interaction on these is normal

---

### `interaction.time_to_first`

**Emitted by:** `RageClickCollector` (automatic)
**Type:** metric
**Unit:** ms

```
interactionType: "click" | "touchend"
value: 3240    ← milliseconds since page load (performance.now())
```

**Ambiguities:**
- Fires on the first click or touch anywhere on the page, not on a specific element
- Resets per session — tab reload starts a new measurement

---

### `route.change`

**Emitted by:** `useRouteTrace()`
**Type:** span

```
fromRoute: "/dashboard"
toRoute: "/settings"
navigationDurationMs: 340    ← time from previous render to new route completing
```

**Requires developer action:**
- `useRouteTrace()` must be called inside a component that re-renders on navigation
- With React Router 6: call it inside a component that uses `useLocation()`, or add `useLocation()` alongside it
- Without this re-render trigger, the effect never fires and route changes are missed
- Next.js App Router: call in the root layout component

**Ambiguities:**
- First page load does not emit `route.change` — only subsequent navigations
- `navigationDurationMs` measures JavaScript time — it does not include time for the server to respond in SSR or data loading time in Suspense
- Query parameters are stripped from routes by default (`/search?q=react` → `/search`)
- Numeric IDs are replaced (`/users/12345` → `/users/:id`)

**Drop-off tracking:**
Every `route.change` contains `fromRoute` and `toRoute`. Use these in your OTel backend to build navigation funnels:
```
Sessions reaching /checkout = route.change where toRoute = "/checkout"
Sessions reaching /pricing  = route.change where toRoute = "/pricing"
Drop-off rate = 1 - (/checkout count / /pricing count)
```

---

### `network.fetch`

**Emitted by:** `NetworkCollector` (automatic)
**Type:** span

```
url: "/api/users/:id"       ← sanitised — query params and IDs removed
method: "GET"
status: 200
ok: true
size: 1240                  ← bytes from Content-Length header, null if absent
```

**Ambiguities:**
- The Collector endpoint is automatically excluded — your telemetry export calls are never tracked
- Cross-origin requests show `url` with origin included: `https://api.external.com/data`
- `size` is from the `Content-Length` response header only — chunked or streamed responses show `null`
- Failed requests (network error, CORS) show `status: 0, ok: false`

---

### `network.xhr`

**Emitted by:** `NetworkCollector` (automatic)
**Type:** span

```
url: "/api/v2/items"
method: "POST"
status: 201
ok: true
```

**Ambiguities:**
- Response size not captured from XHR — `Content-Length` not reliably accessible the same way as fetch

---

### `network.error_rate`

**Emitted by:** `NetworkCollector` (automatic, every 60 seconds)
**Type:** metric

```
value: 0.08              ← 8% error rate this window
errorCount: 4
totalCount: 50
windowSeconds: 60
```

**Ambiguities:**
- Only appears after 60 seconds of the session — will not appear in short test sessions
- Resets every 60 seconds — each emission is an independent window
- Includes both fetch and XHR in the calculation

---

### `network.offline` / `network.online`

**Emitted by:** `NetworkCollector` (automatic)
**Type:** log

**How to test:** DevTools → Network → change throttle to Offline/Online. Fires immediately on connectivity change without any user action.

---

### `js.error`

**Emitted by:** `ErrorCollector` (automatic)
**Type:** log

```
message: "Cannot read properties of undefined"
errorType: "TypeError"
filename: "http://localhost:5173/src/App.tsx"
line: 42
column: 8
stack: "TypeError: ..."
```

**Ambiguities:**
- Cross-origin scripts produce `message: "Script error."` with no other data — browser security restriction. Add `crossorigin="anonymous"` to `<script>` tags for full error details.
- In development, React renders errors twice (StrictMode). The package captures one event per error, not two.
- The browser's own `Uncaught Error` in the console is separate — our package does not suppress it.

---

### `js.unhandled_rejection`

**Emitted by:** `ErrorCollector` (automatic)
**Type:** log

```
message: "Failed to fetch"
errorType: "TypeError"
isUnhandledRejection: true
stack: "..."
```

**Ambiguities:**
- Fires when a Promise rejects and no `.catch()` or `try/catch` handles it
- A common source is `async` event handlers without `try/catch` — the fetch fails while offline and bubbles up
- This is the developer's code missing error handling — not a bug in the package

---

### `react.error`

**Emitted by:** `TelemetryErrorBoundary` (internal, wraps all children automatically)
**Type:** log

```
message: "Cannot read properties of undefined"
errorType: "TypeError"
componentStack: "\n    at UserProfile\n    at Dashboard..."
boundaryName: "root"
```

**Requires developer action:**
When using a third-party error boundary library (e.g. `react-error-boundary`), wire its `onError` callback to our tracking:

```tsx
import { useTrackEvent } from 'react-telemetry-open'

const track = useTrackEvent()

<ErrorBoundary
  onError={(error, info) => {
    const err = error as Error
    track('react.error.boundary', {
      message: err.message,
      componentStack: info.componentStack ?? '',
    })
  }}
>
```

Without this, third-party boundaries catch the error before our internal boundary sees it.

**Ambiguities:**
- `componentStack` is the React component tree — not a JavaScript stack trace
- Available in development only when React is in development mode. In production builds, component names may be minified.

---

### `web_vital.fcp`

**Emitted by:** `WebVitalsCollector` (automatic)
**Type:** metric
**Unit:** ms
**Browser support:** Chrome, Edge, Firefox — Safari 15.4+ only. Older Safari returns no FCP.

```
value: 843
rating: "good" | "needs-improvement" | "poor"
```

Thresholds: good < 1800ms, poor > 3000ms

---

### `web_vital.lcp`

**Emitted by:** `WebVitalsCollector` (automatic, on page hide)
**Type:** metric
**Unit:** ms
**Browser support:** Chrome, Edge only

**How to test:** Load the page, then switch to another tab. LCP emits on `visibilitychange`.

**Ambiguities:**
- LCP updates multiple times during page load — only the final value is emitted
- Emitted on page hide, not immediately — there is a delay between the actual LCP moment and the event appearing in console
- Switching tabs back and forth emits LCP again each time — each represents the LCP for that visibility session

---

### `web_vital.fid`

**Emitted by:** `WebVitalsCollector` (automatic)
**Type:** metric
**Unit:** ms
**Browser support:** Chrome, Edge only

**How to test:** Load the page then press a keyboard key or click. FID fires only on the FIRST input after page load.

**Ambiguities:**
- Fires only once per page load — the first interaction
- Deprecated by Google in favour of INP, but still tracked as it remains in Lighthouse scoring

---

### `web_vital.cls`

**Emitted by:** `WebVitalsCollector` (automatic, on page hide)
**Type:** metric
**Unit:** score (unitless)
**Browser support:** Chrome, Edge only

```
value: 0.04
rating: "good"
```

Thresholds: good < 0.1, poor > 0.25

**Ambiguities:**
- Excludes layout shifts triggered by user input — only unexpected shifts are counted
- Accumulated across entire page session, emitted on hide
- A value of 0 means no unexpected layout shifts occurred

---

### `web_vital.inp`

**Emitted by:** `WebVitalsCollector` (automatic, on page hide)
**Type:** metric
**Unit:** ms
**Browser support:** Chrome 96+ only

**Ambiguities:**
- Tracks the worst (slowest) interaction response time across the entire session
- Emitted on page hide
- Requires actual user interaction — will not appear if user only views the page without clicking

---

### `browser.long_task.duration`

**Emitted by:** `LongTaskCollector` (automatic)
**Type:** metric
**Unit:** ms
**Browser support:** Chrome, Edge only

```
value: 199
estimatedFramesDropped: 11
browserAttribution: "unknown"
likelyCause: "ExpensiveComponent" | null
sourceConfidence: "inferred" | "unknown"
```

**Ambiguities:**
- `likelyCause` is inferred by correlating long task timestamps with the render timeline. It is labelled `sourceConfidence: "inferred"` — not measured.
- `likelyCause: null` means the blocking happened in non-React code (event handler, setTimeout, third-party script) — not a bug, an honest answer.
- `browserAttribution` is almost always `"unknown"` — the browser rarely provides useful attribution data.

---

### `browser.memory.heap_used`

**Emitted by:** `MemoryCollector` (automatic, every 30 seconds)
**Type:** metric
**Unit:** bytes
**Browser support:** Chrome, Edge only

```
value: 15728640        ← bytes
heapUsedMb: 15
heapTotalMb: 24
heapLimitMb: 2048
heapUsagePercent: 0.7
precision: "approximate"
trigger: "interval" | "page-hide"
tabVisible: true
```

**Ambiguities:**
- All values labelled `precision: "approximate"` — the garbage collector may not have run, so memory may appear higher than actual live objects
- Returns zero in some browser configurations due to cross-origin isolation restrictions — these samples are suppressed
- Paused when tab is not visible

---

### `resource.load.duration`

**Emitted by:** `ResourceTimingCollector` (opt-in — disabled by default)
**Type:** metric
**Unit:** ms
**Browser support:** All modern browsers — Chrome, Edge, Firefox, Safari all support the `"resource"` PerformanceObserver entry type.

```
url: "/static/js/main.[hash].chunk.js"
resourceType: "script"
transferSizeBytes: 45230
decodedSizeBytes: 180920
cacheHit: false
crossOrigin: false
compressionRatio: 4.0
sizeAvailable: true
```

**Requires developer action:**
Must be explicitly enabled in config:
```json
{ "signals": { "resourceTiming": true } }
```

**Ambiguities:**
- Cross-origin resources show `sizeAvailable: false` and null sizes — browser security restriction
- `cacheHit: true` when `transferSize === 0` — the asset was served from browser cache
- Content hashes are stripped from URLs for consistent naming across deploys: `main.a3f9d2.chunk.js` → `main.[hash].chunk.js`

---

### `custom.event`

**Emitted by:** `useTrackEvent()` or `telemetry.track()`
**Type:** log

```
eventName: "checkout:completed"
plan: "pro"
amount: 99
```

**Requires developer action:**
- Must be called explicitly at business-significant moments
- Properties are developer-defined — any key/value pairs up to 4KB

**Ambiguities:**
- Properties are never inspected or filtered by the package — do not include PII (names, emails, user IDs)
- Use anonymised identifiers instead of real user data

---

## Not implemented — blocked by React internals

These `MetricName` entries exist in the type system for future compatibility
but emit nothing in v1.0.0. They are blocked by React not exposing public APIs.

| Signal | Blocked by |
|---|---|
| `react.render.interrupted` | React concurrent scheduler has no public hook |
| `interaction.dead_click` | Detecting elements without React handlers requires fiber tree access |
| `suspense.duration` | No public Suspense fallback lifecycle event |
| `react.error_boundary.fallback_shown` | No public ErrorBoundary state observer |
| `react.error_boundary.retried` | No public ErrorBoundary state observer |
| `react.error_boundary.fallback_dismissed` | No public ErrorBoundary state observer |

---

## Consolidated — data exists, no separate event needed

These were originally planned as separate events but the data is already
captured on existing events. No separate metric is emitted.

### render count
`react.render.count` does not exist as a standalone event.
Query `attributes.renderCount` on `react.render.duration` instead.

```
# In your OTel backend — components that re-render more than 10 times per session:
react.render.duration | where attributes.renderCount > 10 | by attributes.component
```

### network quality
`network.quality_changed` does not exist as a standalone event.
Network quality is captured as context on **every event** — not just when it changes.

**Important caveats before querying this data:**
- `network.type`, `network.downlink`, and `network.rtt` are only available in Chrome and Edge. Firefox and Safari return `"unknown"` for type and `null` for downlink/rtt — approximately 30-40% of real users.
- Values are browser **estimates** based on recent latency measurements — not the actual physical connection type. A 4G user with poor signal may be classified as `"2g"`.
- Always filter out `"unknown"` before drawing conclusions.

```
# Correct — filter unknown and note Chrome/Edge only
react.render.duration
  | where network.type != "unknown"
  | where network.type in ("2g", "slow-2g")
  | summarize avg(duration) by attributes.component
```

Fields available on every event (Chrome/Edge only, null/unknown elsewhere):
- `network.type` — effectiveType estimate: `"4g"`, `"3g"`, `"2g"`, `"slow-2g"`, `"unknown"`
- `network.downlink` — estimated bandwidth in Mbps, null if unavailable
- `network.rtt` — estimated round trip time in ms, null if unavailable
- `network.saveData` — user has data saver enabled, false if unavailable

Fields available on every event (all browsers):
- `network.online` — whether the browser believes it has connectivity

---

## Scenarios requiring developer action for accurate tracking

### 1. Component render tracking
Add `useTraceRender('ComponentName')` to every component you want measured. The package cannot auto-instrument React components without a compiler transform.

### 2. Interaction tracking
Add `useTrackInteraction('element-name')` and attach returned handlers to your elements. Automatic rage click detection requires no action but benefits from `data-testid` attributes for stable identification.

### 3. Route change tracking
Call `useRouteTrace()` inside a component that re-renders on navigation. With React Router 6, call alongside `useLocation()`. Without this, no route changes are tracked.

### 4. Custom business events
Call `useTrackEvent()` and invoke the returned function at business-significant moments — checkout completed, onboarding finished, feature used. The package cannot infer business semantics automatically.

### 5. Error boundary integration
If using a third-party error boundary library, wire its `onError` callback to `useTrackEvent()` to capture React tree errors.

### 6. Production configuration
Set `exporter.type: "otlp"` and `exporter.url` in your production config file. Without this, data only appears in the browser console and is never sent anywhere.

### 7. Build ID
Set `REACT_APP_BUILD_ID` (or `VITE_BUILD_ID`) to your git commit hash in CI. Without it, you cannot correlate performance regressions with specific deployments.

### 8. Component names in production
Always pass an explicit string to `useTraceRender('MyComponent')`. Minification removes JavaScript function names — without an explicit string, components appear as `'Unknown'` in your dashboard.

---

## Privacy defaults

| Behaviour | Default | Config |
|---|---|---|
| URL query params stripped | ✅ Yes | `privacy.stripQueryParams` |
| Numeric IDs in paths replaced | ✅ Yes | Always on |
| Do Not Track respected | ✅ Yes | `privacy.respectDoNotTrack` — note: Safari deprecated `navigator.doNotTrack` in version 17.4. Users on Safari 17.4+ who have DNT enabled in browser settings may not be recognised. |
| Input values recorded | ❌ Never | Not configurable — by design |
| Raw user agent transmitted | ❌ Never | Parsed to structured fields |
| Custom event properties filtered | ❌ Never | Developer responsibility |

---

© 2026 Abhishek Sinha (sinha@live.in) — Apache 2.0
