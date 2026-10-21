// Hljómey Bingó (tölur 1–75) – stjórnandi og stór skjár með lukkuhjóli
(function () {
  const { client, rpc, store, esc } = window.PQ;
  const { LETTERS, COLORS, ORDER, NAME, letterOf, label, winCells, patHtml } = window.TB;
  const $ = id => document.getElementById(id);
  const SEG = 360 / 75;

  const S = { game: null, token: null, called: [], phase: 'setup', players: 0, spinning: false, rot: 0, sound: true, lastClaimKey: '', poll: null, pendingClaim: null };
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
  const stageNames = st => st.map(s => NAME[s]).join(' → ');

  // ---------- 1. Stillingar ----------
  function renderPick() {
    $('patPick').innerHTML = ORDER.map(s => {
      const k = picked.indexOf(s);
      return `<button type="button" data-s="${s}" class="${k >= 0 ? 'on' : ''}" aria-pressed="${k >= 0}"><i>${k + 1}</i><div class="pat">${patHtml(s)}</div><b>${NAME[s]}</b></button>`;
    }).join('');
    $('order').innerHTML = picked.length ? `Röð: <b>${stageNames(picked)}</b>` : 'Veldu a.m.k. eitt mynstur.';
    $('lbInfo').innerHTML = picked.length ? `<b>${picked.length} ${picked.length === 1 ? 'umferð' : 'umferðir'}</b> · ${stageNames(picked)}` : 'Veldu mynstur';
    $('createBtn').disabled = !picked.length;
  }
  $('patPick').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const s = b.dataset.s, k = picked.indexOf(s);
    if (k >= 0) picked.splice(k, 1); else picked.push(s);
    renderPick();
  });
  renderPick();
  $('pin').value = store.get('pq_pin') || '';
  $('sound').value = store.get('pq_tb_sound') === false ? '0' : '1';

  $('createBtn').onclick = async () => {
    showErr('createErr', '');
    if (!picked.length) return showErr('createErr', 'Veldu a.m.k. eitt vinningsmynstur.');
    $('createBtn').disabled = true;
    try {
      const res = await rpc('tb_create', { p_pin: $('pin').value, p_title: $('title').value, p_stages: picked });
      store.set('pq_pin', $('pin').value);
      store.set('pq_tb_sound', $('sound').value === '1');
      store.set('pq_tb_host', { game_id: res.game_id, host_token: res.host_token });
      await loadGame(res.game_id, res.host_token);
    } catch (e) { showErr('createErr', e.message); }
    $('createBtn').disabled = !picked.length;
  };

  async function loadGame(gameId, token) {
    const d = await rpc('tb_host_get', { p_game_id: gameId, p_host_token: token });
    S.game = d.game; S.token = token; S.called = (d.game.called || []).slice();
    S.sound = store.get('pq_tb_sound') !== false;
    S.players = (d.players || []).length;
    ['lobbyTitle', 'pTitle', 'cTitle', 'fTitle'].forEach(id => $(id).textContent = S.game.title);
    ['pCode', 'cCode'].forEach(id => $(id).textContent = `${prettyUrl()} · ${S.game.code}`);
    buildWheel();
    clearInterval(S.poll); S.poll = setInterval(pollGame, 1200);
    if (d.game.state === 'lobby') return enterLobby();
    if (d.game.state === 'claim') return showClaim(d.game);
    if (d.game.state === 'finished') return showFinal(d.game);
    enterPlaying();
  }

  // Halda áfram eftir endurhleðslu
  (async () => {
    const saved = store.get('pq_tb_host'); if (!saved) return;
    try {
      const d = await rpc('tb_host_get', { p_game_id: saved.game_id, p_host_token: saved.host_token });
      if (!d.game || d.game.state === 'finished') { store.del('pq_tb_host'); return; }
      $('resumeCode').textContent = d.game.code; $('resumeBox').classList.remove('hidden');
      $('resumeBtn').onclick = () => loadGame(saved.game_id, saved.host_token).catch(e => toast(e.message));
      $('discardBtn').onclick = () => { store.del('pq_tb_host'); $('resumeBox').classList.add('hidden'); };
    } catch (e) { store.del('pq_tb_host'); }
  })();

  // ---------- 2. Biðsalur ----------
  function enterLobby() {
    S.phase = 'lobby'; show('lobby');
    const url = baseUrl() + 'talnabingo.html?k=' + S.game.code;
    const qr = qrcode(0, 'M'); qr.addData(url); qr.make();
    $('qr').innerHTML = qr.createSvgTag({ cellSize: 8, margin: 2, scalable: true });
    $('joinUrl').textContent = prettyUrl(); $('code').textContent = S.game.code;
    $('lobbyInfo').textContent = 'Spilað um: ' + stageNames(S.game.stages);
    setPrimary('Byrja – snúa hjólinu', () => { enterPlaying(); spin(); }, S.players === 0);
    info('Bíð eftir þátttakendum…');
    refreshPlayers();
  }
  async function refreshPlayers() {
    const { data } = await client.from('tb_players').select('name').eq('game_id', S.game.id).order('joined_at', { ascending: false }).limit(300);
    if (!data) return;
    S.players = data.length;
    if (S.phase === 'lobby') {
      $('pcount').textContent = `${data.length} ${data.length === 1 ? 'þátttakandi' : 'þátttakendur'}`;
      $('chips').innerHTML = data.slice(0, 80).map(p => `<span>${esc(p.name)}</span>`).join('');
      $('primary').disabled = data.length === 0;
    }
  }

  // Fylgist með BINGÓ-köllum úr símunum
  let pollN = 0;
  async function pollGame() {
    if (S.phase === 'lobby' || pollN++ % 4 === 0) refreshPlayers();
    const { data } = await client.from('tb_games').select('state,stage_idx,claim,winners').eq('id', S.game.id).limit(1);
    const g = data && data[0]; if (!g) return;
    Object.assign(S.game, g);
    if (g.state === 'claim') {
      const key = JSON.stringify(g.claim);
      if (S.phase !== 'claim' || key !== S.lastClaimKey) {
        if (S.spinning) S.pendingClaim = g;   // klára snúninginn fyrst
        else showClaim(g);
      }
    }
  }

  // ---------- Hjólið ----------
  const pt = (r, deg) => { const a = deg * Math.PI / 180; return [(r * Math.sin(a)).toFixed(2), (-r * Math.cos(a)).toFixed(2)]; };
  function buildWheel() {
    const R = 488;
    let s = `<circle r="498" fill="#0b1f29"/>`;
    for (let n = 1; n <= 75; n++) {
      const c = (n - 1) * SEG, a0 = c - SEG / 2, a1 = c + SEG / 2;
      const [x0, y0] = pt(R, a0), [x1, y1] = pt(R, a1);
      const L = letterOf(n);
      s += `<g class="seg" data-n="${n}"><path d="M0 0 L${x0} ${y0} A${R} ${R} 0 0 1 ${x1} ${y1} Z" fill="${COLORS[L]}" fill-opacity="${n % 2 ? 1 : .8}" stroke="rgba(255,255,255,.35)" stroke-width="1.5"/>`
        + `<text transform="rotate(${c.toFixed(2)})" y="-430" text-anchor="middle" dominant-baseline="middle" font-size="24" font-weight="800" fill="#fff" font-family="Oswald, sans-serif">${n}</text></g>`;
    }
    // Bókstafir á innri hring
    LETTERS.forEach((L, i) => {
      const c = (i * 15 + 7) * SEG;
      s += `<text transform="rotate(${c.toFixed(2)})" y="-330" text-anchor="middle" dominant-baseline="middle" font-size="64" font-weight="900" fill="rgba(255,255,255,.92)" font-family="Oswald, sans-serif">${L}</text>`;
    });
    s += `<circle r="492" fill="none" stroke="#fff" stroke-width="10"/>`;
    for (let k = 0; k < 75; k++) { const [x, y] = pt(492, k * SEG + SEG / 2); s += `<circle cx="${x}" cy="${y}" r="4" fill="#123647"/>`; }
    $('wheel').innerHTML = s;
    // Hjólið stendur á síðustu tölu
    const last = S.called[S.called.length - 1];
    S.rot = last ? -((last - 1) * SEG) : 0;
    const w = $('wheel'); w.style.transition = 'none'; w.style.transform = `rotate(${S.rot}deg)`; void w.offsetWidth; w.style.transition = '';
    markDone();
  }
  function markDone() {
    const set = new Set(S.called);
    document.querySelectorAll('#wheel .seg').forEach(g => g.classList.toggle('done', set.has(+g.dataset.n)));
  }

  // Smellir í hjólinu (WebAudio)
  let actx = null;
  function tick() {
    if (!S.sound) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime;
      o.type = 'square'; o.frequency.value = 1800;
      g.gain.setValueAtTime(.08, t); g.gain.exponentialRampToValueAtTime(.0001, t + .03);
      o.connect(g).connect(actx.destination); o.start(t); o.stop(t + .035);
    } catch (e) {}
  }
  function ding() {
    if (!S.sound || !actx) return;
    try {
      const t = actx.currentTime;
      [880, 1320].forEach((f, i) => {
        const o = actx.createOscillator(), g = actx.createGain();
        o.type = 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0, t + i * .12); g.gain.linearRampToValueAtTime(.18, t + i * .12 + .02); g.gain.exponentialRampToValueAtTime(.0001, t + i * .12 + .6);
        o.connect(g).connect(actx.destination); o.start(t + i * .12); o.stop(t + i * .12 + .65);
      });
    } catch (e) {}
  }
  function currentAngle() {
    const m = getComputedStyle($('wheel')).transform;
    if (!m || m === 'none') return 0;
    const v = m.match(/matrix\(([^)]+)\)/); if (!v) return 0;
    const [a, b] = v[1].split(',').map(Number);
    return Math.atan2(b, a) * 180 / Math.PI;
  }

  async function spin() {
    if (S.spinning || S.phase !== 'playing') return;
    S.spinning = true; setPrimary('Hjólið snýst…', null, true);
    try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); actx.resume && actx.resume(); } catch (e) {}
    let r;
    try { r = await rpc('tb_spin', { p_game_id: S.game.id, p_host_token: S.token }); }
    catch (e) { S.spinning = false; toast(e.message); setPrimary('Snúa', spin); return; }
    if (!r.ok) {
      S.spinning = false;
      if (r.reason === 'buid') { setPrimary('Ljúka leik', finish); info('Allar 75 tölurnar eru komnar.'); }
      else if (r.reason === 'claim') pollGame();
      else setPrimary('Snúa', spin);
      return;
    }
    const n = r.number, target = -((n - 1) * SEG) + (Math.random() - .5) * SEG * .6;
    const delta = ((target - S.rot) % 360 + 360) % 360;
    S.rot = S.rot + 360 * 6 + delta;
    const hub = $('hub'); hub.classList.remove('pop'); hub.innerHTML = '<div class="q">…</div>';
    const w = $('wheel'); w.style.transform = `rotate(${S.rot}deg)`;
    // Smellir í hvert sinn sem hjólið fer yfir hólf
    let prev = currentAngle(), acc = 0, raf = 0;
    const loop = () => { const a = currentAngle(); let d = a - prev; if (d < -180) d += 360; if (d > 180) d -= 360; acc += d; prev = a; if (acc >= SEG) { acc %= SEG; tick(); } raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    let done = false;
    const end = () => {
      if (done) return; done = true; cancelAnimationFrame(raf);
      S.called.push(n); S.spinning = false;
      hub.innerHTML = `<div class="l" style="color:${COLORS[letterOf(n)]}">${letterOf(n)}</div><div class="n">${n}</div>`;
      void hub.offsetWidth; hub.classList.add('pop');
      ding(); markDone(); renderPlaying();
      if (S.pendingClaim) { const g = S.pendingClaim; S.pendingClaim = null; return showClaim(g); }
      setPrimary('Snúa', spin);
      info('bil = snúa hjólinu');
    };
    w.addEventListener('transitionend', end, { once: true });
    setTimeout(end, 5800);
  }

  // ---------- 3. Spilun ----------
  function enterPlaying() {
    S.phase = 'playing'; show('playing');
    renderPlaying();
    const last = S.called[S.called.length - 1];
    $('hub').innerHTML = last ? `<div class="l" style="color:${COLORS[letterOf(last)]}">${letterOf(last)}</div><div class="n">${last}</div>` : '<div class="q">Ýttu á<br>Snúa</div>';
    if (!S.spinning) setPrimary('Snúa', spin);
    info('bil = snúa hjólinu');
  }
  function renderPlaying() {
    const st = S.game.stages, si = S.game.stage_idx, cur = st[si];
    $('curPat').innerHTML = patHtml(cur);
    $('curPatName').textContent = NAME[cur];
    $('curPatSub').textContent = cur === 'line' ? 'Lárétt, lóðrétt eða á ská' : '';
    $('stages').innerHTML = st.length > 1 ? st.map((s, i) => `<span class="${i < si ? 'done' : i === si ? 'cur' : ''}">${NAME[s]}</span>`).join('') : '';
    const set = new Set(S.called), last = S.called[S.called.length - 1];
    $('cnt').textContent = S.called.length;
    $('bigNo').innerHTML = last ? `<span style="color:${COLORS[letterOf(last)]}">${label(last)}</span>` : '–';
    $('recent').innerHTML = S.called.slice(-7, -1).reverse().map(x => `<div class="ball" style="background:${COLORS[letterOf(x)]}">${x}</div>`).join('');
    let b = '';
    LETTERS.forEach((L, row) => {
      b += `<div class="lt" style="background:${COLORS[L]}">${L}</div>`;
      for (let k = 1; k <= 15; k++) {
        const n = row * 15 + k, on = set.has(n);
        b += `<div class="nm ${on ? 'on' : ''} ${n === last ? 'last' : ''}" ${on ? `style="background:${COLORS[L]}"` : ''}>${n}</div>`;
      }
    });
    $('board').innerHTML = b;
  }

  // ---------- 4. BINGÓ ----------
  function miniCard(c, stage) {
    const win = winCells(c.ok, stage);
    return `<div><div class="mini">${LETTERS.map(L => `<div class="hd" style="background:${COLORS[L]}">${L}</div>`).join('')}${c.card.map((n, i) => n === 0
      ? `<div class="c free ${win.has(i) ? 'win' : ''}">FRÍTT</div>`
      : `<div class="c ${c.ok[i] ? 'ok' : ''} ${win.has(i) ? 'win' : ''}">${n}</div>`).join('')}</div>
      <div class="mini-name">${esc(c.name)}</div></div>`;
  }
  async function showClaim(g) {
    S.lastClaimKey = JSON.stringify(g.claim);
    const first = S.phase !== 'claim';
    S.phase = 'claim'; show('claimView');
    const names = (g.claim && g.claim.names) || [];
    const stage = g.claim && g.claim.stage;
    $('claimWho').textContent = names.join(', ');
    $('claimWhat').textContent = `${NAME[stage] || ''} · eftir ${g.claim ? g.claim.at : S.called.length} tölur`;
    try {
      const cards = await rpc('tb_claim_cards', { p_game_id: S.game.id, p_host_token: S.token });
      $('claimCards').classList.toggle('multi', cards.length > 1);
      $('claimCards').innerHTML = cards.slice(0, 4).map(c => miniCard(c, stage)).join('');
    } catch (e) { toast(e.message); }
    const last = S.game.stage_idx + 1 >= S.game.stages.length;
    if (last) setPrimary('Ljúka leik', finish);
    else setPrimary(`Halda áfram – næst: ${NAME[S.game.stages[S.game.stage_idx + 1]]}`, doContinue);
    info(first ? 'BINGÓ staðfest! Aðrir sem kalla núna fá líka vinning.' : 'Fleiri með BINGÓ!');
    if (first) ding();
  }
  async function doContinue() {
    try {
      const g = await rpc('tb_host_continue', { p_game_id: S.game.id, p_host_token: S.token, p_finish: false });
      Object.assign(S.game, g);
      if (g.state === 'finished') return showFinal(g);
      enterPlaying();
      info(`Nú er spilað um: ${NAME[g.stages[g.stage_idx]]} · bil = snúa`);
    } catch (e) { toast(e.message); }
  }

  // ---------- 5. Lok ----------
  async function finish() {
    try { const g = await rpc('tb_host_continue', { p_game_id: S.game.id, p_host_token: S.token, p_finish: true }); showFinal(g); }
    catch (e) { toast(e.message); }
  }
  function showFinal(g) {
    clearInterval(S.poll);
    S.phase = 'finished'; show('final');
    const w = g.winners || [];
    $('winners').innerHTML = w.length
      ? w.map(x => `<div class="pop"><span>${NAME[x.stage]} · ${x.at}. tala</span><span>${esc(x.name)}</span></div>`).join('')
      : '<div><span>Enginn fékk BINGÓ í þetta sinn</span><span></span></div>';
    store.del('pq_tb_host');
    setPrimary('Nýtt bingó', () => location.reload());
    info('Takk fyrir að spila!');
  }

  // ---------- Stjórnborð ----------
  $('primary').onclick = () => { if (primaryFn && !$('primary').disabled) primaryFn(); };
  $('fsBtn').onclick = () => { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen().catch(() => {}); };
  $('quitBtn').onclick = () => { if (confirm('Ljúka bingóinu og sýna vinningshafa?')) finish(); };
  document.addEventListener('click', e => { const b = e.target.closest('button'); if (b) b.blur(); });
  document.addEventListener('keydown', e => {
    if (S.phase === 'setup' || /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
    if (e.code === 'Space' || e.key === 'Enter' || e.key === 'ArrowRight') { e.preventDefault(); $('primary').click(); }
  });
  window.__TB = S;
})();
