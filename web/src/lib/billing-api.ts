/** Billing API client (Phase D). */
import { api } from "@/lib/api-client";

export interface Plan {
  key: "free" | "pro" | "team";
  display_name: string;
  blurb: string;
  monthly_usd: number;
  llm_cap_cents: number | null;
  max_active_issues: number | null;
  max_workspaces: number;
  seats_included: number;
  features: string[];
}

export interface BillingState {
  plan: "free" | "pro" | "team";
  plan_display_name: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  llm_spend_cents_this_period: number;
  llm_cap_cents: number | null;
  period_started_at: string | null;
  payment_overdue: boolean;
  payment_overdue_since: string | null;
}

export interface Invoice {
  id: string;
  number: string | null;
  status: string;
  amount_paid: number;
  amount_due: number;
  currency: string;
  hosted_invoice_url: string | null;
  invoice_pdf: string | null;
  created: number;
  period_start: number;
  period_end: number;
}

export const BillingApi = {
  listPlans: () =>
    api.get<{ plans: Plan[]; billing_enabled: boolean }>("/api/billing/plans").then((r) => r.data),
  state: (workspaceId: string) =>
    api.get<BillingState>(`/api/billing/workspace/${workspaceId}`).then((r) => r.data),
  invoices: (workspaceId: string) =>
    api.get<{ invoices: Invoice[] }>(`/api/billing/workspace/${workspaceId}/invoices`).then((r) => r.data),
  createCheckoutSession: (workspaceId: string, plan: "pro" | "team", seats = 1) =>
    api
      .post<{ session_id: string; url: string }>(
        `/api/billing/workspace/${workspaceId}/checkout-session`,
        { plan, seats },
      )
      .then((r) => r.data),
  cancel: (workspaceId: string) =>
    api.post(`/api/billing/workspace/${workspaceId}/cancel`).then((r) => r.data),
};
