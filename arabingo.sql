-- =====================================================================
--  Hljómey – Hvaða ár? Bingó
--
--  Hjólið á stóra skjánum velur flokk (áratugur, árið, flytjandi, heiti
--  lagsins, fyrir/eftir 2000 eða íslenskt). Lag spilast og allir svara í
--  símanum. Þeir sem svara rétt fá sjálfkrafa merkt við reit af þeim flokki
--  á spjaldinu sínu. Fyrstur með línu (og svo allt spjaldið) fær BINGÓ.
--  Lögin koma úr lagabanka „Hvaða ár?“ (ha_songs).
--
--  Keyrðu á eftir hvadaar.sql og talnabingo.sql. Supabase: SQL Editor
--  -> New query -> líma allt -> Run. Má keyra aftur.
-- =====================================================================

create table if not exists public.hb_games (
  id          uuid primary key default gen_random_uuid(),
  code        text not null,
  title       text not null default 'Hvaða ár? Bingó',
  state       text not null default 'lobby' check (state in ('lobby', 'question', 'reveal', 'finished')),
  mix         text not null default 'blandad' check (mix in ('blandad', 'is', 'erl')),
  cats        text[] not null,                    -- flokkarnir á hjólinu og spjöldunum
  secs        int not null default 25,
  stages      jsonb not null default '["line","full"]',
  stage_idx   int not null default 0,
  stage_won   boolean not null default false,     -- einhver fékk BINGÓ í þessari umferð
  round_no    int not null default 0,
  category    text,
  options     jsonb,                              -- svarmöguleikar (opinberir)
  started_at  timestamptz,
  reveal      jsonb,                              -- {title, artist, year, cover, answer_idx, correct, new_winners}
  winners     jsonb not null default '[]',        -- [{stage, name, round}]
  created_at  timestamptz not null default now()
);
create index if not exists hb_games_code_idx on public.hb_games (code, created_at desc);

create table if not exists public.hb_hosts (
  game_id    uuid primary key references public.hb_games(id) on delete cascade,
  host_token uuid not null default gen_random_uuid()
);

-- Lögin í leiknum (leynileg)
create table if not exists public.hb_songs (
  game_id     uuid not null references public.hb_games(id) on delete cascade,
  ord         int not null,
  title       text not null,
  artist      text not null,
  year        int not null,
  lang        text not null,
  cover       text not null default '',
  deezer_id   bigint,
  spotify_uri text,
  used        boolean not null default false,
  primary key (game_id, ord)
);

-- Umferðir (leynilegar þar til svarið er sýnt)
create table if not exists public.hb_rounds (
  game_id    uuid not null references public.hb_games(id) on delete cascade,
  round_no   int not null,
  ord        int not null,
  category   text not null,
  answer_idx int not null,
  primary key (game_id, round_no)
);

create table if not exists public.hb_players (
  id        uuid primary key default gen_random_uuid(),
  game_id   uuid not null references public.hb_games(id) on delete cascade,
  name      text not null,
  score     int not null default 0,
  joined_at timestamptz not null default now(),
  unique (game_id, name)
);
create index if not exists hb_players_game_idx on public.hb_players (game_id);

create table if not exists public.hb_secrets (
  player_id uuid primary key references public.hb_players(id) on delete cascade,
  token     uuid not null default gen_random_uuid(),
  card      text[] not null,                    -- 25 reitir, flokkur í hverjum; 13 = 'free'
  marked    boolean[] not null
);

create table if not exists public.hb_answers (
  game_id    uuid not null references public.hb_games(id) on delete cascade,
  round_no   int not null,
  player_id  uuid not null references public.hb_players(id) on delete cascade,
  choice     int not null,
  ok         boolean not null default false,
  cell       int,                               -- reiturinn sem var merktur (1–25)
  elapsed_ms int not null default 0,
  primary key (game_id, round_no, player_id)
);

alter table public.hb_games   enable row level security;
alter table public.hb_hosts   enable row level security;
alter table public.hb_songs   enable row level security;
alter table public.hb_rounds  enable row level security;
alter table public.hb_players enable row level security;
alter table public.hb_secrets enable row level security;
alter table public.hb_answers enable row level security;

drop policy if exists hb_games_read on public.hb_games;
drop policy if exists hb_players_read on public.hb_players;
create policy hb_games_read on public.hb_games for select using (true);
create policy hb_players_read on public.hb_players for select using (true);

-- ---------- Hjálparföll ---------------------------------------------

create or replace function public._hb_host(p_game uuid, p_token uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from hb_hosts where game_id = p_game and host_token = p_token) then
    raise exception 'ogildur_stjornandi';
  end if;
end $$;

create or replace function public._hb_player(p_player uuid, p_token uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_game uuid;
begin
  select p.game_id into v_game from hb_players p join hb_secrets s on s.player_id = p.id
   where p.id = p_player and s.token = p_token;
  if v_game is null then raise exception 'ogildur_leikmadur'; end if;
  return v_game;
end $$;

-- Stokkar lista (jsonb) og skilar nýjum lista og stöðu rétta svarsins
create or replace function public._hb_shuffle(p_right text, p_wrong text[])
returns jsonb language plpgsql volatile as $$
declare v jsonb;
begin
  select jsonb_agg(x order by random()) into v from unnest(array[p_right] || p_wrong) x;
  return jsonb_build_object('options', v, 'answer_idx',
    (select (i - 1) from jsonb_array_elements_text(v) with ordinality t(x, i) where x = p_right limit 1));
end $$;

-- Hreinsar „- 2013 Remaster“, „(Radio Edit)“ o.fl. af heitum laga
create or replace function public._hb_clean(p text)
returns text language sql immutable as $$
  select trim(regexp_replace(regexp_replace(coalesce(p, ''),
    '\s*[\(\[][^\)\]]*(remaster|version|edit|live|mono|stereo|feat\.?|ft\.|mix|radio|explicit|acoustic)[^\)\]]*[\)\]]', '', 'gi'),
    '\s+-\s+.*(remaster|version|edit|live|mono|stereo|mix|radio).*$', '', 'i'));
$$;

-- ---------- Stjórnandi ----------------------------------------------

create or replace function public.hb_create(p_pin text, p_title text, p_mix text, p_secs int, p_stages jsonb)
returns json language plpgsql security definer set search_path = public as $$
declare v_code text; v_id uuid; v_token uuid; v_alphabet text := 'ABCDEFGHJKLMNPRSTUVXYZ'; v_cats text[]; v_n int; v_taken boolean;
begin
  perform _pin_any(p_pin);
  if login_required() and _host_uid() is null and (_jwt() is not null or session_user = 'authenticator') then
    raise exception 'innskraning_vantar';
  end if;
  if coalesce(p_mix, '') not in ('blandad', 'is', 'erl') then p_mix := 'blandad'; end if;
  if jsonb_typeof(p_stages) <> 'array' or jsonb_array_length(p_stages) < 1
     or exists (select 1 from jsonb_array_elements_text(p_stages) x where x not in ('line','X','full')) then
    raise exception 'ogild_mynstur';
  end if;
  v_cats := case when p_mix = 'erl' then array['aratugur','ar','flytjandi','heiti','fyrir2000']
                 else array['aratugur','ar','flytjandi','heiti','fyrir2000','islenskt'] end;
  loop
    v_code := '';
    for i in 1..4 loop v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1); end loop;
    v_taken := exists (select 1 from hb_games where code = v_code and created_at > now() - interval '2 days')
            or exists (select 1 from tb_games where code = v_code and created_at > now() - interval '2 days')
            or exists (select 1 from ha_games where code = v_code and created_at > now() - interval '2 days')
            or exists (select 1 from bingo_games where code = v_code and created_at > now() - interval '2 days')
            or exists (select 1 from games where code = v_code and created_at > now() - interval '2 days');
    exit when not v_taken;
  end loop;
  insert into hb_games (code, title, mix, cats, secs, stages)
  values (v_code, coalesce(nullif(trim(p_title), ''), 'Hvaða ár? Bingó'), p_mix, v_cats,
          greatest(10, least(90, coalesce(p_secs, 25))), p_stages)
  returning id into v_id;
  insert into hb_hosts (game_id) values (v_id) returning host_token into v_token;

  -- Lögin: virk lög með ári og hljóði, minnst notuð fyrst, í handahófsröð
  -- Blandað: jafnmörg íslensk og erlend lög svo flokkurinn „Íslenskt“ hafi nóg
  insert into hb_songs (game_id, ord, title, artist, year, lang, cover, deezer_id, spotify_uri)
  select v_id, row_number() over (order by random()), _hb_clean(title), artist, year, lang, cover, deezer_id, spotify_uri
    from (select * from (select *, row_number() over (partition by lang order by times_used, random()) rn from ha_songs
           where active and year is not null and deezer_id is not null
             and (p_mix = 'blandad' or lang = p_mix)) x
           where rn <= case when p_mix = 'blandad' then 75 else 150 end) s;
  get diagnostics v_n = row_count;
  if v_n < 20 then raise exception 'of_fa_log'; end if;
  return json_build_object('game_id', v_id, 'code', v_code, 'host_token', v_token);
end $$;

create or replace function public.hb_host_get(p_game uuid, p_token uuid)
returns json language plpgsql security definer set search_path = public as $$
begin
  perform _hb_host(p_game, p_token);
  return json_build_object(
    'game', (select row_to_json(g) from hb_games g where g.id = p_game),
    'players', (select count(*) from hb_players where game_id = p_game),
    'song', (select json_build_object('title', s.title, 'artist', s.artist, 'year', s.year, 'cover', s.cover,
                                      'deezer_id', s.deezer_id, 'spotify_uri', s.spotify_uri)
               from hb_rounds r join hb_songs s on s.game_id = r.game_id and s.ord = r.ord
               join hb_games g on g.id = r.game_id and g.round_no = r.round_no
              where r.game_id = p_game));
end $$;

-- Hjólinu snúið: þjónninn velur flokk og næsta lag og býr til svarmöguleika
create or replace function public.hb_spin(p_game uuid, p_token uuid)
returns json language plpgsql security definer set search_path = public as $$
declare g hb_games; v_cat text; s hb_songs; v_q jsonb; v_wrong text[]; v_dec int; v_lo int; v_k int; v_years int[];
begin
  perform _hb_host(p_game, p_token);
  select * into g from hb_games where id = p_game for update;
  if g.state not in ('lobby', 'reveal') or g.stage_won then return json_build_object('ok', false, 'reason', g.state); end if;

  v_cat := g.cats[1 + floor(random() * array_length(g.cats, 1))::int];
  if v_cat = 'islenskt' and not exists (select 1 from hb_songs where game_id = p_game and not used and lang = 'is') then
    v_cat := (select c from unnest(g.cats) c where c <> 'islenskt' order by random() limit 1);
  end if;
  select * into s from hb_songs where game_id = p_game and not used and (v_cat <> 'islenskt' or lang = 'is') order by ord limit 1;
  if s.ord is null then return json_build_object('ok', false, 'reason', 'buid'); end if;
  update hb_songs set used = true where game_id = p_game and ord = s.ord;

  if v_cat = 'aratugur' then
    v_dec := (s.year / 10) * 10;
    -- Fjórir samliggjandi áratugir sem innihalda rétta svarið, ekki fyrr en 1950 né lengra en núverandi áratugur
    v_k := greatest(least(1950, v_dec), v_dec - 30);                                  -- lægst
    v_lo := least(v_dec, extract(year from now())::int / 10 * 10 - 30);               -- hæst
    if v_lo < v_k then v_lo := v_k; end if;
    v_lo := v_k + floor(random() * ((v_lo - v_k) / 10 + 1))::int * 10;
    select jsonb_agg(d::text || '–' || right((d + 9)::text, 2) order by d) into v_q from generate_series(v_lo, v_lo + 30, 10) d;
    v_q := jsonb_build_object('options', v_q, 'answer_idx', (v_dec - v_lo) / 10);
  elsif v_cat = 'ar' then
    select array_agg(y order by random()) into v_years from (
      select s.year + d y from generate_series(-6, 6) d where d <> 0 and s.year + d <= extract(year from now())::int) t;
    v_years := v_years[1:3] || s.year;
    select jsonb_agg(y::text order by y) into v_q from unnest(v_years) y;
    v_q := jsonb_build_object('options', v_q, 'answer_idx', (select (i - 1) from jsonb_array_elements_text(v_q) with ordinality t(x, i) where x = s.year::text));
  elsif v_cat in ('flytjandi', 'islenskt') then
    select array_agg(a) into v_wrong from (
      select a from (select distinct on (lower(trim(artist))) artist a from ha_songs
                      where active and lang = s.lang and lower(trim(artist)) <> lower(trim(s.artist))) x
       order by random() limit 3) y;
    v_q := _hb_shuffle(s.artist, v_wrong);
  elsif v_cat = 'heiti' then
    select array_agg(t) into v_wrong from (
      select t from (select distinct on (lower(_hb_clean(title))) _hb_clean(title) t from ha_songs
                      where active and lang = s.lang and lower(_hb_clean(title)) <> lower(s.title)) x
       order by random() limit 3) y;
    v_q := _hb_shuffle(s.title, v_wrong);
  else
    v_q := jsonb_build_object('options', '["Fyrir 2000","2000 eða seinna"]'::jsonb, 'answer_idx', case when s.year < 2000 then 0 else 1 end);
  end if;

  insert into hb_rounds (game_id, round_no, ord, category, answer_idx)
  values (p_game, g.round_no + 1, s.ord, v_cat, (v_q->>'answer_idx')::int);
  -- Svarið opnast þegar hjólið hefur stöðvast (u.þ.b. 5 sek.)
  update hb_games set state = 'question', round_no = round_no + 1, category = v_cat, options = v_q->'options',
                      started_at = clock_timestamp() + interval '5.5 seconds', reveal = null
   where id = p_game;
  return json_build_object('ok', true, 'round_no', g.round_no + 1, 'category', v_cat, 'options', v_q->'options',
    'song', json_build_object('title', s.title, 'artist', s.artist, 'year', s.year, 'cover', s.cover,
                              'deezer_id', s.deezer_id, 'spotify_uri', s.spotify_uri));
end $$;

create or replace function public.hb_status(p_game uuid, p_token uuid)
returns json language plpgsql security definer set search_path = public as $$
declare v_round int;
begin
  perform _hb_host(p_game, p_token);
  select round_no into v_round from hb_games where id = p_game;
  return json_build_object('players', (select count(*) from hb_players where game_id = p_game),
                           'answered', (select count(*) from hb_answers where game_id = p_game and round_no = v_round));
end $$;

-- Rétta svarið sýnt: reitir merktir og BINGÓ athugað
create or replace function public.hb_reveal(p_game uuid, p_token uuid)
returns json language plpgsql security definer set search_path = public as $$
declare g hb_games; r hb_rounds; s hb_songs; a record; v_cell int; v_stage text; v_new jsonb := '[]'; p record; v_ok boolean[];
begin
  perform _hb_host(p_game, p_token);
  select * into g from hb_games where id = p_game for update;
  if g.state = 'question' then
    select * into r from hb_rounds where game_id = p_game and round_no = g.round_no;
    select * into s from hb_songs where game_id = p_game and ord = r.ord;
    for a in select * from hb_answers where game_id = p_game and round_no = g.round_no loop
      if a.choice = r.answer_idx then
        select i into v_cell from hb_secrets x, generate_subscripts(x.card, 1) i
         where x.player_id = a.player_id and x.card[i] = r.category and not x.marked[i] order by random() limit 1;
        if v_cell is not null then update hb_secrets set marked[v_cell] = true where player_id = a.player_id; end if;
        update hb_answers set ok = true, cell = v_cell where game_id = p_game and round_no = g.round_no and player_id = a.player_id;
        update hb_players set score = score + 1 where id = a.player_id;
      end if;
    end loop;
    -- BINGÓ: allir sem uppfylla mynstrið og hafa ekki unnið það áður
    v_stage := g.stages->>g.stage_idx;
    for p in select pl.id, pl.name, x.marked from hb_players pl join hb_secrets x on x.player_id = pl.id
              where pl.game_id = p_game order by pl.joined_at loop
      if _tb_met(p.marked, v_stage)
         and not exists (select 1 from jsonb_array_elements(g.winners) w where w->>'name' = p.name and w->>'stage' = v_stage) then
        v_new := v_new || jsonb_build_array(jsonb_build_object('stage', v_stage, 'name', p.name, 'round', g.round_no));
      end if;
    end loop;
    update hb_games set state = 'reveal', winners = winners || v_new, stage_won = jsonb_array_length(v_new) > 0,
      reveal = jsonb_build_object('title', s.title, 'artist', s.artist, 'year', s.year, 'cover', s.cover,
        'answer_idx', r.answer_idx, 'category', r.category, 'new_winners', v_new,
        'correct', (select count(*) from hb_answers where game_id = p_game and round_no = g.round_no and ok),
        'answered', (select count(*) from hb_answers where game_id = p_game and round_no = g.round_no),
        'fastest', (select p2.name from hb_answers x join hb_players p2 on p2.id = x.player_id
                     where x.game_id = p_game and x.round_no = g.round_no and x.ok order by x.elapsed_ms limit 1))
     where id = p_game;
  end if;
  return (select row_to_json(x) from hb_games x where x.id = p_game);
end $$;

-- Eftir BINGÓ: næsta mynstur eða leikslok
create or replace function public.hb_next(p_game uuid, p_token uuid, p_finish boolean default false)
returns json language plpgsql security definer set search_path = public as $$
declare g hb_games;
begin
  perform _hb_host(p_game, p_token);
  select * into g from hb_games where id = p_game for update;
  if p_finish or (g.stage_won and g.stage_idx + 1 >= jsonb_array_length(g.stages)) then
    update hb_games set state = 'finished' where id = p_game;
  elsif g.stage_won then
    update hb_games set stage_idx = stage_idx + 1, stage_won = false where id = p_game;
  end if;
  return (select row_to_json(x) from hb_games x where x.id = p_game);
end $$;

-- Spjöld vinningshafa (fyrir stóra skjáinn)
create or replace function public.hb_cards(p_game uuid, p_token uuid, p_names text[])
returns json language plpgsql security definer set search_path = public as $$
begin
  perform _hb_host(p_game, p_token);
  return (select coalesce(json_agg(json_build_object('name', p.name, 'card', x.card, 'marked', x.marked)), '[]'::json)
            from hb_players p join hb_secrets x on x.player_id = p.id
           where p.game_id = p_game and p.name = any(p_names));
end $$;

-- ---------- Leikmenn ------------------------------------------------

create or replace function public.hb_find(p_code text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from hb_games h where h.code = upper(trim(p_code)) and h.state <> 'finished'
                  and h.created_at > now() - interval '2 days'
                  and h.created_at >= coalesce((select max(created_at) from tb_games where code = upper(trim(p_code))), '-infinity')
                  and h.created_at >= coalesce((select max(created_at) from ha_games where code = upper(trim(p_code))), '-infinity')
                  and h.created_at >= coalesce((select max(created_at) from bingo_games where code = upper(trim(p_code))), '-infinity')
                  and h.created_at >= coalesce((select max(created_at) from games where code = upper(trim(p_code))), '-infinity'));
$$;

create or replace function public.hb_join(p_code text, p_name text)
returns json language plpgsql security definer set search_path = public as $$
declare v_game uuid; v_state text; v_cats text[]; v_name text; v_pid uuid; v_token uuid; v_cells text[] := '{}'; v_card text[]; i int;
begin
  select id, state, cats into v_game, v_state, v_cats from hb_games
   where code = upper(trim(p_code)) and created_at > now() - interval '2 days' order by created_at desc limit 1;
  if v_game is null then raise exception 'leikur_fannst_ekki'; end if;
  if v_state = 'finished' then raise exception 'leik_lokid'; end if;
  v_name := left(regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g'), 20);
  if length(v_name) < 1 then raise exception 'vantar_nafn'; end if;
  if (select count(*) from hb_players where game_id = v_game) >= 500 then raise exception 'leikur_fullur'; end if;
  if exists (select 1 from hb_players where game_id = v_game and lower(name) = lower(v_name)) then raise exception 'nafn_tekid'; end if;

  -- 24 reitir dreifðir jafnt á flokkana, í handahófsröð; fríreitur í miðjunni
  for i in 0..23 loop v_cells := v_cells || v_cats[1 + (i % array_length(v_cats, 1))]; end loop;
  select array_agg(c order by random()) into v_cells from unnest(v_cells) c;
  v_card := v_cells[1:12] || array['free'] || v_cells[13:24];

  insert into hb_players (game_id, name) values (v_game, v_name) returning id into v_pid;
  insert into hb_secrets (player_id, card, marked)
  values (v_pid, v_card, array_fill(false, array[12]) || array[true] || array_fill(false, array[12]))
  returning token into v_token;
  return json_build_object('game_id', v_game, 'player_id', v_pid, 'token', v_token, 'name', v_name);
end $$;

create or replace function public.hb_my_state(p_player uuid, p_token uuid)
returns json language plpgsql security definer set search_path = public as $$
declare v_game uuid; g hb_games; x hb_secrets; a hb_answers;
begin
  v_game := _hb_player(p_player, p_token);
  select * into g from hb_games where id = v_game;
  select * into x from hb_secrets where player_id = p_player;
  select * into a from hb_answers where game_id = v_game and player_id = p_player and round_no = g.round_no;
  return json_build_object('game', row_to_json(g), 'card', x.card, 'marked', x.marked,
    'score', (select score from hb_players where id = p_player),
    'answer', case when a.player_id is null then null
                   else json_build_object('choice', a.choice, 'ok', case when g.state = 'question' then null else a.ok end, 'cell', a.cell) end);
end $$;

create or replace function public.hb_answer(p_player uuid, p_token uuid, p_round int, p_choice int)
returns json language plpgsql security definer set search_path = public as $$
declare v_game uuid; g hb_games;
begin
  v_game := _hb_player(p_player, p_token);
  select * into g from hb_games where id = v_game;
  if g.state <> 'question' or g.round_no <> p_round then return json_build_object('ok', false, 'reason', 'of_seint'); end if;
  if clock_timestamp() < g.started_at - interval '1 second' then return json_build_object('ok', false, 'reason', 'of_snemmt'); end if;
  if clock_timestamp() > g.started_at + make_interval(secs => g.secs + 3) then return json_build_object('ok', false, 'reason', 'of_seint'); end if;
  if p_choice < 0 or p_choice >= jsonb_array_length(g.options) then return json_build_object('ok', false, 'reason', 'ogilt'); end if;
  insert into hb_answers (game_id, round_no, player_id, choice, elapsed_ms)
  values (v_game, p_round, p_player, p_choice, greatest(0, (extract(epoch from clock_timestamp() - g.started_at) * 1000)::int))
  on conflict do nothing;
  return json_build_object('ok', true);
end $$;

-- ---------- Réttindi, rauntími og notkunaryfirlit -------------------

revoke all on public.hb_games, public.hb_hosts, public.hb_songs, public.hb_rounds, public.hb_players, public.hb_secrets, public.hb_answers
  from anon, authenticated;
grant select on public.hb_games, public.hb_players to anon, authenticated;
revoke all on function public._hb_host(uuid, uuid), public._hb_player(uuid, uuid), public._hb_shuffle(text, text[]), public._hb_clean(text)
  from public, anon, authenticated;
grant execute on function public.hb_create(text, text, text, int, jsonb), public.hb_host_get(uuid, uuid), public.hb_spin(uuid, uuid),
  public.hb_status(uuid, uuid), public.hb_reveal(uuid, uuid), public.hb_next(uuid, uuid, boolean), public.hb_cards(uuid, uuid, text[]),
  public.hb_find(text), public.hb_join(text, text), public.hb_my_state(uuid, uuid), public.hb_answer(uuid, uuid, int, int)
  to anon, authenticated;

do $$ begin
  alter publication supabase_realtime add table public.hb_games;
exception when duplicate_object then null; when undefined_object then null;
end $$;

-- Notkunaryfirlitið telur þennan leik líka (ef notkun-talnabingo.sql hefur verið keyrt)
do $$ begin
  alter table public.usage_log drop constraint if exists usage_log_kind_check;
  alter table public.usage_log add constraint usage_log_kind_check
    check (kind in ('pubquiz', 'bingo', 'talnabingo', 'arabingo', 'gitar', 'karaoke', 'hvadaar'));
exception when undefined_table then null;
end $$;

-- Hver leikur og hver þátttakandi talinn í notkunaryfirlitinu
create or replace function public._usage_new_game()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  j jsonb := to_jsonb(new); c jsonb := _jwt(); v_uid uuid := _host_uid();
  v_kind text; v_items int; v_email text; v_name text; v_blocked boolean;
begin
  v_kind := case tg_table_name when 'games' then 'pubquiz' when 'bingo_games' then 'bingo'
              when 'tb_games' then 'talnabingo' when 'hb_games' then 'arabingo'
              when 'ha_games' then 'hvadaar' when 'gitar_sessions' then 'gitar' else 'karaoke' end;
  -- Í gegnum vefinn (ekki SQL Editor): innskráning nauðsynleg ef krafan er á
  if (c is not null or session_user = 'authenticator') and coalesce(c->>'role', '') <> 'service_role'
     and v_uid is null and login_required() then
    raise exception 'innskraning_vantar';
  end if;
  if v_uid is not null then
    v_email := lower(c->>'email');
    insert into host_accounts as h (user_id, email, name)
    values (v_uid, v_email, nullif(trim(c->'user_metadata'->>'name'), ''))
    on conflict (user_id) do update set email = coalesce(excluded.email, h.email), last_seen = now()
    returning blocked, name into v_blocked, v_name;
    if v_blocked then raise exception 'adgangur_lokadur'; end if;
  end if;
  v_items := case v_kind
    when 'pubquiz' then (j->>'total_rounds')::int
    when 'bingo'   then (j->>'total_songs')::int
    when 'hvadaar' then (j->>'total_rounds')::int
    when 'gitar'   then coalesce(jsonb_array_length(j->'song_ids'), 0)
    else 0 end;
  insert into usage_log (kind, ref, code, title, user_id, email, name, items, created_at)
  values (v_kind, coalesce(j->>'id', j->>'code'), j->>'code', j->>'title', v_uid, v_email, v_name,
          coalesce(v_items, 0), coalesce((j->>'created_at')::timestamptz, now()))
  on conflict do nothing;
  return new;
end $$;

create or replace function public._usage_new_player()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_new boolean;
begin
  if tg_table_name = 'karaoke_queue' then
    v_new := not exists (select 1 from karaoke_queue q where q.code = new.code and q.id <> new.id
                                                     and lower(q.singer) = lower(new.singer));
    update usage_log set items = items + 1, players = players + case when v_new then 1 else 0 end
     where id = (select max(id) from usage_log where kind = 'karaoke' and ref = new.code);
  else
    update usage_log set players = players + 1
     where kind = case tg_table_name when 'players' then 'pubquiz' when 'bingo_players' then 'bingo'
                                     when 'tb_players' then 'talnabingo' when 'hb_players' then 'arabingo' else 'hvadaar' end
       and ref = new.game_id::text;
  end if;
  return null;
end $$;

drop trigger if exists usage_new_game on public.hb_games;
create trigger usage_new_game before insert on public.hb_games for each row execute function public._usage_new_game();
drop trigger if exists usage_new_player on public.hb_players;
create trigger usage_new_player after insert on public.hb_players for each row execute function public._usage_new_player();

create or replace function public.usage_stats(p_pin text, p_days integer default 30)
returns json language plpgsql stable security definer set search_path to 'public' as $function$
declare
  v_unit text; v_from timestamptz; v_prev timestamptz; v_now timestamptz := now();
begin
  if _pin_not_host(p_pin) then
    raise exception 'rangt_pin';
  end if;
  if p_days >= 365 then
    v_unit := 'month'; v_from := date_trunc('month', v_now) - interval '11 months';
  elsif p_days >= 90 then
    v_unit := 'week';  v_from := date_trunc('week', v_now) - interval '12 weeks';
  else
    v_unit := 'day';   v_from := date_trunc('day', v_now) - (greatest(1, least(60, coalesce(p_days, 30))) - 1) * interval '1 day';
  end if;
  v_prev := v_from - (v_now - v_from);   -- jafnlangt tímabil á undan, til samanburðar

  return json_build_object(
    'unit', v_unit, 'from', v_from, 'now', v_now, 'require_login', login_required(),
    'buckets', (select json_agg(b order by b) from generate_series(v_from, date_trunc(v_unit, v_now), ('1 ' || v_unit)::interval) b),
    'cur', (select json_build_object('games', count(*), 'players', coalesce(sum(players), 0),
                     'hosts', count(distinct user_id), 'anon', count(*) filter (where user_id is null))
              from usage_log where created_at >= v_from),
    'prev', (select json_build_object('games', count(*), 'players', coalesce(sum(players), 0),
                      'hosts', count(distinct user_id))
               from usage_log where created_at >= v_prev and created_at < v_from),
    'accounts', json_build_object(
                  'total', (select count(*) from host_accounts),
                  'new', (select count(*) from host_accounts where created_at >= v_from),
                  'new_prev', (select count(*) from host_accounts where created_at >= v_prev and created_at < v_from)),
    'alltime', (select json_build_object('games', count(*), 'since', min(created_at)) from usage_log),
    'kinds', (select coalesce(json_object_agg(kind, json_build_object('games', n, 'players', p)), '{}'::json)
                from (select kind, count(*) n, coalesce(sum(players), 0) p from usage_log
                       where created_at >= v_from group by kind) k),
    'series', (select coalesce(json_agg(json_build_object('t', b, 'kind', kind, 'games', n, 'players', p)), '[]'::json)
                 from (select date_trunc(v_unit, created_at) b, kind, count(*) n, coalesce(sum(players), 0) p
                         from usage_log where created_at >= v_from group by 1, 2) s),
    'hosts', (select coalesce(json_agg(h order by h.games desc, h.last_seen desc nulls last), '[]'::json) from (
                select a.user_id, a.email, a.name, a.blocked, a.created_at, a.last_seen,
                       count(l.id) games, coalesce(sum(l.players), 0) players, max(l.created_at) last_game,
                       json_build_object('pubquiz', count(*) filter (where l.kind = 'pubquiz'),
                                         'bingo',   count(*) filter (where l.kind = 'bingo'),
                                         'talnabingo', count(*) filter (where l.kind = 'talnabingo'),
                                         'arabingo', count(*) filter (where l.kind = 'arabingo'),
                                         'gitar',   count(*) filter (where l.kind = 'gitar'),
                                         'karaoke', count(*) filter (where l.kind = 'karaoke'),
                                         'hvadaar', count(*) filter (where l.kind = 'hvadaar')) k
                  from host_accounts a
                  left join usage_log l on l.user_id = a.user_id and l.created_at >= v_from
                 group by a.user_id
                union all
                select null, null, null, false, null, null,
                       count(*), coalesce(sum(players), 0), max(created_at),
                       json_build_object('pubquiz', count(*) filter (where kind = 'pubquiz'),
                                         'bingo',   count(*) filter (where kind = 'bingo'),
                                         'talnabingo', count(*) filter (where kind = 'talnabingo'),
                                         'arabingo', count(*) filter (where kind = 'arabingo'),
                                         'gitar',   count(*) filter (where kind = 'gitar'),
                                         'karaoke', count(*) filter (where kind = 'karaoke'),
                                         'hvadaar', count(*) filter (where kind = 'hvadaar'))
                  from usage_log where user_id is null and created_at >= v_from
                having count(*) > 0) h),
    'recent', (select coalesce(json_agg(r order by r.created_at desc), '[]'::json) from (
                 select l.created_at, l.kind, l.code, l.title, l.players, l.items, l.user_id,
                        coalesce(a.name, l.name) as name, coalesce(a.email, l.email) as email
                   from usage_log l left join host_accounts a on a.user_id = l.user_id
                  where l.created_at >= v_from
                  order by l.created_at desc limit 60) r)
  );
end $function$;

select 'Hvaða ár? Bingó tilbúið' as staða;
