# efunding (FundBridge)

Investor ↔ business crowdfunding app. React + Vite + Tailwind frontend, Supabase (Postgres + Auth) backend.
This project is built **only with Claude Code and GitHub**. It has no connection to Lovable.

## Working with the owner: live preview first

The owner describes changes in chat and watches them appear in a live preview beside the chat.

1. At the start of a session, if the preview is not already running, start it:
   - `npm install` if `node_modules` is missing.
   - **If `.env` exists** (the owner's PC, connected to their real Supabase project): run `npm run dev` in the background.
   - **Otherwise** (cloud sessions with Docker): run `npm run local:db` (local Supabase + migration + demo data, ~1 min),
     then `npm run dev:local` in the background.
   - The preview is http://localhost:5173. In VS Code, open it beside the chat with
     Command Palette → "Simple Browser: Show" → `http://localhost:5173`. In a cloud session, call `report_preview_port` with 5173.
2. Make changes; Vite hot-reloads them into the preview within a second or two. Keep the dev server running.
3. When a change is done, run `npx tsc -p .` and `npm test`, then commit and push to `main` with a short message describing what changed.

Demo logins for the local Docker backend only (password `demo1234`): `investor@demo.com`, `business@demo.com`, `admin@demo.com`, `newbiz@demo.com` (unverified business).
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
