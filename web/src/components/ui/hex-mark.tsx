/** Bumblebee hexagon brand mark — inherits `currentColor`. */
export function HexMark({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width={size} height={size} fill="none" aria-hidden="true">
      <path d="M12 2 21 7v10l-9 5-9-5V7z" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" />
      <path d="M12 7 16.5 9.5v5L12 17l-4.5-2.5v-5z" fill="currentColor" opacity={0.18} />
      <path d="M12 7 16.5 9.5v5L12 17l-4.5-2.5v-5z" stroke="currentColor" strokeWidth={1.4} strokeLinejoin="round" />
    </svg>
  );
}
