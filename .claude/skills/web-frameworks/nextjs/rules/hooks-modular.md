# hooks-modular

Split large hook files (>200 lines) into domain-specific modules.

**Incorrect:**
```typescript
// hooks/index.ts - 780 lines with all hooks inline
export function useTimesheets() { ... }
export function useExpenseClaims() { ... }
export function useWorkflows() { ... }
```

**Correct:**
```typescript
// hooks/index.ts - Barrel re-exports only
export * from './use-timesheets';
export * from './use-expense-claims';
export * from './use-workflows';
export * from './keys';
```

**Structure:**
```
features/{name}/hooks/
├── index.ts              # Barrel re-exports only
├── keys.ts               # Query key definitions
├── use-timesheets.ts     # Domain-specific hooks
├── use-expense-claims.ts
└── use-workflows.ts
```
