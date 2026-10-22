-- ATH (október 2026): keyrðu pin-innskraning.sql alltaf strax á eftir þessari skrá.
-- Þá búa innskráðir stjórnendur til leiki án PIN og aðeins aðal-PIN er notað.

-- =====================================================================
--  Hljómey – gestapin
--
--  Gestapin leyfir að búa til og stýra leikjum: Pöbbkviss (líka með
--  spurningum), Tónlistarbingó og Hvaða ár?. Karaoke og Gítarpartý þurfa
--  ekkert PIN til að byrja.
--
--  Gestapin leyfir EKKI að breyta spurningabankanum, lagabankanum í
--  Hvaða ár?, söngbókinni, nöfnum eða eyðingu þema, YouTube-lyklinum
--  eða Spotify-stillingunum. Þá kemur skýr villa í stað „Rangt PIN“.
--
--  Keyrðu þessa skrá SÍÐAST, á eftir öllum hinum. Ef einhver hinna er
--  keyrð aftur seinna þarf að keyra þessa aftur á eftir. Má keyra aftur.
--
--  Aðferð: PIN-athuganir í föllunum sem fyrir eru eru umskrifaðar sjálfkrafa,
--  svo ekki þarf að afrita föllin sjálf hingað.
-- =====================================================================

-- 'host' (aðal-PIN), 'guest' (gestapin) eða null (rangt)
-- Sjá pin-innskraning.sql: innskráður stjórnandi má búa til leiki án PIN
-- Hlutverk: 'host' (aðal-PIN), 'guest' (gestapin, ef það er til), 'login' (innskráður stjórnandi) eða null
create or replace function public._pin_role(p_pin text)
returns text language sql stable security definer set search_path = public as $$
  select case
    when coalesce(p_pin, '') <> '' and p_pin = (select value from app_settings where key = 'host_pin') then 'host'
    when coalesce(p_pin, '') <> '' and p_pin = (select value from app_settings where key = 'guest_pin') then 'guest'
    when _host_uid() is not null
         and not exists (select 1 from host_accounts where user_id = _host_uid() and blocked) then 'login'
  end;
$$;

-- Má búa til og stýra leik: aðal-PIN eða innskráður stjórnandi
create or replace function public._pin_any(p_pin text)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if _pin_role(p_pin) is null then
    if _host_uid() is null and login_required() then raise exception 'innskraning_vantar'; end if;
    if exists (select 1 from host_accounts where user_id = _host_uid() and blocked) then raise exception 'adgangur_lokadur'; end if;
    raise exception 'rangt_pin';
  end if;
end $$;

-- Satt ef ekki aðal-PIN (þá er aðgangi hafnað). Óbreytt: innskráning dugar ekki hér.
create or replace function public._pin_not_host(p_pin text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare r text := _pin_role(p_pin);
begin
  if r = 'guest' then raise exception 'gestapin_ekki'; end if;
  return r is distinct from 'host';
end $$;

-- Umskrifa PIN-athuganir í föllunum sem fyrir eru
do $$
declare
  f record; src text; neu text; n int := 0;
  -- föll sem gestapin má nota (búa til leik og lesa það sem þarf til þess)
  guest_fns text[] := array['create_game', 'bingo_create', 'save_theme', 'qb_list', 'qb_mark_used', 'ha_bank_list', 'ha_create'];
  pat_ne text := 'p_pin is distinct from (select value from app_settings where key = ''host_pin'')';
  pat_eq text := 'p_pin is not distinct from (select value from app_settings where key = ''host_pin'')';
begin
  for f in
    select p.oid, p.proname from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = 'public' and p.prokind = 'f'
       and p.proname not in ('_pin_role', '_pin_any', '_pin_not_host')
  loop
    src := pg_get_functiondef(f.oid);
    if position('host_pin' in src) = 0 and position('_qb_pin(p_pin)' in src) = 0 and position('_ha_pin(p_pin)' in src) = 0 then continue; end if;
    neu := src;
    if f.proname = any(guest_fns) then
      neu := replace(neu, pat_ne, '_pin_role(p_pin) is null');
      neu := replace(neu, 'perform _qb_pin(p_pin)', 'perform _pin_any(p_pin)');
      neu := replace(neu, 'perform _ha_pin(p_pin)', 'perform _pin_any(p_pin)');
    else
      neu := replace(neu, pat_ne, '_pin_not_host(p_pin)');
      neu := replace(neu, pat_eq, 'not _pin_not_host(p_pin)');
    end if;
    if neu <> src then execute neu; n := n + 1; end if;
  end loop;
  raise notice 'Gestapin: % föll uppfærð.', n;
end $$;

-- Hjálparföllin eru aðeins notuð innan annarra falla
revoke all on function public._pin_role(text), public._pin_any(text), public._pin_not_host(text) from public, anon, authenticated;

-- ---------- Gestapin – SETTU ÞITT EIGIÐ ----------------------------------
-- Taktu „--“ af næstu tveimur línum og settu gestapinið í stað GESTAPIN.
-- Án þessarar línu er ekkert gestapin virkt.
-- insert into public.app_settings (key, value) values ('guest_pin', 'GESTAPIN')
-- on conflict (key) do update set value = excluded.value;
