# component-constants

Extract shared constants to a dedicated file.

**Incorrect:**
```tsx
// Same constants in 3 different files
const STATUS_LABELS = { active: 'Active', ... };  // file1.tsx
const STATUS_LABELS = { active: 'Active', ... };  // file2.tsx
```

**Correct:**
```typescript
// features/{name}/constants.ts
export const STATUS_LABELS: Record<Status, string> = {
  active: 'Active',
  inactive: 'Inactive',
};

export const STATUS_BADGE_VARIANTS: Record<Status, BadgeVariant> = {
  active: 'success',
  inactive: 'default',
};

export const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
];
```

## Utils

Extract reusable utilities to lib/utils:

```typescript
// lib/utils/format.ts
export function formatDate(date: string): string { ... }
export function calculateTenure(hireDate: string): string { ... }
```
