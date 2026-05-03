# react-telemetry-open — Feature List

Copyright 2026 Abhishek Sinha (sinha@live.in) — Apache 2.0

---

## Signals collected

### Render tracking (via `useTraceRender`)

- Component render count per session (as attribute on `react.render.duration`)
- Component render duration in milliseconds
- First render vs re-render distinction
- StrictMode double render suppression — only the real render is recorded
- Render timeline maintained for long task source attribution

### Interaction tracking (via `useTrackInteraction` + automatic)

- Click, focus, blur, and input interactions (explicit via hook)
- Input change events with configurable debounce
- Rage click detection — 3+ clicks on same element within 500ms sliding window
- Dead click detection — clicks on elements with no React handler
- Time to first interaction per session
- Rage click threshold and window fully configurable

### Route tracking (via `useRouteTrace`)

- Navigation duration from click to render completion
- Route pattern extraction (React Router 6, Next.js Pages Router, Next.js App Router)
- From-route and to-route on every navigation
- Page view count per session incremented on every route change

### Error tracking (automatic via `ErrorCollector`)

- Synchronous JavaScript errors via `window.addEventListener('error')`
- Unhandled Promise rejections via `window.addEventListener('unhandledrejection')`
- React ErrorBoundary catches with full React component stack
- Cross-origin script error filtering — no useless "Script error." events
- Consecutive identical error deduplication — every 5th occurrence emitted
- Protection against tracking own export errors (feedback loop prevention)

### Network tracking (automatic via `NetworkCollector`)

- fetch() call timing, HTTP status, URL (sanitised), method
- XMLHttpRequest call timing, HTTP status, URL (sanitised), method
- API error rate as a rolling 60-second metric
- Response size from Content-Length header
- Network connectivity changes — online/offline events
- Connection quality changes — effectiveType, downlink, RTT
- Collector URL automatically excluded from tracking (no infinite loop)

### Memory tracking (automatic via `MemoryCollector`, Chrome/Edge only)

- JavaScript heap used in bytes and MB
- JavaScript heap total and limit
- Heap usage percentage — normalised across device memory sizes
- Sampling every 30 seconds + on page hide
- Paused when tab is not visible
- Zero values detected and suppressed (cross-origin isolation restriction)
- All values labelled as approximate — GC timing uncertainty disclosed

### Long task tracking (automatic via `LongTaskCollector`, Chrome/Edge only)

- Main thread blocking tasks exceeding 50ms
- Estimated frames dropped per long task
- Inferred source component from render timeline correlation (clearly labelled as inferred)
- Wall clock timestamp via `performance.timeOrigin + entry.startTime`

### Core Web Vitals (automatic via `WebVitalsCollector`)

- FCP — First Contentful Paint (all modern browsers)
- LCP — Largest Contentful Paint (Chrome/Edge, emitted on page hide)
- FID — First Input Delay (Chrome/Edge)
- CLS — Cumulative Layout Shift (Chrome/Edge, input-triggered shifts excluded)
- INP — Interaction to Next Paint (Chrome 96+, emitted on page hide)
- Good / Needs Improvement / Poor rating per metric

### Resource timing (automatic via `ResourceTimingCollector`, optional)

- Asset load duration — JS bundles, CSS, images, fonts, third-party scripts
- Cache hit rate — `transferSize === 0` indicates browser cache hit
- Content hash stripping for consistent bundle naming across deploys
- Cross-origin resources labelled with `sizeAvailable: false`
- Minimum size threshold (10KB default) to filter noise
- fetch() and XHR excluded — tracked separately by NetworkCollector

### Custom events (via `useTrackEvent` and `telemetry.track()`)

- Manual business event tracking with typed properties
- Properties size validated — default 4KB limit to prevent main thread blocking
- Available outside React via singleton `telemetry.track()`
- Namespace convention enforced in documentation: `feature:action`

---

## Context on every event

Every event carries:

- `app.name`, `app.version`, `app.environment`, `app.buildId`
- `session.id` (anonymous UUID), `session.duration`, `session.pageViews`
- `route` (URL pattern, never raw URL — IDs replaced with `:id`)
- `device.type` (mobile/tablet/desktop), `device.memory`, `device.cpuCores`, `device.viewport`, `device.dpr`
- `browser.name`, `browser.version`, `browser.engine`, `browser.language`
- `os.name`, `os.version`
- `network.type`, `network.downlink`, `network.rtt`, `network.saveData`, `network.online`
- `react.version`, `react.mode`
- `deployment.packageVersion`, `deployment.collectorEndpoint`

---

## Export destinations

- Console exporter — DevTools console, development use
- OTLP/HTTP exporter — any OTel-compatible backend
- Any OTel-compatible observability backend (self-hosted or managed)
- Self-hosted OTel Collector
- Any OTLP-compatible backend via an OTel Collector

---

## Configuration

- Zero config — works immediately with all defaults
- `telemetry.config.json` — base configuration file
- `telemetry.config.{env}.json` — environment-specific override files
- `$VAR_NAME` syntax — environment variable resolution for secrets
- `TelemetryProvider config` prop — highest priority inline override
- Per-signal enable/disable — disabled signals have zero footprint
- Configurable sampling rate with error bypass (errors always recorded)
- Configurable batch size and flush interval
- Privacy controls — query param stripping, Do Not Track
- Component and URL ignore lists
- Configurable rage click detection parameters
- Startup validation report in development mode

---

## Developer experience

- `npx react-telemetry-open init` — interactive CLI setup in under 60 seconds
- TypeScript first — full type safety, autocomplete, compile-time errors
- JSON Schema for `telemetry.config.json` — VS Code IntelliSense support
- Verbose debug mode — see every event and export attempt in DevTools
- Clear locale-driven error messages for every misconfiguration
- Startup validation report in development
- `TelemetryTestProvider` for test environments — no network calls, no side effects

---

## Safety and reliability

- Never crashes the developer's app — all errors isolated and silently handled
- Null context check on every hook — silent no-op in production if outside Provider
- fetch wrapper always calls originalFetch even if our tracking code throws
- ErrorBoundary `componentDidCatch` wrapped in try-catch
- All browser API calls guarded — SSR safe (Next.js compatible)
- React StrictMode safe — double render deduplication
- React Concurrent Mode safe — no spans opened during render phase
- Exponential backoff with jitter on export failures (1s, 2s, 4s, 8s, 16s, max 30s)
- Circuit breaker — 5 failures trips, 60 second reset, half-open test
- Queue cap — oldest events dropped when queue reaches maxQueueSize
- sendBeacon on page unload — browser-guaranteed delivery
- Binary batch splitting on HTTP 413 responses — no data dropped for size
- Flush guard — prevents duplicate exports on concurrent unmount triggers
- Self-tracking prevention — Collector URL excluded from NetworkCollector
- TelemetryError class — prevents error tracking feedback loops
- Prototype pollution protection — Object.hasOwn() in config merge
- Circular JSON handling — safeStringify never throws
- Regex catastrophic backtracking prevention — all patterns escaped before use
- Maximum 100 listeners per Signal Bus event type
- Signal Bus listener snapshots — re-entrant emit cannot cause infinite loops
- isDestroyed flag — emits after destroy() are silently dropped
- Pre-boot buffer prioritises error events over other signals

---

## Performance

- Synchronous boot under 0.5ms total
- Hook volatile context capture under 0.005ms per render
- Pipeline runs in single `queueMicrotask` — N events = 1 microtask
- Zero re-renders caused by telemetry state changes
- fetch() overhead under 0.02ms per call
- Batch flush under 0.1ms synchronous work before async hand-off
- Optional gzip compression (Chrome/Edge) via CompressionStream
- Adaptive queue size based on device memory
- saveData flag support — 0.01 sampling + 60 second flush interval
- Thundering herd prevention — jitter on all flush timers

---

## Known limitations

- Not real-time — 6 to 30 second delay from event to your observability dashboard
- Memory tracking: Chrome and Edge only
- Long tasks: Chrome and Edge only
- Full Core Web Vitals: Chrome and Edge only (FCP available in all browsers)
- Component names require explicit strings in production (minification removes them)
- No session persistence across page reloads
- Context change frequency tracking: deferred to v2
- React Native: not supported
- React older than v18: not supported
- sendBeacon cannot include API key headers (workaround: backend proxy or unauthenticated Collector endpoint)
- Source maps not resolved — raw minified stacks emitted with `sourceMapRequired: true` label
- Clock skew between client and server affects absolute timestamp correlation

---

© 2026 Abhishek Sinha. Licensed under Apache 2.0.
