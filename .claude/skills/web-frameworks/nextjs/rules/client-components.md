# Client Components

## client-form-state

**REQUIRED**: Use `useFormState` hook for forms to reduce boilerplate.

```tsx
'use client';

import { useFormState, required, email } from '@/lib/hooks';
import { POSITION_LEVEL_OPTIONS } from '@/lib/constants';

export function PositionForm({ onSubmit }: Props) {
  const { data, errors, handleChange, validate } = useFormState({
    initialData: { name: '', code: '', level: 'mid' },
    validators: {
      name: required('Name is required'),
      code: required('Code is required'),
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validate()) {
      onSubmit(data);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <Input
        value={data.name}
        onChange={(e) => handleChange('name', e.target.value)}
        error={errors.name}
      />
      <Select
        options={POSITION_LEVEL_OPTIONS}
        value={data.level}
        onChange={(v) => handleChange('level', v)}
      />
    </form>
  );
}
```

## client-constants

Use centralized constants instead of defining options in components.

```tsx
// WRONG - hardcoded in component
const LEVEL_OPTIONS = [
  { value: 'junior', label: 'Junior' },
  { value: 'senior', label: 'Senior' },
];

// CORRECT - import from constants
import { POSITION_LEVEL_OPTIONS } from '@/lib/constants';
```

## client-directive

Add `'use client'` directive for interactivity.

**When to use:**
- useState, useEffect, useContext
- Event handlers (onClick, onChange)
- Browser APIs (window, document)
- Third-party libraries requiring browser

**Correct:**
```tsx
'use client';

import { useState } from 'react';

export function Counter() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(c => c + 1)}>{count}</button>;
}
```

## client-minimal

Keep client components small, push logic to server.

**Incorrect:**
```tsx
'use client';

export function ProductPage({ id }) {
  const [product, setProduct] = useState(null);
  useEffect(() => {
    fetch(`/api/products/${id}`).then(r => r.json()).then(setProduct);
  }, [id]);

  return (
    <div>
      <h1>{product?.title}</h1>
      <p>{product?.description}</p>
      <AddToCartButton productId={id} />
    </div>
  );
}
```

**Correct:**
```tsx
// Server component - fetches data
async function ProductPage({ id }) {
  const product = await fetchProduct(id);
  return (
    <div>
      <h1>{product.title}</h1>
      <p>{product.description}</p>
      <AddToCartButton productId={id} /> {/* Only this is client */}
    </div>
  );
}

// Client component - only interactive part
'use client';
function AddToCartButton({ productId }) {
  return <button onClick={() => addToCart(productId)}>Add to Cart</button>;
}
```

## client-boundaries

Place `'use client'` as low as possible in component tree.

**Incorrect:**
```tsx
'use client'; // Too high - makes everything client

export function Layout({ children }) {
  const [theme, setTheme] = useState('light');
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}
```

**Correct:**
```tsx
// Server layout
export function Layout({ children }) {
  return (
    <html>
      <body>
        <ThemeProvider> {/* Client boundary here */}
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}

// Client provider only
'use client';
function ThemeProvider({ children }) {
  const [theme, setTheme] = useState('light');
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}
```
