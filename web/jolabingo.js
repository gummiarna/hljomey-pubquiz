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
  let SP = [];           // styrktaraðilar
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
    teiknaStyrktar();
  }

  // ---------- Styrktaraðilar ----------
  // Logoin eru geymd í vafranum og aðeins sótt aftur ef þeim hefur verið breytt (sparar gagnamagn)
  async function saekjaStyrktar() {
    const LYK = 'jolabingo_styrktar';
    let geymt = null; try { geymt = JSON.parse(localStorage.getItem(LYK)); } catch (e) {}
    try {
      const v = await call('jb_sponsors_ver', {});
      if (geymt && geymt.v === v && Array.isArray(geymt.d)) return geymt.d;
      const d = await call('jb_sponsors', {});
      try { localStorage.setItem(LYK, JSON.stringify({ v, d })); } catch (e) {}
      return d;
    } catch (e) { return geymt && Array.isArray(geymt.d) ? geymt.d : []; }
  }
  function logo(p) {
    const inni = `<img src="${esc(p.logo)}" alt="${esc(p.name)}" loading="lazy">`;
    return p.url ? `<a class="sp-logo${p.plate ? ' plate' : ''}" href="${esc(p.url)}" target="_blank" rel="noopener sponsored" title="${esc(p.name)}">${inni}</a>`
                 : `<span class="sp-logo${p.plate ? ' plate' : ''}" title="${esc(p.name)}">${inni}</span>`;
  }
  const dagsStyrktar = day => SP.find(p => (p.days || []).includes(day));
  function teiknaStyrktar() {
    const l = SP.filter(p => p.strip);
    $('sponsors').classList.toggle('hidden', !l.length);
    $('spRow').innerHTML = l.map(logo).join('');
  }
  function iBodi(day) {
    const p = dagsStyrktar(day);
    return p ? `<div class="sp-day"><span>Í boði</span>${logo(p)}</div>` : '';
  }

  function teiknaDag() {
    const d = S.days[valinn - 1]; const el = $('today');
    stoppaHljod();
    if (!d) { el.innerHTML = ''; return; }
    if (!d.open) {
      el.innerHTML = `<div class="kick">Dagur ${d.day}</div><h2>Næsta lag opnar</h2>${iBodi(d.day)}
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
    el.innerHTML = `<div class="kick">Dagur ${d.day} · ${esc(dags(d.opens, false))}</div><h2>Lag dagsins</h2>${iBodi(d.day)}
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
    if (S.lines >= 3 && adur.lines < 3) { titill = 'BINGÓ!'; tx = 'Þrjár línur! Þú ert komin(n) í pottinn fyrir stóra vinninginn.'; }
    else if (S.lines >= 2 && adur.lines < 2) { titill = 'TVÆR LÍNUR!'; tx = 'Þú ert komin(n) í pottinn fyrir tvær línur. Áfram í þrjár línur!'; }
    else if (S.lines >= 1 && adur.lines < 1) { titill = 'LÍNA!'; tx = 'Þú ert komin(n) í pottinn fyrir línu. Haltu áfram!'; }
    store.set(lyk, { lines: S.lines, full: S.full });
    if (!titill) return;
    const b = $('banner');
    b.innerHTML = `<h1>${titill}</h1><p>${tx}</p><button class="btn" id="bannerOk">Frábært</button>`;
    b.classList.remove('hidden');
    $('bannerOk').onclick = () => b.classList.add('hidden');
  }

  // ---------- Deila ----------
  const SLOD = location.origin + '/jolabingo';
  let deiliMynd = null;   // { blob, url, nafn }

  function stadaTexti() {
    if (!S) return '';
    if (S.lines >= 3) return 'BINGÓ! Þrjár línur';
    return `${S.lines} ${S.lines === 1 ? 'lína' : 'línur'} · ${S.correct} rétt ${S.correct === 1 ? 'svar' : 'svör'}`;
  }

  // Teiknar mynd í stíl auglýsinganna: story (1080×1920) eða færsla (1080×1350)
  async function teiknaMynd(snid) {
    const story = snid === 'story', W = 1080, H = story ? 1920 : 1350;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    try { await Promise.all(['700 100px Oswald', '600 40px Oswald', '500 40px Oswald', '500 30px Literata', '700 30px Literata', 'italic 400 30px Literata'].map(f => document.fonts.load(f))); } catch (e) {}

    // Bakgrunnur: dökkblátt með gylltum bjarma og snjó
    let bg = g.createLinearGradient(0, 0, W * .6, H); bg.addColorStop(0, '#163f52'); bg.addColorStop(.45, '#102c3a'); bg.addColorStop(1, '#0b1f29');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    const glow = (x, y, r, col) => { const rg = g.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, col); rg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = rg; g.fillRect(0, 0, W, H); };
    glow(W * .85, -60, 620, 'rgba(242,181,68,.26)'); glow(0, H + 40, 640, 'rgba(46,134,166,.32)');
    let fr = 11; const r = () => (fr = (fr * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < W * H / 9000; i++) { g.globalAlpha = .15 + r() * .5; g.fillStyle = '#fff'; g.beginPath(); g.arc(r() * W, r() * H, .8 + r() * 2.4, 0, 7); g.fill(); }
    g.globalAlpha = 1;
    const flaga = (x, y, k, o) => { g.save(); g.translate(x, y); g.scale(k, k); g.strokeStyle = `rgba(255,255,255,${o})`; g.lineWidth = 2; g.lineCap = 'round';
      for (let a = 0; a < 3; a++) { g.rotate(Math.PI / 3); g.beginPath(); g.moveTo(-14, 0); g.lineTo(14, 0); [8, -8].forEach(s => { g.moveTo(s, 0); g.lineTo(s + Math.sign(s) * 4, -4); g.moveTo(s, 0); g.lineTo(s + Math.sign(s) * 4, 4); }); g.stroke(); }
      g.restore(); };
    for (let i = 0; i < 8; i++) flaga(r() < .5 ? 30 + r() * 90 : W - 30 - r() * 90, 80 + r() * (H - 160), 1 + r() * 1.5, .12 + r() * .2);

    g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    let y = story ? 190 : 70;

    // Merki Hljómeyjar
    const mk = story ? .42 : .34, mw = 240 * mk, tx = 'HLJÓMEY';
    g.font = `600 ${story ? 34 : 28}px Oswald, sans-serif`; g.letterSpacing = '5px';
    const tw = g.measureText(tx).width, mx = (W - (mw + 16 + tw)) / 2;
    g.save(); g.translate(mx, y); g.scale(mk, mk);
    const poly = (pts, col) => { g.fillStyle = col; g.beginPath(); pts.forEach(([a, b], i) => i ? g.lineTo(a, b) : g.moveTo(a, b)); g.closePath(); g.fill(); };
    poly([[0,140],[45,60],[90,100],[130,35],[175,90],[220,55],[240,140]], '#6FC4DC'); poly([[10,140],[55,75],[95,110],[140,140]], '#2E86A6');
    poly([[55,140],[55,55],[90,20],[125,55],[125,140]], '#F5FBFC'); g.fillStyle = '#F2B544'; g.fillRect(80, 70, 20, 22);
    g.restore();
    g.fillStyle = '#f5fbfc'; g.textAlign = 'left'; g.fillText(tx, mx + mw + 16, y + 140 * mk - 4); g.textAlign = 'center'; g.letterSpacing = '0px';
    y += 140 * mk + (story ? 40 : 26);

    // Fyrirsögn
    const t = story ? 132 : 112;
    g.font = `700 ${t}px Oswald, sans-serif`; g.fillStyle = '#f5fbfc'; y += t * .86; g.fillText('JÓLABINGÓ', W / 2, y);
    g.fillStyle = '#f2b544'; y += t * .92; g.fillText('HLJÓMEYJAR', W / 2, y);
    g.font = `500 ${story ? 42 : 36}px Oswald, sans-serif`; g.fillStyle = '#f5fbfc'; y += story ? 62 : 56;
    g.fillText('Eitt lag á dag  ·  1.–18. desember', W / 2, y);
    y += story ? 44 : 40;

    // Góðvinir sóttir fyrst svo hægt sé að reikna plássið
    const lg = await Promise.all(SP.filter(p => p.share).map(p => new Promise(res => { const i = new Image(); i.onload = () => res({ p, i }); i.onerror = () => res(null); i.src = p.logo; })));
    const logo = lg.filter(Boolean);
    const raðir = !logo.length ? 0 : (story ? Math.ceil(logo.length / 8) : (logo.length > 4 ? 2 : 1)), bil = story ? 10 : 10, kh = story ? 66 : 66;
    const logoH = raðir ? (story ? 26 : 18) + raðir * kh + (raðir - 1) * bil : 0;
    const restH = (story ? 70 + 62 + 54 + 84 + 60 : 58 + 48 + 40 + 70 + 46) + logoH;
    const nedst = story ? 210 : 56;

    // Spjaldið: eins stórt og plássið leyfir
    const cw = Math.max(380, Math.min(story ? 800 : 600, H - nedst - y - restH)), pd = story ? 26 : 20, gap = story ? 14 : 10, size = (cw - pd * 2 - gap * 3) / 4, cx = (W - cw) / 2, ch = pd * 2 + size * 4 + gap * 3;
    g.save(); g.shadowColor = 'rgba(0,0,0,.4)'; g.shadowBlur = 50; g.shadowOffsetY = 20;
    g.fillStyle = 'rgba(255,255,255,.07)'; g.beginPath(); g.roundRect(cx, y, cw, ch, 28); g.fill(); g.restore();
    g.strokeStyle = 'rgba(255,255,255,.16)'; g.lineWidth = 2; g.beginPath(); g.roundRect(cx, y, cw, ch, 28); g.stroke();
    const jok = new Set((S.joker_cells || []).map(Number));
    const fs = Math.round(cw / (story ? 32 : 31.5));
    S.card.forEach((n, i) => {
      const x = cx + pd + (i % 4) * (size + gap), yy = y + pd + Math.floor(i / 4) * (size + gap), on = S.ok[i];
      g.fillStyle = on ? '#f2b544' : '#163a4b'; g.beginPath(); g.roundRect(x, yy, size, size, story ? 18 : 14); g.fill();
      g.fillStyle = on ? '#123647' : 'rgba(245,251,252,.88)'; g.font = `${on ? 700 : 500} ${fs}px Literata, Georgia, serif`;
      const ord = n.split(/\s+/), lin = []; let l = '';
      ord.forEach(o => { const s = l ? l + ' ' + o : o; if (g.measureText(s).width > size - 16 && l) { lin.push(l); l = o; } else l = s; }); lin.push(l);
      const L = lin.slice(0, 4), lh = fs * 1.18;
      L.forEach((s, k) => { while (g.measureText(s).width > size - 10 && s.length > 3) s = s.slice(0, -2) + '…'; g.fillText(s, x + size / 2, yy + size / 2 + (k - (L.length - 1) / 2) * lh + fs * .35); });
      if (jok.has(i + 1)) { g.font = `700 ${fs}px Oswald, sans-serif`; g.fillText('★', x + size - fs * .7, yy + fs * 1.1); }
    });
    y += ch + (story ? 70 : 58);

    // Staðan og hvatning
    g.font = `700 ${story ? 64 : 50}px Oswald, sans-serif`; g.fillStyle = '#f2b544'; g.fillText(stadaTexti(), W / 2, y);
    y += story ? 62 : 48;
    g.font = `500 ${story ? 34 : 28}px Literata, Georgia, serif`; g.fillStyle = '#a9c9d4';
    g.fillText('Vinningar að verðmæti yfir 200.000 kr.', W / 2, y);
    y += story ? 54 : 40;

    // Hnappur
    const ct = 'Spilaðu með  ·  leikir.hljomey.is/jolabingo';
    g.font = `600 ${story ? 38 : 32}px Oswald, sans-serif`;
    const bw = g.measureText(ct).width + (story ? 80 : 64), bh = story ? 84 : 70;
    g.fillStyle = '#f2b544'; g.beginPath(); g.roundRect((W - bw) / 2, y, bw, bh, bh / 2); g.fill();
    g.fillStyle = '#123647'; g.fillText(ct, W / 2, y + bh / 2 + (story ? 13 : 11));
    y += bh + (story ? 60 : 46);

    // Góðvinir
    if (logo.length) {
      g.font = `italic 400 ${story ? 30 : 24}px Literata, Georgia, serif`; g.fillStyle = '#6fc4dc';
      g.fillText('Í samvinnu við góðvini Hljómeyjar', W / 2, y); y += story ? 26 : 18;
      const iRod = Math.ceil(logo.length / raðir);
      const kb = Math.min(story ? 160 : 150, (W - (story ? 80 : 120) - (iRod - 1) * bil) / iRod);
      logo.forEach(({ p, i }, n) => {
        const rr = Math.floor(n / iRod), iRod2 = rr === raðir - 1 ? logo.length - rr * iRod : iRod;
        const x0 = (W - (iRod2 * kb + (iRod2 - 1) * bil)) / 2 + (n - rr * iRod) * (kb + bil), y0 = y + rr * (kh + bil);
        // Grunnlitur reitsins tekinn úr horni logosins svo logo með eigin bakgrunn fylli reitinn
        let lit = p.plate ? '#ffffff' : 'rgba(255,255,255,.06)';
        try { const t = document.createElement('canvas'); t.width = t.height = 1; const tg = t.getContext('2d'); tg.drawImage(i, 0, 0, 1, 1, 0, 0, 1, 1); const d = tg.getImageData(0, 0, 1, 1).data; if (d[3] > 200) lit = `rgb(${d[0]},${d[1]},${d[2]})`; } catch (e) {}
        g.fillStyle = lit; g.beginPath(); g.roundRect(x0, y0, kb, kh, 12); g.fill();
        const iw = i.naturalWidth || 200, ih = i.naturalHeight || 100, k = Math.min((kb - 16) / iw, (kh - 12) / ih);
        g.save(); g.beginPath(); g.roundRect(x0, y0, kb, kh, 12); g.clip();
        try { g.drawImage(i, x0 + (kb - iw * k) / 2, y0 + (kh - ih * k) / 2, iw * k, ih * k); } catch (e) {}
        g.restore();
      });
    }
    const blob = await new Promise(res => c.toBlob(res, 'image/png'));
    return { blob, url: URL.createObjectURL(blob), nafn: `jolabingo-hljomey-${story ? 'story' : 'faersla'}.png` };
  }

  const deiliTexti = () => `Ég er að spila Jólabingó Hljómeyjar 🎄 Eitt lag á dag 1.–18. desember og vinningar yfir 200.000 kr. Spilaðu með! ${SLOD}`;

  function opnaDeilingu() {
    deiliMynd = null;
    $('dVal').classList.remove('hidden'); $('dForsyn').classList.add('hidden');
    $('deila').classList.remove('hidden');
  }
  async function bua(snid) {
    $('dVal').classList.add('hidden'); $('dForsyn').classList.remove('hidden');
    $('dMynd').removeAttribute('src'); $('dBid').classList.remove('hidden'); $('dTakkar').classList.add('hidden');
    try {
      if (deiliMynd) URL.revokeObjectURL(deiliMynd.url);
      deiliMynd = await teiknaMynd(snid);
      $('dMynd').src = deiliMynd.url; $('dMynd').className = snid;
      $('dBid').classList.add('hidden'); $('dTakkar').classList.remove('hidden');
      $('dRad').textContent = snid === 'story' ? 'Settu myndina í story á Instagram eða Facebook og bættu við hlekk á leikir.hljomey.is/jolabingo.' : 'Settu myndina í færslu á Facebook eða Instagram. Textinn með hlekknum er afritaður þegar þú deilir.';
    } catch (e) { toast('Ekki tókst að búa til myndina.'); $('deila').classList.add('hidden'); }
  }
  async function afrita(t) { try { await navigator.clipboard.writeText(t); return true; } catch (e) { return false; } }

  $('shareBtn').onclick = opnaDeilingu;
  if ($('shareLink')) $('shareLink').onclick = async () => {
    if (navigator.share) { try { await navigator.share({ title: 'Jólabingó Hljómeyjar', text: 'Eitt lag á dag 1.–18. desember. Vinningar yfir 200.000 kr. Spilaðu með!', url: SLOD }); } catch (e) {} }
    else if (await afrita(SLOD)) toast('Hlekkurinn er afritaður.');
  };
  $('dStory').onclick = () => bua('story');
  $('dFaersla').onclick = () => bua('faersla');
  $('dHlekkur').onclick = async () => {
    $('deila').classList.add('hidden');
    if (navigator.share) { try { await navigator.share({ title: 'Jólabingó Hljómeyjar', text: deiliTexti(), url: SLOD }); } catch (e) {} }
    else window.open('https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(SLOD), '_blank', 'noopener');
  };
  $('dLoka').onclick = () => $('deila').classList.add('hidden');
  $('deila').onclick = e => { if (e.target.id === 'deila') $('deila').classList.add('hidden'); };
  $('dDeila').onclick = async () => {
    if (!deiliMynd) return;
    const file = new File([deiliMynd.blob], deiliMynd.nafn, { type: 'image/png' });
    await afrita(deiliTexti());
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], text: deiliTexti() }); } catch (e) {}
    } else { $('dVista').click(); toast('Myndin er vistuð og textinn afritaður. Settu hana inn á Facebook eða Instagram.'); }
  };
  $('dVista').onclick = () => {
    if (!deiliMynd) return;
    const a = document.createElement('a'); a.href = deiliMynd.url; a.download = deiliMynd.nafn; document.body.appendChild(a); a.click(); a.remove();
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
    const [i, sp] = await Promise.all([call('jb_info', {}).catch(() => null), saekjaStyrktar()]);
    info = i; SP = sp || [];
    if (me) await hlada(); else synaSkraningu();
  })();
})();
