import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useStore } from "../../lib/store";
import { Empty, ErrorNote, ReasonAction, Stat, StatusBadge, TypeBadge } from "../../components/ui";
import { effectiveStatus, formatDate, formatMoney, raisedFor } from "../../lib/format";
import { allowedReporting, REPORTING_LABEL, submitProblems } from "../../lib/project";
import { compliance, obligationState, today } from "../../lib/tracking";
import { ComplianceSummary, KIND_LABEL, StateBadge, UpdateCard } from "../../components/tracking/Tracking";
import { HelpLink, Markdown } from "../../components/help/Markdown";
import { AUDIENCE_LABEL, BUILT_IN, fillPlaceholders, mergeManual, type Audience, type HelpArticle, type HelpArticleRow } from "../../lib/manual";
import type { Lang } from "../../lib/i18n";
import { REPORTING, type Campaign, type Reporting } from "../../lib/types";
import type { AuditEntry, Role } from "../../lib/types";

const REVIEW_SECTIONS = ["General", "Basics", "Business", "Accounts", "Plan", "Commitments"];

/**
 * Admin control panel. Every action goes through an admin function in the database that re-checks the role
 * and writes the activity log. New features add their own tab here (see CLAUDE.md).
 */

const TABS = [
  ["overview", "Overview"],
  ["businesses", "Businesses"],
  ["campaigns", "Campaigns"],
  ["users", "Users"],
  ["pledges", "Pledges"],
  ["tracking", "Tracking"],
  ["questions", "Q&A"],
  ["settings", "Settings"],
  ["manual", "Manual"],
  ["activity", "Activity log"],
] as const;
type Tab = (typeof TABS)[number][0];

/** Shared state for every tab: one busy flag and one result message. */
function useAdminAction() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const act = async (fn: () => Promise<string | null>, success: string) => {
    setBusy(true);
    setErr(null);
    setOk(null);
    const error = await fn();
    setBusy(false);
    if (error) setErr(error);
    else setOk(success);
  };
  return { busy, err, ok, act };
}
type Act = ReturnType<typeof useAdminAction>;

export default function ControlPanel() {
  const [params, setParams] = useSearchParams();
  const tab = (TABS.some(([t]) => t === params.get("tab")) ? params.get("tab") : "overview") as Tab;
  const action = useAdminAction();
  const { db } = useStore();
  const pendingBiz = db.businesses.filter((b) => b.verification === "pending").length;
  const pendingCampaigns = db.campaigns.filter((c) => c.status === "pending").length;
  const overdue = db.obligations.filter((o) => obligationState(o, db.settings.dueSoonDays) === "overdue").length;
  const badge: Partial<Record<Tab, number>> = { businesses: pendingBiz, campaigns: pendingCampaigns, tracking: overdue };

  return (
    <div className="space-y-6">
      <nav className="-mx-1 flex gap-1 overflow-x-auto border-b border-slate-200 px-1" aria-label="Control panel sections">
        {TABS.map(([t, label]) => (
          <button
            key={t}
            type="button"
            onClick={() => setParams({ tab: t })}
            aria-current={tab === t ? "page" : undefined}
            className={`-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium ${
              tab === t ? "border-brand-600 text-brand-700" : "border-transparent text-slate-600 hover:text-slate-900"
            }`}
          >
            {label}
            {!!badge[t] && <span className="badge bg-yellow-100 text-yellow-800">{badge[t]}</span>}
          </button>
        ))}
      </nav>

      <div className="flex justify-end">
        <HelpLink article={tab === "tracking" ? "admin-funding-and-tracking" : tab === "settings" || tab === "manual" || tab === "users" || tab === "activity" ? "admin-settings-and-manual" : "admin-reviewing"}>Admin guide</HelpLink>
      </div>
      <ErrorNote>{action.err}</ErrorNote>
      {action.ok && <p className="rounded-lg bg-brand-50 p-3 text-sm text-brand-700" role="status">{action.ok}</p>}

      {tab === "overview" && <Overview action={action} go={(t) => setParams({ tab: t })} />}
      {tab === "businesses" && <Businesses action={action} />}
      {tab === "campaigns" && <Campaigns action={action} />}
      {tab === "users" && <Users action={action} />}
      {tab === "pledges" && <Pledges action={action} />}
      {tab === "tracking" && <Tracking action={action} />}
      {tab === "questions" && <Questions action={action} />}
      {tab === "settings" && <Settings action={action} />}
      {tab === "manual" && <ManualEditor action={action} />}
      {tab === "activity" && <Activity />}
    </div>
  );
}

/* ───────────── shared pieces ───────────── */

function Table({ head, children, empty }: { head: string[]; children: ReactNode[]; empty: string }) {
  if (children.length === 0) return <Empty>{empty}</Empty>;
  return (
    <div className="card overflow-x-auto p-0">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>{head.map((h, i) => <th key={i} className="px-3 py-2 font-semibold">{h}</th>)}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function Filters<T extends string>({ value, onChange, options, search, onSearch }: {
  value: T; onChange: (v: T) => void; options: [T, string, number][]; search: string; onSearch: (s: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap gap-2">
        {options.map(([v, label, count]) => (
          <button key={v} type="button" onClick={() => onChange(v)}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${value === v ? "border-brand-600 bg-brand-600 text-white" : "border-slate-300 bg-white text-slate-700 hover:border-brand-500"}`}>
            {label} · {count}
          </button>
        ))}
      </div>
      <input className="input sm:w-64" placeholder="Search…" aria-label="Search" value={search} onChange={(e) => onSearch(e.target.value)} />
    </div>
  );
}

const matches = (q: string, ...fields: (string | undefined)[]) => !q || fields.join(" ").toLowerCase().includes(q.toLowerCase());

/* ───────────── Overview ───────────── */

function Overview({ action, go }: { action: Act; go: (t: Tab) => void }) {
  const { db, setVerification, reviewCampaign } = useStore();
  const count = (r: Role) => db.roles.filter((x) => x.role === r).length;
  const totalPledged = Object.values(db.stats).reduce((s, x) => s + x.raised, 0);
  const pendingBiz = db.businesses.filter((b) => b.verification === "pending");
  const pendingCampaigns = db.campaigns.filter((c) => c.status === "pending");
  const live = db.campaigns.filter((c) => effectiveStatus(c) === "live");
  const funded = db.campaigns.filter((c) => raisedFor(db, c.id) >= c.goal).length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <Stat label="Investors" value={count("investor")} />
        <Stat label="Businesses" value={`${db.businesses.filter((b) => b.verification === "verified").length} verified / ${db.businesses.length}`} />
        <Stat label="Live campaigns" value={`${live.length} (${funded} funded)`} />
        <Stat label="Total pledged" value={formatMoney(totalPledged)} />
      </div>

      <OverdueAlert go={go} />

      <section className="card space-y-3">
        <h2 className="text-lg font-bold">Needs your review</h2>
        {pendingBiz.length + pendingCampaigns.length === 0 && <p className="text-sm text-slate-500">Nothing is waiting. All caught up.</p>}
        {pendingBiz.map((b) => (
          <div key={b.userId} className="flex flex-col gap-3 border-t border-slate-100 pt-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm">
              <p><span className="badge mr-2 bg-slate-100 text-slate-700">Business</span><b>{b.companyName}</b> · {b.sector} · {b.location}</p>
              <p className="text-slate-600">Trade licence <b>{b.tradeLicenseNo}</b> · TIN <b>{b.tin}</b></p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="btn-primary" disabled={action.busy} onClick={() => action.act(() => setVerification(b.userId, true), `${b.companyName} verified.`)}>Verify</button>
              <ReasonAction label="Reject" submitLabel="Send rejection" disabled={action.busy}
                onSubmit={(r) => action.act(() => setVerification(b.userId, false, r), `${b.companyName} rejected.`)} />
            </div>
          </div>
        ))}
        {pendingCampaigns.map((c) => {
          const biz = db.businesses.find((b) => b.userId === c.businessId);
          return (
            <div key={c.id} className="flex flex-col gap-3 border-t border-slate-100 pt-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm">
                <p><span className="badge mr-2 bg-slate-100 text-slate-700">Campaign</span><Link to={`/campaigns/${c.id}`} className="font-semibold text-brand-700 hover:underline">{c.title}</Link></p>
                <p className="text-slate-600">{biz?.companyName} · Goal {formatMoney(c.goal)} · closes {formatDate(c.deadline)}
                  {biz?.verification !== "verified" && <span className="text-red-600"> · business not verified</span>}</p>
                <ProjectStatus c={c} action={action} />
              </div>
              <div className="flex flex-wrap gap-2">
                <button className="btn-primary" disabled={action.busy || biz?.verification !== "verified"} onClick={() => action.act(() => reviewCampaign(c.id, true), `"${c.title}" is live.`)}>Approve</button>
                <ReasonAction label="Request changes" submitLabel="Send to business" disabled={action.busy} sections={REVIEW_SECTIONS}
                  onSubmit={(r) => action.act(() => reviewCampaign(c.id, false, r), `"${c.title}" sent back to the business.`)} />
              </div>
            </div>
          );
        })}
      </section>

      <section className="card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Recent admin activity</h2>
          <button type="button" className="text-sm font-semibold text-brand-700 hover:underline" onClick={() => go("activity")}>Full log →</button>
        </div>
        {db.audit.length === 0 ? <p className="text-sm text-slate-500">No admin actions yet.</p> : (
          <ul className="space-y-2 text-sm">{db.audit.slice(0, 5).map((a) => <AuditLine key={a.id} entry={a} />)}</ul>
        )}
      </section>
    </div>
  );
}

/* ───────────── Businesses ───────────── */

function Businesses({ action }: { action: Act }) {
  const { db, setVerification } = useStore();
  type F = "all" | "pending" | "verified" | "rejected" | "unverified";
  const [filter, setFilter] = useState<F>("all");
  const [q, setQ] = useState("");
  const n = (v: F) => (v === "all" ? db.businesses.length : db.businesses.filter((b) => b.verification === v).length);
  const rows = db.businesses
    .filter((b) => filter === "all" || b.verification === filter)
    .filter((b) => matches(q, b.companyName, b.sector, b.location, b.tradeLicenseNo, db.profiles.find((p) => p.id === b.userId)?.email));

  return (
    <div className="space-y-4">
      <Filters value={filter} onChange={setFilter} search={q} onSearch={setQ}
        options={(["all", "pending", "verified", "rejected", "unverified"] as F[]).map((v) => [v, v[0].toUpperCase() + v.slice(1), n(v)])} />
      <Table head={["Business", "Owner", "Licence / TIN", "Campaigns", "Status", ""]} empty="No businesses match.">
        {rows.map((b) => {
          const owner = db.profiles.find((p) => p.id === b.userId);
          return (
            <tr key={b.userId} className="border-t border-slate-100 align-top">
              <td className="px-3 py-3"><p className="font-semibold">{b.companyName}</p><p className="text-xs text-slate-500">{b.sector} · {b.location} · since {b.foundedYear}</p></td>
              <td className="px-3 py-3"><p>{owner?.name}</p><p className="text-xs text-slate-500">{owner?.email}</p></td>
              <td className="px-3 py-3 text-xs"><p>{b.tradeLicenseNo || "—"}</p><p className="text-slate-500">{b.tin || "—"}</p></td>
              <td className="px-3 py-3">{db.campaigns.filter((c) => c.businessId === b.userId).length}</td>
              <td className="px-3 py-3"><StatusBadge status={b.verification} />{b.rejectionReason && <p className="mt-1 max-w-48 text-xs text-slate-500">{b.rejectionReason}</p>}</td>
              <td className="px-3 py-3">
                <div className="flex flex-wrap justify-end gap-2">
                  {b.verification !== "verified" && (
                    <button className="btn-primary" disabled={action.busy} onClick={() => action.act(() => setVerification(b.userId, true), `${b.companyName} verified.`)}>Verify</button>
                  )}
                  {b.verification !== "rejected" && (
                    <ReasonAction label={b.verification === "verified" ? "Revoke" : "Reject"} submitLabel={b.verification === "verified" ? "Revoke verification" : "Send rejection"}
                      disabled={action.busy} onSubmit={(r) => action.act(() => setVerification(b.userId, false, r), `${b.companyName} is no longer verified.`)} />
                  )}
                </div>
              </td>
            </tr>
          );
        })}
      </Table>
    </div>
  );
}

/* ───────────── Campaigns ───────────── */

function Campaigns({ action }: { action: Act }) {
  const { db, reviewCampaign, closeCampaign } = useStore();
  type F = "all" | "pending" | "live" | "draft" | "rejected" | "closed";
  const [filter, setFilter] = useState<F>("all");
  const [q, setQ] = useState("");
  const status = (c: (typeof db.campaigns)[number]) => effectiveStatus(c);
  const n = (v: F) => (v === "all" ? db.campaigns.length : db.campaigns.filter((c) => status(c) === v).length);
  const rows = db.campaigns
    .filter((c) => filter === "all" || status(c) === filter)
    .filter((c) => matches(q, c.title, c.sector, db.businesses.find((b) => b.userId === c.businessId)?.companyName));

  return (
    <div className="space-y-4">
      <Filters value={filter} onChange={setFilter} search={q} onSearch={setQ}
        options={(["all", "pending", "live", "draft", "rejected", "closed"] as F[]).map((v) => [v, v[0].toUpperCase() + v.slice(1), n(v)])} />
      <Table head={["Campaign", "Type", "Raised / goal", "Deadline", "Status", "Project page", ""]} empty="No campaigns match.">
        {rows.map((c) => {
          const biz = db.businesses.find((b) => b.userId === c.businessId);
          const st = status(c);
          return (
            <tr key={c.id} className="border-t border-slate-100 align-top">
              <td className="px-3 py-3"><Link to={`/campaigns/${c.id}`} className="font-semibold text-brand-700 hover:underline">{c.title}</Link><p className="text-xs text-slate-500">{biz?.companyName} · {c.sector}</p></td>
              <td className="px-3 py-3"><TypeBadge type={c.type} /></td>
              <td className="px-3 py-3 tabular-nums">{formatMoney(raisedFor(db, c.id))}<p className="text-xs text-slate-500">of {formatMoney(c.goal)}</p></td>
              <td className="px-3 py-3">{formatDate(c.deadline)}</td>
              <td className="px-3 py-3"><StatusBadge status={st} />{c.rejectionReason && <p className="mt-1 max-w-48 text-xs text-slate-500">{c.rejectionReason}</p>}</td>
              <td className="px-3 py-3"><ProjectStatus c={c} action={action} compact /></td>
              <td className="px-3 py-3">
                <div className="flex flex-wrap justify-end gap-2">
                  {c.status === "pending" && (
                    <>
                      <button className="btn-primary" disabled={action.busy || biz?.verification !== "verified"} onClick={() => action.act(() => reviewCampaign(c.id, true), `"${c.title}" is live.`)}>Approve</button>
                      <ReasonAction label="Request changes" submitLabel="Send to business" disabled={action.busy} sections={REVIEW_SECTIONS} onSubmit={(r) => action.act(() => reviewCampaign(c.id, false, r), `"${c.title}" sent back to the business.`)} />
                    </>
                  )}
                  {(c.status === "live" || c.status === "closed") && !c.fundedOn && raisedFor(db, c.id) >= c.goal && (
                    <MarkFunded c={c} action={action} />
                  )}
                  {c.fundedOn && <span className="badge bg-green-100 text-green-800">Funded {formatDate(c.fundedOn)}</span>}
                  {st === "live" && (
                    <ReasonAction label="Close" submitLabel="Close campaign" disabled={action.busy} onSubmit={(r) => action.act(() => closeCampaign(c.id, r), `"${c.title}" closed. It no longer accepts pledges.`)} />
                  )}
                </div>
              </td>
            </tr>
          );
        })}
      </Table>
    </div>
  );
}

/* ───────────── Users ───────────── */

function Users({ action }: { action: Act }) {
  const { db, user, setRole } = useStore();
  type F = "all" | Role;
  const [filter, setFilter] = useState<F>("all");
  const [q, setQ] = useState("");
  const [draft, setDraft] = useState<Record<string, Role>>({});
  const roleOf = (id: string) => db.roles.find((r) => r.userId === id)?.role;
  const n = (v: F) => (v === "all" ? db.profiles.length : db.roles.filter((r) => r.role === v).length);
  const rows = db.profiles
    .filter((p) => filter === "all" || roleOf(p.id) === filter)
    .filter((p) => matches(q, p.name, p.email));

  return (
    <div className="space-y-4">
      <Filters value={filter} onChange={setFilter} search={q} onSearch={setQ}
        options={(["all", "investor", "business", "admin"] as F[]).map((v) => [v, v[0].toUpperCase() + v.slice(1) + (v === "all" ? "" : "s"), n(v)])} />
      <Table head={["Name", "Email", "Activity", "Joined", "Role"]} empty="No users match.">
        {rows.map((p) => {
          const current = roleOf(p.id);
          const picked = draft[p.id] ?? current;
          const biz = db.businesses.find((b) => b.userId === p.id);
          const pledged = db.pledges.filter((x) => x.investorId === p.id && x.status === "active").reduce((s, x) => s + x.amount, 0);
          return (
            <tr key={p.id} className="border-t border-slate-100 align-top">
              <td className="px-3 py-3 font-semibold">{p.name || "—"}{p.id === user?.id && <span className="ml-1 text-xs font-normal text-slate-500">(you)</span>}</td>
              <td className="px-3 py-3">{p.email}</td>
              <td className="px-3 py-3 text-xs text-slate-600">{biz ? biz.companyName : pledged ? `${formatMoney(pledged)} pledged` : "—"}</td>
              <td className="px-3 py-3">{formatDate(p.createdAt)}</td>
              <td className="px-3 py-3">
                <div className="flex items-center gap-2">
                  <select className="input w-32 capitalize" aria-label={`Role for ${p.name}`} value={picked} disabled={p.id === user?.id}
                    onChange={(e) => setDraft({ ...draft, [p.id]: e.target.value as Role })}>
                    {(["investor", "business", "admin"] as Role[]).map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                  {picked !== current && (
                    <button className="btn-primary" disabled={action.busy} onClick={async () => {
                      await action.act(() => setRole(p.id, picked!), `${p.name} is now ${picked === "admin" ? "an admin" : `a ${picked}`}.`);
                      setDraft(({ [p.id]: _, ...rest }) => rest);
                    }}>Save</button>
                  )}
                </div>
              </td>
            </tr>
          );
        })}
      </Table>
      <p className="text-xs text-slate-500">You can't change your own role, so there is always at least one admin.</p>
    </div>
  );
}

/* ───────────── Pledges ───────────── */

function Pledges({ action }: { action: Act }) {
  const { db, adminCancelPledge } = useStore();
  type F = "all" | "active" | "cancelled";
  const [filter, setFilter] = useState<F>("active");
  const [q, setQ] = useState("");
  const n = (v: F) => (v === "all" ? db.pledges.length : db.pledges.filter((p) => p.status === v).length);
  const rows = db.pledges
    .filter((p) => filter === "all" || p.status === filter)
    .filter((p) => matches(q, db.profiles.find((x) => x.id === p.investorId)?.name, db.campaigns.find((c) => c.id === p.campaignId)?.title));

  return (
    <div className="space-y-4">
      <Filters value={filter} onChange={setFilter} search={q} onSearch={setQ}
        options={(["active", "cancelled", "all"] as F[]).map((v) => [v, v[0].toUpperCase() + v.slice(1), n(v)])} />
      <Table head={["Date", "Investor", "Campaign", "Amount", "Status", ""]} empty="No pledges match.">
        {rows.map((p) => {
          const inv = db.profiles.find((x) => x.id === p.investorId);
          const c = db.campaigns.find((x) => x.id === p.campaignId);
          return (
            <tr key={p.id} className="border-t border-slate-100 align-top">
              <td className="px-3 py-3">{formatDate(p.createdAt)}</td>
              <td className="px-3 py-3">{inv?.name}<p className="text-xs text-slate-500">{inv?.email}</p></td>
              <td className="px-3 py-3">{c ? <Link to={`/campaigns/${c.id}`} className="text-brand-700 hover:underline">{c.title}</Link> : "—"}</td>
              <td className="px-3 py-3 font-semibold tabular-nums">{formatMoney(p.amount)}</td>
              <td className="px-3 py-3"><span className={`badge ${p.status === "active" ? "bg-green-100 text-green-800" : "bg-slate-200 text-slate-700"}`}>{p.status}</span></td>
              <td className="px-3 py-3 text-right">
                {p.status === "active" && (
                  <ReasonAction label="Cancel" submitLabel="Cancel pledge" reasonLabel="Reason (kept in the activity log)" disabled={action.busy}
                    onSubmit={(r) => action.act(() => adminCancelPledge(p.id, r), `Pledge of ${formatMoney(p.amount)} cancelled.`)} />
                )}
              </td>
            </tr>
          );
        })}
      </Table>
    </div>
  );
}

/* ───────────── Q&A ───────────── */

function Questions({ action }: { action: Act }) {
  const { db, deleteQuestion } = useStore();
  const [q, setQ] = useState("");
  const rows = [...db.questions]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .filter((x) => matches(q, x.text, x.askerName, x.answer?.text, db.campaigns.find((c) => c.id === x.campaignId)?.title));

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-600">{db.questions.length} questions · {db.questions.filter((x) => !x.answer).length} unanswered</p>
        <input className="input sm:w-64" placeholder="Search…" aria-label="Search questions" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {rows.length === 0 ? <Empty>No questions match.</Empty> : (
        <ul className="space-y-3">
          {rows.map((x) => {
            const c = db.campaigns.find((cc) => cc.id === x.campaignId);
            return (
              <li key={x.id} className="card flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-1 text-sm">
                  <p className="text-xs text-slate-500"><b className="text-slate-700">{x.askerName}</b> on {c ? <Link to={`/campaigns/${c.id}`} className="text-brand-700 hover:underline">{c.title}</Link> : "a removed campaign"} · {formatDate(x.createdAt)}</p>
                  <p>{x.text}</p>
                  {x.answer ? <p className="rounded-lg bg-brand-50 p-2 text-slate-700"><b>Answer:</b> {x.answer.text}</p> : <p className="text-xs italic text-slate-400">Not answered yet</p>}
                </div>
                <ReasonAction label="Remove" submitLabel="Remove question" reasonLabel="Reason (kept in the activity log)" disabled={action.busy}
                  onSubmit={(r) => action.act(() => deleteQuestion(x.id, r), "Question removed.")} />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ───────────── Settings ───────────── */

function Settings({ action }: { action: Act }) {
  const { db, updateSettings } = useStore();
  const [sectors, setSectors] = useState(db.settings.sectors.join("\n"));
  const [locations, setLocations] = useState(db.settings.locations.join("\n"));
  const [announcement, setAnnouncement] = useState(db.settings.announcement);
  const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);

  const save = (e: FormEvent) => {
    e.preventDefault();
    action.act(() => updateSettings({ sectors: lines(sectors), locations: lines(locations), announcement }), "Settings saved. Everyone sees the new values right away.");
  };

  return (
    <form onSubmit={save} className="space-y-4">
      <section className="card space-y-2">
        <label className="label" htmlFor="announcement">Site announcement</label>
        <input id="announcement" className="input" maxLength={500} value={announcement} onChange={(e) => setAnnouncement(e.target.value)}
          placeholder="e.g. New agriculture campaigns open this week" />
        <p className="text-xs text-slate-500">Shown as a banner at the top of every page. Leave empty to hide it.</p>
      </section>
      <div className="grid gap-4 md:grid-cols-2">
        <section className="card space-y-2">
          <label className="label" htmlFor="sectors">Sectors ({lines(sectors).length})</label>
          <textarea id="sectors" className="input min-h-64 font-mono text-xs" value={sectors} onChange={(e) => setSectors(e.target.value)} />
          <p className="text-xs text-slate-500">One per line. Used for business profiles, campaigns, investor preferences and filters.</p>
        </section>
        <section className="card space-y-2">
          <label className="label" htmlFor="locations">Locations ({lines(locations).length})</label>
          <textarea id="locations" className="input min-h-64 font-mono text-xs" value={locations} onChange={(e) => setLocations(e.target.value)} />
          <p className="text-xs text-slate-500">One per line. Removing one doesn't change records that already use it.</p>
        </section>
      </div>
      <button className="btn-primary" disabled={action.busy}>{action.busy ? "Saving…" : "Save settings"}</button>
      <ProjectSettings action={action} />
      <TrackingSettings action={action} />
    </form>
  );
}

/** Project-page rules: standard commitments, reporting minimum, years of accounts. Saved separately (own admin RPC). */
function ProjectSettings({ action }: { action: Act }) {
  const { db, updateProjectSettings } = useStore();
  const [commitments, setCommitments] = useState(db.settings.commitmentOptions.join("\n"));
  const [minReporting, setMinReporting] = useState<Reporting>(db.settings.minReporting);
  const [years, setYears] = useState(db.settings.minAccountYears);
  const list = commitments.split("\n").map((x) => x.trim()).filter(Boolean);
  return (
    <section className="card space-y-4 border-t-4 border-t-brand-600">
      <div>
        <h2 className="text-lg font-bold">Project pages</h2>
        <p className="text-sm text-slate-600">Rules every business's project page must meet before it can be submitted.</p>
      </div>
      <div className="space-y-2">
        <label className="label" htmlFor="commitment-options">Standard commitments to investors ({list.length})</label>
        <textarea id="commitment-options" className="input min-h-40 text-sm" value={commitments} onChange={(e) => setCommitments(e.target.value)} />
        <p className="text-xs text-slate-500">One per line. Every business accepts these; pages already declared keep the version they accepted.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="min-reporting">Progress updates at least</label>
          <select id="min-reporting" className="input" value={minReporting} onChange={(e) => setMinReporting(e.target.value as Reporting)}>
            {REPORTING.map((r) => <option key={r} value={r}>{REPORTING_LABEL[r]}</option>)}
          </select>
          <p className="mt-1 text-xs text-slate-500">Businesses can choose: {allowedReporting(minReporting).map((r) => REPORTING_LABEL[r].toLowerCase()).join(", ")}.</p>
        </div>
        <div>
          <label className="label" htmlFor="min-years">Years of past accounts required</label>
          <input id="min-years" type="number" min={0} max={5} className="input" value={years} onChange={(e) => setYears(Number(e.target.value))} />
        </div>
      </div>
      <button type="button" className="btn-primary" disabled={action.busy}
        onClick={() => action.act(() => updateProjectSettings(list, minReporting, years), "Project page rules saved.")}>
        Save project page rules
      </button>
    </section>
  );
}

/** Completeness, documents and the accounts check for one campaign's project page. */
function ProjectStatus({ c, action, compact }: { c: Campaign; action: Act; compact?: boolean }) {
  const { db, checkFinancials } = useStore();
  const problems = submitProblems(c, db.businesses.find((b) => b.userId === c.businessId), db.projects[c.id], db.financials[c.id], db.settings)
    .filter((p) => p.section !== "Basics" || !p.message.includes("deadline"));
  const fin = db.financials[c.id];
  const docs = db.documents.filter((d) => d.campaignId === c.id).length;
  return (
    <div className={`flex flex-wrap items-center gap-2 text-xs ${compact ? "" : "mt-2"}`}>
      {problems.length === 0
        ? <span className="badge bg-green-100 text-green-800">Page complete</span>
        : <span className="badge bg-amber-100 text-amber-800" title={problems.map((p) => `${p.section}: ${p.message}`).join("\n")}>{problems.length} item{problems.length > 1 ? "s" : ""} missing</span>}
      <span className="text-slate-500">{fin?.history.length ?? 0} yrs accounts · {docs} doc{docs === 1 ? "" : "s"}</span>
      {fin && (fin.checked
        ? <button type="button" className="badge bg-green-100 text-green-800 hover:underline" disabled={action.busy} title="Click to remove the check"
            onClick={() => action.act(() => checkFinancials(c.id, false), `Accounts check removed for "${c.title}".`)}>✓ Accounts checked</button>
        : <button type="button" className="badge bg-slate-100 text-slate-700 hover:bg-brand-50 hover:text-brand-700" disabled={action.busy}
            onClick={() => action.act(() => checkFinancials(c.id, true, "Reviewed against the uploaded documents"), `Accounts marked as checked for "${c.title}".`)}>Mark accounts checked</button>)}
      {!compact && <Link to={`/campaigns/${c.id}`} className="font-semibold text-brand-700 hover:underline">Open project page →</Link>}
    </div>
  );
}

/* ───────────── Activity log ───────────── */

const ACTION_LABEL: Record<string, string> = {
  "business.verify": "Verified business",
  "business.reject": "Rejected / revoked business",
  "campaign.approve": "Approved campaign",
  "campaign.reject": "Rejected campaign",
  "campaign.close": "Closed campaign",
  "user.set_role": "Changed role",
  "pledge.cancel": "Cancelled pledge",
  "question.delete": "Removed question",
  "settings.update": "Updated settings",
  "settings.project": "Updated project page rules",
  "financials.check": "Marked accounts checked",
  "financials.uncheck": "Removed accounts check",
  "campaign.funded": "Marked campaign funded",
  "obligation.reschedule": "Rescheduled commitment",
  "obligation.waive": "Waived commitment",
  "obligation.reopen": "Reopened commitment",
  "update.remove": "Removed update",
  "settings.tracking": "Updated tracking rules",
  "help.save": "Added manual article",
  "help.edit": "Edited manual article",
  "help.hide": "Hid manual article",
  "help.reset": "Reset manual article",
};

function useTargetName() {
  const { db } = useStore();
  return useMemo(() => (a: AuditEntry) => {
    switch (a.targetType) {
      case "business": return db.businesses.find((b) => b.userId === a.targetId)?.companyName ?? "a business";
      case "campaign": return db.campaigns.find((c) => c.id === a.targetId)?.title ?? "a campaign";
      case "user": return db.profiles.find((p) => p.id === a.targetId)?.name ?? "a user";
      case "obligation": {
        const o = db.obligations.find((x) => x.id === a.targetId);
        return o ? `${o.title} (${db.campaigns.find((c) => c.id === o.campaignId)?.title ?? "a campaign"})` : "a commitment";
      }
      case "update": return "a progress update";
      case "help": return mergeManual(db.helpArticles).find((h) => h.slug === a.targetId)?.title.en ?? `manual article "${a.targetId}"`;
      case "pledge": {
        const p = db.pledges.find((x) => x.id === a.targetId);
        return p ? `${formatMoney(p.amount)} by ${db.profiles.find((x) => x.id === p.investorId)?.name ?? "an investor"}` : "a pledge";
      }
      default: return a.targetType === "settings" ? "platform settings" : a.targetType;
    }
  }, [db]);
}

function AuditLine({ entry }: { entry: AuditEntry }) {
  const { db } = useStore();
  const target = useTargetName();
  const who = db.profiles.find((p) => p.id === entry.adminId)?.name ?? "An admin";
  return (
    <li className="flex flex-wrap gap-x-2 border-t border-slate-100 pt-2">
      <span className="text-slate-500">{formatDate(entry.createdAt)}</span>
      <span><b>{who}</b> · {ACTION_LABEL[entry.action] ?? entry.action}: {target(entry)}</span>
      {entry.detail && <span className="text-slate-500">({entry.detail})</span>}
    </li>
  );
}

function Activity() {
  const { db } = useStore();
  const target = useTargetName();
  const [q, setQ] = useState("");
  const rows = db.audit.filter((a) => matches(q, ACTION_LABEL[a.action], a.detail ?? "", target(a), db.profiles.find((p) => p.id === a.adminId)?.name));

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-600">Every admin action is recorded by the database and can't be edited.</p>
        <input className="input sm:w-64" placeholder="Search…" aria-label="Search activity" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <Table head={["When", "Admin", "Action", "On", "Details"]} empty="No admin actions yet.">
        {rows.map((a) => (
          <tr key={a.id} className="border-t border-slate-100 align-top">
            <td className="whitespace-nowrap px-3 py-3">{formatDate(a.createdAt)} <span className="text-xs text-slate-500">{new Date(a.createdAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</span></td>
            <td className="px-3 py-3">{db.profiles.find((p) => p.id === a.adminId)?.name ?? "—"}</td>
            <td className="px-3 py-3 font-medium">{ACTION_LABEL[a.action] ?? a.action}</td>
            <td className="px-3 py-3">{target(a)}</td>
            <td className="max-w-xs px-3 py-3 text-xs text-slate-600">{a.detail ?? "—"}</td>
          </tr>
        ))}
      </Table>
    </div>
  );
}

/* ───────────── Commitment tracking ───────────── */

function OverdueAlert({ go }: { go: (t: Tab) => void }) {
  const { db } = useStore();
  const overdue = db.obligations.filter((o) => obligationState(o, db.settings.dueSoonDays) === "overdue");
  if (!overdue.length) return null;
  const campaigns = new Set(overdue.map((o) => o.campaignId)).size;
  return (
    <button type="button" onClick={() => go("tracking")} className="w-full rounded-xl border border-red-200 bg-red-50 p-4 text-left text-sm text-red-800 hover:bg-red-100">
      <b>{overdue.length} overdue commitment{overdue.length > 1 ? "s" : ""}</b> across {campaigns} funded campaign{campaigns > 1 ? "s" : ""}. Open Tracking to follow up →
    </button>
  );
}

function MarkFunded({ c, action }: { c: Campaign; action: Act }) {
  const { markFunded } = useStore();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(today());
  if (!open) return <button type="button" className="btn-primary" disabled={action.busy} onClick={() => setOpen(true)}>Mark funded</button>;
  return (
    <div className="flex w-full flex-col gap-2 sm:w-72">
      <label className="label" htmlFor={`funded-${c.id}`}>Funding completed on</label>
      <input id={`funded-${c.id}`} type="date" className="input" value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
      <p className="text-xs text-slate-500">Closes the campaign and starts tracking its commitments from this date.</p>
      <div className="flex gap-2">
        <button type="button" className="btn-primary flex-1" disabled={action.busy || !date}
          onClick={() => action.act(() => markFunded(c.id, date), `"${c.title}" is funded. Its commitments are now being tracked.`)}>Confirm</button>
        <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>
  );
}

function Reschedule({ id, current, action }: { id: string; current: string; action: Act }) {
  const { setObligation } = useStore();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(current);
  const [reason, setReason] = useState("");
  if (!open) return <button type="button" className="btn-secondary" disabled={action.busy} onClick={() => setOpen(true)}>Reschedule</button>;
  return (
    <form className="flex w-full flex-col gap-2 sm:w-72" onSubmit={(e) => { e.preventDefault(); action.act(() => setObligation(id, "reschedule", date, reason), "Due date changed."); setOpen(false); }}>
      <label className="label" htmlFor={`due-${id}`}>New due date</label>
      <input id={`due-${id}`} type="date" className="input" required value={date} onChange={(e) => setDate(e.target.value)} />
      <label className="label" htmlFor={`why-${id}`}>Reason (kept in the activity log)</label>
      <textarea id={`why-${id}`} className="input min-h-16" required value={reason} onChange={(e) => setReason(e.target.value)} />
      <div className="flex gap-2">
        <button className="btn-primary flex-1" disabled={action.busy || !reason.trim()}>Save new date</button>
        <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  );
}

function Tracking({ action }: { action: Act }) {
  const { db, setObligation, removeUpdate } = useStore();
  type F = "attention" | "overdue" | "due-soon" | "open" | "done" | "waived" | "all";
  const [filter, setFilter] = useState<F>("attention");
  const [q, setQ] = useState("");
  const state = (o: (typeof db.obligations)[number]) => obligationState(o, db.settings.dueSoonDays);
  const is = (o: (typeof db.obligations)[number], f: F) =>
    f === "all" ? true
    : f === "attention" ? ["overdue", "due-soon"].includes(state(o))
    : f === "open" ? o.status === "open"
    : f === "done" || f === "waived" ? o.status === f
    : state(o) === f;
  const funded = db.campaigns.filter((c) => c.fundedOn);
  const rows = db.obligations
    .filter((o) => is(o, filter))
    .filter((o) => matches(q, o.title, KIND_LABEL[o.kind], db.campaigns.find((c) => c.id === o.campaignId)?.title))
    .sort((a, b) => a.dueOn.localeCompare(b.dueOn));
  const labels: [F, string][] = [["attention", "Needs attention"], ["overdue", "Overdue"], ["due-soon", "Due soon"], ["open", "All open"], ["done", "Done"], ["waived", "Waived"], ["all", "All"]];

  if (funded.length === 0) {
    return <Empty>No funded campaigns yet. When a campaign reaches its goal, use <b>Mark funded</b> in the Campaigns tab to start tracking its commitments.</Empty>;
  }
  return (
    <div className="space-y-6">
      <ComplianceSummary list={db.obligations} />

      <section className="space-y-3">
        <h2 className="text-lg font-bold">Track record by campaign</h2>
        <Table head={["Campaign", "Funded", "Kept", "On time", "Overdue", "Next due"]} empty="No funded campaigns.">
          {funded.map((c) => {
            const list = db.obligations.filter((o) => o.campaignId === c.id);
            const k = compliance(list, db.settings.dueSoonDays);
            const next = list.filter((o) => o.status === "open").sort((a, b) => a.dueOn.localeCompare(b.dueOn))[0];
            return (
              <tr key={c.id} className="border-t border-slate-100">
                <td className="px-3 py-3"><Link to={`/campaigns/${c.id}`} className="font-semibold text-brand-700 hover:underline">{c.title}</Link></td>
                <td className="px-3 py-3">{formatDate(c.fundedOn!)}</td>
                <td className="px-3 py-3 tabular-nums">{k.done} of {k.due}</td>
                <td className="px-3 py-3 tabular-nums">{k.due ? `${Math.round((k.onTime / k.due) * 100)}%` : "—"}</td>
                <td className={`px-3 py-3 font-semibold tabular-nums ${k.overdue ? "text-red-700" : ""}`}>{k.overdue}</td>
                <td className="px-3 py-3 text-xs">{next ? <>{next.title}<br /><span className="text-slate-500">{formatDate(next.dueOn)}</span></> : "—"}</td>
              </tr>
            );
          })}
        </Table>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">Commitments</h2>
        <Filters value={filter} onChange={setFilter} search={q} onSearch={setQ}
          options={labels.map(([v, l]) => [v, l, db.obligations.filter((o) => is(o, v)).length])} />
        <Table head={["Due", "Commitment", "Campaign", "Status", ""]} empty="Nothing matches. All caught up.">
          {rows.map((o) => {
            const c = db.campaigns.find((x) => x.id === o.campaignId);
            return (
              <tr key={o.id} className="border-t border-slate-100 align-top">
                <td className="whitespace-nowrap px-3 py-3">{formatDate(o.dueOn)}</td>
                <td className="px-3 py-3"><p className="font-medium">{o.title}{o.amount ? ` · ${formatMoney(o.amount)}` : ""}</p><p className="text-xs text-slate-500">{KIND_LABEL[o.kind]}{o.note ? ` · ${o.note}` : ""}</p></td>
                <td className="px-3 py-3">{c ? <Link to={`/campaigns/${c.id}`} className="text-brand-700 hover:underline">{c.title}</Link> : "—"}</td>
                <td className="px-3 py-3"><StateBadge o={o} /></td>
                <td className="px-3 py-3">
                  <div className="flex flex-wrap justify-end gap-2">
                    {o.status === "open" && <Reschedule id={o.id} current={o.dueOn} action={action} />}
                    {o.status === "open" && (
                      <ReasonAction label="Waive" submitLabel="Waive commitment" tone="secondary" reasonLabel="Reason (kept in the activity log)" disabled={action.busy}
                        onSubmit={(r) => action.act(() => setObligation(o.id, "waive", null, r), "Commitment waived.")} />
                    )}
                    {o.status === "waived" && (
                      <ReasonAction label="Reopen" submitLabel="Reopen commitment" tone="secondary" reasonLabel="Reason (kept in the activity log)" disabled={action.busy}
                        onSubmit={(r) => action.act(() => setObligation(o.id, "reopen", null, r), "Commitment reopened.")} />
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </Table>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">Latest updates from businesses</h2>
        {db.updates.length === 0 ? <p className="text-sm text-slate-500">No updates posted yet.</p> : (
          [...db.updates].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 10).map((u) => (
            <div key={u.id} className="flex flex-col gap-2 sm:flex-row sm:items-start">
              <div className="min-w-0 flex-1"><UpdateCard u={u} campaign={db.campaigns.find((c) => c.id === u.campaignId)} /></div>
              <ReasonAction label="Remove" submitLabel="Remove update" reasonLabel="Reason (kept in the activity log; the commitment reopens)" disabled={action.busy}
                onSubmit={(r) => action.act(() => removeUpdate(u.id, r), "Update removed. Its commitment is open again.")} />
            </div>
          ))
        )}
      </section>
    </div>
  );
}

function TrackingSettings({ action }: { action: Act }) {
  const { db, updateTrackingSettings } = useStore();
  const [months, setMonths] = useState(db.settings.trackingMonths);
  const [soon, setSoon] = useState(db.settings.dueSoonDays);
  const [delivery, setDelivery] = useState(db.settings.deliveryMonths);
  const field = (id: string, label: string, value: number, set: (n: number) => void, min: number, max: number, hint: string) => (
    <div>
      <label className="label" htmlFor={id}>{label}</label>
      <input id={id} type="number" min={min} max={max} className="input" value={value} onChange={(e) => set(Number(e.target.value))} />
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
    </div>
  );
  return (
    <section className="card space-y-4 border-t-4 border-t-brand-600">
      <div>
        <h2 className="text-lg font-bold">Commitment tracking</h2>
        <p className="text-sm text-slate-600">Applies to campaigns marked funded from now on (existing schedules keep their dates).</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {field("track-months", "Track for (months)", months, setMonths, 3, 120, "How long updates and accounts are scheduled after funding.")}
        {field("due-soon", "Warn before due (days)", soon, setSoon, 1, 90, "When a commitment shows as “due soon”.")}
        {field("delivery-months", "Reward delivery due (months)", delivery, setDelivery, 1, 24, "For reward campaigns, after funding.")}
      </div>
      <button type="button" className="btn-primary" disabled={action.busy}
        onClick={() => action.act(() => updateTrackingSettings(months, soon, delivery), "Tracking rules saved.")}>Save tracking rules</button>
    </section>
  );
}

/* ───────────── User manual ───────────── */

const toRow = (a: HelpArticle): HelpArticleRow => ({
  slug: a.slug, audience: a.audience, order: a.order, titleEn: a.title.en, titleBn: a.title.bn, bodyEn: a.body.en, bodyBn: a.body.bn, hidden: !!a.hidden,
});

function ManualEditor({ action }: { action: Act }) {
  const { db, resetHelpArticle } = useStore();
  const articles = mergeManual(db.helpArticles);
  const [editing, setEditing] = useState<HelpArticleRow | null>(null);
  const [isNew, setIsNew] = useState(false);

  if (editing) return <ArticleForm row={editing} isNew={isNew} action={action} close={() => setEditing(null)} />;
  const badge = (a: HelpArticle) =>
    a.source === "custom" ? <span className="badge bg-violet-100 text-violet-800">Added by admin</span>
    : a.source === "edited" ? <span className="badge bg-amber-100 text-amber-800">Edited</span>
    : <span className="badge bg-slate-100 text-slate-600">Original</span>;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-600">
          The manual everyone sees under <b>Help</b>. Edit any article in English and Bangla, hide it, or add your own.
          Values like <code>{"{{minAccountYears}}"}</code> fill in from Settings automatically.
        </p>
        <button type="button" className="btn-primary shrink-0" onClick={() => {
          setIsNew(true);
          setEditing({ slug: "", audience: "everyone", order: 50, titleEn: "", titleBn: "", bodyEn: "", bodyBn: "", hidden: false });
        }}>+ New article</button>
      </div>
      {(["everyone", "investor", "business", "admin"] as Audience[]).map((aud) => (
        <section key={aud} className="space-y-2">
          <h2 className="text-lg font-bold">{AUDIENCE_LABEL[aud].en} <span className="font-normal text-slate-500">· {AUDIENCE_LABEL[aud].bn}</span></h2>
          <Table head={["Article", "Status", ""]} empty="No articles for this group.">
            {articles.filter((a) => a.audience === aud).map((a) => (
              <tr key={a.slug} className="border-t border-slate-100 align-top">
                <td className="px-3 py-3"><p className="font-semibold">{a.title.en}</p><p className="text-xs text-slate-500">{a.title.bn} · /help?article={a.slug}</p></td>
                <td className="px-3 py-3"><div className="flex flex-wrap gap-1">{badge(a)}{a.hidden && <span className="badge bg-slate-200 text-slate-700">Hidden</span>}</div></td>
                <td className="px-3 py-3">
                  <div className="flex flex-wrap justify-end gap-2">
                    <button type="button" className="btn-secondary" onClick={() => { setIsNew(false); setEditing(toRow(a)); }}>Edit</button>
                    {a.source !== "built-in" && (
                      <ReasonAction label={a.source === "custom" ? "Delete" : "Reset to original"} submitLabel={a.source === "custom" ? "Delete article" : "Reset article"}
                        reasonLabel="Reason (kept in the activity log)" disabled={action.busy}
                        onSubmit={(r) => action.act(() => resetHelpArticle(a.slug, r), a.source === "custom" ? "Article deleted." : "Article restored to its original text.")} />
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        </section>
      ))}
    </div>
  );
}

function ArticleForm({ row, isNew, action, close }: { row: HelpArticleRow; isNew: boolean; action: Act; close: () => void }) {
  const { db, saveHelpArticle } = useStore();
  const [r, setR] = useState(row);
  const [preview, setPreview] = useState<Lang>("en");
  const original = BUILT_IN.find((b) => b.slug === row.slug);
  const set = (k: keyof HelpArticleRow, v: string | number | boolean) => setR({ ...r, [k]: v });
  const save = async () => {
    await action.act(() => saveHelpArticle(r), `Saved "${r.titleEn}". Readers see it right away.`);
  };
  return (
    <div className="space-y-4">
      <button type="button" className="text-sm text-brand-700" onClick={close}>← All articles</button>
      <h2 className="text-xl font-bold">{isNew ? "New article" : `Edit: ${row.titleEn}`}</h2>
      {original && <p className="text-xs text-slate-500">This is a built-in article. Saving keeps your version; “Reset to original” brings the original back.</p>}
      <div className="card grid gap-4 sm:grid-cols-4">
        <div className="sm:col-span-2">
          <label className="label" htmlFor="h-slug">Address (lowercase letters, numbers, dashes)</label>
          <input id="h-slug" className="input" value={r.slug} disabled={!isNew} onChange={(e) => set("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))} placeholder="e.g. investor-tax-tips" />
        </div>
        <div>
          <label className="label" htmlFor="h-aud">Shown to</label>
          <select id="h-aud" className="input" value={r.audience} onChange={(e) => set("audience", e.target.value)}>
            {(["everyone", "investor", "business", "admin"] as Audience[]).map((a) => <option key={a} value={a}>{AUDIENCE_LABEL[a].en}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="h-order">Order</label>
          <input id="h-order" type="number" className="input" value={r.order} onChange={(e) => set("order", Number(e.target.value))} />
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {(["en", "bn"] as Lang[]).map((l) => (
          <div key={l} className="card space-y-3" lang={l}>
            <h3 className="font-semibold">{l === "en" ? "English" : "বাংলা (Bangla)"}</h3>
            <div>
              <label className="label" htmlFor={`h-title-${l}`}>{l === "en" ? "Title" : "শিরোনাম"}</label>
              <input id={`h-title-${l}`} className="input" value={l === "en" ? r.titleEn : r.titleBn} onChange={(e) => set(l === "en" ? "titleEn" : "titleBn", e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor={`h-body-${l}`}>{l === "en" ? "Text" : "লেখা"}</label>
              <textarea id={`h-body-${l}`} className="input min-h-72 font-mono text-xs" value={l === "en" ? r.bodyEn : r.bodyBn} onChange={(e) => set(l === "en" ? "bodyEn" : "bodyBn", e.target.value)} />
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-slate-500">
        Format: blank line for a new paragraph, <code>## </code> for a heading, <code>- </code> for bullets, <code>1. </code> for steps, <code>**bold**</code>.
        Live values: <code>{"{{minAccountYears}} {{minReporting}} {{commitments}} {{trackingMonths}} {{dueSoonDays}} {{deliveryMonths}}"}</code>.
        If the Bangla text is empty, readers see the English.
      </p>
      <section className="card space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">Preview</h3>
          <div className="inline-flex rounded-lg border border-slate-300 p-0.5 text-xs font-semibold">
            {(["en", "bn"] as Lang[]).map((l) => (
              <button key={l} type="button" onClick={() => setPreview(l)} className={`rounded-md px-2.5 py-1 ${preview === l ? "bg-brand-600 text-white" : "text-slate-600"}`}>{l === "en" ? "English" : "বাংলা"}</button>
            ))}
          </div>
        </div>
        <h2 className="text-xl font-bold">{(preview === "bn" && r.titleBn) || r.titleEn || "Untitled"}</h2>
        <Markdown source={fillPlaceholders((preview === "bn" && r.bodyBn) || r.bodyEn, db.settings, preview)} />
      </section>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={r.hidden} onChange={(e) => set("hidden", e.target.checked)} /> Hide from readers</label>
        <button type="button" className="btn-primary" disabled={action.busy || !r.titleEn.trim() || !r.slug} onClick={save}>Save article</button>
        <button type="button" className="btn-secondary" onClick={close}>Back</button>
      </div>
    </div>
  );
}
