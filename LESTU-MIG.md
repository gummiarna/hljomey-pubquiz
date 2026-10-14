# Hljómey Pöbbkviss, Tónlistarbingó og Gítarpartý – uppsetning skref fyrir skref

Leikirnir þrír, Pöbbkviss, Tónlistarbingó og Gítarpartý, eru settir upp saman. Þeir samanstanda af tveimur hlutum:

- **Supabase** (ókeypis): gagnagrunnur og rauntími sem tengir síma og stóra skjáinn.
- **Vefsíðan** (15 skrár í möppunni `web`): fer í möppuna `/pubquiz` á Bluehost.

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
7. Gerðu það sama við `gitar.sql`. Þetta bætir Gítarpartýinu við og notar líka sama PIN.

Ef þú hefur þegar keyrt `setup.sql` áður þarftu aðeins að keyra `bingo.sql` og `gitar.sql`. Ef þú keyrir `setup.sql` einhvern tíma aftur skaltu keyra `bingo.sql` og `gitar.sql` aftur strax á eftir, því `setup.sql` tekur af réttindi hinna leikjanna.

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
4. Opnaðu `pubquiz` og smelltu á **Upload**. Hladdu upp öllum 15 skránum úr `web`:
   `index.html`, `stjorn.html`, `bingo.html`, `bingo-stjorn.html`, `gitar.html`, `style.css`, `host.css`, `config.js`, `common.js`, `deezer.js`, `host.js`, `player.js`, `bingo-host.js`, `bingo-player.js`, `gitar-core.js`
5. Þetta hefur engin áhrif á WordPress eða Elementor. Mappan hefur einfaldlega forgang á slóðinni /pubquiz.

Slóðirnar verða:

| Hver | Slóð |
| --- | --- |
| Þátttakendur (sláðu inn kóða, virkar fyrir báða leiki) | **hljomey.is/pubquiz** |
| Stjórnandi Pöbbkviss | **hljomey.is/pubquiz/stjorn.html** |
| Stjórnandi Tónlistarbingós | **hljomey.is/pubquiz/bingo-stjorn.html** |
| Spilari í Gítarpartýi | **hljomey.is/pubquiz/gitar.html** |

Efst á stjórnandasíðunni er hnappur til að skipta á milli leikjanna. QR-kóðinn vísar beint á réttan leik.

## Skref 5 – Prófa

1. Opnaðu **hljomey.is/pubquiz/stjorn.html** í tölvu (Chrome virkar best).
2. Veldu **Leit á Deezer**, skrifaðu t.d. `íslenskt` og smelltu á **Sækja lög**.
3. Veldu fjölda laga, hlustaðu með ▶, skiptu út lögum með **Skipta**, sláðu inn PIN og smelltu á **Búa til leik**.
4. Skannaðu QR-kóðann með símanum og skráðu þig.
5. Ýttu á **Byrja leik** (eða bilstöngina).

Ábendingar um þema:

- **Deezer-lagalisti** gefur besta stjórn. Búðu til lista á deezer.com (ókeypis aðgangur dugar), hafðu hann **opinberan (public)** og límdu slóðina inn.
- **Flytjendur**: t.d. `Stuðmenn, Mugison, GDRN` gefur vinsælustu lög hvers og eins.
- Lög án forskoðunar á Deezer eru síuð sjálfkrafa frá.

## Á leikkvöldinu

- [ ] **Opnaðu Supabase deginum áður.** Ókeypis verkefni fara í dvala eftir 7 daga án notkunar. Ef það gerist: skráðu þig inn og smelltu á **Restore project**.
- [ ] Tölvan tengd við skjávarpa og hátalara. Smelltu á **Fullur skjár**.
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
5. Örvarnar raða söngbókinni.
6. **Lag af gitargrip.is (guitarparty.com)**: opnaðu lagið, veldu allt (Ctrl+A) og afritaðu (Ctrl+C). Smelltu á **Nýtt lag** og límdu inn í textareitinn. Hljómarnir lenda á nákvæmlega sama atkvæði og á síðunni, og heiti og höfundar fyllast út sjálfkrafa.
7. **Lag af Ultimate Guitar eða annarri gítarsíðu**: opnaðu lagið þar, veldu textann með hljómunum og afritaðu (Ctrl+C). Smelltu á **Nýtt lag** og límdu inn. Hljómunum er breytt sjálfkrafa, gítartabs fjarlægð, og Capo og Key sett í réttu reitina. [Verse]/[Chorus] verða Erindi/Viðlag. Skrifaðu svo heiti lagsins og vistaðu.
8. **Heil söngbók í einu**: smelltu á **Flytja inn** og veldu PDF-söngbók (t.d. af guitarparty.com). Lögin eru lesin í vafranum, líka síður í tveimur dálkum, hljómarnir settir á rétt atkvæði og viðlög merkt. Taktu hak af lögum sem þú vilt sleppa og smelltu á **Flytja inn**. Lög sem eru þegar í söngbókinni eru ekki valin. Hakirðu við þau er gömlu útgáfunni **skipt út**, svo þú getur flutt sömu bók inn aftur án þess að fá tvöföld lög.

**Í partýinu**

1. Á **gitar.html**: hakaðu við lögin fyrir kvöldið og ýttu á **Byrja partý**. QR-kóði og fjögurra stafa kóði birtast.
2. Gestir skanna QR-kóðann, eða slá kóðann inn á **hljomey.is/pubquiz** (ekkert nafn þarf).
3. Þegar þú flettir á næsta lag fylgja allir símar með. Gestir sjá aðeins textann nema þeir kveiki á **Hljómar**.
4. **− / +** færa lagið um hálftón (líka hljómana í símum gesta).
5. **Velja lag utan raðar**: ýttu á heiti lagsins efst (eða ☰). Leitaðu, eða raðaðu eftir stafrófi með **A–Ö**. ✓ merkir lög sem búið er að spila. Undir **Öll lög** geturðu valið lag úr söngbókinni sem var ekki á listanum.
6. **Sjálfvirkt skrun**: hringlaga takkinn niðri til hægri. Hver smellur hækkar hraðann 1 → 2 → 3 → af. Skrunið stoppar á meðan þú snertir skjáinn, á enda lagsins og þegar skipt er um lag. Gestir hafa sama takka í sínum síma. Við tölvu: **S** skiptir um hraða og **L** opnar lagalistann.
7. QR-takkinn efst sýnir kóðann aftur í fullri stærð. Örvalyklar og fótstig (síðuflettarar) fletta á milli laga.
8. Ef síminn eða tölvan endurræsist: opnaðu gitar.html aftur og veldu **Halda áfram**.
9. **Prenta valin lög** býr til söngbók með einu lagi á síðu. Í prentglugganum má velja **Vista sem PDF**.

## Stigagjöf í Pöbbkvissi

- Rétt svar: 500–1.000 stig eftir hraða (mælt á þjóninum, ekki í símanum).
- Fyrst/ur með rétt svar: +200 bónus.
- Rangt svar eða ekkert svar: 0 stig.

## Setja í GitHub

Búðu til nýtt repo, `hljomey-pubquiz`, á github.com og hladdu upp öllu í þessari möppu (Add file → Upload files). Þetta er sama aðferð og með appið.

## Tenging við Mín Hljómey síðar

Hver leikur er merktur með `EVENT_TAG` úr `config.js` (sjálfgefið `hljomey-2027`), og gögnin liggja í Supabase. Því getur appið síðar sótt t.d. sigurvegara eða stigatöflu hátíðarinnar án breytinga á leiknum sjálfum.
