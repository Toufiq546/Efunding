-- Eligibility criteria a business must meet to raise funds. All admin-tunable in platform_settings and checked on
-- submission by campaign_submit_problems() (mirrored in src/lib/project.ts eligibilityChecks()).

alter table public.platform_settings
  add column min_years_operating int not null default 1 check (min_years_operating between 0 and 20),
  add column min_goal numeric(14, 2) not null default 100000 check (min_goal > 0),
  add column max_goal numeric(14, 2) not null default 50000000 check (max_goal > 0),
  add column max_goal_to_revenue numeric(6, 2) not null default 2 check (max_goal_to_revenue >= 0),  -- 0 = no limit
  add column max_open_campaigns int not null default 2 check (max_open_campaigns between 1 and 10),
  add column required_doc_kinds text[] not null default array['licence', 'accounts'],
  add column block_if_overdue boolean not null default true,
  add constraint goal_range check (min_goal <= max_goal);

-- Same checks as before, plus the eligibility section.
create or replace function public.campaign_submit_problems(_campaign_id uuid, _goal numeric, _type public.campaign_type)
returns text[] language plpgsql stable security definer set search_path = '' as $$
declare
  p public.campaign_projects;
  f public.campaign_financials;
  s public.platform_settings;
  c public.campaigns;
  b public.businesses;
  out text[] := '{}';
  _rank jsonb := '{"monthly": 1, "quarterly": 2, "half-yearly": 3}';
  _sum numeric;
  _latest_revenue numeric;
  _open int;
  _kind text;
begin
  select * into s from public.platform_settings where id;
  select * into p from public.campaign_projects where campaign_id = _campaign_id;
  if not found then
    return array['Fill in the project page (business, accounts, plan and commitments) before submitting'];
  end if;
  -- Only the campaign's owner (or an admin) gets an answer.
  select * into c from public.campaigns where id = _campaign_id and (business_id = auth.uid() or public.has_role('admin'));
  if not found then
    return '{}';
  end if;
  select * into b from public.businesses where user_id = c.business_id;
  select * into f from public.campaign_financials where campaign_id = _campaign_id;

  -- Eligibility
  if b.founded_year is null or extract(year from current_date)::int - b.founded_year < s.min_years_operating then
    out := out || format('Eligibility: the business must have been operating for at least %s year(s)', s.min_years_operating);
  end if;
  if _goal < s.min_goal or _goal > s.max_goal then
    out := out || format('Eligibility: the goal must be between %s and %s', s.min_goal, s.max_goal);
  end if;
  if s.max_goal_to_revenue > 0 then
    select (x ->> 'revenue')::numeric into _latest_revenue
      from jsonb_array_elements(coalesce(f.history, '[]')) x order by (x ->> 'year')::int desc limit 1;
    if _latest_revenue is null or _goal > _latest_revenue * s.max_goal_to_revenue then
      out := out || format('Eligibility: the goal can be at most %s times last year''s sales', s.max_goal_to_revenue);
    end if;
  end if;
  select count(*) into _open from public.campaigns
   where business_id = c.business_id and id <> _campaign_id and status in ('pending', 'live') and funded_on is null;
  if _open >= s.max_open_campaigns then
    out := out || format('Eligibility: you can have at most %s campaign(s) open or in review at a time', s.max_open_campaigns);
  end if;
  foreach _kind in array s.required_doc_kinds loop
    if not exists (select 1 from public.campaign_documents where campaign_id = _campaign_id and kind = _kind) then
      out := out || format('Eligibility: upload a document of type "%s"', _kind);
    end if;
  end loop;
  if s.block_if_overdue and exists (
    select 1 from public.obligations o join public.campaigns oc on oc.id = o.campaign_id
     where oc.business_id = c.business_id and o.status = 'open' and o.due_on < current_date) then
    out := out || 'Eligibility: complete your overdue commitments on earlier campaigns first'::text;
  end if;

  -- Business
  if char_length(btrim(p.story)) < 50 then out := out || 'Business: describe your business in at least 50 characters'::text; end if;
  if jsonb_array_length(p.team) = 0 then out := out || 'Business: add at least one team member'::text; end if;

  -- Accounts
  if coalesce(jsonb_array_length(f.history), 0) < s.min_account_years then
    out := out || format('Accounts: add results for at least %s years', s.min_account_years);
  end if;

  -- Plan
  select coalesce(sum((x ->> 'amount')::numeric), 0) into _sum from jsonb_array_elements(p.fund_items) x;
  if jsonb_array_length(p.fund_items) = 0 then out := out || 'Plan: list how you will use the money'::text;
  elsif _sum <> _goal then out := out || format('Plan: use-of-funds items add up to %s but the goal is %s', _sum, _goal);
  end if;
  if jsonb_array_length(p.milestones) = 0 then out := out || 'Plan: add at least one milestone'::text; end if;
  if jsonb_array_length(p.risks) = 0 then out := out || 'Plan: add at least one risk and how you will handle it'::text; end if;
  if _type = 'debt' and coalesce(jsonb_array_length(p.return_plan -> 'schedule'), 0) = 0 then
    out := out || 'Plan: add a repayment schedule'::text;
  elsif _type = 'equity' and btrim(coalesce(p.return_plan ->> 'dividend_policy', '') || coalesce(p.return_plan ->> 'exit_plan', '')) = '' then
    out := out || 'Plan: explain how equity investors get returns (dividends or exit)'::text;
  elsif _type = 'reward' and btrim(coalesce(p.return_plan ->> 'delivery', '')) = '' then
    out := out || 'Plan: say when backers will receive their rewards'::text;
  end if;

  -- Commitments
  if (_rank ->> p.reporting)::int > (_rank ->> s.min_reporting)::int then
    out := out || format('Commitments: send updates at least %s', s.min_reporting);
  end if;
  if btrim(p.contact_name) = '' then out := out || 'Commitments: name the person investors can contact'::text; end if;
  if p.declared_at is null then out := out || 'Commitments: accept the commitments declaration'::text; end if;
  return out;
end $$;

create or replace function public.admin_update_eligibility(
  _min_years_operating int, _min_goal numeric, _max_goal numeric, _max_goal_to_revenue numeric,
  _max_open_campaigns int, _required_doc_kinds text[], _block_if_overdue boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_role('admin') then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  if _min_goal <= 0 or _max_goal < _min_goal then
    raise exception 'The minimum goal must be above zero and not more than the maximum' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(_required_doc_kinds) k where k not in ('accounts', 'bank', 'tax', 'licence', 'other')) then
    raise exception 'Unknown document type' using errcode = '22023';
  end if;
  update public.platform_settings
     set min_years_operating = _min_years_operating, min_goal = _min_goal, max_goal = _max_goal,
         max_goal_to_revenue = _max_goal_to_revenue, max_open_campaigns = _max_open_campaigns,
         required_doc_kinds = coalesce(_required_doc_kinds, '{}'), block_if_overdue = _block_if_overdue,
         updated_at = now(), updated_by = auth.uid()
   where id;
  perform public.admin_log('settings.eligibility', 'settings', 'platform',
    format('%s yr operating, goal %s–%s, ≤%s× sales, %s open, docs %s, overdue %s',
      _min_years_operating, _min_goal, _max_goal, _max_goal_to_revenue, _max_open_campaigns,
      array_to_string(_required_doc_kinds, '+'), case when _block_if_overdue then 'blocks' else 'allowed' end));
end $$;

revoke execute on function public.admin_update_eligibility(int, numeric, numeric, numeric, int, text[], boolean) from public, anon;
grant execute on function public.admin_update_eligibility(int, numeric, numeric, numeric, int, text[], boolean) to authenticated;
