import type { DB, Role } from "../types";

const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const ago = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

export interface DemoAccount { userId: string; email: string; password: string }
export type DemoData = Omit<DB, "stats"> & { accounts: DemoAccount[] };

export const DEMO_PASSWORD = "demo1234";

const people: [string, string, string, Role][] = [
  ["u-admin", "admin@demo.com", "Platform Admin", "admin"],
  ["u-inv1", "investor@demo.com", "Nadia Rahman", "investor"],
  ["u-inv2", "karim@demo.com", "Karim Hossain", "investor"],
  ["u-biz1", "business@demo.com", "Farhan Ahmed", "business"],
  ["u-biz2", "solar@demo.com", "Sumaiya Islam", "business"],
  ["u-biz3", "textile@demo.com", "Tanvir Chowdhury", "business"],
  ["u-biz4", "newbiz@demo.com", "Rafi Uddin", "business"],
];

/** Sample data for demo mode (the in-browser preview). Mirrors supabase/seed.sql. */
export function demoSeed(): DemoData {
  return {
    accounts: people.map(([userId, email]) => ({ userId, email, password: DEMO_PASSWORD })),
    profiles: people.map(([id, email, name], i) => ({ id, email, name, createdAt: ago(60 - i * 5) })),
    roles: people.map(([userId, , , role]) => ({ userId, role })),
    businesses: [
      { userId: "u-biz1", companyName: "GreenHarvest Agro Ltd.", sector: "Agriculture", location: "Rajshahi", foundedYear: 2019, tradeLicenseNo: "TRAD/RAJ/2019/04512", tin: "123456789012", website: "https://greenharvest.example", description: "Contract farming and cold-chain distribution of mangoes and vegetables to Dhaka supermarkets.", verification: "verified" },
      { userId: "u-biz2", companyName: "SunRoof Energy", sector: "Renewable Energy", location: "Dhaka", foundedYear: 2021, tradeLicenseNo: "TRAD/DSCC/2021/88231", tin: "234567890123", website: "https://sunroof.example", description: "Rooftop solar installation for SMEs and factories on a pay-as-you-save model.", verification: "verified" },
      { userId: "u-biz3", companyName: "Loomcraft Textiles", sector: "Textiles & Garments", location: "Chattogram", foundedYear: 2016, tradeLicenseNo: "TRAD/CCC/2016/11204", tin: "345678901234", website: "", description: "Handloom and jamdani products sold online and exported to boutique retailers.", verification: "verified" },
      { userId: "u-biz4", companyName: "QuickCart BD", sector: "Retail & E-commerce", location: "Sylhet", foundedYear: 2024, tradeLicenseNo: "TRAD/SCC/2024/00911", tin: "456789012345", website: "https://quickcart.example", description: "15-minute grocery delivery in Sylhet city.", verification: "pending" },
    ],
    investors: [
      { userId: "u-inv1", sectors: ["Agriculture", "Renewable Energy"], locations: [], types: ["equity", "debt"], minTicket: 10000, maxTicket: 500000, risk: "medium" },
      { userId: "u-inv2", sectors: [], locations: ["Dhaka"], types: [], minTicket: 5000, maxTicket: 100000, risk: "low" },
    ],
    campaigns: [
      {
        id: "c-agro", businessId: "u-biz1", title: "Cold storage expansion for mango season",
        summary: "Add a 200-tonne cold room to cut post-harvest losses by 30%.",
        pitch: "We supply 14 supermarket outlets in Dhaka and lose almost a third of our produce in peak season because we lack cold storage near the farms. A 200-tonne cold room in Rajshahi lets us hold stock, sell at better prices and sign two more retail contracts already in negotiation.",
        useOfFunds: "Cold room construction 60%, refrigerated van 25%, working capital 15%.",
        type: "equity", sector: "Agriculture", location: "Rajshahi", risk: "medium", goal: 2500000, minInvestment: 25000,
        deadline: inDays(28), terms: { equityPercent: 10, valuation: 25000000 }, status: "live", createdAt: ago(10),
      },
      {
        id: "c-solar", businessId: "u-biz2", title: "Solar for 50 garment factories",
        summary: "Finance rooftop solar installs repaid from factories' electricity savings.",
        pitch: "Factories pay us monthly from what they save on grid electricity. We have letters of intent from 50 factories in Gazipur and Savar and need inventory finance to install panels before the dry season.",
        useOfFunds: "Panels and inverters 80%, installation crews 15%, insurance 5%.",
        type: "debt", sector: "Renewable Energy", location: "Dhaka", risk: "low", goal: 5000000, minInvestment: 10000,
        deadline: inDays(45), terms: { interestRate: 12, tenorMonths: 24 }, status: "live", createdAt: ago(8),
      },
      {
        id: "c-loom", businessId: "u-biz3", title: "Revive 30 handloom weavers",
        summary: "Back artisan weavers and get handmade jamdani as a thank-you.",
        pitch: "Each pledge funds yarn and looms for weavers in our cooperative. Backers receive handmade products shipped anywhere in Bangladesh.",
        useOfFunds: "Looms 50%, yarn 30%, weaver training 20%.",
        type: "reward", sector: "Textiles & Garments", location: "Chattogram", risk: "low", goal: 600000, minInvestment: 1500,
        deadline: inDays(20),
        terms: { rewards: [
          { amount: 1500, title: "Thank-you card + scarf", description: "Handwoven cotton scarf." },
          { amount: 5000, title: "Jamdani dupatta", description: "Signed by the weaver." },
          { amount: 15000, title: "Full jamdani saree", description: "Custom colour, 8-week delivery." },
        ] },
        status: "live", createdAt: ago(6),
      },
      {
        id: "c-agro2", businessId: "u-biz1", title: "Working capital for winter vegetables",
        summary: "Short-term loan to pre-purchase seeds and inputs for 120 contract farmers.",
        pitch: "Repaid from supermarket receivables within 9 months.", useOfFunds: "Seeds and fertiliser 70%, farmer advances 30%.",
        type: "debt", sector: "Agriculture", location: "Rajshahi", risk: "medium", goal: 1200000, minInvestment: 20000,
        deadline: inDays(35), terms: { interestRate: 14, tenorMonths: 9 }, status: "pending", createdAt: ago(1),
      },
    ],
    pledges: [
      { id: "p1", campaignId: "c-agro", investorId: "u-inv1", amount: 200000, status: "active", createdAt: ago(5) },
      { id: "p2", campaignId: "c-solar", investorId: "u-inv2", amount: 50000, status: "active", createdAt: ago(4) },
      { id: "p3", campaignId: "c-solar", investorId: "u-inv1", amount: 150000, status: "active", createdAt: ago(3) },
      { id: "p4", campaignId: "c-loom", investorId: "u-inv2", amount: 5000, status: "active", createdAt: ago(2) },
      { id: "p5", campaignId: "c-agro", investorId: "u-inv2", amount: 600000, status: "active", createdAt: ago(2) },
    ],
    questions: [
      {
        id: "q1", campaignId: "c-agro", investorId: "u-inv1", askerName: "Nadia Rahman", createdAt: ago(4),
        text: "Who will hold the shares, and will investors get board observer rights?",
        answer: { text: "Shares are issued directly to investors. Anyone investing ৳5 lakh or more gets quarterly reports and an observer seat at the AGM.", at: ago(3) },
      },
      { id: "q2", campaignId: "c-solar", investorId: "u-inv2", askerName: "Karim Hossain", createdAt: ago(1), text: "What happens if a factory stops paying?" },
    ],
  };
}
