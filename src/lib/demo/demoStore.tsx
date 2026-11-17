import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { StoreContext, type Store } from "../store";
import type { BusinessProfile, Campaign, CampaignStats, DB } from "../types";
import { demoSeed, type DemoData } from "./seed";

/**
 * Demo mode: the whole app runs in the browser on sample data, with the same rules the database
 * enforces in production (verification, admin approval, pledge minimums). Used for the in-chat preview.
 */

const KEY = "fundbridge.demo.v1";
const SESSION = "fundbridge.demo.session.v1";

function load<T>(key: string, fallback: () => T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as T;
  } catch { /* storage unavailable */ }
  return fallback();
}
function save(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch { /* storage unavailable */ }
}

const id = (p: string) => `${p}-${Math.random().toString(36).slice(2, 10)}`;
const now = () => new Date().toISOString();
const today = () => new Date().toISOString().slice(0, 10);

export function DemoStoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<DemoData>(() => load(KEY, demoSeed));
  const [uid, setUid] = useState<string | null>(() => load<string | null>(SESSION, () => null));

  useEffect(() => save(KEY, data), [data]);
  useEffect(() => save(SESSION, uid), [uid]);

  const stats = useMemo(() => {
    const out: Record<string, CampaignStats> = {};
    for (const c of data.campaigns) {
      const active = data.pledges.filter((p) => p.campaignId === c.id && p.status === "active");
      out[c.id] = { raised: active.reduce((s, p) => s + p.amount, 0), backers: new Set(active.map((p) => p.investorId)).size };
    }
    return out;
  }, [data]);

  const db: DB = useMemo(() => ({ ...data, stats }), [data, stats]);
  const role = data.roles.find((r) => r.userId === uid)?.role;
  const me = data.profiles.find((p) => p.id === uid);
  const user = uid && role && me ? { id: uid, name: me.name, email: me.email, role } : null;

  /** Apply a change unless the check returns an error message. */
  const mutate = useCallback(async (check: (d: DemoData) => string | null, change: (d: DemoData) => void) => {
    const error = check(data);
    if (error) return error;
    const next = structuredClone(data);
    change(next);
    setData(next);
    return null;
  }, [data]);

  const isAdmin = role === "admin";
  const verified = (businessId: string) => data.businesses.find((b) => b.userId === businessId)?.verification === "verified";

  const store = useMemo<Store>(() => ({
    db,
    user,
    loading: false,

    async signIn(email, password) {
      const acc = data.accounts.find((a) => a.email.toLowerCase() === email.trim().toLowerCase());
      if (!acc || acc.password !== password) return "Wrong email or password.";
      setUid(acc.userId);
      return null;
    },

    async signUp({ name, email, password, role: r }) {
      if (data.accounts.some((a) => a.email.toLowerCase() === email.trim().toLowerCase())) {
        return { error: "An account with this email already exists.", needsConfirmation: false };
      }
      const userId = id("u");
      const next = structuredClone(data);
      next.accounts.push({ userId, email: email.trim(), password });
      next.profiles.push({ id: userId, name: name.trim(), email: email.trim(), createdAt: now() });
      next.roles.push({ userId, role: r });
      if (r === "investor") next.investors.push({ userId, sectors: [], locations: [], types: [], minTicket: 5000, maxTicket: 100000, risk: "medium" });
      setData(next);
      setUid(userId);
      return { error: null, needsConfirmation: false };
    },

    async signOut() { setUid(null); },
    async requestPasswordReset() { return "Password reset emails aren't sent in demo mode. Use password demo1234."; },
    async updatePassword(password) {
      return mutate(() => (uid ? null : "Log in first."), (d) => { const a = d.accounts.find((x) => x.userId === uid); if (a) a.password = password; });
    },

    saveBusiness(p, submit) {
      return mutate(
        () => (role === "business" && p.userId === uid ? null : "You don't have permission to do that."),
        (d) => {
          const old = d.businesses.find((b) => b.userId === p.userId);
          let verification: BusinessProfile["verification"] = old?.verification ?? "unverified";
          let rejectionReason = old?.rejectionReason;
          if (submit && verification !== "verified") { verification = "pending"; rejectionReason = undefined; }
          if (old?.verification === "verified" && (old.companyName !== p.companyName || old.tradeLicenseNo !== p.tradeLicenseNo || old.tin !== p.tin)) verification = "pending";
          const next = { ...p, verification, rejectionReason };
          d.businesses = old ? d.businesses.map((b) => (b.userId === p.userId ? next : b)) : [...d.businesses, next];
        },
      );
    },

    saveInvestor(p) {
      return mutate(
        () => (role === "investor" && p.userId === uid ? null : "You don't have permission to do that."),
        (d) => { d.investors = [...d.investors.filter((i) => i.userId !== p.userId), p]; },
      );
    },

    async saveCampaign(input, submit) {
      const existing = input.id ? data.campaigns.find((c) => c.id === input.id) : undefined;
      const cid = existing?.id ?? id("c");
      const error = await mutate(
        () => {
          if (role !== "business") return "You don't have permission to do that.";
          if (existing && (existing.businessId !== uid || !["draft", "rejected"].includes(existing.status))) return "Only draft or rejected campaigns can be edited.";
          if (input.minInvestment > input.goal) return "Minimum investment cannot exceed the goal.";
          if (submit && !verified(uid!)) return "Your business must be verified before submitting a campaign";
          if (submit && input.deadline <= today()) return "The deadline must be in the future";
          return null;
        },
        (d) => {
          const next: Campaign = {
            ...input, id: cid, businessId: uid!, createdAt: existing?.createdAt ?? now(),
            status: submit ? "pending" : "draft", rejectionReason: submit ? undefined : existing?.rejectionReason,
          };
          d.campaigns = existing ? d.campaigns.map((c) => (c.id === cid ? next : c)) : [next, ...d.campaigns];
        },
      );
      return error ? { error } : { id: cid, error: null };
    },

    reviewCampaign(cid, approve, reason) {
      return mutate(
        (d) => {
          const c = d.campaigns.find((x) => x.id === cid);
          if (!isAdmin) return "Admins only";
          if (!c || c.status !== "pending") return "Only campaigns pending review can be approved or rejected";
          if (approve && !verified(c.businessId)) return "The business must be verified first";
          if (!approve && !reason?.trim()) return "A rejection reason is required";
          return null;
        },
        (d) => { const c = d.campaigns.find((x) => x.id === cid)!; c.status = approve ? "live" : "rejected"; c.rejectionReason = approve ? undefined : reason; },
      );
    },

    setVerification(userId, approve, reason) {
      return mutate(
        () => (!isAdmin ? "Admins only" : !approve && !reason?.trim() ? "A rejection reason is required" : null),
        (d) => { const b = d.businesses.find((x) => x.userId === userId); if (b) { b.verification = approve ? "verified" : "rejected"; b.rejectionReason = approve ? undefined : reason; } },
      );
    },

    pledge(campaignId, amount) {
      return mutate(
        (d) => {
          const c = d.campaigns.find((x) => x.id === campaignId);
          if (role !== "investor") return "You don't have permission to do that.";
          if (!c || c.status !== "live" || c.deadline < today()) return "This campaign is not accepting pledges";
          if (!verified(c.businessId)) return "This business is not verified";
          if (amount < c.minInvestment) return `The minimum pledge is ${c.minInvestment}`;
          return null;
        },
        (d) => { d.pledges.unshift({ id: id("p"), campaignId, investorId: uid!, amount, status: "active", createdAt: now() }); },
      );
    },

    cancelPledge(pid) {
      return mutate(
        (d) => {
          const p = d.pledges.find((x) => x.id === pid);
          const c = p && d.campaigns.find((x) => x.id === p.campaignId);
          return p && c && p.investorId === uid && p.status === "active" && c.status === "live" && c.deadline >= today() ? null : "This pledge cannot be cancelled";
        },
        (d) => { const p = d.pledges.find((x) => x.id === pid)!; p.status = "cancelled"; },
      );
    },

    ask(campaignId, text) {
      return mutate(
        (d) => (role !== "investor" ? "You don't have permission to do that." : d.campaigns.find((c) => c.id === campaignId)?.status !== "live" ? "Questions can only be asked on live campaigns" : null),
        (d) => { d.questions.push({ id: id("q"), campaignId, investorId: uid!, askerName: me?.name ?? "Investor", text: text.trim(), createdAt: now() }); },
      );
    },

    answer(questionId, text) {
      return mutate(
        (d) => {
          const q = d.questions.find((x) => x.id === questionId);
          const c = q && d.campaigns.find((x) => x.id === q.campaignId);
          return c?.businessId === uid ? null : "Only the business that owns this campaign can answer";
        },
        (d) => { const q = d.questions.find((x) => x.id === questionId)!; q.answer = { text: text.trim(), at: now() }; },
      );
    },

    async reload() { /* nothing to fetch */ },
  }), [db, user, data, uid, role, me, isAdmin, mutate]); // eslint-disable-line react-hooks/exhaustive-deps

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function resetDemo() {
  save(KEY, null);
  save(SESSION, null);
  window.location.reload();
}
