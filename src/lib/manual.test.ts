import { describe, expect, it } from "vitest";
import { audienceFor, BUILT_IN, fillPlaceholders, localDigits, mergeManual } from "./manual";
import { DEFAULT_SETTINGS } from "./types";

describe("built-in manual", () => {
  it("has every article in English and Bangla, with unique addresses", () => {
    expect(new Set(BUILT_IN.map((a) => a.slug)).size).toBe(BUILT_IN.length);
    for (const a of BUILT_IN) {
      for (const l of ["en", "bn"] as const) {
        expect(a.title[l].trim(), `${a.slug} title ${l}`).not.toBe("");
        expect(a.body[l].trim().length, `${a.slug} body ${l}`).toBeGreaterThan(100);
      }
      expect(/[ঀ-৿]/.test(a.body.bn), `${a.slug} Bangla body is in Bangla`).toBe(true);
    }
  });

  it("covers every type of user", () => {
    expect(new Set(BUILT_IN.map((a) => a.audience))).toEqual(new Set(["everyone", "investor", "business", "admin"]));
  });

  it("fills every placeholder from the current settings, in both languages", () => {
    const s = { ...DEFAULT_SETTINGS, minAccountYears: 3, commitmentOptions: ["Report honestly."] };
    for (const a of BUILT_IN) {
      for (const l of ["en", "bn"] as const) expect(fillPlaceholders(a.body[l], s, l)).not.toMatch(/\{\{/);
    }
    const project = BUILT_IN.find((a) => a.slug === "business-project-page")!;
    expect(fillPlaceholders(project.body.en, s, "en")).toContain("at least **3 past years**");
    expect(fillPlaceholders(project.body.bn, s, "bn")).toContain("গত ৩ বছরের");
    expect(fillPlaceholders(BUILT_IN.find((a) => a.slug === "business-commitments")!.body.en, s, "en")).toContain("- Report honestly.");
  });

  it("uses Bangla digits in Bangla", () => {
    expect(localDigits("24 months", "bn")).toBe("২৪ months");
    expect(localDigits("24", "en")).toBe("24");
  });
});

describe("mergeManual", () => {
  const row = { audience: "everyone" as const, order: 1, titleBn: "", bodyBn: "", hidden: false };
  it("lets admin edits replace, add and hide articles", () => {
    const merged = mergeManual([
      { ...row, slug: "what-is-fundbridge", titleEn: "About us", bodyEn: "Edited" },
      { ...row, slug: "fees", titleEn: "Fees", bodyEn: "No fees.", order: 3 },
      { ...row, slug: "account-and-login", titleEn: "Old", bodyEn: "x", hidden: true },
    ]);
    expect(merged).toHaveLength(BUILT_IN.length + 1);
    expect(merged.find((a) => a.slug === "what-is-fundbridge")).toMatchObject({ source: "edited", title: { en: "About us", bn: "About us" } });
    expect(merged.find((a) => a.slug === "fees")?.source).toBe("custom");
    expect(merged.find((a) => a.slug === "account-and-login")?.hidden).toBe(true);
  });

  it("opens on the reader's own guide", () => {
    expect(audienceFor("business")).toBe("business");
    expect(audienceFor(undefined)).toBe("everyone");
  });
});
