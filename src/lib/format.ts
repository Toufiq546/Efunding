import type { Campaign, CampaignType, DB } from "./types";

const money = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

/** A settings list plus the record's current value, so editing never silently drops a value an admin removed. */
export const withCurrent = (list: string[], current?: string) => (current && !list.includes(current) ? [current, ...list] : list);

/** True for a real web address (http or https) that's safe to link to. */
export const isWebUrl = (s?: string) => !!s && /^https?:\/\/[^\s/$.?#][^\s]*\.[^\s]{2,}$/i.test(s.trim());

/** Short taka amount in lakh/crore, e.g. ৳28.1 lakh, ৳1.2 crore (for tight spaces). */
export const formatMoneyShort = (n: number) =>
  n >= 1e7 ? `৳${+(n / 1e7).toFixed(1)} crore` : n >= 1e5 ? `৳${+(n / 1e5).toFixed(1)} lakh` : `৳${money.format(n)}`;

export const formatMoney = (n: number) => `৳${money.format(n)}`;

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export const daysLeft = (deadline: string) => {
  const ms = new Date(deadline + "T23:59:59").getTime() - Date.now();
  return Math.ceil(ms / 86_400_000);
};

export const TYPE_LABEL: Record<CampaignType, string> = {
  equity: "Equity",
  debt: "Debt / Lending",
  reward: "Reward",
};

export const TYPE_STYLE: Record<CampaignType, string> = {
  equity: "bg-violet-100 text-violet-800",
  debt: "bg-sky-100 text-sky-800",
  reward: "bg-amber-100 text-amber-800",
};

/** Totals come from the campaign_stats view, so they include pledges the viewer cannot see individually. */
export const raisedFor = (db: DB, campaignId: string) => db.stats[campaignId]?.raised ?? 0;
export const backersFor = (db: DB, campaignId: string) => db.stats[campaignId]?.backers ?? 0;

/** A live campaign whose deadline has passed is shown as closed. */
export function effectiveStatus(c: Campaign) {
  if (c.status === "live" && daysLeft(c.deadline) < 0) return "closed" as const;
  return c.status;
}

export function termsSummary(c: Campaign) {
  const t = c.terms;
  if (c.type === "equity" && t.equityPercent) {
    return `${t.equityPercent}% equity${t.valuation ? ` at ${formatMoney(t.valuation)} valuation` : ""}`;
  }
  if (c.type === "debt" && t.interestRate) {
    return `${t.interestRate}% p.a. for ${t.tenorMonths ?? "?"} months`;
  }
  if (c.type === "reward" && t.rewards?.length) {
    return `${t.rewards.length} reward tier${t.rewards.length > 1 ? "s" : ""}`;
  }
  return "Terms to be confirmed";
}
