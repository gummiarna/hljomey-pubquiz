# Leiðbeiningar fyrir Claude

## Útgáfa á Vercel

- Vercel-verkefnið `hljomey-leikir` er tengt þessu safni og setur hverja breytingu sjálfkrafa í loftið: `main` fer á leikir.hljomey.is og aðrar greinar fá forskoðunarslóð.
- Ekki gefa út á Vercel sjálfur eftir push, hvorki með Vercel-tenglinum, `vercel` CLI né „redeploy“. Það býr bara til annað eins afrit sem fyllir geymslupláss Vercel.
- Ef útgáfa misheppnast eða breyting birtist ekki: skoðaðu byggingarskrána, lagaðu orsökina og ýttu nýrri breytingu. Ekki endurræsa útgáfu nema Gummi biðji um það.
