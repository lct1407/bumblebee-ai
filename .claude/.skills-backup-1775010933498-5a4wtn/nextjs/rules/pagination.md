# Pagination

All paginated lists MUST follow these conventions for consistency.

## Constants

Use `DEFAULT_PAGE_SIZE` from `lib/constants` — never hardcode page sizes.

```typescript
import { DEFAULT_PAGE_SIZE } from '@/lib/constants';
```

`DEFAULT_PAGE_SIZE` is `25`, matching the backend's `PAGINATION.DEFAULT_PAGE_SIZE`.

## React Query hooks

All paginated hooks MUST use `placeholderData: keepPreviousData` to prevent UI flash on page change.

**Wrong:**
```typescript
export function useItems(params?: { page?: number; pageSize?: number }) {
  return useQuery({
    queryKey: ['items', params],
    queryFn: () => itemsApi.list(params),
  });
}
```

**Correct:**
```typescript
import { keepPreviousData } from '@tanstack/react-query';

export function useItems(params?: { page?: number; pageSize?: number }) {
  return useQuery({
    queryKey: ['items', params],
    queryFn: () => itemsApi.list(params),
    placeholderData: keepPreviousData,
  });
}
```

## API functions

Encode pagination as flat URL params: `?page=1&pageSize=25`. Never use nested Strapi format (`pagination[page]`).

```typescript
export function getItems(params?: { page?: number; pageSize?: number }) {
  const searchParams = new URLSearchParams();
  if (params?.page) searchParams.set('page', String(params.page));
  if (params?.pageSize) searchParams.set('pageSize', String(params.pageSize));
  return api.get<ApiResponse<Item[]>>(`/items?${searchParams}`);
}
```

## Page components

Use `DEFAULT_PAGE_SIZE` for the page size and `TablePagination` for the pagination UI.

```tsx
import { DEFAULT_PAGE_SIZE } from '@/lib/constants';
import { TablePagination } from '@/components/ui';

const [page, setPage] = useState(1);
const { data, isFetching } = useItems({ page, pageSize: DEFAULT_PAGE_SIZE });

// Reset to page 1 when filters change
useEffect(() => setPage(1), [filters]);

// Render pagination
<TablePagination
  page={page}
  pageCount={data?.meta?.pagination?.pageCount ?? 1}
  total={data?.meta?.pagination?.total ?? 0}
  pageSize={DEFAULT_PAGE_SIZE}
  onPageChange={setPage}
  isFetching={isFetching}
/>
```

## Response shape

The backend always returns this pagination meta:

```typescript
{
  data: T[];
  meta: {
    pagination: {
      page: number;      // current page (1-indexed)
      pageSize: number;   // items per page
      pageCount: number;  // total pages
      total: number;      // total items
    }
  }
}
```

Never rely on only `total` — always expect the full pagination object.
