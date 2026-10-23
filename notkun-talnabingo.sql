-- =====================================================================
-- Bingó (talnabingó) í notkunaryfirlitinu (notkun.html)
-- Supabase -> SQL Editor -> New query -> líma allt -> Run. Má keyra aftur.
-- =====================================================================

-- 1) Ný tegund í notkunarskránni
alter table public.usage_log drop constraint if exists usage_log_kind_check;
alter table public.usage_log add constraint usage_log_kind_check
  check (kind in ('pubquiz', 'bingo', 'talnabingo', 'gitar', 'karaoke', 'hvadaar'));

-- 2) Nýr leikur skráður (sama og áður + tb_games)
create or replace function public._usage_new_game()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  j jsonb := to_jsonb(new); c jsonb := _jwt(); v_uid uuid := _host_uid();
  v_kind text; v_items int; v_email text; v_name text; v_blocked boolean;
begin
  v_kind := case tg_table_name when 'games' then 'pubquiz' when 'bingo_games' then 'bingo'
              when 'tb_games' then 'talnabingo'
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

-- 3) Nýr þátttakandi (sama og áður + tb_players)
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
                                     when 'tb_players' then 'talnabingo' else 'hvadaar' end
       and ref = new.game_id::text;
  end if;
  return null;
end $$;

-- 4) Hlustað á Bingó-töflurnar
drop trigger if exists usage_new_game on public.tb_games;
create trigger usage_new_game before insert on public.tb_games for each row execute function public._usage_new_game();
drop trigger if exists usage_new_player on public.tb_players;
create trigger usage_new_player after insert on public.tb_players for each row execute function public._usage_new_player();

-- 5) Bingóleikir sem þegar hafa verið spilaðir
insert into usage_log (kind, ref, code, title, items, players, created_at)
select 'talnabingo', g.id::text, g.code, g.title, coalesce(array_length(g.called, 1), 0),
       (select count(*) from tb_players p where p.game_id = g.id), g.created_at
  from tb_games g
on conflict do nothing;

-- 6) Yfirlitið telur Bingó líka hjá hverjum stjórnanda
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
