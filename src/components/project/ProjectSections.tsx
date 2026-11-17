import { useState } from "react";
import { Link } from "react-router-dom";
import { useStore } from "../../lib/store";
import type { Campaign, CampaignDocument, Financials, FinancialSummary, Project } from "../../lib/types";
import { DOC_KINDS } from "../../lib/types";
import { formatDate, formatMoney } from "../../lib/format";
import { equityOf, profitOf, REPORTING_LABEL, sum } from "../../lib/project";
import { formatBytes } from "../../lib/documents";
import { Empty, ErrorNote } from "../ui";

/** Read-only project-page sections shown to investors on the campaign page (and to owners as a preview). */

const H = ({ children }: { children: React.ReactNode }) => <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{children}</h3>;
const notYet = (what: string) => <Empty>The business hasn't added {what} yet.</Empty>;

/* ───────────── Business ───────────── */

export function BusinessSection({ project }: { project?: Project }) {
  if (!project || (!project.story && !project.team.length)) return notYet("its business details");
  return (
    <div className="space-y-6">
      {project.highlights.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-3">
          {project.highlights.map((h, i) => (
            <li key={i} className="rounded-xl border border-brand-100 bg-brand-50 p-4 text-sm font-semibold text-brand-900">{h}</li>
          ))}
        </ul>
      )}
      <section className="space-y-2">
        <H>About the business</H>
        <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">{project.story}</p>
      </section>
      {project.products && (
        <section className="space-y-2">
          <H>Products and services</H>
          <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">{project.products}</p>
        </section>
      )}
      {project.team.length > 0 && (
        <section className="space-y-3">
          <H>Team</H>
          <ul className="grid gap-3 sm:grid-cols-2">
            {project.team.map((m, i) => (
              <li key={i} className="flex gap-3 rounded-xl border border-slate-200 p-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-slate-100 text-sm font-bold text-slate-600" aria-hidden>
                  {m.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
                </span>
                <div className="min-w-0 text-sm">
                  <p className="font-semibold">{m.name}</p>
                  <p className="text-xs text-slate-500">{m.role}</p>
                  {m.bio && <p className="mt-1 text-slate-600">{m.bio}</p>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/* ───────────── Accounts ───────────── */

/** Horizontal bars drawn to one scale, so lengths compare honestly across years. */
function Bars({ rows, label }: { rows: { key: string | number; value: number; tone?: "bad" }[]; label: string }) {
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.value)));
  return (
    <figure className="space-y-2" aria-label={label}>
      <figcaption className="text-xs font-semibold text-slate-600">{label}</figcaption>
      {rows.map((r) => (
        <div key={r.key} className="grid grid-cols-[3.5rem_1fr_7.5rem] items-center gap-2 text-xs">
          <span className="text-slate-500 tabular-nums">{r.key}</span>
          <div className="h-3 rounded-full bg-slate-100">
            <div className={`h-full rounded-full ${r.value < 0 ? "bg-red-500" : "bg-brand-500"}`} style={{ width: `${(Math.abs(r.value) / max) * 100}%` }} />
          </div>
          <span className={`text-right font-medium tabular-nums ${r.value < 0 ? "text-red-700" : ""}`}>{formatMoney(r.value)}</span>
        </div>
      ))}
    </figure>
  );
}

function Pct({ value, label }: { value?: number | null; label: string }) {
  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${value != null && value < 0 ? "text-red-700" : ""}`}>
        {value == null ? "—" : `${value > 0 ? "+" : ""}${value}%`}
      </p>
    </div>
  );
}

export function CheckedBadge({ checked, at }: { checked: boolean; at?: string }) {
  return checked
    ? <span className="badge bg-green-100 text-green-800" title={at ? `Checked ${formatDate(at)}` : undefined}>✓ Accounts checked by FundBridge</span>
    : <span className="badge bg-slate-100 text-slate-600">Accounts not yet checked by FundBridge</span>;
}

export function AccountsSection({ campaign, financials, summary, documents }: {
  campaign: Campaign; financials?: Financials; summary?: FinancialSummary; documents: CampaignDocument[];
}) {
  const { user, openDocument } = useStore();
  const [err, setErr] = useState<string | null>(null);

  const open = async (doc: CampaignDocument) => {
    setErr(null);
    const { url, error } = await openDocument(doc);
    if (error || !url) return setErr(error ?? "Couldn't open the document.");
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noreferrer";
    a.click();
  };

  // Visitors who aren't logged in get the headline figures only.
  if (!user || !financials) {
    if (!summary) return notYet("its accounts");
    return (
      <div className="space-y-4">
        <CheckedBadge checked={summary.checked} />
        <div className="grid gap-3 sm:grid-cols-3">
          <Pct label={`Sales growth ${summary.latestYear ?? ""}`} value={summary.revenueGrowthPct} />
          <Pct label="Profit margin" value={summary.profitMarginPct} />
          <div className="rounded-xl border border-slate-200 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Years reported</p>
            <p className="mt-1 text-2xl font-bold">{summary.yearsReported}</p>
          </div>
        </div>
        <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
          {user ? "Full accounts aren't available for this campaign." : <><Link to="/login" className="font-semibold text-brand-700 underline">Log in</Link> to see the full accounts, projections and supporting documents.</>}
        </div>
      </div>
    );
  }

  const years = [...financials.history].sort((a, b) => a.year - b.year);
  if (!years.length && !financials.projections.length) return notYet("its accounts");
  const latest = years[years.length - 1];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <CheckedBadge checked={financials.checked} at={financials.checkedAt} />
        {financials.checked && financials.checkNote && <span className="text-xs text-slate-500">“{financials.checkNote}”</span>}
      </div>

      {summary && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Pct label={`Sales growth ${summary.latestYear ?? ""}`} value={summary.revenueGrowthPct} />
          <Pct label="Profit margin" value={summary.profitMarginPct} />
          <div className="rounded-xl border border-slate-200 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Net worth {latest?.year}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{latest ? formatMoney(equityOf(latest)) : "—"}</p>
          </div>
        </div>
      )}

      {years.length > 0 && (
        <div className="grid gap-6 md:grid-cols-2">
          <Bars label="Sales by year" rows={years.map((y) => ({ key: y.year, value: y.revenue }))} />
          <Bars label="Profit by year" rows={years.map((y) => ({ key: y.year, value: profitOf(y) }))} />
        </div>
      )}

      {years.length > 0 && (
        <section className="space-y-2">
          <H>Past results</H>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[560px] text-sm tabular-nums">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>{["Year", "Sales", "Costs", "Profit", "Owns (assets)", "Owes (liabilities)", "Net worth"].map((h) => <th key={h} className="px-3 py-2 text-right first:text-left">{h}</th>)}</tr>
              </thead>
              <tbody>
                {years.map((y) => (
                  <tr key={y.year} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-semibold">{y.year}</td>
                    <td className="px-3 py-2 text-right">{formatMoney(y.revenue)}</td>
                    <td className="px-3 py-2 text-right">{formatMoney(y.costs)}</td>
                    <td className={`px-3 py-2 text-right font-semibold ${profitOf(y) < 0 ? "text-red-700" : "text-green-700"}`}>{formatMoney(profitOf(y))}</td>
                    <td className="px-3 py-2 text-right">{formatMoney(y.assets)}</td>
                    <td className="px-3 py-2 text-right">{formatMoney(y.liabilities)}</td>
                    <td className="px-3 py-2 text-right">{formatMoney(equityOf(y))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {financials.projections.length > 0 && (
        <section className="space-y-2">
          <H>Projections (the business's own forecast)</H>
          <div className="overflow-x-auto rounded-xl border border-dashed border-slate-300">
            <table className="w-full text-sm tabular-nums">
              <thead className="text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-2 text-left">Year</th><th className="px-3 py-2 text-right">Expected sales</th><th className="px-3 py-2 text-right">Expected profit</th></tr></thead>
              <tbody>
                {[...financials.projections].sort((a, b) => a.year - b.year).map((p) => (
                  <tr key={p.year} className="border-t border-slate-100"><td className="px-3 py-2 font-semibold">{p.year}</td><td className="px-3 py-2 text-right">{formatMoney(p.revenue)}</td><td className="px-3 py-2 text-right">{formatMoney(p.profit)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {financials.notes && <p className="whitespace-pre-line text-sm text-slate-600"><b>Notes:</b> {financials.notes}</p>}

      <section className="space-y-2">
        <H>Supporting documents</H>
        <ErrorNote>{err}</ErrorNote>
        {documents.length === 0 ? <p className="text-sm text-slate-500">No documents uploaded.</p> : (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {documents.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <span><b>{d.title}</b> <span className="text-xs text-slate-500">· {DOC_KINDS.find(([k]) => k === d.kind)?.[1]} · {formatBytes(d.sizeBytes)}</span></span>
                <button type="button" className="btn-secondary" onClick={() => open(d)}>Open</button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="text-xs text-slate-500">Figures are provided by the business behind “{campaign.title}”. Projections are estimates, not promises.</p>
    </div>
  );
}

/* ───────────── Plan ───────────── */

export function PlanSection({ campaign, project }: { campaign: Campaign; project?: Project }) {
  if (!project || (!project.fundItems.length && !project.milestones.length)) {
    return campaign.useOfFunds ? <p className="whitespace-pre-line text-sm text-slate-700"><b>Use of funds:</b> {campaign.useOfFunds}</p> : notYet("its plan");
  }
  const total = sum(project.fundItems.map((f) => f.amount));
  const rp = project.returnPlan;
  return (
    <div className="space-y-6">
      {project.fundItems.length > 0 && (
        <section className="space-y-3">
          <H>How the money will be used</H>
          <ul className="space-y-2">
            {project.fundItems.map((f, i) => {
              const pct = total > 0 ? Math.round((f.amount / total) * 100) : 0;
              return (
                <li key={i} className="space-y-1 text-sm">
                  <div className="flex justify-between gap-3"><span>{f.item}</span><span className="shrink-0 font-semibold tabular-nums">{formatMoney(f.amount)} · {pct}%</span></div>
                  <div className="h-2 rounded-full bg-slate-100"><div className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} /></div>
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-slate-500">Total {formatMoney(total)} of the {formatMoney(campaign.goal)} goal.</p>
        </section>
      )}

      {project.milestones.length > 0 && (
        <section className="space-y-3">
          <H>Milestones</H>
          <ol className="relative space-y-3 border-l-2 border-brand-100 pl-5">
            {project.milestones.map((m, i) => (
              <li key={i} className="relative text-sm">
                <span className="absolute -left-[1.6rem] top-1 h-3 w-3 rounded-full border-2 border-white bg-brand-500" aria-hidden />
                <p className="text-xs font-semibold text-brand-700">{m.when}</p>
                <p>{m.what}</p>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="space-y-2">
        <H>How investors get their return</H>
        {campaign.type === "debt" && rp.schedule?.length ? (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-sm tabular-nums">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-2 text-left">When</th><th className="px-3 py-2 text-right">Repayment to all investors</th></tr></thead>
              <tbody>
                {rp.schedule.map((r, i) => <tr key={i} className="border-t border-slate-100"><td className="px-3 py-2">Month {r.month} after funding</td><td className="px-3 py-2 text-right">{formatMoney(r.amount)}</td></tr>)}
                <tr className="border-t border-slate-200 font-semibold"><td className="px-3 py-2">Total</td><td className="px-3 py-2 text-right">{formatMoney(sum(rp.schedule.map((r) => r.amount)))}</td></tr>
              </tbody>
            </table>
          </div>
        ) : campaign.type === "equity" && (rp.dividendPolicy || rp.exitPlan) ? (
          <dl className="space-y-2 text-sm">
            {rp.dividendPolicy && <div><dt className="font-semibold">Dividends</dt><dd className="text-slate-700">{rp.dividendPolicy}</dd></div>}
            {rp.exitPlan && <div><dt className="font-semibold">Exit</dt><dd className="text-slate-700">{rp.exitPlan}</dd></div>}
          </dl>
        ) : campaign.type === "reward" && rp.delivery ? (
          <p className="text-sm text-slate-700"><b>Delivery:</b> {rp.delivery}</p>
        ) : <p className="text-sm text-slate-500">Not described yet.</p>}
      </section>

      {project.risks.length > 0 && (
        <section className="space-y-3">
          <H>Risks and how they're handled</H>
          <ul className="space-y-2">
            {project.risks.map((r, i) => (
              <li key={i} className="grid gap-1 rounded-xl border border-slate-200 p-3 text-sm sm:grid-cols-2 sm:gap-4">
                <p><span className="badge mr-1 bg-amber-100 text-amber-800">Risk</span>{r.risk}</p>
                <p className="text-slate-700"><span className="badge mr-1 bg-green-100 text-green-800">Plan</span>{r.mitigation}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/* ───────────── Commitments ───────────── */

export function CommitmentsSection({ project, businessName }: { project?: Project; businessName?: string }) {
  if (!project?.declaredAt) return notYet("its commitments");
  const all = [...project.acceptedCommitments, ...project.customCommitments];
  return (
    <div className="space-y-5">
      <ul className="space-y-2">
        {all.map((c, i) => (
          <li key={i} className="flex gap-3 rounded-xl border border-slate-200 p-3 text-sm">
            <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand-600 text-xs font-bold text-white" aria-hidden>✓</span>
            <span>{c}</span>
          </li>
        ))}
      </ul>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div className="rounded-xl bg-slate-50 p-4"><dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Progress updates</dt><dd className="mt-1 font-semibold">{REPORTING_LABEL[project.reporting]}</dd></div>
        <div className="rounded-xl bg-slate-50 p-4"><dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Investor contact</dt><dd className="mt-1 font-semibold">{project.contactName}{project.contactRole && <span className="font-normal text-slate-600"> · {project.contactRole}</span>}</dd></div>
      </dl>
      <p className="rounded-xl border border-brand-100 bg-brand-50 p-4 text-sm text-brand-900">
        Declared by <b>{project.declarationName}</b>{businessName ? ` for ${businessName}` : ""} on {formatDate(project.declaredAt)}.
      </p>
    </div>
  );
}
