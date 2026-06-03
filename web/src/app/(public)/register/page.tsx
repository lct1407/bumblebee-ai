"use client";
import { motion } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api, setAuthToken, setActiveWorkspace } from "@/lib/api-client";
import { GoogleSignInButton } from "@/components/app/google-signin-button";
import { HexMark } from "@/components/ui/hex-mark";
import { BrandPanel } from "@/components/app/auth-brand-panel";

export const dynamic = "force-dynamic";

const inputStyle: React.CSSProperties = {
  background: "var(--bg-surface)",
  borderColor: "var(--border-strong)",
  color: "var(--text-primary)",
  borderRadius: "5px",
};

function passwordStrength(pw: string): { score: number; label: string; color: string } {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const tiers = [
    { label: "Too short", color: "var(--status-danger)" },
    { label: "Weak", color: "var(--status-danger)" },
    { label: "Fair", color: "var(--status-warning)" },
    { label: "Good", color: "var(--status-warning)" },
    { label: "Strong", color: "var(--status-success)" },
    { label: "Excellent", color: "var(--status-success)" },
  ];
  return { score, ...tiers[Math.min(score, 5)] };
}

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
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const strength = useMemo(() => passwordStrength(password), [password]);

  const register = useMutation({
    mutationFn: () =>
      api.post("/api/auth/register", { username, email, password }).then((r) => r.data),
    onSuccess: (data) => {
      setAuthToken(data.access_token);
      if (data.workspace) setActiveWorkspace(data.workspace.slug);
      router.push(plan ? `/onboard?plan=${plan}` : "/onboard");
    },
    onError: (e: any) => setError(e?.response?.data?.detail || "Registration failed"),
  });

  const canSubmit =
    username.trim().length >= 3 && /.+@.+\..+/.test(email) && password.length >= 8;

  return (
    <div className="min-h-screen grid lg:grid-cols-2" style={{ background: "var(--bg-canvas)" }}>
      <BrandPanel />

      <div className="flex items-center justify-center px-6 py-12">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-sm"
        >
          <Link href="/" className="flex items-center gap-2 mb-8 lg:hidden">
            <span style={{ color: "var(--accent)" }}><HexMark size={26} /></span>
            <span className="font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>bumblebee</span>
          </Link>

          <div className="masthead">
            <h1 className="t-display" style={{ color: "var(--text-primary)" }}>Create your account</h1>
            <p className="t-small mt-2" style={{ color: "var(--text-tertiary)" }}>
              Already have one?{" "}
              <Link href="/login" style={{ color: "var(--accent)" }} className="hover:underline">Sign in</Link>
              {plan && <span> · after signup → {plan} checkout</span>}
            </p>
          </div>

          <form
            className="mt-7 space-y-3.5"
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              if (canSubmit) register.mutate();
            }}
          >
            <div>
              <label className="t-overline block mb-1.5" style={{ color: "var(--text-tertiary)" }}>Username (3+ chars)</label>
              <input type="text" autoFocus value={username} onChange={(e) => setUsername(e.target.value)}
                className="w-full px-3 py-2.5 border text-sm outline-none focus:border-[var(--accent)]" style={inputStyle} />
            </div>
            <div>
              <label className="t-overline block mb-1.5" style={{ color: "var(--text-tertiary)" }}>Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2.5 border text-sm outline-none focus:border-[var(--accent)]" style={inputStyle} />
            </div>
            <div>
              <label className="t-overline block mb-1.5" style={{ color: "var(--text-tertiary)" }}>Password (8+ chars)</label>
              <div className="relative">
                <input type={showPw ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2.5 pr-10 border text-sm outline-none focus:border-[var(--accent)]" style={inputStyle} />
                <button type="button" onClick={() => setShowPw((s) => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded" style={{ color: "var(--text-tertiary)" }}
                  aria-label={showPw ? "Hide password" : "Show password"}>
                  {showPw ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24M1 1l22 22" /></svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                  )}
                </button>
              </div>
              {password.length > 0 && (
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex-1 flex gap-1">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <span key={i} className="h-1 flex-1 rounded-full" style={{ background: i < strength.score ? strength.color : "var(--bg-muted)" }} />
                    ))}
                  </div>
                  <span className="t-tiny" style={{ color: strength.color }}>{strength.label}</span>
                </div>
              )}
            </div>
            {error && (
              <div className="rounded-[5px] border p-2.5 text-xs"
                style={{ background: "var(--status-danger-bg)", borderColor: "var(--status-danger-border)", color: "var(--status-danger)" }}>
                {error}
              </div>
            )}
            <button type="submit" disabled={!canSubmit || register.isPending}
              className="w-full py-2.5 rounded-[5px] text-sm font-semibold transition disabled:opacity-50"
              style={{ background: "var(--accent)", color: "var(--accent-fg)" }}>
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
    </div>
  );
}
