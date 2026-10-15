# Hljómey – tónlistarleikir

Vefsíðan á **[hljomey.is/pubquiz](https://hljomey.is/pubquiz)**: fjórir leikir þar sem síminn er svarhnappurinn eða söngbókin.

| Leikur | Stjórnandi | Hvað gerist |
| --- | --- | --- |
| Pöbbkviss | `web/stjorn.html` | Bútar úr lögum, spurningar úr spurningabanka eða hvort tveggja; gestir svara í símanum |
| Tónlistarbingó | `web/bingo-stjorn.html` | Hver gestur fær bingóspjald með lögum |
| Gítarpartý | `web/gitar.html` | Spilarinn fær hljómana, gestir fylgjast með textanum í símanum |
| Karaoke | `web/karaoke.html` | Sjónvarpið spilar YouTube-karaoke, gestir leita, hlusta og fara í biðröð í símanum (til heimanota) |

Þátttakendur fara á `web/index.html` (forsíðan) eða skanna QR-kóðann hjá stjórnandanum. Spurningabankanum er stjórnað á `web/spurningar.html`.

## Uppbygging

- `web/` – allar skrár sem fara í möppuna `public_html/pubquiz` á Bluehost.
- `setup.sql`, `bingo.sql`, `gitar.sql`, `themes.sql`, `spurningar.sql`, `karaoke.sql` – gagnagrunnurinn í Supabase, keyrt í þessari röð. `spurningar.sql` inniheldur líka 208 byrjunarspurningar.
- `LESTU-MIG.md` – uppsetning skref fyrir skref.

`web/config.js` er hér með staðgenglum. Raunverulegu Supabase-lyklarnir eru aðeins í útgáfunni á vefþjóninum og eiga ekki heima í þessu repo.
