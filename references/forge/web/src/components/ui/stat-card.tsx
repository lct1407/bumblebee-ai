interface StatCardProps {
  label: string;
  value: number | string;
  accent?: string;
  sub?: string;
}

export function StatCard({ label, value, accent, sub }: StatCardProps) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-lg border border-gray-200 bg-white px-3 py-3 sm:px-4 overflow-hidden">
      <span className="truncate text-[11px] font-medium uppercase tracking-wider text-gray-400">{label}</span>
      <span className={`truncate text-xl font-bold tabular-nums sm:text-2xl ${accent ?? 'text-gray-900'}`}>{value}</span>
      {sub && <span className="truncate text-[11px] text-gray-400">{sub}</span>}
    </div>
  );
}
