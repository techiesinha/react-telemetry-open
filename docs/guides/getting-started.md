# Getting Started

Copyright 2026 Abhishek Sinha (sinha@live.in) — Apache 2.0

---

## Prerequisites

- React 18 or 19
- Node.js 16+
- A React app (Create React App, Vite, Next.js, or any bundler)

---

## Step 1 — Install

```bash
npm install react-telemetry-open
```

---

## Step 2 — Create config file

```bash
npx react-telemetry-open init
```

Answer 3 questions. Two config files are generated:

- `telemetry.config.json` — development settings (console exporter, debug on)
- `telemetry.config.prod.json` — production overrides (OTLP exporter, low sampling)

---

## Step 3 — Wrap your app

Open your app's root file (`App.tsx`, `main.tsx`, or `_app.tsx`).

**React with React Router:**

```tsx
import { TelemetryProvider } from 'react-telemetry-open'

function App() {
  return (
    <TelemetryProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/dashboard" element={<Dashboard />} />
        </Routes>
      </BrowserRouter>
    </TelemetryProvider>
  )
}
```

**Next.js Pages Router (`_app.tsx`):**

```tsx
import { TelemetryProvider } from 'react-telemetry-open'
import type { AppProps } from 'next/app'

export default function MyApp({ Component, pageProps }: AppProps) {
  return (
    <TelemetryProvider>
      <Component {...pageProps} />
    </TelemetryProvider>
  )
}
```

**Next.js App Router (`app/layout.tsx`):**

```tsx
import { TelemetryProvider } from 'react-telemetry-open'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        <TelemetryProvider>
          {children}
        </TelemetryProvider>
      </body>
    </html>
  )
}
```

**Important:** Place `TelemetryProvider` at the very root of your app — outside routing,
outside any layout wrappers. TelemetryProvider must never unmount during normal navigation.
Placing it inside a route component causes it to unmount on every navigation.

---

## Step 4 — Open DevTools

Start your development server and open the browser DevTools console.

You will see telemetry events logged in grouped format:

```
[react-telemetry-open] web_vital.fcp
  Type: metric
  Route: /
  Timestamp: 2026-05-02T10:23:45.123Z
  Value: 842 ms
  Attributes: { rating: "good" }

[react-telemetry-open] network.fetch
  Type: span
  Route: /dashboard
  Duration: 234.50ms
  Attributes: { url: "/api/dashboard", method: "GET", status: 200, ok: true }
```

---

## Step 5 — Track your first component

Add `useTraceRender` to a component you want to measure:

```tsx
import { useTraceRender } from 'react-telemetry-open'

function UserDashboard() {
  useTraceRender('UserDashboard')

  return <div>...</div>
}
```

You will see `react.render.duration` events in the console for every render of this component.

---

## Step 6 — Track routes

Add `useRouteTrace` to your router component:

```tsx
import { useRouteTrace } from 'react-telemetry-open'

function AppRouter() {
  useRouteTrace()

  return (
    <Routes>
      <Route path="/" element={<Home />} />
    </Routes>
  )
}
```

Navigate between pages. You will see `route.change` span events.

---

## Step 7 — Go to production

When you are ready to export data to a real backend:

1. Set up an OTel Collector pointing to your observability backend
2. Set environment variables:
   ```bash
   REACT_APP_OTEL_URL=https://your-collector.example.com
   REACT_APP_OTEL_KEY=your-api-key
   REACT_APP_BUILD_ID=$(git rev-parse --short HEAD)
   ```
3. Update `telemetry.config.prod.json` (already done by `init`)
4. Build and deploy

---

## Common mistakes

**TelemetryProvider inside a route component.**
```tsx
// Wrong — unmounts on every navigation
<Routes>
  <Route path="/" element={
    <TelemetryProvider>
      <Home />
    </TelemetryProvider>
  } />
</Routes>

// Correct — stays mounted for entire session
<TelemetryProvider>
  <Routes>
    <Route path="/" element={<Home />} />
  </Routes>
</TelemetryProvider>
```

**Using `useTrackEvent` options as an inline object.**
```tsx
// Wrong — creates new object on every render, may cause issues
useTrackInteraction('btn', { component: 'Header' })

// Correct — stable reference
const interactionOptions = useMemo(() => ({ component: 'Header' }), [])
useTrackInteraction('btn', interactionOptions)
```

**Calling `useTraceRender` without a name in production.**
```tsx
// Works but component will appear as 'Unknown' in your dashboard after minification
useTraceRender()

// Always pass an explicit name
useTraceRender('UserDashboard')
```

---

© 2026 Abhishek Sinha. Licensed under Apache 2.0.
