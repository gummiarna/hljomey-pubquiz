-- =====================================================================
--  Hljómey – spurningabanki fyrir Pöbbkvissið
--  Keyrðu á eftir setup.sql: SQL Editor -> New query -> líma allt -> Run.
--  Notar sama PIN og leikirnir (host_pin í app_settings). Má keyra aftur.
--  Byrjunarspurningarnar neðst fara aðeins inn ef bankinn er tómur.
-- =====================================================================

create extension if not exists pgcrypto;

create table if not exists public.quiz_questions (
  id          uuid primary key default gen_random_uuid(),
  question    text not null check (char_length(trim(question)) between 3 and 400),
  answer      text not null check (char_length(trim(answer)) between 1 and 120),
  wrong1      text not null check (char_length(trim(wrong1)) between 1 and 120),
  wrong2      text not null check (char_length(trim(wrong2)) between 1 and 120),
  wrong3      text not null check (char_length(trim(wrong3)) between 1 and 120),
  category    text not null default 'Almennt' check (char_length(trim(category)) between 1 and 60),
  difficulty  smallint not null default 2 check (difficulty between 1 and 3),   -- 1 létt, 2 miðlungs, 3 erfitt
  note        text not null default '' check (char_length(note) <= 400),       -- fróðleikur sýndur með rétta svarinu
  active      boolean not null default true,
  times_used  int not null default 0,
  last_used   timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index if not exists quiz_questions_question_uidx on public.quiz_questions (lower(trim(question)));
create index if not exists quiz_questions_cat_idx on public.quiz_questions (category);

-- Lokuð tafla: svörin mega ekki vera lesanleg utan frá (annars væri hægt að svindla).
-- Allur aðgangur fer í gegnum föllin hér fyrir neðan, sem krefjast PIN.
alter table public.quiz_questions enable row level security;

create or replace function public._qb_pin(p_pin text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_pin is distinct from (select value from app_settings where key = 'host_pin') then
    raise exception 'rangt_pin';
  end if;
end $$;

-- Allar spurningar (fyrir ritilinn og val í leik)
create or replace function public.qb_list(p_pin text)
returns json language plpgsql security definer set search_path = public as $$
begin
  perform _qb_pin(p_pin);
  return (select coalesce(json_agg(row_to_json(q) order by q.category, q.created_at), '[]'::json)
            from (select id, question, answer, wrong1, wrong2, wrong3, category, difficulty, note,
                         active, times_used, last_used, created_at
                    from quiz_questions) q);
end $$;

-- Vista spurningu (ný ef p_id er null)
create or replace function public.qb_save(
  p_pin text, p_id uuid, p_question text, p_answer text, p_wrong1 text, p_wrong2 text, p_wrong3 text,
  p_category text, p_difficulty int, p_note text, p_active boolean default true)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_opts text[];
begin
  perform _qb_pin(p_pin);
  v_opts := array[lower(trim(p_answer)), lower(trim(p_wrong1)), lower(trim(p_wrong2)), lower(trim(p_wrong3))];
  if (select count(distinct x) from unnest(v_opts) x) < 4 then raise exception 'svor_eins'; end if;
  begin
    if p_id is null then
      insert into quiz_questions (question, answer, wrong1, wrong2, wrong3, category, difficulty, note, active)
      values (trim(p_question), trim(p_answer), trim(p_wrong1), trim(p_wrong2), trim(p_wrong3),
              coalesce(nullif(trim(p_category), ''), 'Almennt'), greatest(1, least(3, coalesce(p_difficulty, 2))),
              trim(coalesce(p_note, '')), coalesce(p_active, true))
      returning id into v_id;
    else
      update quiz_questions
         set question = trim(p_question), answer = trim(p_answer),
             wrong1 = trim(p_wrong1), wrong2 = trim(p_wrong2), wrong3 = trim(p_wrong3),
             category = coalesce(nullif(trim(p_category), ''), 'Almennt'),
             difficulty = greatest(1, least(3, coalesce(p_difficulty, 2))),
             note = trim(coalesce(p_note, '')), active = coalesce(p_active, true), updated_at = now()
       where id = p_id
      returning id into v_id;
      if v_id is null then raise exception 'spurning_fannst_ekki'; end if;
    end if;
  exception when unique_violation then
    raise exception 'spurning_til';
  end;
  return v_id;
end $$;

-- Flytja inn margar spurningar í einu: [{question, answer, wrong:[3], category, difficulty, note}]
-- Spurningar sem eru þegar til (sami texti) eða eru ógildar eru hunsaðar.
create or replace function public.qb_import(p_pin text, p_rows jsonb)
returns json language plpgsql security definer set search_path = public as $$
declare r jsonb; v_added int := 0; v_dup int := 0; v_bad int := 0; v_n int;
begin
  perform _qb_pin(p_pin);
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 3000 then raise exception 'of_margar_linur'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    begin
      if coalesce(trim(r->>'question'), '') = '' or coalesce(trim(r->>'answer'), '') = ''
         or jsonb_array_length(coalesce(r->'wrong', '[]'::jsonb)) < 3 then
        v_bad := v_bad + 1; continue;
      end if;
      if (select count(distinct lower(trim(x))) from unnest(array[r->>'answer', r->'wrong'->>0, r->'wrong'->>1, r->'wrong'->>2]) x) < 4 then
        v_bad := v_bad + 1; continue;
      end if;
      insert into quiz_questions (question, answer, wrong1, wrong2, wrong3, category, difficulty, note)
      values (trim(r->>'question'), trim(r->>'answer'), trim(r->'wrong'->>0), trim(r->'wrong'->>1), trim(r->'wrong'->>2),
              coalesce(nullif(trim(r->>'category'), ''), 'Almennt'),
              greatest(1, least(3, coalesce(nullif(r->>'difficulty', '')::int, 2))),
              left(trim(coalesce(r->>'note', '')), 400))
      on conflict do nothing;
      get diagnostics v_n = row_count;
      if v_n = 1 then v_added := v_added + 1; else v_dup := v_dup + 1; end if;
    exception when check_violation or invalid_text_representation or numeric_value_out_of_range then
      v_bad := v_bad + 1;
    end;
  end loop;
  return json_build_object('added', v_added, 'duplicates', v_dup, 'invalid', v_bad);
end $$;

create or replace function public.qb_delete(p_pin text, p_ids uuid[])
returns int language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  perform _qb_pin(p_pin);
  delete from quiz_questions where id = any(p_ids);
  get diagnostics v_n = row_count;
  return v_n;
end $$;

create or replace function public.qb_set_active(p_pin text, p_ids uuid[], p_active boolean)
returns int language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  perform _qb_pin(p_pin);
  update quiz_questions set active = p_active, updated_at = now() where id = any(p_ids);
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- Merkja spurningar notaðar (svo kerfið velji síður sömu spurningar næst)
create or replace function public.qb_mark_used(p_pin text, p_ids uuid[])
returns void language plpgsql security definer set search_path = public as $$
begin
  perform _qb_pin(p_pin);
  update quiz_questions set times_used = times_used + 1, last_used = now() where id = any(p_ids);
end $$;

-- ---------- Spurningin sést líka í símanum ----------
-- Nýr dálkur á leiknum: texti spurningar sem er í gangi (tómt í lagaumferðum).
alter table public.games add column if not exists current_prompt text;

create or replace function public.host_start_round(p_game_id uuid, p_host_token uuid, p_round int)
returns json language plpgsql security definer set search_path = public as $$
declare v_opts jsonb; v_meta jsonb;
begin
  perform _check_host(p_game_id, p_host_token);
  select options, meta into v_opts, v_meta from round_keys where game_id = p_game_id and round_no = p_round;
  if v_opts is null then raise exception 'engin_slik_umferd'; end if;
  update games set state = 'question', current_round = p_round,
                   round_started_at = clock_timestamp(),
                   current_options = v_opts, current_correct = null,
                   current_prompt = case when v_meta->>'type' = 'q' then left(v_meta->>'question', 400) end
   where id = p_game_id;
  return json_build_object('ok', true, 'started_at', clock_timestamp());
end $$;

create or replace function public.my_state(p_player_id uuid, p_token uuid)
returns json language plpgsql security definer set search_path = public as $$
declare v_game uuid; g games%rowtype; p players%rowtype; a answers%rowtype; v_show boolean;
begin
  v_game := _check_player(p_player_id, p_token);
  select * into g from games where id = v_game;
  select * into p from players where id = p_player_id;
  select * into a from answers where game_id = v_game and round_no = g.current_round and player_id = p_player_id;
  v_show := g.state in ('reveal','leaderboard','finished');
  return json_build_object(
    'game', json_build_object('id', g.id, 'code', g.code, 'title', g.title, 'state', g.state,
              'current_round', g.current_round, 'total_rounds', g.total_rounds,
              'answer_seconds', g.answer_seconds, 'current_options', g.current_options,
              'current_correct', g.current_correct, 'current_prompt', g.current_prompt,
              'seconds_left', case when g.state = 'question'
                 then greatest(0, g.answer_seconds - extract(epoch from clock_timestamp() - g.round_started_at))
                 else null end),
    'player', json_build_object('name', p.name, 'score', p.score,
              'rank', (select count(*) + 1 from players x where x.game_id = v_game and x.score > p.score),
              'total', (select count(*) from players x where x.game_id = v_game)),
    'answer', case when a.player_id is null then null
              else json_build_object('choice', a.choice,
                     'correct', case when v_show then a.is_correct end,
                     'points',  case when v_show then a.points end,
                     'is_first', case when v_show then a.is_first end) end);
end $$;

-- ---------- Réttindi ----------
revoke all on public.quiz_questions from anon, authenticated;
revoke all on function
  public._qb_pin(text),
  public.qb_list(text),
  public.qb_save(text, uuid, text, text, text, text, text, text, int, text, boolean),
  public.qb_import(text, jsonb),
  public.qb_delete(text, uuid[]),
  public.qb_set_active(text, uuid[], boolean),
  public.qb_mark_used(text, uuid[])
from public, anon, authenticated;
grant execute on function
  public.qb_list(text),
  public.qb_save(text, uuid, text, text, text, text, text, text, int, text, boolean),
  public.qb_import(text, jsonb),
  public.qb_delete(text, uuid[]),
  public.qb_set_active(text, uuid[], boolean),
  public.qb_mark_used(text, uuid[]),
  public.host_start_round(uuid, uuid, int),
  public.my_state(uuid, uuid)
to anon, authenticated;

-- ---------- Byrjunarspurningar (aðeins ef bankinn er tómur) ----------
do $$ begin
  if not exists (select 1 from public.quiz_questions) then
    insert into public.quiz_questions (question, answer, wrong1, wrong2, wrong3, category, difficulty, note) values
  ('Hvaða ár hófst eldgosið á Heimaey?', '1973', '1963', '1968', '1983', 'Vestmannaeyjar', 1, 'Gosið hófst aðfaranótt 23. janúar 1973. Nær allir íbúar, um 5.000 manns, voru fluttir upp á land um nóttina, flestir með fiskibátum.'),
  ('Hvaða fjall myndaðist í Heimaeyjargosinu 1973?', 'Eldfell', 'Helgafell', 'Heimaklettur', 'Sæfell', 'Vestmannaeyjar', 2, 'Eldfell var ekki til fyrir 23. janúar 1973.'),
  ('Hvaða eyja reis úr sjó í eldgosi sem hófst árið 1963?', 'Surtsey', 'Elliðaey', 'Bjarnarey', 'Hellisey', 'Vestmannaeyjar', 2, 'Surtsey er á heimsminjaskrá UNESCO og aðeins vísindamenn mega fara þangað.'),
  ('Hvar í Vestmannaeyjum er Þjóðhátíð haldin?', 'Í Herjólfsdal', 'Á Stórhöfða', 'Við Friðarhöfn', 'Í Klaufinni', 'Vestmannaeyjar', 1, ''),
  ('Hvaða ár var fyrsta Þjóðhátíðin haldin í Vestmannaeyjum?', '1874', '1918', '1930', '1944', 'Vestmannaeyjar', 2, 'Fyrsta Þjóðhátíðin var haldin árið 1874, þegar 1000 ára afmælis Íslandsbyggðar var minnst um allt land.'),
  ('Um hvaða helgi er Þjóðhátíð haldin?', 'Verslunarmannahelgina', 'Hvítasunnuhelgina', 'Sjómannadagshelgina', 'Páskahelgina', 'Vestmannaeyjar', 1, ''),
  ('Hvað kallast lundaungarnir sem börn í Eyjum bjarga og sleppa á haf út síðsumars?', 'Pysjur', 'Kríur', 'Lóur', 'Teistur', 'Vestmannaeyjar', 2, ''),
  ('Hvað heitir hæsta fjallið í Vestmannaeyjum?', 'Heimaklettur', 'Eldfell', 'Helgafell', 'Stórhöfði', 'Vestmannaeyjar', 2, 'Heimaklettur er 283 metra hár.'),
  ('Hvaða frægi háhyrningur bjó um tíma í Klettsvík?', 'Keikó', 'Shamú', 'Tilikum', 'Moby', 'Vestmannaeyjar', 1, 'Keikó lék í kvikmyndinni Free Willy og var fluttur til Eyja árið 1998.'),
  ('Hvaða ár var Tyrkjaránið í Vestmannaeyjum?', '1627', '1527', '1707', '1783', 'Vestmannaeyjar', 3, 'Hundruðum Eyjamanna var rænt og þeir seldir í þrældóm í Alsír.'),
  ('Af hverjum draga Vestmannaeyjar nafn sitt samkvæmt Landnámu?', 'Írskum þrælum', 'Norskum kaupmönnum', 'Skoskum munkum', 'Dönskum hermönnum', 'Vestmannaeyjar', 3, 'Þrælar Hjörleifs, fóstbróður Ingólfs Arnarsonar, flúðu til Eyja eftir að hafa drepið hann. Írar voru kallaðir Vestmenn.'),
  ('Hvað heitir Vestmannaeyjaferjan?', 'Herjólfur', 'Baldur', 'Sæfari', 'Akraborg', 'Vestmannaeyjar', 1, ''),
  ('Í hvaða höfn á fastalandinu kemur Herjólfur oftast?', 'Landeyjahöfn', 'Þorlákshöfn', 'Grindavík', 'Sandgerði', 'Vestmannaeyjar', 2, ''),
  ('Hvaða ár var Landeyjahöfn opnuð?', '2010', '2000', '2005', '2014', 'Vestmannaeyjar', 3, ''),
  ('Hvað heitir safnið í Eyjum sem segir sögu gossins 1973 og sýnir hús sem grafið var upp úr vikrinum?', 'Eldheimar', 'Sagnheimar', 'Surtseyjarstofa', 'Gosminjasafnið', 'Vestmannaeyjar', 2, 'Safnið hefur verið kallað „Pompei norðursins“.'),
  ('Hvaða dýr búa í griðastaðnum í Klettsvík?', 'Mjaldrar', 'Háhyrningar', 'Selir', 'Höfrungar', 'Vestmannaeyjar', 2, 'Mjaldrarnir Litla Grá og Litla Hvít komu þangað frá sædýrasafni í Kína árið 2019.'),
  ('Hvaða íþróttafélag keppir fyrir Vestmannaeyjar?', 'ÍBV', 'ÍA', 'KA', 'HK', 'Vestmannaeyjar', 1, ''),
  ('Hvað kallast það að sveifla sér í kaðli utan í bjargi, eins og börn í Eyjum læra?', 'Að spranga', 'Að síga', 'Að sveima', 'Að príla', 'Vestmannaeyjar', 2, ''),
  ('Hvaða dag lauk Heimaeyjargosinu formlega?', '3. júlí 1973', '17. júní 1973', '1. maí 1973', '23. ágúst 1973', 'Vestmannaeyjar', 3, 'Goslokahátíð er haldin í Eyjum fyrstu helgina í júlí.'),
  ('Hvað heitir fótboltamót 6. flokks drengja sem haldið er í Eyjum á hverju sumri?', 'Orkumótið', 'N1-mótið', 'Rey Cup', 'Norðurálsmótið', 'Vestmannaeyjar', 2, 'Mótið hefur verið haldið frá árinu 1984.'),
  ('Hvaða tónskáld úr Eyjum samdi „Ég veit þú kemur“ og fjölda annarra þjóðhátíðarlaga?', 'Oddgeir Kristjánsson', 'Ási í Bæ', 'Sigfús Halldórsson', 'Gylfi Ægisson', 'Vestmannaeyjar', 3, 'Oddgeir (1911–1966) samdi mörg ástsælustu þjóðhátíðarlögin, mörg við texta Ása í Bæ.'),
  ('Hvaða fugl er einkennisfugl Vestmannaeyja?', 'Lundinn', 'Krían', 'Fýllinn', 'Hrafninn', 'Vestmannaeyjar', 1, ''),
  ('Hvað heitir syðsti oddi Heimaeyjar, frægur fyrir rok?', 'Stórhöfði', 'Ræningjatangi', 'Klaufin', 'Skansinn', 'Vestmannaeyjar', 2, 'Stórhöfði er talinn einn vindasamasti staður Evrópu.'),
  ('Í hvaða hljómsveit söng Björk áður en hún hóf sólóferil?', 'Sykurmolunum', 'Stuðmönnum', 'Sigur Rós', 'Nýdönsk', 'Íslensk tónlist', 1, ''),
  ('Hvað heitir platan sem Sigur Rós gaf út árið 1999 og vakti heimsathygli?', 'Ágætis byrjun', 'Takk...', 'Von', 'Með suð í eyrum við spilum endalaust', 'Íslensk tónlist', 2, ''),
  ('Hvaða íslenska hljómsveit sló í gegn með laginu „Little Talks“?', 'Of Monsters and Men', 'Kaleo', 'Sigur Rós', 'Mammút', 'Íslensk tónlist', 1, ''),
  ('Hvaða hljómsveit frá Mosfellsbæ sló í gegn með laginu „Way Down We Go“?', 'Kaleo', 'Of Monsters and Men', 'Vök', 'Agent Fresco', 'Íslensk tónlist', 2, ''),
  ('Fyrir tónlist í hvaða kvikmynd hlaut Hildur Guðnadóttir Óskarsverðlaun?', 'Joker', 'Sicario', 'Arrival', 'Chernobyl', 'Íslensk tónlist', 2, 'Hún hlaut verðlaunin árið 2020, fyrst Íslendinga til að hljóta Óskarsverðlaun.'),
  ('Með hvaða lagi keppti Ísland fyrst í Eurovision árið 1986?', 'Gleðibankanum', 'Nínu', 'Minn hinsti dans', 'Eitt lag enn', 'Íslensk tónlist', 1, ''),
  ('Með hvaða lagi náði Ísland 2. sæti í Eurovision árið 1999?', 'All Out of Luck', 'Is It True?', 'Open Your Heart', 'Think About Things', 'Íslensk tónlist', 2, 'Selma Björnsdóttir söng lagið. Ísland náði aftur 2. sæti árið 2009 með „Is It True?“'),
  ('Hvaða sveit keppti fyrir Ísland í Eurovision 2019 með laginu „Hatrið mun sigra“?', 'Hatari', 'Daði og Gagnamagnið', 'Reykjavíkurdætur', 'Systur', 'Íslensk tónlist', 2, ''),
  ('Hver söng „Think About Things“ sem átti að keppa í Eurovision 2020?', 'Daði og Gagnamagnið', 'Hatari', 'Systur', 'Diljá', 'Íslensk tónlist', 1, ''),
  ('Í hvaða kvikmynd frá 1982 léku Stuðmenn og Grýlurnar?', 'Með allt á hreinu', 'Sódóma Reykjavík', 'Stella í orlofi', 'Englar alheimsins', 'Íslensk tónlist', 2, ''),
  ('Hvaða hljómsveit stofnaði Bubbi Morthens árið 1980?', 'Utangarðsmenn', 'Þursaflokkinn', 'Fræbbblana', 'Tappa Tíkarrass', 'Íslensk tónlist', 2, ''),
  ('Hvaða tónlistarhátíð stofnaði Mugison ásamt föður sínum á Ísafirði?', 'Aldrei fór ég suður', 'Bræðsluna', 'Eistnaflug', 'Secret Solstice', 'Íslensk tónlist', 2, 'Hátíðin er haldin um páskana og aðgangur er ókeypis.'),
  ('Hvaða ár var Iceland Airwaves fyrst haldin?', '1999', '1994', '2004', '2009', 'Íslensk tónlist', 2, 'Fyrstu tónleikarnir voru haldnir í flugskýli á Reykjavíkurflugvelli.'),
  ('Hvaða íslenska tónlistarkona vann Grammy-verðlaun árið 2024?', 'Laufey', 'Björk', 'GDRN', 'Emilíana Torrini', 'Íslensk tónlist', 2, 'Laufey vann fyrir plötuna Bewitched. Björk hefur oft verið tilnefnd en aldrei unnið.'),
  ('Hvaða söngkona söng „Gollum''s Song“ í Hringadróttinssögu?', 'Emilíana Torrini', 'Björk', 'Lay Low', 'Hafdís Huld', 'Íslensk tónlist', 2, ''),
  ('Hverjir sungu lagið „Nína“ í Eurovision 1991?', 'Stefán Hilmarsson og Eyjólfur Kristjánsson', 'Sigríður Beinteinsdóttir og Grétar Örvarsson', 'Páll Óskar og Bjarni Arason', 'Helgi Björnsson og Björgvin Halldórsson', 'Íslensk tónlist', 2, ''),
  ('Hvaða hljómsveit frá Keflavík var kölluð „Bítlarnir íslensku“?', 'Hljómar', 'Trúbrot', 'Dátar', 'Flowers', 'Íslensk tónlist', 2, ''),
  ('Hvað heitir fyrsta plata Ásgeirs Trausta?', 'Dýrð í dauðaþögn', 'Afterglow', 'Bury the Moon', 'Sátt', 'Íslensk tónlist', 3, 'Platan varð ein mest selda frumraun Íslandssögunnar.'),
  ('Hver er söngvari Sálarinnar hans Jóns míns?', 'Stefán Hilmarsson', 'Daníel Ágúst Haraldsson', 'Helgi Björnsson', 'Páll Rósinkranz', 'Íslensk tónlist', 2, ''),
  ('Með hverju spilar Jónsi í Sigur Rós oft á rafgítarinn?', 'Sellóboga', 'Fiðluboga', 'Skrúfjárni', 'Trommukjuða', 'Íslensk tónlist', 3, ''),
  ('Hvaða lag flutti Páll Óskar í Eurovision 1997?', 'Minn hinsti dans', 'Ég á líf', 'Nei eða já', 'Gleðibankinn', 'Íslensk tónlist', 2, ''),
  ('Frá hvaða borg komu Bítlarnir?', 'Liverpool', 'Manchester', 'London', 'Birmingham', 'Erlend tónlist', 1, ''),
  ('Hvaða hljómsveit gaf út lagið „Bohemian Rhapsody“?', 'Queen', 'The Who', 'Led Zeppelin', 'Pink Floyd', 'Erlend tónlist', 1, ''),
  ('Með hvaða lagi vann ABBA Eurovision árið 1974?', 'Waterloo', 'Dancing Queen', 'Mamma Mia', 'Fernando', 'Erlend tónlist', 1, ''),
  ('Hvaða plata er talin mest selda plata allra tíma?', 'Thriller – Michael Jackson', 'Back in Black – AC/DC', 'The Dark Side of the Moon – Pink Floyd', 'Abbey Road – Bítlarnir', 'Erlend tónlist', 2, ''),
  ('Hvað hét Freddie Mercury réttu nafni?', 'Farrokh Bulsara', 'Frederick Merriman', 'Farid Malik', 'Frank Mercer', 'Erlend tónlist', 3, ''),
  ('Hvaða lönd hafa oftast unnið Eurovision?', 'Svíþjóð og Írland', 'Bretland og Frakkland', 'Noregur og Danmörk', 'Ítalía og Holland', 'Erlend tónlist', 2, 'Bæði löndin hafa unnið sjö sinnum.'),
  ('Frá hvaða landi var Bob Marley?', 'Jamaíku', 'Kúbu', 'Trínidad', 'Barbados', 'Erlend tónlist', 1, ''),
  ('Í hvaða borg fæddist Mozart?', 'Salzburg', 'Vín', 'Prag', 'München', 'Erlend tónlist', 2, ''),
  ('Hvaða hljómsveit gaf út plötuna „Nevermind“ árið 1991?', 'Nirvana', 'Pearl Jam', 'Soundgarden', 'Foo Fighters', 'Erlend tónlist', 2, ''),
  ('Hvaða hljómsveit gaf út plötuna „The Dark Side of the Moon“?', 'Pink Floyd', 'Led Zeppelin', 'Genesis', 'Deep Purple', 'Erlend tónlist', 2, ''),
  ('Hvað hét tónlistarhátíðin fræga sem haldin var í Bandaríkjunum í ágúst 1969?', 'Woodstock', 'Coachella', 'Glastonbury', 'Lollapalooza', 'Erlend tónlist', 1, ''),
  ('Frá hvaða landi er raftónlistartvíeykið Daft Punk?', 'Frakklandi', 'Belgíu', 'Þýskalandi', 'Hollandi', 'Erlend tónlist', 2, ''),
  ('Hver er söngvari The Rolling Stones?', 'Mick Jagger', 'Keith Richards', 'Roger Daltrey', 'Robert Plant', 'Erlend tónlist', 1, ''),
  ('Hvaða tónskáld var orðið nær heyrnarlaust þegar það samdi níundu sinfóníuna sína?', 'Ludwig van Beethoven', 'Wolfgang Amadeus Mozart', 'Johann Sebastian Bach', 'Johannes Brahms', 'Erlend tónlist', 2, ''),
  ('Hvaða söngkona fór í tónleikaferðina „The Eras Tour“?', 'Taylor Swift', 'Beyoncé', 'Adele', 'Lady Gaga', 'Erlend tónlist', 1, ''),
  ('Hver er hæsti tindur Íslands?', 'Hvannadalshnúkur', 'Snæfell', 'Herðubreið', 'Bárðarbunga', 'Landið okkar', 1, 'Hvannadalshnúkur er í Öræfajökli, um 2.110 metra hár.'),
  ('Hver er stærsti jökull Íslands?', 'Vatnajökull', 'Langjökull', 'Hofsjökull', 'Mýrdalsjökull', 'Landið okkar', 1, ''),
  ('Hver er lengsta á Íslands?', 'Þjórsá', 'Jökulsá á Fjöllum', 'Ölfusá', 'Lagarfljót', 'Landið okkar', 2, 'Þjórsá er um 230 km löng.'),
  ('Hvert er stærsta náttúrulega stöðuvatn á Íslandi?', 'Þingvallavatn', 'Mývatn', 'Lögurinn', 'Hvítárvatn', 'Landið okkar', 2, ''),
  ('Hvaða foss er talinn aflmesti foss Evrópu?', 'Dettifoss', 'Gullfoss', 'Goðafoss', 'Skógafoss', 'Landið okkar', 1, ''),
  ('Hvaða íslenska eyja liggur á norðurheimskautsbaugnum?', 'Grímsey', 'Hrísey', 'Flatey', 'Drangey', 'Landið okkar', 2, ''),
  ('Hvaða hver gaf goshverum um allan heim nafn sitt?', 'Geysir', 'Strokkur', 'Grýla', 'Bláhver', 'Landið okkar', 1, ''),
  ('Hvaða eldfjall gaus árið 2010 og truflaði flugumferð um alla Evrópu?', 'Eyjafjallajökull', 'Katla', 'Hekla', 'Grímsvötn', 'Landið okkar', 2, ''),
  ('Hvaða bær var rýmdur í nóvember 2023 vegna jarðhræringa á Reykjanesskaga?', 'Grindavík', 'Vogar', 'Sandgerði', 'Hafnarfjörður', 'Landið okkar', 2, ''),
  ('Hver er hæsta kirkja á Íslandi?', 'Hallgrímskirkja', 'Akureyrarkirkja', 'Landakotskirkja', 'Skálholtskirkja', 'Landið okkar', 1, 'Turn Hallgrímskirkju er 74,5 metrar.'),
  ('Hvaða skeifulaga gljúfur á samkvæmt þjóðsögunni að vera hófspor Sleipnis?', 'Ásbyrgi', 'Fjaðrárgljúfur', 'Stuðlagil', 'Kolugljúfur', 'Landið okkar', 2, ''),
  ('Við hvaða vatn eru Dimmuborgir?', 'Mývatn', 'Þingvallavatn', 'Lagarfljót', 'Jökulsárlón', 'Landið okkar', 1, ''),
  ('Hvaðan dregur Mývatn nafn sitt?', 'Af mýinu sem þar er', 'Af mýrunum í kring', 'Af landnámsmanninum Mý', 'Af gömlu orði yfir silung', 'Landið okkar', 2, ''),
  ('Hvaða fjall á Snæfellsnesi er eitt mest myndaða fjall landsins?', 'Kirkjufell', 'Stapafell', 'Helgafell', 'Búlandstindur', 'Landið okkar', 2, ''),
  ('Í hvaða landshluta er Ísafjörður?', 'Á Vestfjörðum', 'Á Norðurlandi', 'Á Austfjörðum', 'Á Vesturlandi', 'Landið okkar', 1, ''),
  ('Á mótum hvaða tveggja jarðfleka liggur Ísland?', 'Norður-Ameríkuflekans og Evrasíuflekans', 'Afríkuflekans og Evrasíuflekans', 'Kyrrahafsflekans og Norður-Ameríkuflekans', 'Evrasíuflekans og Arabíuflekans', 'Landið okkar', 2, ''),
  ('Hvaða staður á Íslandi var fyrstur settur á heimsminjaskrá UNESCO?', 'Þingvellir', 'Surtsey', 'Vatnajökulsþjóðgarður', 'Mývatn', 'Landið okkar', 3, 'Þingvellir komust á skrána árið 2004, Surtsey 2008 og Vatnajökulsþjóðgarður 2019.'),
  ('Hver er höfuðborg Ástralíu?', 'Canberra', 'Sydney', 'Melbourne', 'Perth', 'Heimurinn', 1, ''),
  ('Hver er höfuðborg Kanada?', 'Ottawa', 'Toronto', 'Montreal', 'Vancouver', 'Heimurinn', 1, ''),
  ('Hver er höfuðborg Grænlands?', 'Nuuk', 'Ilulissat', 'Tasiilaq', 'Qaqortoq', 'Heimurinn', 2, ''),
  ('Hver er höfuðborg Færeyja?', 'Þórshöfn', 'Klakksvík', 'Rúnavík', 'Tvøroyri', 'Heimurinn', 1, ''),
  ('Hvert er stærsta land í heimi að flatarmáli?', 'Rússland', 'Kanada', 'Kína', 'Bandaríkin', 'Heimurinn', 1, ''),
  ('Hvert er fjölmennasta land heims?', 'Indland', 'Kína', 'Bandaríkin', 'Indónesía', 'Heimurinn', 2, 'Indland fór fram úr Kína árið 2023.'),
  ('Hvert er minnsta ríki heims?', 'Vatíkanið', 'Mónakó', 'San Marínó', 'Liechtenstein', 'Heimurinn', 1, ''),
  ('Hvert er stærsta haf jarðar?', 'Kyrrahaf', 'Atlantshaf', 'Indlandshaf', 'Norður-Íshaf', 'Heimurinn', 1, ''),
  ('Í hvaða landi er Machu Picchu?', 'Perú', 'Bólivíu', 'Mexíkó', 'Chile', 'Heimurinn', 2, ''),
  ('Hvaða fljót rennur um flest lönd?', 'Dóná', 'Rín', 'Níl', 'Amazon', 'Heimurinn', 2, 'Dóná rennur um tíu lönd.'),
  ('Hvaða borg er kölluð „Stóra eplið“?', 'New York', 'Los Angeles', 'Chicago', 'Boston', 'Heimurinn', 1, ''),
  ('Hvaða sund skilur á milli Evrópu og Afríku?', 'Gíbraltarsund', 'Bosporussund', 'Ermarsund', 'Hormússund', 'Heimurinn', 2, ''),
  ('Hver er höfuðborg Nýja-Sjálands?', 'Wellington', 'Auckland', 'Christchurch', 'Queenstown', 'Heimurinn', 2, ''),
  ('Hver er höfuðborg Tyrklands?', 'Ankara', 'Istanbúl', 'Izmir', 'Antalya', 'Heimurinn', 2, ''),
  ('Hver er stærsta heita eyðimörk jarðar?', 'Sahara', 'Góbí', 'Kalahari', 'Atacama', 'Heimurinn', 1, ''),
  ('Hvaða ár var Alþingi stofnað?', '930', '874', '1000', '1262', 'Saga', 1, ''),
  ('Hvaða dag var lýðveldið Ísland stofnað?', '17. júní 1944', '1. desember 1918', '17. júní 1911', '1. desember 1944', 'Saga', 1, ''),
  ('Hvaða ár varð Ísland fullvalda ríki?', '1918', '1874', '1904', '1944', 'Saga', 2, 'Fullveldið tók gildi 1. desember 1918.'),
  ('Hver er talinn fyrsti landnámsmaður Íslands?', 'Ingólfur Arnarson', 'Hjörleifur Hróðmarsson', 'Garðar Svavarsson', 'Hrafna-Flóki', 'Saga', 1, ''),
  ('Hver var fyrsti forseti lýðveldisins Íslands?', 'Sveinn Björnsson', 'Ásgeir Ásgeirsson', 'Jón Sigurðsson', 'Kristján Eldjárn', 'Saga', 1, ''),
  ('Hvaða ár var Vigdís Finnbogadóttir kjörin forseti?', '1980', '1976', '1984', '1988', 'Saga', 2, 'Hún var fyrsta konan í heiminum sem kjörin var þjóðhöfðingi í lýðræðislegum kosningum.'),
  ('Við hverja háðu Íslendingar þorskastríðin?', 'Breta', 'Norðmenn', 'Dani', 'Þjóðverja', 'Saga', 1, ''),
  ('Hvaða eldgos olli Móðuharðindunum?', 'Skaftáreldar', 'Heklugos', 'Kötlugos', 'Öskjugos', 'Saga', 2, 'Gosið í Lakagígum hófst árið 1783.'),
  ('Hvaða dag lögðu konur niður störf í Kvennafríinu 1975?', '24. október', '19. júní', '8. mars', '1. maí', 'Saga', 2, ''),
  ('Hvar hittust Reagan og Gorbatsjov á leiðtogafundinum 1986?', 'Í Höfða', 'Í Ráðherrabústaðnum', 'Á Bessastöðum', 'Á Hótel Sögu', 'Saga', 2, ''),
  ('Hvar var Snorri Sturluson veginn árið 1241?', 'Í Reykholti', 'Í Skálholti', 'Á Þingvöllum', 'Í Odda', 'Saga', 2, ''),
  ('Hvaða biskup var hálshöggvinn í Skálholti árið 1550?', 'Jón Arason', 'Ögmundur Pálsson', 'Guðbrandur Þorláksson', 'Brynjólfur Sveinsson', 'Saga', 3, ''),
  ('Hvaða dag hernámu Bretar Ísland?', '10. maí 1940', '9. apríl 1940', '1. september 1939', '7. júlí 1941', 'Saga', 2, ''),
  ('Hvaða ár var bjórbanninu aflétt á Íslandi?', '1989', '1979', '1984', '1995', 'Saga', 2, 'Bjór var leyfður 1. mars 1989 og síðan heitir sá dagur bjórdagurinn.'),
  ('Hvaða handrit kom heim frá Danmörku árið 1971 ásamt Flateyjarbók?', 'Konungsbók eddukvæða', 'Möðruvallabók', 'Skarðsbók', 'Heimskringla', 'Saga', 3, ''),
  ('Hvar fæddist Jón Sigurðsson forseti?', 'Á Hrafnseyri', 'Í Reykjavík', 'Á Bessastöðum', 'Í Kaupmannahöfn', 'Saga', 2, ''),
  ('Hvaða norræni landkönnuður er talinn hafa fyrstur stigið á land í Ameríku um árið 1000?', 'Leifur Eiríksson', 'Eiríkur rauði', 'Ingólfur Arnarson', 'Garðar Svavarsson', 'Saga', 2, ''),
  ('Hvaða ár var kristni lögtekin á Alþingi?', 'Árið 1000', 'Árið 930', 'Árið 1050', 'Árið 1104', 'Saga', 1, ''),
  ('Hvaða lið sigraði Ísland í 16 liða úrslitum EM 2016?', 'England', 'Austurríki', 'Portúgal', 'Frakkland', 'Íþróttir', 1, 'Ísland vann 2–1 í Nice.'),
  ('Hver varði vítaspyrnu frá Lionel Messi á HM 2018?', 'Hannes Þór Halldórsson', 'Rúnar Alex Rúnarsson', 'Gunnleifur Gunnleifsson', 'Ögmundur Kristinsson', 'Íþróttir', 2, ''),
  ('Hvaða verðlaun hlaut handboltalandsliðið á Ólympíuleikunum í Peking 2008?', 'Silfur', 'Gull', 'Brons', 'Ekkert, það varð í 4. sæti', 'Íþróttir', 2, ''),
  ('Hver vann fyrstu Ólympíuverðlaun Íslendinga?', 'Vilhjálmur Einarsson', 'Vala Flosadóttir', 'Bjarni Friðriksson', 'Jón Arnar Magnússon', 'Íþróttir', 2, 'Vilhjálmur vann silfur í þrístökki í Melbourne árið 1956.'),
  ('Í hvaða grein vann Vala Flosadóttir brons á Ólympíuleikunum í Sydney 2000?', 'Stangarstökki', 'Hástökki', 'Langstökki', 'Spjótkasti', 'Íþróttir', 2, ''),
  ('Hvaða Íslendingur kom inn á fyrir föður sinn í landsleik árið 1996?', 'Eiður Smári Guðjohnsen', 'Arnór Guðjohnsen', 'Gylfi Sigurðsson', 'Hermann Hreiðarsson', 'Íþróttir', 2, ''),
  ('Hver lék „Fjallið“ í Game of Thrones?', 'Hafþór Júlíus Björnsson', 'Magnús Ver Magnússon', 'Jón Páll Sigmarsson', 'Benedikt Magnússon', 'Íþróttir', 1, ''),
  ('Hversu oft vann Jón Páll Sigmarsson keppnina Sterkasti maður heims?', 'Fjórum sinnum', 'Tvisvar', 'Þrisvar', 'Fimm sinnum', 'Íþróttir', 2, ''),
  ('Hvaða íslenska knattspyrnukona skoraði í úrslitaleik Meistaradeildarinnar 2020?', 'Sara Björk Gunnarsdóttir', 'Glódís Perla Viggósdóttir', 'Margrét Lára Viðarsdóttir', 'Dagný Brynjarsdóttir', 'Íþróttir', 2, 'Hún skoraði fyrir Lyon gegn sínu gamla félagi, Wolfsburg.'),
  ('Hvaða íslenska kona varð fyrst kvenna til að vinna heimsleikana í CrossFit tvisvar?', 'Annie Mist Þórisdóttir', 'Katrín Tanja Davíðsdóttir', 'Sara Sigmundsdóttir', 'Þuríður Erla Helgadóttir', 'Íþróttir', 2, ''),
  ('Hvaða verðlaunagrip hlýtur sigurvegari Íslandsglímu karla?', 'Grettisbeltið', 'Freyjumenið', 'Ármannsskjöldinn', 'Þórshamarinn', 'Íþróttir', 3, ''),
  ('Hvaða félag hefur oftast orðið Íslandsmeistari í knattspyrnu karla?', 'KR', 'Valur', 'ÍA', 'Fram', 'Íþróttir', 2, ''),
  ('Hvað kallast fagnaðarlætin sem stuðningsmenn Íslands gerðu fræg á EM 2016?', 'Víkingaklappið', 'Ísklappið', 'Fjallaklappið', 'Eldklappið', 'Íþróttir', 1, ''),
  ('Í hvaða íþrótt keppti Ólafur Stefánsson?', 'Handbolta', 'Körfubolta', 'Fótbolta', 'Blaki', 'Íþróttir', 1, ''),
  ('Hvað heitir efsta deild karla í knattspyrnu á Íslandi í dag?', 'Besta deildin', 'Pepsi Max-deildin', 'Úrvalsdeildin', 'Lengjudeildin', 'Íþróttir', 2, ''),
  ('Hvaða lið sló Ísland út í 8 liða úrslitum EM 2016?', 'Frakkland', 'Þýskaland', 'Wales', 'Portúgal', 'Íþróttir', 2, 'Frakkland vann 5–2 í París.'),
  ('Hvert er eina landspendýrið sem lifði á Íslandi fyrir landnám?', 'Heimskautarefurinn', 'Hreindýrið', 'Minkurinn', 'Hagamúsin', 'Náttúra og dýr', 1, ''),
  ('Hvaða blóm var valið þjóðarblóm Íslendinga árið 2004?', 'Holtasóley', 'Gleym-mér-ei', 'Blóðberg', 'Lambagras', 'Náttúra og dýr', 2, ''),
  ('Hvaða landvættur gætir Suðurlands?', 'Bergrisinn', 'Drekinn', 'Gammurinn', 'Griðungurinn', 'Náttúra og dýr', 2, ''),
  ('Hvað kallast gangtegundin sem íslenski hesturinn er frægur fyrir?', 'Tölt', 'Brokk', 'Fet', 'Stökk', 'Náttúra og dýr', 1, ''),
  ('Hvaða fugl flýgur lengst allra fugla í árlegu farflugi?', 'Krían', 'Lóan', 'Spóinn', 'Lundinn', 'Náttúra og dýr', 2, ''),
  ('Hvaða fugl er hvítur á veturna og brúnn á sumrin?', 'Rjúpan', 'Hrafninn', 'Lóan', 'Fálkinn', 'Náttúra og dýr', 1, ''),
  ('Hvaða fugl dó út árið 1844 þegar síðustu tveir voru drepnir í Eldey?', 'Geirfuglinn', 'Haförninn', 'Skúmurinn', 'Snæuglan', 'Náttúra og dýr', 3, ''),
  ('Hvert er stærsta dýr jarðar?', 'Steypireyður', 'Langreyður', 'Búrhvalur', 'Hnúfubakur', 'Náttúra og dýr', 1, ''),
  ('Hvenær voru hreindýr flutt til Íslands?', 'Á 18. öld', 'Á landnámsöld', 'Á 14. öld', 'Á 20. öld', 'Náttúra og dýr', 2, ''),
  ('Hvaða tré myndaði skóga á Íslandi við landnám?', 'Birki', 'Fura', 'Greni', 'Ösp', 'Náttúra og dýr', 2, ''),
  ('Hvað kallast ljósadýrðin á næturhimninum sem sólvindurinn veldur?', 'Norðurljós', 'Hrævareldur', 'Glitský', 'Kvöldroði', 'Náttúra og dýr', 1, ''),
  ('Hve stór hluti íslenskra heimila er hitaður með jarðhita?', 'Um 90%', 'Um 30%', 'Um 50%', 'Um 70%', 'Náttúra og dýr', 2, ''),
  ('Hver er stærsti ránfugl Íslands?', 'Haförninn', 'Fálkinn', 'Smyrillinn', 'Snæuglan', 'Náttúra og dýr', 2, ''),
  ('Hvaða gælunafn hefur lundinn fengið vegna útlitsins?', 'Prófastur', 'Biskup', 'Hreppstjóri', 'Sýslumaður', 'Náttúra og dýr', 3, ''),
  ('Hversu margar tegundir snáka lifa villtar á Íslandi?', 'Engin', 'Ein', 'Tvær', 'Þrjár', 'Náttúra og dýr', 1, ''),
  ('Hvað kallast hver sem þeytir vatni reglulega upp í loftið?', 'Goshver', 'Leirhver', 'Gufuhver', 'Laug', 'Náttúra og dýr', 1, ''),
  ('Hvaða efnatákn hefur gull?', 'Au', 'Ag', 'Gd', 'Go', 'Vísindi', 1, ''),
  ('Hver er efnaformúla vatns?', 'H₂O', 'CO₂', 'O₂', 'H₂O₂', 'Vísindi', 1, ''),
  ('Hver er stærsta reikistjarna sólkerfisins?', 'Júpíter', 'Satúrnus', 'Neptúnus', 'Úranus', 'Vísindi', 1, ''),
  ('Hvaða reikistjarna er næst sólu?', 'Merkúríus', 'Venus', 'Mars', 'Jörðin', 'Vísindi', 1, ''),
  ('Hvaða reikistjarna er heitust?', 'Venus', 'Merkúríus', 'Mars', 'Júpíter', 'Vísindi', 2, 'Þykkur lofthjúpur Venusar heldur hitanum inni.'),
  ('Hvað eru mörg bein í fullorðnum manni?', '206', '186', '226', '256', 'Vísindi', 2, ''),
  ('Hvaða gastegund er algengust í andrúmsloftinu?', 'Köfnunarefni', 'Súrefni', 'Koltvísýringur', 'Argon', 'Vísindi', 2, 'Um 78% andrúmsloftsins er köfnunarefni (nitur).'),
  ('Við hvaða hita sýður vatn við sjávarmál?', '100 °C', '90 °C', '110 °C', '120 °C', 'Vísindi', 1, ''),
  ('Hver uppgötvaði pensilínið?', 'Alexander Fleming', 'Louis Pasteur', 'Marie Curie', 'Robert Koch', 'Vísindi', 2, ''),
  ('Hvað fer ljósið marga kílómetra á sekúndu, um það bil?', '300.000', '30.000', '150.000', '3.000.000', 'Vísindi', 2, ''),
  ('Hver steig fyrstur manna fæti á tunglið?', 'Neil Armstrong', 'Buzz Aldrin', 'Júrí Gagarín', 'John Glenn', 'Vísindi', 1, ''),
  ('Hvar á Íslandi æfðu bandarískir geimfarar fyrir tunglferðirnar?', 'Við Öskju', 'Í Þórsmörk', 'Á Vatnajökli', 'Í Landmannalaugum', 'Vísindi', 3, ''),
  ('Hve mörg hólf eru í mannshjartanu?', 'Fjögur', 'Tvö', 'Þrjú', 'Sex', 'Vísindi', 1, ''),
  ('Hver setti fram jöfnuna E = mc²?', 'Albert Einstein', 'Isaac Newton', 'Niels Bohr', 'Stephen Hawking', 'Vísindi', 1, ''),
  ('Hvert er alkul á Celsíuskvarða, um það bil?', '−273 °C', '−100 °C', '−373 °C', '−459 °C', 'Vísindi', 3, ''),
  ('Hvaða íslenski rithöfundur hlaut Nóbelsverðlaunin í bókmenntum?', 'Halldór Laxness', 'Gunnar Gunnarsson', 'Þórbergur Þórðarson', 'Davíð Stefánsson', 'Bókmenntir og tunga', 1, 'Hann hlaut verðlaunin árið 1955.'),
  ('Í hvaða bók Laxness kemur Bjartur í Sumarhúsum fyrir?', 'Sjálfstætt fólk', 'Salka Valka', 'Íslandsklukkan', 'Heimsljós', 'Bókmenntir og tunga', 2, ''),
  ('Hver sagði „Fögur er hlíðin“ í Njálu?', 'Gunnar á Hlíðarenda', 'Njáll á Bergþórshvoli', 'Skarphéðinn Njálsson', 'Kári Sölmundarson', 'Bókmenntir og tunga', 2, ''),
  ('Hver orti Passíusálmana?', 'Hallgrímur Pétursson', 'Matthías Jochumsson', 'Jónas Hallgrímsson', 'Bjarni Thorarensen', 'Bókmenntir og tunga', 2, 'Sálmarnir eru fimmtíu og eru lesnir í útvarpinu á föstunni.'),
  ('Hvers vegna er Dagur íslenskrar tungu haldinn 16. nóvember?', 'Jónas Hallgrímsson fæddist þann dag', 'Fyrsta íslenska orðabókin kom þá út', 'Alþingi var stofnað þann dag', 'Snorri Sturluson fæddist þann dag', 'Bókmenntir og tunga', 2, ''),
  ('Hverjir sömdu þjóðsöng Íslendinga, Lofsönginn?', 'Matthías Jochumsson og Sveinbjörn Sveinbjörnsson', 'Jónas Hallgrímsson og Páll Ísólfsson', 'Hannes Hafstein og Sigfús Einarsson', 'Einar Benediktsson og Jón Leifs', 'Bókmenntir og tunga', 2, ''),
  ('Hvaða rithöfundur skapaði lögreglumanninn Erlend Sveinsson?', 'Arnaldur Indriðason', 'Yrsa Sigurðardóttir', 'Ragnar Jónasson', 'Stefán Máni', 'Bókmenntir og tunga', 2, ''),
  ('Hvað kallast það þegar fjöldi nýrra bóka kemur út fyrir jólin?', 'Jólabókaflóðið', 'Bókavertíðin', 'Jólalesturinn', 'Bókaregnið', 'Bókmenntir og tunga', 1, ''),
  ('Hve margir stafir eru í íslenska stafrófinu?', '32', '26', '29', '36', 'Bókmenntir og tunga', 2, ''),
  ('Úr hvaða tveimur orðum er orðið „tölva“ myndað?', 'Tala og völva', 'Tala og vél', 'Tal og vala', 'Tölur og vél', 'Bókmenntir og tunga', 2, 'Sigurður Nordal stakk upp á orðinu.'),
  ('Hvaða útlagi bjó síðustu æviár sín í Drangey?', 'Grettir Ásmundarson', 'Gísli Súrsson', 'Fjalla-Eyvindur', 'Hörður Grímkelsson', 'Bókmenntir og tunga', 2, ''),
  ('Hver sagði „Þeim var ek verst er ek unna mest“?', 'Guðrún Ósvífursdóttir', 'Hallgerður langbrók', 'Bergþóra Skarphéðinsdóttir', 'Auður djúpúðga', 'Bókmenntir og tunga', 3, ''),
  ('Hver skrifaði Heimskringlu?', 'Snorri Sturluson', 'Ari fróði', 'Sturla Þórðarson', 'Sæmundur fróði', 'Bókmenntir og tunga', 2, ''),
  ('Hvaða skáld var kallað Klettafjallaskáldið?', 'Stephan G. Stephansson', 'Einar Benediktsson', 'Káinn', 'Grímur Thomsen', 'Bókmenntir og tunga', 3, ''),
  ('Hver orti ljóðið sem hefst á orðunum „Ísland, farsælda frón“?', 'Jónas Hallgrímsson', 'Bjarni Thorarensen', 'Matthías Jochumsson', 'Hannes Hafstein', 'Bókmenntir og tunga', 2, ''),
  ('Hvaða skáldsaga Laxness fjallar um Jón Hreggviðsson?', 'Íslandsklukkan', 'Gerpla', 'Brekkukotsannáll', 'Atómstöðin', 'Bókmenntir og tunga', 2, ''),
  ('Hvað heitir fyrsta ljóðabók Davíðs Stefánssonar frá Fagraskógi?', 'Svartar fjaðrir', 'Kvæði', 'Að norðan', 'Ný kvæði', 'Bókmenntir og tunga', 3, ''),
  ('Hvaða persónu lék Magnús Scheving í Latabæ?', 'Íþróttaálfinn', 'Glanna glæp', 'Nenna níska', 'Sigga sæta', 'Kvikmyndir og sjónvarp', 1, ''),
  ('Hver lék Glanna glæp í Latabæ?', 'Stefán Karl Stefánsson', 'Magnús Scheving', 'Jón Gnarr', 'Laddi', 'Kvikmyndir og sjónvarp', 2, ''),
  ('Hvaða persónu lék Jón Gnarr í Vaktaþáttunum?', 'Georg Bjarnfreðarson', 'Ólaf Ragnar', 'Daníel', 'Ragnar Reykás', 'Kvikmyndir og sjónvarp', 2, ''),
  ('Hvaða íslenska kvikmynd var tilnefnd til Óskarsverðlauna árið 1992?', 'Börn náttúrunnar', 'Englar alheimsins', 'Djöflaeyjan', 'Hrafninn flýgur', 'Kvikmyndir og sjónvarp', 2, ''),
  ('Hvaða íslenska kvikmynd vann Un Certain Regard-verðlaunin í Cannes 2015?', 'Hrútar', 'Fúsi', 'Hjartasteinn', 'Kona fer í stríð', 'Kvikmyndir og sjónvarp', 3, ''),
  ('Hvaða leikstjóri gerði spennuþættina Ófærð?', 'Baltasar Kormákur', 'Friðrik Þór Friðriksson', 'Benedikt Erlingsson', 'Dagur Kári', 'Kvikmyndir og sjónvarp', 2, ''),
  ('Í hvaða bæ gerist Eurovision-mynd Wills Ferrell, „The Story of Fire Saga“?', 'Húsavík', 'Siglufirði', 'Akureyri', 'Seyðisfirði', 'Kvikmyndir og sjónvarp', 2, 'Lagið „Husavik“ úr myndinni var tilnefnt til Óskarsverðlauna.'),
  ('Hvaða kvikmynd Christophers Nolan var að hluta tekin upp á Svínafellsjökli?', 'Interstellar', 'Inception', 'Tenet', 'Dunkirk', 'Kvikmyndir og sjónvarp', 2, ''),
  ('Í hvaða þáttaröð var Ísland notað sem landið handan Veggjarins?', 'Game of Thrones', 'Vikings', 'The Witcher', 'The Last Kingdom', 'Kvikmyndir og sjónvarp', 1, ''),
  ('Hvaða þáttur á RÚV gerir grín að árinu á gamlárskvöld?', 'Áramótaskaupið', 'Spaugstofan', 'Kryddsíldin', 'Gettu betur', 'Kvikmyndir og sjónvarp', 1, ''),
  ('Hvaða leikkona lék aðalhlutverkið í íslensku kvikmyndinni Dýrinu (Lamb)?', 'Noomi Rapace', 'Alicia Vikander', 'Anita Briem', 'Hera Hilmarsdóttir', 'Kvikmyndir og sjónvarp', 3, ''),
  ('Í hvaða kvikmynd Ridleys Scott sést Dettifoss í upphafsatriðinu?', 'Prometheus', 'Alien', 'Gladiator', 'Blade Runner', 'Kvikmyndir og sjónvarp', 3, ''),
  ('Hversu margir eru íslensku jólasveinarnir?', '13', '9', '12', '24', 'Siðir og matur', 1, ''),
  ('Hvaða jólasveinn kemur fyrstur til byggða?', 'Stekkjarstaur', 'Giljagaur', 'Kertasníkir', 'Askasleikir', 'Siðir og matur', 2, 'Hann kemur 12. desember.'),
  ('Hvaða jólasveinn kemur síðastur, á aðfangadag?', 'Kertasníkir', 'Ketkrókur', 'Gáttaþefur', 'Hurðaskellir', 'Siðir og matur', 2, ''),
  ('Hvað heitir kötturinn sem étur þá sem fá engin ný föt fyrir jólin?', 'Jólakötturinn', 'Grýlukötturinn', 'Skuggi', 'Leppalúði', 'Siðir og matur', 1, ''),
  ('Hvað heita foreldrar jólasveinanna?', 'Grýla og Leppalúði', 'Gilitrutt og Leppalúði', 'Grýla og Bárður', 'Búkolla og Leppalúði', 'Siðir og matur', 1, ''),
  ('Hvað er borðað á sprengidaginn?', 'Saltkjöt og baunir', 'Bollur', 'Svið', 'Hangikjöt', 'Siðir og matur', 2, ''),
  ('Hvaða dagur kemur strax á eftir sprengidegi?', 'Öskudagur', 'Bolludagur', 'Konudagur', 'Skírdagur', 'Siðir og matur', 2, ''),
  ('Hvaða krydd gefur brennivíni sitt sérstaka bragð?', 'Kúmen', 'Anís', 'Einiber', 'Kanill', 'Siðir og matur', 2, ''),
  ('Hvað af þessu er EKKI á pylsu „með öllu“?', 'Súrkál', 'Remúlaði', 'Steiktur laukur', 'Sinnep', 'Siðir og matur', 2, ''),
  ('Hvaða fyrrverandi Bandaríkjaforseti fékk sér pylsu á Bæjarins beztu árið 2004?', 'Bill Clinton', 'Barack Obama', 'George W. Bush', 'Jimmy Carter', 'Siðir og matur', 2, ''),
  ('Á hvaða degi hefst Þorri?', 'Bóndadegi', 'Konudegi', 'Þrettándanum', 'Öskudegi', 'Siðir og matur', 2, 'Góa hefst hins vegar á konudegi.'),
  ('Hvernig er hákarl verkaður áður en hann er borðaður?', 'Hann er kæstur og hengdur upp', 'Hann er reyktur', 'Hann er saltaður í tunnum', 'Hann er soðinn í mysu', 'Siðir og matur', 2, ''),
  ('Hvað kallast sviðinn kindahaus á íslensku?', 'Svið', 'Slátur', 'Hrútspungar', 'Lundabaggi', 'Siðir og matur', 1, ''),
  ('Hvaða brauð er skorið út í mynstur og steikt fyrir jólin, einkum á Norðurlandi?', 'Laufabrauð', 'Flatkökur', 'Rúgbrauð', 'Kleinur', 'Siðir og matur', 2, ''),
  ('Hvaða drykkjarblanda tilheyrir íslenskum jólum?', 'Malt og appelsín', 'Kók og appelsín', 'Pilsner og malt', 'Engiferöl og kók', 'Siðir og matur', 1, ''),
  ('Hvað kallast rúgbrauð sem bakað er í heitri jörð?', 'Hverabrauð', 'Eldbrauð', 'Hraunbrauð', 'Jarðbrauð', 'Siðir og matur', 2, ''),
  ('Hvenær er sumardagurinn fyrsti?', 'Fyrsta fimmtudag eftir 18. apríl', '21. júní', '1. maí', 'Fyrsta mánudag í maí', 'Siðir og matur', 2, ''),
  ('Hvaða dag er þrettándinn?', '6. janúar', '1. janúar', '13. janúar', '31. desember', 'Siðir og matur', 1, 'Hann er þrettándi dagur jóla.'),
  ('Hve margir þingmenn sitja á Alþingi?', '63', '50', '60', '72', 'Almennt', 1, ''),
  ('Hvaða litir eru í íslenska fánanum?', 'Blár, hvítur og rauður', 'Blár og hvítur', 'Rauður, hvítur og grænn', 'Blár, gulur og hvítur', 'Almennt', 1, ''),
  ('Hve langt er kjörtímabil forseta Íslands?', 'Fjögur ár', 'Þrjú ár', 'Fimm ár', 'Sex ár', 'Almennt', 2, ''),
  ('Hvað er Ísland stórt, um það bil?', '103.000 km²', '63.000 km²', '153.000 km²', '203.000 km²', 'Almennt', 2, ''),
  ('Hvaða tónlistar- og ráðstefnuhús í Reykjavík var opnað árið 2011?', 'Harpa', 'Hof', 'Salurinn', 'Háskólabíó', 'Almennt', 2, '');
  end if;
end $$;
