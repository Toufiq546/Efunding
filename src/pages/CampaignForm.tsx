import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useStore } from "../lib/store";
import { CAMPAIGN_TYPES, RISKS, type CampaignType, type RewardTier, type Risk } from "../lib/types";
import { TYPE_LABEL, withCurrent } from "../lib/format";
import { Empty, ErrorNote, Spinner } from "../components/ui";

const defaultDeadline = () => new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);

export default function CampaignForm() {
  const { id } = useParams();
  const { db, user, loading, saveCampaign } = useStore();
  const nav = useNavigate();
  const biz = db.businesses.find((b) => b.userId === user?.id);
  const existing = id ? db.campaigns.find((c) => c.id === id && c.businessId === user?.id) : undefined;

  const [f, setF] = useState({
    title: existing?.title ?? "",
    summary: existing?.summary ?? "",
    pitch: existing?.pitch ?? "",
    useOfFunds: existing?.useOfFunds ?? "",
    type: (existing?.type ?? "equity") as CampaignType,
    sector: existing?.sector ?? biz?.sector ?? db.settings.sectors[0],
    location: existing?.location ?? biz?.location ?? db.settings.locations[0],
    risk: (existing?.risk ?? "medium") as Risk,
    goal: String(existing?.goal ?? ""),
    minInvestment: String(existing?.minInvestment ?? ""),
    deadline: existing?.deadline ?? defaultDeadline(),
    equityPercent: String(existing?.terms.equityPercent ?? ""),
    valuation: String(existing?.terms.valuation ?? ""),
    interestRate: String(existing?.terms.interestRate ?? ""),
    tenorMonths: String(existing?.terms.tenorMonths ?? ""),
  });
  const [rewards, setRewards] = useState<RewardTier[]>(existing?.terms.rewards ?? [{ amount: 1000, title: "", description: "" }]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (loading) return <Spinner />;
  if (id && !existing) return <Empty>Campaign not found.</Empty>;
  if (existing && !["draft", "rejected"].includes(existing.status)) {
    return <Empty>Only draft or rejected campaigns can be edited.</Empty>;
  }

  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const verified = biz?.verification === "verified";

  // Both buttons save a draft; "continue" also checks the deal terms and opens the project-page builder.
  const submit = (toBuilder: boolean) => async (e?: FormEvent) => {
    e?.preventDefault();
    const goal = Number(f.goal), minInvestment = Number(f.minInvestment);
    if (!f.title.trim() || !f.summary.trim()) return setErr("Title and summary are required.");
    if (!(goal > 0) || !(minInvestment > 0)) return setErr("Goal and minimum investment must be positive numbers.");
    if (minInvestment > goal) return setErr("Minimum investment cannot exceed the goal.");
    if (f.deadline <= new Date().toISOString().slice(0, 10)) return setErr("The deadline must be in the future.");
    if (f.type === "equity" && toBuilder && !(Number(f.equityPercent) > 0 && Number(f.equityPercent) <= 100)) return setErr("Enter the equity % offered (1–100).");
    if (f.type === "debt" && toBuilder && !(Number(f.interestRate) >= 0 && Number(f.tenorMonths) > 0)) return setErr("Enter the interest rate and tenor.");
    if (f.type === "reward" && toBuilder && rewards.some((r) => !r.title.trim() || !(r.amount > 0))) return setErr("Every reward tier needs a title and an amount.");

    const terms =
      f.type === "equity" ? { equityPercent: Number(f.equityPercent) || undefined, valuation: Number(f.valuation) || undefined }
      : f.type === "debt" ? { interestRate: Number(f.interestRate) || undefined, tenorMonths: Number(f.tenorMonths) || undefined }
      : { rewards: [...rewards].sort((a, b) => a.amount - b.amount) };

    setBusy(true);
    setErr(null);
    const res = await saveCampaign({
      id: existing?.id, title: f.title.trim(), summary: f.summary.trim(), pitch: f.pitch, useOfFunds: f.useOfFunds,
      type: f.type, sector: f.sector, location: f.location, risk: f.risk, goal, minInvestment, deadline: f.deadline, terms,
    }, false);
    setBusy(false);
    if (res.error) return setErr(res.error);
    nav(toBuilder ? `/campaigns/${res.id}/build` : "/dashboard");
  };

  return (
    <form onSubmit={submit(true)} className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link to="/dashboard" className="text-sm text-brand-700">← Dashboard</Link>
        <h1 className="text-3xl font-bold">{existing ? "Edit campaign" : "New campaign"}</h1>
        {!verified && (
          <p className="mt-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
            You can prepare your campaign now. Submitting it for review needs a verified business profile.
          </p>
        )}
        {existing?.rejectionReason && <p className="mt-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">Admin feedback: {existing.rejectionReason}</p>}
      </div>

      <ErrorNote>{err}</ErrorNote>

      <section className="card space-y-4">
        <h2 className="font-bold">Basics</h2>
        <div><label className="label">Campaign title</label><input className="input" value={f.title} onChange={set("title")} required /></div>
        <div><label className="label">One-line summary</label><input className="input" value={f.summary} onChange={set("summary")} maxLength={160} required /></div>
        <div><label className="label">Pitch: the problem, your solution, traction</label><textarea className="input min-h-32" value={f.pitch} onChange={set("pitch")} /></div>
        <div><label className="label">Use of funds</label><textarea className="input min-h-20" value={f.useOfFunds} onChange={set("useOfFunds")} /></div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div><label className="label">Sector</label><select className="input" value={f.sector} onChange={set("sector")}>{withCurrent(db.settings.sectors, f.sector).map((s) => <option key={s}>{s}</option>)}</select></div>
          <div><label className="label">Location</label><select className="input" value={f.location} onChange={set("location")}>{withCurrent(db.settings.locations, f.location).map((s) => <option key={s}>{s}</option>)}</select></div>
          <div><label className="label">Risk level</label><select className="input capitalize" value={f.risk} onChange={set("risk")}>{RISKS.map((s) => <option key={s} value={s}>{s}</option>)}</select></div>
        </div>
      </section>

      <section className="card space-y-4">
        <h2 className="font-bold">Funding</h2>
        <div>
          <label className="label">Crowdfunding type</label>
          <div className="grid gap-3 sm:grid-cols-3">
            {CAMPAIGN_TYPES.map((t) => (
              <button type="button" key={t} onClick={() => setF({ ...f, type: t })}
                className={`rounded-xl border-2 p-3 text-left text-sm ${f.type === t ? "border-brand-600 bg-brand-50" : "border-slate-200"}`}>
                <p className="font-semibold">{TYPE_LABEL[t]}</p>
                <p className="text-xs text-slate-600">
                  {t === "equity" ? "Investors receive shares" : t === "debt" ? "Repay with interest or profit share" : "Backers get products or perks"}
                </p>
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div><label className="label">Goal (৳)</label><input className="input" type="number" min={1} value={f.goal} onChange={set("goal")} required /></div>
          <div><label className="label">Minimum pledge (৳)</label><input className="input" type="number" min={1} value={f.minInvestment} onChange={set("minInvestment")} required /></div>
          <div><label className="label">Deadline</label><input className="input" type="date" value={f.deadline} onChange={set("deadline")} required /></div>
        </div>

        {f.type === "equity" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label className="label">Equity offered (%)</label><input className="input" type="number" step="0.1" min={0} max={100} value={f.equityPercent} onChange={set("equityPercent")} /></div>
            <div><label className="label">Pre-money valuation (৳)</label><input className="input" type="number" min={0} value={f.valuation} onChange={set("valuation")} /></div>
          </div>
        )}
        {f.type === "debt" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label className="label">Interest / profit rate (% per year)</label><input className="input" type="number" step="0.1" min={0} value={f.interestRate} onChange={set("interestRate")} /></div>
            <div><label className="label">Tenor (months)</label><input className="input" type="number" min={1} value={f.tenorMonths} onChange={set("tenorMonths")} /></div>
          </div>
        )}
        {f.type === "reward" && (
          <div className="space-y-3">
            <label className="label">Reward tiers</label>
            {rewards.map((r, i) => (
              <div key={i} className="grid gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-[120px_1fr_1fr_auto]">
                <input className="input" type="number" placeholder="৳ amount" value={r.amount || ""} onChange={(e) => setRewards(rewards.map((x, j) => j === i ? { ...x, amount: Number(e.target.value) } : x))} />
                <input className="input" placeholder="Title" value={r.title} onChange={(e) => setRewards(rewards.map((x, j) => j === i ? { ...x, title: e.target.value } : x))} />
                <input className="input" placeholder="Description" value={r.description} onChange={(e) => setRewards(rewards.map((x, j) => j === i ? { ...x, description: e.target.value } : x))} />
                <button type="button" className="btn-secondary" disabled={rewards.length === 1} onClick={() => setRewards(rewards.filter((_, j) => j !== i))}>Remove</button>
              </div>
            ))}
            <button type="button" className="btn-secondary" onClick={() => setRewards([...rewards, { amount: 0, title: "", description: "" }])}>+ Add tier</button>
          </div>
        )}
      </section>

      <div className="flex flex-wrap justify-end gap-3">
        <button type="button" className="btn-secondary" disabled={busy} onClick={() => submit(false)()}>Save draft</button>
        <button className="btn-primary" disabled={busy}>Save and build project page →</button>
      </div>
    </form>
  );
}
