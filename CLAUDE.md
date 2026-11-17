# efunding (FundBridge)

Investor ↔ business crowdfunding app. React + Vite + Tailwind frontend, Supabase (Postgres + Auth) backend.
This project is built **only with Claude Code and GitHub**. It has no connection to Lovable.

## Working with the owner: live preview first

The owner describes changes in chat and watches them appear in a live preview beside the chat.

1. At the start of a session, if the preview is not already running, start it:
   ```bash
   npm ci            # if node_modules is missing
   npm run local:db  # local Supabase in Docker + migration + demo data (~1 min)
   npm run dev:local # Vite dev server on :5173 with hot reload (run in the background)
   ```
   Then call `report_preview_port` with port 5173 so the owner's app can show it.
2. Make changes; Vite hot-reloads them into the preview within a second or two. Keep the dev server running.
3. When a change is done, run `npx tsc -p .` and `npm test`, then commit and push to `main` with a short message describing what changed.

Demo logins (password `demo1234`): `investor@demo.com`, `business@demo.com`, `admin@demo.com`, `newbiz@demo.com` (unverified business).
The local backend is throwaway; `npm run local:db` resets it.

## Code layout

- `src/lib/store.tsx`: the only place that talks to Supabase. Pages call its named actions, which return an error message or null.
- `src/lib/matching.ts`: investor ↔ campaign match score (tests in `matching.test.ts`).
- `src/pages/*`: routes. `src/components/ui.tsx`: shared UI pieces.
- `supabase/migrations/`: schema. Add **new** migration files for schema changes; never edit one that has been applied.
- `supabase/tests/`: SQL security tests (`supabase/tests/run.sh` on a plain Postgres).

## Rules

- Security lives in the database (RLS, guard triggers, `SECURITY DEFINER` RPCs). UI checks only hide controls.
  Any new table gets RLS policies and, if it holds state transitions, a guard trigger or RPC; add tests to `supabase/tests/rls_test.sql`.
- Never expose `tin`, emails or individual pledges publicly; public pages read the `business_public`, `campaign_stats` and `question_threads` views.
- Only the anon/publishable key goes in the frontend. Never commit `.env` or a `service_role` key.
- Money: pledges are non-binding; no payment code without the owner's explicit decision.
