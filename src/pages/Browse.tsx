import { useMemo, useState } from "react";
import { useStore } from "../lib/store";
import { CampaignCard, Empty } from "../components/ui";
import { CAMPAIGN_TYPES, SECTORS, type CampaignType } from "../lib/types";
import { TYPE_LABEL, daysLeft, effectiveStatus, raisedFor } from "../lib/format";
import { scoreMatch } from "../lib/matching";

type Sort = "match" | "newest" | "ending" | "funded";

export default function Browse() {
  const { db, user } = useStore();
  const pref = user?.role === "investor" ? db.investors.find((i) => i.userId === user.id) : undefined;
  const [q, setQ] = useState("");
  const [type, setType] = useState<CampaignType | "">("");
  const [sector, setSector] = useState("");
  const [sort, setSort] = useState<Sort>(pref ? "match" : "newest");

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

      <div className="card grid gap-3 md:grid-cols-4">
        <input className="input" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input" value={type} onChange={(e) => setType(e.target.value as CampaignType | "")}>
          <option value="">All types</option>
          {CAMPAIGN_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
        </select>
        <select className="input" value={sector} onChange={(e) => setSector(e.target.value)}>
          <option value="">All sectors</option>
          {SECTORS.map((s) => <option key={s}>{s}</option>)}
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
    </div>
  );
}
