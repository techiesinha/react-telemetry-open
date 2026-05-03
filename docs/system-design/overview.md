# System Design Overview

Copyright 2026 Abhishek Sinha (sinha@live.in) — Apache 2.0

---

## The problem this package solves

Frontend observability tools in 2026 fall into two categories:

**Error tracking tools** are purpose-built for exception capture — React component render performance, concurrent mode behaviour, and component-level attribution are simply outside their design scope.

**Real User Monitoring (RUM) tools** measure browser-level performance metrics — page load timing, Core Web Vitals, and network requests. React-specific signals — unnecessary re-renders, Suspense fallback duration, component-attributed long tasks — emerge at a layer above what standard RUM tools instrument.

The gap: nobody tracks what React is actually doing. Unnecessary re-renders that cause jank. Concurrent mode interruptions that the user perceives as lag. Suspense boundaries that take 3 seconds to resolve. Context updates that cascade through 200 components.

react-telemetry-open fills this gap. It operates at the React layer — not the browser layer — and exports everything in standard OTLP format so it works with any backend.

---

## Design goals

**Zero vendor lock-in.** OTLP output means the data goes wherever the developer wants — any OTel-compatible backend, self-hosted or managed. No proprietary SDK. No account required to get started.

**Zero boilerplate to start.** Wrap the app in `TelemetryProvider` and open DevTools. Data appears immediately. No config file required.

**Never crash the developer's app.** Every piece of our code is wrapped in protection. Our telemetry failing must be completely invisible to users.

**No main thread blocking.** Volatile context is captured synchronously in under 0.005ms. All processing happens in a microtask. All network I/O is async. The developer's app is never slowed down by observability.

**React-native signals.** The package understands React's rendering model — StrictMode doubles, concurrent mode, Suspense, ErrorBoundaries, hooks. It uses this understanding to produce signals no generic browser tool can produce.

---

## Architecture — nine layers

```
┌─────────────────────────────────────────────┐
│           Developer's React App              │
├──────────────┬──────────────────────────────┤
│ Hook-based   │ Automatic                    │
│ Signals      │ Collectors                   │
│ useTraceRender    NetworkCollector           │
│ useTrackInteract  ErrorCollector             │
│ useRouteTrace     LongTaskCollector          │
│ useTrackEvent     WebVitalsCollector         │
│               MemoryCollector                │
│               RageClickCollector             │
│               ResourceTimingCollector        │
├──────────────┴──────────────────────────────┤
│              Signal Bus                      │
│  (pre-boot buffer, listener isolation)       │
├─────────────────────────────────────────────┤
│              Pipeline                        │
│  Enrich → Sample → Filter → Batch           │
├─────────────────────────────────────────────┤
│          Exporter Manager                    │
│  (circuit breaker, retry, flush)            │
├─────────────┬───────────────────────────────┤
│  Console    │  OTLP Exporter               │
│  Exporter   │  (otelAdapter — only OTel    │
│             │   import in entire codebase)  │
└─────────────┴───────────────────────────────┘
```

---

## Why these nine layers

**Separation of concerns** — each layer has exactly one responsibility and knows nothing about other layers except through defined interfaces.

**Signal Bus decoupling** — hooks and collectors post events to the bus. The Pipeline reads from the bus. They never reference each other directly. Adding a new collector requires zero changes to the Pipeline. Adding a new consumer requires zero changes to any hook.

**OTel isolation** — the OTel SDK is an optional peer dependency. If developer does not install it, the package still works. This is only possible because the OTel SDK is isolated to a single file (`src/exporters/otlp/otelAdapter.ts`). Every other file in the codebase is completely ignorant of OTel.

**Config resolution at the boundary** — Config Manager runs once at boot and produces a frozen `ResolvedConfig` object. Every other layer reads from this frozen object. No layer ever checks `if (config.someField)` — all fields are always present with valid values. This eliminates an entire class of null-check bugs.

---

## The pipeline event flow

```
Hook fires (synchronous)
  → volatile context captured (timestamp, route, sessionId) in < 0.005ms
  → event emitted to Signal Bus

Signal Bus (synchronous)
  → pre-boot buffer if Pipeline not yet connected
  → dispatches to all listeners

Pipeline (single queueMicrotask)
  → Stage 1: Enrich — attach stable context (device, browser, OS)
  → Stage 2: Sample — probabilistic drop based on sampling rate
              (errors always pass through — never sampled)
  → Stage 3: Filter — drop ignored components and URLs
  → Stage 4: Batch — accumulate until size or timer threshold

ExporterManager (async)
  → Routes to all configured exporters in parallel
  → Exponential backoff with jitter on failure
  → Circuit breaker after 5 consecutive failures
  → Binary batch split on HTTP 413
  → sendBeacon on page unload

OTel Adapter
  → Converts internal event format to OTLP/HTTP JSON
  → Timestamps converted: ms × 1,000,000 → nanoseconds
  → Metrics → gauge data points
  → Spans → trace spans with traceId/spanId
  → Logs → log records with severity mapping
```

---

## Key decisions and why

**useRef for mutable state, Context for stable refs only.**
If we stored render counts in React state, every increment would cause a re-render.
We use `useRef` for all mutable data. React Context only holds immutable references
(the Signal Bus, frozen config, session ID). This guarantees zero re-renders from
telemetry.

**Single queueMicrotask processes all pending events.**
Naively, each event would schedule its own microtask. Under high event frequency,
this floods the microtask queue and delays React rendering. A single microtask
drains all pending events and yields — React gets control back promptly.

**Pre-boot buffer with error priority.**
There is a window between TelemetryProvider mounting and the Pipeline connecting
(after `useEffect` fires). Events during this window go to a buffer. The buffer
prioritises error events — if it fills up, oldest non-error events are dropped
before errors.

**Config is frozen.**
`Object.freeze(resolvedConfig)` prevents any layer from mutating config at runtime.
This eliminates the subtle bug where `saveData` detection was implemented by mutating
`config.sampling.rate`. Instead, the effective sampling rate is derived in the Pipeline
without touching the frozen config.

**ErrorCollector initialises before children render.**
All other collectors initialise in `useEffect` (after first paint). ErrorCollector
is different — errors during the very first render would be missed if we waited
for `useEffect`. It initialises synchronously in the TelemetryProvider render function
using a `useRef` flag to prevent StrictMode double-invocation.

---

## What we explicitly do not do

**Source map resolution.** We emit raw minified stack traces with a `sourceMapRequired: true`
label. Source map resolution requires either a server-side service or making source maps
public — both with security implications. We document the requirement and recommend
dedicated source map services your team already uses for this.

**Real-time delivery.** We batch events for efficiency. Minimum latency from event to
your dashboard is 6 seconds under ideal conditions. Typical is 10-30 seconds. We document
this prominently — we are not designed for sub-second alerting.

**Context change frequency tracking.** Detecting how often a React Context value changes
requires wrapping `createContext` or using a custom hook pattern that is complex and
has edge cases. Deferred to v2. In v1, unnecessary re-renders caused by context updates
are visible in render timing data.

**Session persistence across reloads.** Each page load is a new session. Using
`sessionStorage` for cross-reload persistence adds complexity with minimal benefit for
SPA use cases. Deferred to v2.

**React Native support.** React Native does not have `window`, `document`,
`PerformanceObserver`, or `navigator` in the same form. Supporting it would require
a separate implementation. Not in scope for v1.

---

## Not real-time — what this means

react-telemetry-open is a near-real-time observability tool. Events typically reach
your observability dashboard 10-30 seconds after occurring. The pipeline is:

```
Event occurs
  → captured immediately (synchronous)
  → queued in batch (up to 5 seconds wait)
  → exported via HTTP (340ms typical RTT)
  → Collector processes and stores (~200ms)
  → Observability backend ingests and makes data queryable (~5 seconds)
Total: 6-30 seconds
```

This is appropriate for trend analysis, performance monitoring, and error tracking.
It is not appropriate for live incident alerting within seconds.
For live alerting, configure an alert rule in your observability backend that triggers when error rate
exceeds a threshold over a time window.

---

## Further reading

- [Architecture Deep Dive](./architecture.md)
- [Data Model](./data-model.md)
- [Component Design](./component-design.md)
- [Scale and Edge Cases](./scale-and-edge-cases.md)
- [Algorithm Optimisations](../optimisations.md)

---

© 2026 Abhishek Sinha. Licensed under Apache 2.0.
