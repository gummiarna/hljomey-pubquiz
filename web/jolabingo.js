// Jólabingó Hljómeyjar – símasíða leikmanns
(function () {
  const { client, store, esc, SHAPES } = window.PQ;
  const $ = id => document.getElementById(id);
  const MAN = ['janúar', 'febrúar', 'mars', 'apríl', 'maí', 'júní', 'júlí', 'ágúst', 'september', 'október', 'nóvember', 'desember'];
  const ERR = {
    jb_netfang: 'Sláðu inn gilt netfang.',
    vantar_nafn: 'Sláðu inn nafnið þitt.',
    jb_ekki_opid: 'Jólabingóið er ekki opið fyrir skráningu ennþá. Kíktu aftur fljótlega!',
    jb_ogildur: 'Skráningin fannst ekki. Skráðu þig aftur með sama netfangi.',
    jb_ekki_opid_dagur: 'Þetta lag er ekki opið ennþá.',
    jb_buid: 'Þú ert búin(n) að svara þessu lagi.',
    jb_enginn_joker: 'Þú átt engan jóker.',
    jb_reitur: 'Þessi reitur er þegar merktur.'
  };
  const KEY = 'jolabingo_me';

  let me = store.get(KEY);
  let info = null;
  let S = null;          // staðan úr jb_state
  let valinn = null;     // dagurinn sem sýndur er í „lag dagsins“
  let jokerCell = null;

  async function call(fn, args) {
    const { data, error } = await client.rpc(fn, args);
    if (error) {
      const key = Object.keys(ERR).find(k => (error.message || '').includes(k));
      const e = new Error(key ? ERR[key] : 'Eitthvað fór úrskeiðis. Reyndu aftur.');
      e.code = key; throw e;
    }
    return data;
  }

  function toast(msg) {
    const t = $('toast'); t.textContent = msg; t.classList.remove('hidden');
    clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.add('hidden'), 3500);
  }

  function dags(iso, medTima = true) {
    const d = new Date(iso);
    const tt = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    return d.getDate() + '. ' + MAN[d.getMonth()] + (medTima ? ' kl. ' + tt : '');
  }

  function nidurtalning(iso) {
    const ms = new Date(iso) - Date.now();
    if (ms <= 0) return 'núna';
    const s = Math.floor(ms / 1000), dd = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sek = s % 60;
    if (dd > 0) return dd + ' d ' + h + ' klst';
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(sek).padStart(2, '0');
  }

  const aSpjaldi = artist => !!artist && S.card.some(n => n.toLowerCase() === String(artist).toLowerCase());

  // ---------- Skráning ----------
  function synaSkraningu() {
    $('vGame').classList.add('hidden'); $('vJoin').classList.remove('hidden'); $('me').classList.add('hidden');
    if (info) {
      const n = info.joker_every;
      const ord = { 1: 'Hvert', 2: 'Annað', 3: 'Þriðja', 4: 'Fjórða', 5: 'Fimmta', 6: 'Sjötta' }[n];
      $('stepJoker').textContent = (n === 1 ? 'Hvert' : (ord || n + '.') + ' hvert') + ' rétt svar gefur jóker sem þú setur á hvaða reit sem er. Misstirðu af degi? Eldri lögin bíða eftir þér.';
      if (!info.ready) {
        $('joinStatus').textContent = 'Jólabingóið opnar fljótlega. Kíktu aftur!';
        $('joinBtn').disabled = true;
      } else if (info.opened === 0) {
        $('joinStatus').textContent = 'Fyrsta lagið opnar ' + dags(info.start) + '. Náðu í spjaldið strax.';
      } else {
        $('joinStatus').textContent = info.opened + ' ' + (info.opened === 1 ? 'lag er' : 'lög eru') + ' opin. Þú getur svarað þeim öllum.';
      }
    }
  }

  $('joinBtn').onclick = async () => {
    const btn = $('joinBtn'); const err = $('joinErr'); err.classList.add('hidden');
    btn.disabled = true;
    try {
      const r = await call('jb_join', { p_email: $('emailIn').value, p_name: $('nameIn').value, p_newsletter: $('nlIn').checked });
      me = { player_id: r.player_id, token: r.token };
      store.set(KEY, me);
      await hlada();
    } catch (e) {
      err.textContent = e.message; err.classList.remove('hidden');
    } finally { btn.disabled = false; }
  };

  // ---------- Leikurinn ----------
  async function hlada(halda) {
    try {
      S = await call('jb_state', { p_player_id: me.player_id, p_token: me.token });
    } catch (e) {
      if (e.code === 'jb_ogildur') { store.del(KEY); me = null; synaSkraningu(); return; }
      toast(e.message); return;
    }
    $('vJoin').classList.add('hidden'); $('vGame').classList.remove('hidden');
    $('me').textContent = S.name; $('me').classList.remove('hidden');
    if (!halda || !valinn) valinn = sjalfgefinnDagur();
    teikna();
    athugaVinning();
  }

  function sjalfgefinnDagur() {
    const opnir = S.days.filter(d => d.open);
    const osvarad = opnir.filter(d => !d.answered);
    if (osvarad.length) return osvarad[osvarad.length - 1].day;   // nýjasta ósvaraða lagið
    if (opnir.length) return opnir[opnir.length - 1].day;
    return 1;
  }

  function teikna() {
    $('sRight').textContent = S.correct;
    $('sLines').textContent = S.full ? 'Fullt' : S.lines;
    $('sJokers').textContent = S.jokers;
    const iNaesta = S.joker_every - (S.correct % S.joker_every);
    $('cardHint').textContent = S.jokers > 0 ? '' : iNaesta + ' rétt svör í næsta jóker';
    teiknaDag();
    teiknaSpjald();
    teiknaDagatal();
  }

  function teiknaDag() {
    const d = S.days[valinn - 1]; const el = $('today');
    stoppaHljod();
    if (!d) { el.innerHTML = ''; return; }
    if (!d.open) {
      el.innerHTML = `<div class="kick">Dagur ${d.day}</div><h2>Næsta lag opnar</h2>
        <div class="wait"><b id="cd">${nidurtalning(d.opens)}</b><span class="muted">${esc(dags(d.opens))}</span></div>`;
      el.dataset.opens = d.opens;
      return;
    }
    delete el.dataset.opens;
    const opts = (d.options || []).map((o, i) => {
      let cls = 'opt' + i;
      if (d.answered) cls += i === d.right ? ' right' : ' dim';
      return `<button class="${cls}" data-i="${i}" ${d.answered ? 'disabled' : ''}><i>${SHAPES[i]}</i>${esc(o)}</button>`;
    }).join('');
    let nidurstada = '';
    if (d.answered) {
      const a = aSpjaldi(d.artist);
      const tx = d.correct
        ? (a ? `Rétt! ${esc(d.artist)} er á spjaldinu þínu.` : `Rétt, en ${esc(d.artist)} er ekki á spjaldinu þínu. Rétta svarið telur samt upp í jóker.`)
        : `Ekki rétt. Þetta var ${esc(d.artist)}.`;
      nidurstada = `<div class="result">${d.cover ? `<img src="${esc(d.cover)}" alt="">` : ''}<div><b>${esc(d.song || 'Lag dagsins')}</b><span>${esc(d.artist)}</span></div></div>
        <div class="verdict ${d.correct ? 'good' : 'bad'}">${tx}</div>`;
      const naesta = S.days.find(x => x.open && !x.answered);
      if (naesta) nidurstada += `<button class="btn full" style="margin-top:14px;width:100%" id="naestaBtn">Næsta lag sem þú átt eftir (${naesta.day}. des.)</button>`;
      else {
        const lokad = S.days.find(x => !x.open);
        if (lokad) nidurstada += `<div class="wait"><span class="muted">Næsta lag opnar eftir</span><b id="cd">${nidurtalning(lokad.opens)}</b></div>`;
        el.dataset.opens = lokad ? lokad.opens : '';
      }
    }
    el.innerHTML = `<div class="kick">Dagur ${d.day} · ${esc(dags(d.opens, false))}</div><h2>Lag dagsins</h2>
      ${d.deezer_id ? `<button class="play" id="playBtn"><span class="ic"><svg viewBox="0 0 24 24" id="playIc"><path d="M7 4v16l13-8z"/></svg></span>
        <span class="wave" id="wave">${'<i></i>'.repeat(14)}</span><span class="muted" id="playTx">Hlusta</span></button>` : ''}
      <div class="q">Hver flytur lagið?</div><div class="opts">${opts}</div>${nidurstada}`;
    el.querySelectorAll('.opts button:not([disabled])').forEach(b => b.onclick = () => svara(d.day, +b.dataset.i));
    if ($('playBtn')) $('playBtn').onclick = () => spila(d);
    if ($('naestaBtn')) $('naestaBtn').onclick = () => { valinn = S.days.find(x => x.open && !x.answered).day; teikna(); $('today').scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  }

  async function svara(day, choice) {
    $('today').querySelectorAll('.opts button').forEach(b => b.disabled = true);
    try {
      const r = await call('jb_answer', { p_player_id: me.player_id, p_token: me.token, p_day: day, p_choice: choice });
      if (r.new_joker) setTimeout(() => toast('Þú fékkst jóker! Settu hann á hvaða reit sem er.'), 600);
      await hlada(true);
    } catch (e) { toast(e.message); await hlada(true); }
  }

  // ---------- Hljóð ----------
  const audio = $('audio');
  async function spila(d) {
    if (!audio.paused && audio.dataset.day === String(d.day)) { stoppaHljod(); return; }
    try {
      $('playTx').textContent = 'Sæki…';
      const url = await window.PQDeezer.refreshPreview(d.deezer_id);
      if (!url) throw new Error('nei');
      audio.src = url; audio.dataset.day = d.day;
      await audio.play();
      $('wave').classList.add('on'); $('playTx').textContent = 'Stöðva';
      $('playIc').innerHTML = '<path d="M6 5h4v14H6zM14 5h4v14h-4z"/>';
    } catch (e) {
      if ($('playTx')) $('playTx').textContent = 'Hlusta';
      toast('Ekki tókst að spila lagið. Reyndu aftur.');
    }
  }
  function stoppaHljod() {
    audio.pause();
    if ($('wave')) $('wave').classList.remove('on');
    if ($('playTx')) $('playTx').textContent = 'Hlusta';
    if ($('playIc')) $('playIc').innerHTML = '<path d="M7 4v16l13-8z"/>';
  }
  audio.onended = stoppaHljod;

  // ---------- Spjaldið og jókerar ----------
  function teiknaSpjald() {
    const jok = new Set((S.joker_cells || []).map(Number));
    const velja = S.jokers > 0;
    $('grid').innerHTML = S.card.map((n, i) => {
      const ok = S.ok[i];
      const langt = n.split(/\s+/).some(o => o.length > 9) || n.length > 22;
      const cls = 'cell' + (langt ? ' long' : '') + (ok ? ' ok' : '') + (jok.has(i + 1) ? ' joker' : '') + (!ok && velja ? ' pick' : '');
      return `<div class="${cls}" data-c="${i + 1}" role="${!ok && velja ? 'button' : 'img'}" aria-label="${esc(n)}${ok ? ', merkt' : ''}">${esc(n)}</div>`;
    }).join('');
    $('jokerBar').classList.toggle('hidden', !velja);
    $('jokerCancel').classList.add('hidden');
    if (velja) $('jokerTx').textContent = S.jokers === 1 ? 'Þú átt jóker! Ýttu á reit til að merkja hann.' : `Þú átt ${S.jokers} jókera! Ýttu á reit til að merkja hann.`;
    $('grid').querySelectorAll('.cell.pick').forEach(c => c.onclick = () => {
      jokerCell = +c.dataset.c;
      $('sheetTx').textContent = 'Jókerinn merkir „' + S.card[jokerCell - 1] + '“. Það er ekki hægt að færa hann seinna.';
      $('sheet').classList.remove('hidden');
    });
  }
  $('sheetNo').onclick = () => $('sheet').classList.add('hidden');
  $('sheet').onclick = e => { if (e.target.id === 'sheet') $('sheet').classList.add('hidden'); };
  $('sheetYes').onclick = async () => {
    $('sheet').classList.add('hidden');
    try { await call('jb_joker', { p_player_id: me.player_id, p_token: me.token, p_cell: jokerCell }); await hlada(true); }
    catch (e) { toast(e.message); }
  };

  function teiknaDagatal() {
    $('doors').innerHTML = S.days.map(d => {
      let cls = 'door';
      if (d.answered) cls += d.correct ? ' good' : ' bad';
      else if (d.open) cls += ' open';
      if (d.day === valinn) cls += ' cur';
      const lab = d.open ? (d.answered ? (d.correct ? 'rétt' : 'rangt') : 'opið') : 'opnar ' + dags(d.opens);
      return `<button class="${cls}" data-d="${d.day}" aria-label="${d.day}. desember, ${lab}">${d.day}</button>`;
    }).join('');
    $('doors').querySelectorAll('.door').forEach(b => b.onclick = () => {
      valinn = +b.dataset.d; teikna();
      $('today').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function athugaVinning() {
    const lyk = 'jolabingo_linur_' + me.player_id;
    const adur = store.get(lyk) || { lines: 0, full: false };
    let titill = null, tx = '';
    if (S.full && !adur.full) { titill = 'BINGÓ!'; tx = 'Fullt spjald! Þú ert komin(n) í pottinn fyrir stóra vinninginn.'; }
    else if (S.lines >= 2 && adur.lines < 2) { titill = 'TVÆR LÍNUR!'; tx = 'Þú ert komin(n) í pottinn fyrir tvær línur. Áfram í fullt spjald!'; }
    else if (S.lines >= 1 && adur.lines < 1) { titill = 'LÍNA!'; tx = 'Þú ert komin(n) í pottinn fyrir línu. Haltu áfram!'; }
    store.set(lyk, { lines: S.lines, full: S.full });
    if (!titill) return;
    const b = $('banner');
    b.innerHTML = `<h1>${titill}</h1><p>${tx}</p><button class="btn" id="bannerOk">Frábært</button>`;
    b.classList.remove('hidden');
    $('bannerOk').onclick = () => b.classList.add('hidden');
  }

  // ---------- Deila spjaldinu ----------
  $('shareBtn').onclick = async () => {
    const W = 1080, H = 1350, c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    const bg = g.createLinearGradient(0, 0, W, H); bg.addColorStop(0, '#123647'); bg.addColorStop(1, '#0b1f29');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    try { await document.fonts.load('600 80px Oswald'); } catch (e) {}
    g.fillStyle = '#f2b544'; g.font = '600 92px Oswald, sans-serif'; g.textAlign = 'center';
    g.fillText('JÓLABINGÓ', W / 2, 150);
    g.fillStyle = '#f5fbfc'; g.font = '500 54px Oswald, sans-serif'; g.fillText('HLJÓMEYJAR', W / 2, 225);
    const pad = 90, gap = 18, size = (W - pad * 2 - gap * 3) / 4, top = 300;
    S.card.forEach((n, i) => {
      const x = pad + (i % 4) * (size + gap), y = top + Math.floor(i / 4) * (size + gap);
      g.fillStyle = S.ok[i] ? '#f2b544' : '#163a4b';
      g.beginPath(); g.roundRect(x, y, size, size, 26); g.fill();
      g.fillStyle = S.ok[i] ? '#123647' : '#f5fbfc'; g.font = (S.ok[i] ? '700 ' : '500 ') + '30px Literata, Georgia, serif';
      const ord = n.split(' '); const linur = []; let l = '';
      ord.forEach(o => { const t = l ? l + ' ' + o : o; if (g.measureText(t).width > size - 24 && l) { linur.push(l); l = o; } else l = t; });
      linur.push(l);
      linur.slice(0, 4).forEach((t, k) => g.fillText(t, x + size / 2, y + size / 2 + (k - (Math.min(linur.length, 4) - 1) / 2) * 36 + 10));
    });
    g.fillStyle = '#a9c9d4'; g.font = '500 38px Literata, Georgia, serif';
    g.fillText(S.full ? 'Fullt spjald!' : `${S.lines} ${S.lines === 1 ? 'lína' : 'línur'} · ${S.correct} rétt svör`, W / 2, 1190);
    g.fillStyle = '#f5fbfc'; g.font = '600 40px Oswald, sans-serif'; g.fillText('Spilaðu með: leikir.hljomey.is', W / 2, 1265);
    c.toBlob(async blob => {
      const file = new File([blob], 'jolabingo-hljomey.png', { type: 'image/png' });
      const texti = 'Ég er að spila Jólabingó Hljómeyjar, eitt lag á dag fram að jólum! ' + location.origin + '/jolabingo.html';
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], text: texti }); } catch (e) {}
      } else {
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name; a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      }
    }, 'image/png');
  };

  // ---------- Klukka og endurhleðsla ----------
  setInterval(() => {
    const el = $('today'); const cd = $('cd');
    if (!cd || !el.dataset.opens) return;
    cd.textContent = nidurtalning(el.dataset.opens);
    if (new Date(el.dataset.opens) <= Date.now()) { delete el.dataset.opens; valinn = null; hlada(); }
  }, 1000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && me) hlada(true); });

  (async function byrja() {
    try { info = await call('jb_info', {}); } catch (e) { info = null; }
    if (me) await hlada(); else synaSkraningu();
  })();
})();
