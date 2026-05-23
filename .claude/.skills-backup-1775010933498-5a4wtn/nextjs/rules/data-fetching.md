# Data Fetching

## api-single-client

All API calls must go through `lib/api/client.ts`. Never use raw `fetch()` in feature code.

**Incorrect:**
```typescript
// features/*/api/index.ts
async function uploadLogo(file: File) {
  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:1337/api';
  const token = localStorage.getItem('hrm_jwt');
  const res = await fetch(`${API_URL}/upload`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
}
```

**Correct:**
```typescript
// lib/api/client.ts - centralized utilities
export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:1337/api';
export async function uploadFile(endpoint: string, formData: FormData) { ... }
export const api = { get, post, put, delete };

// features/*/api/index.ts - uses client utilities
import { api, uploadFile } from '@/lib/api/client';

async function uploadLogo(file: File) {
  const formData = new FormData();
  formData.append('files', file);
  const [uploaded] = await uploadFile('/upload', formData);
  return uploaded;
}
```

**Why:** Centralized auth handling, error handling, and token management.

---

## fetch-server

Prefer server-side fetching in React Server Components.

**Correct:**
```tsx
// app/products/page.tsx
export default async function ProductsPage() {
  const products = await fetch('https://api.example.com/products', {
    next: { revalidate: 3600 } // Revalidate every hour
  }).then(r => r.json());

  return <ProductList products={products} />;
}
```

## fetch-parallel

Use `Promise.all()` for independent data fetches.

**Incorrect:**
```tsx
async function Page() {
  const user = await fetchUser();      // Wait
  const posts = await fetchPosts();    // Then wait
  const comments = await fetchComments(); // Then wait
  return <div>...</div>;
}
```

**Correct:**
```tsx
async function Page() {
  const [user, posts, comments] = await Promise.all([
    fetchUser(),
    fetchPosts(),
    fetchComments()
  ]);
  return <div>...</div>;
}
```

## fetch-streaming

Use Suspense for streaming data to client.

**Correct:**
```tsx
import { Suspense } from 'react';

export default function Page() {
  return (
    <div>
      <h1>Dashboard</h1>
      <Suspense fallback={<Loading />}>
        <SlowComponent />
      </Suspense>
    </div>
  );
}

async function SlowComponent() {
  const data = await slowFetch(); // Streams when ready
  return <div>{data}</div>;
}
```

## fetch-revalidate

Configure revalidation strategy.

```tsx
// Time-based revalidation
fetch(url, { next: { revalidate: 3600 } }); // 1 hour

// On-demand revalidation
fetch(url, { next: { tags: ['products'] } });
// Then: revalidateTag('products')

// No caching
fetch(url, { cache: 'no-store' });
```

## fetch-error

Handle errors with error.tsx boundaries.

```tsx
// app/products/error.tsx
'use client';

export default function Error({ error, reset }) {
  return (
    <div>
      <h2>Something went wrong!</h2>
      <button onClick={() => reset()}>Try again</button>
    </div>
  );
}
```

## crud-factory

Use factories for repetitive CRUD API/hooks to avoid DRY violations.

**Incorrect:**
```tsx
// Repeating this pattern for every resource (locations, departments, positions...)
export function useLocations() {
  return useQuery({ queryKey: ['locations'], queryFn: () => api.get('/locations') });
}
export function useLocation(id) {
  return useQuery({ queryKey: ['locations', id], queryFn: () => api.get(`/locations/${id}`), enabled: !!id });
}
export function useCreateLocation() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (data) => api.post('/locations', { data }), onSuccess: () => qc.invalidateQueries(['locations']) });
}
// ... repeat for update, delete
// ... then repeat ALL of this for departments, positions, etc.
```

**Correct:**
```tsx
// lib/api/crud-factory.ts - Create once
export function createCrudApi<T, TCreate>(options: { endpoint: string }) {
  return {
    list: () => api.get(options.endpoint),
    get: (id: string) => api.get(`${options.endpoint}/${id}`),
    create: (data: TCreate) => api.post(options.endpoint, { data }),
    update: (id: string, data: Partial<TCreate>) => api.put(`${options.endpoint}/${id}`, { data }),
    delete: (id: string) => api.delete(`${options.endpoint}/${id}`),
  };
}

// lib/hooks/crud-hooks-factory.ts - Create once
export function createCrudHooks<T, TCreate>(options: { queryKey: string[]; api: CrudApi<T, TCreate> }) {
  return {
    useList: () => useQuery({ queryKey: options.queryKey, queryFn: options.api.list }),
    useOne: (id) => useQuery({ queryKey: [...options.queryKey, id], queryFn: () => options.api.get(id!), enabled: !!id }),
    useCreate: () => { /* mutation with invalidation */ },
    useUpdate: () => { /* mutation with invalidation */ },
    useDelete: () => { /* mutation with invalidation */ },
  };
}

// features/organization/api/index.ts - Use for each resource
export const locationsApi = createCrudApi<Location, LocationFormData>({ endpoint: '/locations' });
export const departmentsApi = { ...createCrudApi<Department, DepartmentFormData>({ endpoint: '/departments' }), hierarchy: () => api.get('/departments/hierarchy') };

// features/organization/hooks/use-locations.ts - 18 lines instead of 57
const hooks = createCrudHooks({ queryKey: ['locations'], api: locationsApi });
export const useLocations = hooks.useList;
export const useLocation = hooks.useOne;
export const useCreateLocation = hooks.useCreate;
```

**Why:** Standard CRUD operations follow identical patterns. Factories eliminate 50-70% of boilerplate, ensure consistency, and make adding new resources trivial.
