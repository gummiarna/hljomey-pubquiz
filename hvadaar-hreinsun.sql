-- =====================================================================
--  Hljómey – Hvaða ár?: hreinsa lagabankann
--
--  1. Tekur afrit af lagabankanum (taflan ha_songs_afrit_ÁÁÁÁMMDD_HHMM).
--  2. Eyðir tvíteknum lögum. Lög teljast tvítekin ef þau eru sama Spotify-lagið,
--     með sama ISRC-kóða, eða með sama heiti og flytjanda þegar búið er að
--     sleppa „(Remastered 2011)“, „- Live“, hástöfum, kommum o.þ.h. Síðast eru
--     lög með sama heiti þar sem fyrsta orð flytjandans er það sama
--     („Stefán og Eyfi“ og „Stefán Hilmarsson“).
--     Af hverjum hópi er haldið í laginu sem er tengt Spotify, er með ár og er
--     staðfest. Elsta árið í hópnum er notað ef ekkert þeirra var staðfest.
--  3. Staðfestir öll lög sem hafa ár (tillöguna sem stendur í bankanum).
--     Lög án árs eru óbreytt og fara ekki í leiki.
--
--  Keyrsla: Supabase → SQL Editor → New query → líma allt → Run.
--  Má keyra aftur. Neðst sést samantekt.
--
--  Afturkalla (skiptu út nafni afritsins):
--    delete from ha_songs;
--    insert into ha_songs select * from ha_songs_afrit_20261015_1530;
-- =====================================================================

drop table if exists _hr;
create temp table _hr (nr serial, lysing text, fjoldi int);

do $$
declare
  v_afrit text := 'ha_songs_afrit_' || to_char(now() at time zone 'Atlantic/Reykjavik', 'YYYYMMDD_HH24MI');
  v_n int; v_pass text; v_alls int := 0;
begin
  -- 1. Afrit (lokað fyrir umheiminum)
  execute format('create table if not exists public.%I as table public.ha_songs', v_afrit);
  execute format('alter table public.%I enable row level security', v_afrit);
  execute format('revoke all on public.%I from anon, authenticated', v_afrit);
  insert into _hr (lysing, fjoldi) values ('Lög fyrir hreinsun', (select count(*) from ha_songs));
  insert into _hr (lysing, fjoldi) values ('Afrit: ' || v_afrit, (select count(*) from ha_songs));

  -- 2. Tvítekin lög, í þremur umferðum
  foreach v_pass in array array['spotify', 'isrc', 'heiti', 'fornafn'] loop
    create temp table _g as
    with k as (
      select s.id, s.year, s.verified, s.spotify_uri, s.isrc, s.deezer_id, s.cover, s.times_used, s.created_at,
        case v_pass
          when 'spotify' then nullif(s.spotify_uri, '')
          when 'isrc' then nullif(upper(trim(s.isrc)), '')
          when 'heiti' then nullif(
            trim(regexp_replace(regexp_replace(regexp_replace(
              translate(lower(s.title), 'ÁÉÍÓÚÝÞÆÖÐÅÄÜØÈÀÇÑ', 'áéíóúýþæöðåäüøèàçñ'),
              '\(.*?\)|\[.*?\]', ' ', 'g'),            -- (Remastered 2011), [Live]
              '\s[-–—]\s.*$', ''),                      -- " - Radio Edit"
              '[^a-z0-9áéíóúýþæöðåäüøèàçñ]+', ' ', 'g'))
            || '|' ||
            trim(regexp_replace(regexp_replace(
              translate(lower(s.artist), 'ÁÉÍÓÚÝÞÆÖÐÅÄÜØÈÀÇÑ', 'áéíóúýþæöðåäüøèàçñ'),
              '\s*(,|&| feat\.?\s| ft\.?\s| featuring\s| with\s| og\s| and\s| x\s).*$', ''),   -- fyrsti flytjandi
              '[^a-z0-9áéíóúýþæöðåäüøèàçñ]+', ' ', 'g')), '|')
          else nullif(                                  -- sama heiti og sama fyrsta orð flytjanda („Stefán og Eyfi“ / „Stefán Hilmarsson“)
            trim(regexp_replace(regexp_replace(regexp_replace(
              translate(lower(s.title), 'ÁÉÍÓÚÝÞÆÖÐÅÄÜØÈÀÇÑ', 'áéíóúýþæöðåäüøèàçñ'),
              '\(.*?\)|\[.*?\]', ' ', 'g'), '\s[-–—]\s.*$', ''), '[^a-z0-9áéíóúýþæöðåäüøèàçñ]+', ' ', 'g'))
            || '|' ||
            split_part(trim(regexp_replace(regexp_replace(
              translate(lower(s.artist), 'ÁÉÍÓÚÝÞÆÖÐÅÄÜØÈÀÇÑ', 'áéíóúýþæöðåäüøèàçñ'),
              '^\s*the\s+', ''), '[^a-z0-9áéíóúýþæöðåäüøèàçñ]+', ' ', 'g')), ' ', 1), '|')
        end as key
      from ha_songs s
    )
    select k.*,
      row_number() over w as rn,
      count(*) over (partition by key) as n,
      min(year) over (partition by key) as min_year,
      bool_or(verified) over (partition by key) as any_ver,
      max(spotify_uri) over (partition by key) as any_uri,
      max(nullif(isrc, '')) over (partition by key) as any_isrc,
      max(deezer_id) over (partition by key) as any_dz,
      max(nullif(cover, '')) over (partition by key) as any_cover
    from k
    where key is not null and key not like '|%' and key not like '%|'
    window w as (partition by key order by (spotify_uri is not null) desc, (year is not null) desc, verified desc,
                 times_used desc, created_at asc, id);

    -- sameina upplýsingar inn í lagið sem er haldið
    update ha_songs s set
      year        = case when g.verified then s.year else coalesce(g.min_year, s.year) end,
      spotify_uri = coalesce(s.spotify_uri, g.any_uri),
      isrc        = coalesce(nullif(s.isrc, ''), g.any_isrc),
      deezer_id   = coalesce(s.deezer_id, g.any_dz),
      cover       = coalesce(nullif(s.cover, ''), g.any_cover, ''),
      updated_at  = now()
    from _g g where g.id = s.id and g.rn = 1 and g.n > 1;

    delete from ha_songs s using _g g where g.id = s.id and g.rn > 1;
    get diagnostics v_n = row_count;
    v_alls := v_alls + v_n;
    insert into _hr (lysing, fjoldi) values ('Tvítekin lög eytt (' || case v_pass when 'spotify' then 'sama Spotify-lag' when 'isrc' then 'sami ISRC' when 'heiti' then 'sama heiti og flytjandi' else 'sama heiti, flytjandi skrifaður öðruvísi' end || ')', v_n);
    drop table _g;
  end loop;

  -- 3. Staðfesta öll lög sem hafa ár
  update ha_songs set verified = true, updated_at = now() where year is not null and not verified;
  get diagnostics v_n = row_count;
  insert into _hr (lysing, fjoldi) values ('Lög staðfest núna', v_n);
  insert into _hr (lysing, fjoldi) values ('Lög án árs (óbreytt, fara ekki í leiki)', (select count(*) from ha_songs where year is null));
  insert into _hr (lysing, fjoldi) values ('Lög eftir hreinsun', (select count(*) from ha_songs));
  insert into _hr (lysing, fjoldi) values ('  þar af íslensk', (select count(*) from ha_songs where lang = 'is'));
  insert into _hr (lysing, fjoldi) values ('  þar af erlend', (select count(*) from ha_songs where lang = 'erl'));
end $$;

select lysing as "Samantekt", fjoldi as "Fjöldi" from _hr order by nr;
