import type { BusinessProfile, Campaign, CampaignDocument, Financials, Obligation, PlatformSettings, Project, Reporting } from "./types";
import { DOC_KINDS } from "./types";

/** Project-page helpers. `submitProblems` mirrors the database's campaign_submit_problems() + campaigns_guard. */

export const emptyProject = (campaignId: string): Project => ({
  campaignId, story: "", products: "", highlights: [], team: [], fundItems: [], milestones: [], risks: [], returnPlan: {},
  reporting: "quarterly", customCommitments: [], contactName: "", contactRole: "", declarationName: "", acceptedCommitments: [],
});

export const emptyFinancials = (campaignId: string): Financials => ({ campaignId, history: [], projections: [], notes: "", checked: false });

export const REPORTING_LABEL: Record<Reporting, string> = { monthly: "Every month", quarterly: "Every 3 months", "half-yearly": "Every 6 months" };
const RANK: Record<Reporting, number> = { monthly: 1, quarterly: 2, "half-yearly": 3 };
/** Reporting choices at least as frequent as the platform minimum. */
export const allowedReporting = (min: Reporting) => (Object.keys(RANK) as Reporting[]).filter((r) => RANK[r] <= RANK[min]);

export const profitOf = (y: { revenue: number; costs: number }) => y.revenue - y.costs;
export const equityOf = (y: { assets: number; liabilities: number }) => y.assets - y.liabilities;
export const sum = (xs: number[]) => xs.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);

export type Section = "Eligibility" | "Basics" | "Business" | "Accounts" | "Plan" | "Commitments";
export interface Problem { section: Section; message: string }

/** Other data the eligibility checks look at. */
export interface EligibilityContext {
  campaigns: Campaign[];
  documents: CampaignDocument[];
  obligations: Obligation[];
}

export interface EligibilityCheck {
  key: "verified" | "years" | "goal" | "revenue" | "open" | "documents" | "overdue";
  label: string;
  /** null = depends on a specific campaign (shown as information on the dashboard). */
  ok: boolean | null;
  detail: string;
}

const lakh = (n: number) => (n >= 1e7 ? `৳${+(n / 1e7).toFixed(2)} crore` : `৳${+(n / 1e5).toFixed(2)} lakh`);

/**
 * Whether a business may raise funds (mirrors the Eligibility section of campaign_submit_problems()).
 * Without a campaign, campaign-specific checks come back with ok = null.
 */
export function eligibilityChecks(
  business: BusinessProfile | undefined, c: Campaign | undefined, f: Financials | undefined, s: PlatformSettings, ctx: EligibilityContext,
  now = new Date(),
): EligibilityCheck[] {
  const years = business?.foundedYear ? now.getFullYear() - business.foundedYear : -1;
  const open = ctx.campaigns.filter((x) => x.businessId === business?.userId && x.id !== c?.id && (x.status === "pending" || x.status === "live") && !x.fundedOn).length;
  const mine = new Set(ctx.campaigns.filter((x) => x.businessId === business?.userId).map((x) => x.id));
  const today = now.toISOString().slice(0, 10);
  const overdue = ctx.obligations.filter((o) => mine.has(o.campaignId) && o.status === "open" && o.dueOn < today).length;
  const latest = [...(f?.history ?? [])].sort((a, b) => b.year - a.year)[0];
  const docKinds = new Set(ctx.documents.filter((d) => d.campaignId === c?.id).map((d) => d.kind));
  const missingDocs = s.requiredDocKinds.filter((k) => !docKinds.has(k));
  const docLabel = (k: string) => DOC_KINDS.find(([x]) => x === k)?.[1].toLowerCase() ?? k;

  const checks: EligibilityCheck[] = [
    { key: "verified", label: "Business verified", ok: business?.verification === "verified",
      detail: business?.verification === "verified" ? "Trade licence and TIN checked by FundBridge" : "Submit your company profile for verification" },
    { key: "years", label: `Operating for at least ${s.minYearsOperating} year${s.minYearsOperating === 1 ? "" : "s"}`, ok: years >= s.minYearsOperating,
      detail: business?.foundedYear ? `Founded ${business.foundedYear}` : "Add your founding year to your company profile" },
    { key: "goal", label: `Goal between ${lakh(s.minGoal)} and ${lakh(s.maxGoal)}`, ok: c ? c.goal >= s.minGoal && c.goal <= s.maxGoal : null,
      detail: c ? `This campaign's goal: ${lakh(c.goal)}` : "Checked for each campaign" },
    { key: "open", label: `At most ${s.maxOpenCampaigns} campaign${s.maxOpenCampaigns === 1 ? "" : "s"} open or in review at a time`, ok: open < s.maxOpenCampaigns,
      detail: `${open} open or in review${c ? " besides this one" : ""}` },
    { key: "overdue", label: "No overdue commitments on earlier campaigns", ok: !s.blockIfOverdue || overdue === 0,
      detail: overdue ? `${overdue} overdue: post the updates first` : "All commitments up to date" },
  ];
  if (s.maxGoalToRevenue > 0) {
    checks.splice(3, 0, {
      key: "revenue", label: `Goal at most ${s.maxGoalToRevenue}× last year's sales`,
      ok: c ? !!latest && c.goal <= latest.revenue * s.maxGoalToRevenue : null,
      detail: !c ? "Checked against the accounts in each campaign" : latest ? `Sales ${latest.year}: ${lakh(latest.revenue)}, so up to ${lakh(latest.revenue * s.maxGoalToRevenue)}` : "Add your accounts first",
    });
  }
  if (s.requiredDocKinds.length) {
    checks.push({
      key: "documents", label: `Documents uploaded: ${s.requiredDocKinds.map(docLabel).join(", ")}`,
      ok: c ? missingDocs.length === 0 : null,
      detail: !c ? "Uploaded in each campaign's Accounts step" : missingDocs.length ? `Missing: ${missingDocs.map(docLabel).join(", ")}` : "All uploaded",
    });
  }
  return checks;
}

export function submitProblems(
  c: Campaign, business: BusinessProfile | undefined, p: Project | undefined, f: Financials | undefined, s: PlatformSettings,
  ctx?: EligibilityContext,
): Problem[] {
  const out: Problem[] = [];
  const add = (section: Section, message: string) => out.push({ section, message });
  if (ctx) {
    for (const ch of eligibilityChecks(business, c, f, s, ctx)) {
      if (ch.ok === false && ch.key !== "verified") add("Eligibility", `${ch.label}. ${ch.detail}`);
    }
  }

  if (business?.verification !== "verified") add("Basics", "Your business must be verified before you can submit");
  if (c.deadline <= new Date().toISOString().slice(0, 10)) add("Basics", "The deadline must be in the future");
  if (c.type === "equity" && !c.terms.equityPercent) add("Basics", "Enter the equity % offered");
  if (c.type === "debt" && (c.terms.interestRate == null || !c.terms.tenorMonths)) add("Basics", "Enter the interest rate and tenor");
  if (c.type === "reward" && !c.terms.rewards?.length) add("Basics", "Add at least one reward tier");

  if (!p) {
    add("Business", "Fill in the project page (business, accounts, plan and commitments)");
    return out;
  }
  if (p.story.trim().length < 50) add("Business", "Describe your business in at least 50 characters");
  if (p.team.length === 0) add("Business", "Add at least one team member");

  if ((f?.history.length ?? 0) < s.minAccountYears) add("Accounts", `Add results for at least ${s.minAccountYears} years`);

  const total = sum(p.fundItems.map((x) => x.amount));
  if (p.fundItems.length === 0) add("Plan", "List how you will use the money");
  else if (total !== c.goal) add("Plan", `Use-of-funds items add up to ${total.toLocaleString("en-IN")} but the goal is ${c.goal.toLocaleString("en-IN")}`);
  if (p.milestones.length === 0) add("Plan", "Add at least one milestone");
  if (p.risks.length === 0) add("Plan", "Add at least one risk and how you will handle it");
  if (c.type === "debt" && !p.returnPlan.schedule?.length) add("Plan", "Add a repayment schedule");
  if (c.type === "equity" && !`${p.returnPlan.dividendPolicy ?? ""}${p.returnPlan.exitPlan ?? ""}`.trim()) add("Plan", "Explain how equity investors get returns (dividends or exit)");
  if (c.type === "reward" && !p.returnPlan.delivery?.trim()) add("Plan", "Say when backers will receive their rewards");

  if (RANK[p.reporting] > RANK[s.minReporting]) add("Commitments", `Send updates at least ${s.minReporting}`);
  if (!p.contactName.trim()) add("Commitments", "Name the person investors can contact");
  if (!p.declaredAt) add("Commitments", "Accept the commitments declaration");
  return out;
}
