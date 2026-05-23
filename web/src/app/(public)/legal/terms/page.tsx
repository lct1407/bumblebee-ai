/**
 * Terms of Service page — BB-8.
 * Plain-text legal copy. Replace with vetted ToS before public launch.
 */
export const metadata = {
  title: "Terms of Service · Bumblebee",
};

export default function TermsPage() {
  return (
    <article className="max-w-3xl mx-auto py-12 px-6 prose dark:prose-invert">
      <h1>Terms of Service</h1>
      <p className="text-sm opacity-60">Last updated: 2026-05-23</p>

      <h2>1. Acceptance</h2>
      <p>
        By creating a Bumblebee account or using the service you agree to these
        terms. If you do not agree, do not use the service.
      </p>

      <h2>2. Service description</h2>
      <p>
        Bumblebee provides multi-agent AI orchestration for software task
        management. The service does not host customer source code — code stays
        on devices the user pairs with the service.
      </p>

      <h2>3. Acceptable use</h2>
      <ul>
        <li>No use for illegal activity, malware, or content prohibited by law.</li>
        <li>No reverse-engineering of the service or circumventing access controls.</li>
        <li>No automated abuse of the LLM-call budget (we reserve the right to throttle).</li>
      </ul>

      <h2>4. Billing</h2>
      <p>
        Paid plans renew monthly. You may cancel at any time; access continues
        through the end of the paid period. Refunds are not provided for unused
        days. LLM passthrough usage on the Team plan is billed in arrears.
      </p>

      <h2>5. Data & content</h2>
      <p>
        We store: issue titles, descriptions, AI-generated summaries, event
        logs, and billing records. We do not upload source-code file contents to
        our servers; the worker daemon executes locally on devices you control.
      </p>

      <h2>6. Termination</h2>
      <p>
        You may delete your workspace at any time from Settings → Workspace.
        Deletion is irreversible after 30 days; within 30 days you may request
        restore by emailing support.
      </p>

      <h2>7. Disclaimers</h2>
      <p>
        The service is provided as-is. AI-generated code may contain errors;
        you are responsible for reviewing and testing before merging to your
        protected branches.
      </p>

      <h2>8. Contact</h2>
      <p>
        Questions? Email <a href="mailto:support@bumblebee.dev">support@bumblebee.dev</a>.
      </p>
    </article>
  );
}
