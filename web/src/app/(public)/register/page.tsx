"use client";
import { motion } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api, setAuthToken, setActiveWorkspace } from "@/lib/api-client";
import { GoogleSignInButton } from "@/components/app/google-signin-button";

export const dynamic = "force-dynamic";

const inputStyle: React.CSSProperties = {
  background: "var(--bg-surface)",
  borderColor: "var(--border)",
  color: "var(--text-primary)",
};

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" style={{ background: "var(--bg-canvas)" }} />}>
      <RegisterInner />
    </Suspense>
  );
}

function RegisterInner() {
  const router = useRouter();
  const search = useSearchParams();
  const plan = search.get("plan"); // optional preselected plan from /pricing

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const register = useMutation({
    mutationFn: () =>
      api
        .post("/api/auth/register", { username, email, password })
        .then((r) => r.data),
    onSuccess: (data) => {
      setAuthToken(data.access_token);
      if (data.workspace) setActiveWorkspace(data.workspace.slug);
      // Send paid signups straight into onboard with plan preserved
      router.push(plan ? `/onboard?plan=${plan}` : "/onboard");
    },
    onError: (e: any) => setError(e?.response?.data?.detail || "Registration failed"),
  });

  const canSubmit =
    username.trim().length >= 3 &&
    /.+@.+\..+/.test(email) &&
    password.length >= 8;

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: "var(--bg-canvas)" }}
    >
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md rounded-2xl border p-8"
        style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
      >
        <Link href="/" className="flex items-center gap-2 mb-6">
          <span
            className="w-7 h-7 rounded-md flex items-center justify-center text-base font-bold"
            style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
          >
            B
          </span>
          <span className="font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
            Bumblebee
          </span>
        </Link>

        <h1 className="t-display" style={{ color: "var(--text-primary)" }}>
          Create your account
        </h1>
        <p className="t-small mt-1" style={{ color: "var(--text-tertiary)" }}>
          Already have one?{" "}
          <Link href="/login" style={{ color: "var(--accent)" }} className="hover:underline">
            Sign in
          </Link>
          {plan && (
            <>
              {" · "}
              <span style={{ color: "var(--text-tertiary)" }}>
                After signup → {plan} checkout
              </span>
            </>
          )}
        </p>

        <form
          className="mt-6 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            if (canSubmit) register.mutate();
          }}
        >
          <div>
            <label className="t-overline block mb-1" style={{ color: "var(--text-tertiary)" }}>
              Username (3+ chars)
            </label>
            <input
              type="text"
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3 py-2 rounded-md border text-sm outline-none focus:border-[var(--accent)]"
              style={inputStyle}
            />
          </div>
          <div>
            <label className="t-overline block mb-1" style={{ color: "var(--text-tertiary)" }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 rounded-md border text-sm outline-none focus:border-[var(--accent)]"
              style={inputStyle}
            />
          </div>
          <div>
            <label className="t-overline block mb-1" style={{ color: "var(--text-tertiary)" }}>
              Password (8+ chars)
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 rounded-md border text-sm outline-none focus:border-[var(--accent)]"
              style={inputStyle}
            />
          </div>
          {error && (
            <div
              className="rounded-md border p-2 text-xs"
              style={{
                background: "var(--status-danger-bg)",
                borderColor: "var(--status-danger-border)",
                color: "var(--status-danger)",
              }}
            >
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={!canSubmit || register.isPending}
            className="w-full py-2.5 rounded-md text-sm font-medium transition disabled:opacity-50"
            style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
          >
            {register.isPending ? "Creating…" : "Create account"}
          </button>
        </form>

        <div className="my-5 flex items-center gap-2">
          <span className="flex-1 h-px" style={{ background: "var(--border)" }} />
          <span className="t-tiny" style={{ color: "var(--text-tertiary)" }}>or</span>
          <span className="flex-1 h-px" style={{ background: "var(--border)" }} />
        </div>

        <GoogleSignInButton label="Continue with Google" />
      </motion.div>
    </div>
  );
}
