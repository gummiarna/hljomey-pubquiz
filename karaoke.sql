-- =====================================================================
--  Hljómey Karaoke – YouTube-karaoke með biðröð í símanum (til heimanota)
--  Keyrðu á eftir setup.sql: SQL Editor -> New query -> líma allt -> Run.
--  Notar sama PIN og hinir leikirnir (aðeins til að vista YouTube-lykil
--  og eyða úr lagalistanum). Má keyra aftur án skaða.
-- =====================================================================

create extension if not exists pgcrypto;

-- Karaoke-kvöld. Allir mega lesa (símarnir sjá hver er að syngja).
create table if not exists public.karaoke_sessions (
  code        text primary key,
  current_id  uuid,                                   -- lagið sem er á sviðinu (eða næst á svið)
  state       text not null default 'idle' check (state in ('idle', 'intro', 'playing', 'paused')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Aðgangslykill stjórnanda. Ekki lesanlegur utan frá.
create table if not exists public.karaoke_hosts (
  code        text primary key references public.karaoke_sessions(code) on delete cascade,
  host_token  uuid not null default gen_random_uuid()
);

-- Biðröðin. Allir mega lesa.
create table if not exists public.karaoke_queue (
  id          uuid primary key default gen_random_uuid(),
  code        text not null references public.karaoke_sessions(code) on delete cascade,
  singer      text not null check (char_length(singer) between 1 and 40),
  video_id    text not null check (video_id ~ '^[A-Za-z0-9_-]{11}$'),
  title       text not null default '' check (char_length(title) <= 200),
  channel     text not null default '' check (char_length(channel) <= 120),
  duration    int,                                    -- sekúndur
  position    int not null default 0,
  status      text not null default 'queued' check (status in ('queued', 'current', 'done', 'removed')),
  added_at    timestamptz not null default now()
);
create index if not exists karaoke_queue_code_idx on public.karaoke_queue (code, status, position);

-- Hver bætti laginu við (svo gestur geti tekið sitt eigið lag af lista). Ekki lesanleg utan frá.
create table if not exists public.karaoke_owners (
  queue_id    uuid primary key references public.karaoke_queue(id) on delete cascade,
  guest       uuid not null
);

-- Lagalistinn: öll lög sem hafa verið valin, svo hægt sé að velja þau aftur án leitar.
create table if not exists public.karaoke_songs (
  video_id     text primary key check (video_id ~ '^[A-Za-z0-9_-]{11}$'),
  title        text not null default '' check (char_length(title) <= 200),
  channel      text not null default '' check (char_length(channel) <= 120),
  duration     int,
  times_queued int not null default 1,
  last_queued  timestamptz not null default now(),
  created_at   timestamptz not null default now()
);

alter table public.karaoke_sessions enable row level security;
alter table public.karaoke_hosts    enable row level security;
alter table public.karaoke_queue    enable row level security;
alter table public.karaoke_owners   enable row level security;
alter table public.karaoke_songs    enable row level security;

drop policy if exists karaoke_sessions_read on public.karaoke_sessions;
drop policy if exists karaoke_queue_read    on public.karaoke_queue;
drop policy if exists karaoke_songs_read    on public.karaoke_songs;
create policy karaoke_sessions_read on public.karaoke_sessions for select using (true);
create policy karaoke_queue_read    on public.karaoke_queue    for select using (true);
create policy karaoke_songs_read    on public.karaoke_songs    for select using (true);

-- ---------- Hjálparföll ----------------------------------------------

create or replace function public._karaoke_host(p_code text, p_token uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from karaoke_hosts where code = upper(p_code) and host_token = p_token) then
    raise exception 'ogildur_stjornandi';
  end if;
end $$;

create or replace function public._karaoke_code_free(p_code text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v boolean;
begin
  if exists (select 1 from karaoke_sessions where code = p_code) then return false; end if;
  if to_regclass('public.gitar_sessions') is not null then
    execute 'select exists(select 1 from public.gitar_sessions where code = $1)' into v using p_code;
    if v then return false; end if;
  end if;
  if to_regclass('public.games') is not null then
    execute 'select exists(select 1 from public.games where code = $1 and created_at > now() - interval ''2 days'')' into v using p_code;
    if v then return false; end if;
  end if;
  if to_regclass('public.bingo_games') is not null then
    execute 'select exists(select 1 from public.bingo_games where code = $1 and created_at > now() - interval ''2 days'')' into v using p_code;
    if v then return false; end if;
  end if;
  return true;
end $$;

-- ---------- Stillingar: YouTube-lykill --------------------------------

-- Vafralykill fyrir YouTube-leit. Hann sést hvort sem er í vafranum, svo hann er ekki leyndarmál;
-- takmarkaðu hann við hljomey.is í Google Cloud (sjá LESTU-MIG).
create or replace function public.karaoke_config()
returns json language sql security definer set search_path = public as $$
  select json_build_object('youtube_key', coalesce((select value from app_settings where key = 'youtube_key'), ''));
$$;

create or replace function public.karaoke_set_key(p_pin text, p_key text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_pin is distinct from (select value from app_settings where key = 'host_pin') then raise exception 'rangt_pin'; end if;
  if coalesce(trim(p_key), '') = '' then
    delete from app_settings where key = 'youtube_key';
  else
    insert into app_settings (key, value) values ('youtube_key', left(trim(p_key), 100))
    on conflict (key) do update set value = excluded.value;
  end if;
end $$;

-- ---------- Kvöld ----------------------------------------------------

-- Byrja karaoke-kvöld. Skilar {code, token}.
create or replace function public.karaoke_start()
returns json language plpgsql security definer set search_path = public as $$
declare v_code text; v_token uuid; v_alphabet text := 'ABCDEFGHJKLMNPRSTUVXYZ';
begin
  loop
    v_code := '';
    for i in 1..4 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    end loop;
    exit when _karaoke_code_free(v_code);
  end loop;
  insert into karaoke_sessions (code) values (v_code);
  insert into karaoke_hosts (code) values (v_code) returning host_token into v_token;
  -- Gömul kvöld (eldri en 3 daga) hreinsuð
  delete from karaoke_sessions where created_at < now() - interval '3 days';
  return json_build_object('code', v_code, 'token', v_token);
end $$;

create or replace function public.karaoke_find(p_code text)
returns boolean language sql security definer set search_path = public as $$
  select exists (select 1 from karaoke_sessions where code = upper(trim(p_code)) and created_at > now() - interval '3 days');
$$;

create or replace function public.karaoke_is_host(p_code text, p_token uuid)
returns boolean language sql security definer set search_path = public as $$
  select exists (select 1 from karaoke_hosts where code = upper(p_code) and host_token = p_token);
$$;

-- ---------- Biðröð ---------------------------------------------------

-- Gestur (eða stjórnandi) bætir lagi í röðina. Skilar id.
create or replace function public.karaoke_add(
  p_code text, p_guest uuid, p_singer text, p_video_id text, p_title text, p_channel text, p_duration int)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_code text := upper(trim(p_code)); v_id uuid; v_singer text;
begin
  if not karaoke_find(v_code) then raise exception 'karaoke_fannst_ekki'; end if;
  v_singer := left(regexp_replace(trim(coalesce(p_singer, '')), '\s+', ' ', 'g'), 40);
  if v_singer = '' then raise exception 'vantar_nafn'; end if;
  if coalesce(p_video_id, '') !~ '^[A-Za-z0-9_-]{11}$' then raise exception 'ogilt_myndband'; end if;
  if (select count(*) from karaoke_queue where code = v_code and status = 'queued') >= 150 then raise exception 'rodin_full'; end if;
  insert into karaoke_queue (code, singer, video_id, title, channel, duration, position)
  values (v_code, v_singer, p_video_id, left(coalesce(p_title, ''), 200), left(coalesce(p_channel, ''), 120),
          case when p_duration between 1 and 36000 then p_duration end,
          coalesce((select max(position) + 1 from karaoke_queue where code = v_code), 1))
  returning id into v_id;
  if p_guest is not null then insert into karaoke_owners (queue_id, guest) values (v_id, p_guest); end if;
  insert into karaoke_songs (video_id, title, channel, duration)
  values (p_video_id, left(coalesce(p_title, ''), 200), left(coalesce(p_channel, ''), 120), case when p_duration between 1 and 36000 then p_duration end)
  on conflict (video_id) do update
     set times_queued = karaoke_songs.times_queued + 1, last_queued = now(),
         title = coalesce(nullif(excluded.title, ''), karaoke_songs.title),
         channel = coalesce(nullif(excluded.channel, ''), karaoke_songs.channel),
         duration = coalesce(excluded.duration, karaoke_songs.duration);
  update karaoke_sessions set updated_at = now() where code = v_code;
  return v_id;
end $$;

-- Taka lag af lista: gesturinn sem bætti því við, eða stjórnandinn.
create or replace function public.karaoke_remove(p_code text, p_id uuid, p_guest uuid default null, p_token uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_code text := upper(trim(p_code));
begin
  if not (karaoke_is_host(v_code, p_token)
          or exists (select 1 from karaoke_owners o join karaoke_queue q on q.id = o.queue_id
                      where o.queue_id = p_id and o.guest = p_guest and q.code = v_code)) then
    raise exception 'ma_ekki_fjarlaegja';
  end if;
  update karaoke_queue set status = 'removed' where id = p_id and code = v_code and status = 'queued';
end $$;

-- Stjórnandi raðar biðröðinni: p_ids í nýrri röð (aðeins lög sem bíða)
create or replace function public.karaoke_reorder(p_code text, p_token uuid, p_ids uuid[])
returns void language plpgsql security definer set search_path = public as $$
declare v_code text := upper(trim(p_code)); v_base int;
begin
  perform _karaoke_host(v_code, p_token);
  select coalesce(max(position), 0) into v_base from karaoke_queue where code = v_code;
  update karaoke_queue q set position = v_base + x.ord::int
    from unnest(p_ids) with ordinality as x(id, ord)
   where q.id = x.id and q.code = v_code and q.status = 'queued';
end $$;

-- Stjórnandi setur lag á svið (p_id) í ákveðinni stöðu, eða tæmir sviðið (p_id null).
-- Lagið sem var á sviðinu fær stöðuna 'done' (sungið) eða aftur 'queued' ef p_requeue.
create or replace function public.karaoke_set(p_code text, p_token uuid, p_id uuid, p_state text, p_requeue boolean default false)
returns json language plpgsql security definer set search_path = public as $$
declare v_code text := upper(trim(p_code)); v_prev uuid;
begin
  perform _karaoke_host(v_code, p_token);
  if p_state not in ('idle', 'intro', 'playing', 'paused') then raise exception 'ogild_stada'; end if;
  select current_id into v_prev from karaoke_sessions where code = v_code for update;
  if v_prev is not null and v_prev is distinct from p_id then
    update karaoke_queue set status = case when p_requeue then 'queued' else 'done' end
     where id = v_prev and status = 'current';
  end if;
  if p_id is not null then
    update karaoke_queue set status = 'current' where id = p_id and code = v_code and status in ('queued', 'current');
    if not found then raise exception 'lag_fannst_ekki'; end if;
  end if;
  update karaoke_sessions
     set current_id = p_id, state = case when p_id is null then 'idle' else p_state end, updated_at = now()
   where code = v_code;
  return json_build_object('ok', true);
end $$;

-- Eyða lagi úr lagalistanum (krefst PIN)
create or replace function public.karaoke_song_delete(p_pin text, p_video_id text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_pin is distinct from (select value from app_settings where key = 'host_pin') then raise exception 'rangt_pin'; end if;
  delete from karaoke_songs where video_id = p_video_id;
end $$;

-- ---------- Réttindi ---------------------------------------------------
revoke all on public.karaoke_sessions, public.karaoke_hosts, public.karaoke_queue,
              public.karaoke_owners, public.karaoke_songs from anon, authenticated;
revoke all on function
  public._karaoke_host(text, uuid), public._karaoke_code_free(text),
  public.karaoke_config(), public.karaoke_set_key(text, text), public.karaoke_start(),
  public.karaoke_find(text), public.karaoke_is_host(text, uuid),
  public.karaoke_add(text, uuid, text, text, text, text, int),
  public.karaoke_remove(text, uuid, uuid, uuid), public.karaoke_reorder(text, uuid, uuid[]),
  public.karaoke_set(text, uuid, uuid, text, boolean), public.karaoke_song_delete(text, text)
from public, anon, authenticated;

grant select on public.karaoke_sessions, public.karaoke_queue, public.karaoke_songs to anon, authenticated;
grant execute on function
  public.karaoke_config(), public.karaoke_set_key(text, text), public.karaoke_start(),
  public.karaoke_find(text), public.karaoke_is_host(text, uuid),
  public.karaoke_add(text, uuid, text, text, text, text, int),
  public.karaoke_remove(text, uuid, uuid, uuid), public.karaoke_reorder(text, uuid, uuid[]),
  public.karaoke_set(text, uuid, uuid, text, boolean), public.karaoke_song_delete(text, text)
to anon, authenticated;

-- ---------- Rauntími ---------------------------------------------------
do $$ begin
  alter publication supabase_realtime add table public.karaoke_sessions;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.karaoke_queue;
exception when duplicate_object then null; end $$;

select 'Karaoke uppsett' as stada;
