# Contributing to react-telemetry-open

Thank you for your interest in contributing. This document explains how to get started.

---

## Ways to contribute

- **Report bugs** — open an issue using the Bug Report template
- **Request features** — open an issue using the Feature Request template
- **Fix bugs** — pick up an issue labelled `bug` and open a PR
- **Add signals** — new telemetry signals are welcome — see Signal Guidelines below
- **Improve docs** — typos, clarifications, examples

---

## Development setup

```bash
# Clone the repo
git clone https://github.com/techiesinha/react-telemetry-open.git
cd react-telemetry-open

# Install dependencies
npm install

# Build
npm run build

# Typecheck
npm run typecheck
```

### Testing your changes manually

Create a Vite test app alongside the package:

```bash
npm create vite@latest test-app -- --template react-ts
cd test-app
npm install
npm install ../react-telemetry-open
```

Add `<TelemetryProvider>` to `main.tsx`, run `npm run dev`, and verify your signal appears in DevTools console.

---

## Signal guidelines

If you are adding a new telemetry signal:

1. **Check browser support** — document which browsers support the underlying API
2. **Use existing MetricName entries** — add to `src/types/internal/signalTypes.ts`
3. **Guard browser APIs** — always check `typeof window !== "undefined"` and `typeof API !== "undefined"` before use
4. **Never crash** — all collectors must catch errors silently and degrade gracefully
5. **Add to locale** — all user-facing strings go in `src/locale/en.ts`
6. **Document ambiguities** — add to `docs/signals/reference.md` under the appropriate section
7. **Note if @blocked** — if the signal requires a React internal API that is not public, mark it `@blocked` in `signalTypes.ts`

---

## Coding standards

- **No `any`** — TypeScript strict mode, `exactOptionalPropertyTypes: true`
- **No magic numbers** — all constants in `src/constants/`
- **No hardcoded strings** — all user-facing strings in `src/locale/en.ts`
- **Arrow functions** for utilities, named exports for hooks and classes
- **camelCase** for variables and functions, **PascalCase** for classes and types
- **100 character line limit**
- **Conventional commits** — `feat:`, `fix:`, `docs:`, `chore:`

---

## Pull request process

1. Fork the repository
2. Create a branch: `git checkout -b fix/your-bug-name`
3. Make your changes
4. Run `npm run typecheck` and `npm run build` — both must pass
5. Open a PR against `main`
6. Fill in the PR template

PRs that fail typecheck or build will not be merged.

---

## What we will not accept

- Signals that require patching React internals (`__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED`)
- Dependencies that are not already in `package.json`
- Breaking changes to the public API without a major version discussion
- Code without TypeScript types
- Hardcoded secrets or API keys of any kind

---

## Releasing (maintainers only)

```bash
npm version patch   # or minor or major
git push origin main --tags
```

GitHub Actions publishes to npm automatically on tag push.

---

## License

By contributing, you agree that your contributions will be licensed under the Apache 2.0 licence.

Copyright 2026 Abhishek Sinha (sinha@live.in)
