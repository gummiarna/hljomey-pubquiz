// Leiðbeiningar fyrir stjórnendur: einn gluggi fyrir hvern leik á forsíðunni
(function () {
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // Sameiginlegt fyrir alla leiki: innskráning stjórnanda og PIN
  const INNSKRANING = (sida, takki, pinTexti) => ({
    titill: 'Skráðu þig inn sem stjórnandi',
    skref: [
      `Opnaðu <a class="lb-hlekkur" href="${sida}" target="_blank" rel="noopener">stjórnandasíðuna ↗</a> í símanum, spjaldtölvunni eða tölvunni sem þú stýrir leiknum úr.`,
      `Smelltu á <b>Skrá inn</b> efst til hægri. Glugginn opnast líka sjálfkrafa þegar þú smellir á <b>${takki}</b> án þess að vera innskráð/ur, og ekkert af uppsetningunni tapast.`,
      'Sláðu inn netfangið þitt og smelltu á <b>Senda kóða</b>.',
      'Kóði kemur í tölvupósti eftir nokkrar sekúndur. Sláðu hann inn í reitinn <b>Kóði úr tölvupóstinum</b>. Kom ekkert? Athugaðu ruslpóstinn eða smelltu á <b>Senda kóða aftur</b>.',
      'Í fyrsta skipti biður kerfið um nafnið þitt. Það sést aðeins umsjónarmanni síðunnar.',
      'Þú helst innskráð/ur í þessum vafra þar til þú smellir á <b>Skrá út</b>. Leikur sem er í gangi heldur áfram þótt þú skráir þig út.',
    ],
    athugid: pinTexti || 'Innskráningin er allt sem þarf, ekkert PIN. Gestir í símum skrá sig aldrei inn.',
  });

  const LEIKIR = {
    kviss: {
      nafn: 'Pöbbkviss',
      sida: 'stjorn.html',
      inngangur: 'Kerfið spilar bút úr lagi eða ber upp spurningu, og allir svara í símanum. Fljót svör gefa flest stig og stigataflan birtist á stóra skjánum eftir hverja umferð.',
      tharft: ['Síma, spjaldtölvu eða tölvu til að stýra leiknum. Sjónvarp, skjávarpi eða hátalari gera hann skemmtilegri, en síminn dugar', 'Netsamband'],
      takki: 'Búa til leik',
      stillingar: [
        ['Tónlist / Spurningar / Blandað', 'Efst velurðu tegund kvissins: lagabúta, spurningar úr spurningabankanum, eða hvort tveggja til skiptis.'],
        ['Sækja lög úr', '<b>Leit á Deezer</b> (t.d. „íslenskt 80s“ eða „Eurovision“), <b>Deezer-lagalista</b> (besta leiðin til að stýra þemanu, límdu slóðina), <b>Flytjendum</b> (nöfn aðskilin með kommu) eða <b>Vinsælast núna</b> eftir tegund. Smelltu á <b>Sækja lög</b>.'],
        ['Flokkar og Erfiðleiki', 'Aðeins fyrir spurningar. Veldu einn eða fleiri flokka og erfiðleika frá Létt til Erfitt. Barnaspurningar eru sér flokkur og blandast ekki í „Allir flokkar“.'],
        ['Heiti leiks', 'Birtist á stóra skjánum.'],
        ['Fjöldi laga / Fjöldi spurninga', 'Hve margar umferðir eru spilaðar (sjálfgefið 10).'],
        ['Lengd búts', 'Hve lengi lagið hljómar áður en svarmöguleikarnir birtast: 3, 5 eða 10 sekúndur.'],
        ['Svartími', 'Hve margar sekúndur gestir hafa til að svara (10–45).'],
        ['Spurt um', '<b>Lag + flytjanda</b>, aðeins <b>Heiti lags</b> eða aðeins <b>Flytjanda</b>.'],
        ['Lögin í pottinum', 'Lögin eru falin svo enginn sjái svörin á skjánum. Þar geturðu skipt út lagi eða hlustað áður en þú byrjar.'],
      ],
      leikur: [
        'Smelltu á <b>Búa til leik</b>. QR-kóði og fjögurra stafa kóði birtast á skjánum.',
        'Gestir skanna kóðann eða slá hann inn á forsíðunni ásamt nafni eða liðsnafni.',
        'Hnappurinn neðst á skjánum (eða bilstöngin á lyklaborði) keyrir leikinn áfram: byrja → sýna svar → stigatafla → næsta lag → úrslit.',
        'Rétt svar gefur 500–1.000 stig eftir hraða og fyrsta rétta svarið +200 í bónus.',
        'Ef síminn eða tölvan endurræsist: opnaðu síðuna aftur og veldu <b>Halda áfram</b>. Gestur sem missir samband opnar síðuna aftur og heldur stigunum sínum.',
      ],
    },
    tonlistarbingo: {
      nafn: 'Tónlistarbingó',
      sida: 'bingo-stjorn.html',
      inngangur: 'Hver gestur fær sitt eigið bingóspjald með lögum í símanum. Kerfið spilar búta úr lögunum, gestir merkja þau sem þeir þekkja og kalla BINGÓ.',
      tharft: ['Síma, spjaldtölvu eða tölvu til að stýra leiknum. Sjónvarp, skjávarpi eða hátalari gera hann skemmtilegri, en síminn dugar', 'Netsamband'],
      takki: 'Búa til bingó',
      stillingar: [
        ['1. Þema', 'Sama og í Pöbbkvissi: Deezer-leit, lagalisti, flytjendur eða vinsælast núna. Tilbúin þemu birtast efst. Smelltu á <b>Sækja lög</b>.'],
        ['Heiti', 'Birtist á stóra skjánum.'],
        ['Stærð spjalds', '<b>5×5</b> (24 lög og fríreitur), <b>4×4</b> (16 lög) eða <b>3×3</b> (8 lög og fríreitur). Minna spjald gefur styttri leik.'],
        ['Lög í potti', 'Hve mörg ólík lög geta komið upp (sjálfgefið 60). Fleiri lög gefa lengri leik.'],
        ['Lengd búts', 'Hve lengi hvert lag hljómar: 10–30 sekúndur.'],
        ['Sjálfvirkt næsta lag', '<b>Nei, ég smelli</b>, eða næsta lag eftir 3, 5 eða 10 sekúndna hlé. Með 60 lögum og 15 sek. bútum tekur umferð um 20–35 mínútur.'],
        ['Spjaldið sýnir', '<b>Lag + flytjanda</b> (auðveldast), <b>Aðeins heiti lags</b>, eða <b>Aðeins flytjanda (erfitt)</b>: þá þarf að velja rétt lagaheiti úr fjórum, og rangt val læsir reitnum fram að næsta lagi.'],
        ['Spilað um', '1 lína → 2 línur → fullt spjald, á sama spjaldinu. Taktu hak af því sem á að sleppa.'],
        ['Sýna lagið á stóra skjánum', 'Slökkt sjálfgefið svo lögin haldist leyndarmál. Þú sérð alltaf listann undir <b>Spiluð lög</b>.'],
      ],
      leikur: [
        'Smelltu á <b>Búa til bingó</b> neðst. Gestir skanna QR-kóðann og fá spjaldið sitt.',
        '<b>Byrja bingó</b> spilar fyrsta lagið. Hnappurinn neðst (eða bilstöngin) spilar næsta lag strax og <b>Hlé</b> stöðvar sjálfvirku spilunina.',
        'Gestir merkja sjálfir og ýta á <b>BINGÓ!</b>. Kerfið staðfestir að öll merktu lögin hafi verið spiluð og sýnir spjald vinningshafans á skjánum.',
        'Falskt BINGÓ læsir hnappnum fram að næsta lagi. Ef fleiri kalla áður en þú heldur áfram vinna allir.',
        'Smelltu á <b>Halda áfram</b> til að spila næsta mynstur, eða <b>Ljúka leik</b>.',
      ],
    },
    talnabingo: {
      nafn: 'Bingó',
      sida: 'talnabingo-stjorn.html',
      inngangur: 'Gamla góða bingóið með tölum frá 1 til 75. Þú snýrð lukkuhjóli á stóra skjánum og gestir merkja tölurnar á B-I-N-G-O spjaldi í símanum.',
      tharft: ['Síma, spjaldtölvu eða tölvu til að stýra leiknum. Sjónvarp, skjávarpi eða hátalari gera hann skemmtilegri, en síminn dugar', 'Netsamband'],
      takki: 'Búa til bingó',
      stillingar: [
        ['1. Spilað um', 'Smelltu á mynstrin í þeirri röð sem á að spila þau. Talan á hverju mynstri sýnir röðina; smelltu aftur til að taka út.'],
        ['Ein lína', 'Heil lína lárétt, lóðrétt eða á ská.'],
        ['B, I, N, G eða O', 'Allur dálkurinn undir bókstafnum.'],
        ['X', 'Báðar skálínurnar.'],
        ['Allt spjaldið', 'Allir 25 reitirnir.'],
        ['Heiti', 'Birtist á stóra skjánum.'],
        ['Hljóð í hjólinu', 'Smellir á meðan hjólið snýst og bjölluhljóð þegar það stöðvast.'],
      ],
      leikur: [
        'Smelltu á <b>Búa til bingó</b>. Gestir skanna QR-kóðann og fá spjald: B 1–15, I 16–30, N 31–45, G 46–60, O 61–75 og fríreit í miðjunni.',
        '<b>Snúa</b> (eða bilstöngin á lyklaborði) snýr hjólinu. Talan er valin af handahófi á þjóninum og birtist í símunum þegar hjólið stöðvast.',
        'Allar komnar tölur sjást á töflunni við hliðina á hjólinu.',
        'Gestir merkja sjálfir. Þeir geta hakað við <b>Sýna komnar tölur á spjaldinu</b> til að fá hjálp.',
        'Við BINGÓ staðfestir kerfið að allar merktu tölurnar séu komnar upp og sýnir spjaldið á skjánum. Rangt BINGÓ læsir hnappnum fram að næstu tölu.',
        '<b>Halda áfram</b> fer í næsta mynstur. <b>Ljúka</b> sýnir alla vinningshafa.',
      ],
    },
    gitar: {
      nafn: 'Gítarpartý',
      sida: 'gitar.html',
      inngangur: 'Spilarinn fær lögin með hljómum og allir sem skanna QR-kóðann sjá textann í símanum. Síminn flettir með spilaranum. Engin tónlist er spiluð af netinu.',
      tharft: ['Síma eða spjaldtölvu fyrir spilarann (tölva virkar líka)', 'Netsamband', 'Gítar og söngglaða gesti'],
      takki: 'Byrja partý',
      stillingar: [
        ['Söngbókin', 'Hakaðu við lögin fyrir kvöldið. <b>Öll / Íslensk / Erlend</b> sía listann og <b>Röð / A–Ö</b> raðar honum. Partýið fylgir röðinni.'],
        ['Vantar lag?', 'Gestir (og þú í símanum) geta sent inn lag sem vantar undir <b>Senda inn lag</b> í lagalistanum, t.d. afritað af gitargrip.is eða Ultimate Guitar. Hljómarnir raðast sjálfkrafa.'],
        ['Prenta valin lög', 'Býr til söngbók með einu lagi á síðu, eða PDF.'],
      ],
      leikur: [
        'Smelltu á <b>Byrja partý</b>. QR-kóði og fjögurra stafa kóði birtast. Gestir þurfa ekkert nafn.',
        'Þegar þú flettir á næsta lag fylgja allir símar með. Á tölvu fletta örvalyklar og fótstig líka.',
        '<b>Hljómar</b> sýnir eða felur hljómana. <b>− / +</b> færir lagið um hálftón, líka í símum gesta.',
        'Ýttu á heiti lagsins efst (eða ☰) til að velja lag utan raðar.',
        'Hringlaga takkinn niðri til hægri skrunar sjálfkrafa: hver smellur hækkar hraðann 1 → 2 → 3 → af.',
        '<b>Óskalög</b>: gestir senda hjörtu eða ný lög. Hjartað efst sýnir óskirnar og smellur á lag spilar það.',
        'Ef síminn eða tölvan endurræsist: opnaðu síðuna aftur og veldu <b>Halda áfram</b>.',
      ],
    },
    karaoke: {
      nafn: 'Karaoke',
      sida: 'karaoke.html',
      inngangur: 'Sjónvarpið spilar karaoke-myndbönd af YouTube og gestir velja lögin í símanum. Hver fer í biðröð og „Næst á svið“ birtist á milli laga.',
      tharft: ['Síma, spjaldtölvu eða tölvu sem spilar myndböndin, helst tengda við sjónvarp og hátalara', 'Netsamband', 'Hljóðnema ef þið viljið'],
      takki: 'Byrja karaoke-kvöld',
      stillingar: [
        ['Biðtími á milli laga', 'Hve lengi „Næst á svið“ birtist áður en næsta lag byrjar: 5–30 sekúndur.'],
        ['Lagalistinn', 'Öll lög sem hafa verið valin á fyrri kvöldum. Gestir velja þau aftur án þess að leita.'],
      ],
      leikur: [
        'Smelltu á <b>Byrja karaoke-kvöld</b>. QR-kóði birtist á sjónvarpinu.',
        'Gestir leita á YouTube í símanum, hlusta á útgáfurnar, velja eina og fara í biðröðina.',
        'Lögin byrja sjálfkrafa hvert á eftir öðru og hægt er að setja á pásu.',
        'Þú getur raðað biðröðinni, sett lag strax á svið eða tekið lag af lista.',
        'Leitirnar á YouTube eru takmarkaðar á hverjum degi. Lagalistinn kostar engar leitir og það má alltaf líma inn YouTube-slóð.',
      ],
    },
    hvadaar: {
      nafn: 'Hvaða ár?',
      sida: 'hvadaar.html',
      inngangur: 'Lag hljómar og hver gestur setur það á réttan stað á sinni eigin tímalínu í símanum. Rétt sett lag fer á tímalínuna, og sá sem fyrst nær settum fjölda spila vinnur.',
      tharft: ['Síma, spjaldtölvu eða tölvu til að stýra leiknum. Sjónvarp, skjávarpi eða hátalari gera hann skemmtilegri, en síminn dugar', 'Netsamband', 'Spotify Premium ef þú vilt heil lög (annars 30 sek. bútar)'],
      takki: 'Búa til leik',
      stillingar: [
        ['1. Hljóð', 'Án Spotify spilast 30 sekúndna bútar og ekkert þarf að gera. Með Spotify: smelltu á <b>Tengja Spotify</b>, skráðu þig inn og veldu <b>Tæki</b> sem á að spila. Ef tækið sést ekki: spilaðu eitthvað stutt í Spotify og ýttu á ↻. Ef það virkar ekki dugir að nota Deezer í 30 sek. bút.'],
        ['Spotify í síma', 'Opnaðu leikjasíðuna í vafra (Safari eða Chrome), ekki inni í öðru appi. Spotify-appið eitt og sér dugar ekki, síðan þarf að vera opin í vafranum.'],
        ['Lagið byrjar', 'Aðeins með Spotify: í byrjun lags, eða eftir 30 eða 45 sekúndur svo viðlagið komi strax.'],
        ['2. Lögin: Blanda', 'Frá <b>Bara íslensk</b> til <b>Bara erlend</b>.'],
        ['Aðeins lög með staðfestu ári', 'Hafðu hakað svo ekkert lag sé með vafasamt ártal.'],
        ['Heiti leiks', 'Birtist á stóra skjánum.'],
        ['Spil til sigurs', 'Hve mörg spil þarf á tímalínuna til að vinna: 5–15 (sjálfgefið 10).'],
        ['Svartími', '30 sek. til 1½ mín., eða ótakmarkaður.'],
        ['Erfiðleiki', '<b>Venjulegt</b>, eða <b>Létt (±3 ár)</b> sem fyrirgefur smá skekkju.'],
      ],
      leikur: [
        'Smelltu á <b>Búa til leik</b>. Gestir skanna QR-kóðann og fá eitt byrjunarspil með ártali.',
        'Hnappurinn neðst á skjánum (eða bilstöngin á lyklaborði) keyrir leikinn: byrja → afhjúpa árið → staða → næsta lag. Afhjúpað er sjálfkrafa þegar allir hafa svarað eða tíminn er búinn.',
        'Bónus: að þekkja flytjandann og giska á nákvæmt ár gefur tákn. Þrjú tákn má skipta fyrir aukaspil.',
        'Ef síminn eða tölvan endurræsist: opnaðu síðuna aftur og veldu <b>Halda áfram</b>.',
      ],
    },
    jolabingo: {
      nafn: 'Jólabingó',
      sida: 'jolabingo.html',
      reglur: true,
      inngangur: 'Eitt lag á dag frá 1. desember fram að jólum. Allir spila í eigin síma, hvar sem er, og það kostar ekkert að vera með.',
      kaflar: [
        ['Svona byrjarðu', [
          'Opnaðu <a class="lb-hlekkur" href="jolabingo.html">Jólabingóið</a> og skráðu þig með nafni og netfangi.',
          'Þú færð þitt eigið spjald með 16 listamönnum sem hafa spilað á Hljómey.',
          'Netfangið er notað til að hafa samband ef þú vinnur. Sama netfang í öðrum síma opnar sama spjaldið.',
        ]],
        ['Reglurnar', [
          'Kl. 12 á hverjum degi opnast nýtt lag. Hlustaðu og veldu hver flytur það úr fjórum möguleikum.',
          'Þú færð eitt svar á hvert lag. Ef svarið er rétt og listamaðurinn er á spjaldinu þínu merkist hann.',
          'Fimmta hvert rétt svar gefur jóker sem þú setur á hvaða reit sem er.',
          'Misstirðu af degi? Eldri lögin bíða eftir þér, svo það er aldrei of seint að byrja.',
        ]],
        ['Vinningar', [
          'Dregið er úr þeim sem ná einni línu, tveimur línum og fullu spjaldi.',
          'Lína getur verið lárétt, lóðrétt eða á ská.',
          'Vinningshafar fá póst á netfangið sitt.',
        ]],
      ],

    },
  };

  function html(id) {
    const L = LEIKIR[id];
    if (L.reglur) {
      let k = 0;
      return `
      <div class="lb-haus">
        <div class="lb-kick">Reglur leiksins</div>
        <h2 id="lbTitill">${esc(L.nafn)}</h2>
        <p>${L.inngangur}</p>
      </div>
      ${L.kaflar.map(([t, l]) => `<section class="lb-kafli"><h3><span>${++k}</span>${t}</h3><ul>${l.map(x => `<li>${x}</li>`).join('')}</ul></section>`).join('')}
      <div class="lb-fot"><a class="btn" href="${L.sida}">Fá spjaldið mitt →</a></div>`;
    }
    const inn = INNSKRANING(L.sida, L.takki, L.pinTexti);
    let n = 0;
    const kafli = (titill, innihald) => `<section class="lb-kafli"><h3><span>${++n}</span>${titill}</h3>${innihald}</section>`;
    return `
      <div class="lb-haus">
        <div class="lb-kick">Leiðbeiningar fyrir stjórnendur</div>
        <h2 id="lbTitill">${esc(L.nafn)}</h2>
        <p>${L.inngangur}</p>
      </div>
      <div class="lb-tharft"><b>Þú þarft</b><ul>${L.tharft.map(t => `<li>${t}</li>`).join('')}</ul></div>
      ${L.innskraningSleppa
        ? kafli('Opnaðu stjórnunarsíðuna', `<ol><li>Opnaðu <b>${L.sida}</b> og sláðu inn aðal-PIN.</li><li>Stillingarnar vistast um leið og þú breytir þeim.</li></ol>`)
        : kafli(inn.titill, `<ol>${inn.skref.map(s => `<li>${s}</li>`).join('')}</ol><p class="lb-ath">${inn.athugid}</p>`)}
      ${kafli('Stillingarnar', `<dl class="lb-still">${L.stillingar.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>`)}
      ${kafli('Í leiknum', `<ol>${L.leikur.map(s => `<li>${s}</li>`).join('')}</ol>`)}
      <div class="lb-fot"><a class="btn" href="${L.sida}">Opna ${esc(L.nafn)} →</a></div>`;
  }

  // Glugginn sjálfur
  const dlg = document.createElement('dialog');
  dlg.className = 'lb';
  dlg.setAttribute('aria-labelledby', 'lbTitill');
  dlg.innerHTML = '<button class="lb-loka" type="button" aria-label="Loka"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button><div class="lb-inni"></div>';
  document.body.appendChild(dlg);
  let opnari = null;
  dlg.querySelector('.lb-loka').onclick = () => dlg.close();
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
  dlg.addEventListener('close', () => { document.body.classList.remove('lb-opin'); if (opnari) opnari.focus(); });

  function opna(id, el) {
    if (!LEIKIR[id]) return;
    opnari = el || null;
    dlg.querySelector('.lb-inni').innerHTML = html(id);
    dlg.querySelector('.lb-inni').scrollTop = 0;
    document.body.classList.add('lb-opin');
    dlg.showModal();
    try { history.replaceState(null, '', '#leidbeiningar-' + id); } catch (e) {}
  }
  dlg.addEventListener('close', () => { try { if (location.hash.startsWith('#leidbeiningar-')) history.replaceState(null, '', location.pathname + location.search); } catch (e) {} });

  const SLODIR = { kviss: 'stjorn.html', tonlistarbingo: 'bingo-stjorn.html', talnabingo: 'talnabingo-stjorn.html', gitar: 'gitar.html', karaoke: 'karaoke.html', hvadaar: 'hvadaar.html' };
  // Hnappar á hvert leikjaspjald
  document.querySelectorAll('[data-leik]').forEach(el => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'lb-takki';
    b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2z"/><path d="M4 21V5M8 7h6M8 11h6"/></svg>Leiðbeiningar';
    b.onclick = () => opna(el.dataset.leik, b);
    // „Spila“ skráir stjórnanda inn (ef þarf) og opnar stjórnandasíðu leiksins
    const row = document.createElement('div');
    row.className = 'lb-rod';
    const slod = SLODIR[el.dataset.leik];
    if (slod) {
      const s = document.createElement('button');
      s.type = 'button';
      s.className = 'lb-takki lb-spila';
      s.title = 'Stjórna leik á stórum skjá';
      s.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>Spila';
      s.onclick = async () => {
        const nafn = (el.querySelector('h3') || {}).textContent || 'leiknum';
        try {
          if (window.PQ && PQ.auth) await PQ.auth.ensure({ message: `Skráðu þig inn sem stjórnandi til að stjórna ${nafn}. Gestir í símum þurfa aldrei að skrá sig inn.` });
          location.href = slod;
        } catch (e) { /* hætt við innskráningu */ }
      };
      row.appendChild(s);
    }
    row.appendChild(b);
    (el.querySelector('.game-body') || el).appendChild(row);
  });
  document.querySelectorAll('[data-leidbeiningar]').forEach(b => b.addEventListener('click', e => { e.preventDefault(); opna(b.dataset.leidbeiningar, b); }));

  // Bein slóð: leikir.hljomey.is/#leidbeiningar-bingo
  const m = /^#leidbeiningar-(\w+)$/.exec(location.hash);
  if (m) opna(m[1]);
  window.PQLeidbeiningar = { opna };
})();
