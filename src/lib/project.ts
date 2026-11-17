import type { BusinessProfile, Campaign, Financials, PlatformSettings, Project, Reporting } from "./types";

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

export type Section = "Basics" | "Business" | "Accounts" | "Plan" | "Commitments";
export interface Problem { section: Section; message: string }

export function submitProblems(
  c: Campaign, business: BusinessProfile | undefined, p: Project | undefined, f: Financials | undefined, s: PlatformSettings,
): Problem[] {
  const out: Problem[] = [];
  const add = (section: Section, message: string) => out.push({ section, message });

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
