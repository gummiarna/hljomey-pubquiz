-- ============================================================================
-- Innskráning í stað PIN fyrir stjórnendur (október 2026)
--
-- Innskráður stjórnandi (sem ekki hefur verið lokað á) má búa til og stýra
-- leikjum án PIN. Aðal-PIN þarf áfram til að breyta bönkum, söngbók,
-- YouTube-lykli, Spotify-stillingum, þemum, notkunarsíðunni og Jólabingóinu.
-- Gestapinið er tekið úr notkun.
--
-- Keyrðu þessa skrá í SQL Editor í Supabase. Ef gestapin.sql er keyrð aftur
-- seinna þarf að keyra þessa skrá aftur á eftir.
-- ============================================================================

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

-- Föllin sem athuga „_pin_role(p_pin) is null“ beint nota nú _pin_any
do $$
declare f record; src text; neu text; n int := 0;
begin
  for f in
    select p.oid from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = 'public' and p.prokind = 'f' and p.proname in ('create_game', 'bingo_create', 'save_theme')
  loop
    src := pg_get_functiondef(f.oid);
    neu := regexp_replace(src, 'if\s+_pin_role\(p_pin\)\s+is\s+null\s+then\s+raise\s+exception\s+''rangt_pin'';\s+end\s+if;', 'perform _pin_any(p_pin);', 'g');
    if neu <> src then execute neu; n := n + 1; end if;
  end loop;
  raise notice 'PIN: % föll uppfærð.', n;
end $$;

-- Gestapinið úr notkun
delete from app_settings where key = 'guest_pin';

revoke all on function public._pin_role(text), public._pin_any(text), public._pin_not_host(text) from public, anon, authenticated;

select 'Innskráning í stað PIN: tilbúið' as staða;
