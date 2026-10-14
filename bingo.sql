-- =====================================================================
--  Hljómey Tónlistarbingó – viðbót við gagnagrunninn
--  Keyrðu setup.sql fyrst (einu sinni) og svo þessa skrá:
--  Supabase: SQL Editor -> New query -> líma allt -> Run.
--  Notar sama PIN og Pöbbkvissið.
-- =====================================================================

-- ---------- Töflur ----------------------------------------------------

-- Bingóleikir. Allir mega lesa (engin leyndarmál hér).
create table if not exists public.bingo_games (
  id            uuid primary key default gen_random_uuid(),
  code          text not null,
  title         text not null default 'Hljómey Tónlistarbingó',
  state         text not null default 'lobby'
                check (state in ('lobby','playing','claim','finished')),
  stages        jsonb not null default '["line","two_lines","full"]',
  stage_idx     int  not null default 0,            -- hvaða mynstur er spilað um núna
  card_mode     text not null default 'both'
                check (card_mode in ('both','song','artist_hard')),
  clip_seconds  int  not null default 15,
  total_songs   int  not null default 0,
  played_count  int  not null default 0,
  claim         jsonb,                               -- {stage, names:[...]} á meðan BINGÓ er sýnt
  winners       jsonb not null default '[]',         -- [{stage, name, at_song}]
  event_tag     text,
  created_at    timestamptz not null default now()
);
-- Stærð spjalds (5 = 5×5, 4 = 4×4, 3 = 3×3). Bætt við í útgáfu 2.
alter table public.bingo_games add column if not exists grid_size int not null default 5;
do $$ begin
  alter table public.bingo_games add constraint bingo_games_grid_size_chk check (grid_size in (3, 4, 5));
exception when duplicate_object then null;
end $$;

create index if not exists bingo_games_code_idx on public.bingo_games (code, created_at desc);

create table if not exists public.bingo_hosts (
  game_id    uuid primary key references public.bingo_games(id) on delete cascade,
  host_token uuid not null default gen_random_uuid()
);

-- Lögin í pottinum. Leynileg (hvað hefur verið spilað, rétt svör).
create table if not exists public.bingo_songs (
  game_id       uuid not null references public.bingo_games(id) on delete cascade,
  song_no       int  not null,
  meta          jsonb not null,          -- {title, artist, cover, deezer_id, preview, start}
  play_order    int  not null,
  played_seq    int,                     -- null = ekki spilað enn
  title_options jsonb,                   -- erfiða útgáfan: 4 lagaheiti
  title_correct int,
  primary key (game_id, song_no)
);

create table if not exists public.bingo_players (
  id        uuid primary key default gen_random_uuid(),
  game_id   uuid not null references public.bingo_games(id) on delete cascade,
  name      text not null,
  joined_at timestamptz not null default now(),
  unique (game_id, name)
);

create table if not exists public.bingo_player_secrets (
  player_id        uuid primary key references public.bingo_players(id) on delete cascade,
  token            uuid not null default gen_random_uuid(),
  card             int[] not null,       -- 25 reitir, miðjan (nr. 13) = -1 = fríreitur
  claim_block_until int not null default -1   -- falskt BINGÓ: bið þar til næsta lag er spilað
);

create table if not exists public.bingo_marks (
  player_id    uuid not null references public.bingo_players(id) on delete cascade,
  song_no      int  not null,
  marked       boolean not null default false,
  locked_until int not null default -1,    -- erfiða útgáfan: rangt gisk læsir reit fram að næsta lagi
  primary key (player_id, song_no)
);

alter table public.bingo_games          enable row level security;
alter table public.bingo_hosts          enable row level security;
alter table public.bingo_songs          enable row level security;
alter table public.bingo_players        enable row level security;
alter table public.bingo_player_secrets enable row level security;
alter table public.bingo_marks          enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'bingo_games' and policyname = 'bingo_games_read') then
    create policy bingo_games_read on public.bingo_games for select using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'bingo_players' and policyname = 'bingo_players_read') then
    create policy bingo_players_read on public.bingo_players for select using (true);
  end if;
end $$;

-- ---------- Hjálparföll ---------------------------------------------

create or replace function public._bingo_check_host(p_game_id uuid, p_host_token uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from bingo_hosts where game_id = p_game_id and host_token = p_host_token) then
    raise exception 'ogildur_stjornandi';
  end if;
end $$;

create or replace function public._bingo_check_player(p_player_id uuid, p_token uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_game uuid;
begin
  select p.game_id into v_game from bingo_players p join bingo_player_secrets s on s.player_id = p.id
   where p.id = p_player_id and s.token = p_token;
  if v_game is null then raise exception 'ogildur_leikmadur'; end if;
  return v_game;
end $$;

-- Hvaða reitir gilda: merktir OG spilaðir (+ fríreitur). Eitt sanngildi á reit.
create or replace function public._bingo_ok_cells(p_player_id uuid)
returns boolean[] language plpgsql security definer set search_path = public as $$
declare v_card int[]; v_game uuid; v_ok boolean[] := array[]::boolean[]; i int;
begin
  select s.card, p.game_id into v_card, v_game
    from bingo_player_secrets s join bingo_players p on p.id = s.player_id where s.player_id = p_player_id;
  for i in 1..array_length(v_card, 1) loop
    if v_card[i] = -1 then v_ok := v_ok || true;
    else
      v_ok := v_ok || exists (
        select 1 from bingo_marks m join bingo_songs b on b.game_id = v_game and b.song_no = m.song_no
         where m.player_id = p_player_id and m.song_no = v_card[i] and m.marked and b.played_seq is not null);
    end if;
  end loop;
  return v_ok;
end $$;

-- Fjöldi heilla lína (raðir, dálkar og 2 skálínur) – virkar fyrir 3×3, 4×4 og 5×5
create or replace function public._bingo_lines(ok boolean[])
returns int language plpgsql immutable as $$
declare n int := 0; k int; r int; c int; v_full boolean;
begin
  k := round(sqrt(array_length(ok, 1)))::int;
  for r in 0..k-1 loop                             -- raðir
    v_full := true; for c in 0..k-1 loop v_full := v_full and ok[r*k+c+1]; end loop;
    if v_full then n := n + 1; end if;
  end loop;
  for c in 0..k-1 loop                             -- dálkar
    v_full := true; for r in 0..k-1 loop v_full := v_full and ok[r*k+c+1]; end loop;
    if v_full then n := n + 1; end if;
  end loop;
  v_full := true; for r in 0..k-1 loop v_full := v_full and ok[r*k+r+1]; end loop;         -- skálína
  if v_full then n := n + 1; end if;
  v_full := true; for r in 0..k-1 loop v_full := v_full and ok[r*k+(k-1-r)+1]; end loop;   -- öfug skálína
  if v_full then n := n + 1; end if;
  return n;
end $$;

create or replace function public._bingo_pattern_met(ok boolean[], p_stage text)
returns boolean language plpgsql immutable as $$
begin
  if p_stage = 'line' then return _bingo_lines(ok) >= 1; end if;
  if p_stage = 'two_lines' then return _bingo_lines(ok) >= 2; end if;
  if p_stage = 'full' then return not (false = any(ok)); end if;
  return false;
end $$;

-- Finnur hvort kóði er Pöbbkviss eða bingó (fyrir sameiginlega innskráningarsíðu)
create or replace function public.find_game(p_code text)
returns json language plpgsql security definer set search_path = public as $$
declare v_q timestamptz; v_b timestamptz;
begin
  select max(created_at) into v_q from games
   where code = upper(trim(p_code)) and created_at > now() - interval '2 days';
  select max(created_at) into v_b from bingo_games
   where code = upper(trim(p_code)) and created_at > now() - interval '2 days';
  if v_q is null and v_b is null then return json_build_object('kind', null); end if;
  return json_build_object('kind', case when v_b is not null and (v_q is null or v_b > v_q) then 'bingo' else 'quiz' end);
end $$;

-- ---------- Stjórnandi ----------------------------------------------

-- p_songs = [{meta:{...}, title_options:[4], title_correct:0-3}, ...]
create or replace function public.bingo_create(
  p_pin text, p_title text, p_songs jsonb, p_stages jsonb, p_card_mode text,
  p_clip_seconds int, p_event_tag text default null)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_code text; v_id uuid; v_token uuid; v_n int; s jsonb; v_i int := 0;
  v_alphabet text := 'ABCDEFGHJKLMNPRSTUVXYZ';
begin
  if p_pin is distinct from (select value from app_settings where key = 'host_pin') then
    raise exception 'rangt_pin';
  end if;
  v_n := jsonb_array_length(p_songs);
  if v_n < 8 or v_n > 150 then raise exception 'of_fa_log'; end if;   -- nákvæmari athugun í bingo_new_game
  if jsonb_typeof(p_stages) <> 'array' or jsonb_array_length(p_stages) < 1
     or exists (select 1 from jsonb_array_elements_text(p_stages) x where x not in ('line','two_lines','full')) then
    raise exception 'ogild_mynstur';
  end if;

  loop
    v_code := '';
    for i in 1..4 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from bingo_games where code = v_code and state <> 'finished'
                            and created_at > now() - interval '2 days')
          and not exists (select 1 from games where code = v_code and state <> 'finished'
                            and created_at > now() - interval '2 days');
  end loop;

  insert into bingo_games (code, title, stages, card_mode, clip_seconds, total_songs, event_tag)
  values (v_code, coalesce(nullif(trim(p_title), ''), 'Hljómey Tónlistarbingó'), p_stages,
          coalesce(p_card_mode, 'both'), greatest(5, least(30, coalesce(p_clip_seconds, 15))), v_n, p_event_tag)
  returning id into v_id;
  insert into bingo_hosts (game_id) values (v_id) returning host_token into v_token;

  for s in select * from jsonb_array_elements(p_songs) loop
    insert into bingo_songs (game_id, song_no, meta, play_order, title_options, title_correct)
    values (v_id, v_i, s->'meta', 0, s->'title_options', (s->>'title_correct')::int);
    v_i := v_i + 1;
  end loop;
  -- Handahófskennd spilunarröð, ákveðin á þjóninum
  update bingo_songs b set play_order = x.rn
    from (select song_no, row_number() over (order by random()) rn from bingo_songs where game_id = v_id) x
   where b.game_id = v_id and b.song_no = x.song_no;

  return json_build_object('game_id', v_id, 'code', v_code, 'host_token', v_token);
end $$;

-- Útgáfa 2: sama og bingo_create en með stærð spjalds (3, 4 eða 5)
create or replace function public.bingo_new_game(
  p_pin text, p_title text, p_songs jsonb, p_stages jsonb, p_card_mode text,
  p_clip_seconds int, p_grid_size int, p_event_tag text default null)
returns json language plpgsql security definer set search_path = public as $$
declare v_res json; v_size int := coalesce(p_grid_size, 5); v_need int;
begin
  if v_size not in (3, 4, 5) then raise exception 'ogild_staerd'; end if;
  v_need := v_size * v_size - (v_size % 2);
  if jsonb_array_length(p_songs) < v_need then raise exception 'of_fa_log'; end if;
  v_res := bingo_create(p_pin, p_title, p_songs, p_stages, p_card_mode, p_clip_seconds, p_event_tag);
  update bingo_games set grid_size = v_size where id = (v_res->>'game_id')::uuid;
  return v_res;
end $$;

create or replace function public.bingo_host_get(p_game_id uuid, p_host_token uuid)
returns json language plpgsql security definer set search_path = public as $$
begin
  perform _bingo_check_host(p_game_id, p_host_token);
  return json_build_object(
    'game',  (select row_to_json(g) from bingo_games g where g.id = p_game_id),
    'songs', (select coalesce(json_agg(json_build_object('song_no', song_no, 'meta', meta,
                'play_order', play_order, 'played_seq', played_seq) order by play_order), '[]'::json)
              from bingo_songs where game_id = p_game_id));
end $$;

-- Næsta lag: þjónninn velur (samkvæmt fyrirfram ákveðinni röð) og skráir sem spilað.
create or replace function public.bingo_play_next(p_game_id uuid, p_host_token uuid)
returns json language plpgsql security definer set search_path = public as $$
declare g bingo_games%rowtype; v_song int; v_meta jsonb;
begin
  perform _bingo_check_host(p_game_id, p_host_token);
  select * into g from bingo_games where id = p_game_id for update;
  if g.state not in ('lobby','playing') then return json_build_object('ok', false, 'reason', g.state); end if;
  select song_no, meta into v_song, v_meta from bingo_songs
   where game_id = p_game_id and played_seq is null order by play_order limit 1;
  if v_song is null then return json_build_object('ok', false, 'reason', 'buid'); end if;
  update bingo_songs set played_seq = g.played_count + 1 where game_id = p_game_id and song_no = v_song;
  update bingo_games set played_count = played_count + 1, state = 'playing' where id = p_game_id;
  return json_build_object('ok', true, 'song_no', v_song, 'meta', v_meta, 'seq', g.played_count + 1);
end $$;

-- Spjöld vinningshafa til að sýna á stóra skjánum
create or replace function public.bingo_claim_cards(p_game_id uuid, p_host_token uuid)
returns json language plpgsql security definer set search_path = public as $$
declare g bingo_games%rowtype; v_out json;
begin
  perform _bingo_check_host(p_game_id, p_host_token);
  select * into g from bingo_games where id = p_game_id;
  select coalesce(json_agg(json_build_object(
           'name', p.name,
           'ok', _bingo_ok_cells(p.id),
           'cells', (select json_agg(case when c = -1 then null else
                        (select json_build_object('title', b.meta->>'title', 'artist', b.meta->>'artist',
                                                  'played', b.played_seq is not null)
                           from bingo_songs b where b.game_id = p_game_id and b.song_no = c) end order by ord)
                     from unnest(s.card) with ordinality u(c, ord))
         )), '[]'::json) into v_out
    from bingo_players p join bingo_player_secrets s on s.player_id = p.id
   where p.game_id = p_game_id
     and p.name in (select jsonb_array_elements_text(coalesce(g.claim->'names', '[]'::jsonb)));
  return v_out;
end $$;

-- Halda áfram eftir BINGÓ (næsta mynstur) eða ljúka leik
create or replace function public.bingo_host_continue(p_game_id uuid, p_host_token uuid, p_finish boolean default false)
returns json language plpgsql security definer set search_path = public as $$
declare g bingo_games%rowtype;
begin
  perform _bingo_check_host(p_game_id, p_host_token);
  select * into g from bingo_games where id = p_game_id for update;
  if p_finish or (g.state = 'claim' and g.stage_idx + 1 >= jsonb_array_length(g.stages)) then
    update bingo_games set state = 'finished' where id = p_game_id;
  elsif g.state = 'claim' then
    update bingo_games set state = 'playing', stage_idx = stage_idx + 1, claim = null where id = p_game_id;
  end if;
  return (select row_to_json(x) from bingo_games x where x.id = p_game_id);
end $$;

-- ---------- Leikmenn ------------------------------------------------

create or replace function public.bingo_join(p_code text, p_name text)
returns json language plpgsql security definer set search_path = public as $$
declare v_game uuid; v_state text; v_name text; v_pid uuid; v_token uuid; v_songs int[]; v_card int[];
        v_size int; v_need int; v_mid int;
begin
  select id, state, grid_size into v_game, v_state, v_size from bingo_games
   where code = upper(trim(p_code)) and created_at > now() - interval '2 days'
   order by created_at desc limit 1;
  if v_game is null then raise exception 'leikur_fannst_ekki'; end if;
  if v_state = 'finished' then raise exception 'leik_lokid'; end if;
  v_name := left(regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g'), 20);
  if length(v_name) < 1 then raise exception 'vantar_nafn'; end if;
  if (select count(*) from bingo_players where game_id = v_game) >= 500 then raise exception 'leikur_fullur'; end if;
  if exists (select 1 from bingo_players where game_id = v_game and lower(name) = lower(v_name)) then
    raise exception 'nafn_tekid';
  end if;

  -- Oddatölustærðir (3×3, 5×5) fá fríreit í miðjunni; 4×4 er án fríreits
  v_need := v_size * v_size - (v_size % 2);
  select array_agg(song_no) into v_songs
    from (select song_no from bingo_songs where game_id = v_game order by random() limit v_need) x;
  if v_size % 2 = 1 then
    v_mid := (v_size * v_size) / 2;
    v_card := v_songs[1:v_mid] || array[-1] || v_songs[v_mid+1:v_need];
  else
    v_card := v_songs;
  end if;

  insert into bingo_players (game_id, name) values (v_game, v_name) returning id into v_pid;
  insert into bingo_player_secrets (player_id, card) values (v_pid, v_card) returning token into v_token;
  return json_build_object('game_id', v_game, 'player_id', v_pid, 'token', v_token, 'name', v_name);
end $$;

-- Spjaldið mitt. Í erfiðu útgáfunni er lagaheitið falið.
create or replace function public.bingo_my_card(p_player_id uuid, p_token uuid)
returns json language plpgsql security definer set search_path = public as $$
declare v_game uuid; g bingo_games%rowtype; v_card int[]; v_name text;
begin
  v_game := _bingo_check_player(p_player_id, p_token);
  select * into g from bingo_games where id = v_game;
  select s.card, p.name into v_card, v_name from bingo_player_secrets s join bingo_players p on p.id = s.player_id
   where s.player_id = p_player_id;
  return json_build_object(
    'game', json_build_object('id', g.id, 'code', g.code, 'title', g.title, 'state', g.state,
              'stages', g.stages, 'stage_idx', g.stage_idx, 'card_mode', g.card_mode, 'grid_size', g.grid_size,
              'played_count', g.played_count, 'total_songs', g.total_songs,
              'claim', g.claim, 'winners', g.winners),
    'name', v_name,
    'cells', (select json_agg(case when c = -1 then json_build_object('free', true) else
                (select json_build_object(
                    'song_no', b.song_no,
                    'title',  case when g.card_mode = 'artist_hard' then null else b.meta->>'title' end,
                    'artist', case when g.card_mode = 'song' then null else b.meta->>'artist' end,
                    'options', case when g.card_mode = 'artist_hard' then b.title_options end,
                    'marked', coalesce(m.marked, false),
                    'locked', coalesce(m.locked_until, -1) >= g.played_count)
                   from bingo_songs b left join bingo_marks m on m.player_id = p_player_id and m.song_no = b.song_no
                  where b.game_id = v_game and b.song_no = c) end order by ord)
              from unnest(v_card) with ordinality u(c, ord)));
end $$;

-- Merkja/afmerkja reit. Erfiða útgáfan: p_guess = valið lagaheiti (0-3).
create or replace function public.bingo_mark(p_player_id uuid, p_token uuid, p_song_no int,
                                             p_marked boolean, p_guess int default null)
returns json language plpgsql security definer set search_path = public as $$
declare v_game uuid; g bingo_games%rowtype; v_card int[]; v_correct int; v_locked int;
begin
  v_game := _bingo_check_player(p_player_id, p_token);
  select * into g from bingo_games where id = v_game;
  if g.state = 'finished' then return json_build_object('ok', false, 'reason', 'leik_lokid'); end if;
  select card into v_card from bingo_player_secrets where player_id = p_player_id;
  if p_song_no is null or p_song_no = -1 or not (p_song_no = any(v_card)) then
    return json_build_object('ok', false, 'reason', 'ekki_a_spjaldi');
  end if;

  if g.card_mode = 'artist_hard' and p_marked then
    select locked_until into v_locked from bingo_marks where player_id = p_player_id and song_no = p_song_no;
    if coalesce(v_locked, -1) >= g.played_count then
      return json_build_object('ok', false, 'reason', 'laest');
    end if;
    select title_correct into v_correct from bingo_songs where game_id = v_game and song_no = p_song_no;
    if p_guess is distinct from v_correct then
      insert into bingo_marks (player_id, song_no, marked, locked_until) values (p_player_id, p_song_no, false, g.played_count)
      on conflict (player_id, song_no) do update set marked = false, locked_until = g.played_count;
      return json_build_object('ok', false, 'reason', 'rangt');
    end if;
  end if;

  insert into bingo_marks (player_id, song_no, marked) values (p_player_id, p_song_no, p_marked)
  on conflict (player_id, song_no) do update set marked = p_marked;
  return json_build_object('ok', true);
end $$;

-- BINGÓ! Kerfið staðfestir sjálft: merktir reitir verða að hafa verið spilaðir.
create or replace function public.bingo_claim(p_player_id uuid, p_token uuid)
returns json language plpgsql security definer set search_path = public as $$
declare v_game uuid; g bingo_games%rowtype; v_stage text; v_name text; v_block int; v_ok boolean[];
begin
  v_game := _bingo_check_player(p_player_id, p_token);
  select * into g from bingo_games where id = v_game for update;   -- ein krafa í einu
  if g.state not in ('playing','claim') then return json_build_object('ok', false, 'reason', 'ekki_i_gangi'); end if;
  v_stage := g.stages->>g.stage_idx;
  select name into v_name from bingo_players where id = p_player_id;

  if g.state = 'claim' and (g.claim->'names') ? v_name then
    return json_build_object('ok', true, 'stage', v_stage);
  end if;
  select claim_block_until into v_block from bingo_player_secrets where player_id = p_player_id;
  -- (bið gildir ekki þegar öll lög hafa verið spiluð, því þá kemur ekkert „næsta lag“)
  if v_block >= g.played_count and g.played_count < g.total_songs then
    return json_build_object('ok', false, 'reason', 'bida');
  end if;

  v_ok := _bingo_ok_cells(p_player_id);
  if not _bingo_pattern_met(v_ok, v_stage) then
    update bingo_player_secrets set claim_block_until = g.played_count where player_id = p_player_id;
    return json_build_object('ok', false, 'reason', 'ekki_bingo', 'stage', v_stage);
  end if;

  -- Fleiri geta unnið sama mynstur ef þeir kalla áður en stjórnandi heldur áfram
  update bingo_games set
    state  = 'claim',
    claim  = case when state = 'claim' then jsonb_set(claim, '{names}', (claim->'names') || to_jsonb(v_name))
                  else jsonb_build_object('stage', v_stage, 'names', jsonb_build_array(v_name), 'at_song', played_count) end,
    winners = winners || jsonb_build_array(jsonb_build_object('stage', v_stage, 'name', v_name, 'at_song', played_count))
  where id = v_game;
  return json_build_object('ok', true, 'stage', v_stage);
end $$;

-- ---------- Réttindi og rauntími -----------------------------------

revoke all on public.bingo_games, public.bingo_hosts, public.bingo_songs, public.bingo_players,
              public.bingo_player_secrets, public.bingo_marks from anon, authenticated;
revoke all on function
  public._bingo_check_host(uuid, uuid), public._bingo_check_player(uuid, uuid),
  public._bingo_ok_cells(uuid), public._bingo_lines(boolean[]), public._bingo_pattern_met(boolean[], text),
  public.find_game(text), public.bingo_create(text, text, jsonb, jsonb, text, int, text),
  public.bingo_new_game(text, text, jsonb, jsonb, text, int, int, text),
  public.bingo_host_get(uuid, uuid), public.bingo_play_next(uuid, uuid), public.bingo_claim_cards(uuid, uuid),
  public.bingo_host_continue(uuid, uuid, boolean), public.bingo_join(text, text),
  public.bingo_my_card(uuid, uuid), public.bingo_mark(uuid, uuid, int, boolean, int), public.bingo_claim(uuid, uuid)
from public, anon, authenticated;

grant select on public.bingo_games, public.bingo_players to anon, authenticated;
grant execute on function
  public.find_game(text), public.bingo_create(text, text, jsonb, jsonb, text, int, text),
  public.bingo_new_game(text, text, jsonb, jsonb, text, int, int, text),
  public.bingo_host_get(uuid, uuid), public.bingo_play_next(uuid, uuid), public.bingo_claim_cards(uuid, uuid),
  public.bingo_host_continue(uuid, uuid, boolean), public.bingo_join(text, text),
  public.bingo_my_card(uuid, uuid), public.bingo_mark(uuid, uuid, int, boolean, int), public.bingo_claim(uuid, uuid)
to anon, authenticated;

do $$ begin
  alter publication supabase_realtime add table public.bingo_games;
exception when duplicate_object then null;
end $$;

-- Láta Supabase endurlesa föllin
notify pgrst, 'reload schema';

-- Staðfesting: á að sýna eina línu með "Bingó uppsett" og 16 föll
select 'Bingó uppsett' as stada, count(*) as fjoldi_falla
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and (p.proname like '%bingo%' or p.proname = 'find_game');
