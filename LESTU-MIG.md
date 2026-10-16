# Hljómey tónlistarleikir – uppsetning skref fyrir skref

Leikirnir, Pöbbkviss, Tónlistarbingó, Gítarpartý, Karaoke og Hvaða ár?, eru settir upp saman. Þeir samanstanda af tveimur hlutum:

- **Supabase** (ókeypis): gagnagrunnur og rauntími sem tengir síma og stóra skjáinn.
- **Vefsíðan** (24 skrár í möppunni `web`): fer í möppuna `/pubquiz` á Bluehost.

---

## Uppfærsla: Óskalög í Gítarpartýi (október 2026)

Gestir í Gítarpartýi geta óskað eftir lögum úr söngbókinni og sent inn lög sem vantar, til dæmis afrituð af gítarsíðu. Innsend lög fara strax í söngbókina, merkt **Frá gesti**, og á óskalistann. Þú lagar þau svo þegar þér hentar.

1. **Supabase**: SQL Editor → **New query** → límdu inn allt innihald `gitar.sql` → **Run**. Keyrðu svo **`gestapin.sql`** aftur á eftir (þú átt eintakið með gestapininu frá því síðast).
2. **Bluehost**: hladdu upp `gitar.html`.

---

## Uppfærsla: Gestapin (október 2026)

Gestapin er annað PIN sem þú getur lánað öðrum. Með því má búa til og stýra Pöbbkvissi (líka með spurningum), Tónlistarbingói og Hvaða ár?. Karaoke og Gítarpartý þurfa ekkert PIN til að byrja. Gestapin má **ekki** breyta spurningabankanum, lagabankanum í Hvaða ár?, söngbókinni, YouTube-lyklinum, Spotify-stillingunum eða endurnefna og eyða þemum. Þá birtast skilaboð um að aðal-PIN þurfi.

1. **Supabase**: SQL Editor → **New query** → límdu inn allt innihald `gestapin.sql` → **Run**. Neðst stendur „Gestapin: 14 föll uppfærð.“
   - Í `gestapin.sql` í þessu repo er lína gestapinsins óvirk (byrjar á `--`), svo það komi aldrei fram opinberlega. Settu þitt eigið inn þar, eða keyrðu línuna hér fyrir neðan.
2. **Bluehost**: hladdu upp `common.js`, `stjorn.html`, `bingo-stjorn.html`, `bingo.html`, `gitar.html`, `hvadaar.html`, `index.html`, `karaoke.html` og `spurningar.html`.

**Mikilvægt:** keyrðu `gestapin.sql` alltaf **síðast**. Ef einhver hinna SQL-skránna er keyrð aftur þarf að keyra `gestapin.sql` aftur á eftir, annars hættir gestapinið að virka þar.

Breyta eða slökkva á gestapininu:

```sql
update app_settings set value = 'NÝTT-GESTAPIN' where key = 'guest_pin';   -- breyta
delete from app_settings where key = 'guest_pin';                         -- slökkva
```

---

## Uppfærsla: Hvaða ár? (október 2026)

Tímalínuleikur í anda Hitster. Lag er spilað og hver leikmaður setur það á réttan stað á sinni eigin tímalínu í símanum. Allir spila samtímis. Rétt sett lag fer á tímalínuna, og sá sem fyrst nær settum fjölda spila vinnur. Bónus: að þekkja flytjandann (val úr fjórum) og giska á nákvæmt ár gefur tákn, og þrjú tákn má skipta fyrir aukaspil.

1. **Supabase**: SQL Editor → **New query** → límdu inn allt innihald `hvadaar.sql` → **Run**.
2. **Bluehost**: hladdu upp í `public_html/pubquiz` og skrifaðu yfir:
   - Nýjar: `hvadaar.html`, `hvadaar.js`, `hvadaar-host.js`, `hvadaar-listi.js`
   - Breyttar: `common.js`, `player.js`, `index.html`, `stjorn.html`, `bingo-stjorn.html`, `gitar.html`, `karaoke.html`, `host.css`
   - **Ekki** hlaða upp `config.js`.
3. **Spotify-forrit** (gert einu sinni, þarf **Spotify Premium**). Án Spotify spilar leikurinn 30 sek. búta frá Deezer.
   1. Farðu á **developer.spotify.com/dashboard**, skráðu þig inn með Spotify-reikningnum og smelltu á **Create app**.
   2. Nafn og lýsing: t.d. „Hljómey Hvaða ár“. Undir **Redirect URIs** bætirðu við báðum: `https://hljomey.is/pubquiz/hvadaar.html` og `https://www.hljomey.is/pubquiz/hvadaar.html`.
   3. Undir **Which API/SDKs are you planning to use?** hakarðu við **Web API** og **Web Playback SDK**, samþykkir skilmálana og smellir á **Save**.
   4. Opnaðu forritið → **Settings** → afritaðu **Client ID**. (Client secret er ekki notað.)
   5. Opnaðu **hljomey.is/pubquiz/hvadaar.html**. Skrifaðu PIN-ið í **3. Stillingar** ef það er ekki þegar þar. Farðu svo í **1. Hljóð** → límdu Client ID inn → **Vista** → **Tengja Spotify** og samþykktu.
   6. Smelltu á **Prófa Spotify**. Það spilar eitt lag í 8 sek. og finnur hvaða leið virkar á tækinu þínu. Ef ✗ birtist sýnir ferillinn hvar það stoppar.
   7. Ef aðrir eiga að geta tengst með sínum Spotify-reikningi: forritið → **User Management** → bættu netfanginu þeirra við (mest 5 í þróunarham).
4. **Lagabankinn** (gert einu sinni, tekur nokkrar mínútur): smelltu á **Opna lagabankann** → **Sækja byrjunarlista**. Þá er um 215 lögum (um 80 íslenskum) flett upp á Spotify, MusicBrainz og Deezer til að finna útgáfuárið.
   - **Grænt** = staðfest ár. **Appelsínugult** = heimildum ber ekki saman, athugaðu. **Rautt** = ár vantar.
   - Smelltu á tillögu (t.d. „MusicBrainz 1984“) til að velja það ár, eða skrifaðu árið sjálfur og ýttu á ✓. ▶ spilar lagið.
   - **Staðfesta samhljóða** staðfestir í einu öll lög þar sem heimildirnar eru sammála.
   - Íslensku lögin þurfa mesta yfirferð. Spotify gefur oft ár endurútgáfu eða safnplötu frekar en upprunalega árið.
   - **Úr Spotify-lagalista** bætir lögum úr þínum eigin lagalistum við (veldu íslenskt eða erlent). **+ Bæta við lagi** bætir við einu lagi.

**Svona er leikurinn spilaður:**

1. Opnaðu **hljomey.is/pubquiz/hvadaar.html** í tölvunni sem er tengd við sjónvarpið.
2. Opnaðu Spotify á tækinu sem á að spila (tölvunni, hátalara eða síma) og veldu það í **Tæki**. Ef það sést ekki: spilaðu eitthvað stutt í Spotify og ýttu á ↻.
3. **2. Lögin**: veldu blönduna (Bara íslensk → Bara erlend). Láttu **Aðeins lög með staðfestu ári** vera hakað.
4. **3. Stillingar**: hve mörg spil vinna (5–15), tími til að svara og erfiðleiki (**Létt (±3 ár)** fyrirgefur skekkju). Smelltu á **Búa til leik**.
5. Gestir skanna QR-kóðann eða slá kóðann inn á **hljomey.is/pubquiz**. Hver fær eitt byrjunarspil með ártali.
6. Bilstöngin keyrir leikinn: byrja → afhjúpa árið → staða → næsta lag. Afhjúpað er sjálfkrafa þegar allir hafa svarað eða tíminn er búinn.
7. Ef tölvan endurræsist: opnaðu hvadaar.html aftur og veldu **Halda áfram**.

---

## Uppfærsla: Karaoke (október 2026, til heimanota)

Karaoke með YouTube: sjónvarpið spilar karaoke-myndbönd og gestir velja lög í símanum. Gestir leita á YouTube, hlusta á útgáfurnar í símanum, velja eina og fara í biðröðina. Öll lög sem eru valin fara á **lagalistann**, svo það má velja þau aftur seinna án þess að leita.

1. **Supabase**: SQL Editor → **New query** → límdu inn allt innihald `karaoke.sql` → **Run**.
2. **Bluehost**: hladdu upp í `public_html/pubquiz` og skrifaðu yfir:
   - Nýjar: `karaoke.html`, `karaoke.js`
   - Breyttar: `common.js`, `player.js`, `index.html`, `stjorn.html`, `bingo-stjorn.html`, `gitar.html`
3. **YouTube-lykill** (ókeypis, gert einu sinni). Leitin þarf lykil frá Google:
   1. Farðu á **console.cloud.google.com** og skráðu þig inn með Google-reikningi.
   2. Búðu til verkefni, t.d. „Hljomey karaoke“.
   3. **APIs & Services → Library** → leitaðu að **YouTube Data API v3** → **Enable**.
   4. **APIs & Services → Credentials → Create credentials → API key**.
   5. Smelltu á lykilinn og takmarkaðu hann: undir **Application restrictions** veldu **Websites** og bættu við `https://hljomey.is/*` og `https://www.hljomey.is/*`. Undir **API restrictions** veldu **Restrict key** → **YouTube Data API v3**. **Save**.
   6. Opnaðu **hljomey.is/pubquiz/karaoke.html** → **Stillingar** → límdu lykilinn inn ásamt PIN-inu → **Vista og prófa**.

**Svona er þetta notað:** Opnaðu **hljomey.is/pubquiz/karaoke.html** á sjónvarpinu (eða tölvu sem er tengd við það) og smelltu á **Byrja karaoke-kvöld**. Gestir skanna QR-kóðann. Á milli laga birtist „Næst á svið“ í nokkrar sekúndur og svo byrjar næsta lag sjálfkrafa. Bilstöngin setur á pásu. Þú getur raðað biðröðinni, sett lag strax á svið eða tekið lag af lista.

YouTube leyfir um 100 leitir á dag með ókeypis lyklinum. Leitir eru geymdar í símanum í sólarhring, lagalistinn kostar engar leitir og það má alltaf líma inn YouTube-slóð í leitarreitinn.

---

## Uppfærsla: spurningar í Pöbbkvissið (október 2026)

Pöbbkvissið getur nú líka spurt spurninga úr íslenskum spurningabanka, eða blandað lögum og spurningum. Efst á stjórnandasíðunni velurðu **Tónlist**, **Spurningar** eða **Blandað**. Spurningin birtist á stóra skjánum og í símunum, og eftir hverja spurningu sést rétta svarið og fróðleikur ef hann er skráður. Bankinn byrjar með 208 spurningum í 13 flokkum. Á **hljomey.is/pubquiz/spurningar.html** geturðu breytt þeim, bætt við nýjum, slökkt á spurningum og flutt inn úr Excel eða Google Sheets.

1. **Supabase**: SQL Editor → **New query** → límdu inn allt innihald `spurningar.sql` → **Run**. Notar sama PIN og leikirnir. Byrjunarspurningarnar fara aðeins inn ef bankinn er tómur.
2. **Bluehost**: hladdu upp í `public_html/pubquiz` og skrifaðu yfir:
   - Nýjar: `spurningar.html`, `spurningar.js`
   - Breyttar: `stjorn.html`, `host.js`, `host.css`, `index.html`, `player.js`, `common.js`
3. Ctrl+F5 á stjórnandasíðunni.

Svörin í bankanum eru læst á bak við PIN-ið, svo gestir geta ekki flett þeim upp í gagnagrunninum á meðan leikurinn stendur yfir.

---

## Uppfærsla: vistuð þemu í Pöbbkvissi og bingói (október 2026)

Við hliðina á **Sækja lög** er hnappurinn **☆ Vista lagalista** (eða **Vista leit** / **Vista flytjendur**). Límdu slóðina og smelltu á hann. Það þarf ekki að sækja lögin eða spila leikinn fyrst. Í fyrsta skipti biður hann um PIN stjórnanda og man það svo. Vistaðir lagalistar birtast efst í **1. Þema** og eru valdir aftur með einum smelli, bæði í kvissinu og bingóinu. Hnappurinn sýnir **★ Vistað** þegar slóðin er þegar geymd.

1. **Supabase** (aðeins einu sinni): SQL Editor → **New query** → límdu inn allt innihald `themes.sql` → **Run**.
2. **Bluehost**: hladdu upp í `public_html/pubquiz` og skrifaðu yfir: `themes.js`, `deezer.js`, `host.js`, `bingo-host.js`, `stjorn.html`, `bingo-stjorn.html`.
3. Ctrl+F5 á stjórnendasíðunni.

---

## Uppfærsla: Gítarpartý bætt við (október 2026)

Ef Pöbbkvissið og bingóið eru þegar uppsett á hljomey.is þarftu aðeins þetta (um 10 mínútur):

1. **Supabase**: SQL Editor → **New query** → límdu inn allt innihald `gitar.sql` → **Run**. Notar sama PIN og hinir leikirnir.
2. **Bluehost**: cPanel → **File Manager** → `public_html/pubquiz` → **Upload** og hladdu upp þessum 6 skrám úr `web`. Veldu að skrifa yfir þær sem eru til fyrir:
   - Nýjar: `gitar.html`, `gitar-core.js`
   - Breyttar: `index.html`, `player.js`, `stjorn.html`, `bingo-stjorn.html`
3. **Ekki** hlaða upp `config.js`. Útgáfan á vefnum er með þínum Supabase-lyklum og á að vera óbreytt.
4. Opnaðu **hljomey.is/pubquiz/gitar.html**, ýttu á **Byrja partý** og skannaðu QR-kóðann með símanum. Sjáirðu gömlu síðuna, endurhlaðaðu með Ctrl+F5.

Áætlaður tími: 30–45 mínútur.

---

## Skref 1 – Stofna Supabase-verkefni

1. Farðu á **supabase.com** og smelltu á **Start your project**. Auðveldast er að skrá sig inn með GitHub-aðganginum (gummiarnason).
2. Smelltu á **New project**.
   - Name: `hljomey-pubquiz`
   - Database password: búðu til lykilorð og geymdu það á öruggum stað.
   - Region: **West EU (Ireland)** eða **London** (næst Íslandi).
   - Plan: **Free**.
3. Bíddu í 1–2 mínútur á meðan verkefnið er sett upp.

## Skref 2 – Búa til gagnagrunninn

1. Opnaðu `setup.sql` í textaritli (t.d. Notepad eða TextEdit).
2. Farðu **neðst** í skrána og breyttu `BREYTTU-MER` í þitt eigið PIN, t.d. `Eyjar2027`. PIN-ið þarf til að búa til nýjan leik.
3. Í Supabase: vinstra megin **SQL Editor** → **New query**.
4. Afritaðu allt innihald `setup.sql`, límdu það inn og smelltu á **Run**.
5. Þú átt að sjá **Success. No rows returned**.
6. Smelltu aftur á **New query**, límdu inn allt innihald `bingo.sql` og smelltu á **Run**. Þetta bætir bingóinu við og notar sama PIN.
7. Gerðu það sama við `gitar.sql` (Gítarpartý), `themes.sql` (vistuð þemu), `spurningar.sql` (spurningabanki), `karaoke.sql` (karaoke) og `hvadaar.sql` (Hvaða ár?). Öll nota sama PIN. Síðast kemur `gestapin.sql` ef þú vilt gestapin (sjá ofar).

Ef þú hefur þegar keyrt `setup.sql` áður þarftu aðeins að keyra `bingo.sql` og `gitar.sql`. Ef þú keyrir `setup.sql` einhvern tíma aftur skaltu keyra `bingo.sql`, `gitar.sql`, `themes.sql`, `spurningar.sql`, `karaoke.sql`, `hvadaar.sql` og `gestapin.sql` aftur strax á eftir, því `setup.sql` tekur af réttindi hinna leikjanna. **Athugaðu** að `setup.sql` setur líka aðal-PIN-ið aftur á gildið sem stendur neðst í skránni.

Viltu breyta PIN-inu síðar? Keyrðu þessa línu í SQL Editor:

```sql
update app_settings set value = 'NÝTT-PIN' where key = 'host_pin';
```

## Skref 3 – Tengja vefsíðuna við Supabase

1. **Project URL**: Lestu hana úr veffangastikunni í vafranum þegar þú ert inni í verkefninu, t.d. `supabase.com/dashboard/project/abcdefghijklmnop/...`. Stafarunan á eftir `project/` gefur slóðina `https://abcdefghijklmnop.supabase.co`. Hún sést líka undir **Connect** efst á forsíðu verkefnisins.
2. **Lykill**: **Project Settings** → **API Keys** → afritaðu **Publishable key** (byrjar á `sb_publishable_`) með afritunartákninu. Notaðu **aldrei** Secret key.
3. Afþjappaðu zip-skrána (hægrismella → **Extract All**). Opnaðu svo `web/config.js` með því að hægrismella og velja **Open with → Notepad**. Ekki tvísmella, því þá reynir Windows að keyra skrána.
4. Settu gildin inn og vistaðu (Ctrl+S):

```js
SUPABASE_URL: 'https://abcdefghijklmnop.supabase.co',
SUPABASE_ANON_KEY: 'sb_publishable_...',
```

Þessi lykill má vera opinber. Hann gefur aðeins þann aðgang sem gagnagrunnurinn leyfir, og svindl er útilokað þar.

## Skref 4 – Setja á hljomey.is (Bluehost)

1. Skráðu þig inn á Bluehost → **Hosting** → **cPanel** (heitir **Advanced** í eldra viðmóti) → **File Manager**.
2. Opnaðu möppuna **public_html** (þar er WordPress).
3. Smelltu á **+ Folder** og búðu til möppuna **`pubquiz`**.
4. Opnaðu `pubquiz` og smelltu á **Upload**. Hladdu upp öllum 24 skránum úr `web`:
   `index.html`, `stjorn.html`, `bingo.html`, `bingo-stjorn.html`, `gitar.html`, `spurningar.html`, `karaoke.html`, `style.css`, `host.css`, `config.js`, `common.js`, `deezer.js`, `themes.js`, `host.js`, `player.js`, `bingo-host.js`, `bingo-player.js`, `gitar-core.js`, `spurningar.js`, `karaoke.js`, `hvadaar.html`, `hvadaar.js`, `hvadaar-host.js`, `hvadaar-listi.js`
5. Þetta hefur engin áhrif á WordPress eða Elementor. Mappan hefur einfaldlega forgang á slóðinni /pubquiz.

Slóðirnar verða:

| Hver | Slóð |
| --- | --- |
| Þátttakendur (sláðu inn kóða, virkar fyrir alla leiki) | **hljomey.is/pubquiz** |
| Stjórnandi Pöbbkviss | **hljomey.is/pubquiz/stjorn.html** |
| Stjórnandi Tónlistarbingós | **hljomey.is/pubquiz/bingo-stjorn.html** |
| Spilari í Gítarpartýi | **hljomey.is/pubquiz/gitar.html** |
| Spurningabankinn | **hljomey.is/pubquiz/spurningar.html** |
| Karaoke (sjónvarpið) | **hljomey.is/pubquiz/karaoke.html** |
| Stjórnandi Hvaða ár? | **hljomey.is/pubquiz/hvadaar.html** |

Efst á stjórnandasíðunni er hnappur til að skipta á milli leikjanna. QR-kóðinn vísar beint á réttan leik.

## Skref 5 – Prófa

1. Opnaðu **hljomey.is/pubquiz/stjorn.html** í tölvu (Chrome virkar best).
2. Veldu **Leit á Deezer**, skrifaðu t.d. `íslenskt` og smelltu á **Sækja lög**.
3. Veldu fjölda laga, hlustaðu með ▶, skiptu út lögum með **Skipta**, sláðu inn PIN og smelltu á **Búa til leik**.
4. Skannaðu QR-kóðann með símanum og skráðu þig.
5. Ýttu á **Byrja leik** (eða bilstöngina).

**Vistuð þemu**: Deezer-lagalisti sem þú sækir vistast sjálfkrafa og birtist efst í **1. Þema**, með mynd, heiti og fjölda laga, nýjast fyrst. Smelltu á hann næst og lögin eru sótt strax. Leitir og flytjendalistar vistast ekki sjálfkrafa, en þá birtist **☆ Vista þemað** og það þarf einn smell. ✎ endurnefnir og × eyðir. Þemun eru geymd í Supabase, svo þau sjást á hvaða tölvu sem er og eru þau sömu í kvissinu og bingóinu.

Ábendingar um þema:

- **Deezer-lagalisti** gefur besta stjórn. Búðu til lista á deezer.com (ókeypis aðgangur dugar), hafðu hann **opinberan (public)** og límdu slóðina inn.
- **Flytjendur**: t.d. `Stuðmenn, Mugison, GDRN` gefur vinsælustu lög hvers og eins.
- Lög án forskoðunar á Deezer eru síuð sjálfkrafa frá.

## Á leikkvöldinu

- [ ] **Opnaðu Supabase deginum áður.** Ókeypis verkefni fara í dvala eftir 7 daga án notkunar. Ef það gerist: skráðu þig inn og smelltu á **Restore project**.
- [ ] Tölvan tengd við skjávarpa og hátalara. Smelltu á **Fullur skjár**.
- [ ] Lögin og spurningarnar eru falin á uppsetningarsíðunni svo enginn sjái svörin á skjánum. **Búa til leik** er alltaf neðst á skjánum, svo það þarf ekki að skruna framhjá listanum. **Sýna listann** opnar hann ef þú vilt fara yfir hann.
- [ ] Gestir þurfa netsamband í símanum (Wi-Fi eða 4G/5G).
- [ ] Prófaðu hljóðið með ▶ áður en gestir mæta.
- [ ] Bilstöngin keyrir leikinn áfram: byrja → sýna svar → stigatafla → næsta lag → úrslit.
- [ ] Ef tölvan endurræsist: opnaðu stjorn.html aftur og veldu **Halda áfram**.
- [ ] Ef sími missir samband: gesturinn opnar síðuna aftur og heldur sínum stigum.

## Tónlistarbingó

1. Opnaðu **hljomey.is/pubquiz/bingo-stjorn.html** og veldu þema á sama hátt og í kvissinu.
2. Veldu stillingar. Sjálfgefið er 60 lög í potti, 15 sek bútar og sjálfvirkt næsta lag eftir 5 sek hlé. Þá tekur umferð um 20–35 mínútur.
3. **Spjaldið sýnir**:
   - *Lag + flytjanda*: auðveldast.
   - *Aðeins heiti lags*: aðeins erfiðara.
   - *Aðeins flytjanda (erfitt)*: til að merkja þarf að velja rétt lagaheiti úr 4 möguleikum. Rangt val læsir reitnum fram að næsta lagi.
4. **Spilað um**: 1 lína → 2 línur → fullt spjald, allt á sama spjaldinu. Taktu hak af því sem þú vilt sleppa.
5. **Sýna lagið á stóra skjánum** er slökkt sjálfgefið, svo lögin haldist leyndarmál. Þú sérð alltaf listann sjálfur undir **Spiluð lög**.

Í leiknum:

- Hver gestur fær sitt eigið 5×5 spjald með 24 lögum og fríreit í miðjunni.
- Gestir merkja sjálfir og ýta á **BINGÓ!** í símanum.
- **Kerfið staðfestir sjálfkrafa** að öll merktu lögin hafi í raun verið spiluð. Stóri skjárinn sýnir þá spjald vinningshafans með vinningslínunni.
- Falskt BINGÓ fær skilaboð í símann og viðkomandi getur ekki kallað aftur fyrr en næsta lag hefur verið spilað.
- Ef fleiri kalla BINGÓ áður en þú heldur áfram vinna allir.
- **Hlé** stöðvar sjálfvirku spilunina, t.d. á meðan vinningar eru afhentir.
- Deezer-forskoðanir eru 30 sekúndur, svo bútur getur mest verið 30 sek.

## Gítarpartý

Spilarinn fær lögin með hljómum, og allir sem skanna QR-kóðann fylgjast með textanum í símanum. Engin tónlist er spiluð af netinu, svo Deezer kemur ekki við sögu.

**Söngbókin**

1. Opnaðu **hljomey.is/pubquiz/gitar.html** og smelltu á **Breyta söngbók**. Sláðu inn PIN-ið.
2. Smelltu á **Nýtt lag**, settu inn heiti og flytjanda og límdu textann með hljómum.
3. Hljómur fer í hornklofa beint á undan atkvæðinu: `[Am]Sofðu unga [E7]ástin mín`. Auð lína skilur á milli erinda, og lína eins og `Viðlag:` verður fyrirsögn.
4. Lag af gítarsíðu með **hljómum fyrir ofan textann** má líma beint inn, því er breytt sjálfkrafa. Skoðaðu **Forskoðun** og vistaðu.
5. Örvarnar raða söngbókinni. **A–Ö** efst raðar allri bókinni í einu: í stafrófsröð, eða íslensk lög fyrst og svo erlend.
   - Hvert lag er merkt **ÍSL** eða **ERL**. Kerfið greinir það sjálft út frá textanum (ð, þ, æ og kommustöfum). Ef það misgreinir lag velurðu flokkinn undir **Flokkur** í lagaritlinum. Handvalinn flokkur sést í gulu.
6. **Lag af gitargrip.is (guitarparty.com)**: opnaðu lagið, veldu allt (Ctrl+A) og afritaðu (Ctrl+C). Smelltu á **Nýtt lag** og límdu inn í textareitinn. Hljómarnir lenda á nákvæmlega sama atkvæði og á síðunni, og heiti og höfundar fyllast út sjálfkrafa.
7. **Lag af Ultimate Guitar eða annarri gítarsíðu**: opnaðu lagið þar, veldu textann með hljómunum og afritaðu (Ctrl+C). Smelltu á **Nýtt lag** og límdu inn. Hljómunum er breytt sjálfkrafa, gítartabs fjarlægð, og Capo og Key sett í réttu reitina. [Verse]/[Chorus] verða Erindi/Viðlag. Skrifaðu svo heiti lagsins og vistaðu.
8. **Heil söngbók í einu**: smelltu á **Flytja inn** og veldu PDF-söngbók (t.d. af guitarparty.com). Lögin eru lesin í vafranum, líka síður í tveimur dálkum, hljómarnir settir á rétt atkvæði og viðlög merkt. Taktu hak af lögum sem þú vilt sleppa og smelltu á **Flytja inn**. Lög sem eru þegar í söngbókinni eru ekki valin. Hakirðu við þau er gömlu útgáfunni **skipt út**, svo þú getur flutt sömu bók inn aftur án þess að fá tvöföld lög.

**Í partýinu**

1. Á **gitar.html**: hakaðu við lögin fyrir kvöldið og ýttu á **Byrja partý**. **Öll / Íslensk / Erlend** sía listann og **Röð / A–Ö** raðar honum með upphafsstöfum. „Velja“ á við lögin sem sjást, og partýið og prentaða söngbókin fylgja röðinni sem þú velur. QR-kóði og fjögurra stafa kóði birtast.
2. Gestir skanna QR-kóðann, eða slá kóðann inn á **hljomey.is/pubquiz** (ekkert nafn þarf).
3. Þegar þú flettir á næsta lag fylgja allir símar með. Gestir sjá aðeins textann nema þeir kveiki á **Hljómar**.
4. **− / +** færa lagið um hálftón (líka hljómana í símum gesta).
5. **Velja lag utan raðar**: ýttu á heiti lagsins efst (eða ☰). Leitaðu, síaðu eftir **Íslensk / Erlend**, eða raðaðu eftir stafrófi með **A–Ö**. ✓ merkir lög sem búið er að spila. Undir **Öll lög** geturðu valið lag úr söngbókinni sem var ekki á listanum.
6. **Sjálfvirkt skrun**: hringlaga takkinn niðri til hægri. Hver smellur hækkar hraðann 1 → 2 → 3 → af. Skrunið stoppar á meðan þú snertir skjáinn, á enda lagsins og þegar skipt er um lag. Gestir hafa sama takka í sínum síma. Við tölvu: **S** skiptir um hraða og **L** opnar lagalistann.
7. QR-takkinn efst sýnir kóðann aftur í fullri stærð. Gestir hafa sama takka í sínum síma, svo hver sem er getur boðið fleirum inn í partýið. Örvalyklar og fótstig (síðuflettarar) fletta á milli laga.
8. Ef síminn eða tölvan endurræsist: opnaðu gitar.html aftur og veldu **Halda áfram**.
9. **Prenta valin lög** býr til söngbók með einu lagi á síðu. Í prentglugganum má velja **Vista sem PDF**.

**Óskalög**

1. **Gestir óska**: í símanum opna þeir lagalistann (☰). Undir **Í kvöld** eru lög kvöldsins og undir **Öll lög** öll söngbókin. Hjartað við lag sendir ósk, og gestur getur sett nafnið sitt með. Ef fleiri óska eftir sama lagi safnast hjörtun saman.
2. **Gestir senda inn lag**: neðst í lagalistanum er **Senda inn lag sem vantar**. Þar líma þeir lagið með hljómum af gítarsíðu (gitargrip.is, Ultimate Guitar o.fl.). Hljómunum er raðað sjálfkrafa og heiti og flytjandi fyllast út ef þau fylgja. Lagið fer í söngbókina, merkt **Frá gesti**, og beint á óskalistann. Sé lagið þegar til er bara óskað eftir því.
3. **Spilarinn**: hjartað efst sýnir fjölda óska og tilkynning birtist þegar ný ósk kemur. Smelltu á hjartað til að sjá óskirnar, flest hjörtu efst. Smelltu á lag til að spila það (það bætist við lög kvöldsins og símarnir fylgja), eða á ✕ til að fjarlægja óskina.
4. **Kerfisstjórinn**: í **Breyta söngbók** birtist **Frá gestum** efst með innsendum lögum. **Yfirfara** opnar lagið: lagaðu heiti, flytjanda og texta og vistaðu, þá er það merkt yfirfarið. Lög sem komu inn án heitis heita „Án heitis“ og heitisreiturinn er tómur svo þú verður að fylla hann út. ✓ samþykkir lag óbreytt.

Takmarkanir: aðeins er hægt að óska og senda inn á meðan partý er í gangi, mest 20 innsend lög í hverju partýi á hálfum sólarhring og 100 opnar óskir í einu.

## Stigagjöf í Pöbbkvissi

- Rétt svar: 500–1.000 stig eftir hraða (mælt á þjóninum, ekki í símanum).
- Fyrst/ur með rétt svar: +200 bónus.
- Rangt svar eða ekkert svar: 0 stig.

## Setja í GitHub

Búðu til nýtt repo, `hljomey-pubquiz`, á github.com og hladdu upp öllu í þessari möppu (Add file → Upload files). Þetta er sama aðferð og með appið.

## Tenging við Mín Hljómey síðar

Hver leikur er merktur með `EVENT_TAG` úr `config.js` (sjálfgefið `hljomey-2027`), og gögnin liggja í Supabase. Því getur appið síðar sótt t.d. sigurvegara eða stigatöflu hátíðarinnar án breytinga á leiknum sjálfum.
