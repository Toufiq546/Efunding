import { describe, expect, it } from "vitest";
import { addMonths, compliance, generateObligations, obligationState } from "./tracking";
import { demoSeed } from "./demo/seed";
import { DEFAULT_SETTINGS, type Obligation } from "./types";

const seed = demoSeed();
let n = 0;
const id = () => `o${++n}`;

describe("generateObligations (mirrors admin_mark_funded)", () => {
  it("matches the database for a quarterly equity campaign with a 'Month N' milestone", () => {
    const c = seed.campaigns.find((x) => x.id === "c-agro")!;
    const p = { ...seed.projects["c-agro"], milestones: [{ when: "Month 3", what: "Machines installed" }, { when: "Next spring", what: "Not dated" }] };
    const list = generateObligations(c, p, DEFAULT_SETTINGS, "2026-01-15", id);
    expect(list).toHaveLength(11); // 8 quarterly updates + 2 yearly accounts + 1 dated milestone (same as the SQL test)
    expect(list.filter((o) => o.kind === "update")[0].dueOn).toBe("2026-04-15");
    expect(list.find((o) => o.kind === "milestone")?.dueOn).toBe("2026-04-15");
  });

  it("adds repayments for debt and delivery for rewards", () => {
    const debt = generateObligations(seed.campaigns.find((x) => x.id === "c-solar")!, seed.projects["c-solar"], DEFAULT_SETTINGS, "2026-01-31", id);
    const repayments = debt.filter((o) => o.kind === "repayment");
    expect(repayments.map((o) => o.title)).toEqual(["Repayment 1 of 4", "Repayment 2 of 4", "Repayment 3 of 4", "Repayment 4 of 4"]);
    expect(repayments[0]).toMatchObject({ dueOn: "2026-07-31", amount: 1400000 });
    expect(debt.filter((o) => o.kind === "update")).toHaveLength(24); // monthly reporting for 24 months
    const reward = generateObligations(seed.campaigns.find((x) => x.id === "c-loom")!, seed.projects["c-loom"], DEFAULT_SETTINGS, "2026-01-15", id);
    expect(reward.find((o) => o.kind === "delivery")?.dueOn).toBe("2026-04-15");
  });

  it("clamps month ends like Postgres", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-11-30", 3)).toBe("2027-02-28");
  });
});

describe("obligation states and compliance", () => {
  const o = (dueOn: string, status: Obligation["status"] = "open", completedAt?: string): Obligation =>
    ({ id: dueOn, campaignId: "c", kind: "update", title: "t", dueOn, status, completedAt });
  const now = "2026-06-01";

  it("classifies by due date", () => {
    expect(obligationState(o("2026-05-31"), 14, now)).toBe("overdue");
    expect(obligationState(o("2026-06-10"), 14, now)).toBe("due-soon");
    expect(obligationState(o("2026-08-01"), 14, now)).toBe("upcoming");
    expect(obligationState(o("2026-05-01", "done"), 14, now)).toBe("done");
  });

  it("counts on-time and overdue commitments", () => {
    const c = compliance([o("2026-03-01", "done", "2026-02-28T10:00:00Z"), o("2026-04-01", "done", "2026-04-09T10:00:00Z"), o("2026-05-01"), o("2026-06-05"), o("2026-05-15", "waived")], 14, now);
    expect(c).toMatchObject({ due: 3, done: 2, onTime: 1, overdue: 1, dueSoon: 1 });
  });
});
