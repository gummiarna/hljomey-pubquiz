-- Eyðir gömlum leikjum sjálfkrafa (persónuverndarstefna: „gömlum leikjum er eytt eftir 30 daga“).
-- Keyrist einu sinni í Supabase SQL Editor. Leikmenn, svör og spjöld eyðast með leiknum (on delete cascade).

create extension if not exists pg_cron;

create or replace function public.hreinsa_gamla_leiki()
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.games            where created_at < now() - interval '30 days';
  delete from public.bingo_games      where created_at < now() - interval '30 days';
  delete from public.ha_games         where created_at < now() - interval '30 days';
  delete from public.karaoke_sessions where updated_at < now() - interval '30 days';
  delete from public.gitar_requests   where updated_at < now() - interval '30 days';
  delete from public.gitar_sessions   where updated_at < now() - interval '30 days';
end;
$$;

revoke all on function public.hreinsa_gamla_leiki() from public, anon, authenticated;

-- Á hverri nóttu kl. 04:15
select cron.unschedule('hreinsa-gamla-leiki') where exists (select 1 from cron.job where jobname = 'hreinsa-gamla-leiki');
select cron.schedule('hreinsa-gamla-leiki', '15 4 * * *', 'select public.hreinsa_gamla_leiki()');

-- Hreinsa strax það sem er orðið eldra en 30 daga
select public.hreinsa_gamla_leiki();
