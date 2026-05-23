# Server Components

## server-default

Components are server components by default. No directive needed.

**Correct:**
```tsx
// No directive = server component
export default async function Page() {
  const data = await fetchData();
  return <div>{data.title}</div>;
}
```

## server-async

Use async/await directly in server components.

**Incorrect:**
```tsx
export default function Page() {
  const [data, setData] = useState(null);
  useEffect(() => {
    fetchData().then(setData);
  }, []);
  return <div>{data?.title}</div>;
}
```

**Correct:**
```tsx
export default async function Page() {
  const data = await fetchData();
  return <div>{data.title}</div>;
}
```

## server-data

Fetch data at component level, colocate data fetching with rendering.

**Incorrect:**
```tsx
// Fetching in parent, passing down
async function Parent() {
  const data = await fetchData();
  return <Child data={data} />;
}
```

**Correct:**
```tsx
// Each component fetches its own data
async function Parent() {
  return <Child />;
}

async function Child() {
  const data = await fetchData(); // Deduplicated by React
  return <div>{data.title}</div>;
}
```

## server-no-hooks

Server components cannot use hooks (useState, useEffect, etc.).

**Incorrect:**
```tsx
export default async function Page() {
  const [count, setCount] = useState(0); // Error!
  return <div>{count}</div>;
}
```

**Correct:**
```tsx
export default async function Page() {
  const data = await fetchData();
  return <Counter initialValue={data.count} />; // Client component
}
```
