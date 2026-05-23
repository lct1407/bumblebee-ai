"use client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export function GoogleSignInButton({ label }: { label?: string }) {
  const start = `${API_URL}/api/auth/google/start`;
  return (
    <a
      href={start}
      className="w-full inline-flex items-center justify-center gap-2.5 py-2.5 rounded-md border text-sm font-medium transition hover:bg-[var(--bg-subtle)]"
      style={{
        background: "var(--bg-surface)",
        borderColor: "var(--border)",
        color: "var(--text-primary)",
      }}
    >
      <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M21.35 11.1H12v3.2h5.34c-.23 1.43-1.65 4.2-5.34 4.2-3.21 0-5.83-2.66-5.83-5.94 0-3.28 2.62-5.94 5.83-5.94 1.83 0 3.05.78 3.75 1.45l2.55-2.46C16.7 3.94 14.55 3 12 3 6.99 3 2.94 7.04 2.94 12.06 2.94 17.07 6.99 21.11 12 21.11c6.92 0 9.49-4.86 9.49-7.39 0-.5-.05-.88-.14-1.62z"
          fill="#4285F4"
        />
      </svg>
      {label || "Continue with Google"}
    </a>
  );
}
