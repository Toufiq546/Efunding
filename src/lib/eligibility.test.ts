import { describe, expect, it } from "vitest";
import { eligibilityChecks, submitProblems } from "./project";
import { demoSeed } from "./demo/seed";
import { DEFAULT_SETTINGS, type Campaign } from "./types";
import { fillPlaceholders, BUILT_IN } from "./manual";

const seed = demoSeed();
const ctx = { campaigns: seed.campaigns, documents: seed.documents, obligations: seed.obligations };
const now = new Date("2026-11-18T12:00:00Z");
const status = (checks: ReturnType<typeof eligibilityChecks>) => Object.fromEntries(checks.map((c) => [c.key, c.ok]));

describe("eligibilityChecks (mirrors campaign_submit_problems)", () => {
  it("passes a verified, established business with a sensible campaign", () => {
    const c = seed.campaigns.find((x) => x.id === "c-loom")!;
    const biz = seed.businesses.find((b) => b.userId === c.businessId);
    expect(status(eligibilityChecks(biz, c, seed.financials[c.id], DEFAULT_SETTINGS, ctx, now)))
      .toEqual({ verified: true, years: true, goal: true, revenue: true, open: true, overdue: true, documents: true });
  });

  it("flags each rule that fails", () => {
    const biz = { ...seed.businesses.find((b) => b.userId === "u-biz2")!, foundedYear: 2026 }; // SunRoof: has an overdue update
    const c: Campaign = { ...seed.campaigns.find((x) => x.id === "c-solar")!, id: "new", goal: 90_000_000, status: "draft" };
    const s = { ...DEFAULT_SETTINGS, maxOpenCampaigns: 1 };
    expect(status(eligibilityChecks(biz, c, seed.financials["c-solar"], s, ctx, now)))
      .toEqual({ verified: true, years: false, goal: false, revenue: false, open: false, overdue: false, documents: false });
  });

  it("leaves campaign-specific rules open on the dashboard, and respects switched-off rules", () => {
    const biz = seed.businesses.find((b) => b.userId === "u-biz2")!;
    const s = { ...DEFAULT_SETTINGS, blockIfOverdue: false, maxGoalToRevenue: 0, requiredDocKinds: [] };
    const checks = eligibilityChecks(biz, undefined, undefined, s, ctx, now);
    expect(status(checks)).toEqual({ verified: true, years: true, goal: null, open: true, overdue: true });
  });

  it("reports failures in the Eligibility section when submitting", () => {
    const c: Campaign = { ...seed.campaigns.find((x) => x.id === "c-agro")!, id: "new2", goal: 50_000, status: "draft", deadline: "2099-01-01" };
    const problems = submitProblems(c, seed.businesses[0], seed.projects["c-agro"], seed.financials["c-agro"], DEFAULT_SETTINGS, ctx);
    expect(problems.filter((p) => p.section === "Eligibility").map((p) => p.message.split(".")[0]))
      .toEqual(expect.arrayContaining(["Goal between ৳1 lakh and ৳5 crore", "At most 2 campaigns open or in review at a time"]));
  });
});

describe("eligibility article", () => {
  it("shows the current rules in both languages", () => {
    const a = BUILT_IN.find((x) => x.slug === "business-eligibility")!;
    const s = { ...DEFAULT_SETTINGS, minGoal: 200000 };
    expect(fillPlaceholders(a.body.en, s, "en")).toContain("between **৳2 lakh** and **৳5 crore**");
    expect(fillPlaceholders(a.body.bn, s, "bn")).toContain("**৳২ লাখ** থেকে **৳৫ কোটি**");
    expect(fillPlaceholders(a.body.en, s, "en")).toContain("**the trade licence** and **financial statements**");
  });
});
