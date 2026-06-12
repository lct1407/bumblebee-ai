"use client";
/**
 * In-app help / getting-started guide. Mirrors docs/user-guide-vi.md
 * but inline so users don't need to leave the app.
 */
import Link from "next/link";
import { motion } from "framer-motion";
import { useState } from "react";

type Section = {
  id: string;
  emoji: string;
  title: string;
  blurb: string;
};

const SECTIONS: Section[] = [
  {
    id: "what",
    emoji: "🐝",
    title: "Bumblebee là gì",
    blurb: "Trợ lý AI quản lý task — bạn brief, AI làm, code không rời máy bạn.",
  },
  {
    id: "first-project",
    emoji: "📁",
    title: "Tạo project đầu tiên",
    blurb: "Link với Git repo của bạn, set base branch + staging branch.",
  },
  {
    id: "pair-device",
    emoji: "💻",
    title: "Pair máy của bạn (worker)",
    blurb: "Bumblebee gửi task về máy bạn để chạy — không upload code lên server.",
  },
  {
    id: "first-issue",
    emoji: "✏️",
    title: "Tạo issue đầu tiên",
    blurb: "Triager AI tự phân tích complexity + đề xuất scope + acceptance criteria.",
  },
  {
    id: "approve",
    emoji: "✅",
    title: "Approval flow",
    blurb: "Simple task tự chạy nếu bật policy. Phức tạp thì cần bạn duyệt.",
  },
  {
    id: "claude-code",
    emoji: "🔌",
    title: "Tích hợp Claude Code / Cursor / Codex",
    blurb: "Ship 11 role prompts vào repo để tool ngoài cũng dùng được.",
  },
  {
    id: "billing",
    emoji: "💳",
    title: "Billing",
    blurb: "Free $0 (5 issues) · Pro $20/seat · Team $100 + metered LLM cost.",
  },
];

const CLI_REFERENCE: Array<{ cmd: string; desc: string }> = [
  { cmd: "bb login <username>", desc: "Đăng nhập, lưu token vào ~/.bumblebee/cli.json" },
  { cmd: "bb whoami", desc: "Xem workspace hiện tại" },
  { cmd: "bb issue list --project bb", desc: "List issues" },
  { cmd: 'bb issue create "fix login bug"', desc: "Tạo issue mới" },
  { cmd: "bb device pair", desc: "Pair máy này làm worker" },
  { cmd: "bb device save-token <token>", desc: "Lưu node token sau khi confirm trên web" },
  { cmd: "bb daemon", desc: "Run worker daemon — long-poll claim tasks" },
  { cmd: "bb skills install --target=claude-code", desc: "Ship role prompts vào .claude/agents/" },
  { cmd: "bb skills targets", desc: "List install targets" },
];

export default function HelpPage() {
  const [open, setOpen] = useState<string | null>("what");

  return (
    <div className="max-w-4xl mx-auto py-8 space-y-10">
      <header>
        <h1 className="t-h1 mb-2">Hướng dẫn sử dụng</h1>
        <p className="t-body" style={{ color: "var(--text-tertiary)" }}>
          Cài đặt từ A → Z trong 5 phút. Cần thêm? Xem{" "}
          <Link
            href="/docs"
            className="underline"
            style={{ color: "var(--accent)" }}
          >
            full guide
          </Link>{" "}
          hoặc email <code>support@bumblebee.dev</code>.
        </p>
      </header>

      {/* Quick links */}
      <nav className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Link
          href="/onboard"
          className="p-4 rounded-xl border hover:shadow transition"
          style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
        >
          <div className="text-2xl mb-1">🚀</div>
          <div className="font-medium">Onboarding wizard</div>
          <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>
            Step-by-step wizard cho người mới
          </div>
        </Link>
        <Link
          href="/settings/devices"
          className="p-4 rounded-xl border hover:shadow transition"
          style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
        >
          <div className="text-2xl mb-1">💻</div>
          <div className="font-medium">Pair device</div>
          <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>
            Link máy bạn để chạy AI tasks
          </div>
        </Link>
        <Link
          href="/issues"
          className="p-4 rounded-xl border hover:shadow transition"
          style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
        >
          <div className="text-2xl mb-1">✏️</div>
          <div className="font-medium">Tạo issue</div>
          <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>
            Brief AI: bug fix / feature / chore
          </div>
        </Link>
        <Link
          href="/settings/billing"
          className="p-4 rounded-xl border hover:shadow transition"
          style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
        >
          <div className="text-2xl mb-1">💳</div>
          <div className="font-medium">Plan & billing</div>
          <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>
            Free → Pro → Team
          </div>
        </Link>
        <Link
          href="/docs"
          className="p-4 rounded-xl border hover:shadow transition"
          style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
        >
          <div className="text-2xl mb-1">📚</div>
          <div className="font-medium">Tài liệu đầy đủ</div>
          <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>
            Hướng dẫn chi tiết từng tính năng
          </div>
        </Link>
      </nav>

      {/* Sections accordion */}
      <section className="space-y-2">
        {SECTIONS.map((s) => {
          const expanded = open === s.id;
          return (
            <div
              key={s.id}
              className="rounded-xl border overflow-hidden"
              style={{
                background: "var(--bg-surface)",
                borderColor: "var(--border)",
              }}
            >
              <button
                onClick={() => setOpen(expanded ? null : s.id)}
                className="w-full px-5 py-4 flex items-center gap-4 text-left hover:bg-[var(--bg-subtle)] transition"
              >
                <span className="text-2xl">{s.emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{s.title}</div>
                  <div
                    className="text-xs truncate"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    {s.blurb}
                  </div>
                </div>
                <span style={{ color: "var(--text-tertiary)" }}>
                  {expanded ? "−" : "+"}
                </span>
              </button>
              {expanded && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  className="px-5 pb-5 pt-1 text-sm space-y-3"
                  style={{ color: "var(--text-secondary)" }}
                >
                  <SectionBody id={s.id} />
                </motion.div>
              )}
            </div>
          );
        })}
      </section>

      {/* CLI reference */}
      <section
        className="rounded-xl border p-6"
        style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
      >
        <h2 className="t-h3 mb-1">CLI reference</h2>
        <p
          className="text-sm mb-4"
          style={{ color: "var(--text-tertiary)" }}
        >
          Full help: <code>bb --help</code>
        </p>
        <div className="space-y-2">
          {CLI_REFERENCE.map((row) => (
            <div
              key={row.cmd}
              className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-2 md:gap-4 py-2 border-b last:border-0"
              style={{ borderColor: "var(--border)" }}
            >
              <code
                className="px-2 py-1 rounded text-xs font-mono"
                style={{ background: "var(--bg-subtle)" }}
              >
                {row.cmd}
              </code>
              <div className="text-sm" style={{ color: "var(--text-tertiary)" }}>
                {row.desc}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Footer help */}
      <footer
        className="rounded-xl p-6 text-center"
        style={{ background: "var(--bg-subtle)" }}
      >
        <p className="text-sm mb-2">Vẫn cần giúp đỡ?</p>
        <div className="flex justify-center gap-3 text-sm">
          <a
            href="mailto:support@bumblebee.dev"
            className="underline"
            style={{ color: "var(--accent)" }}
          >
            📧 support@bumblebee.dev
          </a>
          <a
            href="https://github.com/lct1407/bumblebee/issues"
            target="_blank"
            rel="noopener"
            className="underline"
            style={{ color: "var(--accent)" }}
          >
            🐛 Báo bug
          </a>
        </div>
      </footer>
    </div>
  );
}

function SectionBody({ id }: { id: string }) {
  switch (id) {
    case "what":
      return (
        <>
          <p>
            Bạn brief task (bug fix, feature, refactor). Triager AI đọc issue,
            classify <strong>simple / medium / complex</strong>, đề xuất scope +
            acceptance criteria. Sau khi bạn approve, các vai trò khác (Planner,
            Implementer, Tester, Reviewer, Merger) chạy theo workflow.
          </p>
          <p>
            <strong>Code không upload lên server.</strong> Worker daemon chạy trên
            máy bạn (cài qua <code>bb daemon</code>), pull task description về,
            chạy local Claude CLI + git + tests.
          </p>
        </>
      );
    case "first-project":
      return (
        <ol className="list-decimal list-inside space-y-1">
          <li>
            <Link
              href="/settings/projects"
              className="underline"
              style={{ color: "var(--accent)" }}
            >
              Settings → Projects
            </Link>{" "}
            → <strong>New project</strong>
          </li>
          <li>Đặt tên (ví dụ "My Web App") + key tối đa 10 ký tự UPPERCASE (MWA)</li>
          <li>
            <strong>Repository path:</strong> URL Git (github.com/you/repo) hoặc
            đường dẫn local tuyệt đối
          </li>
          <li>
            <strong>Base branch:</strong> main / master
          </li>
          <li>
            (Tuỳ chọn) Bật <em>Auto-execute simple tasks</em> trong project
            settings nếu muốn AI tự chạy task đơn giản không cần approve
          </li>
        </ol>
      );
    case "pair-device":
      return (
        <>
          <p>
            Trên máy bạn (terminal):{" "}
            <code className="px-1.5 py-0.5 rounded text-xs"
                  style={{ background: "var(--bg-subtle)" }}>
              bb device pair --server &lt;url&gt;
            </code>
          </p>
          <p>
            CLI in ra <strong>pairing code 8 ký tự</strong>. Mở{" "}
            <Link
              href="/settings/devices"
              className="underline"
              style={{ color: "var(--accent)" }}
            >
              Settings → Devices
            </Link>{" "}
            → nhập code → web trả về <strong>node token</strong>.
          </p>
          <p>
            Lưu token:{" "}
            <code
              className="px-1.5 py-0.5 rounded text-xs"
              style={{ background: "var(--bg-subtle)" }}
            >
              bb device save-token nt_xxxxx
            </code>{" "}
            rồi start daemon:{" "}
            <code
              className="px-1.5 py-0.5 rounded text-xs"
              style={{ background: "var(--bg-subtle)" }}
            >
              bb daemon
            </code>
          </p>
        </>
      );
    case "first-issue":
      return (
        <>
          <p>
            <Link
              href="/issues"
              className="underline"
              style={{ color: "var(--accent)" }}
            >
              Issues
            </Link>{" "}
            → <strong>+ New Issue</strong>. Title ngắn (1 dòng), description chi
            tiết (paste error log, screenshot, expected vs actual).
          </p>
          <p>
            Sau 10-30 giây Triager agent update:{" "}
            <strong>complexity / AI summary / suggested solution / scope hints</strong>.
          </p>
          <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
            Cũng có thể tạo qua CLI:{" "}
            <code className="px-1 py-0.5 rounded"
                  style={{ background: "var(--bg-subtle)" }}>
              bb issue create "fix login bug" --project mwa
            </code>
          </p>
        </>
      );
    case "approve":
      return (
        <>
          <p>
            <strong>Simple + auto-execute policy ON</strong> → AI tự chạy ngay.
          </p>
          <p>
            <strong>Simple/Medium/Complex + chưa Approved</strong> → block. Mở
            issue → đọc Suggested Solution → edit acceptance criteria nếu cần →
            click <strong>Approve</strong> → click{" "}
            <strong>Trigger Workflow</strong>.
          </p>
          <p>
            Bumblebee tự chọn workflow: simple/medium →{" "}
            <code>simple-fix-flow</code>, complex →{" "}
            <code>feature-complex-flow</code> (Coordinator phân rã + parallel
            Implementers).
          </p>
        </>
      );
    case "claude-code":
      return (
        <>
          <p>
            Ship 11 role prompts (Triager, Implementer, Reviewer, ...) vào repo
            để Claude Code / Cursor / Codex tự dùng:
          </p>
          <pre
            className="p-3 rounded text-xs overflow-x-auto"
            style={{ background: "var(--bg-subtle)" }}
          >{`bb skills install --target=claude-code   # .claude/agents/
bb skills install --target=cursor        # .cursor/rules/
bb skills install --target=codex         # AGENTS.md
bb skills install --target=generic       # .bumblebee/agents/`}</pre>
          <p>
            Sau đó hỏi Claude Code:{" "}
            <em>"Act as the Bumblebee Reviewer role and review my latest diff"</em>{" "}
            — nó đọc role markdown và follow system prompt.
          </p>
        </>
      );
    case "billing":
      return (
        <div
          className="rounded overflow-hidden border"
          style={{ borderColor: "var(--border)" }}
        >
          <table className="w-full text-sm">
            <thead style={{ background: "var(--bg-subtle)" }}>
              <tr className="text-left">
                <th className="px-3 py-2">Plan</th>
                <th className="px-3 py-2">Giá</th>
                <th className="px-3 py-2">Issues / workspaces / LLM</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className="px-3 py-2 font-medium">Free</td>
                <td className="px-3 py-2">$0</td>
                <td className="px-3 py-2">5 issues / 1 ws / $1 LLM mo</td>
              </tr>
              <tr className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className="px-3 py-2 font-medium">Pro</td>
                <td className="px-3 py-2">$20 / seat / mo</td>
                <td className="px-3 py-2">∞ / 5 ws / $20 LLM mo</td>
              </tr>
              <tr className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className="px-3 py-2 font-medium">Team</td>
                <td className="px-3 py-2">$100 + LLM passthrough</td>
                <td className="px-3 py-2">∞ / ∞ / metered usage</td>
              </tr>
            </tbody>
          </table>
        </div>
      );
    default:
      return null;
  }
}
