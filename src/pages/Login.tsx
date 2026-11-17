import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useStore } from "../lib/store";
import { ErrorNote } from "../components/ui";
import { isDemo } from "../lib/mode";

const DEMO_ACCOUNTS = [
  ["Investor", "investor@demo.com"],
  ["Business", "business@demo.com"],
  ["Admin", "admin@demo.com"],
  ["Unverified business", "newbiz@demo.com"],
];

export default function Login() {
  const { signIn } = useStore();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const error = await signIn(email, password);
    setBusy(false);
    if (error) setErr(error);
    else nav("/dashboard");
  };

  return (
    <form onSubmit={submit} className="card mx-auto max-w-md space-y-4">
      <h1 className="text-2xl font-bold">Log in</h1>
      <ErrorNote>{err}</ErrorNote>
      <div><label className="label" htmlFor="email">Email</label><input id="email" className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
      <div>
        <div className="flex items-center justify-between">
          <label className="label" htmlFor="password">Password</label>
          <Link to="/forgot-password" className="mb-1 text-xs font-medium text-brand-700 hover:underline">Forgot password?</Link>
        </div>
        <input id="password" className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      <button className="btn-primary w-full" disabled={busy}>{busy ? "Logging in…" : "Log in"}</button>
      {isDemo && (
        <div className="space-y-2 border-t border-slate-100 pt-4">
          <p className="text-sm font-semibold">Try a demo account</p>
          <div className="flex flex-wrap gap-2">
            {DEMO_ACCOUNTS.map(([label, em]) => (
              <button key={em} type="button" className="btn-secondary" onClick={() => { setEmail(em); setPassword("demo1234"); }}>{label}</button>
            ))}
          </div>
        </div>
      )}
      <p className="text-center text-sm text-slate-600">No account? <Link to="/register" className="font-semibold text-brand-700">Sign up</Link></p>
    </form>
  );
}
