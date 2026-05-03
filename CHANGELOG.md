# Changelog

All notable changes to react-telemetry-open will be documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

---

## [1.0.0] — 2026-05-02

### Initial release

**Hooks:**
- `useTraceRender` — component render count and timing
- `useTrackInteraction` — click, focus, blur, input interactions
- `useRouteTrace` — route change and navigation timing
- `useTrackEvent` — custom business event tracking

**Automatic collectors:**
- `NetworkCollector` — fetch() and XHR timing, status codes, error rates
- `ErrorCollector` — JS errors, unhandled rejections, React ErrorBoundary catches
- `LongTaskCollector` — main thread blocking tasks (Chrome/Edge)
- `WebVitalsCollector` — FCP, LCP, FID, CLS, INP
- `MemoryCollector` — JavaScript heap usage (Chrome/Edge)
- `RageClickCollector` — rage clicks and dead clicks
- `ResourceTimingCollector` — asset load times and cache hit rates (opt-in)

**Exporters:**
- `ConsoleExporter` — DevTools console output for development
- `OtlpExporter` — OTLP/HTTP export to any OTel-compatible backend

**Configuration:**
- Zero config — works immediately with all defaults
- `telemetry.config.json` file-based configuration
- Multi-environment via base + override files
- Environment variable resolution via `$VAR_NAME` syntax
- `npx react-telemetry-open init` CLI setup command

**Safety:**
- Never crashes the developer's app — all errors isolated
- SSR safe — all browser APIs guarded
- React StrictMode safe — double render deduplication
- React Concurrent Mode safe
- Exponential backoff with jitter on export failures
- Circuit breaker after 5 consecutive failures
- Do Not Track browser setting honoured

**Performance:**
- Synchronous boot under 0.5ms
- Hook capture under 0.005ms per render
- Single queueMicrotask for N events — no microtask starvation
- Zero re-renders from telemetry state changes

**Privacy:**
- URL query params stripped by default
- Numeric IDs and UUIDs replaced in URL paths
- Raw user agent never transmitted
- Input values never recorded
- Do Not Track respected by default

---

© 2026 Abhishek Sinha (sinha@live.in) — Apache 2.0
