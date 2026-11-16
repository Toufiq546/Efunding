import { describe, expect, it } from "vitest";
import { rankCampaigns, scoreMatch } from "./matching";
import type { Campaign, InvestorProfile } from "./types";

const campaign = (over: Partial<Campaign>): Campaign => ({
  id: "c", businessId: "b", title: "t", summary: "s", pitch: "", useOfFunds: "", type: "equity", sector: "Agriculture",
  location: "Rajshahi", risk: "medium", goal: 2_500_000, minInvestment: 25_000, deadline: "2099-01-01", terms: {},
  status: "live", createdAt: "2026-01-01", ...over,
});
const agro = campaign({ id: "c-agro" });
const solar = campaign({ id: "c-solar", type: "debt", sector: "Renewable Energy", location: "Dhaka", risk: "low", minInvestment: 10_000 });

const base: InvestorProfile = { userId: "x", sectors: [], locations: [], types: [], minTicket: 0, maxTicket: 1_000_000, risk: "high" };

describe("scoreMatch", () => {
  it("gives 100 when every preference matches", () => {
    const r = scoreMatch(agro, { ...base, sectors: ["Agriculture"], types: ["equity"], locations: ["Rajshahi"] });
    expect(r.score).toBe(100);
    expect(r.warnings).toHaveLength(0);
  });

  it("treats empty preferences as open but below an explicit match", () => {
    const open = scoreMatch(agro, base).score;
    const explicit = scoreMatch(agro, { ...base, sectors: ["Agriculture"] }).score;
    expect(open).toBeGreaterThan(50);
    expect(explicit).toBeGreaterThan(open);
  });

  it("penalises budget and risk mismatches with warnings", () => {
    const r = scoreMatch(agro, { ...base, maxTicket: 1000, risk: "low" });
    expect(r.warnings.join(" ")).toMatch(/above your maximum/);
    expect(r.warnings.join(" ")).toMatch(/riskier/);
  });

  it("ranks a better-fitting campaign first", () => {
    const ranked = rankCampaigns([agro, solar], { ...base, sectors: ["Renewable Energy"], types: ["debt"], risk: "low" });
    expect(ranked[0].campaign.id).toBe("c-solar");
  });
});
