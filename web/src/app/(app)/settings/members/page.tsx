"use client";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Combobox } from "@/components/ui/combobox";
import {
  WorkspacesApi,
  getActiveWorkspace,
  type Member,
  type Workspace,
} from "@/lib/api-client";

const ROLE_OPTIONS = [
  { value: "viewer", label: "Viewer" },
  { value: "member", label: "Member" },
  { value: "admin", label: "Admin" },
];

const inputStyle: React.CSSProperties = {
  background: "var(--bg-surface)",
  borderColor: "var(--border)",
  color: "var(--text-primary)",
};

export default function MembersSettingsPage() {
  const qc = useQueryClient();
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  useEffect(() => setActiveSlug(getActiveWorkspace()), []);

  const wsList = useQuery({ queryKey: ["workspaces"], queryFn: WorkspacesApi.listMine });
  const current: Workspace | undefined = (wsList.data ?? []).find((w) => w.slug === activeSlug);

  const members = useQuery({
    queryKey: ["members", current?.id],
    queryFn: () => WorkspacesApi.listMembers(current!.id),
    enabled: !!current?.id,
  });

  const canManage = current?.role === "owner" || current?.role === "admin";

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Member["role"]>("member");
  const [inviteLink, setInviteLink] = useState<string | null>(null);

  const invite = useMutation({
    mutationFn: () =>
      WorkspacesApi.invite(current!.id, inviteEmail.trim().toLowerCase(), inviteRole),
    onSuccess: (data: any) => {
      // Build the accept-URL so admin can share if email delivery fails
      const link = `${window.location.origin}/invites/${data.token}`;
      setInviteLink(link);
      setInviteEmail("");
      qc.invalidateQueries({ queryKey: ["members"] });
    },
  });

  const updateRole = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: Member["role"] }) =>
      WorkspacesApi.updateMemberRole(current!.id, userId, role),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["members"] }),
  });

  const removeMember = useMutation({
    mutationFn: (userId: string) => WorkspacesApi.removeMember(current!.id, userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["members"] }),
  });

  if (!current) {
    return (
      <div className="t-small" style={{ color: "var(--text-tertiary)" }}>
        Pick a workspace from the sidebar switcher.
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-3xl">
      <motion.header
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="t-display" style={{ color: "var(--text-primary)" }}>
          Members
        </h1>
        <p className="t-small mt-1" style={{ color: "var(--text-tertiary)" }}>
          {members.data?.length ?? 0} member{(members.data?.length ?? 0) === 1 ? "" : "s"} in
          <strong style={{ color: "var(--text-primary)" }}> {current.name}</strong>
        </p>
      </motion.header>

      {canManage && (
        <section
          className="rounded-xl border p-5 space-y-3"
          style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
        >
          <h2 className="t-h2" style={{ color: "var(--text-primary)" }}>Invite a member</h2>
          <div className="flex gap-2 flex-wrap">
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="teammate@example.com"
              className="flex-1 min-w-[200px] px-3 py-2 rounded-md border text-sm outline-none focus:border-[var(--accent)]"
              style={inputStyle}
            />
            <Combobox
              options={ROLE_OPTIONS}
              value={inviteRole}
              onChange={(v: Member["role"]) => setInviteRole(v)}
              placeholder="Role"
            />
            <button
              onClick={() => inviteEmail.includes("@") && invite.mutate()}
              disabled={!inviteEmail.includes("@") || invite.isPending}
              className="px-3 py-1.5 rounded-md text-sm font-medium transition disabled:opacity-50"
              style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
            >
              {invite.isPending ? "Sending…" : "Send invite"}
            </button>
          </div>
          {inviteLink && (
            <div
              className="rounded-md border p-3 text-xs space-y-1"
              style={{ background: "var(--bg-subtle)", borderColor: "var(--border)" }}
            >
              <div style={{ color: "var(--text-tertiary)" }}>
                Invite sent. Share this link if email delivery fails:
              </div>
              <code className="block font-mono break-all" style={{ color: "var(--accent)" }}>
                {inviteLink}
              </code>
            </div>
          )}
        </section>
      )}

      <section
        className="rounded-xl border overflow-hidden"
        style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
      >
        <table className="w-full text-sm">
          <thead className="border-b" style={{ background: "var(--bg-subtle)", borderColor: "var(--border)" }}>
            <tr>
              <th className="px-4 py-2.5 text-left t-overline" style={{ color: "var(--text-tertiary)" }}>Member</th>
              <th className="px-4 py-2.5 text-left t-overline" style={{ color: "var(--text-tertiary)" }}>Joined</th>
              <th className="px-4 py-2.5 text-left t-overline" style={{ color: "var(--text-tertiary)" }}>Role</th>
              <th className="w-24"></th>
            </tr>
          </thead>
          <tbody>
            {(members.data ?? []).map((m, idx) => (
              <motion.tr
                key={m.user_id}
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.03 }}
                className="border-b"
                style={{ borderColor: "var(--border)" }}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold"
                      style={{
                        background: m.role === "owner" ? "var(--accent)" : "var(--bg-subtle)",
                        color: m.role === "owner" ? "var(--accent-fg)" : "var(--text-tertiary)",
                      }}
                    >
                      {(m.username || m.email || "?")[0].toUpperCase()}
                    </div>
                    <div>
                      <div className="font-medium" style={{ color: "var(--text-primary)" }}>
                        {m.username || "—"}
                      </div>
                      <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                        {m.email || ""}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-xs" style={{ color: "var(--text-tertiary)" }}>
                  {m.joined_at ? new Date(m.joined_at).toLocaleDateString() : "—"}
                </td>
                <td className="px-4 py-3">
                  {m.role === "owner" || !canManage ? (
                    <span
                      className="inline-block px-2 py-0.5 rounded-md text-xs font-medium"
                      style={{ background: "var(--bg-subtle)", color: "var(--text-secondary)" }}
                    >
                      {m.role}
                    </span>
                  ) : (
                    <Combobox
                      options={ROLE_OPTIONS}
                      value={m.role}
                      onChange={(v: Member["role"]) =>
                        updateRole.mutate({ userId: m.user_id, role: v })
                      }
                    />
                  )}
                </td>
                <td className="px-4 py-3">
                  {m.role !== "owner" && canManage && (
                    <button
                      onClick={() => {
                        if (confirm(`Remove ${m.username || m.email} from this workspace?`)) {
                          removeMember.mutate(m.user_id);
                        }
                      }}
                      className="text-xs hover:underline"
                      style={{ color: "var(--status-danger)" }}
                    >
                      Remove
                    </button>
                  )}
                </td>
              </motion.tr>
            ))}
            {(members.data ?? []).length === 0 && !members.isLoading && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center t-small" style={{ color: "var(--text-tertiary)" }}>
                  No members yet — invite your first teammate above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
