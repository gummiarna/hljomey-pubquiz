-- Jólabingó: styrktaraðilar (logo undir spjaldinu, „lag dagsins í boði …“ og á deilimyndinni)
-- Keyrðu jolabingo.sql fyrst.

create table if not exists public.jb_sponsors (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(trim(name)) between 1 and 80),
  logo       text not null check (logo like 'data:image/%' and length(logo) <= 600000),
  url        text not null default '' check (url = '' or url ~* '^https?://'),
  plate      boolean not null default false,   -- hvítur grunnur á bak við logoið (fyrir dökk logo)
  strip      boolean not null default true,    -- sýnt í röndinni undir spjaldinu
  share      boolean not null default true,    -- sýnt á myndinni sem fólk deilir
  days       int[]   not null default '{}',    -- dagar sem aðilinn býður upp á lag dagsins
  sort       int     not null default 0,
  created_at timestamptz not null default now()
);
alter table public.jb_sponsors enable row level security;
revoke all on public.jb_sponsors from anon, authenticated;

-- Fyrir leikmenn: allir styrktaraðilar
create or replace function public.jb_sponsors()
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(json_build_object('id', id, 'name', name, 'logo', logo, 'url', url, 'plate', plate,
           'strip', strip, 'share', share, 'days', days, 'sort', sort) order by sort, created_at), '[]'::json)
    from jb_sponsors;
$$;

-- Vista (nýr ef p_id er null). p_logo null = halda núverandi logoi.
create or replace function public.jb_admin_sponsor_save(p_pin text, p_id uuid, p_name text, p_logo text, p_url text,
  p_plate boolean, p_strip boolean, p_share boolean, p_days int[], p_sort int)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_days int[]; v_taken text;
begin
  perform _jb_admin(p_pin);
  if coalesce(trim(p_name), '') = '' then raise exception 'jb_styrkt_nafn'; end if;
  select coalesce(array_agg(distinct d order by d), '{}') into v_days from unnest(coalesce(p_days, '{}')) d where d between 1 and 31;
  select s.name into v_taken from jb_sponsors s
   where s.days && v_days and s.id is distinct from p_id limit 1;
  if v_taken is not null then raise exception 'jb_styrkt_dagur:%', v_taken; end if;
  if p_id is null then
    if p_logo is null then raise exception 'jb_styrkt_logo'; end if;
    insert into jb_sponsors (name, logo, url, plate, strip, share, days, sort)
         values (trim(p_name), p_logo, coalesce(trim(p_url), ''), coalesce(p_plate, false), coalesce(p_strip, true),
                 coalesce(p_share, true), v_days, coalesce(p_sort, 0))
      returning id into v_id;
  else
    update jb_sponsors set name = trim(p_name), logo = coalesce(p_logo, logo), url = coalesce(trim(p_url), ''),
           plate = coalesce(p_plate, false), strip = coalesce(p_strip, true), share = coalesce(p_share, true),
           days = v_days, sort = coalesce(p_sort, 0)
     where id = p_id returning id into v_id;
  end if;
  return v_id;
end $$;

create or replace function public.jb_admin_sponsor_delete(p_pin text, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform _jb_admin(p_pin);
  delete from jb_sponsors where id = p_id;
end $$;

grant execute on function public.jb_sponsors() to anon, authenticated;
grant execute on function public.jb_admin_sponsor_save(text, uuid, text, text, text, boolean, boolean, boolean, int[], int),
  public.jb_admin_sponsor_delete(text, uuid) to anon, authenticated;

select 'Styrktaraðilar tilbúnir' as staða;
