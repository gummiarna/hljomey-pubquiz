# Hljómey – tónlistarleikir

Vefsíðan á **[hljomey.is/pubquiz](https://hljomey.is/pubquiz)**: fimm leikir þar sem síminn er svarhnappurinn, söngbókin eða tímalínan.

| Leikur | Stjórnandi | Hvað gerist |
| --- | --- | --- |
| Pöbbkviss | `web/stjorn.html` | Bútar úr lögum, spurningar úr spurningabanka eða hvort tveggja; gestir svara í símanum |
| Tónlistarbingó | `web/bingo-stjorn.html` | Hver gestur fær bingóspjald með lögum |
| Gítarpartý | `web/gitar.html` | Spilarinn fær hljómana, gestir fylgjast með textanum í símanum |
| Karaoke | `web/karaoke.html` | Sjónvarpið spilar YouTube-karaoke, gestir leita, hlusta og fara í biðröð í símanum (til heimanota) |
| Hvaða ár? | `web/hvadaar.html` | Heil lög af Spotify (eða Deezer-bútar), hver leikmaður raðar lögunum á sína tímalínu eftir útgáfuári |

Þátttakendur fara á `web/index.html` (forsíðan) eða skanna QR-kóðann hjá stjórnandanum. Spurningabankanum er stjórnað á `web/spurningar.html`. Stjórnendur skrá sig inn til að búa til leiki og notkunin sést á `web/notkun.html` (aðal-PIN).

## Uppbygging

- `web/` – allar skrár sem fara í möppuna `public_html/pubquiz` á Bluehost.
- `setup.sql`, `bingo.sql`, `gitar.sql`, `themes.sql`, `spurningar.sql`, `karaoke.sql`, `hvadaar.sql`, `innskraning.sql`, `gestapin.sql` – gagnagrunnurinn í Supabase, keyrt í þessari röð (`gestapin.sql` alltaf síðast). `innskraning.sql` krefst innskráningar stjórnenda (Supabase Auth, netfang og lykilorð) og skráir notkun. `spurningar.sql` inniheldur líka 208 byrjunarspurningar; `spurningar-heimurinn.sql` (300 um allan heiminn) og `spurningar-born.sql` (300 barnaspurningar, sér flokkur) bæta við bankann og `web/hvadaar-listi.js` byrjunarlistann fyrir Hvaða ár?.
- `LESTU-MIG.md` – uppsetning skref fyrir skref.

`web/config.js` er hér með staðgenglum. Raunverulegu Supabase-lyklarnir eru aðeins í útgáfunni á vefþjóninum og eiga ekki heima í þessu repo.
