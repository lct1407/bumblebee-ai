"use client";
/**
 * Settings → Devices page.
 *
 * Confirms a pairing code from `bb device pair` and surfaces the
 * one-time node_token. After this step the daemon on the user's
 * machine can start pulling tasks.
 */
import { useState } from "react";
import { motion } from "framer-motion";
import {
  useDevicePairConfirm,
  useNodes,
  type NodeRow,
} from "@/lib/graphql-hooks";

function formatRelative(iso: string | null): string {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(iso).toLocaleDateString();
}

function StatusDot({ status }: { status: string }) {
  const color =
    status === "active" ? "var(--success, #10b981)"
    : status === "pending" ? "var(--warning, #f59e0b)"
    : "var(--text-tertiary)";
  return (
    <span
      className="inline-block w-2 h-2 rounded-full mr-2"
      style={{ background: color }}
    />
  );
}

export default function DevicesPage() {
  const { data: nodes, isLoading, refetch } = useNodes();
  const confirm = useDevicePairConfirm();
  const [code, setCode] = useState("");
  const [issuedToken, setIssuedToken] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setConfirmError(null);
    setIssuedToken(null);
    try {
      const r = await confirm.mutateAsync(code.trim().toUpperCase());
      setIssuedToken(r.nodeToken);
      setCode("");
      refetch();
    } catch (err: any) {
      setConfirmError(err?.message ?? "failed to confirm");
    }
  };

  return (
    <div className="space-y-8">
      <header>
        <h1 className="t-h2 mb-1">Devices</h1>
        <p className="t-body" style={{ color: "var(--text-tertiary)" }}>
          Pair máy của bạn để chạy AI tasks locally. Code không bao giờ rời máy bạn.
        </p>
      </header>

      {/* Pair confirm card */}
      <section
        className="rounded-xl p-6 border"
        style={{
          background: "var(--bg-surface)",
          borderColor: "var(--border)",
        }}
      >
        <h2 className="t-h4 mb-1">Pair máy mới</h2>
        <ol
          className="text-sm space-y-1 mb-5 list-decimal list-inside"
          style={{ color: "var(--text-tertiary)" }}
        >
          <li>
            Trên máy bạn chạy:{" "}
            <code className="px-1.5 py-0.5 rounded text-xs"
                  style={{ background: "var(--bg-subtle)" }}>
              bb device pair --server &lt;url&gt;
            </code>
          </li>
          <li>CLI sẽ in ra một <strong>pairing code 8 ký tự</strong>.</li>
          <li>Nhập code vào ô bên dưới (trong vòng 10 phút).</li>
          <li>Copy node token được trả về → chạy <code>bb device save-token &lt;token&gt;</code> trên máy.</li>
          <li>Start daemon: <code>bb daemon</code>.</li>
        </ol>

        <form onSubmit={handleConfirm} className="flex gap-3 items-stretch">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={8}
            placeholder="ABCD1234"
            className="px-4 py-2.5 rounded-lg border font-mono tracking-widest text-lg outline-none focus:ring-2"
            style={{
              background: "var(--bg-base)",
              borderColor: "var(--border)",
              color: "var(--text-primary)",
              minWidth: 200,
            }}
            required
            pattern="[A-Z0-9]{8}"
          />
          <button
            type="submit"
            disabled={confirm.isPending || code.length !== 8}
            className="px-5 py-2.5 rounded-lg font-medium transition disabled:opacity-50"
            style={{
              background: "var(--accent)",
              color: "var(--accent-fg, white)",
            }}
          >
            {confirm.isPending ? "Confirming…" : "Confirm pairing"}
          </button>
        </form>

        {confirmError && (
          <p
            className="mt-3 text-sm"
            style={{ color: "var(--danger, #ef4444)" }}
          >
            ⚠ {confirmError}
          </p>
        )}

        {issuedToken && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-5 p-4 rounded-lg border-2"
            style={{
              borderColor: "var(--success, #10b981)",
              background: "var(--bg-subtle)",
            }}
          >
            <p className="text-sm font-medium mb-2">
              ✅ Đã pair! Copy node token sau (chỉ hiển thị 1 lần):
            </p>
            <code
              className="block px-3 py-2 rounded font-mono text-sm break-all"
              style={{ background: "var(--bg-base)", color: "var(--accent)" }}
            >
              {issuedToken}
            </code>
            <p className="mt-3 text-xs" style={{ color: "var(--text-tertiary)" }}>
              Trên máy bạn chạy:{" "}
              <code
                className="px-1.5 py-0.5 rounded"
                style={{ background: "var(--bg-base)" }}
              >
                bb device save-token {issuedToken.slice(0, 16)}…
              </code>
            </p>
            <button
              onClick={() => navigator.clipboard.writeText(issuedToken)}
              className="mt-2 text-xs px-2 py-1 rounded"
              style={{ background: "var(--bg-base)" }}
            >
              📋 Copy
            </button>
          </motion.div>
        )}
      </section>

      {/* Devices list */}
      <section>
        <header className="flex items-center justify-between mb-3">
          <h2 className="t-h4">Devices đã pair</h2>
          <button
            onClick={() => refetch()}
            className="text-sm px-3 py-1.5 rounded hover:bg-[var(--bg-subtle)]"
            style={{ color: "var(--text-tertiary)" }}
          >
            ↻ Refresh
          </button>
        </header>

        {isLoading ? (
          <p style={{ color: "var(--text-tertiary)" }}>Loading…</p>
        ) : !nodes?.length ? (
          <div
            className="rounded-xl border-2 border-dashed p-8 text-center"
            style={{ borderColor: "var(--border)" }}
          >
            <p style={{ color: "var(--text-tertiary)" }}>
              Chưa có device nào. Pair máy đầu tiên ở trên.
            </p>
          </div>
        ) : (
          <div
            className="rounded-xl border overflow-hidden"
            style={{ borderColor: "var(--border)" }}
          >
            <table className="w-full text-sm">
              <thead
                style={{ background: "var(--bg-subtle)" }}
              >
                <tr className="text-left">
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Capabilities</th>
                  <th className="px-4 py-3 font-medium">Platform</th>
                  <th className="px-4 py-3 font-medium">Last seen</th>
                </tr>
              </thead>
              <tbody>
                {nodes.map((n: NodeRow) => (
                  <tr
                    key={n.id}
                    className="border-t"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium">{n.name}</div>
                      {n.hostname && (
                        <div
                          className="text-xs"
                          style={{ color: "var(--text-tertiary)" }}
                        >
                          {n.hostname}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusDot status={n.status} />
                      {n.status}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 flex-wrap">
                        {(n.capabilities ?? []).map((c) => (
                          <span
                            key={c}
                            className="px-2 py-0.5 rounded text-xs"
                            style={{ background: "var(--bg-subtle)" }}
                          >
                            {c}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3" style={{ color: "var(--text-tertiary)" }}>
                      {n.platform ?? "—"}
                    </td>
                    <td
                      className="px-4 py-3"
                      style={{ color: "var(--text-tertiary)" }}
                    >
                      {formatRelative(n.lastHeartbeatAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
