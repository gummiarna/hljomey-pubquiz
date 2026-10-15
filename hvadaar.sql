-- =====================================================================
--  Hljómey „Hvaða ár?“ – raðaðu lögunum í tímaröð
--  Keyrðu á eftir setup.sql: SQL Editor -> New query -> líma allt -> Run.
--  Notar sama PIN og hinir leikirnir. Má keyra aftur án skaða.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- Lagabankinn ------------------------------------------------
-- Lokaður: aðeins lesinn og skrifaður með PIN (föllin hér fyrir neðan).
create table if not exists public.ha_songs (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(trim(title)) between 1 and 200),
  artist      text not null check (char_length(trim(artist)) between 1 and 200),
  year        int check (year between 1900 and 2100),          -- árið sem leikurinn notar
  verified    boolean not null default false,                  -- stjórnandi hefur staðfest árið
  suggest     jsonb not null default '{}'::jsonb,              -- tillögur: {"spotify":2011,"musicbrainz":1975,"deezer":2011,"listi":1975}
  lang        text not null default 'erl' check (lang in ('is', 'erl')),
  spotify_uri text,
  isrc        text,
  deezer_id   bigint,
  cover       text not null default '',
  active      boolean not null default true,
  times_used  int not null default 0,
  last_used   timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index if not exists ha_songs_uidx on public.ha_songs (lower(trim(artist)), lower(trim(title)));

-- ---------- Leikir ------------------------------------------------------
create table if not exists public.ha_games (
  id               uuid primary key default gen_random_uuid(),
  code             text not null,
  title            text not null default 'Hvaða ár?',
  state            text not null default 'lobby' check (state in ('lobby', 'question', 'reveal', 'leaderboard', 'finished')),
  current_round    int not null default 0,
  total_rounds     int not null default 0,
  answer_seconds   int not null default 45,                    -- 0 = enginn tímamörk
  target           int not null default 10,                    -- spil til sigurs
  tolerance        int not null default 0,                     -- 0 = venjulegt, 3 = létt (±3 ár)
  round_started_at timestamptz,
  current_artists  jsonb,                                      -- 4 flytjendur til að giska á (opinbert)
  current_reveal   jsonb,                                      -- {title, artist, year, cover} eftir afhjúpun
  winners          text[] not null default '{}',
  created_at       timestamptz not null default now()
);
create index if not exists ha_games_code_idx on public.ha_games (code, created_at desc);

create table if not exists public.ha_hosts (
  game_id    uuid primary key references public.ha_games(id) on delete cascade,
  host_token uuid not null default gen_random_uuid()
);

-- Lögin í leiknum, með ári og rétta flytjandanum. Leyndarmál þar til svarið er sýnt.
create table if not exists public.ha_rounds (
  game_id    uuid not null references public.ha_games(id) on delete cascade,
  round_no   int not null,
  song_id    uuid,
  title      text not null,
  artist     text not null,
  year       int not null,
  cover      text not null default '',
  lang       text not null default 'erl',
  artists    jsonb not null,            -- ["Flytjandi A", "B", "C", "D"]
  artist_idx int not null check (artist_idx between 0 and 3),
  meta       jsonb,                     -- spotify_uri, deezer_id o.fl. fyrir stjórnandann
  primary key (game_id, round_no)
);

-- Spilastokkur fyrir byrjunarspil og spil sem eru keypt með táknum
create table if not exists public.ha_pool (
  game_id uuid not null references public.ha_games(id) on delete cascade,
  ord     int not null,
  title   text not null,
  artist  text not null,
  year    int not null,
  cover   text not null default '',
  used    boolean not null default false,
  primary key (game_id, ord)
);

create table if not exists public.ha_players (
  id        uuid primary key default gen_random_uuid(),
  game_id   uuid not null references public.ha_games(id) on delete cascade,
  name      text not null,
  cards     int not null default 0,
  tokens    int not null default 0,
  speed_ms  bigint not null default 0,     -- samanlagður svartími (til að skera úr jafntefli)
  joined_at timestamptz not null default now(),
  unique (game_id, name)
);
create index if not exists ha_players_game_idx on public.ha_players (game_id);

create table if not exists public.ha_player_secrets (
  player_id uuid primary key references public.ha_players(id) on delete cascade,
  token     uuid not null default gen_random_uuid()
);

-- Tímalínur leikmanna (opnar: aðeins spil sem búið er að afhjúpa)
create table if not exists public.ha_cards (
  id        uuid primary key default gen_random_uuid(),
  game_id   uuid not null references public.ha_games(id) on delete cascade,
  player_id uuid not null references public.ha_players(id) on delete cascade,
  title     text not null,
  artist    text not null,
  year      int not null,
  cover     text not null default '',
  source    text not null default 'round' check (source in ('start', 'round', 'trade')),
  round_no  int,
  added_at  timestamptz not null default clock_timestamp()
);
create index if not exists ha_cards_player_idx on public.ha_cards (player_id, year);

-- Svör (leynileg þar til svarið er sýnt)
create table if not exists public.ha_answers (
  game_id       uuid not null references public.ha_games(id) on delete cascade,
  round_no      int not null,
  player_id     uuid not null references public.ha_players(id) on delete cascade,
  slot          int not null,
  lo_year       int,
  hi_year       int,
  artist_choice int,
  year_guess    int,
  placed_ok     boolean not null,
  artist_ok     boolean not null default false,
  year_ok       boolean not null default false,
  elapsed_ms    int not null,
  primary key (game_id, round_no, player_id)
);

alter table public.ha_songs          enable row level security;
alter table public.ha_games          enable row level security;
alter table public.ha_hosts          enable row level security;
alter table public.ha_rounds         enable row level security;
alter table public.ha_pool           enable row level security;
alter table public.ha_players        enable row level security;
alter table public.ha_player_secrets enable row level security;
alter table public.ha_cards          enable row level security;
alter table public.ha_answers        enable row level security;

drop policy if exists ha_games_read   on public.ha_games;
drop policy if exists ha_players_read on public.ha_players;
drop policy if exists ha_cards_read   on public.ha_cards;
create policy ha_games_read   on public.ha_games   for select using (true);
create policy ha_players_read on public.ha_players for select using (true);
create policy ha_cards_read   on public.ha_cards   for select using (true);

-- ---------- Hjálparföll --------------------------------------------------
create or replace function public._ha_pin(p_pin text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_pin is distinct from (select value from app_settings where key = 'host_pin') then raise exception 'rangt_pin'; end if;
end $$;

create or replace function public._ha_host(p_game uuid, p_token uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from ha_hosts where game_id = p_game and host_token = p_token) then raise exception 'ogildur_stjornandi'; end if;
end $$;

create or replace function public._ha_player(p_player uuid, p_token uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  select p.game_id into v from ha_players p join ha_player_secrets s on s.player_id = p.id where p.id = p_player and s.token = p_token;
  if v is null then raise exception 'ogildur_leikmadur'; end if;
  return v;
end $$;

-- Dregur næsta ónotaða spil úr stokknum og setur á tímalínu leikmanns
create or replace function public._ha_draw(p_game uuid, p_player uuid, p_source text)
returns json language plpgsql security definer set search_path = public as $$
declare c ha_pool%rowtype;
begin
  select * into c from ha_pool where game_id = p_game and not used order by ord limit 1 for update skip locked;
  if c.ord is null then return null; end if;
  update ha_pool set used = true where game_id = p_game and ord = c.ord;
  insert into ha_cards (game_id, player_id, title, artist, year, cover, source) values (p_game, p_player, c.title, c.artist, c.year, c.cover, p_source);
  update ha_players set cards = cards + 1 where id = p_player;
  return json_build_object('title', c.title, 'artist', c.artist, 'year', c.year, 'cover', c.cover);
end $$;

-- ---------- Stillingar: Spotify Client ID --------------------------------
create or replace function public.ha_config()
returns json language sql security definer set search_path = public as $$
  select json_build_object('spotify_client_id', coalesce((select value from app_settings where key = 'spotify_client_id'), ''));
$$;

create or replace function public.ha_set_client_id(p_pin text, p_client_id text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform _ha_pin(p_pin);
  if coalesce(trim(p_client_id), '') = '' then delete from app_settings where key = 'spotify_client_id';
  else insert into app_settings (key, value) values ('spotify_client_id', left(trim(p_client_id), 100))
       on conflict (key) do update set value = excluded.value; end if;
end $$;

-- ---------- Lagabanki (PIN) ----------------------------------------------
create or replace function public.ha_bank_list(p_pin text)
returns json language plpgsql security definer set search_path = public as $$
begin
  perform _ha_pin(p_pin);
  return (select coalesce(json_agg(row_to_json(s) order by s.lang, s.artist, s.title), '[]'::json)
            from (select id, title, artist, year, verified, suggest, lang, spotify_uri, isrc, deezer_id, cover, active, times_used, last_used, created_at
                    from ha_songs) s);
end $$;

-- Vista mörg lög í einu. Lag með id er uppfært; annars bætt við (eða uppfært ef sami flytjandi + heiti er til).
-- Reitir sem vantar í línunni haldast óbreyttir. Skilar fjölda vistaðra.
create or replace function public.ha_bank_upsert(p_pin text, p_rows jsonb)
returns json language plpgsql security definer set search_path = public as $$
declare r jsonb; v_id uuid; v_byid boolean; n_new int := 0; n_upd int := 0; n_bad int := 0;
begin
  perform _ha_pin(p_pin);
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 1000 then raise exception 'of_margar_linur'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    begin
      v_id := nullif(r->>'id', '')::uuid;
      v_byid := v_id is not null;   -- heiti og flytjanda er aðeins breytt þegar lagið er valið eftir id
      if v_id is null then
        select id into v_id from ha_songs where lower(trim(artist)) = lower(trim(r->>'artist')) and lower(trim(title)) = lower(trim(r->>'title'));
      end if;
      if v_id is null then
        if coalesce(trim(r->>'title'), '') = '' or coalesce(trim(r->>'artist'), '') = '' then n_bad := n_bad + 1; continue; end if;
        insert into ha_songs (title, artist, year, verified, suggest, lang, spotify_uri, isrc, deezer_id, cover, active)
        values (trim(r->>'title'), trim(r->>'artist'), nullif(r->>'year', '')::int, coalesce((r->>'verified')::boolean, false),
                coalesce(r->'suggest', '{}'::jsonb), case when r->>'lang' = 'is' then 'is' else 'erl' end,
                nullif(r->>'spotify_uri', ''), nullif(r->>'isrc', ''), nullif(r->>'deezer_id', '')::bigint,
                coalesce(r->>'cover', ''), coalesce((r->>'active')::boolean, true));
        n_new := n_new + 1;
      else
        update ha_songs set
          title       = case when v_byid and r ? 'title' and trim(r->>'title') <> '' then trim(r->>'title') else title end,
          artist      = case when v_byid and r ? 'artist' and trim(r->>'artist') <> '' then trim(r->>'artist') else artist end,
          year        = case when r ? 'year' then nullif(r->>'year', '')::int else year end,
          verified    = case when r ? 'verified' then (r->>'verified')::boolean else verified end,
          suggest     = case when r ? 'suggest' then suggest || (r->'suggest') else suggest end,
          lang        = case when r->>'lang' in ('is', 'erl') then r->>'lang' else lang end,
          spotify_uri = case when r ? 'spotify_uri' then coalesce(nullif(r->>'spotify_uri', ''), spotify_uri) else spotify_uri end,
          isrc        = case when r ? 'isrc' then coalesce(nullif(r->>'isrc', ''), isrc) else isrc end,
          deezer_id   = case when r ? 'deezer_id' then coalesce(nullif(r->>'deezer_id', '')::bigint, deezer_id) else deezer_id end,
          cover       = case when r ? 'cover' and coalesce(r->>'cover', '') <> '' then r->>'cover' else cover end,
          active      = case when r ? 'active' then (r->>'active')::boolean else active end,
          updated_at  = now()
        where id = v_id;
        n_upd := n_upd + 1;
      end if;
    exception when check_violation or invalid_text_representation or numeric_value_out_of_range or unique_violation then
      n_bad := n_bad + 1;
    end;
  end loop;
  return json_build_object('added', n_new, 'updated', n_upd, 'invalid', n_bad);
end $$;

create or replace function public.ha_bank_delete(p_pin text, p_ids uuid[])
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform _ha_pin(p_pin);
  delete from ha_songs where id = any(p_ids);
  get diagnostics n = row_count; return n;
end $$;

-- ---------- Stjórnandi ----------------------------------------------------
-- Býr til leik. p_rounds = [{song_id,title,artist,year,cover,lang,artists:[4],artist_idx,meta}], p_pool = [{title,artist,year,cover}]
create or replace function public.ha_create(
  p_pin text, p_title text, p_answer_seconds int, p_target int, p_tolerance int, p_rounds jsonb, p_pool jsonb)
returns json language plpgsql security definer set search_path = public as $$
declare v_code text; v_id uuid; v_token uuid; v_i int := 0; r jsonb; v_alphabet text := 'ABCDEFGHJKLMNPRSTUVXYZ'; v_taken boolean;
begin
  perform _ha_pin(p_pin);
  if jsonb_typeof(p_rounds) <> 'array' or jsonb_array_length(p_rounds) < 1 or jsonb_array_length(p_rounds) > 120 then raise exception 'ogildar_umferdir'; end if;
  loop
    v_code := '';
    for i in 1..4 loop v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1); end loop;
    v_taken := exists (select 1 from ha_games where code = v_code and created_at > now() - interval '2 days');
    if not v_taken and to_regclass('public.games') is not null then
      execute 'select exists(select 1 from public.games where code = $1 and created_at > now() - interval ''2 days'')' into v_taken using v_code;
    end if;
    if not v_taken and to_regclass('public.bingo_games') is not null then
      execute 'select exists(select 1 from public.bingo_games where code = $1 and created_at > now() - interval ''2 days'')' into v_taken using v_code;
    end if;
    if not v_taken and to_regclass('public.gitar_sessions') is not null then
      execute 'select exists(select 1 from public.gitar_sessions where code = $1)' into v_taken using v_code;
    end if;
    if not v_taken and to_regclass('public.karaoke_sessions') is not null then
      execute 'select exists(select 1 from public.karaoke_sessions where code = $1)' into v_taken using v_code;
    end if;
    exit when not v_taken;
  end loop;

  insert into ha_games (code, title, answer_seconds, target, tolerance, total_rounds)
  values (v_code, coalesce(nullif(trim(p_title), ''), 'Hvaða ár?'),
          case when coalesce(p_answer_seconds, 45) = 0 then 0 else greatest(10, least(300, coalesce(p_answer_seconds, 45))) end,
          greatest(3, least(30, coalesce(p_target, 10))), greatest(0, least(10, coalesce(p_tolerance, 0))),
          jsonb_array_length(p_rounds))
  returning id into v_id;
  insert into ha_hosts (game_id) values (v_id) returning host_token into v_token;

  for r in select * from jsonb_array_elements(p_rounds) loop
    v_i := v_i + 1;
    if jsonb_array_length(r->'artists') <> 4 then raise exception 'fjorir_valmoguleikar'; end if;
    insert into ha_rounds (game_id, round_no, song_id, title, artist, year, cover, lang, artists, artist_idx, meta)
    values (v_id, v_i, nullif(r->>'song_id', '')::uuid, r->>'title', r->>'artist', (r->>'year')::int, coalesce(r->>'cover', ''),
            coalesce(r->>'lang', 'erl'), r->'artists', (r->>'artist_idx')::int, r->'meta');
  end loop;
  v_i := 0;
  for r in select * from jsonb_array_elements(coalesce(p_pool, '[]'::jsonb)) loop
    v_i := v_i + 1;
    insert into ha_pool (game_id, ord, title, artist, year, cover) values (v_id, v_i, r->>'title', r->>'artist', (r->>'year')::int, coalesce(r->>'cover', ''));
  end loop;
  -- Merkja lögin notuð
  update ha_songs set times_used = times_used + 1, last_used = now()
   where id in (select (x->>'song_id')::uuid from jsonb_array_elements(p_rounds) x where coalesce(x->>'song_id', '') <> '');
  return json_build_object('game_id', v_id, 'code', v_code, 'host_token', v_token);
end $$;

create or replace function public.ha_host_get(p_game uuid, p_token uuid)
returns json language plpgsql security definer set search_path = public as $$
begin
  perform _ha_host(p_game, p_token);
  return json_build_object(
    'game', (select row_to_json(g) from ha_games g where g.id = p_game),
    'rounds', (select coalesce(json_agg(json_build_object('round_no', r.round_no, 'title', r.title, 'artist', r.artist, 'year', r.year,
                 'cover', r.cover, 'lang', r.lang, 'artists', r.artists, 'artist_idx', r.artist_idx, 'meta', r.meta) order by r.round_no), '[]'::json)
               from ha_rounds r where r.game_id = p_game));
end $$;

create or replace function public.ha_start_round(p_game uuid, p_token uuid, p_round int)
returns json language plpgsql security definer set search_path = public as $$
declare v_artists jsonb;
begin
  perform _ha_host(p_game, p_token);
  select artists into v_artists from ha_rounds where game_id = p_game and round_no = p_round;
  if v_artists is null then raise exception 'engin_slik_umferd'; end if;
  update ha_games set state = 'question', current_round = p_round, round_started_at = clock_timestamp(),
                      current_artists = v_artists, current_reveal = null
   where id = p_game;
  return json_build_object('ok', true);
end $$;

create or replace function public.ha_round_status(p_game uuid, p_token uuid)
returns json language plpgsql security definer set search_path = public as $$
declare v_round int;
begin
  perform _ha_host(p_game, p_token);
  select current_round into v_round from ha_games where id = p_game;
  return json_build_object('players', (select count(*) from ha_players where game_id = p_game),
                           'answered', (select count(*) from ha_answers where game_id = p_game and round_no = v_round));
end $$;

-- Sýnir svarið: rétt sett spil fara á tímalínur og tákn eru gefin
create or replace function public.ha_reveal(p_game uuid, p_token uuid)
returns json language plpgsql security definer set search_path = public as $$
declare g ha_games%rowtype; k ha_rounds%rowtype; a ha_answers%rowtype; v_winners text[];
begin
  perform _ha_host(p_game, p_token);
  select * into g from ha_games where id = p_game for update;
  select * into k from ha_rounds where game_id = p_game and round_no = g.current_round;
  if k.round_no is null then raise exception 'engin_slik_umferd'; end if;
  if g.state = 'question' then
    for a in select * from ha_answers where game_id = p_game and round_no = g.current_round loop
      if a.placed_ok then
        insert into ha_cards (game_id, player_id, title, artist, year, cover, source, round_no)
        values (p_game, a.player_id, k.title, k.artist, k.year, k.cover, 'round', k.round_no);
      end if;
      update ha_players set cards = cards + (case when a.placed_ok then 1 else 0 end),
                            tokens = tokens + (case when a.artist_ok then 1 else 0 end) + (case when a.year_ok then 1 else 0 end),
                            speed_ms = speed_ms + a.elapsed_ms
       where id = a.player_id;
    end loop;
    select coalesce(array_agg(name order by cards desc, tokens desc, speed_ms), '{}') into v_winners
      from ha_players where game_id = p_game and cards >= g.target;
    update ha_games set state = 'reveal', winners = v_winners,
           current_reveal = json_build_object('title', k.title, 'artist', k.artist, 'year', k.year, 'cover', k.cover, 'artist_idx', k.artist_idx)::jsonb
     where id = p_game;
  end if;
  select * into g from ha_games where id = p_game;
  return json_build_object(
    'reveal', g.current_reveal, 'winners', g.winners,
    'answered', (select count(*) from ha_answers where game_id = p_game and round_no = g.current_round),
    'players', (select count(*) from ha_players where game_id = p_game),
    'correct', (select coalesce(json_agg(p.name order by x.elapsed_ms), '[]'::json) from ha_answers x join ha_players p on p.id = x.player_id
                 where x.game_id = p_game and x.round_no = g.current_round and x.placed_ok),
    'artist_ok', (select count(*) from ha_answers where game_id = p_game and round_no = g.current_round and artist_ok),
    'exact', (select coalesce(json_agg(p.name), '[]'::json) from ha_answers x join ha_players p on p.id = x.player_id
               where x.game_id = p_game and x.round_no = g.current_round and x.year_ok),
    'closest', (select json_build_object('name', p.name, 'guess', x.year_guess, 'off', abs(x.year_guess - k.year))
                  from ha_answers x join ha_players p on p.id = x.player_id
                 where x.game_id = p_game and x.round_no = g.current_round and x.year_guess is not null
                 order by abs(x.year_guess - k.year), x.elapsed_ms limit 1));
end $$;

create or replace function public.ha_set_state(p_game uuid, p_token uuid, p_state text)
returns json language plpgsql security definer set search_path = public as $$
begin
  perform _ha_host(p_game, p_token);
  if p_state not in ('leaderboard', 'finished') then raise exception 'ogild_stada'; end if;
  update ha_games set state = p_state where id = p_game;
  return json_build_object('ok', true);
end $$;

-- ---------- Leikmenn -------------------------------------------------------
create or replace function public.ha_find(p_code text)
returns boolean language sql security definer set search_path = public as $$
  select exists (select 1 from ha_games where code = upper(trim(p_code)) and created_at > now() - interval '2 days' and state <> 'finished');
$$;

create or replace function public.ha_join(p_code text, p_name text)
returns json language plpgsql security definer set search_path = public as $$
declare v_game uuid; v_state text; v_name text; v_pid uuid; v_tok uuid; v_card json;
begin
  select id, state into v_game, v_state from ha_games where code = upper(trim(p_code)) and created_at > now() - interval '2 days'
   order by created_at desc limit 1;
  if v_game is null then raise exception 'leikur_fannst_ekki'; end if;
  if v_state = 'finished' then raise exception 'leik_lokid'; end if;
  v_name := left(regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g'), 20);
  if length(v_name) < 1 then raise exception 'vantar_nafn'; end if;
  if (select count(*) from ha_players where game_id = v_game) >= 60 then raise exception 'leikur_fullur'; end if;
  if exists (select 1 from ha_players where game_id = v_game and lower(name) = lower(v_name)) then raise exception 'nafn_tekid'; end if;
  insert into ha_players (game_id, name) values (v_game, v_name) returning id into v_pid;
  insert into ha_player_secrets (player_id) values (v_pid) returning token into v_tok;
  v_card := _ha_draw(v_game, v_pid, 'start');
  return json_build_object('game_id', v_game, 'player_id', v_pid, 'token', v_tok, 'name', v_name, 'start_card', v_card);
end $$;

-- Leikmaður setur lagið á tímalínuna: p_slot = fjöldi spila á undan (0 = fremst)
create or replace function public.ha_place(p_player uuid, p_token uuid, p_slot int, p_artist int, p_year int)
returns json language plpgsql security definer set search_path = public as $$
declare v_game uuid; g ha_games%rowtype; k ha_rounds%rowtype; v_years int[]; v_lo int; v_hi int; v_ok boolean;
        v_elapsed numeric; v_rows int;
begin
  v_game := _ha_player(p_player, p_token);
  select * into g from ha_games where id = v_game;
  if g.state <> 'question' then return json_build_object('ok', false, 'reason', 'of_seint'); end if;
  v_elapsed := extract(epoch from clock_timestamp() - g.round_started_at);
  if g.answer_seconds > 0 and v_elapsed > g.answer_seconds + 2 then return json_build_object('ok', false, 'reason', 'of_seint'); end if;
  select * into k from ha_rounds where game_id = v_game and round_no = g.current_round;
  select coalesce(array_agg(year order by year, added_at, id), '{}') into v_years from ha_cards where player_id = p_player;
  if p_slot is null or p_slot < 0 or p_slot > coalesce(array_length(v_years, 1), 0) then
    return json_build_object('ok', false, 'reason', 'ogilt_saeti');
  end if;
  v_lo := case when p_slot = 0 then null else v_years[p_slot] end;
  v_hi := case when p_slot >= coalesce(array_length(v_years, 1), 0) then null else v_years[p_slot + 1] end;
  v_ok := (v_lo is null or v_lo <= k.year + g.tolerance) and (v_hi is null or v_hi >= k.year - g.tolerance);
  insert into ha_answers (game_id, round_no, player_id, slot, lo_year, hi_year, artist_choice, year_guess, placed_ok, artist_ok, year_ok, elapsed_ms)
  values (v_game, g.current_round, p_player, p_slot, v_lo, v_hi,
          case when p_artist between 0 and 3 then p_artist end,
          case when p_year between 1900 and 2100 then p_year end,
          v_ok, coalesce(p_artist = k.artist_idx, false), coalesce(p_year = k.year, false), (v_elapsed * 1000)::int)
  on conflict do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then return json_build_object('ok', false, 'reason', 'buinn_ad_svara'); end if;
  return json_build_object('ok', true);
end $$;

-- Skipta 3 táknum fyrir spil úr stokknum (á milli laga)
create or replace function public.ha_trade(p_player uuid, p_token uuid)
returns json language plpgsql security definer set search_path = public as $$
declare v_game uuid; v_state text; v_card json;
begin
  v_game := _ha_player(p_player, p_token);
  select state into v_state from ha_games where id = v_game;
  if v_state not in ('reveal', 'leaderboard', 'lobby') then raise exception 'ekki_nuna'; end if;
  if (select tokens from ha_players where id = p_player for update) < 3 then raise exception 'of_fa_tokn'; end if;
  update ha_players set tokens = tokens - 3 where id = p_player;
  v_card := _ha_draw(v_game, p_player, 'trade');
  if v_card is null then update ha_players set tokens = tokens + 3 where id = p_player; raise exception 'stokkur_tomur'; end if;
  return v_card;
end $$;

-- Allt sem síminn þarf
create or replace function public.ha_my_state(p_player uuid, p_token uuid)
returns json language plpgsql security definer set search_path = public as $$
declare v_game uuid; g ha_games%rowtype; p ha_players%rowtype; a ha_answers%rowtype; v_show boolean;
begin
  v_game := _ha_player(p_player, p_token);
  select * into g from ha_games where id = v_game;
  select * into p from ha_players where id = p_player;
  select * into a from ha_answers where game_id = v_game and round_no = g.current_round and player_id = p_player;
  v_show := g.state in ('reveal', 'leaderboard', 'finished');
  return json_build_object(
    'game', json_build_object('id', g.id, 'code', g.code, 'title', g.title, 'state', g.state, 'current_round', g.current_round,
              'total_rounds', g.total_rounds, 'answer_seconds', g.answer_seconds, 'target', g.target, 'tolerance', g.tolerance,
              'current_artists', g.current_artists, 'current_reveal', case when v_show then g.current_reveal end, 'winners', g.winners,
              'seconds_left', case when g.state = 'question' and g.answer_seconds > 0
                then greatest(0, g.answer_seconds - extract(epoch from clock_timestamp() - g.round_started_at)) end),
    'player', json_build_object('name', p.name, 'cards', p.cards, 'tokens', p.tokens,
              'rank', (select count(*) + 1 from ha_players x where x.game_id = v_game and (x.cards > p.cards or (x.cards = p.cards and x.tokens > p.tokens))),
              'total', (select count(*) from ha_players x where x.game_id = v_game)),
    'timeline', (select coalesce(json_agg(json_build_object('title', c.title, 'artist', c.artist, 'year', c.year, 'cover', c.cover,
                    'source', c.source, 'round_no', c.round_no) order by c.year, c.added_at, c.id), '[]'::json)
                 from ha_cards c where c.player_id = p_player),
    'answer', case when a.player_id is null then null else json_build_object('slot', a.slot, 'artist_choice', a.artist_choice, 'year_guess', a.year_guess,
              'placed_ok', case when v_show then a.placed_ok end, 'artist_ok', case when v_show then a.artist_ok end,
              'year_ok', case when v_show then a.year_ok end, 'lo', a.lo_year, 'hi', a.hi_year) end);
end $$;

-- ---------- Réttindi -------------------------------------------------------
revoke all on public.ha_songs, public.ha_games, public.ha_hosts, public.ha_rounds, public.ha_pool, public.ha_players,
              public.ha_player_secrets, public.ha_cards, public.ha_answers from anon, authenticated;
revoke all on function
  public._ha_pin(text), public._ha_host(uuid, uuid), public._ha_player(uuid, uuid), public._ha_draw(uuid, uuid, text),
  public.ha_config(), public.ha_set_client_id(text, text), public.ha_bank_list(text), public.ha_bank_upsert(text, jsonb),
  public.ha_bank_delete(text, uuid[]), public.ha_create(text, text, int, int, int, jsonb, jsonb), public.ha_host_get(uuid, uuid),
  public.ha_start_round(uuid, uuid, int), public.ha_round_status(uuid, uuid), public.ha_reveal(uuid, uuid),
  public.ha_set_state(uuid, uuid, text), public.ha_find(text), public.ha_join(text, text),
  public.ha_place(uuid, uuid, int, int, int), public.ha_trade(uuid, uuid), public.ha_my_state(uuid, uuid)
from public, anon, authenticated;

grant select on public.ha_games, public.ha_players, public.ha_cards to anon, authenticated;
grant execute on function
  public.ha_config(), public.ha_set_client_id(text, text), public.ha_bank_list(text), public.ha_bank_upsert(text, jsonb),
  public.ha_bank_delete(text, uuid[]), public.ha_create(text, text, int, int, int, jsonb, jsonb), public.ha_host_get(uuid, uuid),
  public.ha_start_round(uuid, uuid, int), public.ha_round_status(uuid, uuid), public.ha_reveal(uuid, uuid),
  public.ha_set_state(uuid, uuid, text), public.ha_find(text), public.ha_join(text, text),
  public.ha_place(uuid, uuid, int, int, int), public.ha_trade(uuid, uuid), public.ha_my_state(uuid, uuid)
to anon, authenticated;

-- ---------- Rauntími --------------------------------------------------------
do $$ begin
  alter publication supabase_realtime add table public.ha_games;
exception when duplicate_object then null; end $$;

select 'Hvaða ár? uppsett' as stada;
