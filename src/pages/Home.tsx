import { Link } from "react-router-dom";
import { useStore } from "../lib/store";
import { CampaignCard } from "../components/ui";
import { effectiveStatus, formatMoney, raisedFor } from "../lib/format";

export default function Home() {
  const { db, user } = useStore();
  const live = db.campaigns.filter((c) => effectiveStatus(c) === "live");
  const totalPledged = Object.values(db.stats).reduce((s, x) => s + x.raised, 0);
  const funded = db.campaigns.filter((c) => raisedFor(db, c.id) >= c.goal).length;

  return (
    <div className="space-y-16">
      <section className="grid items-center gap-10 md:grid-cols-2">
        <div className="space-y-5">
          <span className="badge bg-brand-100 text-brand-700">Crowdfunding for real businesses</span>
          <h1 className="text-4xl font-extrabold leading-tight tracking-tight md:text-5xl">
            Connecting growing businesses with the investors who fit them.
          </h1>
          <p className="text-lg text-slate-600">
            Verified businesses raise money through equity, loans or rewards. Investors set their preferences
            and get campaigns ranked by how well they match.
          </p>
          <div className="flex flex-wrap gap-3">
            {user ? (
              <Link to="/dashboard" className="btn-primary">Go to your dashboard</Link>
            ) : (
              <>
                <Link to="/register?role=investor" className="btn-primary">I want to invest</Link>
                <Link to="/register?role=business" className="btn-secondary">I want to raise funds</Link>
              </>
            )}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="card text-center"><p className="text-2xl font-bold text-brand-700">{live.length}</p><p className="text-xs text-slate-500">Live campaigns</p></div>
          <div className="card text-center"><p className="text-2xl font-bold text-brand-700">{formatMoney(totalPledged)}</p><p className="text-xs text-slate-500">Pledged</p></div>
          <div className="card text-center"><p className="text-2xl font-bold text-brand-700">{funded}</p><p className="text-xs text-slate-500">Fully funded</p></div>
        </div>
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <div className="card space-y-3">
          <h2 className="text-lg font-bold">For businesses</h2>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-600">
            <li>Register your company with its trade licence and TIN.</li>
            <li>Our team verifies the business.</li>
            <li>Create a campaign: pick equity, debt or reward, then set your goal and terms.</li>
            <li>After admin approval it goes live, and you answer investors' questions.</li>
          </ol>
        </div>
        <div className="card space-y-3">
          <h2 className="text-lg font-bold">For investors</h2>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-600">
            <li>Tell us your sectors, ticket size, risk appetite and preferred deal types.</li>
            <li>See verified campaigns ranked by match score, with the reasons behind each score.</li>
            <li>Ask the founders questions before you commit.</li>
            <li>Pledge an amount and track your portfolio.</li>
          </ol>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-end justify-between">
          <h2 className="text-2xl font-bold">Live campaigns</h2>
          <Link to="/campaigns" className="text-sm font-semibold text-brand-700 hover:underline">See all →</Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {live.slice(0, 3).map((c) => <CampaignCard key={c.id} campaign={c} />)}
        </div>
      </section>
    </div>
  );
}
