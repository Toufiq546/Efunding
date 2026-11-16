import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useStore } from "../lib/store";
import { ErrorNote } from "../components/ui";

export default function Register() {
  const { signUp } = useStore();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [role, setRole] = useState<"investor" | "business">(params.get("role") === "business" ? "business" : "investor");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return setErr("Password must be at least 8 characters.");
    setBusy(true);
    const { error, needsConfirmation } = await signUp({ name, email, password, role });
    setBusy(false);
    if (error) setErr(error);
    else if (needsConfirmation) setSentTo(email);
    else nav("/dashboard");
  };

  if (sentTo) {
    return (
      <div className="card mx-auto max-w-md space-y-3 text-center">
        <h1 className="text-2xl font-bold">Check your email</h1>
        <p className="text-sm text-slate-600">
          We sent a confirmation link to <b>{sentTo}</b>. Open it to activate your account, then log in.
        </p>
        <Link to="/login" className="btn-primary">Go to log in</Link>
      </div>
    );
  }

  const opt = (r: typeof role, title: string, desc: string) => (
    <button
      type="button"
      onClick={() => setRole(r)}
      aria-pressed={role === r}
      className={`rounded-xl border-2 p-4 text-left transition ${role === r ? "border-brand-600 bg-brand-50" : "border-slate-200 hover:border-slate-300"}`}
    >
      <p className="font-semibold">{title}</p>
      <p className="text-xs text-slate-600">{desc}</p>
    </button>
  );

  return (
    <form onSubmit={submit} className="card mx-auto max-w-md space-y-4">
      <h1 className="text-2xl font-bold">Create your account</h1>
      <div className="grid grid-cols-2 gap-3">
        {opt("investor", "Investor", "Find and back businesses")}
        {opt("business", "Business", "Raise funds for your company")}
      </div>
      <ErrorNote>{err}</ErrorNote>
      <div><label className="label" htmlFor="name">{role === "business" ? "Your name (founder / director)" : "Full name"}</label><input id="name" className="input" autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} /></div>
      <div><label className="label" htmlFor="email">Email</label><input id="email" className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
      <div><label className="label" htmlFor="password">Password (8+ characters)</label><input id="password" className="input" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} /></div>
      {role === "business" && (
        <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
          Only registered businesses can raise funds. Next you'll add your trade licence and TIN for verification.
        </p>
      )}
      <button className="btn-primary w-full" disabled={busy}>{busy ? "Creating account…" : "Create account"}</button>
      <p className="text-center text-sm text-slate-600">Have an account? <Link to="/login" className="font-semibold text-brand-700">Log in</Link></p>
    </form>
  );
}
