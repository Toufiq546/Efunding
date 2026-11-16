import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useStore } from "../lib/store";
import { ErrorNote } from "../components/ui";

export default function ForgotPassword() {
  const { requestPasswordReset } = useStore();
  const [email, setEmail] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const error = await requestPasswordReset(email);
    setBusy(false);
    if (error) setErr(error);
    else setSent(true);
  };

  return (
    <form onSubmit={submit} className="card mx-auto max-w-md space-y-4">
      <h1 className="text-2xl font-bold">Reset your password</h1>
      {sent ? (
        <p className="rounded-lg bg-brand-50 p-3 text-sm text-brand-700">
          If an account exists for {email}, a reset link is on its way. Open it in this browser.
        </p>
      ) : (
        <>
          <ErrorNote>{err}</ErrorNote>
          <div><label className="label" htmlFor="email">Email</label><input id="email" className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <button className="btn-primary w-full" disabled={busy}>{busy ? "Sending…" : "Send reset link"}</button>
        </>
      )}
      <p className="text-center text-sm"><Link to="/login" className="font-semibold text-brand-700">Back to log in</Link></p>
    </form>
  );
}
