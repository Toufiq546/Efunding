import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useStore } from "../lib/store";
import { isDemo } from "../lib/mode";
import { resetDemo } from "../lib/demo/demoStore";
import { ConfirmButton } from "./ui";

const navCls = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-3 py-2 text-sm font-medium ${isActive ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:text-slate-900"}`;
const mobileNavCls = ({ isActive }: { isActive: boolean }) =>
  `block rounded-lg px-3 py-3 text-base font-medium ${isActive ? "bg-brand-50 text-brand-700" : "text-slate-700 hover:bg-slate-50"}`;

export default function Layout() {
  const { user, signOut, db } = useStore();
  const nav = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  // Close the phone menu and go back to the top whenever the page changes.
  useEffect(() => {
    setMenuOpen(false);
    window.scrollTo?.(0, 0);
  }, [location.pathname]);

  const logout = async () => { setMenuOpen(false); await signOut(); nav("/"); };
  const links = (cls: typeof navCls) => (
    <>
      <NavLink to="/campaigns" className={cls}>Browse campaigns</NavLink>
      <NavLink to="/help" className={cls}>Help · সাহায্য</NavLink>
      {user && <NavLink to="/dashboard" className={cls}>{user.role === "admin" ? "Control panel" : "Dashboard"}</NavLink>}
    </>
  );

  return (
    <div className="flex min-h-screen flex-col">
      {isDemo && (
        <div className="bg-amber-100 text-amber-900">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2 text-xs">
            <span><b>Demo preview:</b> sample data in this browser. Demo password: <code>demo1234</code></span>
            <ConfirmButton label="Reset demo data" confirmLabel="Yes, reset" onConfirm={resetDemo} className="font-semibold underline" />
          </div>
        </div>
      )}
      {db.settings.announcement && (
        <div className="bg-brand-700 text-white" role="status">
          <p className="mx-auto max-w-6xl px-4 py-2 text-center text-sm">{db.settings.announcement}</p>
        </div>
      )}

      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-3">
          <Link to="/" className="mr-2 flex shrink-0 items-center gap-2 text-lg font-bold text-brand-700" aria-label="FundBridge home">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-sm text-white">FB</span>
            FundBridge
          </Link>

          {/* Desktop */}
          <nav className="hidden flex-1 items-center gap-1 md:flex" aria-label="Main">{links(navCls)}</nav>
          <div className="ml-auto hidden items-center gap-3 md:flex">
            {user ? (
              <>
                <span className="text-sm text-slate-600">{user.name} · <span className="capitalize">{user.role}</span></span>
                <button type="button" className="btn-secondary" onClick={logout}>Log out</button>
              </>
            ) : (
              <>
                <Link to="/login" className="btn-secondary">Log in</Link>
                <Link to="/register" className="btn-primary">Sign up</Link>
              </>
            )}
          </div>

          {/* Phone */}
          <div className="ml-auto flex items-center gap-2 md:hidden">
            {!user && <Link to="/register" className="btn-primary px-3">Sign up</Link>}
            <button type="button" className="grid h-10 w-10 place-items-center rounded-lg border border-slate-300 text-slate-700"
              aria-expanded={menuOpen} aria-controls="mobile-menu" aria-label={menuOpen ? "Close menu" : "Open menu"} onClick={() => setMenuOpen(!menuOpen)}>
              <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                {menuOpen ? <path d="M5 5l10 10M15 5L5 15" /> : <path d="M3 6h14M3 10h14M3 14h14" />}
              </svg>
            </button>
          </div>
        </div>
        {menuOpen && (
          <div id="mobile-menu" className="border-t border-slate-200 bg-white px-4 pb-4 pt-2 md:hidden">
            <nav className="space-y-1" aria-label="Main">{links(mobileNavCls)}</nav>
            <div className="mt-3 border-t border-slate-100 pt-3">
              {user ? (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-slate-600">{user.name} · <span className="capitalize">{user.role}</span></span>
                  <button type="button" className="btn-secondary" onClick={logout}>Log out</button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <Link to="/login" className="btn-secondary">Log in</Link>
                  <Link to="/register" className="btn-primary">Sign up</Link>
                </div>
              )}
            </div>
          </div>
        )}
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:py-8">
        <Outlet />
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 text-sm sm:grid-cols-2 md:grid-cols-4">
          <div className="space-y-2">
            <Link to="/" className="flex items-center gap-2 font-bold text-brand-700">
              <span className="grid h-7 w-7 place-items-center rounded-md bg-brand-600 text-xs text-white">FB</span>FundBridge
            </Link>
            <p className="text-slate-600">Crowdfunding for verified Bangladeshi businesses, with commitments investors can track.</p>
          </div>
          <FooterCol title="Invest" links={[["/campaigns", "Browse open campaigns"], ["/campaigns?view=funded", "Funded campaigns"], ["/register?role=investor", "Sign up as an investor"], ["/help?for=investor", "Investor guide"]]} />
          <FooterCol title="Raise funds" links={[["/register?role=business", "Sign up your business"], ["/help?article=business-verification", "How verification works"], ["/help?article=business-project-page", "Building a project page"], ["/help?for=business", "Business guide"]]} />
          <FooterCol title="Help · সাহায্য" links={[["/help", "User manual"], ["/help?article=what-is-fundbridge", "How FundBridge works"], ["/help?article=account-and-login", "Accounts and passwords"], [user ? "/dashboard" : "/login", user ? "Your dashboard" : "Log in"]]} />
        </div>
        <div className="border-t border-slate-100">
          <p className="mx-auto max-w-6xl px-4 py-4 text-xs text-slate-500">
            Pledges are non-binding statements of intent: no money is collected on this platform.
            Investing in private businesses carries risk, including loss of capital.
          </p>
        </div>
      </footer>
    </div>
  );
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div className="space-y-2">
      <p className="font-semibold text-slate-900">{title}</p>
      <ul className="space-y-1.5">
        {links.map(([to, label]) => <li key={to + label}><Link to={to} className="text-slate-600 hover:text-brand-700 hover:underline">{label}</Link></li>)}
      </ul>
    </div>
  );
}
