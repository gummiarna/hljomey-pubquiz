// Hljómey Pöbbkviss – stjórnandi og stór skjár
(function () {
  const { client, rpc, store, esc, SHAPES, cfg } = window.PQ;
  const $ = id => document.getElementById(id);

  const S = {
    pool: [], rounds: [],               // rounds: [{options, correct, meta}]
    game: null, token: null,            // game: {game_id, code, title, answer_seconds, total_rounds}
    round: 0, phase: 'setup',           // setup | lobby | question | reveal | leaderboard | finished
    players: 0, answered: 0,
    timer: null, poll: null, deadline: 0, revealing: false
  };
  const audio = new Audio();
  audio.preload = 'auto';
  let clipTimer = null;

  // ---------- Hjálparföll ----------
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.remove('hidden'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.add('hidden'), 5000); }
  function show(id) {
    ['setup', 'lobby', 'question', 'board', 'final'].forEach(s => $(s).classList.toggle('hidden', s !== id));
    $('ctl').classList.toggle('hidden', id === 'setup');
  }
  function showErr(el, msg) { $(el).textContent = msg; $(el).classList.toggle('hidden', !msg); }
  function joinUrl() { return new URL('./', location.href).href; }
  function prettyUrl() { return joinUrl().replace(/^https?:\/\//, '').replace(/\/$/, ''); }

  // ---------- 1. Stillingar ----------
  const HINTS = {
    search: 'Leitar í öllu Deezer-safninu. Dæmi: „íslenskt 80s“, „Eurovision“, artist:"Stuðmenn".',
    playlist: 'Besta leiðin til að stjórna þema: búðu til lagalista á deezer.com og límdu slóðina hér (deezer.com/playlist/…).',
    artists: 'Skrifaðu nöfn flytjenda aðskilin með kommu, t.d. Stuðmenn, Mugison, GDRN. Kerfið tekur vinsælustu lögin þeirra.',
    chart: 'Vinsælustu lögin á Deezer núna.'
  };
  function onKind() {
    const k = $('kind').value;
    $('valueWrap').classList.toggle('hidden', k === 'chart');
    $('genreWrap').classList.toggle('hidden', k !== 'chart');
    $('valueLabel').textContent = { search: 'Leitarorð', playlist: 'Slóð á lagalista', artists: 'Flytjendur' }[k] || '';
    $('value').placeholder = { search: 't.d. íslenskt 80s, jólalög, Eurovision', playlist: 'https://www.deezer.com/playlist/…', artists: 'Stuðmenn, Mugison, GDRN' }[k] || '';
    $('kindHint').textContent = HINTS[k];
  }
  $('kind').addEventListener('change', onKind); onKind();

  $('fetchBtn').onclick = async () => {
    showErr('setupErr', '');
    $('fetchBtn').disabled = true; $('poolInfo').textContent = 'Sæki lög…';
    try {
      const k = $('kind').value;
      S.pool = await PQDeezer.fetchPool(k, k === 'chart' ? $('genre').value : $('value').value);
      const artists = new Set(S.pool.map(t => t.artist.toLowerCase())).size;
      $('poolInfo').textContent = `Fann ${S.pool.length} lög frá ${artists} flytjendum með forskoðun.`;
      $('pickBtn').disabled = S.pool.length < 4;
      if (S.pool.length < 4) showErr('setupErr', 'Of fá lög fundust. Prófaðu víðara þema.');
      else pickRounds();
    } catch (e) { $('poolInfo').textContent = ''; showErr('setupErr', e.message); }
    $('fetchBtn').disabled = false;
  };
  $('value').addEventListener('keydown', e => { if (e.key === 'Enter') $('fetchBtn').click(); });

  const label = (t, mode) => mode === 'song' ? t.title : mode === 'artist' ? t.artist : `${t.title} – ${t.artist}`;
  const norm = s => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

  // Býr til eina umferð: rétt lag + 3 trúverðugir rangir valmöguleikar úr sama þema
  function makeRound(track, mode) {
    const right = label(track, mode);
    const used = new Set([norm(right)]);
    const wrong = [];
    for (const t of shuffle(S.pool)) {
      if (wrong.length === 3) break;
      if (t === track) continue;
      if (mode === 'song' && norm(t.title) === norm(track.title)) continue;
      const l = label(t, mode); const k = norm(l);
      if (used.has(k)) continue;
      used.add(k); wrong.push(l);
    }
    if (wrong.length < 3) return null;
    const correct = Math.floor(Math.random() * 4);
    const options = wrong.slice(); options.splice(correct, 0, right);
    const clip = +$('clip').value;
    const start = Math.floor(3 + Math.random() * Math.max(1, 30 - clip - 6));
    return { options, correct, meta: Object.assign({}, track, { start, clip }) };
  }

  function pickRounds() {
    showErr('setupErr', '');
    const mode = $('mode').value;
    const n = Math.max(3, Math.min(30, +$('rounds').value || 10));
    if (mode === 'artist' && new Set(S.pool.map(t => norm(t.artist))).size < 4) {
      return showErr('setupErr', 'Þarf a.m.k. 4 ólíka flytjendur til að spyrja um flytjanda. Veldu annað þema eða „Heiti lags“.');
    }
    const rounds = []; const seen = new Set();
    for (const t of shuffle(S.pool)) {
      if (rounds.length === n) break;
      const key = mode === 'artist' ? norm(t.artist) + norm(t.title) : norm(label(t, mode));
      if (seen.has(key)) continue;
      const r = makeRound(t, mode);
      if (r) { rounds.push(r); seen.add(key); }
    }
    if (rounds.length < n) toast(`Aðeins ${rounds.length} lög fundust sem henta. Leikurinn verður ${rounds.length} lög.`);
    S.rounds = rounds; renderTrackList();
  }
  $('pickBtn').onclick = pickRounds;
  ['mode', 'rounds', 'clip'].forEach(id => $(id).addEventListener('change', () => { if (S.pool.length >= 4) pickRounds(); }));

  function renderTrackList() {
    $('roundsPanel').classList.toggle('hidden', !S.rounds.length);
    $('trackList').innerHTML = S.rounds.map((r, i) => `
      <li><span class="n">${i + 1}</span><img src="${esc(r.meta.cover)}" alt="">
        <div class="t"><b>${esc(r.meta.title)}</b><small class="muted">${esc(r.meta.artist)}</small></div>
        <button class="btn ghost small" data-play="${i}">▶</button>
        <button class="btn ghost small" data-swap="${i}">Skipta</button></li>`).join('');
  }
  $('trackList').addEventListener('click', async e => {
    const p = e.target.closest('[data-play]'), s = e.target.closest('[data-swap]');
    if (p) { const r = S.rounds[+p.dataset.play]; try { await playClip(r.meta, r.meta.clip); } catch (err) { toast(err.message); } }
    if (s) {
      const i = +s.dataset.swap; const mode = $('mode').value;
      const inUse = new Set(S.rounds.map(r => r.meta.deezer_id));
      const cand = shuffle(S.pool).find(t => !inUse.has(t.deezer_id));
      if (!cand) return toast('Engin fleiri lög í þemanu.');
      const r = makeRound(cand, mode); if (r) { S.rounds[i] = r; renderTrackList(); }
    }
  });

  try { $('pin').value = store.get('pq_pin') || ''; } catch (e) {}

  $('createBtn').onclick = async () => {
    showErr('createErr', '');
    if (!S.rounds.length) return showErr('createErr', 'Veldu lög fyrst.');
    $('createBtn').disabled = true;
    try {
      const secs = +$('secs').value;
      const res = await rpc('create_game', {
        p_pin: $('pin').value, p_title: $('title').value, p_answer_seconds: secs,
        p_rounds: S.rounds, p_event_tag: cfg.EVENT_TAG || null
      });
      store.set('pq_pin', $('pin').value);
      S.game = { game_id: res.game_id, code: res.code, title: $('title').value || 'Hljómey Pöbbkviss', answer_seconds: secs, total_rounds: S.rounds.length };
      S.token = res.host_token;
      store.set('pq_host', { game_id: res.game_id, host_token: res.host_token });
      enterLobby();
    } catch (e) { showErr('createErr', e.message); }
    $('createBtn').disabled = false;
  };

  // ---------- Halda áfram eftir endurhleðslu ----------
  async function checkResume() {
    const saved = store.get('pq_host'); if (!saved) return;
    try {
      const d = await rpc('host_get_game', { p_game_id: saved.game_id, p_host_token: saved.host_token });
      if (!d || !d.game || d.game.state === 'finished') { store.del('pq_host'); return; }
      $('resumeCode').textContent = d.game.code;
      $('resumeBox').classList.remove('hidden');
      $('resumeBtn').onclick = () => {
        const g = d.game;
        S.game = { game_id: g.id, code: g.code, title: g.title, answer_seconds: g.answer_seconds, total_rounds: g.total_rounds };
        S.token = saved.host_token;
        S.rounds = d.rounds.map(r => ({ options: r.options, correct: r.correct, meta: r.meta }));
        S.round = g.current_round;
        if (g.state === 'lobby') return enterLobby();
        // Umferð í gangi eða búin: sýna stigatöflu og halda áfram þaðan
        if (g.state === 'question') { S.phase = 'question'; return doReveal(); }
        showBoard();
      };
      $('discardBtn').onclick = () => { store.del('pq_host'); $('resumeBox').classList.add('hidden'); };
    } catch (e) { store.del('pq_host'); }
  }

  // ---------- 2. Biðsalur ----------
  function setHeads() {
    ['lobbyTitle', 'qTitle', 'bTitle', 'fTitle'].forEach(id => $(id).textContent = S.game.title);
    ['qCode', 'bCode'].forEach(id => $(id).textContent = `${prettyUrl()} · ${S.game.code}`);
  }
  function enterLobby() {
    S.phase = 'lobby'; setHeads(); show('lobby');
    const url = joinUrl() + '?k=' + S.game.code;
    const qr = qrcode(0, 'M'); qr.addData(url); qr.make();
    $('qr').innerHTML = qr.createSvgTag({ cellSize: 8, margin: 2, scalable: true });
    $('joinUrl').textContent = prettyUrl();
    $('code').textContent = S.game.code;
    $('lobbyRounds').textContent = `${S.game.total_rounds} lög`;
    setPrimary('Byrja leik', () => startRound(1));
    $('replayBtn').classList.add('hidden');
    info('Bíð eftir þátttakendum…');
    clearInterval(S.poll); refreshLobby(); S.poll = setInterval(refreshLobby, 2000);
  }
  async function refreshLobby() {
    const { data, error } = await client.from('players').select('name').eq('game_id', S.game.game_id).order('joined_at', { ascending: false }).limit(300);
    if (error) return;
    S.players = data.length;
    $('pcount').textContent = `${data.length} ${data.length === 1 ? 'þátttakandi' : 'þátttakendur'}`;
    $('chips').innerHTML = data.slice(0, 80).map(p => `<span>${esc(p.name)}</span>`).join('');
    $('primary').disabled = data.length === 0;
  }

  // ---------- Hljóð ----------
  function waitAudio(ms) {
    return new Promise((res, rej) => {
      if (audio.readyState >= 1) return res();
      const ok = () => { off(); res(); }, bad = () => { off(); rej(new Error('Hljóð náðist ekki')); };
      const t = setTimeout(bad, ms);
      function off() { clearTimeout(t); audio.removeEventListener('loadedmetadata', ok); audio.removeEventListener('error', bad); }
      audio.addEventListener('loadedmetadata', ok); audio.addEventListener('error', bad);
    });
  }
  async function loadTrack(meta) {
    if (audio.dataset.id === String(meta.deezer_id) && audio.readyState >= 1 && !audio.error) return;
    audio.dataset.id = String(meta.deezer_id);
    audio.src = meta.preview; audio.load();
    try { await waitAudio(8000); }
    catch (e) {   // forskoðunarslóðir renna út: sækja nýja
      meta.preview = await PQDeezer.refreshPreview(meta.deezer_id);
      audio.src = meta.preview; audio.load(); await waitAudio(8000);
    }
  }
  async function playClip(meta, seconds) {
    clearTimeout(clipTimer);
    await loadTrack(meta);
    audio.currentTime = meta.start || 0; audio.volume = 1;
    await audio.play();
    $('wave').classList.add('on');
    if (seconds) clipTimer = setTimeout(() => { audio.pause(); $('wave').classList.remove('on'); }, seconds * 1000);
  }
  function stopAudio() { clearTimeout(clipTimer); audio.pause(); $('wave').classList.remove('on'); }

  // ---------- 3. Umferð ----------
  function renderOpts(r, counts) {
    const total = counts ? Math.max(1, counts.reduce((a, b) => a + b, 0)) : 1;
    $('opts').innerHTML = r.options.map((o, i) => `
      <div class="opt opt${i} ${counts && i === r.correct ? 'right' : ''}">
        <span class="sh">${SHAPES[i]}</span><span class="lbl">${esc(o)}</span>
        ${counts ? `<span class="cnt">${counts[i]}</span><span class="bar" style="width:${(counts[i] / total) * 100}%"></span>` : ''}
      </div>`).join('');
    $('opts').classList.toggle('revealed', !!counts);
  }

  async function startRound(n) {
    clearInterval(S.poll); clearInterval(S.timer); stopAudio();
    const r = S.rounds[n - 1]; S.round = n; S.revealing = false;
    $('primary').disabled = true; info('Hleð lagi…');
    try { await loadTrack(r.meta); } catch (e) { toast('Náði ekki í lagið. Sleppi því.'); }
    try {
      await rpc('host_start_round', { p_game_id: S.game.game_id, p_host_token: S.token, p_round: n });
    } catch (e) { toast(e.message); $('primary').disabled = false; return; }

    S.phase = 'question'; show('question');
    $('qNo').textContent = `Lag ${n} af ${S.game.total_rounds}`;
    $('songBox').classList.add('hidden'); $('qmid').classList.remove('hidden');
    renderOpts(r, null);
    S.answered = 0; $('ansNum').textContent = '0'; $('ansTot').textContent = S.players;
    playClip(r.meta, r.meta.clip || 5).catch(e => toast('Hljóð: ' + e.message));
    $('replayBtn').classList.remove('hidden');

    const secs = S.game.answer_seconds;
    S.deadline = Date.now() + secs * 1000;
    const tick = () => {
      const left = Math.max(0, (S.deadline - Date.now()) / 1000);
      $('timerNum').textContent = Math.ceil(left);
      $('timer').style.setProperty('--p', (left / secs) * 100 + '%');
      if (left <= 0) doReveal();
    };
    tick(); S.timer = setInterval(tick, 200);
    setPrimary('Sýna svar', doReveal); $('primary').disabled = false;
    info(`Lag ${n}/${S.game.total_rounds} · bil = sýna svar`);
    S.poll = setInterval(pollStatus, 1000);
  }

  async function pollStatus() {
    try {
      const s = await rpc('host_round_status', { p_game_id: S.game.game_id, p_host_token: S.token });
      S.players = s.players; S.answered = s.answered;
      $('ansNum').textContent = s.answered; $('ansTot').textContent = s.players;
      if (S.phase === 'question' && s.players > 0 && s.answered >= s.players) doReveal();
    } catch (e) { /* reynir aftur næst */ }
  }

  async function doReveal() {
    if (S.phase !== 'question' || S.revealing) return;
    S.revealing = true;
    clearInterval(S.timer); clearInterval(S.poll);
    let res;
    try { res = await rpc('host_reveal', { p_game_id: S.game.game_id, p_host_token: S.token }); }
    catch (e) { toast(e.message); S.revealing = false; return; }
    S.phase = 'reveal'; show('question');
    const r = S.rounds[S.round - 1];
    $('qNo').textContent = `Lag ${S.round} af ${S.game.total_rounds}`;
    renderOpts(r, res.counts || [0, 0, 0, 0]);
    $('qmid').classList.add('hidden'); $('songBox').classList.remove('hidden');
    $('cover').src = r.meta.cover || ''; $('songTitle').textContent = r.meta.title; $('songArtist').textContent = r.meta.artist;
    $('firstBox').innerHTML = res.first
      ? `Fyrst/ur með rétt svar: <b>${esc(res.first)}</b> (${(res.first_ms / 1000).toFixed(1).replace('.', ',')} sek) · +200 bónus`
      : 'Enginn var með rétt svar!';
    $('songBox').classList.add('pop');
    // Lagið fær að hljóma áfram á meðan svarið er sýnt
    playClip(r.meta, 0).catch(() => {});
    setPrimary('Stigatafla', showBoard);
    info('bil = stigatafla');
  }

  // ---------- 4. Stigatafla ----------
  async function showBoard() {
    await rpc('host_set_state', { p_game_id: S.game.game_id, p_host_token: S.token, p_state: 'leaderboard' }).catch(e => toast(e.message));
    S.phase = 'leaderboard'; show('board'); setHeads();
    const { data } = await client.from('players').select('name,score').eq('game_id', S.game.game_id)
      .order('score', { ascending: false }).order('joined_at', { ascending: true }).limit(10);
    const top = (data && data[0] && data[0].score) || 1;
    $('boardList').innerHTML = `<h1>Staðan eftir ${S.round} ${S.round === 1 ? 'lag' : 'lög'}</h1>` +
      (data || []).map((p, i) => `<div class="brow pop" style="animation-delay:${i * 60}ms">
        <span class="fill" style="width:${(p.score / top) * 100}%"></span>
        <span class="r">${i + 1}.</span><span>${esc(p.name)}</span><span class="s">${p.score.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}</span></div>`).join('');
    const last = S.round >= S.game.total_rounds;
    if (last) { setPrimary('Úrslit', showFinal); info('Síðasta lag búið · bil = úrslit'); }
    else {
      setPrimary('Næsta lag', () => startRound(S.round + 1));
      info(`bil = næsta lag (${S.round + 1}/${S.game.total_rounds})`);
      loadTrack(S.rounds[S.round].meta).catch(() => {});   // forhlaða næsta lag
    }
  }

  // ---------- 5. Úrslit ----------
  async function showFinal() {
    stopAudio();
    await rpc('host_set_state', { p_game_id: S.game.game_id, p_host_token: S.token, p_state: 'finished' }).catch(e => toast(e.message));
    S.phase = 'finished'; show('final'); setHeads();
    const { data } = await client.from('players').select('name,score').eq('game_id', S.game.game_id)
      .order('score', { ascending: false }).order('joined_at', { ascending: true }).limit(3);
    const order = [1, 0, 2];   // 2. – 1. – 3.
    $('podium').innerHTML = order.filter(i => data && data[i]).map(i => `
      <div class="pod p${i + 1} pop" style="animation-delay:${(2 - i) * 400}ms">
        <div class="name">${esc(data[i].name)}</div><div class="pts">${data[i].score.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')} stig</div>
        <div class="block">${i + 1}</div></div>`).join('');
    store.del('pq_host');
    setPrimary('Nýr leikur', () => location.reload());
    $('replayBtn').classList.add('hidden');
    info('Takk fyrir að spila!');
  }

  // ---------- Stjórnborð ----------
  let primaryFn = null;
  function setPrimary(text, fn) { $('primary').textContent = text; primaryFn = fn; $('primary').disabled = false; }
  function info(t) { $('ctlInfo').textContent = t; }
  $('primary').onclick = () => { if (primaryFn && !$('primary').disabled) primaryFn(); };
  $('replayBtn').onclick = () => { const r = S.rounds[S.round - 1]; if (r) playClip(r.meta, S.phase === 'question' ? (r.meta.clip || 5) : 0).catch(e => toast(e.message)); };
  $('fsBtn').onclick = () => { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen().catch(() => {}); };
  $('quitBtn').onclick = () => { if (confirm('Hætta í leiknum og sýna úrslit?')) showFinal(); };
  // Tekur fókus af hnöppum svo bilstöng smelli ekki tvisvar
  document.addEventListener('click', e => { const b = e.target.closest('button'); if (b) b.blur(); });
  document.addEventListener('keydown', e => {
    if (S.phase === 'setup' || /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
    if (e.code === 'Space' || e.key === 'Enter' || e.key === 'ArrowRight') { e.preventDefault(); $('primary').click(); }
  });

  if (!cfg.SUPABASE_URL || cfg.SUPABASE_URL.includes('XXXX')) {
    showErr('setupErr', 'Vantar Supabase-stillingar í config.js (sjá leiðbeiningar).');
  }
  checkResume();
  window.__PQ_HOST = S;   // fyrir prófanir
})();
