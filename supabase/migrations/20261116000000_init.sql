-- FundBridge initial schema.
-- Security model:
--   * Roles live in public.user_roles (one per user). Sign-up can only create investor/business;
--     admin is granted manually (see README).
--   * Row-level security on every table. Clients write only rows they own; state transitions that
--     matter (verification, campaign approval, pledge cancellation, answers) go through guard
--     triggers or SECURITY DEFINER functions that re-check the caller's role.
--   * Public read models (verified businesses, campaign totals, Q&A with asker names) are views that
--     expose only non-sensitive columns.

-- ───────────────────────── Types ─────────────────────────
create type public.app_role as enum ('investor', 'business', 'admin');
create type public.campaign_type as enum ('equity', 'debt', 'reward');
create type public.risk_level as enum ('low', 'medium', 'high');
create type public.verification_status as enum ('unverified', 'pending', 'verified', 'rejected');
create type public.campaign_status as enum ('draft', 'pending', 'live', 'rejected', 'closed');

-- ───────────────────────── Tables ─────────────────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '' check (char_length(full_name) <= 120),
  email text not null default '',
  created_at timestamptz not null default now()
);

create table public.user_roles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now()
);

create table public.businesses (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  company_name text not null check (char_length(company_name) between 1 and 200),
  sector text not null,
  location text not null,
  founded_year int check (founded_year between 1800 and 2100),
  trade_license_no text not null default '' check (char_length(trade_license_no) <= 100),
  tin text not null default '' check (char_length(tin) <= 50),
  website text not null default '' check (char_length(website) <= 300),
  description text not null default '' check (char_length(description) <= 5000),
  verification public.verification_status not null default 'unverified',
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.investor_prefs (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  sectors text[] not null default '{}',
  locations text[] not null default '{}',
  types public.campaign_type[] not null default '{}',
  min_ticket numeric(14, 2) not null default 5000 check (min_ticket >= 0),
  max_ticket numeric(14, 2) not null default 100000 check (max_ticket >= 0),
  risk public.risk_level not null default 'medium',
  updated_at timestamptz not null default now()
);

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (user_id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  summary text not null check (char_length(summary) between 1 and 300),
  pitch text not null default '' check (char_length(pitch) <= 20000),
  use_of_funds text not null default '' check (char_length(use_of_funds) <= 5000),
  type public.campaign_type not null,
  sector text not null,
  location text not null,
  risk public.risk_level not null default 'medium',
  goal numeric(14, 2) not null check (goal > 0),
  min_investment numeric(14, 2) not null check (min_investment > 0),
  deadline date not null,
  equity_percent numeric(5, 2) check (equity_percent is null or (equity_percent > 0 and equity_percent <= 100)),
  valuation numeric(16, 2) check (valuation is null or valuation > 0),
  interest_rate numeric(5, 2) check (interest_rate is null or interest_rate >= 0),
  tenor_months int check (tenor_months is null or tenor_months > 0),
  rewards jsonb not null default '[]' check (jsonb_typeof(rewards) = 'array'),
  status public.campaign_status not null default 'draft',
  rejection_reason text,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint min_le_goal check (min_investment <= goal)
);
create index campaigns_status_idx on public.campaigns (status);
create index campaigns_business_idx on public.campaigns (business_id);

create table public.pledges (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  investor_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  amount numeric(14, 2) not null check (amount > 0),
  status text not null default 'active' check (status in ('active', 'cancelled')),
  created_at timestamptz not null default now(),
  cancelled_at timestamptz
);
create index pledges_campaign_idx on public.pledges (campaign_id);
create index pledges_investor_idx on public.pledges (investor_id);

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  investor_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  answer text check (answer is null or char_length(answer) <= 5000),
  answered_at timestamptz,
  created_at timestamptz not null default now()
);
create index questions_campaign_idx on public.questions (campaign_id);

-- ───────────────────────── Helpers ─────────────────────────
create or replace function public.has_role(_role public.app_role)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.user_roles where user_id = auth.uid() and role = _role);
$$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger businesses_touch before update on public.businesses for each row execute function public.touch_updated_at();
create trigger campaigns_touch before update on public.campaigns for each row execute function public.touch_updated_at();
create trigger investor_prefs_touch before update on public.investor_prefs for each row execute function public.touch_updated_at();

-- New auth user → profile + role (+ default investor preferences). Admin can never be self-assigned.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  _role public.app_role := case when new.raw_user_meta_data ->> 'role' = 'business' then 'business' else 'investor' end;
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 120), coalesce(new.email, ''));
  insert into public.user_roles (user_id, role) values (new.id, _role);
  if _role = 'investor' then
    insert into public.investor_prefs (user_id) values (new.id);
  end if;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ───────────────────────── Guard triggers ─────────────────────────
-- Businesses: owners may only request review; verification decisions are admin-only.
create or replace function public.businesses_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if public.has_role('admin') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.verification not in ('unverified', 'pending') then
      new.verification := 'unverified';
    end if;
    new.rejection_reason := null;
    return new;
  end if;

  new.user_id := old.user_id;
  if new.verification = 'pending' and old.verification in ('unverified', 'rejected', 'pending') then
    new.rejection_reason := null;                -- (re)submission
  else
    new.verification := old.verification;
    new.rejection_reason := old.rejection_reason;
  end if;

  -- Changing legal identity after verification sends the business back for review.
  if old.verification = 'verified'
     and (new.company_name, new.trade_license_no, new.tin) is distinct from (old.company_name, old.trade_license_no, old.tin) then
    new.verification := 'pending';
  end if;
  return new;
end $$;

create trigger businesses_guard before insert or update on public.businesses
  for each row execute function public.businesses_guard();

-- Campaigns: owners can only save drafts or submit for review; going live is admin-only.
create or replace function public.campaigns_guard()
returns trigger language plpgsql set search_path = '' as $$
declare
  _verified boolean;
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
  end if;
  return new;
end $$;

create trigger campaigns_guard before insert or update on public.campaigns
  for each row execute function public.campaigns_guard();

-- Pledges: only on live, open campaigns of verified businesses, at or above the minimum.
-- SECURITY DEFINER: the investor cannot read public.businesses, but the check must see verification.
create or replace function public.pledges_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  c record;
begin
  select cp.status, cp.deadline, cp.min_investment, b.verification
    into c
    from public.campaigns cp join public.businesses b on b.user_id = cp.business_id
   where cp.id = new.campaign_id;

  if not found or c.status <> 'live' or c.deadline < current_date then
    raise exception 'This campaign is not accepting pledges' using errcode = '42501';
  end if;
  if c.verification <> 'verified' then
    raise exception 'This business is not verified' using errcode = '42501';
  end if;
  if new.amount < c.min_investment then
    raise exception 'The minimum pledge is %', c.min_investment using errcode = '22023';
  end if;
  new.status := 'active';
  new.cancelled_at := null;
  new.created_at := now();
  return new;
end $$;

create trigger pledges_guard before insert on public.pledges
  for each row execute function public.pledges_guard();

create or replace function public.questions_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.campaigns where id = new.campaign_id and status = 'live') then
    raise exception 'Questions can only be asked on live campaigns' using errcode = '42501';
  end if;
  new.body := btrim(new.body);
  new.answer := null;
  new.answered_at := null;
  new.created_at := now();
  return new;
end $$;

create trigger questions_guard before insert on public.questions
  for each row execute function public.questions_guard();

-- ───────────────────────── Row-level security ─────────────────────────
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.businesses enable row level security;
alter table public.investor_prefs enable row level security;
alter table public.campaigns enable row level security;
alter table public.pledges enable row level security;
alter table public.questions enable row level security;

-- profiles: own row, admins see all. Only the name is editable.
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.has_role('admin'));
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (full_name) on public.profiles to authenticated;

-- user_roles: read own (admins read all). No client writes at all.
create policy user_roles_select on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.has_role('admin'));
revoke insert, update, delete on public.user_roles from anon, authenticated;

-- businesses: owner + admin read the full row (incl. TIN); the public reads business_public.
create policy businesses_select on public.businesses for select to authenticated
  using (user_id = auth.uid() or public.has_role('admin'));
create policy businesses_insert on public.businesses for insert to authenticated
  with check (user_id = auth.uid() and public.has_role('business'));
create policy businesses_update on public.businesses for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- investor_prefs: owner only.
create policy investor_prefs_all on public.investor_prefs for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.has_role('investor'));

-- campaigns: public once live/closed; owners see their own; admins see everything.
create policy campaigns_select on public.campaigns for select to anon, authenticated
  using (status in ('live', 'closed') or business_id = auth.uid() or public.has_role('admin'));
create policy campaigns_insert on public.campaigns for insert to authenticated
  with check (business_id = auth.uid() and public.has_role('business'));
create policy campaigns_update on public.campaigns for update to authenticated
  using (business_id = auth.uid() and status in ('draft', 'rejected'))
  with check (business_id = auth.uid());
create policy campaigns_delete on public.campaigns for delete to authenticated
  using (business_id = auth.uid() and status = 'draft');

-- pledges: the investor, the campaign's business and admins can see a pledge. Insert only; cancel via RPC.
create policy pledges_select on public.pledges for select to authenticated
  using (
    investor_id = auth.uid()
    or public.has_role('admin')
    or exists (select 1 from public.campaigns c where c.id = campaign_id and c.business_id = auth.uid())
  );
create policy pledges_insert on public.pledges for insert to authenticated
  with check (investor_id = auth.uid() and public.has_role('investor'));
revoke update, delete on public.pledges from anon, authenticated;

-- questions: readable wherever the campaign is readable (campaign RLS applies in the subquery).
create policy questions_select on public.questions for select to anon, authenticated
  using (exists (select 1 from public.campaigns c where c.id = campaign_id));
create policy questions_insert on public.questions for insert to authenticated
  with check (investor_id = auth.uid() and public.has_role('investor'));
revoke update, delete on public.questions from anon, authenticated;

-- ───────────────────────── Public read models ─────────────────────────
-- These views run with the owner's rights (security_invoker = false) so they can expose a safe
-- subset of rows/columns that RLS would otherwise hide. Keep them column-minimal.
create view public.business_public with (security_invoker = false) as
  select user_id, company_name, sector, location, founded_year, trade_license_no, website, description, verification
    from public.businesses
   where verification = 'verified';

create view public.campaign_stats with (security_invoker = false) as
  select c.id as campaign_id,
         coalesce(sum(p.amount) filter (where p.status = 'active'), 0)::numeric(14, 2) as raised,
         count(distinct p.investor_id) filter (where p.status = 'active') as backers
    from public.campaigns c
    left join public.pledges p on p.campaign_id = c.id
   where c.status in ('live', 'closed') or c.business_id = auth.uid() or public.has_role('admin')
   group by c.id;

create view public.question_threads with (security_invoker = false) as
  select q.id, q.campaign_id, q.investor_id, pr.full_name as asker_name, q.body, q.answer, q.answered_at, q.created_at
    from public.questions q
    join public.campaigns c on c.id = q.campaign_id
    left join public.profiles pr on pr.id = q.investor_id
   where c.status in ('live', 'closed') or c.business_id = auth.uid() or public.has_role('admin');

revoke all on public.business_public, public.campaign_stats, public.question_threads from anon, authenticated;
grant select on public.business_public, public.campaign_stats, public.question_threads to anon, authenticated;

-- ───────────────────────── RPCs ─────────────────────────
create or replace function public.admin_set_verification(_user_id uuid, _approve boolean, _reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_role('admin') then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  if not _approve and coalesce(btrim(_reason), '') = '' then
    raise exception 'A rejection reason is required' using errcode = '22023';
  end if;
  update public.businesses
     set verification = case when _approve then 'verified' else 'rejected' end::public.verification_status,
         rejection_reason = case when _approve then null else btrim(_reason) end
   where user_id = _user_id;
  if not found then
    raise exception 'Business not found' using errcode = 'P0002';
  end if;
end $$;

create or replace function public.admin_review_campaign(_campaign_id uuid, _approve boolean, _reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  _status public.campaign_status;
  _verified boolean;
begin
  if not public.has_role('admin') then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  select c.status, b.verification = 'verified' into _status, _verified
    from public.campaigns c join public.businesses b on b.user_id = c.business_id
   where c.id = _campaign_id
   for update of c;
  if _status is null then
    raise exception 'Campaign not found' using errcode = 'P0002';
  end if;
  if _status <> 'pending' then
    raise exception 'Only campaigns pending review can be approved or rejected' using errcode = '22023';
  end if;
  if _approve and not _verified then
    raise exception 'The business must be verified first' using errcode = '22023';
  end if;
  if not _approve and coalesce(btrim(_reason), '') = '' then
    raise exception 'A rejection reason is required' using errcode = '22023';
  end if;
  update public.campaigns
     set status = case when _approve then 'live' else 'rejected' end::public.campaign_status,
         rejection_reason = case when _approve then null else btrim(_reason) end,
         approved_at = case when _approve then now() end
   where id = _campaign_id;
end $$;

create or replace function public.cancel_pledge(_pledge_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.pledges p
     set status = 'cancelled', cancelled_at = now()
    from public.campaigns c
   where p.id = _pledge_id
     and p.investor_id = auth.uid()
     and p.status = 'active'
     and c.id = p.campaign_id
     and c.status = 'live'
     and c.deadline >= current_date;
  if not found then
    raise exception 'This pledge cannot be cancelled' using errcode = '42501';
  end if;
end $$;

create or replace function public.answer_question(_question_id uuid, _answer text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(btrim(_answer), '') = '' then
    raise exception 'The answer cannot be empty' using errcode = '22023';
  end if;
  update public.questions q
     set answer = btrim(_answer), answered_at = now()
    from public.campaigns c
   where q.id = _question_id
     and c.id = q.campaign_id
     and c.business_id = auth.uid();
  if not found then
    raise exception 'Only the business that owns this campaign can answer' using errcode = '42501';
  end if;
end $$;

revoke execute on function
  public.admin_set_verification(uuid, boolean, text),
  public.admin_review_campaign(uuid, boolean, text),
  public.cancel_pledge(uuid),
  public.answer_question(uuid, text)
from public, anon;
grant execute on function
  public.admin_set_verification(uuid, boolean, text),
  public.admin_review_campaign(uuid, boolean, text),
  public.cancel_pledge(uuid),
  public.answer_question(uuid, text)
to authenticated;
revoke execute on function public.handle_new_user(), public.pledges_guard(), public.questions_guard(), public.businesses_guard(), public.campaigns_guard(), public.touch_updated_at() from public, anon, authenticated;
