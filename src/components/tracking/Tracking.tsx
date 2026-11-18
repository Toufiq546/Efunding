import { useState, type FormEvent } from "react";
import { useStore } from "../../lib/store";
import { formatDate, formatMoney } from "../../lib/format";
import { compliance, obligationState, type ObligationState } from "../../lib/tracking";
import type { Campaign, CampaignUpdate, Obligation } from "../../lib/types";
import { ErrorNote } from "../ui";

/** Commitment-tracking pieces shared by the campaign page, dashboards and the control panel. */

const STATE_STYLE: Record<ObligationState, [string, string]> = {
  done: ["Done", "bg-green-100 text-green-800"],
  waived: ["Waived", "bg-slate-200 text-slate-700"],
  overdue: ["Overdue", "bg-red-100 text-red-800"],
  "due-soon": ["Due soon", "bg-amber-100 text-amber-800"],
  upcoming: ["Upcoming", "bg-slate-100 text-slate-600"],
};

export const KIND_LABEL: Record<Obligation["kind"], string> = {
  update: "Progress update", accounts: "Yearly accounts", repayment: "Repayment", milestone: "Milestone", delivery: "Reward delivery",
};

export function StateBadge({ o }: { o: Obligation }) {
  const { db } = useStore();
  const [label, cls] = STATE_STYLE[obligationState(o, db.settings.dueSoonDays)];
  return <span className={`badge ${cls}`}>{label}</span>;
}

/** Headline track record: commitments due so far, how many kept (and on time), what's overdue. */
export function ComplianceSummary({ list }: { list: Obligation[] }) {
  const { db } = useStore();
  const c = compliance(list, db.settings.dueSoonDays);
  const tile = (label: string, value: string, tone = "") => (
    <div className="rounded-xl border border-slate-200 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-bold tabular-nums ${tone}`}>{value}</p>
    </div>
  );
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {tile("Kept so far", c.due ? `${c.done} of ${c.due}` : "Nothing due yet")}
      {tile("On time", c.due ? `${Math.round((c.onTime / c.due) * 100)}%` : "—")}
      {tile("Overdue", String(c.overdue), c.overdue ? "text-red-700" : "")}
      {tile("Due soon", String(c.dueSoon), c.dueSoon ? "text-amber-700" : "")}
    </div>
  );
}

export function ObligationTimeline({ list, updates, limit }: { list: Obligation[]; updates: CampaignUpdate[]; limit?: number }) {
  const [showAll, setShowAll] = useState(false);
  const sorted = [...list].sort((a, b) => a.dueOn.localeCompare(b.dueOn));
  const shown = limit && !showAll ? sorted.slice(0, limit) : sorted;
  return (
    <div className="space-y-2">
      <ol className="divide-y divide-slate-100 rounded-xl border border-slate-200">
        {shown.map((o) => {
          const u = updates.find((x) => x.id === o.updateId);
          return (
            <li key={o.id} className="flex flex-col gap-1 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="font-medium">{o.title}{o.amount ? <span className="text-slate-500"> · {formatMoney(o.amount)}</span> : null}</p>
                <p className="text-xs text-slate-500">
                  {KIND_LABEL[o.kind]} · due {formatDate(o.dueOn)}
                  {o.status === "done" && o.completedAt && <> · done {formatDate(o.completedAt)}{u ? <> · “{u.title}”</> : null}</>}
                  {o.note && <> · note: {o.note}</>}
                </p>
              </div>
              <StateBadge o={o} />
            </li>
          );
        })}
      </ol>
      {limit && sorted.length > limit && (
        <button type="button" className="text-sm font-semibold text-brand-700 hover:underline" onClick={() => setShowAll(!showAll)}>
          {showAll ? "Show fewer" : `Show all ${sorted.length} commitments`}
        </button>
      )}
    </div>
  );
}

export function UpdateCard({ u, campaign }: { u: CampaignUpdate; campaign?: Campaign }) {
  return (
    <article className="space-y-2 rounded-xl border border-slate-200 p-4 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="font-semibold">{u.title}</h4>
        <span className="text-xs text-slate-500">{campaign ? `${campaign.title} · ` : ""}{formatDate(u.createdAt)}</span>
      </div>
      <p className="whitespace-pre-line text-slate-700">{u.body}</p>
      {(u.amount != null || u.sales != null || u.spent != null) && (
        <dl className="flex flex-wrap gap-4 text-xs">
          {u.amount != null && <div><dt className="text-slate-500">Repaid</dt><dd className="font-semibold">{formatMoney(u.amount)}</dd></div>}
          {u.sales != null && <div><dt className="text-slate-500">Sales this period</dt><dd className="font-semibold">{formatMoney(u.sales)}</dd></div>}
          {u.spent != null && <div><dt className="text-slate-500">Campaign money spent so far</dt><dd className="font-semibold">{formatMoney(u.spent)}</dd></div>}
        </dl>
      )}
    </article>
  );
}

/** Business form to post an update, optionally completing one open commitment. */
export function PostUpdateForm({ c, preselect, onDone }: { c: Campaign; preselect?: string; onDone?: () => void }) {
  const { db, postUpdate } = useStore();
  const open = db.obligations.filter((o) => o.campaignId === c.id && o.status === "open").sort((a, b) => a.dueOn.localeCompare(b.dueOn));
  const [obligationId, setObligationId] = useState(preselect ?? open[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [amount, setAmount] = useState("");
  const [sales, setSales] = useState("");
  const [spent, setSpent] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const chosen = open.find((o) => o.id === obligationId);
  const n = (v: string) => (v === "" ? undefined : Number(v));
  const fid = `upd-${c.id}`;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const error = await postUpdate({ campaignId: c.id, obligationId: obligationId || undefined, title, body, amount: n(amount), sales: n(sales), spent: n(spent) });
    setBusy(false);
    if (error) return setErr(error);
    setTitle(""); setBody(""); setAmount(""); setSales(""); setSpent("");
    setObligationId(open.find((o) => o.id !== obligationId)?.id ?? "");
    setOk(true);
    onDone?.();
  };

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl bg-slate-50 p-4">
      <div>
        <label className="label" htmlFor={`${fid}-ob`}>This update completes</label>
        <select id={`${fid}-ob`} className="input" value={obligationId} onChange={(e) => { setObligationId(e.target.value); setOk(false); }}>
          {open.map((o) => <option key={o.id} value={o.id}>{o.title} (due {formatDate(o.dueOn)})</option>)}
          <option value="">No specific commitment: general news</option>
        </select>
      </div>
      <div><label className="label" htmlFor={`${fid}-title`}>Title</label>
        <input id={`${fid}-title`} className="input" required value={title} onChange={(e) => setTitle(e.target.value)}
          placeholder={chosen?.kind === "repayment" ? "e.g. Second repayment made" : "e.g. Quarter 2: production up 20%"} /></div>
      <div><label className="label" htmlFor={`${fid}-body`}>What happened</label>
        <textarea id={`${fid}-body`} className="input min-h-24" required value={body} onChange={(e) => setBody(e.target.value)}
          placeholder="Progress, how the money was spent, sales, any problems and what you're doing about them." /></div>
      <div className="grid gap-3 sm:grid-cols-3">
        {chosen?.kind === "repayment" && (
          <div><label className="label" htmlFor={`${fid}-amount`}>Amount repaid (৳)</label>
            <input id={`${fid}-amount`} className="input" type="number" min={1} required value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={chosen.amount ? String(chosen.amount) : ""} /></div>
        )}
        <div><label className="label" htmlFor={`${fid}-sales`}>Sales this period (৳, optional)</label>
          <input id={`${fid}-sales`} className="input" type="number" min={0} value={sales} onChange={(e) => setSales(e.target.value)} /></div>
        <div><label className="label" htmlFor={`${fid}-spent`}>Campaign money spent so far (৳, optional)</label>
          <input id={`${fid}-spent`} className="input" type="number" min={0} value={spent} onChange={(e) => setSpent(e.target.value)} /></div>
      </div>
      <ErrorNote>{err}</ErrorNote>
      <div className="flex items-center gap-3">
        <button className="btn-primary" disabled={busy}>{busy ? "Posting…" : "Post update to backers"}</button>
        {ok && <span className="text-sm text-brand-700" role="status">Posted ✓ Backers can read it now.</span>}
      </div>
    </form>
  );
}
