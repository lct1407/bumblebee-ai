/**
 * Privacy Policy page — BB-8.
 * Plain-text legal copy. Replace with vetted policy before public launch.
 */
export const metadata = {
  title: "Privacy Policy · Bumblebee",
};

export default function PrivacyPage() {
  return (
    <article className="max-w-3xl mx-auto py-12 px-6 prose dark:prose-invert">
      <h1>Privacy Policy</h1>
      <p className="text-sm opacity-60">Last updated: 2026-05-23</p>

      <h2>What we collect</h2>
      <ul>
        <li>Account: email, username, password hash (bcrypt cost 13).</li>
        <li>Workspace: name, slug, plan, billing customer id.</li>
        <li>Issues: title, description, AI summary, status, scope hints.</li>
        <li>Events: workflow run logs, AI session metadata (no file content).</li>
        <li>Devices: hostname, platform, IP last seen, repo manifest paths.</li>
        <li>Billing: Stripe customer id, subscription state, last 4 of card.</li>
      </ul>

      <h2>What we DO NOT collect</h2>
      <ul>
        <li>Source code file contents (worker daemon runs LLM calls locally).</li>
        <li>Tracking cookies — first-party session cookies only.</li>
        <li>Cross-site advertising trackers.</li>
      </ul>

      <h2>Sub-processors</h2>
      <ul>
        <li>Stripe (payment processing)</li>
        <li>Anthropic (Claude API, only on server-side smart-tools)</li>
        <li>Google Vertex AI (Gemini, only when user opts in)</li>
        <li>Sentry (error tracking — opt-in via SENTRY_DSN config)</li>
      </ul>

      <h2>Data retention</h2>
      <p>
        Event logs retained for 90 days. Issues retained until workspace
        deletion. Billing records retained 7 years per accounting requirements.
      </p>

      <h2>GDPR rights</h2>
      <p>
        You may request data export or deletion by emailing
        <a href="mailto:privacy@bumblebee.dev"> privacy@bumblebee.dev</a>.
        We respond within 30 days.
      </p>

      <h2>Security</h2>
      <ul>
        <li>JWT bearer tokens, SHA-256 hashed API keys.</li>
        <li>Postgres at-rest encryption (host provider managed).</li>
        <li>TLS 1.2+ in transit.</li>
        <li>Node tokens hashed (SHA-256) at rest.</li>
      </ul>

      <h2>Contact</h2>
      <p>
        Email <a href="mailto:privacy@bumblebee.dev">privacy@bumblebee.dev</a>
        for any privacy-related questions.
      </p>
    </article>
  );
}
