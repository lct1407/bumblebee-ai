# page-extraction

`page.tsx` is ALWAYS an orchestrator — it composes components, wraps with Suspense/error boundaries, and passes props. It must NEVER contain business logic, hooks, handlers, or inline UI markup.

## Rules

1. **No hooks in page.tsx** — useState, useEffect, useCallback, etc. belong in custom hooks or client components
2. **No handler functions** — Event handlers, form submissions, API calls go in components or hooks
3. **No inline JSX beyond composition** — page.tsx renders imported components, not raw HTML/elements
4. **No direct API calls** — Data fetching goes in server components, hooks, or lib functions
5. **Max ~50 lines** — If page.tsx exceeds 50 lines, something needs extracting

## Structure

```
app/{route}/
├── page.tsx              # Orchestrator ONLY
├── components/           # Route-specific components
│   ├── index.ts          # Barrel export
│   ├── {name}-view.tsx   # Main view component (holds UI)
│   ├── {name}-table.tsx  # Table/list component
│   ├── {name}-form.tsx   # Form component
│   └── {name}-modal.tsx  # Modal component
└── hooks/                # Route-specific hooks (optional)
    ├── index.ts
    └── use-{name}.ts     # Custom hook with state + logic
```

## WRONG: Logic and UI in page.tsx

```tsx
// app/admin/users/page.tsx — BAD
'use client';

import { useState, useEffect, useCallback } from 'react';
import { users } from '@/lib/api';

export default function UsersPage() {
  const [userList, setUserList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    const result = await users.list({ search });
    setUserList(result.data);
    setLoading(false);
  }, [search]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  return (
    <div className="max-w-7xl mx-auto">
      <h1>Users</h1>
      <input value={search} onChange={(e) => setSearch(e.target.value)} />
      <table>
        {userList.map((u) => (
          <tr key={u.id}><td>{u.email}</td></tr>
        ))}
      </table>
    </div>
  );
}
```

## CORRECT: page.tsx as orchestrator

```tsx
// app/admin/users/page.tsx — GOOD (~15 lines)
import { Suspense } from 'react';
import { UsersView } from './components';

export default function UsersPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <UsersView />
    </Suspense>
  );
}
```

```tsx
// app/admin/users/components/users-view.tsx
'use client';

import { useUsers } from '../hooks';
import { UsersTable } from './users-table';
import { UsersToolbar } from './users-toolbar';
import Alert from '@/components/ui/Alert';

export function UsersView() {
  const { userList, loading, error, search, setSearch, page, setPage, totalPages, toggleActive } = useUsers();

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Users</h1>
        <p className="text-sm text-gray-500 mt-1">Manage user accounts</p>
      </div>
      {error && <Alert type="error" message={error} />}
      <UsersToolbar search={search} onSearchChange={setSearch} />
      <UsersTable users={userList} loading={loading} onToggleActive={toggleActive} />
    </div>
  );
}
```

```tsx
// app/admin/users/hooks/use-users.ts
'use client';

import { useState, useEffect, useCallback } from 'react';
import { users, UserProfile } from '@/lib/api';

export function useUsers() {
  const [userList, setUserList] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchUsers = useCallback(async () => { /* ... */ }, [search, page]);
  useEffect(() => { fetchUsers(); }, [fetchUsers]);
  const toggleActive = async (user: UserProfile) => { /* ... */ };

  return { userList, loading, error, search, setSearch, page, setPage, totalPages, toggleActive };
}
```

```ts
// app/admin/users/components/index.ts
export { UsersView } from './users-view';
export { UsersTable } from './users-table';
export { UsersToolbar } from './users-toolbar';
```

```ts
// app/admin/users/hooks/index.ts
export { useUsers } from './use-users';
```

## Multi-step pages (login, wizards)

For pages with multiple steps/views, each step is a separate component:

```tsx
// app/login/page.tsx — GOOD
import { Suspense } from 'react';
import { LoginView } from './components';

export default function LoginPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <LoginView />
    </Suspense>
  );
}
```

```
app/login/
├── page.tsx
├── components/
│   ├── index.ts
│   ├── login-view.tsx         # Orchestrates steps
│   ├── credentials-form.tsx   # Step 1: email/password
│   ├── mfa-form.tsx           # Step 2: MFA code
│   └── magic-link-form.tsx    # Alt: magic link
└── hooks/
    └── use-login.ts           # Auth state + handlers
```
