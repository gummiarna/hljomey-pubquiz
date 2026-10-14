-- =====================================================================
--  Hljómey – vistuð þemu (Deezer-lagalistar, leitir og flytjendur)
--  Sameiginleg fyrir Pöbbkviss og Tónlistarbingó.
--  Keyrðu á eftir setup.sql: SQL Editor -> New query -> líma allt -> Run.
--  Notar sama PIN og leikirnir (host_pin í app_settings). Má keyra aftur.
-- =====================================================================

create table if not exists public.saved_themes (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null check (kind in ('search', 'playlist', 'artists', 'chart')),
  value        text not null check (char_length(value) between 1 and 500),
  name         text not null default '' check (char_length(name) <= 200),
  cover        text not null default '' check (char_length(cover) <= 500),
  track_count  int,
  use_count    int not null default 1,
  last_used    timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  unique (kind, value)
);

alter table public.saved_themes enable row level security;
drop policy if exists saved_themes_read on public.saved_themes;
create policy saved_themes_read on public.saved_themes for select using (true);
-- Engar aðrar reglur: aðeins hægt að vista og eyða með PIN (föllin hér fyrir neðan).

-- Vista þema, eða uppfæra það (og merkja sem nýlega notað) ef það er þegar til
create or replace function public.save_theme(
  p_pin text, p_kind text, p_value text, p_name text, p_cover text, p_count int)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if p_pin is distinct from (select value from app_settings where key = 'host_pin') then
    raise exception 'rangt_pin';
  end if;
  insert into saved_themes (kind, value, name, cover, track_count)
  values (p_kind, trim(p_value), left(coalesce(trim(p_name), ''), 200), left(coalesce(p_cover, ''), 500), p_count)
  on conflict (kind, value) do update
     set name        = coalesce(nullif(excluded.name, ''), saved_themes.name),
         cover       = coalesce(nullif(excluded.cover, ''), saved_themes.cover),
         track_count = coalesce(excluded.track_count, saved_themes.track_count),
         use_count   = saved_themes.use_count + 1,
         last_used   = now()
  returning id into v_id;
  return v_id;
end $$;

-- Endurnefna þema
create or replace function public.rename_theme(p_pin text, p_id uuid, p_name text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_pin is distinct from (select value from app_settings where key = 'host_pin') then
    raise exception 'rangt_pin';
  end if;
  update saved_themes set name = left(trim(coalesce(p_name, '')), 200) where id = p_id;
end $$;

create or replace function public.delete_theme(p_pin text, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_pin is distinct from (select value from app_settings where key = 'host_pin') then
    raise exception 'rangt_pin';
  end if;
  delete from saved_themes where id = p_id;
end $$;

-- ---------- Réttindi ----------
revoke all on public.saved_themes from anon, authenticated;
revoke all on function
  public.save_theme(text, text, text, text, text, int),
  public.rename_theme(text, uuid, text),
  public.delete_theme(text, uuid)
from public, anon, authenticated;

grant select on public.saved_themes to anon, authenticated;
grant execute on function
  public.save_theme(text, text, text, text, text, int),
  public.rename_theme(text, uuid, text),
  public.delete_theme(text, uuid)
to anon, authenticated;
