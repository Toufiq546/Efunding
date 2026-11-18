import { describe, expect, it } from "vitest";
import { businessWallet, investorWallet, platformWallet } from "./wallet";
import { demoSeed } from "./demo/seed";
import type { CampaignStats, DB } from "./types";

// Build the DB the app sees (stats are derived from active pledges, as the database view does).
const seed = demoSeed();
const stats: Record<string, CampaignStats> = {};
for (const c of seed.campaigns) {
  const active = seed.pledges.filter((p) => p.campaignId === c.id && p.status === "active");
  stats[c.id] = { raised: active.reduce((s, p) => s + p.amount, 0), backers: new Set(active.map((p) => p.investorId)).size };
}
const db: DB = { ...seed, stats, financialSummary: {} };

describe("investorWallet", () => {
  const w = investorWallet(db, "u-inv1"); // Nadia: ৳12 lakh of the ৳18 lakh in the funded solar campaign
  it("splits pledged (open) from invested (funded)", () => {
    expect(w.pledgedOpen).toBe(350000);
    expect(w.invested).toBe(1200000);
  });
  it("credits her pro-rata share of each recorded repayment", () => {
    expect(w.received).toBe(666000); // 2/3 of ৳9,99,000
    expect(w.expected).toBe(666000); // 2/3 of the remaining repayment
    expect(w.entries.find((e) => e.kind === "repayment-in")).toMatchObject({ amount: 666000, direction: 1 });
  });
  it("shows equity held and rewards due", () => {
    expect(w.positions.find((p) => p.campaign.id === "c-agro")?.equityPercent).toBe(0.8); // 10% × 2,00,000 / 25,00,000
    const karim = investorWallet(db, "u-inv2");
    expect(karim.positions.find((p) => p.campaign.id === "c-loom")?.reward).toBe("Jamdani dupatta");
  });
});

describe("businessWallet", () => {
  const w = businessWallet(db, "u-biz2"); // SunRoof: one live, one funded campaign
  it("tracks raised, repaid and still owed", () => {
    expect(w).toMatchObject({ pledgedOpen: 200000, raised: 1800000, repaid: 999000, owed: 999000 });
    expect(w.nextDue?.title).toBe("Repayment 2 of 2");
  });
});

describe("platformWallet", () => {
  it("adds up the whole platform", () => {
    const p = platformWallet(db);
    expect(p).toMatchObject({ raised: 1800000, repaid: 999000, owed: 999000, fundedCount: 1 });
    expect(p.pledgedOpen).toBe(800000 + 200000 + 5000);
  });
});
