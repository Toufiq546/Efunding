import { Link } from "react-router-dom";
import { useState, type ReactNode } from "react";
import { useStore } from "../lib/store";
import type { Campaign } from "../lib/types";
import { TYPE_LABEL, TYPE_STYLE, backersFor, daysLeft, effectiveStatus, formatMoney, raisedFor, termsSummary } from "../lib/format";
import type { MatchResult } from "../lib/matching";

export function Progress({ value, goal }: { value: number; goal: number }) {
  const pct = goal > 0 ? Math.min(100, (value / goal) * 100) : 0;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
      <div className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function TypeBadge({ type }: { type: Campaign["type"] }) {
  return <span className={`badge ${TYPE_STYLE[type]}`}>{TYPE_LABEL[type]}</span>;
}

const STATUS_STYLE: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  pending: "bg-yellow-100 text-yellow-800",
  live: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  closed: "bg-slate-200 text-slate-700",
  unverified: "bg-slate-100 text-slate-700",
  verified: "bg-green-100 text-green-800",
};

export function StatusBadge({ status }: { status: string }) {
  const label = status === "pending" ? "pending review" : status;
  return <span className={`badge capitalize ${STATUS_STYLE[status] ?? "bg-slate-100"}`}>{label}</span>;
}

export function MatchBadge({ score }: { score: number }) {
  const cls = score >= 75 ? "bg-green-600" : score >= 50 ? "bg-amber-500" : "bg-slate-400";
  return <span className={`badge text-white ${cls}`}>{score}% match</span>;
}

export function CampaignCard({ campaign, match }: { campaign: Campaign; match?: MatchResult }) {
  const { db } = useStore();
  const biz = db.businesses.find((b) => b.userId === campaign.businessId);
  const raised = raisedFor(db, campaign.id);
  const left = daysLeft(campaign.deadline);
  const status = effectiveStatus(campaign);

  return (
    <Link to={`/campaigns/${campaign.id}`} className="card flex flex-col gap-3 transition hover:border-brand-500 hover:shadow-md">
      <div className="flex flex-wrap items-center gap-2">
        <TypeBadge type={campaign.type} />
        <span className="badge bg-slate-100 text-slate-700">{campaign.sector}</span>
        {match && <MatchBadge score={match.score} />}
        {status !== "live" && <StatusBadge status={status} />}
      </div>
      <div>
        <h3 className="font-semibold leading-snug">{campaign.title}</h3>
        <p className="text-xs text-slate-500">{biz?.companyName} · {campaign.location}</p>
      </div>
      <p className="line-clamp-2 text-sm text-slate-600">{campaign.summary}</p>
      {match && match.reasons.length > 0 && (
        <ul className="space-y-0.5 text-xs text-green-700">
          {match.reasons.slice(0, 2).map((r) => <li key={r}>✓ {r}</li>)}
        </ul>
      )}
      <div className="mt-auto space-y-2">
        <Progress value={raised} goal={campaign.goal} />
        <div className="flex justify-between text-xs text-slate-600">
          <span><b className="text-slate-900">{formatMoney(raised)}</b> of {formatMoney(campaign.goal)}</span>
          <span>{backersFor(db, campaign.id)} backers · {left >= 0 ? `${left}d left` : "ended"}</span>
        </div>
        <p className="text-xs text-slate-500">{termsSummary(campaign)}</p>
      </div>
    </Link>
  );
}

export function Chips<T extends string>({
  options, value, onChange, render,
}: { options: readonly T[]; value: T[]; onChange: (v: T[]) => void; render?: (o: T) => ReactNode }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = value.includes(o);
        return (
          <button
            type="button"
            key={o}
            onClick={() => onChange(on ? value.filter((x) => x !== o) : [...value, o])}
            className={`rounded-full border px-3 py-1 text-xs font-medium capitalize transition ${
              on ? "border-brand-600 bg-brand-600 text-white" : "border-slate-300 bg-white text-slate-700 hover:border-brand-500"
            }`}
          >
            {render ? render(o) : o}
          </button>
        );
      })}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">{children}</div>;
}

export function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="card">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 break-words text-xl font-bold sm:text-2xl">{value}</p>
    </div>
  );
}

export function Spinner() {
  return (
    <div className="flex justify-center py-16" role="status" aria-label="Loading">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-100 border-t-brand-600" />
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">{children}</p>;
}

/** Two-step button: first click asks "Are you sure?", second click runs the action. Replaces window.confirm. */
export function ConfirmButton({
  label, confirmLabel = "Yes, confirm", onConfirm, disabled, className = "text-xs text-red-600 hover:underline",
}: { label: string; confirmLabel?: string; onConfirm: () => void; disabled?: boolean; className?: string }) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return <button type="button" className={className} disabled={disabled} onClick={() => setAsking(true)}>{label}</button>;
  }
  return (
    <span className="inline-flex items-center gap-2 text-xs">
      <button type="button" className="font-semibold text-red-600 hover:underline" disabled={disabled} onClick={() => { setAsking(false); onConfirm(); }}>{confirmLabel}</button>
      <button type="button" className="text-slate-500 hover:underline" onClick={() => setAsking(false)}>Keep</button>
    </span>
  );
}

/**
 * Button that asks for a reason inline before acting (the reason is stored and shown to the affected person).
 * Replaces window.prompt, which the embedded preview blocks.
 */
export function ReasonAction({
  label, submitLabel, onSubmit, disabled, className = "", tone = "danger", reasonLabel = "Reason (shown to the business)", sections,
}: {
  label: string; submitLabel: string; onSubmit: (reason: string) => void; disabled?: boolean; className?: string;
  tone?: "danger" | "secondary"; reasonLabel?: string;
  /** Optional list of sections the reason is about; the chosen one is prefixed, e.g. "[Accounts] …". */
  sections?: string[];
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [section, setSection] = useState(sections?.[0] ?? "");
  const [fieldId] = useState(() => `reason-${Math.random().toString(36).slice(2, 8)}`);
  const btn = tone === "danger" ? "btn-danger" : "btn-secondary";
  if (!open) {
    return <button type="button" className={`${btn} ${className}`} disabled={disabled} onClick={() => setOpen(true)}>{label}</button>;
  }
  return (
    <form
      className="flex w-full flex-col gap-2 sm:w-80"
      onSubmit={(e) => {
        e.preventDefault();
        if (!reason.trim()) return;
        onSubmit(section && section !== "General" ? `[${section}] ${reason.trim()}` : reason.trim());
        setOpen(false);
        setReason("");
      }}
    >
      {sections && (
        <>
          <label className="label" htmlFor={`${fieldId}-section`}>Section that needs changes</label>
          <select id={`${fieldId}-section`} className="input" value={section} onChange={(e) => setSection(e.target.value)}>
            {sections.map((s) => <option key={s}>{s}</option>)}
          </select>
        </>
      )}
      <label className="label" htmlFor={fieldId}>{reasonLabel}</label>
      <textarea id={fieldId} className="input min-h-16" autoFocus required value={reason} onChange={(e) => setReason(e.target.value)} />
      <div className="flex gap-2">
        <button className="btn-danger flex-1" disabled={disabled || !reason.trim()}>{submitLabel}</button>
        <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  );
}

export function RejectWithReason({ onReject, disabled, className = "" }: { onReject: (reason: string) => void; disabled?: boolean; className?: string }) {
  return <ReasonAction label="Reject" submitLabel="Send rejection" onSubmit={onReject} disabled={disabled} className={className} />;
}
