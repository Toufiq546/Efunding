import { DEFAULT_SETTINGS, type CampaignUpdate, type DB, type Financials, type Obligation, type Project, type Role } from "../types";
import { addMonths, generateObligations } from "../tracking";

const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const ago = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

export interface DemoAccount { userId: string; email: string; password: string }
export type DemoData = Omit<DB, "stats" | "financialSummary"> & { accounts: DemoAccount[] };

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
  return withFundedExample(baseSeed());
}

function baseSeed(): DemoData {
  return {
    obligations: [],
    updates: [],
    helpArticles: [],
    settings: { ...DEFAULT_SETTINGS },
    audit: [],
    projects: Object.fromEntries(demoProjects().map((p) => [p.campaignId, p])),
    financials: Object.fromEntries(demoFinancials().map((f) => [f.campaignId, f])),
    documents: [],
    accounts: people.map(([userId, email]) => ({ userId, email, password: DEMO_PASSWORD })),
    profiles: people.map(([id, email, name], i) => ({ id, email, name, createdAt: ago(60 - i * 5) })),
    roles: people.map(([userId, , , role]) => ({ userId, role })),
    businesses: [
      { userId: "u-biz1", companyName: "GreenHarvest Agro Ltd.", sector: "Agriculture", location: "Rajshahi", foundedYear: 2019, tradeLicenseNo: "TRAD/RAJ/2019/04512", tin: "123456789012", website: "", description: "Contract farming and cold-chain distribution of mangoes and vegetables to Dhaka supermarkets.", verification: "verified" },
      { userId: "u-biz2", companyName: "SunRoof Energy", sector: "Renewable Energy", location: "Dhaka", foundedYear: 2021, tradeLicenseNo: "TRAD/DSCC/2021/88231", tin: "234567890123", website: "", description: "Rooftop solar installation for SMEs and factories on a pay-as-you-save model.", verification: "verified" },
      { userId: "u-biz3", companyName: "Loomcraft Textiles", sector: "Textiles & Garments", location: "Chattogram", foundedYear: 2016, tradeLicenseNo: "TRAD/CCC/2016/11204", tin: "345678901234", website: "", description: "Handloom and jamdani products sold online and exported to boutique retailers.", verification: "verified" },
      { userId: "u-biz4", companyName: "QuickCart BD", sector: "Retail & E-commerce", location: "Sylhet", foundedYear: 2024, tradeLicenseNo: "TRAD/SCC/2024/00911", tin: "456789012345", website: "", description: "15-minute grocery delivery in Sylhet city.", verification: "pending" },
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

const declared = (campaignId: string, name: string, contactRole: string, reporting: Project["reporting"] = "quarterly") => ({
  campaignId, reporting, contactName: name, contactRole, declarationName: name, declaredAt: ago(9),
  acceptedCommitments: [...DEFAULT_SETTINGS.commitmentOptions],
});

function demoProjects(): Project[] {
  return [
    {
      ...declared("c-agro", "Farhan Ahmed", "Managing Director"),
      story: "GreenHarvest works with 320 mango and vegetable farmers around Rajshahi. We buy at harvest, grade and pack the produce, and deliver it chilled to 14 supermarket outlets in Dhaka under one-year supply contracts. Without our own cold storage we sell in a rush at peak season, when prices are lowest and up to 30% spoils.",
      products: "Graded Himsagar, Langra and Amrapali mangoes (May to August); tomatoes, cauliflower and beans in winter; pre-packed 1 kg and 5 kg boxes for supermarkets.",
      highlights: ["14 supermarket outlets supplied every week", "320 contract farmers", "Sales up 35% last year"],
      team: [
        { name: "Farhan Ahmed", role: "Managing Director", bio: "12 years in agricultural trade; previously sourcing manager at a national retail chain." },
        { name: "Shirin Akter", role: "Operations Head", bio: "Runs grading, packing and the delivery fleet of 6 trucks." },
        { name: "Mahmud Hasan", role: "Finance Manager", bio: "Chartered accountant (ICAB), keeps monthly management accounts." },
      ],
      fundItems: [
        { item: "200-tonne cold room (building and refrigeration)", amount: 1500000 },
        { item: "Refrigerated delivery van", amount: 625000 },
        { item: "Working capital for the 2027 mango season", amount: 375000 },
      ],
      milestones: [
        { when: "Month 1", what: "Order refrigeration units and start construction" },
        { when: "Month 4", what: "Cold room running; first stock stored" },
        { when: "Month 6", what: "Sign the two supermarket contracts now in negotiation" },
        { when: "Month 12", what: "Spoilage below 10% across the season" },
      ],
      risks: [
        { risk: "Poor harvest or bad weather", mitigation: "Farmers spread across 4 upazilas; winter vegetables balance the year." },
        { risk: "Power cuts damage stored produce", mitigation: "Backup generator included in the cold room budget." },
        { risk: "A supermarket contract ends", mitigation: "No client is more than 20% of sales; two new contracts in progress." },
      ],
      returnPlan: { dividendPolicy: "We plan to pay 30% of yearly profit as dividends from year 2.", exitPlan: "The founders offer to buy back investors' shares at fair value after 5 years." },
      customCommitments: ["Investors can visit the cold room and farms on request."],
    },
    {
      ...declared("c-solar", "Sumaiya Islam", "Founder & CEO", "monthly"),
      story: "SunRoof installs rooftop solar systems for garment factories. Factories pay nothing upfront: they pay us a monthly fee that is lower than the electricity they save, for 5 years. We have letters of intent from 50 factories in Gazipur and Savar and need inventory finance to install before the dry season.",
      products: "20–200 kW rooftop solar systems with monitoring, maintenance and a performance guarantee.",
      highlights: ["32 systems already installed and paying", "No missed factory payment in 2 years", "Letters of intent from 50 factories"],
      team: [
        { name: "Sumaiya Islam", role: "Founder & CEO", bio: "Electrical engineer (BUET), 9 years in renewable energy projects." },
        { name: "Arif Chowdhury", role: "Head of Installations", bio: "Leads 3 installation crews; 150+ systems installed." },
      ],
      fundItems: [
        { item: "Solar panels and inverters for 50 factories", amount: 4000000 },
        { item: "Installation crews and equipment", amount: 750000 },
        { item: "Insurance", amount: 250000 },
      ],
      milestones: [
        { when: "Month 2", what: "First 15 factories installed" },
        { when: "Month 6", what: "All 50 factories installed and paying monthly fees" },
      ],
      risks: [
        { risk: "A factory stops paying", mitigation: "Panels stay our property until paid off and can be moved to another factory." },
        { risk: "Panel prices rise", mitigation: "60% of panels already ordered at a fixed price." },
      ],
      returnPlan: { schedule: [6, 12, 18, 24].map((month) => ({ month, amount: 1400000 })) },
      customCommitments: [],
    },
    {
      ...declared("c-loom", "Tanvir Chowdhury", "Cooperative Manager"),
      story: "Loomcraft is a cooperative of handloom weavers near Chattogram, many of them women working from home. We sell jamdani sarees, dupattas and scarves online and to boutiques abroad. This campaign buys looms and yarn so 30 more weavers can work full time.",
      products: "Handwoven jamdani sarees and dupattas, cotton scarves, custom orders.",
      highlights: ["85 weavers in the cooperative", "Exports to 3 boutiques in the UK and Canada"],
      team: [{ name: "Tanvir Chowdhury", role: "Cooperative Manager", bio: "Runs sales and exports; third-generation weaving family." }],
      fundItems: [
        { item: "30 looms", amount: 300000 },
        { item: "Yarn and dyes", amount: 180000 },
        { item: "Weaver training", amount: 120000 },
      ],
      milestones: [{ when: "Month 2", what: "Looms installed and training started" }, { when: "Month 4", what: "First rewards shipped to backers" }],
      risks: [{ risk: "Delivery delays for custom sarees", mitigation: "Scarves and dupattas ship first; sarees have an 8-week window." }],
      returnPlan: { delivery: "Scarves and dupattas within 6 weeks of the campaign closing; sarees within 10 weeks." },
      customCommitments: [],
    },
    {
      ...declared("c-agro2", "Farhan Ahmed", "Managing Director"),
      story: "Short-term working capital so GreenHarvest can buy seeds and inputs for 120 contract farmers ahead of the winter vegetable season. Repaid from supermarket payments, which arrive within 45 days of delivery.",
      products: "Winter vegetables for supermarket clients.",
      highlights: ["Supermarket payments arrive within 45 days"],
      team: [{ name: "Farhan Ahmed", role: "Managing Director", bio: "12 years in agricultural trade." }],
      fundItems: [{ item: "Seeds and fertiliser", amount: 840000 }, { item: "Advances to farmers", amount: 360000 }],
      milestones: [{ when: "Month 1", what: "Inputs delivered to farmers" }, { when: "Month 4", what: "Harvest and supermarket deliveries" }],
      risks: [{ risk: "Late supermarket payments", mitigation: "Repayment dates fall 2 months after expected payment." }],
      returnPlan: { schedule: [{ month: 6, amount: 650000 }, { month: 9, amount: 650000 }] },
      customCommitments: [],
    },
  ];
}

const yearRow = (year: number, revenue: number, costs: number, assets: number, liabilities: number) => ({ year, revenue, costs, assets, liabilities });

function demoFinancials(): Financials[] {
  return [
    {
      campaignId: "c-agro", checked: true, checkedAt: ago(8), checkNote: "Matches the audited statements for 2024 and 2025.",
      history: [yearRow(2023, 14200000, 13100000, 6800000, 3100000), yearRow(2024, 16900000, 15400000, 7900000, 3300000), yearRow(2025, 22800000, 20500000, 9600000, 3500000)],
      projections: [{ year: 2026, revenue: 27500000, profit: 3200000 }, { year: 2027, revenue: 33000000, profit: 4300000 }],
      notes: "Figures in taka from audited accounts (year ending 30 June).",
    },
    {
      campaignId: "c-solar", checked: false,
      history: [yearRow(2024, 6100000, 5600000, 9400000, 6200000), yearRow(2025, 9800000, 8600000, 14100000, 8900000)],
      projections: [{ year: 2026, revenue: 16500000, profit: 2400000 }, { year: 2027, revenue: 22000000, profit: 3900000 }],
      notes: "Most assets are installed systems still being paid off by factories.",
    },
    {
      campaignId: "c-loom", checked: false,
      history: [yearRow(2024, 3400000, 3150000, 1200000, 300000), yearRow(2025, 4100000, 3700000, 1500000, 350000)],
      projections: [{ year: 2026, revenue: 5600000, profit: 600000 }],
      notes: "Cooperative accounts, prepared by our accountant.",
    },
    {
      campaignId: "c-agro2", checked: false,
      history: [yearRow(2024, 16900000, 15400000, 7900000, 3300000), yearRow(2025, 22800000, 20500000, 9600000, 3500000)],
      projections: [],
      notes: "Same company accounts as the cold storage campaign.",
    },
  ];
}

/**
 * Adds a campaign funded seven months ago, so the demo shows tracking in action: the first quarterly update,
 * the installation milestone and the first repayment were done on time; the second quarterly update is overdue.
 */
function withFundedExample(d: DemoData): DemoData {
  const fundedOn = addMonths(new Date().toISOString().slice(0, 10), -7);
  const c = {
    id: "c-solar-cs", businessId: "u-biz2", title: "Solar for 12 cold storages",
    summary: "Rooftop solar for cold storages in Bogura and Rangpur, repaid from their power savings.",
    pitch: "Cold storages run around the clock and power cuts spoil stock. Solar with batteries cuts their bills and keeps them running.",
    useOfFunds: "", type: "debt" as const, sector: "Renewable Energy", location: "Rangpur", risk: "low" as const,
    goal: 1800000, minInvestment: 10000, deadline: addMonths(fundedOn, -1), terms: { interestRate: 11, tenorMonths: 12 },
    status: "closed" as const, createdAt: `${addMonths(fundedOn, -3)}T09:00:00.000Z`, fundedOn,
  };
  const project: Project = {
    ...d.projects["c-solar"], campaignId: c.id, reporting: "quarterly",
    story: "SunRoof's second campaign: solar systems for 12 cold storages that lose stock during load-shedding. Each storage pays a monthly fee below its saving on electricity and diesel.",
    fundItems: [{ item: "Panels, inverters and batteries", amount: 1500000 }, { item: "Installation", amount: 300000 }],
    milestones: [{ when: "Month 2", what: "All 12 systems installed" }],
    returnPlan: { schedule: [{ month: 6, amount: 999000 }, { month: 12, amount: 999000 }] },
    declaredAt: `${addMonths(fundedOn, -3)}T09:00:00.000Z`,
  };
  let n = 0;
  const obligations = generateObligations(c, project, d.settings, fundedOn, () => `ob-${++n}`);
  const updates: CampaignUpdate[] = [];
  const complete = (match: (o: Obligation) => boolean, u: Omit<CampaignUpdate, "id" | "campaignId" | "obligationId" | "createdAt">) => {
    const o = obligations.find(match)!;
    const id = `up-${updates.length + 1}`;
    const at = new Date(Date.parse(o.dueOn) - 2 * 86_400_000 + 10 * 3_600_000).toISOString(); // two days early
    Object.assign(o, { status: "done", completedAt: at, updateId: id });
    updates.push({ ...u, id, campaignId: c.id, obligationId: o.id, createdAt: at });
  };
  complete((o) => o.kind === "milestone", { title: "All 12 systems installed", body: "Installation finished at all 12 cold storages. The last two in Rangpur were connected on schedule." });
  complete((o) => o.kind === "update", { title: "First quarter: systems running", body: "All systems are generating. Storages report 3–4 fewer hours of diesel generator use per day. Every storage has paid its monthly fee.", sales: 410000, spent: 1800000 });
  complete((o) => o.kind === "repayment", { title: "First repayment made", body: "We repaid ৳9,99,000 to investors as scheduled.", amount: 999000 });
  return {
    ...d,
    campaigns: [...d.campaigns, c],
    projects: { ...d.projects, [c.id]: project },
    financials: { ...d.financials, [c.id]: { ...d.financials["c-solar"], campaignId: c.id, checked: true, checkedAt: c.createdAt } },
    pledges: [
      ...d.pledges,
      { id: "p-cs1", campaignId: c.id, investorId: "u-inv1", amount: 1200000, status: "active", createdAt: c.createdAt },
      { id: "p-cs2", campaignId: c.id, investorId: "u-inv2", amount: 600000, status: "active", createdAt: c.createdAt },
    ],
    obligations: [...d.obligations, ...obligations],
    updates: [...d.updates, ...updates],
  };
}
