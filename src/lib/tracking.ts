import type { Campaign, Obligation, PlatformSettings, Project } from "./types";

/** Commitment tracking helpers. `generateObligations` mirrors the database's admin_mark_funded(). */

export type ObligationState = "done" | "waived" | "overdue" | "due-soon" | "upcoming";

export const today = () => new Date().toISOString().slice(0, 10);

export function addMonths(isoDate: string, months: number) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  // Postgres keeps the day where it can and clamps to the month's last day (Jan 31 + 1 month = Feb 28).
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}

const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

export function obligationState(o: Obligation, dueSoonDays: number, now = today()): ObligationState {
  if (o.status === "done") return "done";
  if (o.status === "waived") return "waived";
  if (o.dueOn < now) return "overdue";
  return daysBetween(now, o.dueOn) <= dueSoonDays ? "due-soon" : "upcoming";
}

export interface Compliance { total: number; due: number; done: number; onTime: number; overdue: number; dueSoon: number }

/** Track record for a set of obligations: of those already due, how many were done (and done on time). */
export function compliance(list: Obligation[], dueSoonDays: number, now = today()): Compliance {
  const states = list.map((o) => obligationState(o, dueSoonDays, now));
  const due = list.filter((o) => o.status !== "waived" && (o.dueOn < now || o.status === "done"));
  return {
    total: list.length,
    due: due.length,
    done: list.filter((o) => o.status === "done").length,
    onTime: due.filter((o) => o.status === "done" && (o.completedAt ?? "").slice(0, 10) <= o.dueOn).length,
    overdue: states.filter((s) => s === "overdue").length,
    dueSoon: states.filter((s) => s === "due-soon").length,
  };
}

export function generateObligations(c: Campaign, p: Project | undefined, s: PlatformSettings, fundedOn: string, newId: () => string): Obligation[] {
  const out: Obligation[] = [];
  const add = (kind: Obligation["kind"], title: string, months: number, amount?: number) =>
    out.push({ id: newId(), campaignId: c.id, kind, title, dueOn: addMonths(fundedOn, months), amount: amount || undefined, status: "open" });

  const reporting = p?.reporting ?? "quarterly";
  const step = reporting === "monthly" ? 1 : reporting === "quarterly" ? 3 : 6;
  const label = reporting === "monthly" ? "Monthly" : reporting === "quarterly" ? "Quarterly" : "Half-yearly";
  for (let n = 1; n <= Math.floor(s.trackingMonths / step); n++) add("update", `${label} progress update ${n}`, n * step);
  for (let n = 1; n <= Math.floor(s.trackingMonths / 12); n++) add("accounts", `Yearly accounts, year ${n}`, n * 12);
  const schedule = c.type === "debt" ? p?.returnPlan.schedule ?? [] : [];
  schedule.forEach((r, i) => add("repayment", `Repayment ${i + 1} of ${schedule.length}`, r.month, r.amount));
  for (const m of p?.milestones ?? []) {
    const n = /^\s*month\s+(\d+)/i.exec(m.when);
    if (n) add("milestone", m.what || "Milestone", Number(n[1]));
  }
  if (c.type === "reward") add("delivery", "Deliver rewards to backers", s.deliveryMonths);
  return out;
}
