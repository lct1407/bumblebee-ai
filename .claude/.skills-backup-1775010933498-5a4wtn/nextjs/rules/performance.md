# Performance

## perf-dynamic-import

Use `next/dynamic` for code splitting heavy components.

```tsx
import dynamic from 'next/dynamic';

// Load only when needed
const HeavyChart = dynamic(() => import('./Chart'), {
  loading: () => <p>Loading chart...</p>,
  ssr: false // Disable SSR for browser-only components
});

// Lazy load on interaction
const Modal = dynamic(() => import('./Modal'));
```

## perf-image

Use `next/image` for optimized images.

```tsx
import Image from 'next/image';

// With known dimensions
<Image
  src="/hero.jpg"
  alt="Hero"
  width={1200}
  height={600}
  priority // Load immediately for LCP
/>

// Fill container
<div className="relative h-64">
  <Image
    src="/background.jpg"
    alt="Background"
    fill
    className="object-cover"
  />
</div>
```

## perf-font

Use `next/font` for optimized fonts.

```tsx
import { Inter, Roboto_Mono } from 'next/font/google';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter'
});

const robotoMono = Roboto_Mono({
  subsets: ['latin'],
  variable: '--font-mono'
});

export default function Layout({ children }) {
  return (
    <html className={`${inter.variable} ${robotoMono.variable}`}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
```

## perf-metadata

Use Metadata API for SEO.

```tsx
// Static metadata
export const metadata = {
  title: 'My App',
  description: 'App description',
};

// Dynamic metadata
export async function generateMetadata({ params }) {
  const product = await fetchProduct(params.id);
  return {
    title: product.title,
    description: product.description,
    openGraph: {
      images: [product.image],
    },
  };
}
```

## perf-loading

Use loading.tsx for instant loading states.

```tsx
// app/products/loading.tsx
export default function Loading() {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {[1, 2, 3].map(i => (
        <div key={i} className="h-32 animate-pulse bg-gray-200 rounded" />
      ))}
    </div>
  );
}
```

## perf-barrel

Avoid barrel imports for smaller bundles.

**Incorrect:**
```tsx
import { Button, Card, Input } from '@/components';
```

**Correct:**
```tsx
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
```
