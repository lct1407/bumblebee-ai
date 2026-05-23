# Forge Widget

Lightweight embeddable chat widget with zero runtime dependencies.

## Architecture

- `src/components/` — Widget UI components
- `src/lib/` — Core utilities
- `src/utils/` — Helper functions
- `src/styles/` — CSS styles

## Key Patterns

- Zero external runtime dependencies — self-contained bundle
- Vite for bundling as library output
- Full test coverage with Vitest

## Recipes

**Add component:** 1. Create in src/components/. 2. Add tests in src/components/__tests__/. 3. Export from index.

## Commands

- `npm run dev` — Dev server
- `npm run build` — Build (tsc + vite)
- `npm run preview` — Preview built output
