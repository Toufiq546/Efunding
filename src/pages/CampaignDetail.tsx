import { useState, type FormEvent } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useStore } from "../lib/store";
import { MatchBadge, Progress, StatusBadge, TypeBadge, Empty, ErrorNote, RejectWithReason, Spinner } from "../components/ui";
import { backersFor, daysLeft, effectiveStatus, formatDate, formatMoney, isWebUrl, raisedFor } from "../lib/format";
import { scoreMatch } from "../lib/matching";
import { ComplianceSummary, ObligationTimeline, PostUpdateForm, UpdateCard } from "../components/tracking/Tracking";
import { AccountsSection, BusinessSection, CheckedBadge, CommitmentsSection, PlanSection } from "../components/project/ProjectSections";

type Tab = "overview" | "progress" | "business" | "accounts" | "plan" | "commitments" | "qa";

export default function CampaignDetail() {
  const { id } = useParams();
  const store = useStore();
  const { db, user } = store;
  const c = db.campaigns.find((x) => x.id === id);
  const [amount, setAmount] = useState("");
  const [ack, setAck] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [params] = useSearchParams();
  // Links can open a tab directly, e.g. /campaigns/:id?tab=progress
  const [tab, setTab] = useState<Tab>(() => (params.get("tab") as Tab) || "overview");

  if (store.loading) return <Spinner />;

  if (!c) return <Empty>Campaign not found. <Link to="/campaigns" className="text-brand-700 underline">Back to campaigns</Link></Empty>;

  const isOwner = user?.id === c.businessId;
  const isAdmin = user?.role === "admin";
  const status = effectiveStatus(c);
  if (status !== "live" && status !== "closed" && !isOwner && !isAdmin) {
    return <Empty>This campaign is not public yet.</Empty>;
  }

  const biz = db.businesses.find((b) => b.userId === c.businessId);
  const project = db.projects[c.id];
  const obligations = db.obligations.filter((o) => o.campaignId === c.id);
  const updates = db.updates.filter((u) => u.campaignId === c.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const isBacker = db.pledges.some((p) => p.campaignId === c.id && p.investorId === user?.id && p.status === "active");
  const raised = raisedFor(db, c.id);
  const left = daysLeft(c.deadline);
  const pref = user?.role === "investor" ? db.investors.find((i) => i.userId === user.id) : undefined;
  const match = pref ? scoreMatch(c, pref) : undefined;
  const myPledges = db.pledges.filter((p) => p.campaignId === c.id && p.investorId === user?.id && p.status === "active");
  const questions = db.questions.filter((q) => q.campaignId === c.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const canPledge = user?.role === "investor" && status === "live" && biz?.verification === "verified";

  /** Runs an action, shows its error if any, and returns whether it succeeded. */
  const act = async (fn: () => Promise<string | null>) => {
    setBusy(true);
    setErr(null);
    const error = await fn();
    setBusy(false);
    if (error) setErr(error);
    return !error;
  };

  const submitPledge = async (e: FormEvent) => {
    e.preventDefault();
    setMsg(null);
    const n = Number(amount);
    if (!Number.isFinite(n) || n < c.minInvestment) {
      setErr(`The minimum pledge is ${formatMoney(c.minInvestment)}.`);
      return;
    }
    if (await act(() => store.pledge(c.id, Math.round(n)))) {
      setAmount("");
      setAck(false);
      setMsg(`Thank you. Your pledge of ${formatMoney(n)} is recorded.`);
    }
  };

  const submitQuestion = async (e: FormEvent) => {
    e.preventDefault();
    if (!question.trim()) return;
    if (await act(() => store.ask(c.id, question))) setQuestion("");
  };

  return (
    <div className="grid gap-8 lg:grid-cols-3">
      <div className="min-w-0 space-y-6 lg:col-span-2">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <TypeBadge type={c.type} />
            <span className="badge bg-slate-100 text-slate-700">{c.sector}</span>
            <span className="badge bg-slate-100 text-slate-700 capitalize">{c.risk} risk</span>
            {status !== "live" && <StatusBadge status={status} />}
            {match && <MatchBadge score={match.score} />}
          </div>
          <h1 className="text-3xl font-bold">{c.title}</h1>
          <p className="text-lg text-slate-600">{c.summary}</p>
          <ErrorNote>{err}</ErrorNote>
          {c.status === "closed" && c.rejectionReason && (isOwner || isAdmin) && (
            <p className="rounded-lg bg-slate-100 p-3 text-sm text-slate-700">Closed by admin: {c.rejectionReason}</p>
          )}
          {c.status === "rejected" && c.rejectionReason && (
            <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">Rejected by admin: {c.rejectionReason}</p>
          )}
        </div>

        <nav className="-mx-1 flex gap-1 overflow-x-auto border-b border-slate-200 px-1" aria-label="Campaign sections">
          {([
            ["overview", "Overview"], ...(c.fundedOn ? [["progress", "Progress"]] : []), ["business", "Business"], ["accounts", "Accounts"], ["plan", "Plan"],
            ["commitments", "Commitments"], ["qa", `Q&A (${questions.length})`],
          ] as [Tab, string][]).map(([t, label]) => (
            <button key={t} type="button" onClick={() => setTab(t)} aria-current={tab === t ? "page" : undefined}
              className={`-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-medium ${tab === t ? "border-brand-600 text-brand-700" : "border-transparent text-slate-600 hover:text-slate-900"}`}>
              {label}
            </button>
          ))}
        </nav>

        {tab === "overview" && (<>
        {project && project.highlights.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {project.highlights.map((h, i) => <li key={i} className="badge bg-brand-50 px-3 py-1 text-brand-900">{h}</li>)}
          </ul>
        )}
        {match && (
          <div className="card grid gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-sm font-semibold text-green-700">Why it matches you</p>
              <ul className="space-y-1 text-sm">{match.reasons.map((r) => <li key={r}>✓ {r}</li>)}</ul>
              {match.reasons.length === 0 && <p className="text-sm text-slate-500">Nothing specific matched.</p>}
            </div>
            <div>
              <p className="mb-1 text-sm font-semibold text-amber-700">Worth noting</p>
              <ul className="space-y-1 text-sm">{match.warnings.map((r) => <li key={r}>! {r}</li>)}</ul>
              {match.warnings.length === 0 && <p className="text-sm text-slate-500">No concerns based on your preferences.</p>}
            </div>
          </div>
        )}

        <section className="card space-y-3">
          <h2 className="text-lg font-bold">The pitch</h2>
          <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">{c.pitch}</p>
          {!project?.fundItems.length && c.useOfFunds && (<>
            <h3 className="pt-2 font-semibold">Use of funds</h3>
            <p className="whitespace-pre-line text-sm text-slate-700">{c.useOfFunds}</p>
          </>)}
          <div className="flex flex-wrap gap-2 pt-2">
            {(["business", "accounts", "plan", "commitments"] as Tab[]).map((t) => (
              <button key={t} type="button" className="btn-secondary capitalize" onClick={() => setTab(t)}>{t === "accounts" ? "See the accounts" : `Read the ${t}`} →</button>
            ))}
          </div>
        </section>

        <section className="card space-y-3">
          <h2 className="text-lg font-bold">Deal terms</h2>
          {c.type === "equity" && (
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-slate-500">Equity offered</dt><dd className="font-semibold">{c.terms.equityPercent ?? "—"}%</dd></div>
              <div><dt className="text-slate-500">Pre-money valuation</dt><dd className="font-semibold">{c.terms.valuation ? formatMoney(c.terms.valuation) : "—"}</dd></div>
            </dl>
          )}
          {c.type === "debt" && (
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-slate-500">Interest / profit rate</dt><dd className="font-semibold">{c.terms.interestRate ?? "—"}% per year</dd></div>
              <div><dt className="text-slate-500">Tenor</dt><dd className="font-semibold">{c.terms.tenorMonths ?? "—"} months</dd></div>
            </dl>
          )}
          {c.type === "reward" && (
            <div className="space-y-2">
              {(c.terms.rewards ?? []).map((r, i) => (
                <div key={i} className="rounded-lg border border-slate-200 p-3">
                  <p className="text-sm font-semibold">{formatMoney(r.amount)}+ · {r.title}</p>
                  <p className="text-xs text-slate-600">{r.description}</p>
                </div>
              ))}
            </div>
          )}
        </section>
        </>)}

        {tab === "progress" && c.fundedOn && (
          <section className="card space-y-5">
            <div>
              <h2 className="text-lg font-bold">Keeping our commitments</h2>
              <p className="text-sm text-slate-600">Funded on {formatDate(c.fundedOn)}. Every promise below has a due date, and its status is public.</p>
            </div>
            <ComplianceSummary list={obligations} />
            <ObligationTimeline list={obligations} updates={updates} limit={8} />
            <div className="space-y-3">
              <h3 className="font-semibold">Updates from {biz?.companyName ?? "the business"}</h3>
              {isOwner && <PostUpdateForm c={c} />}
              {updates.length > 0
                ? updates.map((u) => <UpdateCard key={u.id} u={u} />)
                : <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
                    {isOwner || isAdmin || isBacker ? "No updates posted yet." : "Updates are shared with this campaign's backers. The commitment list above is public."}
                  </p>}
            </div>
          </section>
        )}
        {tab === "business" && <section className="card"><BusinessSection project={project} /></section>}
        {tab === "accounts" && (
          <section className="card">
            <AccountsSection campaign={c} financials={db.financials[c.id]} summary={db.financialSummary[c.id]} documents={db.documents.filter((d) => d.campaignId === c.id)} />
          </section>
        )}
        {tab === "plan" && <section className="card"><PlanSection campaign={c} project={project} /></section>}
        {tab === "commitments" && (
          <section className="card space-y-4">
            <h2 className="text-lg font-bold">Our commitments to you</h2>
            <CommitmentsSection project={project} businessName={biz?.companyName} />
          </section>
        )}

        {tab === "qa" && <section className="card space-y-4">
          <h2 className="text-lg font-bold">Questions & answers ({questions.length})</h2>
          {user?.role === "investor" && status === "live" && (
            <form onSubmit={submitQuestion} className="flex gap-2">
              <input className="input" placeholder="Ask the founders a question…" value={question} onChange={(e) => setQuestion(e.target.value)} />
              <button className="btn-primary shrink-0" disabled={busy}>Ask</button>
            </form>
          )}
          {!user && <p className="text-sm text-slate-500"><Link to="/login" className="text-brand-700 underline">Log in</Link> as an investor to ask a question.</p>}
          {questions.length === 0 && <p className="text-sm text-slate-500">No questions yet.</p>}
          <ul className="space-y-4">
            {questions.map((q) => {
              return (
                <li key={q.id} className="space-y-2 border-t border-slate-100 pt-3">
                  <p className="text-sm"><b>{q.askerName}</b> <span className="text-xs text-slate-400">· {formatDate(q.createdAt)}</span></p>
                  <p className="text-sm text-slate-700">{q.text}</p>
                  {q.answer ? (
                    <div className="ml-4 rounded-lg bg-brand-50 p-3 text-sm">
                      <p className="mb-1 text-xs font-semibold text-brand-700">{biz?.companyName} replied · {formatDate(q.answer.at)}</p>
                      {q.answer.text}
                    </div>
                  ) : isOwner ? (
                    <form
                      className="ml-4 flex gap-2"
                      onSubmit={(e) => { e.preventDefault(); if (answers[q.id]?.trim()) act(() => store.answer(q.id, answers[q.id])); }}
                    >
                      <input className="input" placeholder="Write your answer…" value={answers[q.id] ?? ""} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} />
                      <button className="btn-primary shrink-0" disabled={busy}>Reply</button>
                    </form>
                  ) : (
                    <p className="ml-4 text-xs italic text-slate-400">Awaiting answer from the business</p>
                  )}
                </li>
              );
            })}
          </ul>
        </section>}
      </div>

      <aside className="min-w-0 space-y-4 lg:sticky lg:top-20 lg:self-start">
        <div className="card space-y-4">
          <div>
            <p className="text-3xl font-bold">{formatMoney(raised)}</p>
            <p className="text-sm text-slate-500">pledged of {formatMoney(c.goal)} goal</p>
          </div>
          <Progress value={raised} goal={c.goal} />
          <div className="grid grid-cols-3 text-center text-sm">
            <div><p className="font-bold">{Math.round((raised / c.goal) * 100)}%</p><p className="text-xs text-slate-500">funded</p></div>
            <div><p className="font-bold">{backersFor(db, c.id)}</p><p className="text-xs text-slate-500">backers</p></div>
            <div><p className="font-bold">{Math.max(0, left)}</p><p className="text-xs text-slate-500">days left</p></div>
          </div>
          <p className="text-xs text-slate-500">Minimum pledge {formatMoney(c.minInvestment)} · Closes {formatDate(c.deadline)}</p>
          {c.fundedOn && (
            <button type="button" onClick={() => setTab("progress")}
              className="w-full rounded-lg bg-green-50 p-3 text-left text-sm text-green-800 hover:bg-green-100">
              <b>Funded on {formatDate(c.fundedOn)}.</b> See how the business is keeping its commitments →
            </button>
          )}

          {canPledge && (
            <form onSubmit={submitPledge} className="space-y-3 border-t border-slate-100 pt-4">
              <label className="label">Pledge amount (৳)</label>
              <input className="input" type="number" min={c.minInvestment} step={100} required value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={String(c.minInvestment)} />
              {c.type === "reward" && c.terms.rewards && Number(amount) > 0 && (
                <p className="text-xs text-slate-600">
                  Reward: {[...c.terms.rewards].reverse().find((r) => Number(amount) >= r.amount)?.title ?? "None at this amount"}
                </p>
              )}
              <label className="flex items-start gap-2 text-xs text-slate-600">
                <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5" required />
                <span>
                  I have read the business's <button type="button" className="font-semibold text-brand-700 underline" onClick={() => setTab("commitments")}>commitments</button>.
                  I understand this is a non-binding pledge and that investing in private businesses carries risk, including losing all my money.
                </span>
              </label>
              <button className="btn-primary w-full" disabled={!ack || busy}>{busy ? "Saving…" : "Pledge"}</button>
            </form>
          )}
          {msg && <p className="rounded-lg bg-brand-50 p-3 text-sm text-brand-700">{msg}</p>}
          {!user && status === "live" && <Link to="/login" className="btn-primary w-full">Log in to pledge</Link>}
          {myPledges.length > 0 && (
            <p className="text-sm text-slate-600">You have pledged <b>{formatMoney(myPledges.reduce((s, p) => s + p.amount, 0))}</b> to this campaign.</p>
          )}
          {isOwner && (c.status === "draft" || c.status === "rejected") && (
            <Link to={`/campaigns/${c.id}/build`} className="btn-secondary w-full">Edit project page</Link>
          )}
          {isAdmin && c.status === "pending" && (
            <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
              <button className="btn-primary flex-1" disabled={busy} onClick={() => act(() => store.reviewCampaign(c.id, true))}>Approve</button>
              <RejectWithReason className="flex-1" disabled={busy} onReject={(r) => act(() => store.reviewCampaign(c.id, false, r))} />
            </div>
          )}
        </div>

        {biz && (
          <div className="card space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <p className="font-semibold">{biz.companyName}</p>
              {biz.verification === "verified" && <span className="badge bg-green-100 text-green-800">✓ Verified</span>}
            </div>
            <p className="text-slate-600">{biz.description}</p>
            {db.financialSummary[c.id] && <CheckedBadge checked={db.financialSummary[c.id].checked} />}
            <dl className="grid grid-cols-2 gap-2 text-xs">
              <div><dt className="text-slate-500">Location</dt><dd>{biz.location}</dd></div>
              <div><dt className="text-slate-500">Founded</dt><dd>{biz.foundedYear}</dd></div>
              <div><dt className="text-slate-500">Trade licence</dt><dd>{biz.tradeLicenseNo}</dd></div>
              {isWebUrl(biz.website) && <div><dt className="text-slate-500">Website</dt><dd><a href={biz.website.trim()} target="_blank" rel="noopener noreferrer" className="text-brand-700 underline">Visit website ↗</a></dd></div>}
            </dl>
          </div>
        )}
      </aside>
    </div>
  );
}
