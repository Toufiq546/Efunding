import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useStore } from "../lib/store";
import { CampaignCard, Chips, Empty, ErrorNote, Stat, StatusBadge, TypeBadge } from "../components/ui";
import { CAMPAIGN_TYPES, LOCATIONS, RISKS, SECTORS, type BusinessProfile, type InvestorProfile } from "../lib/types";
import { TYPE_LABEL, effectiveStatus, formatDate, formatMoney, raisedFor } from "../lib/format";
import { rankCampaigns } from "../lib/matching";

export default function Dashboard() {
  const { user } = useStore();
  if (!user) return null;
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Welcome, {user.name.split(" ")[0]}</h1>
        <p className="text-sm capitalize text-slate-500">{user.role} dashboard</p>
      </div>
      {user.role === "investor" && <InvestorDashboard />}
      {user.role === "business" && <BusinessDashboard />}
      {user.role === "admin" && <AdminDashboard />}
    </div>
  );
}

/* ───────────────────────── Investor ───────────────────────── */

function InvestorDashboard() {
  const { db, user, saveInvestor, cancelPledge } = useStore();
  const saved = db.investors.find((i) => i.userId === user!.id) ?? {
    userId: user!.id, sectors: [], locations: [], types: [], minTicket: 5000, maxTicket: 100000, risk: "medium" as const,
  };
  const [pref, setPref] = useState<InvestorProfile>(saved);
  const [savedMsg, setSavedMsg] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const live = db.campaigns.filter((c) => effectiveStatus(c) === "live");
  const matches = rankCampaigns(live, saved).slice(0, 6);
  const pledges = db.pledges.filter((p) => p.investorId === user!.id && p.status === "active");
  const total = pledges.reduce((s, p) => s + p.amount, 0);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const error = await saveInvestor({ ...pref, minTicket: Math.min(pref.minTicket, pref.maxTicket) });
    setErr(error);
    if (!error) {
      setSavedMsg(true);
      setTimeout(() => setSavedMsg(false), 2000);
    }
  };

  const cancel = async (id: string) => {
    if (!confirm("Cancel this pledge?")) return;
    setErr(await cancelPledge(id));
  };

  return (
    <>
      <ErrorNote>{err}</ErrorNote>
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Total pledged" value={formatMoney(total)} />
        <Stat label="Campaigns backed" value={new Set(pledges.map((p) => p.campaignId)).size} />
        <Stat label="Strong matches (75%+)" value={rankCampaigns(live, saved).filter((m) => m.match.score >= 75).length} />
      </div>

      <section className="space-y-3">
        <div className="flex items-end justify-between">
          <h2 className="text-xl font-bold">Your top matches</h2>
          <Link to="/campaigns" className="text-sm font-semibold text-brand-700">Browse all →</Link>
        </div>
        {matches.length === 0 ? <Empty>No live campaigns right now.</Empty> : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {matches.map(({ campaign, match }) => <CampaignCard key={campaign.id} campaign={campaign} match={match} />)}
          </div>
        )}
      </section>

      <form onSubmit={save} className="card space-y-5">
        <div>
          <h2 className="text-xl font-bold">Investment preferences</h2>
          <p className="text-sm text-slate-500">These drive your match scores. Leave a group empty to stay open to everything in it.</p>
        </div>
        <div><label className="label">Sectors</label><Chips options={SECTORS} value={pref.sectors} onChange={(sectors) => setPref({ ...pref, sectors })} /></div>
        <div><label className="label">Deal types</label><Chips options={CAMPAIGN_TYPES} value={pref.types} onChange={(types) => setPref({ ...pref, types })} render={(t) => TYPE_LABEL[t]} /></div>
        <div><label className="label">Locations</label><Chips options={LOCATIONS} value={pref.locations} onChange={(locations) => setPref({ ...pref, locations })} /></div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div><label className="label">Min ticket (৳)</label><input className="input" type="number" min={0} value={pref.minTicket} onChange={(e) => setPref({ ...pref, minTicket: Number(e.target.value) })} /></div>
          <div><label className="label">Max ticket (৳)</label><input className="input" type="number" min={0} value={pref.maxTicket} onChange={(e) => setPref({ ...pref, maxTicket: Number(e.target.value) })} /></div>
          <div>
            <label className="label">Risk tolerance</label>
            <select className="input capitalize" value={pref.risk} onChange={(e) => setPref({ ...pref, risk: e.target.value as InvestorProfile["risk"] })}>
              {RISKS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button className="btn-primary">Save preferences</button>
          {savedMsg && <span className="text-sm text-brand-700">Saved ✓</span>}
        </div>
      </form>

      <section className="card space-y-3">
        <h2 className="text-xl font-bold">My pledges</h2>
        {pledges.length === 0 ? <p className="text-sm text-slate-500">You haven't pledged yet.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-slate-500">
                <tr><th className="py-2">Campaign</th><th>Type</th><th>Amount</th><th>Date</th><th>Status</th><th /></tr>
              </thead>
              <tbody>
                {pledges.map((p) => {
                  const c = db.campaigns.find((x) => x.id === p.campaignId);
                  if (!c) return null;
                  const st = effectiveStatus(c);
                  return (
                    <tr key={p.id} className="border-t border-slate-100">
                      <td className="py-2"><Link to={`/campaigns/${c.id}`} className="font-medium text-brand-700 hover:underline">{c.title}</Link></td>
                      <td><TypeBadge type={c.type} /></td>
                      <td className="font-semibold">{formatMoney(p.amount)}</td>
                      <td>{formatDate(p.createdAt)}</td>
                      <td><StatusBadge status={st} /></td>
                      <td className="text-right">
                        {st === "live" && (
                          <button type="button" className="text-xs text-red-600 hover:underline" onClick={() => cancel(p.id)}>Cancel</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

/* ───────────────────────── Business ───────────────────────── */

function BusinessDashboard() {
  const { db, user, saveBusiness } = useStore();
  const existing = db.businesses.find((b) => b.userId === user!.id);
  const [p, setP] = useState<Omit<BusinessProfile, "verification" | "rejectionReason">>({
    userId: user!.id,
    companyName: existing?.companyName ?? "",
    sector: existing?.sector ?? SECTORS[0],
    location: existing?.location ?? LOCATIONS[0],
    foundedYear: existing?.foundedYear ?? new Date().getFullYear(),
    tradeLicenseNo: existing?.tradeLicenseNo ?? "",
    tin: existing?.tin ?? "",
    website: existing?.website ?? "",
    description: existing?.description ?? "",
  });
  const [editing, setEditing] = useState(!existing);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const campaigns = db.campaigns.filter((c) => c.businessId === user!.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const ids = new Set(campaigns.map((c) => c.id));
  const pledges = db.pledges.filter((x) => ids.has(x.campaignId) && x.status === "active");
  const unanswered = db.questions.filter((q) => ids.has(q.campaignId) && !q.answer);
  const verification = existing?.verification ?? "unverified";

  const save = (submit: boolean) => async (e?: FormEvent) => {
    e?.preventDefault();
    if (!p.companyName.trim()) return setErr("Company name is required.");
    if (submit && (!p.tradeLicenseNo.trim() || !p.tin.trim())) {
      return setErr("Trade licence number and TIN are required for verification.");
    }
    setBusy(true);
    const error = await saveBusiness(p, submit);
    setBusy(false);
    setErr(error);
    if (!error) setEditing(false);
  };

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="Verification" value={<StatusBadge status={verification} />} />
        <Stat label="Total pledged" value={formatMoney(pledges.reduce((s, x) => s + x.amount, 0))} />
        <Stat label="Investors" value={new Set(pledges.map((x) => x.investorId)).size} />
        <Stat label="Unanswered questions" value={unanswered.length} />
      </div>

      {verification !== "verified" && (
        <div className={`rounded-xl p-4 text-sm ${verification === "rejected" ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-800"}`}>
          {verification === "unverified" && "Complete your company profile and submit it for verification before you can raise funds."}
          {verification === "pending" && "Your business is under review. You can prepare campaign drafts in the meantime."}
          {verification === "rejected" && <>Verification was rejected: <b>{existing?.rejectionReason}</b>. Update your details and resubmit.</>}
        </div>
      )}

      <section className="card space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">Company profile</h2>
          {!editing && <button className="btn-secondary" onClick={() => setEditing(true)}>Edit</button>}
        </div>
        <ErrorNote>{err}</ErrorNote>
        {editing ? (
          <form onSubmit={save(true)} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div><label className="label">Registered company name *</label><input className="input" value={p.companyName} onChange={(e) => setP({ ...p, companyName: e.target.value })} /></div>
              <div><label className="label">Website</label><input className="input" value={p.website} onChange={(e) => setP({ ...p, website: e.target.value })} placeholder="https://" /></div>
              <div><label className="label">Trade licence no. *</label><input className="input" value={p.tradeLicenseNo} onChange={(e) => setP({ ...p, tradeLicenseNo: e.target.value })} /></div>
              <div><label className="label">TIN *</label><input className="input" value={p.tin} onChange={(e) => setP({ ...p, tin: e.target.value })} /></div>
              <div><label className="label">Sector</label><select className="input" value={p.sector} onChange={(e) => setP({ ...p, sector: e.target.value })}>{SECTORS.map((s) => <option key={s}>{s}</option>)}</select></div>
              <div><label className="label">Location</label><select className="input" value={p.location} onChange={(e) => setP({ ...p, location: e.target.value })}>{LOCATIONS.map((s) => <option key={s}>{s}</option>)}</select></div>
              <div><label className="label">Year founded</label><input className="input" type="number" value={p.foundedYear} onChange={(e) => setP({ ...p, foundedYear: Number(e.target.value) })} /></div>
            </div>
            <div><label className="label">About the business</label><textarea className="input min-h-24" value={p.description} onChange={(e) => setP({ ...p, description: e.target.value })} /></div>
            <div className="flex flex-wrap gap-3">
              <button type="button" className="btn-secondary" disabled={busy} onClick={() => save(false)()}>Save</button>
              {verification !== "verified" && verification !== "pending" && <button className="btn-primary" disabled={busy}>Save & submit for verification</button>}
              {verification === "verified" && <p className="self-center text-xs text-slate-500">Changing the company name, trade licence or TIN sends your business back for review.</p>}
            </div>
          </form>
        ) : (
          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            <div><dt className="text-slate-500">Company</dt><dd className="font-medium">{existing?.companyName}</dd></div>
            <div><dt className="text-slate-500">Sector</dt><dd>{existing?.sector}</dd></div>
            <div><dt className="text-slate-500">Location</dt><dd>{existing?.location}</dd></div>
            <div><dt className="text-slate-500">Trade licence</dt><dd>{existing?.tradeLicenseNo}</dd></div>
            <div><dt className="text-slate-500">TIN</dt><dd>{existing?.tin}</dd></div>
            <div><dt className="text-slate-500">Founded</dt><dd>{existing?.foundedYear}</dd></div>
          </dl>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">Your campaigns</h2>
          {existing && <Link to="/campaigns/new" className="btn-primary">+ New campaign</Link>}
        </div>
        {campaigns.length === 0 ? <Empty>No campaigns yet.</Empty> : (
          <div className="card overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr><th className="p-3">Campaign</th><th>Type</th><th>Raised / goal</th><th>Deadline</th><th>Status</th><th /></tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={c.id} className="border-t border-slate-100">
                    <td className="p-3"><Link to={`/campaigns/${c.id}`} className="font-medium text-brand-700 hover:underline">{c.title}</Link></td>
                    <td><TypeBadge type={c.type} /></td>
                    <td>{formatMoney(raisedFor(db, c.id))} / {formatMoney(c.goal)}</td>
                    <td>{formatDate(c.deadline)}</td>
                    <td><StatusBadge status={effectiveStatus(c)} /></td>
                    <td className="pr-3 text-right">
                      {(c.status === "draft" || c.status === "rejected") && <Link to={`/campaigns/${c.id}/edit`} className="text-xs text-brand-700 hover:underline">Edit</Link>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {unanswered.length > 0 && (
        <section className="card space-y-3">
          <h2 className="text-xl font-bold">Questions waiting for your answer</h2>
          <ul className="space-y-2 text-sm">
            {unanswered.map((q) => (
              <li key={q.id} className="flex items-center justify-between gap-3 border-t border-slate-100 pt-2">
                <span>“{q.text}”</span>
                <Link to={`/campaigns/${q.campaignId}`} className="btn-secondary shrink-0">Answer</Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

/* ───────────────────────── Admin ───────────────────────── */

function AdminDashboard() {
  const { db, setVerification, reviewCampaign } = useStore();
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const act = async (fn: () => Promise<string | null>) => {
    setBusy(true);
    setErr(await fn());
    setBusy(false);
  };
  const pendingBiz = db.businesses.filter((b) => b.verification === "pending");
  const pendingCampaigns = db.campaigns.filter((c) => c.status === "pending");
  const totalPledged = Object.values(db.stats).reduce((s, x) => s + x.raised, 0);

  const reject = (fn: (reason: string) => Promise<string | null>) => {
    const r = prompt("Reason for rejection (shown to the business):");
    if (r?.trim()) act(() => fn(r.trim()));
  };

  return (
    <>
      <ErrorNote>{err}</ErrorNote>
      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="Investors" value={db.roles.filter((r) => r.role === "investor").length} />
        <Stat label="Businesses" value={db.businesses.length} />
        <Stat label="Live campaigns" value={db.campaigns.filter((c) => effectiveStatus(c) === "live").length} />
        <Stat label="Total pledged" value={formatMoney(totalPledged)} />
      </div>

      <section className="card space-y-3">
        <h2 className="text-xl font-bold">Businesses awaiting verification ({pendingBiz.length})</h2>
        {pendingBiz.length === 0 ? <p className="text-sm text-slate-500">All caught up.</p> : pendingBiz.map((b) => {
          const owner = db.profiles.find((u) => u.id === b.userId);
          return (
            <div key={b.userId} className="flex flex-col gap-3 border-t border-slate-100 pt-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm">
                <p className="font-semibold">{b.companyName} <span className="font-normal text-slate-500">· {b.sector} · {b.location}</span></p>
                <p className="text-slate-600">Trade licence <b>{b.tradeLicenseNo}</b> · TIN <b>{b.tin}</b> · Founded {b.foundedYear}</p>
                <p className="text-xs text-slate-500">Owner: {owner?.name} ({owner?.email})</p>
              </div>
              <div className="flex gap-2">
                <button className="btn-primary" disabled={busy} onClick={() => act(() => setVerification(b.userId, true))}>Verify</button>
                <button className="btn-danger" disabled={busy} onClick={() => reject((r) => setVerification(b.userId, false, r))}>Reject</button>
              </div>
            </div>
          );
        })}
      </section>

      <section className="card space-y-3">
        <h2 className="text-xl font-bold">Campaigns awaiting approval ({pendingCampaigns.length})</h2>
        {pendingCampaigns.length === 0 ? <p className="text-sm text-slate-500">All caught up.</p> : pendingCampaigns.map((c) => {
          const biz = db.businesses.find((b) => b.userId === c.businessId);
          return (
            <div key={c.id} className="flex flex-col gap-3 border-t border-slate-100 pt-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm">
                <p className="font-semibold"><Link to={`/campaigns/${c.id}`} className="text-brand-700 hover:underline">{c.title}</Link></p>
                <p className="text-slate-600">{biz?.companyName} {biz?.verification !== "verified" && <span className="text-red-600">(business not verified)</span>} · {TYPE_LABEL[c.type]} · Goal {formatMoney(c.goal)} · closes {formatDate(c.deadline)}</p>
              </div>
              <div className="flex gap-2">
                <button className="btn-primary" disabled={busy || biz?.verification !== "verified"} onClick={() => act(() => reviewCampaign(c.id, true))}>Approve</button>
                <button className="btn-danger" disabled={busy} onClick={() => reject((r) => reviewCampaign(c.id, false, r))}>Reject</button>
              </div>
            </div>
          );
        })}
      </section>
    </>
  );
}
