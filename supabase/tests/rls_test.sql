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

rollback;
\echo 'ALL TESTS PASSED'
