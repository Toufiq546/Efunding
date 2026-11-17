-- Admin control panel: platform settings, an admin activity log, and audited management actions.
-- Every admin action is a SECURITY DEFINER function that re-checks the caller's role and writes admin_audit.

-- ───────────────────────── Platform settings (single row) ─────────────────────────
create table public.platform_settings (
  id boolean primary key default true check (id),
  sectors text[] not null default array[
    'Agriculture', 'Manufacturing', 'Retail & E-commerce', 'Technology', 'Food & Beverage',
    'Healthcare', 'Education', 'Renewable Energy', 'Logistics', 'Textiles & Garments'],
  locations text[] not null default array[
    'Dhaka', 'Chattogram', 'Khulna', 'Rajshahi', 'Sylhet', 'Barishal', 'Rangpur', 'Mymensingh'],
  announcement text not null default '' check (char_length(announcement) <= 500),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);
insert into public.platform_settings default values;

alter table public.platform_settings enable row level security;
create policy platform_settings_read on public.platform_settings for select to anon, authenticated using (true);
revoke insert, update, delete on public.platform_settings from anon, authenticated;

-- ───────────────────────── Admin activity log ─────────────────────────
create table public.admin_audit (
  id bigint generated always as identity primary key,
  admin_id uuid references public.profiles (id) on delete set null,
  action text not null,
  target_type text not null,
  target_id text not null,
  detail text,
  created_at timestamptz not null default now()
);
create index admin_audit_created_idx on public.admin_audit (created_at desc);

alter table public.admin_audit enable row level security;
create policy admin_audit_read on public.admin_audit for select to authenticated using (public.has_role('admin'));
revoke insert, update, delete on public.admin_audit from anon, authenticated;

-- Shared guard + log helper for admin RPCs (not callable by clients).
create or replace function public.admin_log(_action text, _target_type text, _target_id text, _detail text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_role('admin') then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  insert into public.admin_audit (admin_id, action, target_type, target_id, detail)
  values (auth.uid(), _action, _target_type, _target_id, nullif(btrim(coalesce(_detail, '')), ''));
end $$;

-- ───────────────────────── Existing admin actions, now logged ─────────────────────────
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
  perform public.admin_log(case when _approve then 'business.verify' else 'business.reject' end, 'business', _user_id::text, _reason);
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
  perform public.admin_log(case when _approve then 'campaign.approve' else 'campaign.reject' end, 'campaign', _campaign_id::text, _reason);
end $$;

-- ───────────────────────── New admin actions ─────────────────────────
create or replace function public.admin_close_campaign(_campaign_id uuid, _reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_role('admin') then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  if coalesce(btrim(_reason), '') = '' then
    raise exception 'A reason is required to close a campaign' using errcode = '22023';
  end if;
  update public.campaigns set status = 'closed', rejection_reason = btrim(_reason)
   where id = _campaign_id and status = 'live';
  if not found then
    raise exception 'Only live campaigns can be closed' using errcode = '22023';
  end if;
  perform public.admin_log('campaign.close', 'campaign', _campaign_id::text, _reason);
end $$;

create or replace function public.admin_set_role(_user_id uuid, _role public.app_role)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_role('admin') then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  if _user_id = auth.uid() then
    raise exception 'You cannot change your own role' using errcode = '22023';
  end if;
  update public.user_roles set role = _role where user_id = _user_id;
  if not found then
    raise exception 'User not found' using errcode = 'P0002';
  end if;
  if _role = 'investor' then
    insert into public.investor_prefs (user_id) values (_user_id) on conflict (user_id) do nothing;
  end if;
  perform public.admin_log('user.set_role', 'user', _user_id::text, _role::text);
end $$;

create or replace function public.admin_cancel_pledge(_pledge_id uuid, _reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_role('admin') then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  if coalesce(btrim(_reason), '') = '' then
    raise exception 'A reason is required to cancel a pledge' using errcode = '22023';
  end if;
  update public.pledges set status = 'cancelled', cancelled_at = now()
   where id = _pledge_id and status = 'active';
  if not found then
    raise exception 'Only active pledges can be cancelled' using errcode = '22023';
  end if;
  perform public.admin_log('pledge.cancel', 'pledge', _pledge_id::text, _reason);
end $$;

create or replace function public.admin_delete_question(_question_id uuid, _reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  _body text;
begin
  if not public.has_role('admin') then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  delete from public.questions where id = _question_id returning body into _body;
  if _body is null then
    raise exception 'Question not found' using errcode = 'P0002';
  end if;
  perform public.admin_log('question.delete', 'question', _question_id::text,
    coalesce(nullif(btrim(_reason), ''), 'No reason given') || ' | removed text: ' || left(_body, 200));
end $$;

create or replace function public.admin_update_settings(_sectors text[], _locations text[], _announcement text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  -- Trim, drop blanks and case-insensitive duplicates (keeping the first spelling), sort A–Z.
  _s text[] := array(select distinct on (lower(btrim(x))) btrim(x) from unnest(_sectors) with ordinality u(x, n)
                     where btrim(x) <> '' order by lower(btrim(x)), n);
  _l text[] := array(select distinct on (lower(btrim(x))) btrim(x) from unnest(_locations) with ordinality u(x, n)
                     where btrim(x) <> '' order by lower(btrim(x)), n);
begin
  if not public.has_role('admin') then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  if cardinality(_s) = 0 or cardinality(_l) = 0 then
    raise exception 'Keep at least one sector and one location' using errcode = '22023';
  end if;
  update public.platform_settings
     set sectors = _s, locations = _l, announcement = btrim(coalesce(_announcement, '')),
         updated_at = now(), updated_by = auth.uid()
   where id;
  perform public.admin_log('settings.update', 'settings', 'platform',
    cardinality(_s) || ' sectors, ' || cardinality(_l) || ' locations, announcement ' ||
    case when btrim(coalesce(_announcement, '')) = '' then 'off' else 'on' end);
end $$;

revoke execute on function
  public.admin_log(text, text, text, text),
  public.admin_close_campaign(uuid, text),
  public.admin_set_role(uuid, public.app_role),
  public.admin_cancel_pledge(uuid, text),
  public.admin_delete_question(uuid, text),
  public.admin_update_settings(text[], text[], text)
from public, anon;
revoke execute on function public.admin_log(text, text, text, text) from authenticated;
grant execute on function
  public.admin_close_campaign(uuid, text),
  public.admin_set_role(uuid, public.app_role),
  public.admin_cancel_pledge(uuid, text),
  public.admin_delete_question(uuid, text),
  public.admin_update_settings(text[], text[], text)
to authenticated;
