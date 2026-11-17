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

/** Admin-editable platform settings (single row in public.platform_settings). */
export interface PlatformSettings {
  sectors: string[];
  locations: string[];
  /** Site-wide banner text; empty means no banner. */
  announcement: string;
}

export const DEFAULT_SETTINGS: PlatformSettings = { sectors: [...SECTORS], locations: [...LOCATIONS], announcement: "" };

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
  businesses: BusinessProfile[];
  investors: InvestorProfile[];
  campaigns: Campaign[];
  pledges: Pledge[];
  questions: Question[];
}
