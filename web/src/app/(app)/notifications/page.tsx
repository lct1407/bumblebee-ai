"use client";
import { useQuery } from "@tanstack/react-query";
import { NotificationsApi } from "@/lib/api-client";

export default function NotificationsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => NotificationsApi.list({}),
    refetchInterval: 5000,
  });

  return (
    <div className="space-y-4 max-w-3xl">
      <h1 className="text-3xl font-bold">Notifications</h1>
      {isLoading && <p className="text-zinc-500">loading…</p>}
      {data && data.length === 0 && (
        <p className="text-zinc-500">No notifications yet.</p>
      )}
      {data && (
        <ul className="space-y-2">
          {data.map((n: any) => (
            <li
              key={n.id}
              className={`rounded-lg border p-3 ${n.is_read ? "opacity-60 border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900" : "border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30"}`}
            >
              <div className="flex justify-between items-baseline">
                <strong>{n.title}</strong>
                <span className="text-xs text-zinc-500">{n.type}</span>
              </div>
              {n.body && <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">{n.body}</p>}
              <div className="text-xs text-zinc-500 mt-1">
                {new Date(n.created_at).toLocaleString()}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
