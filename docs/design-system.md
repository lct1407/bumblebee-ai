# Bumblebee Design System

Single source of truth for the web app. Token-driven, light/dark capable, no gradient noise.

## Principles

| | |
|---|---|
| **Restrained accent** | One amber (`#d97706` light / `#f59e0b` dark), used for primary CTAs and a 2px indicator bar — never as a background tint |
| **No tinted-background "active" states** | Active nav, unread items, hero stats → indicator bar (2px) + bolder text. Backgrounds stay neutral |
| **Muted neutrals** | Surfaces are zinc-tinted whites/near-blacks — no purple/blue casts |
| **No gradients on data surfaces** | Cards, stat tiles, tables. Gradients only on the marketing landing page |
| **Dots, not fills** | Status badges = colored 6px dot + neutral text on transparent bg. 9 colored pills competing for attention = chaos |
| **High contrast on `text-primary`** | Body text never below WCAG AA |

## Files

| File | Role |
|---|---|
| `web/src/styles/tokens.css` | All CSS variables for light + dark, semantic utility classes, type scale |
| `web/src/app/globals.css` | Imports tokens + maps to Tailwind `@theme inline` + wires `dark:` variant to `data-theme` |
| `web/src/components/theme/theme-provider.tsx` | `light` / `dark` / `system` provider, persists to `localStorage`, sets `data-theme` on `<html>` |
| `web/src/components/theme/theme-toggle.tsx` | Segmented control + compact icon-only variant |

## Token reference

### Surfaces (depth 0 → 3)

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg-canvas` | `#fafafa` | `#09090b` | Page background |
| `--bg-surface` | `#ffffff` | `#18181b` | Cards, tables, sidebar |
| `--bg-elevated` | `#ffffff` | `#1f1f23` | Popovers, command palette, dialogs |
| `--bg-subtle` | `#f4f4f5` | `#27272a` | Hover, code, chips, table headers |
| `--bg-muted` | `#e4e4e7` | `#3f3f46` | Progress track, dividers |

### Borders

| Token | Light | Dark | Use |
|---|---|---|---|
| `--border` | `#e4e4e7` | `#27272a` | Default card / input border |
| `--border-strong` | `#d4d4d8` | `#3f3f46` | Popover, focused element |
| `--border-accent` | `rgba(217,119,6,0.35)` | `rgba(245,158,11,0.30)` | Accent-tinted cards |

### Text (4 levels)

| Token | Light | Dark | Use |
|---|---|---|---|
| `--text-primary` | `#18181b` | `#fafafa` | Headings, primary body |
| `--text-secondary` | `#52525b` | `#d4d4d8` | Secondary body |
| `--text-tertiary` | `#71717a` | `#a1a1aa` | Captions, hints |
| `--text-quaternary` | `#a1a1aa` | `#71717a` | Disabled, placeholders |

### Accent (amber)

| Token | Light | Dark |
|---|---|---|
| `--accent` | `#d97706` | `#f59e0b` |
| `--accent-hover` | `#b45309` | `#fbbf24` |
| `--accent-subtle` | `rgba(217,119,6,0.10)` | `rgba(245,158,11,0.12)` |
| `--accent-fg` | `#ffffff` | `#09090b` |

### Status (theme-stable hues, per-mode `bg`/`border`)

`info` blue, `success` green, `warning` amber, `danger` rose, `purple` violet, `neutral` zinc.
Each provides `--status-{name}` (foreground hue), `--status-{name}-bg`, `--status-{name}-border`.

### Chart series (recharts-ready)

`--chart-1` … `--chart-6`, plus `--chart-grid`, `--chart-axis`, `--chart-tooltip-bg`, `--chart-tooltip-border`.
Read via `getComputedStyle(document.documentElement)` in `useChartColors()` (see `dashboard-widgets.tsx`).

### Shadows

`--shadow-sm` `--shadow-md` `--shadow-lg` — more opaque on dark.

## Type scale (Geist Sans)

| Class | Size / Weight | Use |
|---|---|---|
| `t-display` | 30 / 700 | Page H1 |
| `t-h1` | 22 / 600 | Section H1 |
| `t-h2` | 17 / 600 | Card title |
| `t-h3` | 14 / 600 | Subhead |
| `t-body` | 14 / 400 | Body |
| `t-small` | 12 / 400 | Captions |
| `t-tiny` | 11 / 500 | Metadata |
| `t-overline` | 10 / 600 / uppercase / tracking 0.08em | Section labels |
| `t-mono` | Geist Mono | Code, IDs, numbers |
| `t-tabular` | tabular-nums | Stat values |

## Component conventions

### Stat card
```tsx
<StatCard label="Total issues" value={42} hint="6 unprocessed" />
<StatCard label="Cost (24h)" value="$0.020" hint="12 LLM calls" accent />
```
- All cards: plain `bg-surface` + `border` (no tinted variant)
- `accent`: only the *value* is colored `var(--accent)`. Used at most ONE per row to anchor the eye.

### Status badge
`<StatusBadge status="in_progress" />` renders as **`● in progress`** — a 6px colored dot per `STATUS_DOT` map + `text-secondary` label on transparent bg. Snake-case is space-separated for display. No filled pill, no border.

### Active / selected / unread states (the indicator-bar pattern)
Active nav, unread notifications, "highlighted" panels:
- 2px wide × ~75% height accent bar pinned to the left edge of the container
- Bold or semibold text inside (no background change)
- Container stays on `bg-surface`; hover adds `bg-subtle`

```tsx
<div className="relative …">
  {isActive && (
    <span className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-r"
          style={{ background: "var(--accent)" }} />
  )}
  {children}
</div>
```

### Button hierarchy
| Level | Style |
|---|---|
| Primary | `bg-accent` `text-accent-fg` |
| Secondary | `bg-subtle` `border` `text-primary` |
| Ghost | transparent, hover `bg-subtle` |
| Destructive | inline `bg-status-danger-bg` `text-status-danger` |

### Chart
- Always wrap recharts with `useChartColors()` to subscribe to theme
- `cursor`, `strokeDasharray`, `axisLine`, `tickLine` use tokens
- Tooltip: bg `--chart-tooltip-bg`, border `--chart-tooltip-border`, radius 6px

### Empty state
`<EmptyState title=… description=… action={…} />` — circular icon chip on `bg-subtle`, never a giant emoji.

## Theme switching

```tsx
import { useTheme } from "@/components/theme/theme-provider";
const { mode, resolved, setMode } = useTheme();
setMode("dark"); // | "light" | "system"
```

`data-theme="dark"` is set on `<html>`. Tailwind `dark:` variant is wired to that attribute via:
```css
@custom-variant dark (&:where([data-theme="dark"] *, [data-theme="dark"]));
```

## Migration: do / don't

| Don't | Do |
|---|---|
| `className="bg-white dark:bg-zinc-900"` | `style={{ background: "var(--bg-surface)" }}` |
| `text-zinc-500` | `style={{ color: "var(--text-tertiary)" }}` |
| `bg-gradient-to-br from-amber-500/20 to-orange-500/5` | flat `bg-surface` + accent on text/value only |
| Hard-coded chart colors (`stroke="#f59e0b"`) | `useChartColors()` → `c.accent` |
| Rainbow stat tiles | All neutral; accent colors the *value* of at most one card |
| Tinted "active nav" backgrounds (`bg-accent-subtle`) | 2px indicator bar + bold text |
| Tinted unread / selected backgrounds | Indicator bar + bolder title |
| Filled status pills (9 different bg colors) | Colored dot + neutral label |
| Emoji-heavy icons in app chrome | Stroke icons (`<Icon d="…" />`), keep emoji for issue-type identifiers only |

## Unresolved

- Font-size scale uses absolute pixels (Geist looks best at 14px body); consider rem migration if we need user font-scaling
- Status `info` and `purple` look near-identical at small badge size in dark mode — consider tightening saturation
