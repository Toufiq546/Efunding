import { describe, expect, it } from "vitest";
import { allowedReporting, emptyFinancials, emptyProject, submitProblems } from "./project";
import { demoSeed } from "./demo/seed";
import { DEFAULT_SETTINGS, type BusinessProfile, type Campaign } from "./types";

const seed = demoSeed();
const live = (id: string) => seed.campaigns.find((c) => c.id === id)!;
const bizOf = (c: Campaign) => seed.businesses.find((b) => b.userId === c.businessId);
const check = (c: Campaign, biz: BusinessProfile | undefined = bizOf(c)) =>
  submitProblems({ ...c, deadline: "2099-01-01" }, biz, seed.projects[c.id], seed.financials[c.id], DEFAULT_SETTINGS);

describe("submitProblems", () => {
  it("passes every complete demo project (equity, debt and reward)", () => {
    for (const id of ["c-agro", "c-solar", "c-loom", "c-agro2"]) expect(check(live(id))).toEqual([]);
  });

  it("needs a project page and a verified business", () => {
    const c = { ...live("c-agro"), id: "new", deadline: "2099-01-01" };
    const problems = submitProblems(c, { ...bizOf(c)!, verification: "pending" }, undefined, undefined, DEFAULT_SETTINGS);
    expect(problems.map((p) => p.section)).toEqual(["Basics", "Business"]);
  });

  it("flags each missing part in its section", () => {
    const c = { ...live("c-solar"), deadline: "2099-01-01" };
    const problems = submitProblems(c, bizOf(c), { ...emptyProject(c.id), reporting: "half-yearly" }, emptyFinancials(c.id), DEFAULT_SETTINGS);
    const sections = new Set(problems.map((p) => p.section));
    expect([...sections]).toEqual(["Business", "Accounts", "Plan", "Commitments"]);
    expect(problems.some((p) => p.message.includes("repayment schedule"))).toBe(true);
    expect(problems.some((p) => p.message.includes("at least quarterly"))).toBe(true);
  });

  it("requires use-of-funds items to add up to the goal", () => {
    const c = live("c-agro");
    const p = { ...seed.projects[c.id], fundItems: [{ item: "Cold room", amount: 1000 }] };
    const problems = submitProblems({ ...c, deadline: "2099-01-01" }, bizOf(c), p, seed.financials[c.id], DEFAULT_SETTINGS);
    expect(problems).toHaveLength(1);
    expect(problems[0].message).toMatch(/add up to 1,000 but the goal is 25,00,000/);
  });

  it("only offers reporting at least as frequent as the minimum", () => {
    expect(allowedReporting("quarterly")).toEqual(["monthly", "quarterly"]);
    expect(allowedReporting("half-yearly")).toHaveLength(3);
  });
});
