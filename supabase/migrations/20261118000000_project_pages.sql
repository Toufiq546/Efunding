-- Project pages: each campaign gets a full investment profile built by the business.
--   campaign_projects   business story, team, plan (use of funds, milestones, risks, return plan) and commitments.
--                       Public wherever the campaign is public.
--   campaign_financials past results and projections. Logged-in users only (plus owner/admin);
--                       everyone else sees campaign_financial_summary.
--   campaign_documents  uploaded supporting files (private storage bucket "campaign-docs"), logged-in users only.
-- A campaign can only be submitted for review once its project page is complete (campaign_submit_problems).

-- ───────────────────────── Settings for project pages ─────────────────────────
alter table public.platform_settings
  add column commitment_options text[] not null default array[
    'Use the money only for the items in our plan, and tell investors before any major change.',
    'Send investors progress updates at the frequency we chose, covering progress, spending and sales.',
    'Share our yearly accounts with investors within 6 months of the year end.',
    'Tell investors within 7 days about any major problem, such as a large loss, a legal issue or a serious delay.',
    'If the funding goal is not reached, all pledges are released and no one is charged.'],
  add column min_reporting text not null default 'quarterly' check (min_reporting in ('monthly', 'quarterly', 'half-yearly')),
  add column min_account_years int not null default 2 check (min_account_years between 0 and 5);

-- ───────────────────────── Tables ─────────────────────────
create table public.campaign_projects (
  campaign_id uuid primary key references public.campaigns (id) on delete cascade,
  -- Business
  story text not null default '' check (char_length(story) <= 10000),
  products text not null default '' check (char_length(products) <= 5000),
  highlights jsonb not null default '[]' check (jsonb_typeof(highlights) = 'array'),   -- ["14 supermarket clients", …]
  team jsonb not null default '[]' check (jsonb_typeof(team) = 'array'),               -- [{name, role, bio}]
  -- Plan
  fund_items jsonb not null default '[]' check (jsonb_typeof(fund_items) = 'array'),   -- [{item, amount}]
  milestones jsonb not null default '[]' check (jsonb_typeof(milestones) = 'array'),   -- [{when, what}]
  risks jsonb not null default '[]' check (jsonb_typeof(risks) = 'array'),             -- [{risk, mitigation}]
  return_plan jsonb not null default '{}' check (jsonb_typeof(return_plan) = 'object'),
    -- debt: {schedule: [{month, amount}]}; equity: {dividend_policy, exit_plan}; reward: {delivery}
  -- Commitments
  reporting text not null default 'quarterly' check (reporting in ('monthly', 'quarterly', 'half-yearly')),
  custom_commitments jsonb not null default '[]' check (jsonb_typeof(custom_commitments) = 'array'),
  contact_name text not null default '' check (char_length(contact_name) <= 120),
  contact_role text not null default '' check (char_length(contact_role) <= 120),
  declaration_name text not null default '' check (char_length(declaration_name) <= 120),
  declared_at timestamptz,                    -- set by the server
  accepted_commitments text[] not null default '{}', -- snapshot of the standard commitments at declaration, set by the server
  updated_at timestamptz not null default now()
);

create table public.campaign_financials (
  campaign_id uuid primary key references public.campaigns (id) on delete cascade,
  history jsonb not null default '[]' check (jsonb_typeof(history) = 'array'),
    -- [{year, revenue, costs, assets, liabilities}]  (profit and equity are derived)
  projections jsonb not null default '[]' check (jsonb_typeof(projections) = 'array'), -- [{year, revenue, profit}]
  notes text not null default '' check (char_length(notes) <= 5000),
  checked boolean not null default false,     -- "checked by admin", only via admin_check_financials()
  checked_at timestamptz,
  checked_by uuid references public.profiles (id) on delete set null,
  check_note text,
  updated_at timestamptz not null default now()
);

create table public.campaign_documents (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  kind text not null check (kind in ('accounts', 'bank', 'tax', 'licence', 'other')),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  path text not null unique,
  size_bytes int not null check (size_bytes between 1 and 10485760),
  mime text not null check (mime in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  created_at timestamptz not null default now(),
  constraint path_in_campaign_folder check (path like campaign_id::text || '/%')
);
create index campaign_documents_campaign_idx on public.campaign_documents (campaign_id);

create trigger campaign_projects_touch before update on public.campaign_projects for each row execute function public.touch_updated_at();
create trigger campaign_financials_touch before update on public.campaign_financials for each row execute function public.touch_updated_at();

-- ───────────────────────── Access helpers ─────────────────────────
-- The caller owns the campaign and may still edit it (draft or rejected).
create or replace function public.campaign_editable(_campaign_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.campaigns
     where id = _campaign_id and business_id = auth.uid() and status in ('draft', 'rejected'));
$$;

-- The caller may read a campaign's full accounts and documents: owner, admin, or any logged-in user once it is public.
create or replace function public.campaign_private_readable(_campaign_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.campaigns
     where id = _campaign_id
       and (business_id = auth.uid() or status in ('live', 'closed') or public.has_role('admin')));
$$;

-- Storage paths look like "<campaign id>/<file>"; a malformed path simply gets no access.
create or replace function public.campaign_doc_access(_path text, _write boolean)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  _cid uuid;
begin
  begin
    _cid := split_part(_path, '/', 1)::uuid;
  exception when others then
    return false;
  end;
  return case when _write then public.campaign_editable(_cid) else public.campaign_private_readable(_cid) end;
end $$;

-- ───────────────────────── Guards ─────────────────────────
-- Declaration time and the accepted standard commitments are recorded by the server, not the client.
create or replace function public.campaign_projects_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    new.campaign_id := old.campaign_id;
  end if;
  if btrim(new.declaration_name) = '' then
    new.declared_at := null;
    new.accepted_commitments := '{}';
  elsif tg_op = 'INSERT' or new.declaration_name is distinct from old.declaration_name or old.declared_at is null then
    new.declared_at := now();
    new.accepted_commitments := (select commitment_options from public.platform_settings where id);
  else
    new.declared_at := old.declared_at;
    new.accepted_commitments := old.accepted_commitments;
  end if;
  return new;
end $$;

create trigger campaign_projects_guard before insert or update on public.campaign_projects
  for each row execute function public.campaign_projects_guard();

-- Only admins can mark accounts as checked; any change by the business clears the check.
create or replace function public.campaign_financials_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if public.has_role('admin') then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    new.campaign_id := old.campaign_id;
  end if;
  new.checked := false;
  new.checked_at := null;
  new.checked_by := null;
  new.check_note := null;
  return new;
end $$;

create trigger campaign_financials_guard before insert or update on public.campaign_financials
  for each row execute function public.campaign_financials_guard();

-- What still stops a campaign from being submitted (empty array = ready). Mirrored in src/lib/project.ts.
create or replace function public.campaign_submit_problems(_campaign_id uuid, _goal numeric, _type public.campaign_type)
returns text[] language plpgsql stable security definer set search_path = '' as $$
declare
  p public.campaign_projects;
  f public.campaign_financials;
  s public.platform_settings;
  out text[] := '{}';
  _rank jsonb := '{"monthly": 1, "quarterly": 2, "half-yearly": 3}';
  _sum numeric;
begin
  select * into s from public.platform_settings where id;
  select * into p from public.campaign_projects where campaign_id = _campaign_id;
  if not found then
    return array['Fill in the project page (business, accounts, plan and commitments) before submitting'];
  end if;
  -- Only the campaign's owner (or an admin) gets an answer.
  if not exists (select 1 from public.campaigns c where c.id = _campaign_id and (c.business_id = auth.uid() or public.has_role('admin'))) then
    return '{}';
  end if;
  select * into f from public.campaign_financials where campaign_id = _campaign_id;

  if char_length(btrim(p.story)) < 50 then out := out || 'Business: describe your business in at least 50 characters'; end if;
  if jsonb_array_length(p.team) = 0 then out := out || 'Business: add at least one team member'; end if;

  if coalesce(jsonb_array_length(f.history), 0) < s.min_account_years then
    out := out || format('Accounts: add results for at least %s years', s.min_account_years);
  end if;

  select coalesce(sum((x ->> 'amount')::numeric), 0) into _sum from jsonb_array_elements(p.fund_items) x;
  if jsonb_array_length(p.fund_items) = 0 then out := out || 'Plan: list how you will use the money';
  elsif _sum <> _goal then out := out || format('Plan: use-of-funds items add up to %s but the goal is %s', _sum, _goal);
  end if;
  if jsonb_array_length(p.milestones) = 0 then out := out || 'Plan: add at least one milestone'; end if;
  if jsonb_array_length(p.risks) = 0 then out := out || 'Plan: add at least one risk and how you will handle it'; end if;
  if _type = 'debt' and coalesce(jsonb_array_length(p.return_plan -> 'schedule'), 0) = 0 then
    out := out || 'Plan: add a repayment schedule';
  elsif _type = 'equity' and btrim(coalesce(p.return_plan ->> 'dividend_policy', '') || coalesce(p.return_plan ->> 'exit_plan', '')) = '' then
    out := out || 'Plan: explain how equity investors get returns (dividends or exit)';
  elsif _type = 'reward' and btrim(coalesce(p.return_plan ->> 'delivery', '')) = '' then
    out := out || 'Plan: say when backers will receive their rewards';
  end if;

  if (_rank ->> p.reporting)::int > (_rank ->> s.min_reporting)::int then
    out := out || format('Commitments: send updates at least %s', s.min_reporting);
  end if;
  if btrim(p.contact_name) = '' then out := out || 'Commitments: name the person investors can contact'; end if;
  if p.declared_at is null then out := out || 'Commitments: accept the commitments declaration'; end if;
  return out;
end $$;

-- Campaign guard (from the initial migration) plus the project-page completeness check on submission.
create or replace function public.campaigns_guard()
returns trigger language plpgsql set search_path = '' as $$
declare
  _verified boolean;
  _problems text[];
begin
  if public.has_role('admin') then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    new.business_id := old.business_id;
    new.created_at := old.created_at;
  end if;

  if new.status not in ('draft', 'pending') then
    raise exception 'Only an admin can change a campaign to %', new.status using errcode = '42501';
  end if;
  new.rejection_reason := case when tg_op = 'UPDATE' and new.status = 'draft' then old.rejection_reason end;
  new.approved_at := null;

  if new.status = 'pending' then
    select verification = 'verified' into _verified from public.businesses where user_id = new.business_id;
    if not coalesce(_verified, false) then
      raise exception 'Your business must be verified before submitting a campaign' using errcode = '42501';
    end if;
    if new.deadline <= current_date then
      raise exception 'The deadline must be in the future' using errcode = '22023';
    end if;
    if new.type = 'equity' and new.equity_percent is null then
      raise exception 'Equity campaigns need the equity percentage offered' using errcode = '22023';
    elsif new.type = 'debt' and (new.interest_rate is null or new.tenor_months is null) then
      raise exception 'Debt campaigns need an interest rate and tenor' using errcode = '22023';
    elsif new.type = 'reward' and jsonb_array_length(new.rewards) = 0 then
      raise exception 'Reward campaigns need at least one reward tier' using errcode = '22023';
    end if;
    _problems := public.campaign_submit_problems(new.id, new.goal, new.type);
    if cardinality(_problems) > 0 then
      raise exception '%', _problems[1] using errcode = '22023';
    end if;
  end if;
  return new;
end $$;

-- ───────────────────────── Row-level security ─────────────────────────
alter table public.campaign_projects enable row level security;
alter table public.campaign_financials enable row level security;
alter table public.campaign_documents enable row level security;

create policy campaign_projects_select on public.campaign_projects for select to anon, authenticated
  using (exists (select 1 from public.campaigns c where c.id = campaign_id));   -- campaign RLS applies here
create policy campaign_projects_insert on public.campaign_projects for insert to authenticated
  with check (public.campaign_editable(campaign_id));
create policy campaign_projects_update on public.campaign_projects for update to authenticated
  using (public.campaign_editable(campaign_id)) with check (public.campaign_editable(campaign_id));
revoke delete on public.campaign_projects from anon, authenticated;

create policy campaign_financials_select on public.campaign_financials for select to authenticated
  using (public.campaign_private_readable(campaign_id));
create policy campaign_financials_insert on public.campaign_financials for insert to authenticated
  with check (public.campaign_editable(campaign_id));
create policy campaign_financials_update on public.campaign_financials for update to authenticated
  using (public.campaign_editable(campaign_id)) with check (public.campaign_editable(campaign_id));
revoke delete on public.campaign_financials from anon, authenticated;

create policy campaign_documents_select on public.campaign_documents for select to authenticated
  using (public.campaign_private_readable(campaign_id));
create policy campaign_documents_insert on public.campaign_documents for insert to authenticated
  with check (public.campaign_editable(campaign_id));
create policy campaign_documents_delete on public.campaign_documents for delete to authenticated
  using (public.campaign_editable(campaign_id));
revoke update on public.campaign_documents from anon, authenticated;

-- ───────────────────────── File storage ─────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('campaign-docs', 'campaign-docs', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy campaign_docs_read on storage.objects for select to authenticated
  using (bucket_id = 'campaign-docs' and public.campaign_doc_access(name, false));
create policy campaign_docs_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'campaign-docs' and public.campaign_doc_access(name, true));
create policy campaign_docs_delete on storage.objects for delete to authenticated
  using (bucket_id = 'campaign-docs' and public.campaign_doc_access(name, true));

-- ───────────────────────── Public accounts summary ─────────────────────────
-- Owner-rights view: exposes only headline figures, so visitors who aren't logged in see the trend, not the books.
create view public.campaign_financial_summary with (security_invoker = false) as
  select f.campaign_id,
         jsonb_array_length(f.history) as years_reported,
         f.checked,
         h.latest_year,
         case when h.prev_revenue > 0 then round((h.latest_revenue - h.prev_revenue) / h.prev_revenue * 100, 1) end as revenue_growth_pct,
         case when h.latest_revenue > 0 then round((h.latest_revenue - h.latest_costs) / h.latest_revenue * 100, 1) end as profit_margin_pct
    from public.campaign_financials f
    join public.campaigns c on c.id = f.campaign_id
    left join lateral (
      select (x ->> 'year')::int as latest_year,
             (x ->> 'revenue')::numeric as latest_revenue,
             (x ->> 'costs')::numeric as latest_costs,
             lead((x ->> 'revenue')::numeric) over (order by (x ->> 'year')::int desc) as prev_revenue
        from jsonb_array_elements(f.history) x
       order by (x ->> 'year')::int desc
       limit 1
    ) h on true
   where c.status in ('live', 'closed') or c.business_id = auth.uid() or public.has_role('admin');

revoke all on public.campaign_financial_summary from anon, authenticated;
grant select on public.campaign_financial_summary to anon, authenticated;

-- ───────────────────────── Admin actions (logged) ─────────────────────────
create or replace function public.admin_check_financials(_campaign_id uuid, _checked boolean, _note text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_role('admin') then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  update public.campaign_financials
     set checked = _checked,
         checked_at = case when _checked then now() end,
         checked_by = case when _checked then auth.uid() end,
         check_note = nullif(btrim(coalesce(_note, '')), '')
   where campaign_id = _campaign_id;
  if not found then
    raise exception 'This campaign has no accounts yet' using errcode = 'P0002';
  end if;
  perform public.admin_log(case when _checked then 'financials.check' else 'financials.uncheck' end, 'campaign', _campaign_id::text, _note);
end $$;

create or replace function public.admin_update_project_settings(_commitments text[], _min_reporting text, _min_account_years int)
returns void language plpgsql security definer set search_path = '' as $$
declare
  _c text[] := array(select btrim(x) from unnest(_commitments) with ordinality u(x, n) where btrim(x) <> '' order by n);
begin
  if not public.has_role('admin') then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  if cardinality(_c) = 0 then
    raise exception 'Keep at least one standard commitment' using errcode = '22023';
  end if;
  if _min_reporting not in ('monthly', 'quarterly', 'half-yearly') then
    raise exception 'Reporting must be monthly, quarterly or half-yearly' using errcode = '22023';
  end if;
  if _min_account_years not between 0 and 5 then
    raise exception 'Years of accounts must be between 0 and 5' using errcode = '22023';
  end if;
  update public.platform_settings
     set commitment_options = _c, min_reporting = _min_reporting, min_account_years = _min_account_years,
         updated_at = now(), updated_by = auth.uid()
   where id;
  perform public.admin_log('settings.project', 'settings', 'platform',
    format('%s commitments, updates at least %s, %s years of accounts', cardinality(_c), _min_reporting, _min_account_years));
end $$;

revoke execute on function
  public.campaign_submit_problems(uuid, numeric, public.campaign_type),
  public.admin_check_financials(uuid, boolean, text),
  public.admin_update_project_settings(text[], text, int)
from public, anon;
grant execute on function
  public.campaign_submit_problems(uuid, numeric, public.campaign_type),
  public.admin_check_financials(uuid, boolean, text),
  public.admin_update_project_settings(text[], text, int)
to authenticated;
revoke execute on function public.campaign_projects_guard(), public.campaign_financials_guard() from public, anon, authenticated;
