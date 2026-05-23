# Component Structure

See modular rule files for detailed patterns:

| Rule | File |
|------|------|
| Page orchestrator | `page-extraction.md` |
| UI components | `ui-components.md` |
| Size limits | `component-size.md` |
| Folder structure | `component-modular.md` |
| Constants | `component-constants.md` |
| Hooks modular | `hooks-modular.md` |

## When to Split

| Condition | Action |
|-----------|--------|
| page.tsx has hooks/handlers | Extract to components/ + hooks/ |
| Inline styled element | Use shared UI from @/components/ui |
| Component > 200 lines | Split into subcomponents |
| Hooks file > 200 lines | Split into use-*.ts files |
| Same constants in 2+ files | Extract to constants.ts |
| Same utility in 2+ files | Extract to lib/utils/ |
