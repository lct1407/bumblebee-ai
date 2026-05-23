# Routing

## route-groups

Use `(group)` for organization without affecting URL.

```
app/
├── (marketing)/
│   ├── about/page.tsx      → /about
│   └── contact/page.tsx    → /contact
├── (shop)/
│   ├── products/page.tsx   → /products
│   └── cart/page.tsx       → /cart
└── (auth)/
    ├── login/page.tsx      → /login
    └── register/page.tsx   → /register
```

## route-dynamic

Use `[param]` for dynamic segments.

```
app/
├── products/
│   ├── page.tsx            → /products
│   └── [id]/
│       └── page.tsx        → /products/123
```

```tsx
// app/products/[id]/page.tsx
export default async function ProductPage({
  params
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params;
  const product = await fetchProduct(id);
  return <div>{product.title}</div>;
}
```

## route-catch-all

Use `[...slug]` for catch-all routes.

```
app/
└── docs/
    └── [...slug]/
        └── page.tsx        → /docs/a, /docs/a/b, /docs/a/b/c
```

```tsx
export default async function DocsPage({
  params
}: {
  params: Promise<{ slug: string[] }>
}) {
  const { slug } = await params;
  // slug = ['a', 'b', 'c'] for /docs/a/b/c
}
```

## route-parallel

Use `@slot` for parallel routes (dashboards, modals).

```
app/
└── dashboard/
    ├── @analytics/page.tsx
    ├── @team/page.tsx
    └── layout.tsx
```

```tsx
// app/dashboard/layout.tsx
export default function Layout({
  children,
  analytics,
  team,
}: {
  children: React.ReactNode;
  analytics: React.ReactNode;
  team: React.ReactNode;
}) {
  return (
    <div>
      {children}
      <div className="grid grid-cols-2">
        {analytics}
        {team}
      </div>
    </div>
  );
}
```

## route-intercepting

Use `(.)` for intercepting routes (modals).

```
app/
├── feed/
│   └── page.tsx
├── photo/[id]/
│   └── page.tsx            → /photo/123 (full page)
└── @modal/
    └── (.)photo/[id]/
        └── page.tsx        → Intercepts /photo/123 as modal
```
