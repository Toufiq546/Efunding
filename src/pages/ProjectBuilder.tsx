import { useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useStore } from "../lib/store";
import { Empty, ErrorNote, StatusBadge, TypeBadge } from "../components/ui";
import { HelpLink } from "../components/help/Markdown";
import { ListEditor, TextList } from "../components/project/ListEditor";
import { formatDate, formatMoney } from "../lib/format";
import { formatBytes } from "../lib/documents";
import { allowedReporting, emptyFinancials, emptyProject, equityOf, profitOf, REPORTING_LABEL, submitProblems, sum, type Section } from "../lib/project";
import { DOC_KINDS, type Campaign, type DocKind, type Financials, type Project, type Reporting } from "../lib/types";

/**
 * Step-by-step builder for a campaign's project page. Businesses edit while the campaign is a draft or
 * rejected; the database enforces the same rule and re-checks completeness on submission.
 */

const STEPS: [string, Section | "Review", string][] = [
  ["business", "Business", "Who you are"],
  ["accounts", "Accounts", "Your numbers"],
  ["plan", "Plan", "Use of money & returns"],
  ["commitments", "Commitments", "Your promises"],
  ["review", "Review", "Check & submit"],
];

export default function ProjectBuilder() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const { db, user } = useStore();
  const c = db.campaigns.find((x) => x.id === id && x.businessId === user?.id);
  if (!c) return <Empty>Campaign not found. <Link to="/dashboard" className="text-brand-700 underline">Back to your dashboard</Link></Empty>;

  const stepKey = STEPS.some(([k]) => k === params.get("step")) ? params.get("step")! : "business";
  const go = (k: string) => { setParams({ step: k }); window.scrollTo?.(0, 0); };
  const editable = c.status === "draft" || c.status === "rejected";
  const problems = submitProblems(c, db.businesses.find((b) => b.userId === c.businessId), db.projects[c.id], db.financials[c.id], db.settings,
    { campaigns: db.campaigns, documents: db.documents, obligations: db.obligations });
  const done = (s: string) => !problems.some((p) => p.section === s);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Link to="/dashboard" className="text-sm text-brand-700">← Dashboard</Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold sm:text-3xl">{c.title}</h1>
          <TypeBadge type={c.type} />
          <StatusBadge status={c.status} />
        </div>
        <p className="text-sm text-slate-600">
          Build the page investors read before they pledge. <Link to={`/campaigns/${c.id}/edit`} className="font-semibold text-brand-700 hover:underline">Edit basics (goal, terms, deadline)</Link>
          {" · "}<Link to={`/campaigns/${c.id}`} className="font-semibold text-brand-700 hover:underline">Preview page</Link>
          {" · "}<HelpLink article={stepKey === "commitments" ? "business-commitments" : "business-project-page"}>How to fill this in</HelpLink>
        </p>
        {c.status === "rejected" && c.rejectionReason && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">Admin feedback: {c.rejectionReason}</p>}
        {!editable && (
          <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
            This campaign is {c.status === "pending" ? "waiting for admin review" : c.status}, so its page can't be changed now.
          </p>
        )}
      </div>

      <nav className="grid grid-cols-2 gap-2 sm:grid-cols-5" aria-label="Project page steps">
        {STEPS.map(([k, label, hint], i) => (
          <button key={k} type="button" onClick={() => go(k)} aria-current={stepKey === k ? "step" : undefined}
            className={`rounded-xl border-2 p-3 text-left transition ${stepKey === k ? "border-brand-600 bg-brand-50" : "border-slate-200 bg-white hover:border-slate-300"}`}>
            <p className="flex items-center gap-1.5 text-sm font-semibold">
              <span className={`grid h-5 w-5 place-items-center rounded-full text-[10px] ${k !== "review" && done(label) ? "bg-brand-600 text-white" : "bg-slate-200 text-slate-600"}`}>
                {k !== "review" && done(label) ? "✓" : i + 1}
              </span>
              {label}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">{hint}</p>
          </button>
        ))}
      </nav>

      {stepKey === "business" && <BusinessStep c={c} editable={editable} next={() => go("accounts")} />}
      {stepKey === "accounts" && <AccountsStep c={c} editable={editable} next={() => go("plan")} />}
      {stepKey === "plan" && <PlanStep c={c} editable={editable} next={() => go("commitments")} />}
      {stepKey === "commitments" && <CommitmentsStep c={c} editable={editable} next={() => go("review")} />}
      {stepKey === "review" && <ReviewStep c={c} editable={editable} problems={problems} go={go} />}
    </div>
  );
}

/* ───────────── shared step frame ───────────── */

function useProjectDraft(c: Campaign) {
  const { db, saveProject } = useStore();
  const [p, setP] = useState<Project>(() => db.projects[c.id] ?? emptyProject(c.id));
  return { p, setP, save: () => saveProject(p) };
}

function StepForm({ title, intro, editable, save, next, children }: {
  title: string; intro: string; editable: boolean; save: () => Promise<string | null>; next: () => void; children: ReactNode;
}) {
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const run = async (thenNext: boolean) => {
    setBusy(true);
    setErr(null);
    setSaved(false);
    const error = await save();
    setBusy(false);
    if (error) return setErr(error);
    if (thenNext) next();
    else setSaved(true);
  };
  return (
    <form className="space-y-5" onSubmit={(e: FormEvent) => { e.preventDefault(); run(true); }}>
      <div>
        <h2 className="text-xl font-bold">{title}</h2>
        <p className="text-sm text-slate-600">{intro}</p>
      </div>
      <fieldset disabled={!editable} className="space-y-5">{children}</fieldset>
      <ErrorNote>{err}</ErrorNote>
      <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 pt-4">
        {editable ? (
          <>
            <button type="button" className="btn-secondary" disabled={busy} onClick={() => run(false)}>Save</button>
            <button className="btn-primary" disabled={busy}>{busy ? "Saving…" : "Save and continue"}</button>
            {saved && <span className="text-sm text-brand-700" role="status">Saved ✓</span>}
          </>
        ) : (
          <button type="button" className="btn-secondary" onClick={next}>Next step</button>
        )}
      </div>
    </form>
  );
}

const Card = ({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) => (
  <section className="card space-y-3">
    <div>
      <h3 className="font-semibold">{title}</h3>
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
    {children}
  </section>
);

/* ───────────── 1. Business ───────────── */

function BusinessStep({ c, editable, next }: { c: Campaign; editable: boolean; next: () => void }) {
  const { p, setP, save } = useProjectDraft(c);
  return (
    <StepForm title="Your business" intro="Tell investors who you are, what you sell and why you'll succeed. Write in Bangla or English." editable={editable} save={save} next={next}>
      <Card title="About the business" hint={`What you do, for whom, and the problem this campaign solves. At least 50 characters (${p.story.trim().length} so far).`}>
        <label className="sr-only" htmlFor="story">About the business</label>
        <textarea id="story" className="input min-h-40" value={p.story} onChange={(e) => setP({ ...p, story: e.target.value })} />
      </Card>
      <Card title="Products and services">
        <label className="sr-only" htmlFor="products">Products and services</label>
        <textarea id="products" className="input min-h-24" value={p.products} onChange={(e) => setP({ ...p, products: e.target.value })} />
      </Card>
      <Card title="Highlights" hint="Short facts investors notice first, e.g. “14 supermarket clients” or “Sales up 35% last year”.">
        <TextList items={p.highlights} onChange={(highlights) => setP({ ...p, highlights })} addLabel="Add highlight" label="Highlight" placeholder="e.g. 320 contract farmers" />
      </Card>
      <Card title="Team" hint="At least one person. Founders and the people who run the money and operations.">
        <ListEditor items={p.team} onChange={(team) => setP({ ...p, team })} addLabel="Add team member" emptyText="No team members yet."
          blank={() => ({ name: "", role: "", bio: "" })}
          fields={[
            { key: "name", label: "Name", width: "sm:w-48" },
            { key: "role", label: "Role", width: "sm:w-44", placeholder: "e.g. Managing Director" },
            { key: "bio", label: "Experience", type: "textarea", placeholder: "Background in one or two sentences" },
          ]} />
      </Card>
    </StepForm>
  );
}

/* ───────────── 2. Accounts ───────────── */

function AccountsStep({ c, editable, next }: { c: Campaign; editable: boolean; next: () => void }) {
  const { db, saveFinancials } = useStore();
  const [f, setF] = useState<Financials>(() => db.financials[c.id] ?? emptyFinancials(c.id));
  const min = db.settings.minAccountYears;
  const year = new Date().getFullYear();

  return (
    <StepForm title="Your accounts" editable={editable} next={next} save={() => saveFinancials(f)}
      intro={`Give results for at least ${min} past year${min === 1 ? "" : "s"}. Visitors see only growth and margin; logged-in investors see the full figures and documents.`}>
      {db.financials[c.id]?.checked && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">FundBridge has checked these accounts. Saving changes removes the check until an admin reviews them again.</p>}
      <Card title="Past results (in taka)" hint="Sales and costs for the year; what the business owns and owes at year end. Profit and net worth are calculated for you.">
        <ListEditor items={f.history} onChange={(history) => setF({ ...f, history })} addLabel="Add a year" emptyText="No years added yet."
          blank={() => ({ year: (f.history.length ? Math.min(...f.history.map((h) => h.year)) - 1 : year - 1), revenue: 0, costs: 0, assets: 0, liabilities: 0 })}
          fields={[
            { key: "year", label: "Year", type: "number", width: "sm:w-24" },
            { key: "revenue", label: "Sales", type: "number" },
            { key: "costs", label: "Costs", type: "number" },
            { key: "assets", label: "Owns (assets)", type: "number" },
            { key: "liabilities", label: "Owes (liabilities)", type: "number" },
          ]} />
        {f.history.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm tabular-nums">
              <thead className="text-xs uppercase tracking-wide text-slate-500"><tr><th className="py-1 text-left">Year</th><th className="text-right">Profit</th><th className="text-right">Margin</th><th className="text-right">Net worth</th></tr></thead>
              <tbody>
                {[...f.history].sort((a, b) => b.year - a.year).map((h) => (
                  <tr key={h.year} className="border-t border-slate-100">
                    <td className="py-1">{h.year}</td>
                    <td className={`text-right ${profitOf(h) < 0 ? "text-red-700" : ""}`}>{formatMoney(profitOf(h))}</td>
                    <td className="text-right">{h.revenue > 0 ? `${Math.round((profitOf(h) / h.revenue) * 1000) / 10}%` : "—"}</td>
                    <td className="text-right">{formatMoney(equityOf(h))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Card title="Projections" hint="Your own forecast for the coming years. Investors see these labelled as estimates.">
        <ListEditor items={f.projections} onChange={(projections) => setF({ ...f, projections })} addLabel="Add a forecast year"
          blank={() => ({ year: (f.projections.length ? Math.max(...f.projections.map((x) => x.year)) + 1 : year), revenue: 0, profit: 0 })}
          fields={[
            { key: "year", label: "Year", type: "number", width: "sm:w-24" },
            { key: "revenue", label: "Expected sales", type: "number" },
            { key: "profit", label: "Expected profit", type: "number" },
          ]} />
      </Card>
      <Card title="Notes on the accounts" hint="e.g. who prepared them, the financial year end, anything unusual.">
        <label className="sr-only" htmlFor="fin-notes">Notes</label>
        <textarea id="fin-notes" className="input min-h-20" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
      </Card>
      <Documents c={c} editable={editable} />
    </StepForm>
  );
}

function Documents({ c, editable }: { c: Campaign; editable: boolean }) {
  const { db, uploadDocument, deleteDocument, openDocument } = useStore();
  const docs = db.documents.filter((d) => d.campaignId === c.id);
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState<DocKind>("accounts");
  const [title, setTitle] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [inputKey, setInputKey] = useState(0);

  const upload = async () => {
    if (!file) return setErr("Choose a file first.");
    setBusy(true);
    setErr(null);
    const error = await uploadDocument(c.id, file, kind, title);
    setBusy(false);
    if (error) return setErr(error);
    setFile(null);
    setTitle("");
    setInputKey((k) => k + 1);
  };
  const open = async (d: (typeof docs)[number]) => {
    const { url, error } = await openDocument(d);
    if (error || !url) return setErr(error);
    const a = document.createElement("a");
    a.href = url; a.target = "_blank"; a.rel = "noreferrer"; a.click();
  };

  return (
    <Card title="Supporting documents" hint="Audited accounts, bank statements, tax returns or licences. PDF, JPG, PNG or WebP, up to 10 MB each. Only logged-in investors can open them.">
      {docs.length > 0 && (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
          {docs.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
              <span><b>{d.title}</b> <span className="text-xs text-slate-500">· {DOC_KINDS.find(([k]) => k === d.kind)?.[1]} · {formatBytes(d.sizeBytes)}</span></span>
              <span className="flex gap-2">
                <button type="button" className="btn-secondary" onClick={() => open(d)}>Open</button>
                {editable && <button type="button" className="text-xs text-red-600 hover:underline" onClick={async () => setErr(await deleteDocument(d))}>Remove</button>}
              </span>
            </li>
          ))}
        </ul>
      )}
      {editable && (
        <div className="grid gap-2 rounded-xl bg-slate-50 p-3 sm:grid-cols-[1fr_12rem_1fr_auto] sm:items-end">
          <div><label className="mb-0.5 block text-xs font-medium text-slate-500" htmlFor="doc-title">Title</label>
            <input id="doc-title" className="input" placeholder="e.g. Audited accounts 2025" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div><label className="mb-0.5 block text-xs font-medium text-slate-500" htmlFor="doc-kind">Type</label>
            <select id="doc-kind" className="input" value={kind} onChange={(e) => setKind(e.target.value as DocKind)}>
              {DOC_KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select></div>
          <div><label className="mb-0.5 block text-xs font-medium text-slate-500" htmlFor="doc-file">File</label>
            <input key={inputKey} id="doc-file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="block w-full text-sm"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></div>
          <button type="button" className="btn-primary" disabled={busy || !file} onClick={upload}>{busy ? "Uploading…" : "Upload"}</button>
        </div>
      )}
      <ErrorNote>{err}</ErrorNote>
    </Card>
  );
}

/* ───────────── 3. Plan ───────────── */

function PlanStep({ c, editable, next }: { c: Campaign; editable: boolean; next: () => void }) {
  const { p, setP, save } = useProjectDraft(c);
  const total = sum(p.fundItems.map((x) => x.amount));
  const diff = c.goal - total;
  const rp = p.returnPlan;

  return (
    <StepForm title="Your plan" intro="Show exactly where the money goes, what you'll achieve, the risks, and how investors get their return." editable={editable} save={save} next={next}>
      <Card title="Use of funds" hint={`Each item and its cost. The items must add up to your goal of ${formatMoney(c.goal)}.`}>
        <ListEditor items={p.fundItems} onChange={(fundItems) => setP({ ...p, fundItems })} addLabel="Add item" emptyText="No items yet."
          blank={() => ({ item: "", amount: 0 })}
          fields={[{ key: "item", label: "What you'll spend on" }, { key: "amount", label: "Amount (৳)", type: "number", width: "sm:w-40" }]} />
        <p className={`rounded-lg p-2 text-sm font-medium ${diff === 0 && total > 0 ? "bg-green-50 text-green-800" : "bg-amber-50 text-amber-800"}`} role="status">
          Total {formatMoney(total)} of {formatMoney(c.goal)}
          {diff === 0 && total > 0 ? " · matches the goal ✓" : diff > 0 ? ` · ${formatMoney(diff)} still to allocate` : ` · ${formatMoney(-diff)} over the goal`}
        </p>
      </Card>
      <Card title="Milestones" hint="What you'll achieve and when, counted from when funding completes.">
        <ListEditor items={p.milestones} onChange={(milestones) => setP({ ...p, milestones })} addLabel="Add milestone"
          blank={() => ({ when: `Month ${p.milestones.length * 3 + 3}`, what: "" })}
          fields={[{ key: "when", label: "When", width: "sm:w-32" }, { key: "what", label: "What will be done" }]} />
      </Card>
      <Card title="Risks" hint="Be honest: investors trust businesses that name their risks and show a plan.">
        <ListEditor items={p.risks} onChange={(risks) => setP({ ...p, risks })} addLabel="Add risk"
          blank={() => ({ risk: "", mitigation: "" })}
          fields={[{ key: "risk", label: "Risk", type: "textarea" }, { key: "mitigation", label: "How you'll handle it", type: "textarea" }]} />
      </Card>
      {c.type === "debt" && (
        <Card title="Repayment schedule" hint={`When you'll repay investors, counted in months after funding. You offer ${c.terms.interestRate ?? "?"}% a year for ${c.terms.tenorMonths ?? "?"} months.`}>
          <ListEditor items={rp.schedule ?? []} onChange={(schedule) => setP({ ...p, returnPlan: { ...rp, schedule } })} addLabel="Add repayment"
            blank={() => ({ month: ((rp.schedule?.length ?? 0) + 1) * 6, amount: 0 })}
            fields={[{ key: "month", label: "Month after funding", type: "number", width: "sm:w-44" }, { key: "amount", label: "Amount repaid (৳)", type: "number" }]} />
          {!!rp.schedule?.length && <p className="text-sm text-slate-600">Total repayments {formatMoney(sum(rp.schedule.map((r) => r.amount)))} on a goal of {formatMoney(c.goal)}.</p>}
        </Card>
      )}
      {c.type === "equity" && (
        <Card title="Returns for shareholders" hint={`You offer ${c.terms.equityPercent ?? "?"}% of the company. Explain at least one of these.`}>
          <label className="label" htmlFor="dividends">Dividend policy</label>
          <textarea id="dividends" className="input min-h-20" placeholder="e.g. We plan to pay 30% of yearly profit as dividends from year 2."
            value={rp.dividendPolicy ?? ""} onChange={(e) => setP({ ...p, returnPlan: { ...rp, dividendPolicy: e.target.value } })} />
          <label className="label" htmlFor="exit">Exit plan</label>
          <textarea id="exit" className="input min-h-20" placeholder="e.g. Founders offer to buy back shares at fair value after 5 years."
            value={rp.exitPlan ?? ""} onChange={(e) => setP({ ...p, returnPlan: { ...rp, exitPlan: e.target.value } })} />
        </Card>
      )}
      {c.type === "reward" && (
        <Card title="Reward delivery" hint="When backers will receive their rewards.">
          <label className="sr-only" htmlFor="delivery">Delivery</label>
          <input id="delivery" className="input" placeholder="e.g. Within 6 weeks of the campaign closing"
            value={rp.delivery ?? ""} onChange={(e) => setP({ ...p, returnPlan: { ...rp, delivery: e.target.value } })} />
        </Card>
      )}
    </StepForm>
  );
}

/* ───────────── 4. Commitments ───────────── */

function CommitmentsStep({ c, editable, next }: { c: Campaign; editable: boolean; next: () => void }) {
  const { db } = useStore();
  const { p, setP, save } = useProjectDraft(c);
  const biz = db.businesses.find((b) => b.userId === c.businessId);
  const [agree, setAgree] = useState(Boolean(p.declarationName));
  const options = allowedReporting(db.settings.minReporting);

  return (
    <StepForm title="Your commitments to investors" editable={editable} next={next}
      save={() => save()}
      intro="These promises appear on your page as “Our commitments to you”. Investors confirm they've read them before pledging.">
      <Card title="Standard commitments" hint="Every business on FundBridge makes these.">
        <ul className="space-y-2">
          {db.settings.commitmentOptions.map((t, i) => (
            <li key={i} className="flex gap-2 text-sm"><span className="text-brand-700" aria-hidden>✓</span>{t}</li>
          ))}
        </ul>
      </Card>
      <Card title="Progress updates" hint="How often you'll send investors an update on progress, spending and sales.">
        <label className="sr-only" htmlFor="reporting">Progress updates</label>
        <select id="reporting" className="input sm:w-64" value={options.includes(p.reporting) ? p.reporting : options[options.length - 1]}
          onChange={(e) => setP({ ...p, reporting: e.target.value as Reporting })}>
          {options.map((r) => <option key={r} value={r}>{REPORTING_LABEL[r]}</option>)}
        </select>
      </Card>
      <Card title="Your own extra commitments (optional)" hint="Anything else you promise, e.g. “Investors can visit the factory on request”.">
        <TextList items={p.customCommitments} onChange={(customCommitments) => setP({ ...p, customCommitments })} addLabel="Add commitment" label="Commitment" placeholder="What you promise" />
      </Card>
      <Card title="Investor contact" hint="The person who answers investors and sends the updates.">
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="label" htmlFor="contact-name">Name</label><input id="contact-name" className="input" value={p.contactName} onChange={(e) => setP({ ...p, contactName: e.target.value })} /></div>
          <div><label className="label" htmlFor="contact-role">Role</label><input id="contact-role" className="input" placeholder="e.g. Managing Director" value={p.contactRole} onChange={(e) => setP({ ...p, contactRole: e.target.value })} /></div>
        </div>
      </Card>
      <Card title="Declaration">
        {p.declaredAt && <p className="rounded-lg bg-green-50 p-2 text-sm text-green-800">Declared by {p.declarationName} on {formatDate(p.declaredAt)}.</p>}
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={agree} onChange={(e) => { setAgree(e.target.checked); if (!e.target.checked) setP({ ...p, declarationName: "" }); }} />
          <span>On behalf of <b>{biz?.companyName ?? "the business"}</b>, I confirm the information on this page is true and we commit to everything above.</span>
        </label>
        {agree && (
          <div className="sm:w-80">
            <label className="label" htmlFor="declaration-name">Your full name</label>
            <input id="declaration-name" className="input" value={p.declarationName} onChange={(e) => setP({ ...p, declarationName: e.target.value })} />
          </div>
        )}
      </Card>
    </StepForm>
  );
}

/* ───────────── 5. Review ───────────── */

function ReviewStep({ c, editable, problems, go }: { c: Campaign; editable: boolean; problems: ReturnType<typeof submitProblems>; go: (k: string) => void }) {
  const { saveCampaign } = useStore();
  const nav = useNavigate();
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const stepFor: Record<Section, string> = { Eligibility: "", Basics: "", Business: "business", Accounts: "accounts", Plan: "plan", Commitments: "commitments" };
  // Where to fix an eligibility problem: documents → Accounts step; goal → basics; the rest → company profile on the dashboard.
  const eligibilityFix = (msg: string) =>
    /Documents/.test(msg) ? <button type="button" className="text-xs font-semibold text-brand-700" onClick={() => go("accounts")}>Upload →</button>
    : /Goal/.test(msg) ? <Link to={`/campaigns/${c.id}/edit`} className="text-xs font-semibold text-brand-700">Change goal →</Link>
    : <Link to="/dashboard" className="text-xs font-semibold text-brand-700">Dashboard →</Link>;

  const submit = async () => {
    setBusy(true);
    setErr(null);
    const { id: _id, createdAt: _c, status: _s, businessId: _b, rejectionReason: _r, ...fields } = c;
    const res = await saveCampaign({ ...fields, id: c.id }, true);
    setBusy(false);
    if (res.error) return setErr(res.error);
    nav("/dashboard");
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold">Review and submit</h2>
        <p className="text-sm text-slate-600">An admin reviews your page before it goes live. You can't edit it while it's being reviewed.</p>
      </div>
      {problems.length === 0 ? (
        <p className="rounded-xl bg-green-50 p-4 text-sm font-medium text-green-800">Everything is complete. Preview the page, then submit it for review.</p>
      ) : (
        <section className="card space-y-2">
          <h3 className="font-semibold">Still to do ({problems.length})</h3>
          <ul className="space-y-2">
            {problems.map((pr, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2 text-sm">
                <span><span className="badge mr-2 bg-amber-100 text-amber-800">{pr.section}</span>{pr.message}</span>
                {pr.section === "Eligibility" ? eligibilityFix(pr.message) : pr.section === "Basics"
                  ? (pr.message.includes("verified") ? <Link to="/dashboard" className="text-xs font-semibold text-brand-700">Company profile →</Link> : <Link to={`/campaigns/${c.id}/edit`} className="text-xs font-semibold text-brand-700">Fix →</Link>)
                  : <button type="button" className="text-xs font-semibold text-brand-700" onClick={() => go(stepFor[pr.section])}>Fix →</button>}
              </li>
            ))}
          </ul>
        </section>
      )}
      <ErrorNote>{err}</ErrorNote>
      <div className="flex flex-wrap gap-3">
        <Link to={`/campaigns/${c.id}`} className="btn-secondary">Preview page</Link>
        {editable && <button type="button" className="btn-primary" disabled={busy || problems.length > 0} onClick={submit}>{busy ? "Submitting…" : "Submit for admin review"}</button>}
      </div>
    </div>
  );
}
