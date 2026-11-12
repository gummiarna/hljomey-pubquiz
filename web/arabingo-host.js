// Hvaða ár? Bingó – stjórnandi og stór skjár: hjól með flokkum, lag, svör og BINGÓ
(function () {
  const { client, rpc, store, esc } = window.PQ;
  const { CATS, STAGES, STAGE_NAME, LETTERS, winCells, patHtml } = window.HB;
  const $ = id => document.getElementById(id);
  const SPIN_MS = 5500;

  const S = { game: null, token: null, phase: 'setup', players: 0, spinning: false, rot: 0, song: null, deadline: 0, timer: null, poll: null, revealing: false };
  const audio = new Audio(); audio.preload = 'auto';
  let picked = ['line', 'full'];

  function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.remove('hidden'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.add('hidden'), 5000); }
  function show(id) {
    ['setup', 'lobby', 'playing', 'claimView', 'final'].forEach(s => $(s).classList.toggle('hidden', s !== id));
    $('ctl').classList.toggle('hidden', id === 'setup');
  }
  function showErr(el, msg) { $(el).textContent = msg; $(el).classList.toggle('hidden', !msg); }
  const baseUrl = () => new URL('./', location.href).href;
  const prettyUrl = () => baseUrl().replace(/^https?:\/\//, '').replace(/\/$/, '');
  function info(t) { $('ctlInfo').textContent = t; }
  let primaryFn = null;
  function setPrimary(text, fn, disabled) { $('primary').textContent = text; primaryFn = fn; $('primary').disabled = !!disabled; }
  const stageNames = st => st.map(s => STAGE_NAME[s]).join(' → ');
  const catsOf = mix => Object.keys(CATS).filter(k => !(mix === 'erl' && k === 'islenskt'));
  const ERR = { of_fa_log: 'Of fá lög með ári og hljóði í lagabankanum fyrir þessa blöndu. Veldu aðra blöndu.', ogild_mynstur: 'Veldu a.m.k. eitt mynstur.' };

  // ---------- 1. Stillingar ----------
  function renderSetup() {
    $('patPick').innerHTML = STAGES.map(s => {
      const k = picked.indexOf(s);
      return `<button type="button" data-s="${s}" class="${k >= 0 ? 'on' : ''}" aria-pressed="${k >= 0}"><i>${k + 1}</i><div class="pat">${patHtml(s)}</div><b>${STAGE_NAME[s]}</b></button>`;
    }).join('');
    $('order').innerHTML = picked.length ? `Röð: <b>${stageNames(picked)}</b>` : 'Veldu a.m.k. eitt mynstur.';
    $('catlist').innerHTML = catsOf($('mix').value).map(k => `<span style="background:${CATS[k].color}">${CATS[k].name}</span>`).join('');
    $('lbInfo').innerHTML = picked.length ? `<b>${stageNames(picked)}</b> · ${catsOf($('mix').value).length} flokkar á hjólinu` : 'Veldu mynstur';
    $('createBtn').disabled = !picked.length;
  }
  $('patPick').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const s = b.dataset.s, k = picked.indexOf(s);
    if (k >= 0) picked.splice(k, 1); else picked.push(s);
    renderSetup();
  });
  $('mix').onchange = renderSetup;
  $('pin').value = store.get('pq_pin') || '';
  if (store.get('pq_hb_mix')) $('mix').value = store.get('pq_hb_mix');
  if (store.get('pq_hb_secs')) $('secs').value = String(store.get('pq_hb_secs'));
  renderSetup();

  $('createBtn').onclick = async () => {
    showErr('createErr', '');
    if (!picked.length) return showErr('createErr', ERR.ogild_mynstur);
    $('createBtn').disabled = true;
    try {
      const res = await rpc('hb_create', { p_pin: $('pin').value, p_title: $('title').value, p_mix: $('mix').value, p_secs: +$('secs').value, p_stages: picked });
      store.set('pq_pin', $('pin').value); store.set('pq_hb_mix', $('mix').value); store.set('pq_hb_secs', +$('secs').value);
      store.set('pq_hb_host', { game_id: res.game_id, host_token: res.host_token });
      await loadGame(res.game_id, res.host_token);
    } catch (e) { showErr('createErr', ERR[e.code] || (/of_fa_log/.test(e.message) ? ERR.of_fa_log : e.message)); }
    $('createBtn').disabled = !picked.length;
  };

  async function loadGame(gameId, token) {
    const d = await rpc('hb_host_get', { p_game: gameId, p_token: token });
    S.game = d.game; S.token = token; S.players = d.players; S.song = d.song;
    ['lobbyTitle', 'pTitle', 'cTitle', 'fTitle'].forEach(id => $(id).textContent = S.game.title);
    ['pCode', 'cCode'].forEach(id => $(id).textContent = `${prettyUrl()} · ${S.game.code}`);
    buildWheel();
    clearInterval(S.poll); S.poll = setInterval(poll, 1200);
    if (d.game.state === 'lobby') return enterLobby();
    if (d.game.state === 'finished') return showFinal();
    show('playing'); S.phase = 'playing';
    if (d.game.state === 'question') { renderQuestion(); startTimer(); setPrimary('Sýna svar', reveal); }
    else if (d.game.state === 'reveal') { renderReveal(); afterReveal(); }
  }

  (async () => {
    const saved = store.get('pq_hb_host'); if (!saved) return;
    try {
      const d = await rpc('hb_host_get', { p_game: saved.game_id, p_token: saved.host_token });
      if (!d.game || d.game.state === 'finished') { store.del('pq_hb_host'); return; }
      $('resumeCode').textContent = d.game.code; $('resumeBox').classList.remove('hidden');
      $('resumeBtn').onclick = () => loadGame(saved.game_id, saved.host_token).catch(e => toast(e.message));
      $('discardBtn').onclick = () => { store.del('pq_hb_host'); $('resumeBox').classList.add('hidden'); };
    } catch (e) { store.del('pq_hb_host'); }
  })();

  // ---------- 2. Biðsalur ----------
  function enterLobby() {
    S.phase = 'lobby'; show('lobby');
    const url = baseUrl() + 'arabingo.html?k=' + S.game.code;
    const qr = qrcode(0, 'M'); qr.addData(url); qr.make();
    $('qr').innerHTML = qr.createSvgTag({ cellSize: 8, margin: 2, scalable: true });
    $('joinUrl').textContent = prettyUrl(); $('code').textContent = S.game.code;
    $('lobbyInfo').textContent = 'Spilað um: ' + stageNames(S.game.stages);
    setPrimary('Byrja – snúa hjólinu', () => { show('playing'); S.phase = 'playing'; renderIdle(); spin(); }, S.players === 0);
    info('Bíð eftir þátttakendum…');
    refreshPlayers();
  }
  async function refreshPlayers() {
    const { data } = await client.from('hb_players').select('name').eq('game_id', S.game.id).order('joined_at', { ascending: false }).limit(300);
    if (!data) return;
    S.players = data.length;
    if (S.phase === 'lobby') {
      $('pcount').textContent = `${data.length} ${data.length === 1 ? 'þátttakandi' : 'þátttakendur'}`;
      $('chips').innerHTML = data.slice(0, 80).map(p => `<span>${esc(p.name)}</span>`).join('');
      $('primary').disabled = data.length === 0;
    }
  }
  let pollN = 0;
  async function poll() {
    if (S.phase === 'lobby' || pollN++ % 5 === 0) refreshPlayers();
    if (S.phase === 'playing' && S.game.state === 'question') {
      try {
        const s = await rpc('hb_status', { p_game: S.game.id, p_token: S.token });
        S.players = s.players;
        if ($('ansNum')) { $('ansNum').textContent = s.answered; $('ansTot').textContent = s.players; }
        if (s.players > 0 && s.answered >= s.players && Date.now() > S.deadline - (S.game.secs - 3) * 1000) reveal();
      } catch (e) {}
    }
  }

  // ---------- Hjólið ----------
  const cats = () => S.game.cats;
  const pt = (r, deg) => { const a = deg * Math.PI / 180; return [(r * Math.sin(a)).toFixed(2), (-r * Math.cos(a)).toFixed(2)]; };
  function buildWheel() {
    const list = cats(), n = list.length, seg = 360 / n, R = 488;
    let s = `<circle r="498" fill="#0b1f29"/>`;
    // Hver flokkur kemur tvisvar á hjólinu svo það líti út eins og alvöru lukkuhjól
    const all = list.concat(list), segAll = 360 / all.length;
    all.forEach((k, i) => {
      const c = i * segAll, a0 = c - segAll / 2, a1 = c + segAll / 2;
      const [x0, y0] = pt(R, a0), [x1, y1] = pt(R, a1);
      s += `<path d="M0 0 L${x0} ${y0} A${R} ${R} 0 0 1 ${x1} ${y1} Z" fill="${CATS[k].color}" stroke="rgba(255,255,255,.5)" stroke-width="3"/>`
        + `<text transform="rotate(${(c - 90).toFixed(2)})" x="300" text-anchor="middle" dominant-baseline="middle" font-size="${CATS[k].short.length > 7 ? 42 : 50}" font-weight="800" fill="#fff" font-family="Oswald, sans-serif">${CATS[k].short.toUpperCase()}</text>`;
    });
    s += `<circle r="492" fill="none" stroke="#fff" stroke-width="10"/>`;
    for (let k = 0; k < all.length * 3; k++) { const [x, y] = pt(492, k * segAll / 3); s += `<circle cx="${x}" cy="${y}" r="5" fill="#123647"/>`; }
    $('wheel').innerHTML = s;
    S.segAll = segAll; S.all = all;
    const w = $('wheel'); w.style.transition = 'none'; w.style.transform = `rotate(${S.rot}deg)`; void w.offsetWidth; w.style.transition = '';
  }
  let actx = null;
  function tick() {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime;
      o.type = 'square'; o.frequency.value = 1700;
      g.gain.setValueAtTime(.07, t); g.gain.exponentialRampToValueAtTime(.0001, t + .03);
      o.connect(g).connect(actx.destination); o.start(t); o.stop(t + .035);
    } catch (e) {}
  }
  function currentAngle() {
    const m = getComputedStyle($('wheel')).transform; if (!m || m === 'none') return 0;
    const v = m.match(/matrix\(([^)]+)\)/); if (!v) return 0;
    const [a, b] = v[1].split(',').map(Number); return Math.atan2(b, a) * 180 / Math.PI;
  }

  async function spin() {
    if (S.spinning) return;
    S.spinning = true; setPrimary('Hjólið snýst…', null, true); $('replay').classList.add('hidden');
    audio.pause();
    try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); actx.resume && actx.resume(); } catch (e) {}
    let r;
    try { r = await rpc('hb_spin', { p_game: S.game.id, p_token: S.token }); }
    catch (e) { S.spinning = false; toast(e.message); setPrimary('Snúa hjólinu', spin); return; }
    if (!r.ok) {
      S.spinning = false;
      if (r.reason === 'buid') { setPrimary('Ljúka leik', finish); info('Öll lögin hafa verið spiluð.'); }
      else setPrimary('Snúa hjólinu', spin);
      return;
    }
    Object.assign(S.game, { state: 'question', round_no: r.round_no, category: r.category, options: r.options, reveal: null });
    S.song = r.song;
    // Stöðva á öðru af tveimur hólfum flokksins
    const slots = S.all.map((k, i) => k === r.category ? i : -1).filter(i => i >= 0);
    const slot = slots[Math.floor(Math.random() * slots.length)];
    const target = -(slot * S.segAll) + (Math.random() - .5) * S.segAll * .6;
    const delta = ((target - S.rot) % 360 + 360) % 360;
    S.rot = S.rot + 360 * 5 + delta;
    const hub = $('hub'); hub.classList.remove('pop'); hub.textContent = '…';
    $('right').innerHTML = `<div class="q" style="opacity:.6">Hjólið snýst…</div>`;
    $('wheel').style.transform = `rotate(${S.rot}deg)`;
    let prev = currentAngle(), acc = 0, raf = 0;
    const loop = () => { const a = currentAngle(); let d = a - prev; if (d < -180) d += 360; if (d > 180) d -= 360; acc += d; prev = a; if (acc >= S.segAll / 3) { acc %= (S.segAll / 3); tick(); } raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    const prefetch = loadAudio(r.song);
    setTimeout(async () => {
      cancelAnimationFrame(raf); S.spinning = false;
      hub.textContent = CATS[r.category].name; hub.style.color = CATS[r.category].color;
      void hub.offsetWidth; hub.classList.add('pop');
      renderQuestion();
      const src = await prefetch;
      if (src) { audio.src = src; audio.currentTime = 0; audio.play().catch(() => toast('Ýttu á „Lagið aftur“ til að spila lagið.')); }
      $('replay').classList.remove('hidden');
      startTimer();
      setPrimary('Sýna svar', reveal);
      info(`Lag ${r.round_no} · bil = sýna svar`);
    }, SPIN_MS);
  }
  async function loadAudio(song) {
    try {
      if (!song || !song.deezer_id) { toast('Ekkert hljóð fannst fyrir lagið.'); return null; }
      return await PQDeezer.refreshPreview(song.deezer_id);
    } catch (e) { toast('Hljóð: ' + e.message); return null; }
  }
  $('replay').onclick = () => { if (audio.src) { audio.currentTime = 0; audio.play().catch(() => {}); } };

  // ---------- 3. Spurning og svar ----------
  function optsHtml(right) {
    const o = S.game.options || [];
    return `<div class="opts ${o.length === 2 ? 'two' : ''}">${o.map((t, i) =>
      `<div class="opt ${right == null ? '' : i === right ? 'opt-rett' : 'opt-rangt'}"><i>${LETTERS[i]}</i><span>${esc(t)}</span></div>`).join('')}</div>`;
  }
  function stageRow() {
    const st = S.game.stages[S.game.stage_idx];
    return `<div class="patrow"><div class="pat">${patHtml(st)}</div><span>Spilað um <b>${STAGE_NAME[st]}</b>${S.game.stages.length > 1 ? ` · ${S.game.stage_idx + 1} af ${S.game.stages.length}` : ''}</span></div>`;
  }
  function renderIdle() {
    $('right').innerHTML = `<div class="q">Snúðu hjólinu!</div>${stageRow()}`;
  }
  function renderQuestion() {
    const c = CATS[S.game.category];
    $('right').innerHTML = `<span class="cat" style="background:${c.color}">${c.name}</span>
      <h2 class="q">${c.q}</h2>
      <div class="qrow"><div class="timer" id="timer"><b id="timerNum"></b></div><div class="answered"><b id="ansNum">0</b> / <span id="ansTot">${S.players}</span><br>hafa svarað</div></div>
      ${optsHtml(null)}${stageRow()}`;
  }
  function startTimer() {
    clearInterval(S.timer);
    const secs = S.game.secs;
    S.deadline = Date.now() + secs * 1000;
    const t = () => {
      const left = Math.max(0, (S.deadline - Date.now()) / 1000);
      if ($('timerNum')) { $('timerNum').textContent = Math.ceil(left); $('timer').style.setProperty('--p', (left / secs) * 100 + '%'); }
      if (left <= 0) reveal();
    };
    t(); S.timer = setInterval(t, 200);
  }
  async function reveal() {
    if (S.revealing || S.game.state !== 'question') return;
    S.revealing = true; clearInterval(S.timer); setPrimary('…', null, true);
    try {
      const g = await rpc('hb_reveal', { p_game: S.game.id, p_token: S.token });
      Object.assign(S.game, g);
      renderReveal(); afterReveal();
    } catch (e) { toast(e.message); setPrimary('Sýna svar', reveal); }
    S.revealing = false;
  }
  function renderReveal() {
    const v = S.game.reveal || {}, c = CATS[v.category || S.game.category];
    $('hub').textContent = c.name; $('hub').style.color = c.color;
    $('right').innerHTML = `<span class="cat" style="background:${c.color}">${c.name}</span>
      <div class="songrow">${v.cover ? `<img src="${esc(v.cover)}" alt="">` : ''}<div><div class="t">${esc(v.title || '')}</div><div class="a">${esc(v.artist || '')}</div></div><div class="y">${v.year || ''}</div></div>
      ${optsHtml(v.answer_idx)}
      <div class="stat"><b>${v.correct || 0}</b> af ${v.answered || 0} svöruðu rétt${v.fastest ? ` · fljótust/fljótastur: <b>${esc(v.fastest)}</b>` : ''}</div>${stageRow()}`;
  }
  function afterReveal() {
    const nw = (S.game.reveal && S.game.reveal.new_winners) || [];
    if (S.game.stage_won && nw.length) {
      setPrimary('BINGÓ! Sýna spjöldin', () => showClaim(nw));
      info('BINGÓ!');
      setTimeout(() => { if (S.phase === 'playing' && S.game.stage_won) showClaim(nw); }, 3500);
    } else {
      setPrimary('Snúa hjólinu', spin);
      info('bil = snúa hjólinu');
    }
  }

  // ---------- 4. BINGÓ ----------
  function miniCard(c, stage) {
    const ok = c.marked, win = winCells(ok, stage);
    return `<div><div class="mini">${c.card.map((k, i) => k === 'free'
      ? `<div class="c free ${win.has(i) ? 'win' : ''}">FRÍTT</div>`
      : `<div class="c ${ok[i] ? 'ok' : ''} ${win.has(i) ? 'win' : ''}" style="--cc:${CATS[k].color}">${CATS[k].short}</div>`).join('')}</div>
      <div class="mini-name">${esc(c.name)}</div></div>`;
  }
  async function showClaim(nw) {
    if (S.phase === 'claim') return;
    S.phase = 'claim'; show('claimView');
    const stage = nw[0].stage, names = nw.map(x => x.name);
    $('claimWho').textContent = names.join(', ');
    $('claimWhat').textContent = `${STAGE_NAME[stage]} · eftir ${S.game.round_no} lög`;
    try {
      const cards = await rpc('hb_cards', { p_game: S.game.id, p_token: S.token, p_names: names.slice(0, 4) });
      $('claimCards').classList.toggle('multi', cards.length > 1);
      $('claimCards').innerHTML = cards.map(c => miniCard(c, stage)).join('');
    } catch (e) { toast(e.message); }
    const last = S.game.stage_idx + 1 >= S.game.stages.length;
    if (last) setPrimary('Sjá úrslit', () => next(true));
    else setPrimary(`Halda áfram – næst: ${STAGE_NAME[S.game.stages[S.game.stage_idx + 1]]}`, () => next(false));
    info('Til hamingju!');
  }
  async function next(fin) {
    try {
      const g = await rpc('hb_next', { p_game: S.game.id, p_token: S.token, p_finish: !!fin });
      Object.assign(S.game, g);
      if (g.state === 'finished') return showFinal();
      S.phase = 'playing'; show('playing'); renderIdle();
      setPrimary('Snúa hjólinu', spin); info(`Nú er spilað um: ${STAGE_NAME[g.stages[g.stage_idx]]}`);
    } catch (e) { toast(e.message); }
  }

  // ---------- 5. Lok ----------
  async function finish() { return next(true); }
  async function showFinal() {
    clearInterval(S.poll); clearInterval(S.timer); audio.pause();
    S.phase = 'finished'; show('final');
    const w = S.game.winners || [];
    const { data } = await client.from('hb_players').select('name,score').eq('game_id', S.game.id).order('score', { ascending: false }).limit(5);
    $('winners').innerHTML = (w.length ? w.map(x => `<div class="pop"><span>${STAGE_NAME[x.stage]} · ${x.round}. lag</span><span>${esc(x.name)}</span></div>`).join('')
      : '<div><span>Enginn fékk BINGÓ í þetta sinn</span><span></span></div>')
      + ((data && data.length) ? `<h3>Flest rétt svör</h3>` + data.map((p, i) => `<div><span>${i + 1}. ${esc(p.name)}</span><span>${p.score}</span></div>`).join('') : '');
    store.del('pq_hb_host');
    setPrimary('Nýr leikur', () => location.reload());
    $('replay').classList.add('hidden');
    info('Takk fyrir að spila!');
  }

  // ---------- Stjórnborð ----------
  $('primary').onclick = () => { if (primaryFn && !$('primary').disabled) primaryFn(); };
  $('fsBtn').onclick = () => { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen().catch(() => {}); };
  $('quitBtn').onclick = () => { if (confirm('Ljúka leiknum og sýna úrslit?')) finish(); };
  document.addEventListener('click', e => { const b = e.target.closest('button'); if (b) b.blur(); });
  document.addEventListener('keydown', e => {
    if (S.phase === 'setup' || /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
    if (e.code === 'Space' || e.key === 'Enter' || e.key === 'ArrowRight') { e.preventDefault(); $('primary').click(); }
  });
  window.__HB = S;
})();
