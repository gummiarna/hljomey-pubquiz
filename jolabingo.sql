-- =====================================================================
--  Hljómey – Jólabingó (eitt lag á dag í desember)
--
--  Allir fá sitt eigið 4×4 spjald með nöfnum listamanna. Kl. 12 á hverjum
--  degi opnast „lag dagsins“. Sá sem svarar rétt hver flytur lagið merkir
--  reitinn ef listamaðurinn er á spjaldinu. Fimmta hvert rétt svar gefur
--  jóker sem setja má á hvaða reit sem er. Þeir sem byrja seint geta
--  svarað eldri lögum.
--
--  Keyrðu setup.sql og bingo.sql fyrst (_bingo_lines er notað hér).
--  Supabase: SQL Editor -> New query -> líma allt -> Run. Má keyra aftur.
--  Ef gestapin.sql er keyrð aftur seinna hefur það engin áhrif hér:
--  stjórnun jólabingósins krefst alltaf aðal-PIN.
-- =====================================================================

-- ---------- Töflur ----------------------------------------------------

create table if not exists public.jb_settings (
  id          int primary key default 1 check (id = 1),
  title       text not null default 'Jólabingó Hljómeyjar',
  start_date  date not null default date '2026-12-01',
  days        int  not null default 24 check (days between 1 and 31),
  open_hour   int  not null default 12 check (open_hour between 0 and 23),
  joker_every int  not null default 5 check (joker_every between 1 and 31),
  active      boolean not null default true,
  updated_at  timestamptz not null default now()
);
insert into public.jb_settings (id) values (1) on conflict do nothing;

-- Lag hvers dags. Leynilegt þar til dagurinn opnast (aðeins lesið í gegnum föllin).
create table if not exists public.jb_days (
  day        int primary key check (day between 1 and 31),
  artist     text not null,
  deezer_id  bigint,
  song_title text not null default '',
  cover      text not null default '',
  options    jsonb not null,           -- fjögur nöfn listamanna
  correct    int not null check (correct between 0 and 3),
  updated_at timestamptz not null default now()
);
create unique index if not exists jb_days_artist_key on public.jb_days (lower(artist));

-- Aukanöfn í pottinum (listamenn sem ekki eru lag dagsins). Potturinn er
-- listamenn dagana + þessi nöfn; spjaldið er 16 nöfn úr honum.
create table if not exists public.jb_extra (
  name text primary key check (length(name) between 1 and 60)
);

create table if not exists public.jb_players (
  id         uuid primary key default gen_random_uuid(),
  email      text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$' and length(email) <= 254),
  name       text not null check (length(name) between 1 and 40),
  card       text[] not null,
  newsletter boolean not null default false,
  created_at timestamptz not null default now(),
  last_seen  timestamptz not null default now()
);
create unique index if not exists jb_players_email_key on public.jb_players (lower(email));

create table if not exists public.jb_secrets (
  player_id uuid primary key references public.jb_players(id) on delete cascade,
  token     uuid not null default gen_random_uuid()
);

create table if not exists public.jb_answers (
  player_id uuid not null references public.jb_players(id) on delete cascade,
  day       int  not null,
  choice    int  not null,
  correct   boolean not null,
  at        timestamptz not null default now(),
  primary key (player_id, day)
);

create table if not exists public.jb_jokers (
  player_id uuid not null references public.jb_players(id) on delete cascade,
  cell      int  not null check (cell between 1 and 16),
  at        timestamptz not null default now(),
  primary key (player_id, cell)
);

-- Enginn les töflurnar beint; allt fer í gegnum föllin hér fyrir neðan
alter table public.jb_settings enable row level security;
alter table public.jb_days     enable row level security;
alter table public.jb_extra    enable row level security;
alter table public.jb_players  enable row level security;
alter table public.jb_secrets  enable row level security;
alter table public.jb_answers  enable row level security;
alter table public.jb_jokers   enable row level security;

-- ---------- Hjálparföll ----------------------------------------------

-- Hvenær dagur d opnast (Ísland er alltaf á UTC)
create or replace function public._jb_opens(p_day int)
returns timestamptz language sql stable security definer set search_path = public as $$
  select ((s.start_date + (p_day - 1))::timestamp + make_interval(hours => s.open_hour)) at time zone 'Atlantic/Reykjavik'
    from jb_settings s where s.id = 1;
$$;

create or replace function public._jb_is_open(p_day int)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(_jb_opens(p_day) <= now(), false) and p_day <= (select days from jb_settings where id = 1);
$$;

create or replace function public._jb_check(p_player_id uuid, p_token uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from jb_secrets where player_id = p_player_id and token = p_token) then
    raise exception 'jb_ogildur';
  end if;
  update jb_players set last_seen = now() where id = p_player_id;
end $$;

-- Reitir sem gilda: listamaður dags sem var svarað rétt, eða jóker
create or replace function public._jb_cells(p_player_id uuid)
returns boolean[] language plpgsql stable security definer set search_path = public as $$
declare v_card text[]; v_ok boolean[] := array[]::boolean[]; i int;
begin
  select card into v_card from jb_players where id = p_player_id;
  for i in 1..coalesce(array_length(v_card, 1), 0) loop
    v_ok := v_ok || (
      exists (select 1 from jb_jokers j where j.player_id = p_player_id and j.cell = i)
      or exists (select 1 from jb_answers a join jb_days d on d.day = a.day
                  where a.player_id = p_player_id and a.correct and lower(d.artist) = lower(v_card[i]))
    );
  end loop;
  return v_ok;
end $$;

create or replace function public._jb_jokers_left(p_player_id uuid)
returns int language sql stable security definer set search_path = public as $$
  select greatest(0,
    (select count(*)::int from jb_answers where player_id = p_player_id and correct) / (select joker_every from jb_settings where id = 1)
    - (select count(*)::int from jb_jokers where player_id = p_player_id));
$$;

-- Potturinn: listamenn dagana og aukanöfnin, án tvítekninga
create or replace function public._jb_pool()
returns text[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(n order by n), array[]::text[]) from (
    select distinct on (lower(n)) n from (
      select artist as n from jb_days union all select name from jb_extra
    ) x order by lower(n)
  ) y;
$$;

-- ---------- Fyrir alla ------------------------------------------------

-- Staða leiksins án innskráningar (forsíða leiksins)
create or replace function public.jb_info()
returns json language plpgsql stable security definer set search_path = public as $$
declare s jb_settings; v_open int; v_next timestamptz; v_ready boolean;
begin
  select * into s from jb_settings where id = 1;
  select count(*) into v_open from generate_series(1, s.days) d where _jb_is_open(d);
  select min(_jb_opens(d)) into v_next from generate_series(1, s.days) d where not _jb_is_open(d);
  v_ready := s.active and (select count(*) from jb_days where day <= s.days) >= s.days and array_length(_jb_pool(), 1) >= 16;
  return json_build_object(
    'title', s.title, 'start', _jb_opens(1), 'end', _jb_opens(s.days), 'days', s.days,
    'opened', v_open, 'next', v_next, 'ready', v_ready, 'joker_every', s.joker_every,
    'players', (select count(*) from jb_players));
end $$;

-- Skráning: nýtt spjald, eða sama spjald aftur ef netfangið er þegar skráð
create or replace function public.jb_join(p_email text, p_name text, p_newsletter boolean default false)
returns json language plpgsql security definer set search_path = public as $$
declare v_email text := lower(trim(p_email)); v_name text := left(trim(coalesce(p_name, '')), 40);
        v_id uuid; v_token uuid; v_pool text[]; v_card text[]; s jb_settings;
begin
  select * into s from jb_settings where id = 1;
  if v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$' or length(v_email) > 254 then raise exception 'jb_netfang'; end if;

  select p.id, x.token into v_id, v_token from jb_players p join jb_secrets x on x.player_id = p.id where lower(p.email) = v_email;
  if v_id is null then
    if v_name = '' then raise exception 'vantar_nafn'; end if;
    if not s.active or (select count(*) from jb_days where day <= s.days) < s.days then raise exception 'jb_ekki_opid'; end if;
    v_pool := _jb_pool();
    if coalesce(array_length(v_pool, 1), 0) < 16 then raise exception 'jb_ekki_opid'; end if;
    select array_agg(n) into v_card from (select n from unnest(v_pool) n order by random() limit 16) z;
    insert into jb_players (email, name, card, newsletter) values (v_email, v_name, v_card, coalesce(p_newsletter, false))
      returning id into v_id;
    insert into jb_secrets (player_id) values (v_id) returning token into v_token;
  elsif coalesce(p_newsletter, false) then
    update jb_players set newsletter = true where id = v_id;
  end if;

  -- Póstlisti Hljómeyjar (sama gagnagrunnur og hljomey.is), aðeins með samþykki
  if coalesce(p_newsletter, false) and to_regclass('public.newsletter_subscribers') is not null then
    begin
      execute 'insert into public.newsletter_subscribers (email, locale, source) values ($1, ''is'', ''jolabingo'') on conflict do nothing' using v_email;
    exception when others then null;
    end;
  end if;

  return json_build_object('player_id', v_id, 'token', v_token);
end $$;

-- Allt sem síminn þarf: spjaldið, dagarnir og staðan
create or replace function public.jb_state(p_player_id uuid, p_token uuid)
returns json language plpgsql security definer set search_path = public as $$
declare p jb_players; s jb_settings; v_ok boolean[]; v_days json;
begin
  perform _jb_check(p_player_id, p_token);
  select * into p from jb_players where id = p_player_id;
  select * into s from jb_settings where id = 1;
  v_ok := _jb_cells(p_player_id);

  select json_agg(json_build_object(
      'day', g.d,
      'opens', _jb_opens(g.d),
      'open', _jb_is_open(g.d),
      'deezer_id', case when _jb_is_open(g.d) then d.deezer_id end,
      'options', case when _jb_is_open(g.d) then d.options end,
      'answered', a.day is not null,
      'choice', a.choice,
      'correct', a.correct,
      'right', case when a.day is not null then d.correct end,
      'artist', case when a.day is not null then d.artist end,
      'song', case when a.day is not null then d.song_title end,
      'cover', case when a.day is not null then d.cover end
    ) order by g.d) into v_days
    from generate_series(1, s.days) g(d)
    left join jb_days d on d.day = g.d
    left join jb_answers a on a.player_id = p_player_id and a.day = g.d;

  return json_build_object(
    'name', p.name, 'card', p.card, 'ok', v_ok,
    'jokers', _jb_jokers_left(p_player_id),
    'joker_cells', (select coalesce(json_agg(cell), '[]'::json) from jb_jokers where player_id = p_player_id),
    'correct', (select count(*) from jb_answers where player_id = p_player_id and correct),
    'joker_every', s.joker_every,
    'lines', _bingo_lines(v_ok), 'full', not (false = any(v_ok)),
    'title', s.title, 'days', v_days);
end $$;

-- Svar við lagi dagsins (eitt svar á dag)
create or replace function public.jb_answer(p_player_id uuid, p_token uuid, p_day int, p_choice int)
returns json language plpgsql security definer set search_path = public as $$
declare d jb_days; v_correct boolean; v_card text[]; v_on boolean; v_jokers_before int;
begin
  perform _jb_check(p_player_id, p_token);
  if not _jb_is_open(p_day) then raise exception 'jb_ekki_opid_dagur'; end if;
  select * into d from jb_days where day = p_day;
  if d.day is null then raise exception 'jb_ekki_opid_dagur'; end if;
  if exists (select 1 from jb_answers where player_id = p_player_id and day = p_day) then raise exception 'jb_buid'; end if;
  if p_choice not between 0 and 3 then raise exception 'jb_ekki_opid_dagur'; end if;

  v_jokers_before := _jb_jokers_left(p_player_id);
  v_correct := p_choice = d.correct;
  insert into jb_answers (player_id, day, choice, correct) values (p_player_id, p_day, p_choice, v_correct);
  select card into v_card from jb_players where id = p_player_id;
  v_on := exists (select 1 from unnest(v_card) n where lower(n) = lower(d.artist));

  return json_build_object(
    'correct', v_correct, 'right', d.correct, 'artist', d.artist, 'song', d.song_title, 'cover', d.cover,
    'on_card', v_on, 'new_joker', _jb_jokers_left(p_player_id) > v_jokers_before);
end $$;

-- Jóker settur á reit (1–16)
create or replace function public.jb_joker(p_player_id uuid, p_token uuid, p_cell int)
returns json language plpgsql security definer set search_path = public as $$
declare v_ok boolean[];
begin
  perform _jb_check(p_player_id, p_token);
  if _jb_jokers_left(p_player_id) < 1 then raise exception 'jb_enginn_joker'; end if;
  v_ok := _jb_cells(p_player_id);
  if p_cell not between 1 and coalesce(array_length(v_ok, 1), 0) or v_ok[p_cell] then raise exception 'jb_reitur'; end if;
  insert into jb_jokers (player_id, cell) values (p_player_id, p_cell);
  return json_build_object('ok', true);
end $$;

-- ---------- Stjórnun (aðal-PIN) ---------------------------------------

create or replace function public._jb_admin(p_pin text)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if _pin_not_host(p_pin) then raise exception 'rangt_pin'; end if;
end $$;

create or replace function public.jb_admin_get(p_pin text)
returns json language plpgsql security definer set search_path = public as $$
declare s jb_settings;
begin
  perform _jb_admin(p_pin);
  select * into s from jb_settings where id = 1;
  return json_build_object(
    'settings', row_to_json(s),
    'days', (select coalesce(json_agg(json_build_object(
                'day', d.day, 'artist', d.artist, 'deezer_id', d.deezer_id, 'song', d.song_title, 'cover', d.cover,
                'options', d.options, 'correct', d.correct, 'opens', _jb_opens(d.day), 'open', _jb_is_open(d.day),
                'answers', (select count(*) from jb_answers a where a.day = d.day),
                'right', (select count(*) from jb_answers a where a.day = d.day and a.correct)) order by d.day), '[]'::json)
             from jb_days d),
    'extra', (select coalesce(json_agg(name order by name), '[]'::json) from jb_extra),
    'pool', _jb_pool(),
    'players', (select count(*) from jb_players),
    'newsletter', (select count(*) from jb_players where newsletter));
end $$;

create or replace function public.jb_admin_settings(p_pin text, p_title text, p_start date, p_days int, p_open_hour int, p_joker_every int, p_active boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform _jb_admin(p_pin);
  update jb_settings set title = coalesce(nullif(trim(p_title), ''), title), start_date = p_start, days = p_days,
         open_hour = p_open_hour, joker_every = p_joker_every, active = p_active, updated_at = now()
   where id = 1;
end $$;

create or replace function public.jb_admin_extra(p_pin text, p_names text[])
returns void language plpgsql security definer set search_path = public as $$
begin
  perform _jb_admin(p_pin);
  delete from jb_extra where true;  -- Supabase leyfir ekki DELETE án WHERE
  insert into jb_extra (name)
    select distinct on (lower(trim(n))) left(trim(n), 60) from unnest(coalesce(p_names, array[]::text[])) n
     where trim(n) <> '' order by lower(trim(n))
    on conflict do nothing;
end $$;

create or replace function public.jb_admin_day(p_pin text, p_day int, p_artist text, p_deezer_id bigint, p_song text, p_cover text, p_options jsonb, p_correct int)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform _jb_admin(p_pin);
  if jsonb_typeof(p_options) <> 'array' or jsonb_array_length(p_options) <> 4 then raise exception 'jb_valkostir'; end if;
  if (p_options ->> p_correct) is distinct from trim(p_artist) then raise exception 'jb_valkostir'; end if;
  if (select count(distinct lower(v)) from jsonb_array_elements_text(p_options) v) <> 4 then raise exception 'svor_eins'; end if;
  if exists (select 1 from jb_days where lower(artist) = lower(trim(p_artist)) and day <> p_day) then raise exception 'jb_listamadur_tvisvar'; end if;
  insert into jb_days (day, artist, deezer_id, song_title, cover, options, correct)
       values (p_day, trim(p_artist), p_deezer_id, coalesce(p_song, ''), coalesce(p_cover, ''), p_options, p_correct)
  on conflict (day) do update set artist = excluded.artist, deezer_id = excluded.deezer_id, song_title = excluded.song_title,
       cover = excluded.cover, options = excluded.options, correct = excluded.correct, updated_at = now();
end $$;

create or replace function public.jb_admin_day_delete(p_pin text, p_day int)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform _jb_admin(p_pin);
  delete from jb_days where day = p_day;
end $$;

-- Allir leikmenn með stöðu, fyrir útdrátt vinninga og útflutning
create or replace function public.jb_admin_players(p_pin text)
returns json language plpgsql security definer set search_path = public as $$
begin
  perform _jb_admin(p_pin);
  return (select coalesce(json_agg(r order by r.lines desc, r.correct desc, r.created_at), '[]'::json) from (
    select p.name, p.email, p.newsletter, p.created_at, p.last_seen,
           (select count(*) from jb_answers a where a.player_id = p.id and a.correct) as correct,
           (select count(*) from jb_answers a where a.player_id = p.id) as answered,
           _bingo_lines(_jb_cells(p.id)) as lines,
           not (false = any(_jb_cells(p.id))) as full
      from jb_players p) r);
end $$;

-- Aðgangur: anon kallar aðeins á föllin
revoke all on public.jb_settings, public.jb_days, public.jb_extra, public.jb_players, public.jb_secrets, public.jb_answers, public.jb_jokers from anon, authenticated;
revoke execute on function public._jb_opens(int), public._jb_is_open(int), public._jb_check(uuid, uuid), public._jb_cells(uuid),
  public._jb_jokers_left(uuid), public._jb_pool(), public._jb_admin(text) from public, anon, authenticated;
grant execute on function public.jb_info(), public.jb_join(text, text, boolean), public.jb_state(uuid, uuid),
  public.jb_answer(uuid, uuid, int, int), public.jb_joker(uuid, uuid, int),
  public.jb_admin_get(text), public.jb_admin_settings(text, text, date, int, int, int, boolean), public.jb_admin_extra(text, text[]),
  public.jb_admin_day(text, int, text, bigint, text, text, jsonb, int), public.jb_admin_day_delete(text, int),
  public.jb_admin_players(text) to anon, authenticated;

select 'Jólabingó tilbúið' as staða;
