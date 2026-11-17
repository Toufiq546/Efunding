import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useStore } from "../lib/store";
import { isDemo } from "../lib/mode";
import { resetDemo } from "../lib/demo/demoStore";
import { ConfirmButton } from "./ui";

const navCls = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-3 py-2 text-sm font-medium ${isActive ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:text-slate-900"}`;

export default function Layout() {
  const { user, signOut, db } = useStore();
  const nav = useNavigate();

  return (
    <div className="flex min-h-screen flex-col">
      {isDemo && (
        <div className="bg-amber-100 text-amber-900">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-2 text-xs">
            <span><b>Demo preview:</b> sample data that stays in this browser. Password for every demo account: <code>demo1234</code></span>
            <ConfirmButton label="Reset demo data" confirmLabel="Yes, reset" onConfirm={resetDemo} className="font-semibold underline" />
          </div>
        </div>
      )}
      {db.settings.announcement && (
        <div className="bg-brand-700 text-white" role="status">
          <p className="mx-auto max-w-6xl px-4 py-2 text-center text-sm">{db.settings.announcement}</p>
        </div>
      )}
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-4 py-3">
          <Link to="/" className="mr-4 flex items-center gap-2 text-lg font-bold text-brand-700">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-white">FB</span>
            FundBridge
          </Link>
          <nav className="flex flex-1 flex-wrap items-center gap-1">
            <NavLink to="/campaigns" className={navCls}>Browse campaigns</NavLink>
            {user && <NavLink to="/dashboard" className={navCls}>{user.role === "admin" ? "Control panel" : "Dashboard"}</NavLink>}
          </nav>
          {user ? (
            <div className="flex items-center gap-3 text-sm">
              <span className="hidden text-slate-600 sm:inline">
                {user.name} · <span className="capitalize">{user.role}</span>
              </span>
              <button className="btn-secondary" onClick={async () => { await signOut(); nav("/"); }}>Log out</button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Link to="/login" className="btn-secondary">Log in</Link>
              <Link to="/register" className="btn-primary">Sign up</Link>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <Outlet />
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <p>
            Pledges are non-binding statements of intent: no money is collected on this platform.
            Investing in private businesses carries risk, including loss of capital.
          </p>
        </div>
      </footer>
    </div>
  );
}
