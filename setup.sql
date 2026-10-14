-- =====================================================================
--  Hljómey Pöbbkviss – gagnagrunnur fyrir Supabase
--  Keyrðu þessa skrá einu sinni í Supabase: SQL Editor -> New query ->
--  líma allt -> Run.  Mundu að breyta PIN-númerinu neðst!
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- Töflur ----------------------------------------------------

-- Stillingar (t.d. PIN stjórnanda). Ekki lesanleg utan frá.
create table if not exists public.app_settings (
  key   text primary key,
  value text not null
);

-- Leikir. Allir mega lesa (engin leyndarmál hér).
create table if not exists public.games (
  id               uuid primary key default gen_random_uuid(),
  code             text not null,
  title            text not null default 'Hljómey Pöbbkviss',
  state            text not null default 'lobby'
                   check (state in ('lobby','question','reveal','leaderboard','finished')),
  current_round    int  not null default 0,        -- 1..total_rounds (0 = ekki byrjað)
  total_rounds     int  not null default 0,
  answer_seconds   int  not null default 15,
  round_started_at timestamptz,
  current_options  jsonb,                           -- valmöguleikar umferðar sem er í gangi
  current_correct  int,                             -- birt fyrst við "reveal"
  event_tag        text,                            -- t.d. 'hljomey-2027' (tenging við hátíð/app síðar)
  created_at       timestamptz not null default now()
);
create index if not exists games_code_idx on public.games (code, created_at desc);

-- Leyndarmál stjórnanda (aðgangslykill). Ekki lesanleg utan frá.
create table if not exists public.game_hosts (
  game_id    uuid primary key references public.games(id) on delete cascade,
  host_token uuid not null default gen_random_uuid()
);

-- Umferðir með réttu svari. Ekki lesanleg utan frá.
create table if not exists public.round_keys (
  game_id     uuid not null references public.games(id) on delete cascade,
  round_no    int  not null,
  options     jsonb not null,            -- ["Lag A","Lag B","Lag C","Lag D"]
  correct_idx int  not null check (correct_idx between 0 and 3),
  meta        jsonb,                     -- {title, artist, cover, deezer_id, preview, start}
  primary key (game_id, round_no)
);

-- Leikmenn. Nafn og stig eru opin (stigatafla).
create table if not exists public.players (
  id        uuid primary key default gen_random_uuid(),
  game_id   uuid not null references public.games(id) on delete cascade,
  name      text not null,
  score     int  not null default 0,
  joined_at timestamptz not null default now(),
  unique (game_id, name)
);
create index if not exists players_game_idx on public.players (game_id, score desc);

-- Leyndarmál leikmanns (lykill símans). Ekki lesanleg utan frá.
create table if not exists public.player_secrets (
  player_id uuid primary key references public.players(id) on delete cascade,
  token     uuid not null default gen_random_uuid()
);

-- Svör. Ekki lesanleg utan frá (svo enginn geti svindlað).
create table if not exists public.answers (
  game_id     uuid not null references public.games(id) on delete cascade,
  round_no    int  not null,
  player_id   uuid not null references public.players(id) on delete cascade,
  choice      int  not null check (choice between 0 and 3),
  is_correct  boolean not null,
  is_first    boolean not null default false,
  points      int  not null default 0,
  elapsed_ms  int  not null,
  answered_at timestamptz not null default clock_timestamp(),
  primary key (game_id, round_no, player_id)
);

-- ---------- Aðgangsstýring (RLS) ------------------------------------

alter table public.app_settings   enable row level security;
alter table public.games          enable row level security;
alter table public.game_hosts     enable row level security;
alter table public.round_keys     enable row level security;
alter table public.players        enable row level security;
alter table public.player_secrets enable row level security;
alter table public.answers        enable row level security;

drop policy if exists games_read   on public.games;
drop policy if exists players_read on public.players;
create policy games_read   on public.games   for select using (true);
create policy players_read on public.players for select using (true);
-- Engar aðrar reglur: allar breytingar fara í gegnum föllin hér fyrir neðan.

-- ---------- Hjálparföll ---------------------------------------------

create or replace function public._check_host(p_game_id uuid, p_host_token uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from game_hosts where game_id = p_game_id and host_token = p_host_token) then
    raise exception 'ogildur_stjornandi';
  end if;
end $$;

create or replace function public._check_player(p_player_id uuid, p_token uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_game uuid;
begin
  select p.game_id into v_game
    from players p join player_secrets s on s.player_id = p.id
   where p.id = p_player_id and s.token = p_token;
  if v_game is null then raise exception 'ogildur_leikmadur'; end if;
  return v_game;
end $$;

-- ---------- Stjórnandi ----------------------------------------------

-- Býr til leik. p_rounds = [{options:[4 strengir], correct:0-3, meta:{...}}, ...]
create or replace function public.create_game(
  p_pin text, p_title text, p_answer_seconds int, p_rounds jsonb, p_event_tag text default null)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_code text; v_id uuid; v_token uuid; v_i int := 0; r jsonb;
  v_alphabet text := 'ABCDEFGHJKLMNPRSTUVXYZ';   -- engir ruglingsstafir (I, O, Q, W)
begin
  if p_pin is distinct from (select value from app_settings where key = 'host_pin') then
    raise exception 'rangt_pin';
  end if;
  if jsonb_typeof(p_rounds) <> 'array' or jsonb_array_length(p_rounds) < 1 or jsonb_array_length(p_rounds) > 50 then
    raise exception 'ogildar_umferdir';
  end if;

  loop
    v_code := '';
    for i in 1..4 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from games where code = v_code
                          and state <> 'finished' and created_at > now() - interval '2 days');
  end loop;

  insert into games (code, title, answer_seconds, total_rounds, event_tag)
  values (v_code, coalesce(nullif(trim(p_title), ''), 'Hljómey Pöbbkviss'),
          greatest(5, least(60, coalesce(p_answer_seconds, 15))),
          jsonb_array_length(p_rounds), p_event_tag)
  returning id into v_id;

  insert into game_hosts (game_id) values (v_id) returning host_token into v_token;

  for r in select * from jsonb_array_elements(p_rounds) loop
    v_i := v_i + 1;
    if jsonb_array_length(r->'options') <> 4 then raise exception 'fjorir_valmoguleikar'; end if;
    insert into round_keys (game_id, round_no, options, correct_idx, meta)
    values (v_id, v_i, r->'options', (r->>'correct')::int, r->'meta');
  end loop;

  return json_build_object('game_id', v_id, 'code', v_code, 'host_token', v_token);
end $$;

-- Sækir allan leikinn fyrir stjórnanda (t.d. eftir að síða er endurhlaðin).
create or replace function public.host_get_game(p_game_id uuid, p_host_token uuid)
returns json language plpgsql security definer set search_path = public as $$
begin
  perform _check_host(p_game_id, p_host_token);
  return json_build_object(
    'game',   (select row_to_json(g) from games g where g.id = p_game_id),
    'rounds', (select coalesce(json_agg(json_build_object(
                  'round_no', k.round_no, 'options', k.options,
                  'correct', k.correct_idx, 'meta', k.meta) order by k.round_no), '[]'::json)
               from round_keys k where k.game_id = p_game_id));
end $$;

-- Setur umferð í gang: klukkan byrjar að telja á þjóninum.
create or replace function public.host_start_round(p_game_id uuid, p_host_token uuid, p_round int)
returns json language plpgsql security definer set search_path = public as $$
declare v_opts jsonb;
begin
  perform _check_host(p_game_id, p_host_token);
  select options into v_opts from round_keys where game_id = p_game_id and round_no = p_round;
  if v_opts is null then raise exception 'engin_slik_umferd'; end if;
  update games set state = 'question', current_round = p_round,
                   round_started_at = clock_timestamp(),
                   current_options = v_opts, current_correct = null
   where id = p_game_id;
  return json_build_object('ok', true, 'started_at', clock_timestamp());
end $$;

-- Staða umferðar: hversu margir hafa svarað.
create or replace function public.host_round_status(p_game_id uuid, p_host_token uuid)
returns json language plpgsql security definer set search_path = public as $$
declare v_round int;
begin
  perform _check_host(p_game_id, p_host_token);
  select current_round into v_round from games where id = p_game_id;
  return json_build_object(
    'players',  (select count(*) from players where game_id = p_game_id),
    'answered', (select count(*) from answers where game_id = p_game_id and round_no = v_round));
end $$;

-- Sýnir rétt svar og bætir stigum umferðarinnar við heildarstig.
create or replace function public.host_reveal(p_game_id uuid, p_host_token uuid)
returns json language plpgsql security definer set search_path = public as $$
declare v_round int; v_state text; v_correct int;
begin
  perform _check_host(p_game_id, p_host_token);
  select current_round, state into v_round, v_state from games where id = p_game_id for update;
  select correct_idx into v_correct from round_keys where game_id = p_game_id and round_no = v_round;

  if v_state = 'question' then
    update players p set score = p.score + a.points
      from answers a
     where a.player_id = p.id and a.game_id = p_game_id and a.round_no = v_round and a.points > 0;
    update games set state = 'reveal', current_correct = v_correct where id = p_game_id;
  end if;

  return json_build_object(
    'correct', v_correct,
    'counts', (select json_build_array(
                  count(*) filter (where choice = 0), count(*) filter (where choice = 1),
                  count(*) filter (where choice = 2), count(*) filter (where choice = 3))
               from answers where game_id = p_game_id and round_no = v_round),
    'first',  (select p.name from answers a join players p on p.id = a.player_id
                where a.game_id = p_game_id and a.round_no = v_round and a.is_first limit 1),
    'first_ms', (select a.elapsed_ms from answers a
                where a.game_id = p_game_id and a.round_no = v_round and a.is_first limit 1));
end $$;

-- Skiptir yfir í stigatöflu eða lok leiks.
create or replace function public.host_set_state(p_game_id uuid, p_host_token uuid, p_state text)
returns json language plpgsql security definer set search_path = public as $$
begin
  perform _check_host(p_game_id, p_host_token);
  if p_state not in ('leaderboard','finished') then raise exception 'ogild_stada'; end if;
  update games set state = p_state where id = p_game_id;
  return json_build_object('ok', true);
end $$;

-- ---------- Leikmenn ------------------------------------------------

create or replace function public.join_game(p_code text, p_name text)
returns json language plpgsql security definer set search_path = public as $$
declare v_game uuid; v_state text; v_name text; v_pid uuid; v_token uuid;
begin
  select id, state into v_game, v_state from games
   where code = upper(trim(p_code)) and created_at > now() - interval '2 days'
   order by created_at desc limit 1;
  if v_game is null then raise exception 'leikur_fannst_ekki'; end if;
  if v_state = 'finished' then raise exception 'leik_lokid'; end if;

  v_name := left(regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g'), 20);
  if length(v_name) < 1 then raise exception 'vantar_nafn'; end if;
  if (select count(*) from players where game_id = v_game) >= 500 then raise exception 'leikur_fullur'; end if;
  if exists (select 1 from players where game_id = v_game and lower(name) = lower(v_name)) then
    raise exception 'nafn_tekid';
  end if;

  insert into players (game_id, name) values (v_game, v_name) returning id into v_pid;
  insert into player_secrets (player_id) values (v_pid) returning token into v_token;
  return json_build_object('game_id', v_game, 'player_id', v_pid, 'token', v_token, 'name', v_name);
end $$;

-- Tekur við svari. Svartími mældur á þjóninum.
create or replace function public.submit_answer(p_player_id uuid, p_token uuid, p_choice int)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_game uuid; g games%rowtype; v_elapsed numeric; v_correct int;
  v_is_correct boolean; v_first boolean := false; v_points int := 0; v_rows int;
begin
  v_game := _check_player(p_player_id, p_token);
  -- Læsir leiknum svo aðeins einn geti orðið "fyrstur".
  select * into g from games where id = v_game for update;
  if g.state <> 'question' then return json_build_object('ok', false, 'reason', 'of_seint'); end if;
  if p_choice not between 0 and 3 then return json_build_object('ok', false, 'reason', 'ogilt_svar'); end if;

  v_elapsed := extract(epoch from clock_timestamp() - g.round_started_at);
  if v_elapsed > g.answer_seconds + 1.5 then   -- smá svigrúm fyrir netið
    return json_build_object('ok', false, 'reason', 'of_seint');
  end if;

  select correct_idx into v_correct from round_keys where game_id = v_game and round_no = g.current_round;
  v_is_correct := (p_choice = v_correct);
  if v_is_correct then
    v_points := round(500 + 500 * greatest(0, 1 - v_elapsed / g.answer_seconds));
    v_first := not exists (select 1 from answers
                            where game_id = v_game and round_no = g.current_round and is_correct);
    if v_first then v_points := v_points + 200; end if;
  end if;

  insert into answers (game_id, round_no, player_id, choice, is_correct, is_first, points, elapsed_ms)
  values (v_game, g.current_round, p_player_id, p_choice, v_is_correct, v_first, v_points,
          (v_elapsed * 1000)::int)
  on conflict do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then return json_build_object('ok', false, 'reason', 'buinn_ad_svara'); end if;

  -- Ekkert um rétt/rangt fyrr en stjórnandi sýnir svarið.
  return json_build_object('ok', true);
end $$;

-- Allt sem sími þarf til að sýna rétta stöðu (líka eftir endurtengingu).
create or replace function public.my_state(p_player_id uuid, p_token uuid)
returns json language plpgsql security definer set search_path = public as $$
declare v_game uuid; g games%rowtype; p players%rowtype; a answers%rowtype; v_show boolean;
begin
  v_game := _check_player(p_player_id, p_token);
  select * into g from games where id = v_game;
  select * into p from players where id = p_player_id;
  select * into a from answers where game_id = v_game and round_no = g.current_round and player_id = p_player_id;
  v_show := g.state in ('reveal','leaderboard','finished');
  return json_build_object(
    'game', json_build_object('id', g.id, 'code', g.code, 'title', g.title, 'state', g.state,
              'current_round', g.current_round, 'total_rounds', g.total_rounds,
              'answer_seconds', g.answer_seconds, 'current_options', g.current_options,
              'current_correct', g.current_correct,
              'seconds_left', case when g.state = 'question'
                 then greatest(0, g.answer_seconds - extract(epoch from clock_timestamp() - g.round_started_at))
                 else null end),
    'player', json_build_object('name', p.name, 'score', p.score,
              'rank', (select count(*) + 1 from players x where x.game_id = v_game and x.score > p.score),
              'total', (select count(*) from players x where x.game_id = v_game)),
    'answer', case when a.player_id is null then null
              else json_build_object('choice', a.choice,
                     'correct', case when v_show then a.is_correct end,
                     'points',  case when v_show then a.points end,
                     'is_first', case when v_show then a.is_first end) end);
end $$;

-- ---------- Réttindi ------------------------------------------------

revoke all on all tables    in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
grant select on public.games, public.players to anon, authenticated;
grant execute on function
  public.create_game(text, text, int, jsonb, text),
  public.host_get_game(uuid, uuid),
  public.host_start_round(uuid, uuid, int),
  public.host_round_status(uuid, uuid),
  public.host_reveal(uuid, uuid),
  public.host_set_state(uuid, uuid, text),
  public.join_game(text, text),
  public.submit_answer(uuid, uuid, int),
  public.my_state(uuid, uuid)
to anon, authenticated;

-- ---------- Rauntími ------------------------------------------------
-- Símar hlusta á breytingar á leiknum (games-töflunni).
do $$ begin
  alter publication supabase_realtime add table public.games;
exception when duplicate_object then null;
end $$;

-- ---------- PIN stjórnanda – BREYTTU ÞESSU! -------------------------
insert into public.app_settings (key, value) values ('host_pin', 'BREYTTU-MER')
on conflict (key) do update set value = excluded.value;
