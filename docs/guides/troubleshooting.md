# Troubleshooting

Copyright 2026 Abhishek Sinha (sinha@live.in) — Apache 2.0

---

## No data in DevTools console

**Check 1 — Is `debug: true` in config?**

Data only appears in the console when `debug: true`. Add to `telemetry.config.json`:
```json
{ "debug": true }
```

**Check 2 — Is TelemetryProvider mounted?**

Open React DevTools and confirm `TelemetryProvider` appears in the component tree.

**Check 3 — Are all signals disabled?**

Check `telemetry.config.json`. If all signals are `false`, no data is collected.

---

## No data in your observability dashboard

**Check 1 — Is exporter type set to `otlp`?**

Console exporter does not send data to your backend. Check `telemetry.config.prod.json`:
```json
{ "exporter": { "type": "otlp" } }
```

**Check 2 — Is the Collector URL correct?**

Enable debug mode temporarily and check the console for export failure messages.
Look for `[react-telemetry-open] Export failed` or circuit breaker warnings in the console.

**Check 3 — Is a CSP header blocking the export?**

Open DevTools Network tab. Look for a failed POST request to your Collector URL.
If blocked, add to your Content-Security-Policy:
```
connect-src 'self' https://your-collector.example.com;
```

**Check 4 — Is an ad blocker blocking the request?**

Try with ad blockers disabled. If that fixes it, configure a first-party
Collector endpoint on your own domain (e.g. `telemetry.yourapp.com`).

**Check 5 — Is your observability backend data source configured correctly?**

Check that your observability backend data source is pointing to the same backend your
Collector is writing to.

---

## Events appear duplicated

**Cause — TelemetryProvider unmounts and remounts.**

If TelemetryProvider is inside a route, it unmounts on navigation and remounts,
starting a new session. Move TelemetryProvider to the app root, outside all routing.

**Cause — React StrictMode.**

StrictMode intentionally double-invokes effects in development. react-telemetry-open
suppresses StrictMode double renders. If you see exact duplicates in production,
TelemetryProvider is likely mounted twice in the component tree.

---

## Component names show as "Unknown" in your dashboard

**Cause — Minification removes component names in production builds.**

Always pass an explicit string to `useTraceRender`:
```tsx
// Wrong in production
useTraceRender()

// Correct — explicit string survives minification
useTraceRender('UserDashboard')
```

---

## `useRouteTrace` not tracking navigation

**Check 1 — Is `signals.routes` enabled?**

```json
{ "signals": { "routes": true } }
```

**Check 2 — Is a compatible router present?**

`useRouteTrace` requires React Router 6 or Next.js. Enable debug mode and
check for: `[react-telemetry-open] useRouteTrace(): no compatible router detected`.

**Check 3 — Is `useRouteTrace` called inside the Router?**

The hook must be called inside `<BrowserRouter>` or the Next.js app structure.

---

## Memory data not appearing

Memory tracking uses `performance.memory` which is Chrome and Edge only.
Firefox and Safari do not expose this API. This is a browser limitation — not a bug.

---

## TypeScript errors on import

Ensure you are on TypeScript 4.7+ with `moduleResolution: bundler` or
`moduleResolution: node16` in `tsconfig.json`. This is required for
subpath exports to resolve correctly.

---

## Export stops after a period of offline use

This is the circuit breaker working correctly. After 5 consecutive failures
(e.g. during a network outage), exports are paused for 60 seconds. When the
network recovers, the circuit resets and exports resume automatically.

Queued events are sent once the circuit closes. Events beyond `maxQueueSize`
(500 by default) are dropped — oldest first. This is expected behaviour for
an observability tool — we never grow the queue unboundedly.

---

## Very high event volume from one component

One component generating excessive events typically means:

- A render loop — component re-renders continuously
- Missing `ignore.components` config for a high-frequency utility component
- Missing `useTraceRender` name causing all events to group as "Unknown"

To identify the culprit, enable debug mode and watch the console for
`react.render.duration` events. The `component` attribute shows the source.

Then either:
- Fix the render loop in your application code
- Add the component to `ignore.components` in config if it's intentionally high-frequency

---

## App crashes after installing react-telemetry-open

This should not happen — react-telemetry-open is designed to never crash your app.
If you encounter a crash:

1. Enable debug mode to get more information
2. Check if the crash occurs with TelemetryProvider removed — if yes, the issue is elsewhere
3. Check browser console for any `[react-telemetry-open]` error messages
4. Open an issue with the full error stack trace

---

© 2026 Abhishek Sinha. Licensed under Apache 2.0.
