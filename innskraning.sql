-- =====================================================================
--  Hljómey – innskráning stjórnenda og notkunarskráning
--
--  Stjórnendur (þeir sem búa til leiki) skrá sig inn með netfangi og
--  lykilorði. Gestir í símum skrá sig aldrei inn. PIN-in halda sér.
--
--  Hver nýr leikur (Pöbbkviss, Tónlistarbingó, Gítarpartý, Karaoke og
--  Hvaða ár?) er skráður í notkunarskrá með stjórnandanum og fjölda
--  þátttakenda. Yfirlitið er á notkun.html (aðal-PIN).
--
--  Á UNDAN: í Supabase -> Authentication -> Sign In / Providers -> Email:
--  hafðu Email kveikt og slökktu á „Confirm email“ (annars þarf
--  staðfestingarpóst, sem Supabase sendir aðeins á eigin netföng).
--
--  Keyrðu á eftir hinum skránum og svo gestapin.sql aftur á eftir.
--  Má keyra aftur án skaða. Eldri leikir eru færðir inn í skrána
--  (sem „Án innskráningar“).
--
--  Neyðarhemill: ef innskráning veldur vandræðum á leikkvöldi má slökkva
--  á kröfunni á notkun.html, eða hér:
--    update public.app_settings set value = 'off' where key = 'require_login';
-- =====================================================================

-- ---------- Töflur ------------------------------------------------------

-- Stjórnendur sem hafa skráð sig inn. user_id = auðkenni í Supabase Auth.
create table if not exists public.host_accounts (
  user_id     uuid primary key,
  email       text,
  name        text,
  blocked     boolean not null default false,
  created_at  timestamptz not null default now(),
  last_seen   timestamptz not null default now()
);

-- Einn lína fyrir hvern leik sem er búinn til.
create table if not exists public.usage_log (
  id          bigint generated always as identity primary key,
  kind        text not null check (kind in ('pubquiz', 'bingo', 'gitar', 'karaoke', 'hvadaar')),
  ref         text not null,                -- auðkenni leiksins (id eða kóði)
  code        text,
  title       text,
  user_id     uuid,                         -- null = án innskráningar
  email       text,
  name        text,
  players     int not null default 0,       -- gestir sem skráðu sig í leikinn (karaoke: söngvarar)
  items       int not null default 0,       -- umferðir / lög
  created_at  timestamptz not null default now()
);
create unique index if not exists usage_log_uidx on public.usage_log (kind, ref, created_at);
create index if not exists usage_log_time_idx on public.usage_log (created_at desc);
create index if not exists usage_log_user_idx on public.usage_log (user_id, created_at desc);

alter table public.host_accounts enable row level security;
alter table public.usage_log     enable row level security;
-- Engar reglur: aðeins föllin hér fyrir neðan lesa og skrifa.

insert into public.app_settings (key, value) values ('require_login', 'on')
on conflict (key) do nothing;

-- ---------- Hjálparföll -------------------------------------------------

-- Auðkenni beiðninnar frá Supabase (null þegar keyrt beint í SQL Editor)
create or replace function public._jwt()
returns jsonb language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true), '')::jsonb;
$$;

-- Innskráður stjórnandi (ekki nafnlaus) eða null
create or replace function public._host_uid()
returns uuid language sql stable as $$
  select case when _jwt()->>'role' = 'authenticated'
               and not coalesce((_jwt()->>'is_anonymous')::boolean, false)
              then nullif(_jwt()->>'sub', '')::uuid end;
$$;

-- Þarf að skrá sig inn til að búa til leik? (vefurinn spyr)
create or replace function public.login_required()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select value from app_settings where key = 'require_login'), 'on') = 'on';
$$;

-- ---------- Stjórnandi skráir sig inn -----------------------------------

-- Kallað eftir innskráningu: stofnar eða uppfærir stjórnandann.
create or replace function public.me_touch(p_name text default null)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := _host_uid(); a host_accounts%rowtype;
  v_name text := nullif(left(trim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')), 60), '');
begin
  if v_uid is null then raise exception 'innskraning_vantar'; end if;
  insert into host_accounts as h (user_id, email, name)
  values (v_uid, lower(_jwt()->>'email'), coalesce(v_name, nullif(trim(_jwt()->'user_metadata'->>'name'), '')))
  on conflict (user_id) do update
     set email = coalesce(excluded.email, h.email), name = coalesce(v_name, h.name, excluded.name), last_seen = now()
  returning * into a;
  return json_build_object('email', a.email, 'name', a.name, 'blocked', a.blocked);
end $$;

-- ---------- Kveikjur: nýr leikur ----------------------------------------

create or replace function public._usage_new_game()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  j jsonb := to_jsonb(new); c jsonb := _jwt(); v_uid uuid := _host_uid();
  v_kind text; v_items int; v_email text; v_name text; v_blocked boolean;
begin
  v_kind := case tg_table_name when 'games' then 'pubquiz' when 'bingo_games' then 'bingo'
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

-- ---------- Kveikjur: nýr þátttakandi -----------------------------------

create or replace function public._usage_new_player()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_new boolean;
begin
  if tg_table_name = 'karaoke_queue' then
    -- Karaoke: hvert lag telst, og nýr söngvari telst sem þátttakandi
    v_new := not exists (select 1 from karaoke_queue q where q.code = new.code and q.id <> new.id
                                                     and lower(q.singer) = lower(new.singer));
    update usage_log set items = items + 1, players = players + case when v_new then 1 else 0 end
     where id = (select max(id) from usage_log where kind = 'karaoke' and ref = new.code);
  else
    update usage_log set players = players + 1
     where kind = case tg_table_name when 'players' then 'pubquiz' when 'bingo_players' then 'bingo' else 'hvadaar' end
       and ref = new.game_id::text;
  end if;
  return null;
end $$;

-- Tengja kveikjurnar (aðeins við töflur sem eru til)
do $$
declare t text;
begin
  perform set_config('client_min_messages', 'warning', true);   -- engar „does not exist, skipping“-tilkynningar
  foreach t in array array['games', 'bingo_games', 'ha_games', 'gitar_sessions', 'karaoke_sessions'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists usage_new_game on public.%I', t);
      execute format('create trigger usage_new_game before insert on public.%I for each row execute function public._usage_new_game()', t);
    end if;
  end loop;
  foreach t in array array['players', 'bingo_players', 'ha_players', 'karaoke_queue'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists usage_new_player on public.%I', t);
      execute format('create trigger usage_new_player after insert on public.%I for each row execute function public._usage_new_player()', t);
    end if;
  end loop;
end $$;

-- ---------- Eldri leikir færðir inn (einu sinni; má keyra aftur) ---------

do $$
begin
  if to_regclass('public.games') is not null then
    insert into usage_log (kind, ref, code, title, items, players, created_at)
    select 'pubquiz', g.id::text, g.code, g.title, g.total_rounds,
           (select count(*) from players p where p.game_id = g.id), g.created_at
      from games g
    on conflict do nothing;
  end if;
  if to_regclass('public.bingo_games') is not null then
    insert into usage_log (kind, ref, code, title, items, players, created_at)
    select 'bingo', g.id::text, g.code, g.title, g.total_songs,
           (select count(*) from bingo_players p where p.game_id = g.id), g.created_at
      from bingo_games g
    on conflict do nothing;
  end if;
  if to_regclass('public.ha_games') is not null then
    insert into usage_log (kind, ref, code, title, items, players, created_at)
    select 'hvadaar', g.id::text, g.code, g.title, g.total_rounds,
           (select count(*) from ha_players p where p.game_id = g.id), g.created_at
      from ha_games g
    on conflict do nothing;
  end if;
  if to_regclass('public.gitar_sessions') is not null then
    insert into usage_log (kind, ref, code, items, created_at)
    select 'gitar', s.code, s.code, coalesce(array_length(s.song_ids, 1), 0), s.created_at
      from gitar_sessions s
    on conflict do nothing;
  end if;
  if to_regclass('public.karaoke_sessions') is not null then
    insert into usage_log (kind, ref, code, items, players, created_at)
    select 'karaoke', s.code, s.code,
           (select count(*) from karaoke_queue q where q.code = s.code),
           (select count(distinct lower(q.singer)) from karaoke_queue q where q.code = s.code), s.created_at
      from karaoke_sessions s
    on conflict do nothing;
  end if;
end $$;

-- ---------- Notkunaryfirlit (aðal-PIN) ----------------------------------

-- p_days: 7 og 30 = eftir dögum, 90 = eftir vikum, 365 = eftir mánuðum
create or replace function public.usage_stats(p_pin text, p_days int default 30)
returns json language plpgsql stable security definer set search_path = public as $$
declare
  v_unit text; v_from timestamptz; v_prev timestamptz; v_now timestamptz := now();
begin
  if p_pin is distinct from (select value from app_settings where key = 'host_pin') then
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
end $$;

-- Loka eða opna aðgangi stjórnanda (hann getur þá ekki búið til leiki)
create or replace function public.usage_block(p_pin text, p_user uuid, p_blocked boolean)
returns json language plpgsql security definer set search_path = public as $$
begin
  if p_pin is distinct from (select value from app_settings where key = 'host_pin') then
    raise exception 'rangt_pin';
  end if;
  update host_accounts set blocked = coalesce(p_blocked, false) where user_id = p_user;
  return json_build_object('ok', found);
end $$;

-- Kveikja eða slökkva á kröfu um innskráningu
create or replace function public.usage_set_login(p_pin text, p_on boolean)
returns json language plpgsql security definer set search_path = public as $$
begin
  if p_pin is distinct from (select value from app_settings where key = 'host_pin') then
    raise exception 'rangt_pin';
  end if;
  insert into app_settings (key, value) values ('require_login', case when p_on then 'on' else 'off' end)
  on conflict (key) do update set value = excluded.value;
  return json_build_object('require_login', p_on);
end $$;

-- ---------- Réttindi ----------------------------------------------------

revoke all on public.host_accounts, public.usage_log from anon, authenticated;
revoke all on function public._jwt(), public._host_uid(), public._usage_new_game(), public._usage_new_player()
  from public, anon, authenticated;
revoke all on function public.me_touch(text), public.login_required(),
  public.usage_stats(text, int), public.usage_block(text, uuid, boolean), public.usage_set_login(text, boolean)
  from public, anon, authenticated;
grant execute on function public.login_required(),
  public.usage_stats(text, int), public.usage_block(text, uuid, boolean), public.usage_set_login(text, boolean)
  to anon, authenticated;
grant execute on function public.me_touch(text) to authenticated;
