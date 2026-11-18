-- User manual: built-in bilingual articles ship with the app (src/lib/manual.ts). Admins can override any article
-- (same slug), hide it, or add new ones; those edits live here. Readers see built-in + overrides merged.

create table public.help_articles (
  slug text primary key check (slug ~ '^[a-z0-9-]{2,60}$'),
  audience text not null check (audience in ('everyone', 'investor', 'business', 'admin')),
  sort_order int not null default 100,
  title_en text not null check (char_length(btrim(title_en)) between 1 and 200),
  title_bn text not null default '' check (char_length(title_bn) <= 200),
  body_en text not null check (char_length(body_en) <= 20000),
  body_bn text not null default '' check (char_length(body_bn) <= 20000),
  hidden boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);

alter table public.help_articles enable row level security;
-- Visible articles are public; admin-audience articles and hidden overrides only to admins.
create policy help_articles_read on public.help_articles for select to anon, authenticated
  using ((not hidden and audience <> 'admin') or public.has_role('admin'));
revoke insert, update, delete on public.help_articles from anon, authenticated;

create or replace function public.admin_save_help_article(
  _slug text, _audience text, _sort_order int, _title_en text, _title_bn text, _body_en text, _body_bn text, _hidden boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  _existed boolean;
begin
  if not public.has_role('admin') then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  select true into _existed from public.help_articles where slug = _slug;
  insert into public.help_articles as h (slug, audience, sort_order, title_en, title_bn, body_en, body_bn, hidden, updated_by)
  values (_slug, _audience, _sort_order, btrim(_title_en), btrim(coalesce(_title_bn, '')), _body_en, coalesce(_body_bn, ''), _hidden, auth.uid())
  on conflict (slug) do update
     set audience = excluded.audience, sort_order = excluded.sort_order, title_en = excluded.title_en, title_bn = excluded.title_bn,
         body_en = excluded.body_en, body_bn = excluded.body_bn, hidden = excluded.hidden, updated_at = now(), updated_by = auth.uid();
  perform public.admin_log(case when _hidden then 'help.hide' when coalesce(_existed, false) then 'help.edit' else 'help.save' end,
    'help', _slug, btrim(_title_en));
end $$;

-- Remove an admin edit: a built-in article goes back to its original text; an admin-added article is deleted.
create or replace function public.admin_reset_help_article(_slug text, _reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_role('admin') then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  if coalesce(btrim(_reason), '') = '' then
    raise exception 'A reason is required' using errcode = '22023';
  end if;
  delete from public.help_articles where slug = _slug;
  if not found then
    raise exception 'This article has no admin changes to reset' using errcode = 'P0002';
  end if;
  perform public.admin_log('help.reset', 'help', _slug, btrim(_reason));
end $$;

revoke execute on function
  public.admin_save_help_article(text, text, int, text, text, text, text, boolean),
  public.admin_reset_help_article(text, text)
from public, anon;
grant execute on function
  public.admin_save_help_article(text, text, int, text, text, text, text, boolean),
  public.admin_reset_help_article(text, text)
to authenticated;
