export default function SetupNotice() {
  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-16">
      <h1 className="text-2xl font-bold">Connect FundBridge to Supabase</h1>
      <p className="text-slate-600">The app needs a Supabase project before it can run.</p>
      <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-700">
        <li>Create a project at supabase.com.</li>
        <li>In the SQL editor, run <code>supabase/migrations/20261116000000_init.sql</code>.</li>
        <li>Copy <code>.env.example</code> to <code>.env</code> and fill in the project URL and anon (publishable) key from Project Settings → API.</li>
        <li>Restart <code>npm run dev</code>.</li>
      </ol>
      <p className="text-sm text-slate-500">Full instructions are in the README.</p>
    </div>
  );
}
