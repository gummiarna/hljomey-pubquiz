-- =====================================================================
--  Hljómey – Talnabingó (hefðbundið bingó með tölunum 1–75)
--
--  Stjórnandi snýr hjóli á stóra skjánum, þjónninn velur töluna af
--  handahófi. Hver leikmaður fær 5×5 spjald: B 1–15, I 16–30, N 31–45
--  (fríreitur í miðjunni), G 46–60, O 61–75. Spilað er um eitt eða fleiri
--  mynstur í röð: ein lína, B, I, N, G, O (heill dálkur), X eða allt spjaldið.
--
--  Keyrðu setup.sql, bingo.sql og gestapin.sql fyrst. Supabase: SQL Editor
--  -> New query -> líma allt -> Run. Má keyra aftur.
-- =====================================================================

create table if not exists public.tb_games (
  id         uuid primary key default gen_random_uuid(),
  code       text not null,
  title      text not null default 'Hljómey Bingó',
  state      text not null default 'lobby' check (state in ('lobby', 'playing', 'claim', 'finished')),
  stages     jsonb not null default '["line","full"]',
  stage_idx  int not null default 0,
  called     int[] not null default '{}',     -- tölur sem komnar eru, í röð
  claim      jsonb,                           -- {stage, names:[...]} á meðan BINGÓ er sýnt
  winners    jsonb not null default '[]',     -- [{stage, name, at}]
  created_at timestamptz not null default now()
);
create index if not exists tb_games_code_idx on public.tb_games (code, created_at desc);

create table if not exists public.tb_hosts (
  game_id    uuid primary key references public.tb_games(id) on delete cascade,
  host_token uuid not null default gen_random_uuid()
);

create table if not exists public.tb_players (
  id        uuid primary key default gen_random_uuid(),
  game_id   uuid not null references public.tb_games(id) on delete cascade,
  name      text not null,
  joined_at timestamptz not null default now(),
  unique (game_id, name)
);

create table if not exists public.tb_secrets (
  player_id   uuid primary key references public.tb_players(id) on delete cascade,
  token       uuid not null default gen_random_uuid(),
  card        int[] not null,                                   -- 25 reitir í röðum, miðjan (13) = 0 = fríreitur
  marked      boolean[] not null default array_fill(false, array[25]),
  claim_block int not null default -1                           -- falskt BINGÓ: bið þar til næsta tala kemur
);

alter table public.tb_games   enable row level security;
alter table public.tb_hosts   enable row level security;
alter table public.tb_players enable row level security;
alter table public.tb_secrets enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'tb_games' and policyname = 'tb_games_read') then
    create policy tb_games_read on public.tb_games for select using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'tb_players' and policyname = 'tb_players_read') then
    create policy tb_players_read on public.tb_players for select using (true);
  end if;
end $$;

-- ---------- Hjálparföll ---------------------------------------------

create or replace function public._tb_check_host(p_game_id uuid, p_host_token uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from tb_hosts where game_id = p_game_id and host_token = p_host_token) then
    raise exception 'ogildur_stjornandi';
  end if;
end $$;

create or replace function public._tb_check_player(p_player_id uuid, p_token uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_game uuid;
begin
  select p.game_id into v_game from tb_players p join tb_secrets s on s.player_id = p.id
   where p.id = p_player_id and s.token = p_token;
  if v_game is null then raise exception 'ogildur_leikmadur'; end if;
  return v_game;
end $$;

-- Gildir reitir: fríreitur, eða merktur reitur með tölu sem er komin
create or replace function public._tb_ok(p_player_id uuid)
returns boolean[] language plpgsql stable security definer set search_path = public as $$
declare s tb_secrets; v_called int[]; v_ok boolean[] := array[]::boolean[]; i int;
begin
  select * into s from tb_secrets where player_id = p_player_id;
  select g.called into v_called from tb_games g join tb_players p on p.game_id = g.id where p.id = p_player_id;
  for i in 1..25 loop
    v_ok := v_ok || (s.card[i] = 0 or (s.marked[i] and s.card[i] = any(v_called)));
  end loop;
  return v_ok;
end $$;

-- Er mynstrið komið? line = röð, dálkur eða skálína; B–O = heill dálkur; X = báðar skálínur; full = allt
create or replace function public._tb_met(ok boolean[], p_stage text)
returns boolean language plpgsql immutable as $$
declare c int; r int; v boolean := true;
begin
  if p_stage = 'line' then
    for r in 0..4 loop
      if ok[r*5+1] and ok[r*5+2] and ok[r*5+3] and ok[r*5+4] and ok[r*5+5] then return true; end if;
      if ok[r+1] and ok[r+6] and ok[r+11] and ok[r+16] and ok[r+21] then return true; end if;
    end loop;
    return (ok[1] and ok[7] and ok[13] and ok[19] and ok[25]) or (ok[5] and ok[9] and ok[13] and ok[17] and ok[21]);
  end if;
  c := position(p_stage in 'BINGO') - 1;
  if length(p_stage) = 1 and c >= 0 then
    for r in 0..4 loop v := v and ok[r*5+c+1]; end loop;
    return v;
  end if;
  if p_stage = 'X' then
    return ok[1] and ok[7] and ok[13] and ok[19] and ok[25] and ok[5] and ok[9] and ok[17] and ok[21];
  end if;
  if p_stage = 'full' then return not (false = any(ok)); end if;
  return false;
end $$;

-- ---------- Stjórnandi ----------------------------------------------

create or replace function public.tb_create(p_pin text, p_title text, p_stages jsonb)
returns json language plpgsql security definer set search_path = public as $$
declare v_code text; v_id uuid; v_token uuid; v_alphabet text := 'ABCDEFGHJKLMNPRSTUVXYZ';
begin
  perform _pin_any(p_pin);
  if login_required() and _host_uid() is null and (_jwt() is not null or session_user = 'authenticator') then
    raise exception 'innskraning_vantar';
  end if;
  if jsonb_typeof(p_stages) <> 'array' or jsonb_array_length(p_stages) < 1
     or exists (select 1 from jsonb_array_elements_text(p_stages) x where x not in ('line','B','I','N','G','O','X','full')) then
    raise exception 'ogild_mynstur';
  end if;
  loop
    v_code := '';
    for i in 1..4 loop v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1); end loop;
    exit when not exists (select 1 from tb_games where code = v_code and created_at > now() - interval '2 days')
          and not exists (select 1 from bingo_games where code = v_code and created_at > now() - interval '2 days')
          and not exists (select 1 from games where code = v_code and created_at > now() - interval '2 days');
  end loop;
  insert into tb_games (code, title, stages) values (v_code, coalesce(nullif(trim(p_title), ''), 'Hljómey Bingó'), p_stages)
    returning id into v_id;
  insert into tb_hosts (game_id) values (v_id) returning host_token into v_token;
  return json_build_object('game_id', v_id, 'code', v_code, 'host_token', v_token);
end $$;

create or replace function public.tb_host_get(p_game_id uuid, p_host_token uuid)
returns json language plpgsql security definer set search_path = public as $$
begin
  perform _tb_check_host(p_game_id, p_host_token);
  return json_build_object(
    'game', (select row_to_json(g) from tb_games g where g.id = p_game_id),
    'players', (select coalesce(json_agg(name order by joined_at), '[]'::json) from tb_players where game_id = p_game_id));
end $$;

-- Hjólinu snúið: þjónninn velur tölu sem ekki er komin
create or replace function public.tb_spin(p_game_id uuid, p_host_token uuid)
returns json language plpgsql security definer set search_path = public as $$
declare g tb_games; v_n int;
begin
  perform _tb_check_host(p_game_id, p_host_token);
  select * into g from tb_games where id = p_game_id for update;
  if g.state not in ('lobby', 'playing') then return json_build_object('ok', false, 'reason', g.state); end if;
  select n into v_n from generate_series(1, 75) n where not (n = any(g.called)) order by random() limit 1;
  if v_n is null then return json_build_object('ok', false, 'reason', 'buid'); end if;
  update tb_games set called = called || v_n, state = 'playing' where id = p_game_id;
  return json_build_object('ok', true, 'number', v_n, 'count', coalesce(array_length(g.called, 1), 0) + 1);
end $$;

create or replace function public.tb_claim_cards(p_game_id uuid, p_host_token uuid)
returns json language plpgsql security definer set search_path = public as $$
declare g tb_games;
begin
  perform _tb_check_host(p_game_id, p_host_token);
  select * into g from tb_games where id = p_game_id;
  return (select coalesce(json_agg(json_build_object('name', p.name, 'card', s.card, 'ok', _tb_ok(p.id))), '[]'::json)
            from tb_players p join tb_secrets s on s.player_id = p.id
           where p.game_id = p_game_id
             and p.name in (select jsonb_array_elements_text(coalesce(g.claim->'names', '[]'::jsonb))));
end $$;

create or replace function public.tb_host_continue(p_game_id uuid, p_host_token uuid, p_finish boolean default false)
returns json language plpgsql security definer set search_path = public as $$
declare g tb_games;
begin
  perform _tb_check_host(p_game_id, p_host_token);
  select * into g from tb_games where id = p_game_id for update;
  if p_finish or (g.state = 'claim' and g.stage_idx + 1 >= jsonb_array_length(g.stages)) then
    update tb_games set state = 'finished' where id = p_game_id;
  elsif g.state = 'claim' then
    update tb_games set state = 'playing', stage_idx = stage_idx + 1, claim = null where id = p_game_id;
  end if;
  return (select row_to_json(x) from tb_games x where x.id = p_game_id);
end $$;

-- ---------- Leikmenn ------------------------------------------------

create or replace function public.tb_find(p_code text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from tb_games where code = upper(trim(p_code)) and state <> 'finished'
                  and created_at > now() - interval '2 days'
                  and created_at >= coalesce((select max(created_at) from bingo_games where code = upper(trim(p_code))), '-infinity')
                  and created_at >= coalesce((select max(created_at) from games where code = upper(trim(p_code))), '-infinity'));
$$;

create or replace function public.tb_join(p_code text, p_name text)
returns json language plpgsql security definer set search_path = public as $$
declare v_game uuid; v_state text; v_name text; v_pid uuid; v_token uuid; v_card int[] := array_fill(0, array[25]);
        c int; r int; v_col int[];
begin
  select id, state into v_game, v_state from tb_games
   where code = upper(trim(p_code)) and created_at > now() - interval '2 days' order by created_at desc limit 1;
  if v_game is null then raise exception 'leikur_fannst_ekki'; end if;
  if v_state = 'finished' then raise exception 'leik_lokid'; end if;
  v_name := left(regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g'), 20);
  if length(v_name) < 1 then raise exception 'vantar_nafn'; end if;
  if (select count(*) from tb_players where game_id = v_game) >= 500 then raise exception 'leikur_fullur'; end if;
  if exists (select 1 from tb_players where game_id = v_game and lower(name) = lower(v_name)) then raise exception 'nafn_tekid'; end if;

  -- Hver dálkur fær 5 ólíkar tölur úr sínu bili (B 1–15, I 16–30 …), í hækkandi röð
  for c in 0..4 loop
    select array_agg(n order by n) into v_col from (select n from generate_series(c*15+1, c*15+15) n order by random() limit 5) x;
    for r in 0..4 loop v_card[r*5+c+1] := v_col[r+1]; end loop;
  end loop;
  v_card[13] := 0;   -- fríreitur

  insert into tb_players (game_id, name) values (v_game, v_name) returning id into v_pid;
  insert into tb_secrets (player_id, card) values (v_pid, v_card) returning token into v_token;
  return json_build_object('game_id', v_game, 'player_id', v_pid, 'token', v_token, 'name', v_name);
end $$;

create or replace function public.tb_my_card(p_player_id uuid, p_token uuid)
returns json language plpgsql security definer set search_path = public as $$
declare v_game uuid; g tb_games; s tb_secrets;
begin
  v_game := _tb_check_player(p_player_id, p_token);
  select * into g from tb_games where id = v_game;
  select * into s from tb_secrets where player_id = p_player_id;
  return json_build_object('game', row_to_json(g), 'name', (select name from tb_players where id = p_player_id),
                           'card', s.card, 'marked', s.marked);
end $$;

create or replace function public.tb_mark(p_player_id uuid, p_token uuid, p_cell int, p_marked boolean)
returns json language plpgsql security definer set search_path = public as $$
declare v_game uuid;
begin
  v_game := _tb_check_player(p_player_id, p_token);
  if p_cell not between 1 and 25 or p_cell = 13 then return json_build_object('ok', false); end if;
  update tb_secrets set marked[p_cell] = coalesce(p_marked, false) where player_id = p_player_id;
  return json_build_object('ok', true);
end $$;

-- BINGÓ! Kerfið staðfestir: merktir reitir verða að vera komnir upp
create or replace function public.tb_claim(p_player_id uuid, p_token uuid)
returns json language plpgsql security definer set search_path = public as $$
declare v_game uuid; g tb_games; v_stage text; v_name text; v_block int; v_n int;
begin
  v_game := _tb_check_player(p_player_id, p_token);
  select * into g from tb_games where id = v_game for update;
  if g.state not in ('playing', 'claim') then return json_build_object('ok', false, 'reason', 'ekki_i_gangi'); end if;
  v_stage := g.stages->>g.stage_idx;
  v_n := coalesce(array_length(g.called, 1), 0);
  select name into v_name from tb_players where id = p_player_id;
  if g.state = 'claim' and (g.claim->'names') ? v_name then return json_build_object('ok', true, 'stage', v_stage); end if;
  select claim_block into v_block from tb_secrets where player_id = p_player_id;
  if v_block >= v_n and v_n < 75 then return json_build_object('ok', false, 'reason', 'bida'); end if;
  if not _tb_met(_tb_ok(p_player_id), v_stage) then
    update tb_secrets set claim_block = v_n where player_id = p_player_id;
    return json_build_object('ok', false, 'reason', 'ekki_bingo', 'stage', v_stage);
  end if;
  update tb_games set
    state = 'claim',
    claim = case when state = 'claim' then jsonb_set(claim, '{names}', (claim->'names') || to_jsonb(v_name))
                 else jsonb_build_object('stage', v_stage, 'names', jsonb_build_array(v_name), 'at', v_n) end,
    winners = winners || jsonb_build_array(jsonb_build_object('stage', v_stage, 'name', v_name, 'at', v_n))
  where id = v_game;
  return json_build_object('ok', true, 'stage', v_stage);
end $$;

-- ---------- Réttindi og rauntími -----------------------------------

revoke all on public.tb_games, public.tb_hosts, public.tb_players, public.tb_secrets from anon, authenticated;
grant select on public.tb_games, public.tb_players to anon, authenticated;
revoke all on function public._tb_check_host(uuid, uuid), public._tb_check_player(uuid, uuid), public._tb_ok(uuid),
  public._tb_met(boolean[], text) from public, anon, authenticated;
grant execute on function public.tb_create(text, text, jsonb), public.tb_host_get(uuid, uuid), public.tb_spin(uuid, uuid),
  public.tb_claim_cards(uuid, uuid), public.tb_host_continue(uuid, uuid, boolean), public.tb_find(text),
  public.tb_join(text, text), public.tb_my_card(uuid, uuid), public.tb_mark(uuid, uuid, int, boolean),
  public.tb_claim(uuid, uuid) to anon, authenticated;

do $$ begin
  alter publication supabase_realtime add table public.tb_games;
exception when duplicate_object then null; when undefined_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.tb_players;
exception when duplicate_object then null; when undefined_object then null;
end $$;

select 'Talnabingó tilbúið' as staða;
