# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development (run both simultaneously)
npm run dev          # Astro dev server on port 4321
npm run convex       # Convex backend dev server

# Build & Check
npm run build        # astro check && astro build
npm run check        # astro check && stylelint && astro build
npm run stylelint:fix  # Auto-fix SCSS lint issues

# Testing (Playwright E2E)
npm run test                    # All browsers
npm run test:chrome             # Chromium headed
npm run test:nopause:chrome     # Chromium headless (single test file)

# One-off TypeScript execution
npm run ts <file.ts>            # node --experimental-strip-types
```

## Architecture

**Stack (ATSDC)**: Astro 5 + TypeScript + Convex + SCSS + Vercel AI SDK

**Rendering**: Server-side (`output: 'server'`) via `@astrojs/vercel` adapter.

**Database**: Convex (real-time sync). Schema is in `convex/schema.ts`. The HTTP client is initialized in `src/db/initialize.ts`. `drizzle.config.ts` is deprecated and can be ignored.

**AI**: Vercel AI SDK (`ai`) in `src/pages/api/chat.ts` with streaming responses. Defaults to `openai/gpt-4o` but supports any provider via the model parameter. Exa search integration lives in `src/lib/exa-search.ts`.

**Key path aliases** (from `tsconfig.json`):

- `@/*` → `src/*`
- `@db/*` → `src/db/*`
- `@styles/*` → `src/styles/*`
- `@components/*` → `src/components/*`

## SCSS Conventions

- **No inline `<style>` tags** in Astro components. All styles go in `src/styles/`.
- **No utility classes** (Tailwind-style). Use semantic class names.
- **Data attributes** for variants: `data-variant="primary"`, `data-size="sm"`, etc.
- Global SCSS variables from `src/styles/variables/globals.scss` are **auto-injected** into every file via `astro.config.mjs` (`additionalData`). Do not import them manually.
- Design tokens come from **OpenProps** (`open-props`) — use `--size-*`, `--shadow-*`, etc.
- Breakpoint mixins live in `src/styles/variables/mixins.scss`: `@include tablet`, `@include desktop`, etc.

## Core Application

The flagship feature is an **Audio to Color visualizer** (`src/pages/index.astro` + `src/pages/IndexScript.astro`). The client-side engine in `IndexScript.astro` uses the Web Audio API to extract features (energy, brightness, tempo, flux, spectral spread/flatness, bass ratio, zero-crossing rate), classifies them into 30+ moods, and generates HSL colors in real time. Supports three input modes: file upload, speaker/tab capture, and microphone.

## Required Environment Variables

See `.env.example`. Minimum for local dev: `PUBLIC_CONVEX_URL`, `OPENAI_API_KEY`. Auth (`BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`) and search (`EXA_API_KEY`) are optional unless those features are exercised.
