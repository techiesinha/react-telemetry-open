# Interpreting Your Data

Copyright 2026 Abhishek Sinha (sinha@live.in) — Apache 2.0

This guide explains what each signal means, what thresholds to care about, and what action to take. Data without interpretation is just noise.

---

## The three questions to ask every day

**Is something broken right now?** Look at errors and error rate first.

**Is something slow?** Look at render duration, LCP, and long tasks.

**Are users frustrated?** Look at rage clicks and time to first interaction.

Everything else is trend analysis and product insight — useful, but not urgent.

---

## Signal categories

---

### React Runtime

#### `react.render.duration` — Metric

**What it is:** How long a single React component render takes, in milliseconds. Emitted on every render of any component instrumented with `useTraceRender`.

**What the attributes tell you:**

`component` — which component rendered. This is the most important field. Without it, slow renders are invisible.

`renderCount` — how many times this component has rendered in the current session. A component rendering 50 times when you expect 5 is a problem worth investigating.

`priority` — `urgent` (above 16.67ms, drops a frame at 60fps) or `deferred` (below 16.67ms, acceptable).

`changedProps` — which props changed to trigger this render. Only present when you pass props to `useTraceRender`. This tells you the root cause — not just that a render happened, but why.

**Thresholds:**

| Duration | Meaning |
|---|---|
| Under 5ms | Excellent |
| 5–16.67ms | Acceptable |
| 16.67–50ms | Drops frames — investigate |
| Above 50ms | Users feel lag — fix urgently |

**What to do when it is slow:**

Check `changedProps`. If the same props are changing on every render without the user doing anything, a parent component is re-rendering and passing new object or array references on every render. Memoize those values with `useMemo` or `useCallback`.

If `renderCount` is high relative to user interactions, the component is re-rendering unnecessarily. Look for context consumers that trigger when unrelated context values change.

**What we cannot tell you:** Why the render was slow internally — whether it was expensive JSX, a complex calculation, or a slow third-party component. Use the React DevTools Profiler for that level of detail.

---

#### `react.error` — Log

**What it is:** A React render-phase crash caught by an ErrorBoundary. Includes the error message, stack trace, and `componentStack` showing the component tree at the time of the crash.

**What to do:** Any occurrence is urgent. Check `componentStack` to identify which component caused the crash. Check `message` to understand what went wrong.

**What we cannot tell you:** Errors outside the render phase — async errors in event handlers, for example — appear as `js.error` not `react.error`.

---

### User Experience

#### `interaction.rage_click` — Log

**What it is:** A user clicked the same element 3 or more times within 500ms. This is a frustration signal — the user expected something to happen and it did not.

**What the attributes tell you:**

`element` — which element was rage clicked. Element identity is determined by priority: `data-testid` → `id` → `aria-label` → tag + class + visible text. Add `data-testid` to interactive elements for the clearest attribution.

`clickCount` — how many clicks in the burst.

`burstDurationMs` — how long the burst lasted.

`elementType` — the HTML tag of the element (`button`, `a`, `input` etc).

**Which elements are monitored:**

Rage click detection covers any element that is inherently interactive or explicitly marked as interactive:

By HTML tag — `button`, `a`, `input`, `select`, `textarea`, `label`, `summary`

By ARIA role — `button`, `link`, `tab`, `menuitem`, `option`, `combobox`, `listbox`, `textbox`, `searchbox`

By attribute — any element with `tabindex` or `onclick`

Clicks on child elements (an icon or `<span>` inside a button) are correctly attributed to the interactive parent — not the child.

**What is NOT monitored:**

A custom clickable `<div>` or `<span>` with no role, no tabindex, and no onclick — for example:

```html
<!-- This div will NOT trigger rage click detection -->
<div class="card" style="cursor:pointer" onClick={handleClick}>
  Click me
</div>
```

To fix this, add `role="button"` or `tabindex="0"`:

```html
<!-- Now rage clicks are detected -->
<div class="card" role="button" tabindex="0" onClick={handleClick}>
  Click me
</div>
```

This is the most common reason rage clicks appear to be missing for a known frustrating element.

**What to do when rage clicks appear:**

Find the element in your UI. Ask: does it give visual feedback when clicked? Is it a link that navigates slowly? Is it disabled without explanation? Is it below the fold where users do not see a response?

The fix is almost always one of: faster response, clearer loading state, or better visual feedback.

**Element identity note:** If you see `button.btn[text="Submit"]` and have many submit buttons, add a unique `data-testid` to each so you can distinguish between them.

**Frozen screen rage clicks — important limitation:**

When the main thread is frozen (a long task is running), the browser cannot process click events. Events queue up. When the thread unblocks, all queued events fire in rapid succession — which our collector detects as a rage click.

This means some rage clicks are not caused by a bad UI element — they are caused by a frozen screen. The user was clicking anywhere trying to get a response, not specifically frustrated with one button.

How to distinguish: check `browser.long_task.duration` around the same timestamp as the rage click. If a long task overlaps with the rage click, the freeze caused it — fix the long task, not the button.

Additionally — if the user clicks a frozen area with no interactive element (a paragraph, an empty section of the page), the clicks are not detected at all because there is no interactive ancestor to attribute them to. This is a known limitation — frozen-screen frustration on non-interactive areas is invisible to the collector.

---

#### `interaction.time_to_first` — Metric

**What it is:** How many milliseconds elapsed from page load until the user's first click anywhere on the page.

**What it tells you:** How quickly users engage with your content.

**Thresholds:**

| Time | Meaning |
|---|---|
| Under 3s | Users engaged immediately |
| 3–10s | Normal browsing behaviour |
| Above 10s | Users may be reading, confused, or waiting for something to load |

**What to do:** High values are not always bad — a documentation page may have long read times before interaction. Compare across different pages. If a conversion-critical page has high time-to-first, consider whether something is blocking the call to action.

---

#### `interaction.click` and `interaction.input` — Log

**What they are:** Click and input events on elements you have specifically instrumented with `useTrackInteraction`.

**What they tell you:** User funnel data. Which buttons are clicked, which inputs are filled, in what order.

**What to do:** Use these for funnel analysis — how many users clicked Step 1, how many reached Step 2, where did they drop off. They require deliberate instrumentation — they do not fire automatically on all elements.

---

#### `custom.event` — Log

**What it is:** Any business event you track with `useTrackEvent`. The shape is entirely defined by you.

**Common uses:** Checkout step completion, feature usage, onboarding progress, A/B test exposure, plan upgrades.

**What to do:** Design event names as `category:action` — `checkout:payment_submitted`, `onboarding:step3_completed`, `feature:export_clicked`. This makes filtering in Grafana straightforward.

---

### Core Web Vitals

These are Google's standard metrics for page experience. They directly influence SEO ranking.

#### `web_vital.fcp` — First Contentful Paint — Metric

**What it is:** Time until the browser renders the first bit of content — text, image, or canvas. Available in all browsers.

| Rating | Threshold |
|---|---|
| Good | Under 1800ms |
| Needs improvement | 1800–3000ms |
| Poor | Above 3000ms |

**What causes poor FCP:** Render-blocking CSS or JavaScript, slow server response, large HTML payload.

---

#### `web_vital.lcp` — Largest Contentful Paint — Metric

**What it is:** Time until the largest visible element in the viewport is fully rendered. Chrome and Edge only. Only emits when the tab loses focus — switch tabs after loading to trigger it.

| Rating | Threshold |
|---|---|
| Good | Under 2500ms |
| Needs improvement | 2500–4000ms |
| Poor | Above 4000ms |

**What causes poor LCP:** Large unoptimised images, slow fonts, render-blocking resources, slow API calls that delay content.

---

#### `web_vital.fid` — First Input Delay — Metric

**What it is:** Delay between the user's first keyboard or mouse interaction and the browser's response. Chrome and Edge only. Only fires on the first keyboard interaction — press a key before clicking to trigger it.

| Rating | Threshold |
|---|---|
| Good | Under 100ms |
| Needs improvement | 100–300ms |
| Poor | Above 300ms |

**What causes poor FID:** Heavy JavaScript execution on the main thread blocking response to input.

---

#### `web_vital.cls` — Cumulative Layout Shift — Metric

**What it is:** How much the page layout shifts unexpectedly during loading. A score, not a duration. Chrome and Edge only. Only emits on tab switch.

| Rating | Threshold |
|---|---|
| Good | Under 0.1 |
| Needs improvement | 0.1–0.25 |
| Poor | Above 0.25 |

**What causes poor CLS:** Images or ads without explicit dimensions, dynamically injected content above existing content, web fonts causing text reflow.

---

#### `web_vital.inp` — Interaction to Next Paint — Metric

**What it is:** The worst interaction delay across the entire session — how long between any user interaction and the next visible update. Chrome and Edge only.

| Rating | Threshold |
|---|---|
| Good | Under 200ms |
| Needs improvement | 200–500ms |
| Poor | Above 500ms |

**What causes poor INP:** Heavy event handlers, long tasks running during interaction, excessive DOM size.

---

### Network

#### `network.fetch` and `network.xhr` — Span

**What they are:** Every HTTP request made by your app — fetch() calls and XMLHttpRequests — with URL, method, HTTP status, duration, and whether it succeeded.

**What the attributes tell you:**

`url` — the sanitised URL. Query params are stripped, numeric IDs replaced with `:id`. You see `/api/users/:id` not `/api/users/12345`.

`method` — GET, POST, PUT, DELETE etc.

`status` — HTTP status code. 0 means a network error (offline, CORS, timeout).

`ok` — boolean. False for any non-2xx status or network error.

`duration` — total round trip time in milliseconds.

**What to do:** Filter by `ok=false` to find failing requests. Sort by `duration` to find your slowest API calls. A `/api/users/:id` call that sometimes takes 3000ms is worth investigating at the server level.

---

#### `network.error_rate` — Metric

**What it is:** The ratio of failed requests in a 60-second rolling window. 0.05 means 5% of requests failed.

**Thresholds:**

| Rate | Meaning |
|---|---|
| 0 | All requests succeeding |
| 0.01–0.05 | Acceptable — some transient failures |
| Above 0.05 | Investigate — API or connectivity issue |
| Above 0.2 | Urgent — widespread failure |

**What to do:** A sudden spike in error rate following a deploy almost always means the deploy broke something. Roll back or fix forward immediately.

---

#### `network.online` and `network.offline` — Log

**What they are:** Events fired when the browser detects connectivity changes.

**What to do:** If users are frequently going offline during your app, consider whether your app handles offline gracefully — does it show a clear message, queue actions, or retry?

---

### Browser Health

#### `browser.memory.heap_used` — Metric

**What it is:** Current JavaScript heap memory usage in bytes, sampled every 30 seconds. Chrome and Edge only. Firefox and Safari do not expose heap memory.

**What to look for:** The trend matters more than the value. A heap that grows from 20MB to 150MB over a 30-minute session without ever dropping is a memory leak. A heap that oscillates between 20MB and 50MB is healthy garbage collection.

**What causes memory leaks:** Event listeners not cleaned up on unmount, closures holding references to large objects, timers not cleared, third-party libraries that accumulate state.

---

#### `browser.long_task.duration` — Metric

**What it is:** Any task that blocks the main thread for more than 50ms. Chrome and Edge only.

**Thresholds:**

| Duration | Meaning |
|---|---|
| 50–100ms | Long task — noticeable to some users |
| 100–200ms | Significant — most users notice |
| Above 200ms | Severe — visible freeze |

**What causes long tasks:** Heavy JavaScript execution, large DOM operations, synchronous storage access, unoptimised third-party scripts.

---

#### `resource.load.duration` — Metric

**What it is:** Load time for every JS, CSS, image, and font asset.

**What to do:** Look for assets over 1000ms. Large JavaScript bundles, unoptimised images, and self-hosted fonts are the most common culprits. Consider code splitting, image compression, and using a CDN.

---

### Errors

#### `js.error` — Log

**What it is:** Any unhandled JavaScript exception — including errors in event handlers, setTimeout callbacks, and async code outside of React's render phase.

**What the attributes tell you:**

`message` — the error message.

`stack` — the stack trace.

`filename` — the file where the error originated.

`lineno` and `colno` — line and column number.

**What to do:** Any new error type appearing in production after a deploy is a regression. Prioritise by frequency — errors appearing hundreds of times per hour are more urgent than one-offs.

---

#### `js.unhandled_rejection` — Log

**What it is:** A Promise that was rejected with no `.catch()` handler or `try/catch` around the `await`.

**What to do:** These are almost always programming errors — an async operation that can fail but was not handled. Add error handling around the failing promise.

---

## Signals we do not capture

These interactions are not currently tracked automatically. Use `useTrackEvent` to instrument them manually if needed:

- Scroll depth and scroll velocity
- Hover duration and mouse movement
- Text selection and copy
- Keyboard shortcuts
- Drag and drop operations
- Focus and blur events
- Video and audio playback
- Touch gestures (pinch, swipe)
- Visibility changes (element enters/leaves viewport)

---

## A typical debugging workflow

**Step 1** — A user reports the checkout page feels slow.

**Step 2** — Open Grafana. Filter `react.render.duration` by `route=/checkout`. Find which component has high render duration.

**Step 3** — Filter `interaction.rage_click` for the checkout route. See if users are rage clicking the submit button.

**Step 4** — Filter `network.fetch` for `url=/api/checkout`. Check average duration and error rate.

**Step 5** — Check `web_vital.inp` for the checkout page. If above 200ms, something is blocking the main thread during interaction.

**Step 6** — Cross-reference with `browser.long_task.duration` around the same time period.

Each signal narrows the search. Metrics tell you something is wrong and roughly where. Logs tell you the exact event details. Spans tell you where the time was spent.
