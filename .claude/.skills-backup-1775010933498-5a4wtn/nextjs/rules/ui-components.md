# ui-components

ALWAYS use project UI components from `@/components/ui/`. NEVER write inline UI elements when a project component exists.

## Available Components

| Component | Import | Replaces |
|-----------|--------|----------|
| `Button` | `@/components/ui/Button` | `<button>` with styling |
| `Input` | `@/components/ui/Input` | `<input>` with label/styling |
| `Textarea` | `@/components/ui/Textarea` | `<textarea>` with label/styling |
| `Select` | `@/components/ui/Select` | `<select>` with label/styling |
| `Checkbox` | `@/components/ui/Checkbox` | `<input type="checkbox">` with label |
| `Badge` | `@/components/ui/Badge` | `<span className="rounded-full...">` status pills |
| `Card` | `@/components/ui/Card` | `<div className="bg-white rounded-xl border...">` |
| `Table` | `@/components/ui/Table` | `<table>` with styling |
| `Alert` | `@/components/ui/Alert` | error/success message divs |
| `Pagination` | `@/components/ui/Pagination` | prev/next + page counter |
| `Tabs` | `@/components/ui/Tabs` | tab button groups for switching views |
| `Avatar` | `@/components/ui/Avatar` | initials circle avatars |

## Rules

1. **No inline buttons** — Use `<Button>` not `<button className="...">`
2. **No inline inputs** — Use `<Input>` not `<input className="...">`
3. **No inline textareas** — Use `<Textarea>` not `<textarea className="...">`
4. **No inline selects** — Use `<Select>` not `<select className="...">` or custom dropdown divs
5. **No inline checkboxes** — Use `<Checkbox>` not `<input type="checkbox" className="...">`
6. **No inline status pills** — Use `<Badge>` not `<span className="rounded-full bg-green-100 text-green-700...">`
7. **No inline cards** — Use `<Card>` not `<div className="bg-white rounded-xl border...">`
8. **No inline tables** — Use `<Table>` not `<table className="...">`
9. **No inline alerts** — Use `<Alert>` not custom error/success divs
10. **No inline pagination** — Use `<Pagination>` not custom prev/next button groups
11. **No inline tab groups** — Use `<Tabs>` not manually mapped button arrays for view switching
12. **No inline avatars** — Use `<Avatar>` not `<div className="rounded-full bg-indigo-600...">` initials circles
13. **Always use barrel import** — `import { Button, Input } from '@/components/ui'` not `import Button from '@/components/ui/Button'`
14. **Missing component?** — Create it in `@/components/ui/` first, add to barrel `index.ts`, then use it. Never inline a one-off styled element that could be reusable.

## WRONG: Inline UI elements

```tsx
// BAD — inline button with custom styling
<button
  onClick={handleSave}
  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
>
  Save
</button>

// BAD — inline input with custom styling
<input
  type="text"
  value={search}
  onChange={(e) => setSearch(e.target.value)}
  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
  placeholder="Search..."
/>

// BAD — inline select with custom styling
<select
  value={role}
  onChange={(e) => setRole(e.target.value)}
  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none"
>
  <option value="admin">Admin</option>
  <option value="user">User</option>
</select>

// BAD — inline status pill / badge
<span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
  Active
</span>
<span className="px-2 py-1 rounded-full bg-red-100 text-red-600 text-xs">
  Inactive
</span>

// BAD — inline card wrapper
<div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
  {children}
</div>

// BAD — inline error message
<p className="text-red-500 text-sm mt-2">{error}</p>

// BAD — inline avatar initials circle
<div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white text-sm font-medium">
  {initials}
</div>

// BAD — inline tab button group
<div className="flex space-x-1 border-b border-gray-200">
  {['Overview', 'Users', 'Settings'].map((tab) => (
    <button
      key={tab}
      onClick={() => setActiveTab(tab)}
      className={`px-4 py-2 text-sm font-medium ${activeTab === tab ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-gray-500'}`}
    >
      {tab}
    </button>
  ))}
</div>
```

## Import Rule

**ALWAYS import from the barrel** `@/components/ui` — NEVER from individual files.

```tsx
// WRONG — individual file imports
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Alert from '@/components/ui/Alert';

// CORRECT — single barrel import, alphabetically sorted
import { Alert, Button, Input } from '@/components/ui';
```

## CORRECT: Project UI components

```tsx
import { Alert, Avatar, Badge, Button, Card, Checkbox, Input, Pagination, Select, Tabs, Textarea } from '@/components/ui';

// GOOD — project Button
<Button onClick={handleSave}>Save</Button>
<Button variant="danger" size="sm" onClick={handleDelete}>Delete</Button>
<Button variant="secondary" isLoading={loading}>Submit</Button>

// GOOD — project Input
<Input
  label="Search"
  type="text"
  value={search}
  onChange={(e) => setSearch(e.target.value)}
  placeholder="Search..."
/>

// GOOD — project Textarea
<Textarea
  label="Description"
  value={description}
  onChange={(e) => setDescription(e.target.value)}
  rows={4}
/>

// GOOD — project Select (most commonly violated — never use raw <select>)
<Select
  label="Role"
  value={role}
  onChange={(e) => setRole(e.target.value)}
  options={[
    { value: 'admin', label: 'Admin' },
    { value: 'user', label: 'User' },
  ]}
/>

// GOOD — project Checkbox
<Checkbox
  label="Enable MFA"
  checked={mfaEnabled}
  onChange={(e) => setMfaEnabled(e.target.checked)}
/>

// GOOD — project Badge (most commonly violated — never use raw <span> for status pills)
<Badge variant="success">Active</Badge>
<Badge variant="error">Inactive</Badge>
<Badge variant="warning">Pending</Badge>
<Badge variant="default">Unknown</Badge>

// GOOD — project Card
<Card>{children}</Card>

// GOOD — project Alert
<Alert type="error" message={error} />
<Alert type="success" message="Saved successfully" />

// GOOD — project Pagination
<Pagination
  currentPage={page}
  totalPages={totalPages}
  onPageChange={setPage}
/>

// GOOD — project Tabs
<Tabs
  tabs={['Overview', 'Users', 'Settings']}
  activeTab={activeTab}
  onTabChange={setActiveTab}
/>

// GOOD — project Avatar
<Avatar name="Jane Doe" />
<Avatar name="John Smith" size="lg" />
```

## When to create a new UI component

If you need a styled element that doesn't exist in `@/components/ui/`:

1. Create it in `@/components/ui/{Name}.tsx`
2. Add `export { default as Name } from './Name';` to `@/components/ui/index.ts`
3. Follow existing component patterns (props interface, Tailwind classes, variants)
4. Import from barrel and use it — never inline

```tsx
// @/components/ui/NewComponent.tsx — new component example
interface NewComponentProps {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'error';
}

export default function NewComponent({ children, variant = 'default' }: NewComponentProps) {
  const styles: Record<string, string> = {
    default: 'bg-gray-100 text-gray-700',
    success: 'bg-green-100 text-green-700',
    warning: 'bg-yellow-100 text-yellow-700',
    error: 'bg-red-100 text-red-700',
  };
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[variant]}`}>{children}</span>;
}
```
