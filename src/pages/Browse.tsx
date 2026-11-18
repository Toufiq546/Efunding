import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useStore } from "../lib/store";
import { CampaignCard, Empty } from "../components/ui";
import { CAMPAIGN_TYPES, type CampaignType } from "../lib/types";
import { TYPE_LABEL, daysLeft, effectiveStatus, raisedFor } from "../lib/format";
import { scoreMatch } from "../lib/matching";
import { compliance } from "../lib/tracking";

type Sort = "match" | "newest" | "ending" | "funded";

export default function Browse() {
  const { db, user } = useStore();
  const pref = user?.role === "investor" ? db.investors.find((i) => i.userId === user.id) : undefined;
  const [q, setQ] = useState("");
  const [type, setType] = useState<CampaignType | "">("");
  const [sector, setSector] = useState("");
  const [sort, setSort] = useState<Sort>(pref ? "match" : "newest");
  const [params, setParams] = useSearchParams();
  const view = params.get("view") === "funded" ? "funded" : "open";
  const funded = db.campaigns.filter((c) => c.fundedOn).sort((a, b) => (b.fundedOn ?? "").localeCompare(a.fundedOn ?? ""));

  const rows = useMemo(() => {
    const list = db.campaigns
      .filter((c) => effectiveStatus(c) === "live")
      .filter((c) => !type || c.type === type)
      .filter((c) => !sector || c.sector === sector)
      .filter((c) => {
        if (!q) return true;
        const biz = db.businesses.find((b) => b.userId === c.businessId);
        return `${c.title} ${c.summary} ${biz?.companyName ?? ""}`.toLowerCase().includes(q.toLowerCase());
      })
      .map((c) => ({ c, m: pref ? scoreMatch(c, pref) : undefined }));

    const cmp: Record<Sort, (a: (typeof list)[0], b: (typeof list)[0]) => number> = {
      match: (a, b) => (b.m?.score ?? 0) - (a.m?.score ?? 0),
      newest: (a, b) => b.c.createdAt.localeCompare(a.c.createdAt),
      ending: (a, b) => daysLeft(a.c.deadline) - daysLeft(b.c.deadline),
      funded: (a, b) => raisedFor(db, b.c.id) / b.c.goal - raisedFor(db, a.c.id) / a.c.goal,
    };
    return list.sort(cmp[sort]);
  }, [db, pref, q, type, sector, sort]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Browse campaigns</h1>
        <p className="text-sm text-slate-600">
          {pref ? "Ranked by how well each campaign fits your investor preferences." : "Every campaign comes from a verified business and is approved by our team."}
        </p>
      </div>

      <nav className="flex gap-2" aria-label="Campaign lists">
        {([["open", `Open now · ${db.campaigns.filter((c) => effectiveStatus(c) === "live").length}`], ["funded", `Funded · ${funded.length}`]] as const).map(([v, label]) => (
          <button key={v} type="button" onClick={() => setParams(v === "open" ? {} : { view: v })} aria-current={view === v ? "page" : undefined}
            className={`rounded-full border px-4 py-1.5 text-sm font-semibold ${view === v ? "border-brand-600 bg-brand-600 text-white" : "border-slate-300 bg-white text-slate-700 hover:border-brand-500"}`}>
            {label}
          </button>
        ))}
      </nav>

      {view === "funded" ? (
        funded.length === 0 ? <Empty>No campaigns have been funded yet.</Empty> : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {funded.map((c) => {
              const k = compliance(db.obligations.filter((o) => o.campaignId === c.id), db.settings.dueSoonDays);
              return (
                <div key={c.id} className="space-y-2">
                  <CampaignCard campaign={c} />
                  <Link to={`/campaigns/${c.id}?tab=progress`} className={`block rounded-lg px-3 py-2 text-sm font-medium ${k.overdue ? "bg-red-50 text-red-800" : "bg-green-50 text-green-800"}`}>
                    {k.due ? `${k.done} of ${k.due} commitments kept` : "Tracking started"}{k.overdue ? ` · ${k.overdue} overdue` : ""} · see progress →
                  </Link>
                </div>
              );
            })}
          </div>
        )
      ) : (<>
      <div className="card grid gap-3 md:grid-cols-4">
        <input className="input" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input" value={type} onChange={(e) => setType(e.target.value as CampaignType | "")}>
          <option value="">All types</option>
          {CAMPAIGN_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
        </select>
        <select className="input" value={sector} onChange={(e) => setSector(e.target.value)}>
          <option value="">All sectors</option>
          {db.settings.sectors.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select className="input" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
          {pref && <option value="match">Best match</option>}
          <option value="newest">Newest</option>
          <option value="ending">Ending soon</option>
          <option value="funded">Most funded</option>
        </select>
      </div>

      {rows.length === 0 ? (
        <Empty>No live campaigns match these filters.</Empty>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map(({ c, m }) => <CampaignCard key={c.id} campaign={c} match={m} />)}
        </div>
      )}
      </>)}
    </div>
  );
}
