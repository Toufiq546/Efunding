import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useStore } from "../lib/store";
import { ErrorNote, Spinner } from "../components/ui";

/** Landing page for the password-reset email link; Supabase signs the user in from the link first. */
export default function ResetPassword() {
  const { user, loading, updatePassword } = useStore();
  const nav = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (loading) return <Spinner />;
  if (!user) {
    return (
      <div className="card mx-auto max-w-md space-y-3 text-center">
        <h1 className="text-xl font-bold">This reset link is invalid or has expired</h1>
        <Link to="/forgot-password" className="btn-primary">Request a new link</Link>
      </div>
    );
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return setErr("Password must be at least 8 characters.");
    if (password !== confirm) return setErr("The passwords don't match.");
    setBusy(true);
    const error = await updatePassword(password);
    setBusy(false);
    if (error) setErr(error);
    else nav("/dashboard");
  };

  return (
    <form onSubmit={submit} className="card mx-auto max-w-md space-y-4">
      <h1 className="text-2xl font-bold">Choose a new password</h1>
      <ErrorNote>{err}</ErrorNote>
      <div><label className="label" htmlFor="pw">New password</label><input id="pw" className="input" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} /></div>
      <div><label className="label" htmlFor="pw2">Confirm password</label><input id="pw2" className="input" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} /></div>
      <button className="btn-primary w-full" disabled={busy}>{busy ? "Saving…" : "Save password"}</button>
    </form>
  );
}
