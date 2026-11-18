import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { StoreContext, type Store } from "../store";
import { DEFAULT_SETTINGS, type AuditEntry, type BusinessProfile, type Campaign, type CampaignStats, type DB, type FinancialSummary } from "../types";
import { docPath, validateDocument } from "../documents";
import { profitOf, submitProblems } from "../project";
import { generateObligations } from "../tracking";
import { demoSeed, type DemoData } from "./seed";

/**
 * Demo mode: the whole app runs in the browser on sample data, with the same rules the database
 * enforces in production (verification, admin approval, pledge minimums). Used for the in-chat preview.
 */

// v3: sample data includes a funded campaign (tracking) and sample documents (eligibility).
const KEY = "fundbridge.demo.v3";
const SESSION = "fundbridge.demo.session.v3";

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
  // Older saved demo data may predate newer features: fill those parts in from the seed.
  const [data, setData] = useState<DemoData>(() => {
    const seed = demoSeed();
    const saved = load<Partial<DemoData>>(KEY, () => seed);
    return {
      ...seed, ...saved,
      settings: { ...DEFAULT_SETTINGS, ...saved.settings },
      audit: saved.audit ?? [],
      projects: saved.projects ?? seed.projects,
      financials: saved.financials ?? seed.financials,
      documents: saved.documents ?? [],
      obligations: saved.obligations ?? seed.obligations,
      updates: saved.updates ?? seed.updates,
      helpArticles: saved.helpArticles ?? [],
    } as DemoData;
  });
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

  // Mirrors the campaign_financial_summary view.
  const financialSummary = useMemo(() => {
    const out: Record<string, FinancialSummary> = {};
    for (const f of Object.values(data.financials)) {
      const [latest, prev] = [...f.history].sort((a, b) => b.year - a.year);
      out[f.campaignId] = {
        campaignId: f.campaignId, yearsReported: f.history.length, checked: f.checked, latestYear: latest?.year,
        revenueGrowthPct: latest && prev && prev.revenue > 0 ? Math.round(((latest.revenue - prev.revenue) / prev.revenue) * 1000) / 10 : null,
        profitMarginPct: latest && latest.revenue > 0 ? Math.round((profitOf(latest) / latest.revenue) * 1000) / 10 : null,
      };
    }
    return out;
  }, [data]);

  // Like the campaign_updates policy: updates are for backers, the campaign's business and admins.
  const visibleUpdates = useMemo(() => {
    const isAdminUser = data.roles.some((r) => r.userId === uid && r.role === "admin");
    return data.updates.filter((u) => isAdminUser
      || data.campaigns.some((c) => c.id === u.campaignId && c.businessId === uid)
      || data.pledges.some((p) => p.campaignId === u.campaignId && p.investorId === uid && p.status === "active"));
  }, [data, uid]);

  // Like the help_articles policy: admin-only and hidden edits are for admins.
  const isAdminViewer = data.roles.some((r) => r.userId === uid && r.role === "admin");
  const helpArticles = useMemo(() => data.helpArticles.filter((h) => isAdminViewer || (!h.hidden && h.audience !== "admin")), [data, isAdminViewer]);

  const db: DB = useMemo(() => ({ ...data, stats, financialSummary, updates: visibleUpdates, helpArticles }),
    [data, stats, financialSummary, visibleUpdates, helpArticles]);
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
  /** Admin change + activity-log entry, like the database's admin_log(). */
  const adminAct = (check: (d: DemoData) => string | null, change: (d: DemoData) => void, log: Omit<AuditEntry, "id" | "adminId" | "createdAt">) =>
    mutate(
      (d) => (isAdmin ? check(d) : "Admins only"),
      (d) => { change(d); d.audit.unshift({ ...log, id: id("a"), adminId: uid, createdAt: now() }); },
    );
  const editable = (d: DemoData, campaignId: string) => {
    const c = d.campaigns.find((x) => x.id === campaignId);
    return !!c && c.businessId === uid && (c.status === "draft" || c.status === "rejected");
  };
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
          if (submit) {
            const draft = { ...input, id: cid, businessId: uid!, status: "draft", createdAt: now() } as Campaign;
            const problems = submitProblems(draft, data.businesses.find((b) => b.userId === uid), data.projects[cid], data.financials[cid], data.settings,
              { campaigns: data.campaigns, documents: data.documents, obligations: data.obligations });
            if (problems.length) return `${problems[0].section}: ${problems[0].message}`;
          }
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
      return adminAct(
        (d) => {
          const c = d.campaigns.find((x) => x.id === cid);
          if (!c || c.status !== "pending") return "Only campaigns pending review can be approved or rejected";
          if (approve && !verified(c.businessId)) return "The business must be verified first";
          if (!approve && !reason?.trim()) return "A rejection reason is required";
          return null;
        },
        (d) => { const c = d.campaigns.find((x) => x.id === cid)!; c.status = approve ? "live" : "rejected"; c.rejectionReason = approve ? undefined : reason; },
        { action: approve ? "campaign.approve" : "campaign.reject", targetType: "campaign", targetId: cid, detail: reason ?? null },
      );
    },

    setVerification(userId, approve, reason) {
      return adminAct(
        () => (!approve && !reason?.trim() ? "A rejection reason is required" : null),
        (d) => { const b = d.businesses.find((x) => x.userId === userId); if (b) { b.verification = approve ? "verified" : "rejected"; b.rejectionReason = approve ? undefined : reason; } },
        { action: approve ? "business.verify" : "business.reject", targetType: "business", targetId: userId, detail: reason ?? null },
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

    updateSettings(s) {
      const clean = (xs: string[]) => {
        const seen = new Set<string>();
        return xs.map((x) => x.trim()).filter((x) => x && !seen.has(x.toLowerCase()) && seen.add(x.toLowerCase()))
          .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
      };
      const sectors = clean(s.sectors), locations = clean(s.locations);
      return adminAct(
        () => (sectors.length && locations.length ? null : "Keep at least one sector and one location"),
        (d) => { d.settings = { ...d.settings, sectors, locations, announcement: s.announcement.trim() }; },
        { action: "settings.update", targetType: "settings", targetId: "platform",
          detail: `${sectors.length} sectors, ${locations.length} locations, announcement ${s.announcement.trim() ? "on" : "off"}` },
      );
    },

    updateProjectSettings(commitments, minReporting, minAccountYears) {
      const list = commitments.map((x) => x.trim()).filter(Boolean);
      return adminAct(
        () => (!list.length ? "Keep at least one standard commitment" : minAccountYears < 0 || minAccountYears > 5 ? "Years of accounts must be between 0 and 5" : null),
        (d) => { d.settings = { ...d.settings, commitmentOptions: list, minReporting, minAccountYears }; },
        { action: "settings.project", targetType: "settings", targetId: "platform",
          detail: `${list.length} commitments, updates at least ${minReporting}, ${minAccountYears} years of accounts` },
      );
    },

    checkFinancials(campaignId, checked, note) {
      return adminAct(
        (d) => (d.financials[campaignId] ? null : "This campaign has no accounts yet"),
        (d) => { Object.assign(d.financials[campaignId], { checked, checkedAt: checked ? now() : undefined, checkNote: note?.trim() || undefined }); },
        { action: checked ? "financials.check" : "financials.uncheck", targetType: "campaign", targetId: campaignId, detail: note ?? null },
      );
    },

    /* Project page: the business may edit only while its campaign is a draft or rejected (like campaign_editable()). */
    saveProject(p) {
      return mutate(
        (d) => (editable(d, p.campaignId) ? null : "You can only edit the project page of your own draft or rejected campaign."),
        (d) => {
          const old = d.projects[p.campaignId];
          const name = p.declarationName.trim();
          // Like the database trigger: the declaration time and accepted commitments are recorded here, not by the form.
          const redeclare = name && (!old?.declaredAt || old.declarationName !== name);
          d.projects[p.campaignId] = {
            ...p, declarationName: name,
            declaredAt: !name ? undefined : redeclare ? now() : old?.declaredAt,
            acceptedCommitments: !name ? [] : redeclare ? [...d.settings.commitmentOptions] : old?.acceptedCommitments ?? [],
          };
        },
      );
    },

    saveFinancials(f) {
      return mutate(
        (d) => (editable(d, f.campaignId) ? null : "You can only edit the accounts of your own draft or rejected campaign."),
        (d) => { d.financials[f.campaignId] = { ...f, checked: false, checkedAt: undefined, checkNote: undefined }; },
      );
    },

    async uploadDocument(campaignId, file, kind, title) {
      // The demo keeps files in this browser, so it uses a smaller limit than the real 10 MB.
      const invalid = validateDocument(file, title, 1.5 * 1024 * 1024);
      if (invalid) return invalid;
      if (!editable(data, campaignId)) return "You can only add documents to your own draft or rejected campaign.";
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => reject(r.error);
        r.readAsDataURL(file);
      });
      return mutate(() => null, (d) => {
        d.documents.push({ id: id("d"), campaignId, kind, title: title.trim(), path: docPath(campaignId, file.name), sizeBytes: file.size, mime: file.type, createdAt: now(), dataUrl });
      });
    },

    deleteDocument(doc) {
      return mutate(
        (d) => (editable(d, doc.campaignId) ? null : "You can only remove documents from your own draft or rejected campaign."),
        (d) => { d.documents = d.documents.filter((x) => x.id !== doc.id); },
      );
    },

    async openDocument(doc) {
      if (!uid) return { error: "Log in to view documents." };
      const found = data.documents.find((x) => x.id === doc.id);
      return found?.dataUrl ? { url: found.dataUrl, error: null } : { error: "Document not found." };
    },

    /* Commitment tracking (mirrors post_campaign_update and the admin tracking functions). */
    postUpdate(u) {
      return mutate(
        (d) => {
          const c = d.campaigns.find((x) => x.id === u.campaignId);
          if (!c || c.businessId !== uid || !c.fundedOn) return "Only the business behind a funded campaign can post updates";
          if (!u.title.trim() || !u.body.trim()) return "Give the update a title and some details.";
          if (u.obligationId) {
            const o = d.obligations.find((x) => x.id === u.obligationId && x.campaignId === u.campaignId);
            if (!o) return "That commitment does not belong to this campaign";
            if (o.status !== "open") return `That commitment is already ${o.status}`;
            if (o.kind === "repayment" && !(u.amount && u.amount > 0)) return "Enter the amount repaid";
          }
          return null;
        },
        (d) => {
          const upId = id("up");
          d.updates.unshift({ ...u, id: upId, title: u.title.trim(), body: u.body.trim(), createdAt: now() });
          const o = d.obligations.find((x) => x.id === u.obligationId);
          if (o) Object.assign(o, { status: "done", completedAt: now(), updateId: upId });
        },
      );
    },

    markFunded(campaignId, fundedOn) {
      return adminAct(
        (d) => {
          const c = d.campaigns.find((x) => x.id === campaignId);
          if (!c) return "Campaign not found";
          if (c.fundedOn) return "This campaign is already marked as funded";
          if (c.status !== "live" && c.status !== "closed") return "Only live or closed campaigns can be marked as funded";
          const raised = d.pledges.filter((p) => p.campaignId === campaignId && p.status === "active").reduce((s, p) => s + p.amount, 0);
          return raised < c.goal ? `Not fully funded: ${raised} pledged of a ${c.goal} goal` : null;
        },
        (d) => {
          const c = d.campaigns.find((x) => x.id === campaignId)!;
          Object.assign(c, { status: "closed", fundedOn });
          d.obligations.push(...generateObligations(c, d.projects[campaignId], d.settings, fundedOn, () => id("ob")));
        },
        { action: "campaign.funded", targetType: "campaign", targetId: campaignId, detail: `Funded on ${fundedOn}` },
      );
    },

    setObligation(oid, action, dueOn, reason) {
      return adminAct(
        (d) => {
          const o = d.obligations.find((x) => x.id === oid);
          if (!reason.trim()) return "A reason is required";
          if (!o) return "Commitment not found";
          if (action === "reschedule" && !dueOn) return "Choose the new due date";
          if ((action === "reschedule" || action === "waive") && o.status !== "open") return `Only open commitments can be ${action === "waive" ? "waived" : "rescheduled"}`;
          if (action === "reopen" && o.status !== "waived") return "Only waived commitments can be reopened";
          return null;
        },
        (d) => {
          const o = d.obligations.find((x) => x.id === oid)!;
          if (action === "reschedule") o.dueOn = dueOn!;
          if (action === "waive") o.status = "waived";
          if (action === "reopen") o.status = "open";
          o.note = reason.trim();
        },
        { action: `obligation.${action}`, targetType: "obligation", targetId: oid, detail: reason + (action === "reschedule" ? ` (new due date ${dueOn})` : "") },
      );
    },

    removeUpdate(upId, reason) {
      const u = data.updates.find((x) => x.id === upId);
      return adminAct(
        () => (!reason.trim() ? "A reason is required" : u ? null : "Update not found"),
        (d) => {
          d.updates = d.updates.filter((x) => x.id !== upId);
          d.obligations.filter((o) => o.updateId === upId).forEach((o) => Object.assign(o, { status: "open", completedAt: undefined, updateId: undefined }));
        },
        { action: "update.remove", targetType: "update", targetId: upId, detail: `${reason} | removed: ${u?.title ?? ""}` },
      );
    },

    updateTrackingSettings(trackingMonths, dueSoonDays, deliveryMonths) {
      return adminAct(
        () => (trackingMonths < 3 || trackingMonths > 120 || dueSoonDays < 1 || dueSoonDays > 90 || deliveryMonths < 1 || deliveryMonths > 24
          ? "Tracking 3–120 months, warnings 1–90 days ahead, reward delivery 1–24 months" : null),
        (d) => { d.settings = { ...d.settings, trackingMonths, dueSoonDays, deliveryMonths }; },
        { action: "settings.tracking", targetType: "settings", targetId: "platform",
          detail: `track ${trackingMonths} months, warn ${dueSoonDays} days ahead, rewards due after ${deliveryMonths} months` },
      );
    },

    updateEligibility(e) {
      return adminAct(
        () => (e.minGoal <= 0 || e.maxGoal < e.minGoal ? "The minimum goal must be above zero and not more than the maximum" : null),
        (d) => { d.settings = { ...d.settings, ...e }; },
        { action: "settings.eligibility", targetType: "settings", targetId: "platform",
          detail: `${e.minYearsOperating} yr operating, goal ${e.minGoal}–${e.maxGoal}, ≤${e.maxGoalToRevenue}× sales, ${e.maxOpenCampaigns} open, docs ${e.requiredDocKinds.join("+")}, overdue ${e.blockIfOverdue ? "blocks" : "allowed"}` },
      );
    },

    saveHelpArticle(a) {
      const existed = data.helpArticles.some((h) => h.slug === a.slug);
      return adminAct(
        () => (!/^[a-z0-9-]{2,60}$/.test(a.slug) ? "Use 2–60 lowercase letters, numbers and dashes for the article address."
          : !a.titleEn.trim() ? "The English title is required." : null),
        (d) => { d.helpArticles = [...d.helpArticles.filter((h) => h.slug !== a.slug), { ...a, updatedAt: now() }]; },
        { action: a.hidden ? "help.hide" : existed ? "help.edit" : "help.save", targetType: "help", targetId: a.slug, detail: a.titleEn },
      );
    },

    resetHelpArticle(slug, reason) {
      return adminAct(
        (d) => (!reason.trim() ? "A reason is required" : d.helpArticles.some((h) => h.slug === slug) ? null : "This article has no admin changes to reset"),
        (d) => { d.helpArticles = d.helpArticles.filter((h) => h.slug !== slug); },
        { action: "help.reset", targetType: "help", targetId: slug, detail: reason },
      );
    },

    setRole(userId, newRole) {
      return adminAct(
        (d) => (userId === uid ? "You cannot change your own role" : d.roles.some((r) => r.userId === userId) ? null : "User not found"),
        (d) => {
          d.roles = d.roles.map((r) => (r.userId === userId ? { ...r, role: newRole } : r));
          if (newRole === "investor" && !d.investors.some((i) => i.userId === userId)) {
            d.investors.push({ userId, sectors: [], locations: [], types: [], minTicket: 5000, maxTicket: 100000, risk: "medium" });
          }
        },
        { action: "user.set_role", targetType: "user", targetId: userId, detail: newRole },
      );
    },

    closeCampaign(cid, reason) {
      return adminAct(
        (d) => (!reason.trim() ? "A reason is required to close a campaign" : d.campaigns.find((c) => c.id === cid)?.status !== "live" ? "Only live campaigns can be closed" : null),
        (d) => { const c = d.campaigns.find((x) => x.id === cid)!; c.status = "closed"; c.rejectionReason = reason.trim(); },
        { action: "campaign.close", targetType: "campaign", targetId: cid, detail: reason },
      );
    },

    adminCancelPledge(pid, reason) {
      return adminAct(
        (d) => (!reason.trim() ? "A reason is required to cancel a pledge" : d.pledges.find((p) => p.id === pid)?.status !== "active" ? "Only active pledges can be cancelled" : null),
        (d) => { const p = d.pledges.find((x) => x.id === pid)!; p.status = "cancelled"; },
        { action: "pledge.cancel", targetType: "pledge", targetId: pid, detail: reason },
      );
    },

    deleteQuestion(qid, reason) {
      const q = data.questions.find((x) => x.id === qid);
      return adminAct(
        () => (q ? null : "Question not found"),
        (d) => { d.questions = d.questions.filter((x) => x.id !== qid); },
        { action: "question.delete", targetType: "question", targetId: qid, detail: `${reason.trim() || "No reason given"} | removed text: ${q?.text.slice(0, 200) ?? ""}` },
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
