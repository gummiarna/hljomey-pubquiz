# Hljómey – tónlistarleikir

Vefsíðan á **[hljomey.is/pubquiz](https://hljomey.is/pubquiz)**: þrír leikir þar sem síminn er svarhnappurinn eða söngbókin.

| Leikur | Stjórnandi | Hvað gerist |
| --- | --- | --- |
| Pöbbkviss | `web/stjorn.html` | Stuttir bútar úr lögum, gestir giska í símanum |
| Tónlistarbingó | `web/bingo-stjorn.html` | Hver gestur fær bingóspjald með lögum |
| Gítarpartý | `web/gitar.html` | Spilarinn fær hljómana, gestir fylgjast með textanum í símanum |

Þátttakendur fara á `web/index.html` (forsíðan) eða skanna QR-kóðann hjá stjórnandanum.

## Uppbygging

- `web/` – allar skrár sem fara í möppuna `public_html/pubquiz` á Bluehost.
- `setup.sql`, `bingo.sql`, `gitar.sql` – gagnagrunnurinn í Supabase, keyrt í þessari röð.
- `LESTU-MIG.md` – uppsetning skref fyrir skref.

`web/config.js` er hér með staðgenglum. Raunverulegu Supabase-lyklarnir eru aðeins í útgáfunni á vefþjóninum og eiga ekki heima í þessu repo.
