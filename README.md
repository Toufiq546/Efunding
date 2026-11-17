# FundBridge: investor ↔ business crowdfunding

A React + Vite app on **Supabase** (Postgres + Auth) that matches **investors** with **businesses** raising money through crowdfunding.
Only admin-verified businesses can raise funds. Each campaign picks its own model: **equity**, **debt / lending** or **reward**.

## Set up

1. **Create a Supabase project** at [supabase.com](https://supabase.com).
2. **Create the database.** In the SQL editor, paste and run `supabase/migrations/20261116000000_init.sql`
   (or run `supabase link` and then `supabase db push` with the Supabase CLI).
3. **Configure Auth** (Authentication → URL Configuration):
   - Site URL: your app URL, e.g. `http://localhost:5173` while developing
   - Redirect URLs: add `http://localhost:5173/**` and your production URL plus `/**`
   - Keep **Confirm email** on (Authentication → Providers → Email). For real users, set up custom SMTP: the built-in mailer is rate-limited.
4. **Connect the app.** Copy `.env.example` to `.env` and fill in the Project URL and the anon / publishable key (Project Settings → API).
   Never put the `service_role` key in this file: it bypasses all security.
5. Run it:
   ```bash
   npm install
   npm run dev
   ```
6. **Make yourself an admin.** Sign up normally, confirm your email, then run this in the SQL editor:
   ```sql
   update public.user_roles set role = 'admin'
   where user_id = (select id from auth.users where email = 'you@example.com');
   ```
   Nobody can become an admin from the app; the sign-up trigger only creates investor or business accounts.

## Local preview (no Supabase project needed)

Runs a throwaway Supabase (database, auth, API) in Docker with demo data, plus the app with hot reload:

```bash
npm install
npm run local:db    # needs Docker; resets the local data each run
npm run dev:local   # http://localhost:5173
```

Demo logins (password `demo1234`): `investor@demo.com`, `business@demo.com`, `admin@demo.com`, `newbiz@demo.com`.
Sign-ups are confirmed instantly in this mode.

## What's in it

| Role | Can do |
|---|---|
| Business | Sign up → submit company profile (trade licence, TIN) for verification → create campaigns (equity %/valuation, interest/tenor, or reward tiers) → submit for review → answer investor questions, see pledges |
| Investor | Set preferences → see campaigns ranked by match score → ask questions → pledge (non-binding) → cancel pledges while the campaign is open |
| Admin | **Control panel** with tabs for every part of the platform: overview and review queue; businesses (verify, reject, revoke); campaigns (approve, reject, close); users (change roles); pledges (cancel); Q&A (remove); settings (sector and city lists, site announcement); and an activity log of every admin action, recorded by the database |

**Login:** email + password with email confirmation, forgot/reset password by email, and persistent sessions (Supabase Auth).

**Matching** (`src/lib/matching.ts`) gives each campaign a score out of 100: sector 35, deal type 20, ticket fit 20, risk 15, location 10.

## Security model (enforced in the database)

- Roles live in `public.user_roles`; clients cannot write it.
- Row-level security on every table: investors see only their own pledges and preferences, businesses only their own rows plus pledges on their campaigns, admins see everything. Drafts and pending campaigns are invisible to the public.
- Guard triggers stop a business from verifying itself or putting a campaign live, and send a verified business back for review if its name, trade licence or TIN changes. Pledges must be on live, open campaigns of verified businesses and at least the minimum amount.
- Admin decisions, pledge cancellation and answering questions go through `SECURITY DEFINER` functions that re-check the caller.
- Public pages read three views: `business_public` (no TIN), `campaign_stats` (totals only) and `question_threads` (asker name only, no email).

## Tests

```bash
npm test                                         # matching engine
PGHOST=... PGPORT=... PGUSER=postgres supabase/tests/run.sh   # schema + security tests on a throwaway local Postgres
```
`supabase/tests/supabase_stub.sql` imitates Supabase's `auth` schema so the security tests run on plain Postgres. Never run it against a real project.

## Limits and next steps

- **Pledges only:** no money moves. Real payments need a licensed escrow/payment partner.
- **Regulation:** equity and debt crowdfunding are regulated (in Bangladesh: BSEC Crowdfunding Rules 2022). Get legal advice before taking real investments.
- Data loads in one go after sign-in, which is fine for hundreds of campaigns; add server-side paging before it grows large.
- Next: document uploads for verification (Supabase Storage), email notifications, payments with escrow.
