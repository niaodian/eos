---
name: 'Frontend (TypeScript/React)'
description: 'Conventions for React component files'
applyTo: "**/*.{tsx,jsx}"
---
# Frontend Rules — TypeScript + Next.js (React)

> Scope note: this targets component files (.tsx/.jsx) to stay mutually exclusive
> with the backend rule (**/*.ts). If your frontend has plain .ts files that need
> these rules, narrow backend to a dir (e.g. apps/api/**) and widen this to .ts.

## Architecture
- Function components + hooks only. No class components.
- Co-locate component + test + styles. One component per file.
- Server Components by default (Next.js App Router); add "use client" only when needed.
- Data fetching in server components or React Query; no fetch in render bodies.

## State & Types
- Strict TypeScript: no `any`, prefer `unknown` + narrowing. Explicit return types on exported fns.
- Form state via `react-hook-form` + zod schema validation.

## Accessibility & UX
- All interactive elements keyboard-accessible; provide aria-labels.
- Always handle loading / empty / error states explicitly.

## Tooling (local)
- Format: Prettier. Lint: ESLint (`eslint-config-next`, `@typescript-eslint`).
- Test: Vitest + React Testing Library. E2E: Playwright.
- `npm run lint && npm run typecheck && npm test`

## Telemetry
- Emit analytics events for key user actions per [docs/telemetry-plan.md](../../../docs/telemetry-plan.md).
