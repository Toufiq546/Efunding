import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { PostgrestError, Session } from "@supabase/supabase-js";
import { isConfigured, supabase } from "./supabase";
import type {
  BusinessProfile, Campaign, DB, InvestorProfile, Pledge, Question, Role, User,
} from "./types";

/**
 * Data layer backed by Supabase. `db` holds everything the signed-in user (or an anonymous visitor)
 * may read; row-level security in the database decides what that is. Every write is a named action
 * that returns an error message (or null) and then reloads.
 */

type Result = Promise<string | null>;

export interface Store {
  db: DB;
  user: User | null;
  /** True until the session and first data load have finished. */
  loading: boolean;
  signIn(email: string, password: string): Result;
  signUp(input: { name: string; email: string; password: string; role: Exclude<Role, "admin"> }): Promise<{ error: string | null; needsConfirmation: boolean }>;
  signOut(): Promise<void>;
  requestPasswordReset(email: string): Result;
  updatePassword(password: string): Result;
  saveBusiness(p: Omit<BusinessProfile, "verification" | "rejectionReason">, submit: boolean): Result;
  saveInvestor(p: InvestorProfile): Result;
  saveCampaign(c: Omit<Campaign, "id" | "createdAt" | "status" | "businessId"> & { id?: string }, submit: boolean): Promise<{ id?: string; error: string | null }>;
  reviewCampaign(id: string, approve: boolean, reason?: string): Result;
  setVerification(userId: string, approve: boolean, reason?: string): Result;
  pledge(campaignId: string, amount: number): Result;
  cancelPledge(id: string): Result;
  ask(campaignId: string, text: string): Result;
  answer(questionId: string, text: string): Result;
  reload(): Promise<void>;
}

const EMPTY: DB = { profiles: [], roles: [], stats: {}, businesses: [], investors: [], campaigns: [], pledges: [], questions: [] };

export const StoreContext = createContext<Store | null>(null);

/* ───────────── row ↔ app mapping ───────────── */

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const num = (v: unknown) => (v == null ? undefined : Number(v));

const toBusiness = (r: Row): BusinessProfile => ({
  userId: r.user_id, companyName: r.company_name, sector: r.sector, location: r.location,
  foundedYear: r.founded_year ?? 0, tradeLicenseNo: r.trade_license_no ?? "", tin: r.tin ?? "",
  website: r.website ?? "", description: r.description ?? "", verification: r.verification,
  rejectionReason: r.rejection_reason ?? undefined,
});

const toCampaign = (r: Row): Campaign => ({
  id: r.id, businessId: r.business_id, title: r.title, summary: r.summary, pitch: r.pitch, useOfFunds: r.use_of_funds,
  type: r.type, sector: r.sector, location: r.location, risk: r.risk, goal: Number(r.goal),
  minInvestment: Number(r.min_investment), deadline: r.deadline, status: r.status,
  rejectionReason: r.rejection_reason ?? undefined, createdAt: r.created_at,
  terms: {
    equityPercent: num(r.equity_percent), valuation: num(r.valuation),
    interestRate: num(r.interest_rate), tenorMonths: num(r.tenor_months), rewards: r.rewards ?? [],
  },
});

const toPledge = (r: Row): Pledge => ({
  id: r.id, campaignId: r.campaign_id, investorId: r.investor_id, amount: Number(r.amount), status: r.status, createdAt: r.created_at,
});

const toQuestion = (r: Row): Question => ({
  id: r.id, campaignId: r.campaign_id, investorId: r.investor_id, askerName: r.asker_name || "Investor",
  text: r.body, createdAt: r.created_at, answer: r.answer ? { text: r.answer, at: r.answered_at } : undefined,
});

const toInvestor = (r: Row): InvestorProfile => ({
  userId: r.user_id, sectors: r.sectors ?? [], locations: r.locations ?? [], types: r.types ?? [],
  minTicket: Number(r.min_ticket), maxTicket: Number(r.max_ticket), risk: r.risk,
});

function campaignRow(c: Omit<Campaign, "id" | "createdAt" | "status" | "businessId">) {
  const t = c.terms;
  return {
    title: c.title, summary: c.summary, pitch: c.pitch, use_of_funds: c.useOfFunds, type: c.type, sector: c.sector,
    location: c.location, risk: c.risk, goal: c.goal, min_investment: c.minInvestment, deadline: c.deadline,
    equity_percent: c.type === "equity" ? t.equityPercent ?? null : null,
    valuation: c.type === "equity" ? t.valuation ?? null : null,
    interest_rate: c.type === "debt" ? t.interestRate ?? null : null,
    tenor_months: c.type === "debt" ? t.tenorMonths ?? null : null,
    rewards: c.type === "reward" ? t.rewards ?? [] : [],
  };
}

/** Turns Postgres/PostgREST/auth errors into something a person can act on. */
function message(e: PostgrestError | { message: string } | null): string | null {
  if (!e) return null;
  const m = e.message;
  if (/row-level security/i.test(m)) return "You don't have permission to do that.";
  if (/duplicate key/i.test(m)) return "That already exists.";
  if (/min_le_goal/.test(m)) return "Minimum investment cannot exceed the goal.";
  if (/Invalid login credentials/i.test(m)) return "Wrong email or password.";
  if (/Email not confirmed/i.test(m)) return "Please confirm your email first: check your inbox for the link.";
  return m;
}

const fail = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong. Please try again.");

/* ───────────── provider ───────────── */

export function StoreProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(!isConfigured);
  const [db, setDb] = useState<DB>(EMPTY);
  const [user, setUser] = useState<User | null>(null);
  /** Which session the current `db` was loaded for ("anon" when signed out). */
  const [loadedFor, setLoadedFor] = useState<string | null>(isConfigured ? null : "anon");

  useEffect(() => {
    if (!isConfigured) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });
    // Keep this callback synchronous: Supabase advises against awaiting other calls inside it.
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const uid = session?.user.id ?? null;

  const reload = useCallback(async () => {
    if (!isConfigured) return;
    const [campaigns, stats, publicBiz, ownBiz, pledges, questions, prefs, profiles, roles] = await Promise.all([
      supabase.from("campaigns").select("*").order("created_at", { ascending: false }),
      supabase.from("campaign_stats").select("*"),
      supabase.from("business_public").select("*"),
      uid ? supabase.from("businesses").select("*") : null,
      uid ? supabase.from("pledges").select("*").order("created_at", { ascending: false }) : null,
      supabase.from("question_threads").select("*"),
      uid ? supabase.from("investor_prefs").select("*") : null,
      uid ? supabase.from("profiles").select("*") : null,
      uid ? supabase.from("user_roles").select("*") : null,
    ]);
    const firstError = [campaigns, stats, publicBiz, ownBiz, pledges, questions, prefs, profiles, roles].find((r) => r?.error)?.error;
    if (firstError) console.error("Load failed:", firstError.message);

    // Full rows (own / all for admin) win over the public view.
    const biz = new Map<string, BusinessProfile>();
    (publicBiz.data ?? []).forEach((r) => biz.set(r.user_id, toBusiness(r)));
    (ownBiz?.data ?? []).forEach((r) => biz.set(r.user_id, toBusiness(r)));

    const next: DB = {
      campaigns: (campaigns.data ?? []).map(toCampaign),
      stats: Object.fromEntries((stats.data ?? []).map((r) => [r.campaign_id, { raised: Number(r.raised), backers: Number(r.backers) }])),
      businesses: [...biz.values()],
      pledges: (pledges?.data ?? []).map(toPledge),
      questions: (questions.data ?? []).map(toQuestion),
      investors: (prefs?.data ?? []).map(toInvestor),
      profiles: (profiles?.data ?? []).map((r) => ({ id: r.id, name: r.full_name, email: r.email, createdAt: r.created_at })),
      roles: (roles?.data ?? []).map((r) => ({ userId: r.user_id, role: r.role })),
    };
    setDb(next);

    if (uid) {
      const me = next.profiles.find((p) => p.id === uid);
      const role = next.roles.find((r) => r.userId === uid)?.role;
      setUser(role ? { id: uid, name: me?.name || session?.user.email || "", email: me?.email || session?.user.email || "", role } : null);
    } else {
      setUser(null);
    }
    setLoadedFor(uid ?? "anon");
  }, [uid, session?.user.email]);

  useEffect(() => {
    if (authReady) reload();
  }, [authReady, reload]);

  /** Run a write, then refresh what the user can see. */
  const run = useCallback(async (op: () => PromiseLike<{ error: PostgrestError | null }>) => {
    try {
      const { error } = await op();
      if (!error) await reload();
      return message(error);
    } catch (e) {
      return fail(e);
    }
  }, [reload]);

  const store = useMemo<Store>(() => ({
    db,
    user,
    loading: !authReady || loadedFor !== (uid ?? "anon"),

    async signIn(email, password) {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      return message(error);
    },

    async signUp({ name, email, password, role }) {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { full_name: name.trim(), role }, emailRedirectTo: `${window.location.origin}/dashboard` },
      });
      return { error: message(error), needsConfirmation: !error && !data.session };
    },

    async signOut() {
      await supabase.auth.signOut();
      setUser(null);
    },

    async requestPasswordReset(email) {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      return message(error);
    },

    async updatePassword(password) {
      const { error } = await supabase.auth.updateUser({ password });
      return message(error);
    },

    saveBusiness(p, submit) {
      const row = {
        company_name: p.companyName.trim(), sector: p.sector, location: p.location, founded_year: p.foundedYear || null,
        trade_license_no: p.tradeLicenseNo.trim(), tin: p.tin.trim(), website: p.website.trim(), description: p.description,
        ...(submit ? { verification: "pending" } : {}),
      };
      const exists = db.businesses.some((b) => b.userId === p.userId);
      return run(() =>
        exists
          ? supabase.from("businesses").update(row).eq("user_id", p.userId)
          : supabase.from("businesses").insert({ user_id: p.userId, ...row }),
      );
    },

    saveInvestor(p) {
      return run(() =>
        supabase.from("investor_prefs").upsert({
          user_id: p.userId, sectors: p.sectors, locations: p.locations, types: p.types,
          min_ticket: p.minTicket, max_ticket: p.maxTicket, risk: p.risk,
        }),
      );
    },

    async saveCampaign(input, submit) {
      try {
        const row = { ...campaignRow(input), status: submit ? "pending" : "draft" };
        const res = input.id
          ? await supabase.from("campaigns").update(row).eq("id", input.id).select("id").single()
          : await supabase.from("campaigns").insert({ ...row, business_id: uid }).select("id").single();
        if (res.error) return { error: message(res.error) };
        await reload();
        return { id: res.data.id as string, error: null };
      } catch (e) {
        return { error: fail(e) };
      }
    },

    reviewCampaign(id, approve, reason) {
      return run(() => supabase.rpc("admin_review_campaign", { _campaign_id: id, _approve: approve, _reason: reason ?? null }));
    },

    setVerification(userId, approve, reason) {
      return run(() => supabase.rpc("admin_set_verification", { _user_id: userId, _approve: approve, _reason: reason ?? null }));
    },

    pledge(campaignId, amount) {
      return run(() => supabase.from("pledges").insert({ campaign_id: campaignId, amount }));
    },

    cancelPledge(id) {
      return run(() => supabase.rpc("cancel_pledge", { _pledge_id: id }));
    },

    ask(campaignId, text) {
      return run(() => supabase.from("questions").insert({ campaign_id: campaignId, body: text.trim() }));
    },

    answer(questionId, text) {
      return run(() => supabase.rpc("answer_question", { _question_id: questionId, _answer: text.trim() }));
    },

    reload,
  }), [db, user, authReady, loadedFor, uid, run, reload]);

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const s = useContext(StoreContext);
  if (!s) throw new Error("useStore must be used inside StoreProvider");
  return s;
}
