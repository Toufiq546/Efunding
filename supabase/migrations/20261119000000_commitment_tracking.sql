-- Commitment tracking after funding.
-- When an admin marks a fully funded campaign as funded, its promises become dated obligations:
-- progress updates (at the chosen frequency), yearly accounts, repayments (debt), "Month N" milestones and
-- reward delivery. The business fulfils an obligation by posting an update (post_campaign_update).
-- Obligations are public (accountability); update contents are for backers, the business and admins.

alter table public.campaigns add column funded_on date;

alter table public.platform_settings
  add column tracking_months int not null default 24 check (tracking_months between 3 and 120),
  add column due_soon_days int not null default 14 check (due_soon_days between 1 and 90),
  add column delivery_months int not null default 3 check (delivery_months between 1 and 24);

create table public.obligations (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  kind text not null check (kind in ('update', 'accounts', 'repayment', 'milestone', 'delivery')),
  title text not null check (char_length(title) between 1 and 300),
  due_on date not null,
  amount numeric(14, 2) check (amount is null or amount > 0),
  status text not null default 'open' check (status in ('open', 'done', 'waived')),
  completed_at timestamptz,
  update_id uuid,
  note text,                -- admin's reason for a reschedule or waiver
  created_at timestamptz not null default now()
);
create index obligations_campaign_idx on public.obligations (campaign_id, due_on);

create table public.campaign_updates (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  obligation_id uuid references public.obligations (id) on delete set null,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  body text not null check (char_length(btrim(body)) between 1 and 10000),
  amount numeric(14, 2) check (amount is null or amount >= 0),   -- repayment made
  sales numeric(14, 2) check (sales is null or sales >= 0),      -- sales in the period
  spent numeric(14, 2) check (spent is null or spent >= 0),      -- campaign money spent so far
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index campaign_updates_campaign_idx on public.campaign_updates (campaign_id, created_at desc);
alter table public.obligations add constraint obligations_update_fk
  foreign key (update_id) references public.campaign_updates (id) on delete set null;

-- ───────────────────────── Access ─────────────────────────
create or replace function public.is_backer(_campaign_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.pledges where campaign_id = _campaign_id and investor_id = auth.uid() and status = 'active');
$$;

alter table public.obligations enable row level security;
alter table public.campaign_updates enable row level security;

create policy obligations_select on public.obligations for select to anon, authenticated
  using (exists (select 1 from public.campaigns c where c.id = campaign_id));   -- campaign RLS applies
revoke insert, update, delete on public.obligations from anon, authenticated;

create policy campaign_updates_select on public.campaign_updates for select to authenticated
  using (
    public.has_role('admin') or public.is_backer(campaign_id)
    or exists (select 1 from public.campaigns c where c.id = campaign_id and c.business_id = auth.uid())
  );
revoke insert, update, delete on public.campaign_updates from anon, authenticated;

-- ───────────────────────── Business: post an update ─────────────────────────
create or replace function public.post_campaign_update(
  _campaign_id uuid, _obligation_id uuid, _title text, _body text,
  _amount numeric default null, _sales numeric default null, _spent numeric default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  _ob public.obligations;
  _id uuid;
begin
  if not exists (select 1 from public.campaigns where id = _campaign_id and business_id = auth.uid() and funded_on is not null) then
    raise exception 'Only the business behind a funded campaign can post updates' using errcode = '42501';
  end if;
  if _obligation_id is not null then
    select * into _ob from public.obligations where id = _obligation_id and campaign_id = _campaign_id for update;
    if not found then
      raise exception 'That commitment does not belong to this campaign' using errcode = '22023';
    end if;
    if _ob.status <> 'open' then
      raise exception 'That commitment is already %', _ob.status using errcode = '22023';
    end if;
    if _ob.kind = 'repayment' and coalesce(_amount, 0) <= 0 then
      raise exception 'Enter the amount repaid' using errcode = '22023';
    end if;
  end if;
  insert into public.campaign_updates (campaign_id, obligation_id, title, body, amount, sales, spent)
  values (_campaign_id, _obligation_id, btrim(_title), btrim(_body), _amount, _sales, _spent)
  returning id into _id;
  if _obligation_id is not null then
    update public.obligations set status = 'done', completed_at = now(), update_id = _id where id = _obligation_id;
  end if;
  return _id;
end $$;

-- ───────────────────────── Admin actions (logged) ─────────────────────────
-- Close a fully funded campaign and generate its obligations from the project page.
create or replace function public.admin_mark_funded(_campaign_id uuid, _funded_on date default current_date)
returns int language plpgsql security definer set search_path = '' as $$
declare
  c public.campaigns;
  p public.campaign_projects;
  s public.platform_settings;
  _raised numeric;
  _step int;
  _n int;
  _count int;
  _label text;
  r record;
begin
  if not public.has_role('admin') then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  select * into c from public.campaigns where id = _campaign_id for update;
  if not found then
    raise exception 'Campaign not found' using errcode = 'P0002';
  end if;
  if c.funded_on is not null then
    raise exception 'This campaign is already marked as funded' using errcode = '22023';
  end if;
  if c.status not in ('live', 'closed') then
    raise exception 'Only live or closed campaigns can be marked as funded' using errcode = '22023';
  end if;
  select coalesce(sum(amount), 0) into _raised from public.pledges where campaign_id = _campaign_id and status = 'active';
  if _raised < c.goal then
    raise exception 'Not fully funded: % pledged of a % goal', _raised, c.goal using errcode = '22023';
  end if;
  select * into s from public.platform_settings where id;
  select * into p from public.campaign_projects where campaign_id = _campaign_id;

  update public.campaigns set status = 'closed', funded_on = _funded_on where id = _campaign_id;

  -- Progress updates at the chosen frequency
  _step := case coalesce(p.reporting, 'quarterly') when 'monthly' then 1 when 'quarterly' then 3 else 6 end;
  _label := case coalesce(p.reporting, 'quarterly') when 'monthly' then 'Monthly' when 'quarterly' then 'Quarterly' else 'Half-yearly' end;
  for _n in 1 .. (s.tracking_months / _step) loop
    insert into public.obligations (campaign_id, kind, title, due_on)
    values (_campaign_id, 'update', format('%s progress update %s', _label, _n), _funded_on + make_interval(months => _n * _step));
  end loop;
  -- Yearly accounts
  for _n in 1 .. (s.tracking_months / 12) loop
    insert into public.obligations (campaign_id, kind, title, due_on)
    values (_campaign_id, 'accounts', format('Yearly accounts, year %s', _n), _funded_on + make_interval(months => _n * 12));
  end loop;
  -- Repayments (debt)
  if c.type = 'debt' and p.return_plan ? 'schedule' then
    _count := jsonb_array_length(p.return_plan -> 'schedule');
    for r in select x, n from jsonb_array_elements(p.return_plan -> 'schedule') with ordinality t(x, n) loop
      insert into public.obligations (campaign_id, kind, title, due_on, amount)
      values (_campaign_id, 'repayment', format('Repayment %s of %s', r.n, _count),
              _funded_on + make_interval(months => (r.x ->> 'month')::int), nullif((r.x ->> 'amount')::numeric, 0));
    end loop;
  end if;
  -- Milestones written as "Month N"
  if p.campaign_id is not null then
    for r in select x from jsonb_array_elements(p.milestones) t(x) where x ->> 'when' ~* '^\s*month\s+\d+' loop
      insert into public.obligations (campaign_id, kind, title, due_on)
      values (_campaign_id, 'milestone', left(coalesce(r.x ->> 'what', 'Milestone'), 300),
              _funded_on + make_interval(months => substring(r.x ->> 'when' from '(?i)month\s+(\d+)')::int));
    end loop;
  end if;
  -- Reward delivery
  if c.type = 'reward' then
    insert into public.obligations (campaign_id, kind, title, due_on)
    values (_campaign_id, 'delivery', 'Deliver rewards to backers', _funded_on + make_interval(months => s.delivery_months));
  end if;

  select count(*) into _count from public.obligations where campaign_id = _campaign_id;
  perform public.admin_log('campaign.funded', 'campaign', _campaign_id::text,
    format('Funded on %s with %s pledged; %s commitments to track', _funded_on, _raised, _count));
  return _count;
end $$;

-- Reschedule, waive or reopen an obligation. A reason is always required.
create or replace function public.admin_set_obligation(_obligation_id uuid, _action text, _due_on date, _reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  _ob public.obligations;
begin
  if not public.has_role('admin') then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  if coalesce(btrim(_reason), '') = '' then
    raise exception 'A reason is required' using errcode = '22023';
  end if;
  select * into _ob from public.obligations where id = _obligation_id for update;
  if not found then
    raise exception 'Commitment not found' using errcode = 'P0002';
  end if;
  if _action = 'reschedule' then
    if _due_on is null then raise exception 'Choose the new due date' using errcode = '22023'; end if;
    if _ob.status <> 'open' then raise exception 'Only open commitments can be rescheduled' using errcode = '22023'; end if;
    update public.obligations set due_on = _due_on, note = btrim(_reason) where id = _obligation_id;
  elsif _action = 'waive' then
    if _ob.status <> 'open' then raise exception 'Only open commitments can be waived' using errcode = '22023'; end if;
    update public.obligations set status = 'waived', note = btrim(_reason) where id = _obligation_id;
  elsif _action = 'reopen' then
    if _ob.status <> 'waived' then raise exception 'Only waived commitments can be reopened' using errcode = '22023'; end if;
    update public.obligations set status = 'open', note = btrim(_reason) where id = _obligation_id;
  else
    raise exception 'Unknown action %', _action using errcode = '22023';
  end if;
  perform public.admin_log('obligation.' || _action, 'obligation', _obligation_id::text,
    btrim(_reason) || case when _action = 'reschedule' then format(' (new due date %s)', _due_on) else '' end);
end $$;

-- Remove an improper update; the commitment it fulfilled becomes open again.
create or replace function public.admin_remove_update(_update_id uuid, _reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  _title text;
begin
  if not public.has_role('admin') then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  if coalesce(btrim(_reason), '') = '' then
    raise exception 'A reason is required' using errcode = '22023';
  end if;
  update public.obligations set status = 'open', completed_at = null, update_id = null where update_id = _update_id;
  delete from public.campaign_updates where id = _update_id returning title into _title;
  if _title is null then
    raise exception 'Update not found' using errcode = 'P0002';
  end if;
  perform public.admin_log('update.remove', 'update', _update_id::text, btrim(_reason) || ' | removed: ' || left(_title, 200));
end $$;

create or replace function public.admin_update_tracking_settings(_tracking_months int, _due_soon_days int, _delivery_months int)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_role('admin') then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  if _tracking_months not between 3 and 120 or _due_soon_days not between 1 and 90 or _delivery_months not between 1 and 24 then
    raise exception 'Tracking 3–120 months, warnings 1–90 days ahead, reward delivery 1–24 months' using errcode = '22023';
  end if;
  update public.platform_settings
     set tracking_months = _tracking_months, due_soon_days = _due_soon_days, delivery_months = _delivery_months,
         updated_at = now(), updated_by = auth.uid()
   where id;
  perform public.admin_log('settings.tracking', 'settings', 'platform',
    format('track %s months, warn %s days ahead, rewards due after %s months', _tracking_months, _due_soon_days, _delivery_months));
end $$;

revoke execute on function
  public.post_campaign_update(uuid, uuid, text, text, numeric, numeric, numeric),
  public.admin_mark_funded(uuid, date),
  public.admin_set_obligation(uuid, text, date, text),
  public.admin_remove_update(uuid, text),
  public.admin_update_tracking_settings(int, int, int)
from public, anon;
grant execute on function
  public.post_campaign_update(uuid, uuid, text, text, numeric, numeric, numeric),
  public.admin_mark_funded(uuid, date),
  public.admin_set_obligation(uuid, text, date, text),
  public.admin_remove_update(uuid, text),
  public.admin_update_tracking_settings(int, int, int)
to authenticated;
