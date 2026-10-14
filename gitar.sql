-- =====================================================================
--  Hljómey Gítarpartý – viðbót við Pöbbkvissið
--  Keyrðu á eftir setup.sql og bingo.sql: SQL Editor -> New query ->
--  líma allt -> Run.  Notar sama PIN og hin (host_pin í app_settings).
--  Má keyra aftur án skaða.
-- =====================================================================

-- ---------- Töflur ----------------------------------------------------

-- Söngbókin. Allir mega lesa; aðeins breytt með PIN (föll hér fyrir neðan).
create table if not exists public.gitar_songs (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(title) between 1 and 200),
  artist      text not null default '' check (char_length(artist) <= 200),
  body        text not null default '' check (char_length(body) <= 30000),
  song_key    text not null default '' check (char_length(song_key) <= 12),
  capo        smallint not null default 0 check (capo between 0 and 12),
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Flokkur: 'is' (íslenskt) eða 'erl' (erlent); tómt = greint sjálfkrafa út frá textanum
alter table public.gitar_songs add column if not exists lang text check (lang in ('is', 'erl'));

-- Partý í gangi: hvaða lag spilarinn er á. Allir mega lesa (símarnir).
create table if not exists public.gitar_sessions (
  code          text primary key,
  song_ids      uuid[] not null default '{}',
  current_song  uuid,
  transpose     smallint not null default 0,
  event_tag     text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Leyndarmál spilarans (aðgangslykill). Ekki lesanleg utan frá.
create table if not exists public.gitar_hosts (
  code        text primary key references public.gitar_sessions(code) on delete cascade,
  host_token  uuid not null default gen_random_uuid()
);

-- ---------- Aðgangsstýring (RLS) ------------------------------------

alter table public.gitar_songs    enable row level security;
alter table public.gitar_sessions enable row level security;
alter table public.gitar_hosts    enable row level security;

drop policy if exists gitar_songs_read    on public.gitar_songs;
drop policy if exists gitar_sessions_read on public.gitar_sessions;
create policy gitar_songs_read    on public.gitar_songs    for select using (true);
create policy gitar_sessions_read on public.gitar_sessions for select using (true);

-- ---------- Hjálparföll ---------------------------------------------

create or replace function public._gitar_pin_ok(p_pin text)
returns boolean language sql security definer set search_path = public as $$
  select p_pin is not distinct from (select value from app_settings where key = 'host_pin');
$$;

-- Er kóðinn í notkun í öðrum leik? (bingó er valfrjálst)
create or replace function public._code_taken(p_code text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v boolean := false;
begin
  if exists (select 1 from gitar_sessions where code = p_code) then return true; end if;
  if to_regclass('public.games') is not null then
    execute 'select exists(select 1 from public.games where code = $1 and created_at > now() - interval ''2 days'')'
      into v using p_code;
    if v then return true; end if;
  end if;
  if to_regclass('public.bingo_games') is not null then
    execute 'select exists(select 1 from public.bingo_games where code = $1 and created_at > now() - interval ''2 days'')'
      into v using p_code;
    if v then return true; end if;
  end if;
  return false;
end $$;

-- ---------- Söngbók (krefst PIN) ------------------------------------

create or replace function public.gitar_check(p_pin text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not _gitar_pin_ok(p_pin) then perform pg_sleep(0.5); return false; end if;
  return true;
end $$;

-- (eldri útgáfa án flokks fjarlægð svo aðeins ein útgáfa sé til)
drop function if exists public.gitar_save_song(text, uuid, text, text, text, text, int);

create or replace function public.gitar_save_song(
  p_pin text, p_id uuid, p_title text, p_artist text, p_body text, p_key text, p_capo int, p_lang text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_lang text := case when p_lang in ('is', 'erl') then p_lang else null end;
begin
  if not _gitar_pin_ok(p_pin) then raise exception 'rangt_pin'; end if;
  if length(trim(coalesce(p_title, ''))) < 1 then raise exception 'vantar_heiti'; end if;
  if p_id is null then
    insert into gitar_songs (title, artist, body, song_key, capo, lang, sort_order)
    values (trim(p_title), coalesce(trim(p_artist), ''), coalesce(p_body, ''), coalesce(trim(p_key), ''),
            greatest(0, least(12, coalesce(p_capo, 0))), v_lang,
            coalesce((select max(sort_order) + 1 from gitar_songs), 0))
    returning id into v_id;
  else
    update gitar_songs
       set title = trim(p_title), artist = coalesce(trim(p_artist), ''), body = coalesce(p_body, ''),
           song_key = coalesce(trim(p_key), ''), capo = greatest(0, least(12, coalesce(p_capo, 0))),
           lang = v_lang, updated_at = now()
     where id = p_id
    returning id into v_id;
  end if;
  return v_id;
end $$;

create or replace function public.gitar_delete_song(p_pin text, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not _gitar_pin_ok(p_pin) then raise exception 'rangt_pin'; end if;
  delete from gitar_songs where id = p_id;
end $$;

-- Raða söngbók: p_ids í réttri röð
create or replace function public.gitar_reorder(p_pin text, p_ids uuid[])
returns void language plpgsql security definer set search_path = public as $$
begin
  if not _gitar_pin_ok(p_pin) then raise exception 'rangt_pin'; end if;
  update gitar_songs s set sort_order = x.ord
    from unnest(p_ids) with ordinality as x(id, ord)
   where s.id = x.id;
end $$;

-- ---------- Partý ---------------------------------------------------

-- Byrja partý. Skilar {code, token}.
create or replace function public.gitar_start(p_song_ids uuid[], p_event_tag text default null)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_code text; v_token uuid;
  v_alphabet text := 'ABCDEFGHJKLMNPRSTUVXYZ';   -- sama og í hinum leikjunum
begin
  if coalesce(array_length(p_song_ids, 1), 0) = 0 then raise exception 'engin_log'; end if;
  delete from gitar_sessions where updated_at < now() - interval '3 days';
  loop
    v_code := '';
    for i in 1..4 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    end loop;
    exit when not _code_taken(v_code);
  end loop;
  insert into gitar_sessions (code, song_ids, current_song, event_tag)
  values (v_code, p_song_ids, p_song_ids[1], p_event_tag);
  insert into gitar_hosts (code) values (v_code) returning host_token into v_token;
  return json_build_object('code', v_code, 'token', v_token);
end $$;

-- Spilarinn skiptir um lag / tóntegund / lagalista
create or replace function public.gitar_set(
  p_code text, p_token uuid, p_song uuid, p_tr int, p_song_ids uuid[] default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from gitar_hosts where code = p_code and host_token = p_token) then
    raise exception 'ogildur_spilari';
  end if;
  update gitar_sessions
     set current_song = p_song,
         transpose    = greatest(-11, least(11, coalesce(p_tr, 0))),
         song_ids     = coalesce(p_song_ids, song_ids),
         updated_at   = now()
   where code = p_code;
end $$;

-- Er þessi vafri enn spilarinn? (eftir endurhleðslu)
create or replace function public.gitar_is_host(p_code text, p_token uuid)
returns boolean language sql security definer set search_path = public as $$
  select exists(select 1 from gitar_hosts where code = p_code and host_token = p_token);
$$;

-- Notað á forsíðunni: er kóðinn gítarpartý (og nýrri en kviss/bingó með sama kóða)?
create or replace function public.gitar_find(p_code text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_g timestamptz; v_o timestamptz; v timestamptz; c text := upper(trim(coalesce(p_code, '')));
begin
  select created_at into v_g from gitar_sessions where code = c and updated_at > now() - interval '2 days';
  if v_g is null then return false; end if;
  if to_regclass('public.games') is not null then
    execute 'select max(created_at) from public.games where code = $1' into v using c;
    v_o := greatest(v_o, v);
  end if;
  if to_regclass('public.bingo_games') is not null then
    execute 'select max(created_at) from public.bingo_games where code = $1' into v using c;
    v_o := greatest(v_o, v);
  end if;
  return v_o is null or v_g > v_o;
end $$;

-- ---------- Réttindi ------------------------------------------------

revoke all on public.gitar_songs, public.gitar_sessions, public.gitar_hosts from anon, authenticated;
revoke all on function
  public._gitar_pin_ok(text), public._code_taken(text),
  public.gitar_check(text), public.gitar_save_song(text, uuid, text, text, text, text, int, text),
  public.gitar_delete_song(text, uuid), public.gitar_reorder(text, uuid[]),
  public.gitar_start(uuid[], text), public.gitar_set(text, uuid, uuid, int, uuid[]),
  public.gitar_is_host(text, uuid), public.gitar_find(text)
from public, anon, authenticated;

grant select on public.gitar_songs, public.gitar_sessions to anon, authenticated;
grant execute on function
  public.gitar_check(text),
  public.gitar_save_song(text, uuid, text, text, text, text, int, text),
  public.gitar_delete_song(text, uuid),
  public.gitar_reorder(text, uuid[]),
  public.gitar_start(uuid[], text),
  public.gitar_set(text, uuid, uuid, int, uuid[]),
  public.gitar_is_host(text, uuid),
  public.gitar_find(text)
to anon, authenticated;

-- ---------- Rauntími ------------------------------------------------
-- Símar hlusta á breytingar á partýinu (gitar_sessions-töflunni).
do $$ begin
  alter publication supabase_realtime add table public.gitar_sessions;
exception when duplicate_object then null;
end $$;

-- ---------- Dæmalag (bætist aðeins við ef söngbókin er tóm) -----------
insert into public.gitar_songs (title, artist, song_key, body, sort_order)
select 'Sofðu unga ástin mín', 'Þjóðlag · Jóhann Sigurjónsson', 'Am',
'[Am]Sofðu unga [E7]ástin mín,
[Am]úti regnið [E7]græt[Am]ur.
[Am]Mamma geymir [Dm]gullin þín,
[E7]gamla leggi og [Am]völuskrín.
[Dm]Við skulum ekki [Am]vaka um [E7]dimmar [Am]nætur.

[Am]Það er margt sem [E7]myrkrið veit,
[Am]minn er hugur [E7]þung[Am]ur.
[Am]Oft ég svartan [Dm]sandinn leit
[E7]svíða grænan [Am]engireit.
[Dm]Í jöklinum hljóða [Am]dauðadjúpar [E7]sprung[Am]ur.

[Am]Sofðu lengi, [E7]sofðu rótt,
[Am]seint mun best að [E7]vakn[Am]a.
[Am]Mæðan kenna [Dm]mun þér fljótt,
[E7]meðan hallar [Am]degi skjótt,
[Dm]að mennirnir elska, [Am]missa, gráta og [E7]sakn[Am]a.', 0
where not exists (select 1 from public.gitar_songs);
