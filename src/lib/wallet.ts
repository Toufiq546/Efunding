import type { Campaign, DB, Obligation } from "./types";

/**
 * Wallet: a money record built from each user's activity. FundBridge holds no money; these figures come from
 * pledges, funding and the repayments businesses record. Everything here uses only data the viewer may read
 * (row-level security), so an investor's wallet never needs other investors' pledges.
 */

export type EntryKind = "pledge" | "cancelled" | "invested" | "repayment-in" | "raised" | "repayment-out";

export interface WalletEntry {
  date: string;          // ISO
  kind: EntryKind;
  campaignId: string;
  label: string;
  amount: number;
  /** Money in (+), money out (−) or a commitment that isn't cash (0). */
  direction: 1 | -1 | 0;
}

export interface InvestorPosition {
  campaign: Campaign;
  amount: number;            // my active pledges
  state: "open" | "invested" | "closed";
  /** My share of the campaign's funding (0–1), once the total is known. */
  share: number;
  received: number;
  expected: number;
  /** Equity campaigns: % of the company this investment represents. */
  equityPercent?: number;
  /** Reward campaigns: the best tier this amount qualifies for. */
  reward?: string;
}

export interface InvestorWallet {
  pledgedOpen: number;
  invested: number;
  received: number;
  expected: number;
  positions: InvestorPosition[];
  entries: WalletEntry[];
}

export interface BusinessPosition {
  campaign: Campaign;
  pledged: number;   // total active pledges
  raised: number;    // funded total (0 until funded)
  repaid: number;
  owed: number;
  nextDue?: Obligation;
}

export interface BusinessWallet {
  pledgedOpen: number;
  raised: number;
  repaid: number;
  owed: number;
  nextDue?: Obligation & { campaign: Campaign };
  positions: BusinessPosition[];
  entries: WalletEntry[];
}

const repaymentsOf = (db: DB, campaignId: string) => db.obligations.filter((o) => o.campaignId === campaignId && o.kind === "repayment");
/** Amount actually repaid for an obligation: what the business recorded, else the scheduled amount. */
const paidAmount = (db: DB, o: Obligation) => db.updates.find((u) => u.id === o.updateId)?.amount ?? o.amount ?? 0;
const byDate = (a: WalletEntry, b: WalletEntry) => b.date.localeCompare(a.date);

export function investorWallet(db: DB, userId: string): InvestorWallet {
  const mine = db.pledges.filter((p) => p.investorId === userId);
  const entries: WalletEntry[] = [];
  const positions: InvestorPosition[] = [];

  for (const c of db.campaigns.filter((x) => mine.some((p) => p.campaignId === x.id))) {
    const pledges = mine.filter((p) => p.campaignId === c.id);
    for (const p of pledges) {
      entries.push({ date: p.createdAt, kind: "pledge", campaignId: c.id, label: `Pledged to ${c.title}`, amount: p.amount, direction: 0 });
    }
    const amount = pledges.filter((p) => p.status === "active").reduce((s, p) => s + p.amount, 0);
    const total = db.stats[c.id]?.raised ?? 0;
    const share = total > 0 ? amount / total : 0;
    const state: InvestorPosition["state"] = c.fundedOn ? "invested" : c.status === "live" ? "open" : "closed";
    let received = 0;
    let expected = 0;
    if (c.fundedOn && amount > 0) {
      entries.push({ date: `${c.fundedOn}T00:00:00.000Z`, kind: "invested", campaignId: c.id, label: `Investment confirmed: ${c.title}`, amount, direction: -1 });
      for (const o of repaymentsOf(db, c.id)) {
        if (o.status === "done") {
          const mineOfIt = Math.round(paidAmount(db, o) * share);
          received += mineOfIt;
          entries.push({ date: o.completedAt ?? `${o.dueOn}T00:00:00.000Z`, kind: "repayment-in", campaignId: c.id, label: `${o.title} from ${c.title} (your share)`, amount: mineOfIt, direction: 1 });
        } else if (o.status === "open") {
          expected += Math.round((o.amount ?? 0) * share);
        }
      }
    }
    if (amount > 0 || received > 0) {
      positions.push({
        campaign: c, amount, state, share, received, expected,
        equityPercent: c.type === "equity" && c.terms.equityPercent ? +(c.terms.equityPercent * (amount / c.goal)).toFixed(3) : undefined,
        reward: c.type === "reward" ? [...(c.terms.rewards ?? [])].sort((a, b) => b.amount - a.amount).find((r) => amount >= r.amount)?.title : undefined,
      });
    }
  }
  return {
    pledgedOpen: positions.filter((p) => p.state === "open").reduce((s, p) => s + p.amount, 0),
    invested: positions.filter((p) => p.state === "invested").reduce((s, p) => s + p.amount, 0),
    received: positions.reduce((s, p) => s + p.received, 0),
    expected: positions.reduce((s, p) => s + p.expected, 0),
    positions,
    entries: entries.sort(byDate),
  };
}

export function businessWallet(db: DB, userId: string): BusinessWallet {
  const entries: WalletEntry[] = [];
  const positions: BusinessPosition[] = [];
  for (const c of db.campaigns.filter((x) => x.businessId === userId && x.status !== "draft")) {
    const pledged = db.stats[c.id]?.raised ?? 0;
    const raised = c.fundedOn ? pledged : 0;
    let repaid = 0;
    let owed = 0;
    const open = repaymentsOf(db, c.id).filter((o) => o.status === "open").sort((a, b) => a.dueOn.localeCompare(b.dueOn));
    if (c.fundedOn) entries.push({ date: `${c.fundedOn}T00:00:00.000Z`, kind: "raised", campaignId: c.id, label: `Funds raised: ${c.title}`, amount: raised, direction: 1 });
    for (const o of repaymentsOf(db, c.id)) {
      if (o.status === "done") {
        const paid = paidAmount(db, o);
        repaid += paid;
        entries.push({ date: o.completedAt ?? `${o.dueOn}T00:00:00.000Z`, kind: "repayment-out", campaignId: c.id, label: `${o.title} to investors (${c.title})`, amount: paid, direction: -1 });
      } else if (o.status === "open") {
        owed += o.amount ?? 0;
      }
    }
    positions.push({ campaign: c, pledged, raised, repaid, owed, nextDue: open[0] });
  }
  const next = positions.filter((p) => p.nextDue).sort((a, b) => a.nextDue!.dueOn.localeCompare(b.nextDue!.dueOn))[0];
  return {
    pledgedOpen: positions.filter((p) => !p.campaign.fundedOn && p.campaign.status === "live").reduce((s, p) => s + p.pledged, 0),
    raised: positions.reduce((s, p) => s + p.raised, 0),
    repaid: positions.reduce((s, p) => s + p.repaid, 0),
    owed: positions.reduce((s, p) => s + p.owed, 0),
    nextDue: next ? { ...next.nextDue!, campaign: next.campaign } : undefined,
    positions,
    entries: entries.sort(byDate),
  };
}

/** Platform totals for admins. */
export function platformWallet(db: DB) {
  const live = db.campaigns.filter((c) => c.status === "live" && !c.fundedOn);
  const funded = db.campaigns.filter((c) => c.fundedOn);
  const repayments = db.obligations.filter((o) => o.kind === "repayment");
  const today = new Date().toISOString().slice(0, 10);
  return {
    pledgedOpen: live.reduce((s, c) => s + (db.stats[c.id]?.raised ?? 0), 0),
    raised: funded.reduce((s, c) => s + (db.stats[c.id]?.raised ?? 0), 0),
    repaid: repayments.filter((o) => o.status === "done").reduce((s, o) => s + paidAmount(db, o), 0),
    owed: repayments.filter((o) => o.status === "open").reduce((s, o) => s + (o.amount ?? 0), 0),
    overdueRepayments: repayments.filter((o) => o.status === "open" && o.dueOn < today).reduce((s, o) => s + (o.amount ?? 0), 0),
    fundedCount: funded.length,
  };
}
