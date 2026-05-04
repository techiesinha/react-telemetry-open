# Signals Overview

Copyright 2026 Abhishek Sinha (sinha@live.in) — Apache 2.0

---

## What is a signal?

Every piece of data react-telemetry-open captures is called a signal. There are three kinds:

**Metric** — a number measured over time. You plot it on a graph. You can average it, find peaks, and alert when it crosses a threshold. Use metrics to answer "how much" and "is it getting worse".

**Log** — a discrete event that happened at a point in time. It has a message, a timestamp, and structured fields. You search and filter logs. Use logs to answer "what happened" and "what were the exact details".

**Span** — a unit of work with a start time and end time. It measures how long an operation took. Use spans to answer "where did the time go" and "which step was slow".

These three types map to the three OTLP endpoints your collector receives:

```
/v1/metrics  ← all Metric signals
/v1/traces   ← all Span signals  
/v1/logs     ← all Log signals
```

---

## All signals at a glance

### React Runtime

| Signal | Type | Hook required | Browser |
|---|---|---|---|
| `react.render.duration` | Metric | `useTraceRender` | All |
| `react.error` | Log | None — automatic | All |

### User Experience

| Signal | Type | Hook required | Browser |
|---|---|---|---|
| `interaction.rage_click` | Log | None — automatic on interactive elements | All |
| `interaction.click` | Log | `useTrackInteraction` | All |
| `interaction.input` | Log | `useTrackInteraction` | All |
| `interaction.time_to_first` | Metric | None — automatic | All |
| `custom.event` | Log | `useTrackEvent` | All |

### Core Web Vitals

| Signal | Type | Hook required | Browser |
|---|---|---|---|
| `web_vital.fcp` | Metric | None — automatic | All |
| `web_vital.lcp` | Metric | None — automatic | Chrome/Edge |
| `web_vital.fid` | Metric | None — automatic | Chrome/Edge |
| `web_vital.cls` | Metric | None — automatic | Chrome/Edge |
| `web_vital.inp` | Metric | None — automatic | Chrome/Edge |

### Navigation

| Signal | Type | Hook required | Browser |
|---|---|---|---|
| `route.change` | Span | `useRouteTrace` | All |

### Network

| Signal | Type | Hook required | Browser |
|---|---|---|---|
| `network.fetch` | Span | None — automatic | All |
| `network.xhr` | Span | None — automatic | All |
| `network.error_rate` | Metric | None — automatic | All |
| `network.online` | Log | None — automatic | All |
| `network.offline` | Log | None — automatic | All |

### Browser Health

| Signal | Type | Hook required | Browser |
|---|---|---|---|
| `browser.long_task.duration` | Metric | None — automatic | Chrome/Edge |
| `browser.memory.heap_used` | Metric | None — automatic | Chrome/Edge |
| `resource.load.duration` | Metric | None — automatic | All |

### Errors

| Signal | Type | Hook required | Browser |
|---|---|---|---|
| `js.error` | Log | None — automatic | All |
| `js.unhandled_rejection` | Log | None — automatic | All |

---

## Context on every signal

Every signal — regardless of type — carries this context automatically:

| Field | Example | Description |
|---|---|---|
| `app.name` | `my-app` | From config |
| `app.version` | `2.1.0` | From config |
| `app.environment` | `production` | From config |
| `session.id` | `550e8400-...` | Anonymous, per session |
| `page.url` | `/dashboard` | Current path, query params stripped |
| `device.type` | `desktop` | desktop, mobile, or tablet |
| `browser.name` | `Chrome` | Parsed from user agent |
| `browser.version` | `124` | Major version only |
| `os.name` | `macOS` | Operating system |
| `network.type` | `4g` | Connection type |
| `react.version` | `18.3.0` | React version in use |

---

## What we do not capture

Scroll depth, hover duration, text selection, copy/paste, keyboard shortcuts, drag and drop, focus and blur, video playback, touch gestures, and mouse movement.

All of these can be tracked manually using `useTrackEvent`:

```tsx
const track = useTrackEvent()

useEffect(() => {
  const onScroll = () => {
    const depth = Math.round((window.scrollY / document.body.scrollHeight) * 100)
    track('user.scroll_depth', { depth, page: location.pathname })
  }
  window.addEventListener('scroll', onScroll, { passive: true })
  return () => window.removeEventListener('scroll', onScroll)
}, [])
```

---

## Known limitations

**Rage click on non-interactive elements:** Only detected on elements that are inherently interactive (`button`, `a`, `input` etc) or have `role="button"`, `tabindex`, or `onclick`. A custom clickable `<div>` with none of these will not trigger rage click detection. Add `role="button"` to fix this.

**Rage click during a frozen screen:** When the main thread is blocked by a long task, click events queue up and fire all at once when the thread unblocks — appearing as a rage click caused by the freeze, not the element. Cross-reference with `browser.long_task.duration` to distinguish. Clicks on non-interactive areas during a freeze are invisible entirely.

**Web Vitals browser support:** LCP, FID, CLS, and INP are Chrome and Edge only. Firefox exposes FCP only. Safari exposes FCP from version 15.4 onwards.

**Memory and long tasks:** `browser.memory.heap_used` and `browser.long_task.duration` are Chrome and Edge only.

**Render reason tracking:** `changedProps` is only present when you explicitly pass props to `useTraceRender`. Without props, render count and duration are tracked but not the cause.

---

For signal-by-signal details including attributes, thresholds, and Grafana queries see [Signals Reference](./reference.md).

For guidance on interpreting your data and knowing what to act on see [Interpreting Your Data](../guides/interpreting-your-data.md).
