-- Security tests for the FundBridge schema. Run with: supabase/tests/run.sh
\set ON_ERROR_STOP 1
\set QUIET 1

-- Act as a user (or anon when uid is null) for the rest of the transaction.
create or replace function pg_temp.act_as(_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', case when _uid is null then 'anon' else 'authenticated' end, true);
  perform set_config('request.jwt.claim.sub', coalesce(_uid::text, ''), true);
end $$;

-- Run a statement as a user and require it to fail with a message matching _pattern.
create or replace function pg_temp.expect_fail(_uid uuid, _sql text, _pattern text) returns void language plpgsql as $$
declare
  _rows int;
begin
  begin
    perform pg_temp.act_as(_uid);
    execute _sql;
    get diagnostics _rows = row_count;
    perform set_config('role', 'postgres', true);
    if _rows = 0 and _pattern = 'NO ROWS' then
      return;  -- silently filtered by RLS, which counts as blocked
    end if;
    raise exception 'TEST FAILED (should have been blocked): %', _sql using errcode = 'P0099';
  exception
    when sqlstate 'P0099' then raise;
    when others then
      perform set_config('role', 'postgres', true);
      if sqlerrm !~* _pattern and _pattern <> 'NO ROWS' then
        raise exception 'TEST FAILED: % → unexpected error "%" (wanted /%/)', _sql, sqlerrm, _pattern;
      end if;
  end;
end $$;

create or replace function pg_temp.check(_cond boolean, _label text) returns void language plpgsql as $$
begin
  if not coalesce(_cond, false) then raise exception 'TEST FAILED: %', _label; end if;
  raise notice 'ok - %', _label;
end $$;

begin;

-- Users (the signup trigger creates profile + role)
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@x.com', '{"full_name":"Admin","role":"admin"}'),
  ('00000000-0000-0000-0000-0000000000b1', 'biz@x.com', '{"full_name":"Biz One","role":"business"}'),
  ('00000000-0000-0000-0000-0000000000b2', 'biz2@x.com', '{"full_name":"Biz Two","role":"business"}'),
  ('00000000-0000-0000-0000-0000000000c1', 'inv@x.com', '{"full_name":"Investor One","role":"investor"}'),
  ('00000000-0000-0000-0000-0000000000c2', 'inv2@x.com', '{"full_name":"Investor Two"}');

select pg_temp.check((select role from public.user_roles where user_id = '00000000-0000-0000-0000-00000000000a') = 'investor',
  'signup cannot self-assign admin (falls back to investor)');
select pg_temp.check((select count(*) from public.investor_prefs) = 3, 'investor prefs created for investors only');
update public.user_roles set role = 'admin' where user_id = '00000000-0000-0000-0000-00000000000a';  -- manual grant
delete from public.investor_prefs where user_id = '00000000-0000-0000-0000-00000000000a';

\set A '\'00000000-0000-0000-0000-00000000000a\''
\set B1 '\'00000000-0000-0000-0000-0000000000b1\''
\set B2 '\'00000000-0000-0000-0000-0000000000b2\''
\set I1 '\'00000000-0000-0000-0000-0000000000c1\''
\set I2 '\'00000000-0000-0000-0000-0000000000c2\''

-- Roles & profiles
select pg_temp.expect_fail(:I1, $$update public.user_roles set role = 'admin' where user_id = auth.uid()$$, 'permission denied');
select pg_temp.expect_fail(:I1, $$update public.profiles set email = 'x@y.com' where id = auth.uid()$$, 'permission denied');
select pg_temp.act_as(:I1);
update public.profiles set full_name = 'Investor Uno' where id = auth.uid();
select pg_temp.check((select count(*) from public.profiles) = 1, 'investor sees only own profile');
reset role;

-- Businesses
select pg_temp.expect_fail(:I1, $$insert into public.businesses (user_id, company_name, sector, location) values (auth.uid(), 'X', 'Tech', 'Dhaka')$$, 'row-level security');
select pg_temp.act_as(:B1);
insert into public.businesses (user_id, company_name, sector, location, trade_license_no, tin, verification)
values (auth.uid(), 'Biz One Ltd', 'Technology', 'Dhaka', 'TL-1', 'TIN-1', 'verified');
reset role;
select pg_temp.check((select verification from public.businesses where user_id = :B1) = 'unverified', 'owner cannot self-verify on insert');
select pg_temp.act_as(:B1);
update public.businesses set verification = 'verified' where user_id = auth.uid();
reset role;
select pg_temp.check((select verification from public.businesses where user_id = :B1) = 'unverified', 'owner cannot self-verify on update');
select pg_temp.act_as(:B1);
update public.businesses set verification = 'pending' where user_id = auth.uid();
insert into public.campaigns (business_id, title, summary, type, sector, location, goal, min_investment, deadline, equity_percent)
values (auth.uid(), 'Draft campaign', 'Summary', 'equity', 'Technology', 'Dhaka', 100000, 1000, current_date + 30, 10);
reset role;
select pg_temp.check((select verification from public.businesses where user_id = :B1) = 'pending', 'owner can submit for verification');

select pg_temp.expect_fail(:B1, $$update public.campaigns set status = 'pending'$$, 'must be verified');
select pg_temp.expect_fail(:B1, $$select public.admin_set_verification(auth.uid(), true)$$, 'Admins only');
select pg_temp.expect_fail(:A, $$select public.admin_set_verification('00000000-0000-0000-0000-0000000000b1', false)$$, 'reason is required');
select pg_temp.act_as(:A);
select public.admin_set_verification(:B1, true);
reset role;
select pg_temp.check((select verification from public.businesses where user_id = :B1) = 'verified', 'admin verifies business');

-- Campaigns
select pg_temp.expect_fail(:B1, $$update public.campaigns set status = 'live'$$, 'Only an admin');
select pg_temp.expect_fail(:B1, $$update public.campaigns set status = 'pending', equity_percent = null$$, 'equity percentage');

-- Project page while the campaign is a draft
select pg_temp.expect_fail(:B1, $$update public.campaigns set status = 'pending'$$, 'Fill in the project page');
select pg_temp.act_as(:B1);
insert into public.campaign_projects (campaign_id, story, team, fund_items, milestones, risks, return_plan, contact_name, declaration_name, accepted_commitments, declared_at)
select id, repeat('We make useful things. ', 4), '[{"name":"Biz One","role":"CEO","bio":""}]',
  '[{"item":"Machines","amount":60000},{"item":"Stock","amount":40000}]', '[{"when":"Month 3","what":"Machines installed"}]',
  '[{"risk":"Supplier delay","mitigation":"Two suppliers"}]', '{"dividend_policy":"20% of profit each year"}',
  'Biz One', 'Biz One', '{forged}', '2000-01-01'
from public.campaigns;
insert into public.campaign_financials (campaign_id, history, checked)
select id, '[{"year":2025,"revenue":500000,"costs":400000,"assets":300000,"liabilities":100000}]', true from public.campaigns;
insert into storage.objects (bucket_id, name) select 'campaign-docs', id || '/accounts.pdf' from public.campaigns;
insert into public.campaign_documents (campaign_id, kind, title, path, size_bytes, mime)
select id, 'accounts', 'Accounts 2025', id || '/accounts.pdf', 1000, 'application/pdf' from public.campaigns;
reset role;
select pg_temp.check((select declared_at > now() - interval '1 minute'
  and accepted_commitments = (select commitment_options from public.platform_settings) from public.campaign_projects),
  'declaration time and accepted commitments are set by the server');
select pg_temp.check((select not checked from public.campaign_financials), 'a business cannot mark its own accounts as checked');
-- Eligibility fixture: founding year and a licence document (accounts were uploaded above).
select pg_temp.act_as(:B1);
update public.businesses set founded_year = 2015 where user_id = auth.uid();
insert into storage.objects (bucket_id, name) select 'campaign-docs', id || '/licence.pdf' from public.campaigns;
insert into public.campaign_documents (campaign_id, kind, title, path, size_bytes, mime)
select id, 'licence', 'Trade licence', id || '/licence.pdf', 900, 'application/pdf' from public.campaigns;
reset role;
select pg_temp.check((select verification from public.businesses where user_id = :B1) = 'verified', 'editing the founding year keeps verification');
select id as cid from public.campaigns \gset
select pg_temp.expect_fail(:B2, format('insert into storage.objects (bucket_id, name) values (%L, %L)', 'campaign-docs', :'cid' || '/x.pdf'), 'row-level security');
select pg_temp.expect_fail(:B2, $$insert into storage.objects (bucket_id, name) values ('campaign-docs', 'not-a-uuid/x.pdf')$$, 'row-level security');
select pg_temp.expect_fail(:B2, $$update public.campaign_projects set story = 'hijacked'$$, 'NO ROWS');
select pg_temp.expect_fail(:I1, $$select public.campaign_submit_problems(id, goal, type) from public.campaigns$$, 'NO ROWS');
select pg_temp.expect_fail(:B1, $$update public.campaigns set status = 'pending'$$, 'at least 2 years');
select pg_temp.act_as(:B1);
update public.campaign_financials set history = history || '[{"year":2024,"revenue":400000,"costs":350000,"assets":250000,"liabilities":100000}]';
select pg_temp.check((select cardinality(public.campaign_submit_problems(id, goal, type)) = 0 from public.campaigns), 'complete project page has no problems');
reset role;
select pg_temp.act_as(:B1);
update public.campaigns set status = 'pending';
reset role;
select pg_temp.expect_fail(:B1, $$update public.campaigns set title = 'Edited while pending'$$, 'NO ROWS');
select pg_temp.expect_fail(:B2, $$insert into public.campaigns (business_id, title, summary, type, sector, location, goal, min_investment, deadline) values ('00000000-0000-0000-0000-0000000000b1', 'Spoof', 'x', 'reward', 'Tech', 'Dhaka', 10, 1, current_date + 5)$$, 'row-level security');
select pg_temp.act_as(null);
select pg_temp.check((select count(*) from public.campaigns) = 0, 'anon cannot see pending campaigns');
reset role;
select pg_temp.act_as(:I1);
select pg_temp.check((select count(*) from public.campaigns) = 0, 'investor cannot see pending campaigns');
reset role;
select pg_temp.expect_fail(:A, $$select public.admin_review_campaign((select id from public.campaigns limit 1), false)$$, 'reason is required');
select pg_temp.act_as(:A);
select public.admin_review_campaign((select id from public.campaigns limit 1), true);
reset role;
select pg_temp.act_as(null);
select pg_temp.check((select count(*) from public.campaigns where status = 'live') = 1, 'approved campaign is public');
select pg_temp.check((select count(*) from public.business_public) = 1, 'verified business appears in public view');
select pg_temp.expect_fail(null, $$select tin from public.business_public$$, 'column "tin" does not exist');
reset role;

-- Project page once live
select pg_temp.act_as(null);
select pg_temp.check((select count(*) from public.campaign_projects) = 1, 'anon reads the project page of a live campaign');
select pg_temp.check((select count(*) from public.campaign_financials) = 0 and (select count(*) from public.campaign_documents) = 0,
  'anon cannot read full accounts or documents');
select pg_temp.check((select years_reported = 2 and revenue_growth_pct = 25.0 and profit_margin_pct = 20.0 from public.campaign_financial_summary),
  'anon sees the accounts summary');
reset role;
select pg_temp.act_as(:I1);
select pg_temp.check((select count(*) from public.campaign_financials) = 1 and (select count(*) from public.campaign_documents) = 2
  and (select count(*) from storage.objects) = 2, 'logged-in investor reads accounts and documents of a live campaign');
reset role;
select pg_temp.expect_fail(:B1, $$update public.campaign_projects set story = 'changed after approval'$$, 'NO ROWS');
select pg_temp.expect_fail(:B1, $$delete from storage.objects$$, 'NO ROWS');
select pg_temp.expect_fail(:B1, $$update public.campaigns set goal = 1$$, 'NO ROWS');

-- Pledges
select pg_temp.expect_fail(:B2, $$insert into public.pledges (campaign_id, investor_id, amount) select id, auth.uid(), 5000 from public.campaigns$$, 'row-level security');
select pg_temp.expect_fail(:I1, $$insert into public.pledges (campaign_id, amount) select id, 10 from public.campaigns$$, 'minimum pledge');
select pg_temp.expect_fail(:I1, $$insert into public.pledges (campaign_id, investor_id, amount) select id, '00000000-0000-0000-0000-0000000000c2', 5000 from public.campaigns$$, 'row-level security');
select pg_temp.act_as(:I1);
insert into public.pledges (campaign_id, amount) select id, 5000 from public.campaigns;
reset role;
select pg_temp.act_as(:I2);
insert into public.pledges (campaign_id, amount) select id, 7000 from public.campaigns;
select pg_temp.check((select count(*) from public.pledges) = 1, 'investor sees only own pledges');
select pg_temp.check((select raised from public.campaign_stats) = 12000 and (select backers from public.campaign_stats) = 2, 'campaign_stats totals all pledges');
reset role;
select pg_temp.expect_fail(:I1, $$update public.pledges set amount = 1$$, 'permission denied');
select pg_temp.expect_fail(:I1, $$select public.cancel_pledge((select id from public.pledges where investor_id = '00000000-0000-0000-0000-0000000000c2'))$$, 'cannot be cancelled');
select pg_temp.act_as(:B1);
select pg_temp.check((select count(*) from public.pledges) = 2, 'business sees pledges on its campaign');
reset role;
select pg_temp.act_as(:I2);
select public.cancel_pledge((select id from public.pledges limit 1));
select pg_temp.check((select raised from public.campaign_stats) = 5000, 'cancelled pledge leaves totals');
reset role;

-- Questions
select pg_temp.expect_fail(:B2, $$insert into public.questions (campaign_id, body) select id, 'Hi' from public.campaigns$$, 'row-level security');
select pg_temp.act_as(:I1);
insert into public.questions (campaign_id, body, answer) select id, '  Is it secured?  ', 'fake answer' from public.campaigns;
reset role;
select pg_temp.check((select answer is null and body = 'Is it secured?' from public.questions), 'investor cannot pre-fill an answer');
select pg_temp.expect_fail(:B2, $$select public.answer_question((select id from public.questions limit 1), 'nope')$$, 'Only the business');
select pg_temp.expect_fail(:I1, $$update public.questions set answer = 'x'$$, 'permission denied');
select pg_temp.act_as(:B1);
select public.answer_question((select id from public.questions limit 1), 'Yes, by equipment.');
reset role;
select pg_temp.act_as(null);
select pg_temp.check((select answer from public.question_threads) = 'Yes, by equipment.'
  and (select asker_name from public.question_threads) = 'Investor Uno', 'anon reads Q&A with asker names');
select pg_temp.check((select count(*) from public.profiles) = 0, 'anon cannot read profiles (emails)');
reset role;

-- Changing legal identity after verification triggers re-review
select pg_temp.act_as(:B1);
update public.businesses set tin = 'TIN-CHANGED' where user_id = auth.uid();
reset role;
select pg_temp.check((select verification from public.businesses where user_id = :B1) = 'pending', 'editing TIN after verification resets to pending');

-- Admin sees everything
select pg_temp.act_as(:A);
select pg_temp.check((select count(*) from public.profiles) = 5 and (select count(*) from public.user_roles) = 5, 'admin sees all profiles and roles');
reset role;

-- ───────── Admin control panel ─────────
select pg_temp.act_as(null);
select pg_temp.check((select cardinality(sectors) from public.platform_settings) = 10, 'anon reads platform settings');
reset role;
select pg_temp.expect_fail(null, $$update public.platform_settings set announcement = 'hacked'$$, 'permission denied');
select pg_temp.expect_fail(:I1, $$select public.admin_update_settings('{X}', '{Y}', 'hi')$$, 'Admins only');
select pg_temp.expect_fail(:B1, $$select public.admin_set_role(auth.uid(), 'admin')$$, 'Admins only');
select pg_temp.expect_fail(:I1, $$select public.admin_close_campaign((select id from public.campaigns limit 1), 'x')$$, 'Admins only');
select pg_temp.expect_fail(:I1, $$select public.admin_log('x', 'y', 'z')$$, 'permission denied');
select pg_temp.expect_fail(:A, $$select public.admin_set_role(auth.uid(), 'investor')$$, 'own role');
select pg_temp.expect_fail(:A, $$select public.admin_update_settings('{}', '{Dhaka}', '')$$, 'at least one');

select pg_temp.act_as(:A);
select public.admin_update_settings(array['Fintech', ' fintech ', 'Agriculture', ''], array['Dhaka'], '  Maintenance on Friday  ');
select pg_temp.check((select sectors = array['Agriculture', 'Fintech'] and announcement = 'Maintenance on Friday' from public.platform_settings),
  'settings are trimmed and de-duplicated');
select public.admin_set_role(:I2, 'business');
select public.admin_cancel_pledge((select id from public.pledges where status = 'active' limit 1), 'Duplicate pledge');
select public.admin_delete_question((select id from public.questions limit 1), 'Spam');
select public.admin_close_campaign((select id from public.campaigns where status = 'live' limit 1), 'Business asked to stop');
select pg_temp.check((select count(*) from public.admin_audit) = 7, 'every admin action is in the activity log');
select pg_temp.expect_fail(:B1, $$select public.admin_check_financials((select id from public.campaigns limit 1), true, 'ok')$$, 'Admins only');
select pg_temp.expect_fail(:A, $$select public.admin_update_project_settings('{}', 'quarterly', 2)$$, 'at least one');
select public.admin_check_financials((select id from public.campaigns limit 1), true, 'Matches the audited statements');
select public.admin_update_project_settings(array['Report every month'], 'monthly', 3);
select pg_temp.check((select count(*) from public.admin_audit) = 9, 'checking accounts and project settings are logged');
reset role;
select pg_temp.check((select checked and checked_by = :A from public.campaign_financials), 'admin marked the accounts as checked');
select pg_temp.check((select min_account_years = 3 and min_reporting = 'monthly' from public.platform_settings), 'admin changed project settings');
select pg_temp.check((select role from public.user_roles where user_id = :I2) = 'business', 'admin changed a role');
select pg_temp.check((select count(*) from public.questions) = 0, 'admin removed a question');
select pg_temp.check((select status from public.campaigns limit 1) = 'closed', 'admin closed a live campaign');
select pg_temp.expect_fail(:I1, $$insert into public.pledges (campaign_id, amount) select id, 5000 from public.campaigns$$, 'not accepting');
select pg_temp.act_as(:I1);
select pg_temp.check((select count(*) from public.admin_audit) = 0, 'non-admins cannot read the activity log');
reset role;

-- ───────── Commitment tracking after funding ─────────
select pg_temp.expect_fail(:A, $$select public.admin_mark_funded((select id from public.campaigns limit 1))$$, 'Not fully funded');
-- Fixture: top the campaign up to its goal (bypassing the live-only pledge guard; the admin closed it earlier).
alter table public.pledges disable trigger pledges_guard;
insert into public.pledges (campaign_id, investor_id, amount, status)
select id, :I1, goal, 'active' from public.campaigns;
alter table public.pledges enable trigger pledges_guard;
select pg_temp.expect_fail(:B1, $$select public.admin_mark_funded((select id from public.campaigns limit 1))$$, 'Admins only');
select pg_temp.act_as(:A);
select pg_temp.check(public.admin_mark_funded((select id from public.campaigns limit 1), '2026-01-15') = 11,
  'funding generates 8 quarterly updates, 2 yearly accounts and 1 milestone');
reset role;
select pg_temp.check((select funded_on = '2026-01-15' and status = 'closed' from public.campaigns), 'campaign is closed and dated as funded');
select pg_temp.check((select min(due_on) = '2026-04-15' from public.obligations where kind = 'update'), 'first quarterly update is due 3 months after funding');
select pg_temp.check((select due_on = '2026-04-15' from public.obligations where kind = 'milestone'), '"Month 3" milestone is dated');
select pg_temp.expect_fail(:A, $$select public.admin_mark_funded((select id from public.campaigns limit 1))$$, 'already marked');
select pg_temp.act_as(null);
select pg_temp.check((select count(*) from public.obligations) = 11, 'anyone can see the commitments and their status');
reset role;

select pg_temp.expect_fail(:B2, $$select public.post_campaign_update((select id from public.campaigns limit 1), null, 'Hi', 'Fake update')$$, 'Only the business');
select pg_temp.expect_fail(:B1, $$insert into public.campaign_updates (campaign_id, title, body) select id, 'x', 'y' from public.campaigns$$, 'permission denied');
select pg_temp.expect_fail(:B1, $$update public.obligations set status = 'done'$$, 'permission denied');
select pg_temp.act_as(:B1);
select public.post_campaign_update((select id from public.campaigns limit 1),
  (select id from public.obligations where kind = 'update' order by due_on limit 1), 'Q1 update', 'Machines installed, sales up.', null, 120000, 60000);
reset role;
select pg_temp.check((select count(*) from public.obligations where status = 'done') = 1, 'posting an update completes its commitment');
select pg_temp.expect_fail(:B1, $$select public.post_campaign_update((select id from public.campaigns limit 1), (select id from public.obligations where status = 'done'), 'Again', 'Twice')$$, 'already done');
select pg_temp.act_as(null);
select pg_temp.check((select count(*) from public.campaign_updates) = 0, 'visitors cannot read updates');
reset role;
select pg_temp.act_as(:I2);
select pg_temp.check((select count(*) from public.campaign_updates) = 0, 'non-backers cannot read updates');
reset role;
select pg_temp.act_as(:I1);
select pg_temp.check((select count(*) from public.campaign_updates) = 1, 'backers read updates');
reset role;

select pg_temp.expect_fail(:A, $$select public.admin_set_obligation((select id from public.obligations where status = 'open' order by due_on limit 1), 'waive', null, '')$$, 'reason is required');
select pg_temp.expect_fail(:I1, $$select public.admin_set_obligation((select id from public.obligations limit 1), 'waive', null, 'x')$$, 'Admins only');
select pg_temp.act_as(:A);
select public.admin_set_obligation((select id from public.obligations where status = 'open' order by due_on limit 1), 'reschedule', '2026-09-01', 'Flood in the area');
select public.admin_set_obligation((select id from public.obligations where kind = 'milestone'), 'waive', null, 'Milestone replaced');
select public.admin_remove_update((select id from public.campaign_updates limit 1), 'Contained personal data');
select pg_temp.check((select count(*) from public.admin_audit where action in ('campaign.funded', 'obligation.reschedule', 'obligation.waive', 'update.remove')) = 4,
  'tracking actions are logged');
reset role;
select pg_temp.check((select count(*) from public.obligations where status = 'done') = 0, 'removing an update reopens its commitment');
select pg_temp.check((select status = 'waived' and note = 'Milestone replaced' from public.obligations where kind = 'milestone'), 'admin waived a commitment with a reason');

-- ───────── User manual (admin edits) ─────────
select pg_temp.expect_fail(:B1, $$select public.admin_save_help_article('getting-started', 'everyone', 1, 'Hacked', '', 'x', '', false)$$, 'Admins only');
select pg_temp.expect_fail(null, $$insert into public.help_articles (slug, audience, title_en, body_en) values ('x1', 'everyone', 'x', 'y')$$, 'permission denied');
select pg_temp.act_as(:A);
select public.admin_save_help_article('getting-started', 'everyone', 1, 'Welcome', 'স্বাগতম', 'Edited text', 'সম্পাদিত লেখা', false);
select public.admin_save_help_article('admin-secret-steps', 'admin', 5, 'Admin only', '', 'Internal steps', '', false);
select public.admin_save_help_article('old-article', 'investor', 9, 'Old', '', 'Hidden now', '', true);
reset role;
select pg_temp.act_as(null);
select pg_temp.check((select count(*) from public.help_articles) = 1 and (select title_bn from public.help_articles) = 'স্বাগতম',
  'visitors read published articles, not admin-only or hidden ones');
reset role;
select pg_temp.act_as(:A);
select pg_temp.check((select count(*) from public.help_articles) = 3, 'admins read every article');
select pg_temp.expect_fail(:A, $$select public.admin_reset_help_article('getting-started', '')$$, 'reason is required');
select public.admin_reset_help_article('getting-started', 'Back to the original');
select pg_temp.check((select count(*) from public.admin_audit where action like 'help.%') = 4, 'manual edits are logged');
reset role;
select pg_temp.check((select count(*) from public.help_articles where slug = 'getting-started') = 0, 'reset removes the admin edit');

-- ───────── Eligibility to raise funds ─────────
select pg_temp.act_as(:B1);
insert into public.campaigns (business_id, title, summary, type, sector, location, goal, min_investment, deadline, equity_percent)
values (auth.uid(), 'Second campaign', 'Tiny goal', 'equity', 'Technology', 'Dhaka', 50, 10, current_date + 30, 5);
insert into public.campaign_projects (campaign_id, story) select id, 'x' from public.campaigns where title = 'Second campaign';
select pg_temp.check((select array_to_string(public.campaign_submit_problems(id, goal, type), ' | ') ~ 'goal must be between'
  and array_to_string(public.campaign_submit_problems(id, goal, type), ' | ') ~ 'type "licence"'
  and array_to_string(public.campaign_submit_problems(id, goal, type), ' | ') ~ 'overdue commitments'
  from public.campaigns where title = 'Second campaign'), 'goal range, required documents and overdue commitments are checked');
reset role;
select pg_temp.expect_fail(:B1, $$select public.admin_update_eligibility(0, 10, 100, 0, 3, '{}', false)$$, 'Admins only');
select pg_temp.expect_fail(:A, $$select public.admin_update_eligibility(0, 500, 100, 0, 3, '{}', false)$$, 'not more than the maximum');
select pg_temp.expect_fail(:A, $$select public.admin_update_eligibility(0, 10, 100, 0, 3, '{passport}', false)$$, 'Unknown document type');
select pg_temp.act_as(:A);
select public.admin_update_eligibility(0, 10, 1000, 0, 3, '{}', false);
reset role;
select pg_temp.act_as(:B1);
select pg_temp.check((select array_to_string(public.campaign_submit_problems(id, goal, type), ' | ') !~ 'Eligibility'
  from public.campaigns where title = 'Second campaign'), 'relaxed rules remove the eligibility problems');
select pg_temp.expect_fail(:B1, $$update public.campaigns set status = 'pending' where title = 'Second campaign'$$, 'must be verified');  -- its TIN changed earlier, so it's back in review
reset role;
select pg_temp.check((select count(*) from public.admin_audit where action = 'settings.eligibility') = 1, 'eligibility changes are logged');

rollback;
\echo 'ALL TESTS PASSED'
