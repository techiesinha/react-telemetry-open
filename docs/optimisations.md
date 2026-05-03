# Algorithm Optimisations

Copyright 2026 Abhishek Sinha (sinha@live.in) — Apache 2.0

This document records every intentional algorithm optimisation in react-telemetry-open.
Each entry describes the location, what was changed, the before and after complexity,
and the technique used. This ensures future contributors understand why the
implementation looks the way it does and do not accidentally revert optimisations.

---

## Optimisation 1 — Rage click detection

**File:** `src/collectors/rageClickCollector.ts`

**Algorithm:** Sliding window rage click detection

**Before:** O(n²) nested scan
- For each new click, scan all stored clicks for every element to find bursts
- Nested loop: outer loop over elements, inner loop over timestamps

**After:** O(1) amortised
- `Map<elementIdentifier, number[]>` — O(1) element lookup
- Fixed-size window per element — `threshold + 1` entries maximum
- Sliding window check on fixed-size array — effectively O(threshold) ≈ O(1)

**Technique:** Hash map with fixed-size sliding window

**Why:** At high click frequencies (games, rich editors) the naive approach
creates visible jank. The Map-based approach has negligible cost regardless
of click frequency or number of tracked elements.

---

## Optimisation 2 — URL ignore list matching

**File:** `src/core/pipeline.ts` (filter stage), `src/utils/sanitiseUrl.ts`

**Algorithm:** URL pattern matching for ignore list

**Before:** O(n) per network event
- `Array.some(pattern => url.includes(pattern))` called on every fetch/XHR event
- At 300 network events/minute with 20 ignore patterns: 6,000 string searches/minute

**After:** O(1) per network event
- All patterns compiled into a single combined RegExp once at config resolution
- `compiledPattern.test(url)` is a single operation regardless of pattern count
- Pre-escaped with `escapeRegexCharacters()` to prevent catastrophic backtracking

**Technique:** Combined RegExp compiled once, tested in O(url_length)

**Why:** Network events are the highest frequency signal. The filter stage runs
on every event. Eliminating the linear pattern scan removes a meaningful constant
cost from the hot path.

---

## Optimisation 3 — Component ignore list matching

**File:** `src/core/pipeline.ts` (filter stage), `src/core/configManager.ts`

**Algorithm:** Component name filtering

**Before:** O(n) per render event
- `Array.includes(componentName)` — linear scan per render
- Called on every `useTraceRender` event

**After:** O(1) per render event
- `Set<string>` built once during config resolution
- `Set.has(componentName)` — hash lookup, O(1)

**Technique:** Set construction at config time, O(1) lookup at event time

**Why:** Render events are the second highest frequency signal. An O(1) lookup
versus O(n) matters when tracking 200 components with a 10-item ignore list.

---

## Optimisation 4 — Signal Bus duplicate listener detection

**File:** `src/core/signalBus.ts`

**Algorithm:** Preventing duplicate event listener registration

**Before:** O(n) per `on()` call
- `Array.includes(listener)` before every `push()` to check for duplicates
- Linear scan over existing listeners

**After:** O(1) per `on()` call
- `Set<SignalListener>` per event type
- `Set.add()` automatically ignores duplicates — no manual check needed

**Technique:** Set-based storage instead of Array

**Why:** React StrictMode and component re-renders trigger `on()` calls repeatedly.
The Set approach makes duplicate prevention free — no explicit check required.

---

## Optimisation 5 — URL sanitisation

**File:** `src/utils/sanitiseUrl.ts`

**Algorithm:** URL cleaning — query param stripping, UUID/ID replacement

**Before:** O(5n) — five sequential passes over URL string
1. `url.split('?')[0]` — strip query string
2. `split('#')[0]` — strip fragment
3. `.replace(UUID_PATTERN)` — replace UUIDs
4. `.replace(NUMERIC_ID_PATTERN)` — replace `/123/` paths
5. `.replace(TRAILING_ID_PATTERN)` — replace `/123` at end

**After:** O(n) — single pass with combined pattern
- One compiled RegExp: `/[?#].*$|UUID_PATTERN|NUMERIC_ID_PATTERN/gi`
- `String.replace()` with a callback dispatches to the correct replacement
- Single traversal of the URL string

**Technique:** Combined RegExp with dispatch callback — single linear scan

**Why:** URL sanitisation runs on every network event. A 5× reduction in
string traversals has measurable impact at high network event frequency.

---

## Optimisation 6 — OTLP attribute formatting

**File:** `src/exporters/otlp/otelAdapter.ts` → `src/utils/formatAttributes.ts`

**Algorithm:** Converting attribute map to OTLP typed array

**Before:** O(2n)
- `Object.entries(attributeMap)` — creates intermediate array of [key, value] pairs
- `.map(([k, v]) => formatAttribute(k, v))` — creates result array
- Two full traversals of the attribute map

**After:** O(n)
- `for...of Object.entries(attributeMap)` — single traversal
- `result.push()` inline — no intermediate array
- Null values skipped inline — no filter pass needed

**Technique:** for...of with direct push instead of entries() + map()

**Why:** OTLP serialisation runs on every batch flush. Every event has 10-20
attributes. Eliminating the intermediate array allocation and second traversal
reduces garbage collection pressure in long sessions.

---

## Optimisation 7 — Batch queue flush

**File:** `src/core/pipeline.ts`

**Algorithm:** Handing accumulated events to ExporterManager

**Before:** O(n) — `Array.splice(0, queue.length)`
- Creates a new array by copying all elements
- Shifts remaining elements (none, since taking all — but still O(n) bookkeeping)

**After:** O(1) — array reference swap
- `const batchToExport = this.batchQueue` — reference copy, O(1)
- `this.batchQueue = []` — new empty array, O(1)
- Exporter receives old array, pipeline continues with empty array
- Zero element copying

**Technique:** Array reference swap

**Why:** Flush runs every 5 seconds and on every 50-event batch fill. On a busy
page generating 300 events/minute, flush runs 6 times per minute. O(1) vs O(n)
at flush time reduces main thread work.

---

## Optimisation 8 — Pre-boot buffer flush

**File:** `src/core/signalBus.ts`

**Algorithm:** Dispatching buffered events to Pipeline when it connects

**Before:** `forEach()` callback
- Creates a function closure per iteration
- Each callback invocation has closure overhead

**After:** Indexed `for` loop
- Direct indexed access: `this.preBootBuffer[bufferIndex]`
- No closure creation per iteration
- Same O(n) complexity, lower constant factor

**Technique:** Indexed for loop over forEach

**Why:** The pre-boot buffer typically holds 2-5 events. The optimisation is
minor in absolute terms but establishes a pattern of minimising allocations
in hot paths. Pre-boot flush is on the critical startup path.

---

## Optimisation 9 — Session inactivity timer management

**File:** `src/core/sessionManager.ts`

**Algorithm:** Resetting session expiry timer on user activity

**Before:** O(1) per event but 2 timer operations
- `clearTimeout(timerId)` — removes old timer
- `setTimeout(expireSession, 30_000)` — creates new timer
- Called on every click, keypress, scroll event
- At 60fps scroll: 120 timer operations per second

**After:** O(1) per event — single timestamp assignment
- `this.lastActivityTimestamp = Date.now()` — one assignment
- Separate `setInterval` checks inactivity every 60 seconds
- At 60fps scroll: 1 assignment per event, 1 check per minute

**Technique:** Timestamp recording + periodic check instead of timer reset per event

**Why:** Mobile scroll events fire at 60fps. The old approach created 120 timer
operations per second during scrolling. The new approach costs a single integer
assignment per event regardless of scroll frequency.

---

## Optimisation 10 — Single microtask for N events

**File:** `src/core/pipeline.ts`

**Algorithm:** Pipeline event processing scheduling

**Before (potential issue):** N microtasks for N events
- `queueMicrotask(processEvent)` called per event
- 100 rapid events = 100 microtasks queued
- Browser must drain all microtasks before yielding to React rendering
- Could cause visible jank under high event frequency

**After:** 1 microtask for N events
- Events accumulate in `pendingEventQueue` array
- Single `isMicrotaskScheduled` flag prevents duplicate scheduling
- One microtask processes all accumulated events via `splice(0)`
- Browser yields after the single microtask completes

**Technique:** Batched microtask with accumulator array

**Why:** Prevents microtask starvation under high event frequency (e.g. scrolling,
rapid interactions). Ensures React rendering is never delayed by a flood of
telemetry processing microtasks.

---

© 2026 Abhishek Sinha. Licensed under Apache 2.0.
