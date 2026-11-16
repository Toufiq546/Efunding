import type { Campaign, InvestorProfile, Risk } from "./types";

export interface MatchResult {
  score: number; // 0–100
  reasons: string[];
  warnings: string[];
}

const RISK_LEVEL: Record<Risk, number> = { low: 0, medium: 1, high: 2 };

/** Weights add up to 100. */
export const WEIGHTS = { sector: 35, type: 20, ticket: 20, risk: 15, location: 10 } as const;

/**
 * Scores how well a campaign fits an investor's stated preferences.
 * An empty preference list (e.g. no sectors chosen) means "open to anything" and earns most of the points.
 */
export function scoreMatch(campaign: Campaign, pref: InvestorProfile): MatchResult {
  let score = 0;
  const reasons: string[] = [];
  const warnings: string[] = [];

  // Sector
  if (pref.sectors.length === 0) {
    score += WEIGHTS.sector * 0.6;
  } else if (pref.sectors.includes(campaign.sector)) {
    score += WEIGHTS.sector;
    reasons.push(`In your sector: ${campaign.sector}`);
  } else {
    warnings.push(`Outside your sectors (${campaign.sector})`);
  }

  // Funding type
  if (pref.types.length === 0) {
    score += WEIGHTS.type * 0.6;
  } else if (pref.types.includes(campaign.type)) {
    score += WEIGHTS.type;
    reasons.push(`${capitalize(campaign.type)} deal, as you prefer`);
  } else {
    warnings.push(`${capitalize(campaign.type)} is not a type you selected`);
  }

  // Ticket size: the campaign's minimum must fit inside the investor's budget
  if (campaign.minInvestment <= pref.maxTicket) {
    score += WEIGHTS.ticket;
    reasons.push("Minimum investment fits your budget");
  } else {
    warnings.push("Minimum investment is above your maximum ticket");
  }

  // Risk
  const gap = RISK_LEVEL[campaign.risk] - RISK_LEVEL[pref.risk];
  if (gap <= 0) {
    score += WEIGHTS.risk;
    reasons.push(`${capitalize(campaign.risk)} risk, within your tolerance`);
  } else if (gap === 1) {
    score += WEIGHTS.risk / 3;
    warnings.push(`Slightly riskier than you prefer (${campaign.risk})`);
  } else {
    warnings.push(`Much riskier than you prefer (${campaign.risk})`);
  }

  // Location
  if (pref.locations.length === 0) {
    score += WEIGHTS.location * 0.6;
  } else if (pref.locations.includes(campaign.location)) {
    score += WEIGHTS.location;
    reasons.push(`Based in ${campaign.location}`);
  }

  return { score: Math.round(score), reasons, warnings };
}

export function rankCampaigns(campaigns: Campaign[], pref: InvestorProfile) {
  return campaigns
    .map((c) => ({ campaign: c, match: scoreMatch(c, pref) }))
    .sort((a, b) => b.match.score - a.match.score);
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
