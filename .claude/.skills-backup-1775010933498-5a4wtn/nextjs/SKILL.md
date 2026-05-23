---
name: nextjs
description: |
  Next.js App Router toolbox. Scripts for project/feature initialization,
  rules for development patterns. Fixes bugs reported by e2e-playwright skill.
---

# Next.js Skill

Toolbox for Next.js App Router development.

## Bug Fixing Workflow

When e2e-playwright reports bugs to `docs/bugs/`:

### 1. Read Bug Report
```bash
# Check for new bugs
ls docs/bugs/
cat docs/bugs/FE-BUG-[DATE].md
```

### 2. Fix the Bug
1. Read the bug report for location and suggested fix
2. Find the frontend file mentioned
3. Apply the fix following project patterns
4. Add success toast if missing (common issue)

### 3. Common Fixes

**Missing success toast:**
```typescript
// In hook (use-[feature].ts)
import { toast } from '@/components/ui';

return useMutation({
    mutationFn: updateFn,
    onSuccess: () => {
        toast.success('Updated successfully');
        queryClient.invalidateQueries({ queryKey });
    },
});
```

**Missing required field validation:**
```typescript
// Remove required rule if field should be optional
<FormField
    name="phone"
    // rules={{ required: 'Phone is required' }}  // Remove if optional
/>
```

### 4. Verify Fix
After fixing, run the failing test:
```bash
cd e2e && npx playwright test -g "[test-name]"
```

---

## Scripts

| Command | Description |
|---------|-------------|
| `python3 scripts/init_project.py <name> --new` | Create new Next.js project |
| `python3 scripts/init_project.py <name>` | Add structure to existing |
| `python3 scripts/init_feature.py <name>` | Create feature module |

## Rules

Development patterns in `rules/`:

| File | Topic |
|------|-------|
| `_index.md` | Table of contents |
| `page-extraction.md` | page.tsx as orchestrator only |
| `ui-components.md` | Shared UI components + barrel imports |
| `component-size.md` | Component size limits |
| `component-modular.md` | Folder structure with barrel exports |
| `component-constants.md` | Extract shared constants |
| `component-structure.md` | Component organization overview |
| `hooks-modular.md` | Split large hook files |
| `server-components.md` | Server component patterns |
| `client-components.md` | Client component patterns |
| `data-fetching.md` | Data fetching patterns |
| `routing.md` | App Router routing |
| `performance.md` | Performance optimization |

## References

- Project structure: `docs/project-structure.md`
- Bug reports: `docs/bugs/`
- React best practices: `.claude/skills/react-best-practices/`
