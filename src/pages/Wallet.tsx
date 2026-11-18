import { Link, useSearchParams } from "react-router-dom";
import { useStore } from "../lib/store";
import { Empty, Stat, StatusBadge, TypeBadge } from "../components/ui";
import { HelpLink } from "../components/help/Markdown";
import { formatDate, formatMoney } from "../lib/format";
import { businessWallet, investorWallet, platformWallet, type WalletEntry } from "../lib/wallet";

/**
 * Wallet: each user's money record from their involvement. FundBridge holds no money; payments happen directly
 * between investors and businesses. Admins can open anyone's wallet with ?user=<id>.
 */
export default function Wallet() {
  const { db, user } = useStore();
  const [params] = useSearchParams();
  if (!user) return null;
  const viewingId = user.role === "admin" && params.get("user") ? params.get("user")! : user.id;
  const viewing = db.profiles.find((p) => p.id === viewingId);
  const role = db.roles.find((r) => r.userId === viewingId)?.role ?? user.role;
  const other = viewingId !== user.id;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          {other && <Link to="/admin?tab=wallets" className="text-sm text-brand-700">← All wallets</Link>}
          <h1 className="text-3xl font-bold">{other ? `${viewing?.name ?? "User"}'s wallet` : "Your wallet"}</h1>
          <p className="text-sm capitalize text-slate-500">{role} · money record</p>
        </div>
        <HelpLink article={role === "business" ? "business-wallet" : role === "admin" ? "admin-settings-and-manual" : "investor-wallet"}>How the wallet works</HelpLink>
      </div>
      <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
        This is a record, not a bank account. FundBridge doesn't hold money: payments happen directly between investors and businesses,
        and repayments appear here when the business records them.
      </p>
      {role === "investor" && <InvestorView userId={viewingId} />}
      {role === "business" && <BusinessView userId={viewingId} self={!other} />}
      {role === "admin" && <PlatformView />}
    </div>
  );
}

function Statement({ entries }: { entries: WalletEntry[] }) {
  if (entries.length === 0) return <Empty>Nothing yet. Activity appears here as it happens.</Empty>;
  return (
    <section className="card space-y-3">
      <h2 className="text-lg font-bold">Statement</h2>
      <ol className="divide-y divide-slate-100">
        {entries.map((e, i) => (
          <li key={i} className="flex items-center justify-between gap-3 py-2.5 text-sm">
            <div className="min-w-0">
              <p className="truncate font-medium">{e.label}</p>
              <p className="text-xs text-slate-500">{formatDate(e.date)}{e.direction === 0 ? " · commitment, no money moved" : ""}</p>
            </div>
            <span className={`shrink-0 font-semibold tabular-nums ${e.direction === 1 ? "text-green-700" : e.direction === -1 ? "text-slate-900" : "text-slate-500"}`}>
              {e.direction === 1 ? "+" : e.direction === -1 ? "−" : ""}{formatMoney(e.amount)}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function InvestorView({ userId }: { userId: string }) {
  const { db } = useStore();
  const w = investorWallet(db, userId);
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <Stat label="Pledged (campaigns open)" value={formatMoney(w.pledgedOpen)} />
        <Stat label="Invested (funded)" value={formatMoney(w.invested)} />
        <Stat label="Received back" value={<span className="text-green-700">{formatMoney(w.received)}</span>} />
        <Stat label="Still expected" value={formatMoney(w.expected)} />
      </div>
      <section className="space-y-3">
        <h2 className="text-lg font-bold">Your investments</h2>
        {w.positions.length === 0 ? <Empty>No pledges yet. <Link to="/campaigns" className="text-brand-700 underline">Browse campaigns</Link></Empty> : (
          <div className="card overflow-x-auto p-0">
            <table className="w-full min-w-[720px] text-sm tabular-nums">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>{["Campaign", "Amount", "Status", "What you hold", "Received", "Expected"].map((h) => <th key={h} className="px-3 py-2">{h}</th>)}</tr>
              </thead>
              <tbody>
                {w.positions.map((p) => (
                  <tr key={p.campaign.id} className="border-t border-slate-100 align-top">
                    <td className="px-3 py-3"><Link to={`/campaigns/${p.campaign.id}${p.state === "invested" ? "?tab=progress" : ""}`} className="font-semibold text-brand-700 hover:underline">{p.campaign.title}</Link><div className="mt-1"><TypeBadge type={p.campaign.type} /></div></td>
                    <td className="px-3 py-3 font-semibold">{formatMoney(p.amount)}</td>
                    <td className="px-3 py-3">{p.state === "invested" ? <span className="badge bg-green-100 text-green-800">Invested</span> : <StatusBadge status={p.state === "open" ? "live" : "closed"} />}</td>
                    <td className="px-3 py-3 text-xs text-slate-600">
                      {p.equityPercent != null ? `${p.equityPercent}% of the company${p.state === "open" ? " (if fully funded)" : ""}`
                        : p.reward ? `Reward: ${p.reward}`
                        : p.campaign.type === "debt" ? (p.state === "invested" ? `${Math.round(p.share * 1000) / 10}% of each repayment` : "Repayment share set when funded")
                        : "—"}
                    </td>
                    <td className="px-3 py-3 text-green-700">{p.received ? formatMoney(p.received) : "—"}</td>
                    <td className="px-3 py-3">{p.expected ? formatMoney(p.expected) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <Statement entries={w.entries} />
    </>
  );
}

function BusinessView({ userId, self }: { userId: string; self: boolean }) {
  const { db } = useStore();
  const w = businessWallet(db, userId);
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <Stat label="Pledged (campaigns open)" value={formatMoney(w.pledgedOpen)} />
        <Stat label="Raised (funded)" value={<span className="text-green-700">{formatMoney(w.raised)}</span>} />
        <Stat label="Repaid to investors" value={formatMoney(w.repaid)} />
        <Stat label="Still owed" value={formatMoney(w.owed)} />
      </div>
      {w.nextDue && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <span><b>Next repayment:</b> {formatMoney(w.nextDue.amount ?? 0)} for {w.nextDue.campaign.title}, due {formatDate(w.nextDue.dueOn)}.</span>
          {self && <Link to="/dashboard" className="btn-secondary">Record it when paid</Link>}
        </div>
      )}
      <section className="space-y-3">
        <h2 className="text-lg font-bold">By campaign</h2>
        {w.positions.length === 0 ? <Empty>No submitted campaigns yet.</Empty> : (
          <div className="card overflow-x-auto p-0">
            <table className="w-full min-w-[640px] text-sm tabular-nums">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>{["Campaign", "Pledged", "Raised", "Repaid", "Still owed", "Next due"].map((h) => <th key={h} className="px-3 py-2">{h}</th>)}</tr>
              </thead>
              <tbody>
                {w.positions.map((p) => (
                  <tr key={p.campaign.id} className="border-t border-slate-100 align-top">
                    <td className="px-3 py-3"><Link to={`/campaigns/${p.campaign.id}`} className="font-semibold text-brand-700 hover:underline">{p.campaign.title}</Link></td>
                    <td className="px-3 py-3">{formatMoney(p.pledged)}</td>
                    <td className="px-3 py-3 text-green-700">{p.raised ? formatMoney(p.raised) : "—"}</td>
                    <td className="px-3 py-3">{p.repaid ? formatMoney(p.repaid) : "—"}</td>
                    <td className="px-3 py-3">{p.owed ? formatMoney(p.owed) : "—"}</td>
                    <td className="px-3 py-3 text-xs">{p.nextDue ? <>{formatMoney(p.nextDue.amount ?? 0)}<br /><span className="text-slate-500">{formatDate(p.nextDue.dueOn)}</span></> : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <Statement entries={w.entries} />
    </>
  );
}

function PlatformView() {
  const { db } = useStore();
  const p = platformWallet(db);
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <Stat label="Pledged (campaigns open)" value={formatMoney(p.pledgedOpen)} />
        <Stat label={`Raised (${p.fundedCount} funded)`} value={formatMoney(p.raised)} />
        <Stat label="Repaid to investors" value={formatMoney(p.repaid)} />
        <Stat label="Still owed" value={formatMoney(p.owed)} />
      </div>
      {p.overdueRepayments > 0 && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800"><b>{formatMoney(p.overdueRepayments)}</b> in repayments is overdue.</p>}
      <Link to="/admin?tab=wallets" className="btn-primary">Open every user's wallet</Link>
    </>
  );
}
