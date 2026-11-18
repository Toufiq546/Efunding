export type Role = "investor" | "business" | "admin";
export type CampaignType = "equity" | "debt" | "reward";
export type Risk = "low" | "medium" | "high";
export type VerificationStatus = "unverified" | "pending" | "verified" | "rejected";
export type CampaignStatus = "draft" | "pending" | "live" | "rejected" | "closed";

export const SECTORS = [
  "Agriculture",
  "Manufacturing",
  "Retail & E-commerce",
  "Technology",
  "Food & Beverage",
  "Healthcare",
  "Education",
  "Renewable Energy",
  "Logistics",
  "Textiles & Garments",
] as const;

export const LOCATIONS = [
  "Dhaka",
  "Chattogram",
  "Khulna",
  "Rajshahi",
  "Sylhet",
  "Barishal",
  "Rangpur",
  "Mymensingh",
] as const;

export const CAMPAIGN_TYPES: CampaignType[] = ["equity", "debt", "reward"];
export const RISKS: Risk[] = ["low", "medium", "high"];

/** The signed-in user (auth user + profile + role). */
export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
}

/** Visible to the user themself, and to admins for everyone. */
export interface Profile {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

export interface BusinessProfile {
  userId: string;
  companyName: string;
  sector: string;
  location: string;
  foundedYear: number;
  tradeLicenseNo: string;
  tin: string;
  website: string;
  description: string;
  verification: VerificationStatus;
  rejectionReason?: string;
}

export interface InvestorProfile {
  userId: string;
  sectors: string[];
  locations: string[];
  types: CampaignType[];
  minTicket: number;
  maxTicket: number;
  risk: Risk;
}

export interface RewardTier {
  amount: number;
  title: string;
  description: string;
}

export interface CampaignTerms {
  /** equity */
  equityPercent?: number;
  valuation?: number;
  /** debt */
  interestRate?: number;
  tenorMonths?: number;
  /** reward */
  rewards?: RewardTier[];
}

export interface Campaign {
  id: string;
  businessId: string;
  title: string;
  summary: string;
  pitch: string;
  useOfFunds: string;
  type: CampaignType;
  sector: string;
  location: string;
  risk: Risk;
  goal: number;
  minInvestment: number;
  deadline: string; // ISO date
  terms: CampaignTerms;
  status: CampaignStatus;
  rejectionReason?: string;
  createdAt: string;
  /** Set when an admin marks the campaign funded; commitment tracking starts here. */
  fundedOn?: string;
}

export interface Pledge {
  id: string;
  campaignId: string;
  investorId: string;
  amount: number;
  status: "active" | "cancelled";
  createdAt: string;
}

export interface Question {
  id: string;
  campaignId: string;
  investorId: string;
  askerName: string;
  text: string;
  createdAt: string;
  answer?: { text: string; at: string };
}

export type Reporting = "monthly" | "quarterly" | "half-yearly";
export const REPORTING: Reporting[] = ["monthly", "quarterly", "half-yearly"];

export const DEFAULT_COMMITMENTS = [
  "Use the money only for the items in our plan, and tell investors before any major change.",
  "Send investors progress updates at the frequency we chose, covering progress, spending and sales.",
  "Share our yearly accounts with investors within 6 months of the year end.",
  "Tell investors within 7 days about any major problem, such as a large loss, a legal issue or a serious delay.",
  "If the funding goal is not reached, all pledges are released and no one is charged.",
];

/** Admin-editable platform settings (single row in public.platform_settings). */
export interface PlatformSettings {
  sectors: string[];
  locations: string[];
  /** Site-wide banner text; empty means no banner. */
  announcement: string;
  /** Standard commitments every business accepts on its project page. */
  commitmentOptions: string[];
  /** Least frequent reporting a business may choose. */
  minReporting: Reporting;
  /** Years of past results required before submitting. */
  minAccountYears: number;
  /** How long commitments are tracked after funding (months). */
  trackingMonths: number;
  /** Warn this many days before a commitment is due. */
  dueSoonDays: number;
  /** Reward campaigns: delivery due this many months after funding. */
  deliveryMonths: number;
}

export const DEFAULT_SETTINGS: PlatformSettings = {
  sectors: [...SECTORS], locations: [...LOCATIONS], announcement: "",
  commitmentOptions: [...DEFAULT_COMMITMENTS], minReporting: "quarterly", minAccountYears: 2,
  trackingMonths: 24, dueSoonDays: 14, deliveryMonths: 3,
};

/* ───────────── Commitment tracking (obligations / campaign_updates) ───────────── */

export type ObligationKind = "update" | "accounts" | "repayment" | "milestone" | "delivery";

/** A dated promise generated when a campaign is funded. Public. */
export interface Obligation {
  id: string;
  campaignId: string;
  kind: ObligationKind;
  title: string;
  dueOn: string; // YYYY-MM-DD
  amount?: number;
  status: "open" | "done" | "waived";
  completedAt?: string;
  updateId?: string;
  /** Admin's reason for a reschedule or waiver. */
  note?: string;
}

/** A progress report posted by the business. Visible to backers, the business and admins. */
export interface CampaignUpdate {
  id: string;
  campaignId: string;
  obligationId?: string;
  title: string;
  body: string;
  amount?: number;
  sales?: number;
  spent?: number;
  createdAt: string;
}

/* ───────────── Project page (campaign_projects / campaign_financials / campaign_documents) ───────────── */

export interface TeamMember { name: string; role: string; bio: string }
export interface FundItem { item: string; amount: number }
export interface Milestone { when: string; what: string }
export interface RiskItem { risk: string; mitigation: string }
export interface RepaymentRow { month: number; amount: number }
export interface ReturnPlan {
  schedule?: RepaymentRow[];   // debt
  dividendPolicy?: string;     // equity
  exitPlan?: string;           // equity
  delivery?: string;           // reward
}

export interface Project {
  campaignId: string;
  story: string;
  products: string;
  highlights: string[];
  team: TeamMember[];
  fundItems: FundItem[];
  milestones: Milestone[];
  risks: RiskItem[];
  returnPlan: ReturnPlan;
  reporting: Reporting;
  customCommitments: string[];
  contactName: string;
  contactRole: string;
  /** Full name typed to accept the commitments; the server records when and what was accepted. */
  declarationName: string;
  declaredAt?: string;
  acceptedCommitments: string[];
}

export interface AccountYear { year: number; revenue: number; costs: number; assets: number; liabilities: number }
export interface Projection { year: number; revenue: number; profit: number }

/** Full accounts: owner, admin and logged-in users only. */
export interface Financials {
  campaignId: string;
  history: AccountYear[];
  projections: Projection[];
  notes: string;
  checked: boolean;
  checkedAt?: string;
  checkNote?: string;
}

/** Headline figures anyone can see (campaign_financial_summary). */
export interface FinancialSummary {
  campaignId: string;
  yearsReported: number;
  checked: boolean;
  latestYear?: number;
  revenueGrowthPct?: number | null;
  profitMarginPct?: number | null;
}

export type DocKind = "accounts" | "bank" | "tax" | "licence" | "other";
export const DOC_KINDS: [DocKind, string][] = [
  ["accounts", "Financial statements"], ["bank", "Bank statement"], ["tax", "Tax return"], ["licence", "Licence / registration"], ["other", "Other"],
];
export const DOC_MIME = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
export const DOC_MAX_BYTES = 10 * 1024 * 1024;

export interface CampaignDocument {
  id: string;
  campaignId: string;
  kind: DocKind;
  title: string;
  path: string;
  sizeBytes: number;
  mime: string;
  createdAt: string;
  /** Demo mode only: the file itself. */
  dataUrl?: string;
}

/** One row of the admin activity log (visible to admins only). */
export interface AuditEntry {
  id: string;
  adminId: string | null;
  action: string;
  targetType: string;
  targetId: string;
  detail: string | null;
  createdAt: string;
}

export interface CampaignStats {
  raised: number;
  backers: number;
}

/** Everything the signed-in user is allowed to read (filtered by row-level security). */
export interface DB {
  profiles: Profile[];
  roles: { userId: string; role: Role }[];
  stats: Record<string, CampaignStats>;
  settings: PlatformSettings;
  /** Admin activity log, newest first (empty for non-admins). */
  audit: AuditEntry[];
  /** Project pages by campaign id (public wherever the campaign is). */
  projects: Record<string, Project>;
  /** Full accounts by campaign id (only what the viewer may read). */
  financials: Record<string, Financials>;
  /** Headline account figures by campaign id (public). */
  financialSummary: Record<string, FinancialSummary>;
  documents: CampaignDocument[];
  obligations: Obligation[];
  /** Only the updates the viewer may read. */
  updates: CampaignUpdate[];
  businesses: BusinessProfile[];
  investors: InvestorProfile[];
  campaigns: Campaign[];
  pledges: Pledge[];
  questions: Question[];
}
