// Hljómey Pöbbkviss – stjórnandi og stór skjár
(function () {
  const { client, rpc, store, esc, SHAPES, cfg } = window.PQ;
  const $ = id => document.getElementById(id);

  const S = {
    type: 'music',                      // music | questions | mixed
    pool: [], rounds: [],               // rounds: [{options, correct, meta}] – meta.type === 'q' fyrir spurningar
    bank: null, qcats: new Set(),       // spurningabankinn (qb_list) og valdir flokkar
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

  // ---------- Tegund leiks ----------
  const isQ = r => r && r.meta && r.meta.type === 'q';
  const needsMusic = () => S.type !== 'questions';
  const needsQ = () => S.type !== 'music';
  let secsTouched = false;
  $('secs').addEventListener('change', () => { secsTouched = true; });

  function setType(t, init) {
    S.type = ['music', 'questions', 'mixed'].includes(t) ? t : 'music';
    store.set('pq_gtype', S.type);
    document.querySelector('.setup-wrap').dataset.t = S.type;
    document.querySelectorAll('#gtype button').forEach(b => { const on = b.dataset.t === S.type; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
    $('themePanel').classList.toggle('hidden', !needsMusic());
    $('qPanel').classList.toggle('hidden', !needsQ());
    $('pickBtn').textContent = { music: 'Velja lög af handahófi', questions: 'Velja spurningar af handahófi', mixed: 'Velja af handahófi' }[S.type];
    if (!secsTouched) $('secs').value = S.type === 'music' ? '15' : '20';
    if (needsQ() && !S.bank) loadBank();
    S.rounds = S.rounds.filter(r => isQ(r) ? needsQ() : needsMusic());
    if (!init) autoPick();
    updatePick();
  }
  $('gtype').addEventListener('click', e => { const b = e.target.closest('[data-t]'); if (b && b.dataset.t !== S.type) setType(b.dataset.t); });

  // ---------- Spurningabanki ----------
  function qbView(id) { ['qbLocked', 'qbMissing', 'qbReady'].forEach(v => $(v).classList.toggle('hidden', v !== id)); }
  async function loadBank(pin) {
    pin = pin || ($('pin').value || '').trim() || store.get('pq_pin') || '';
    showErr('qErr', '');
    if (!pin) { qbView('qbLocked'); return; }
    try {
      S.bank = await rpc('qb_list', { p_pin: pin });
      store.set('pq_pin', pin);
      if (!$('pin').value) $('pin').value = pin;
      qbView('qbReady'); renderCats(); autoPick(); updatePick();
    } catch (e) {
      if (/Could not find the function|PGRST202/i.test(e.message) && !e.code) return qbView('qbMissing');
      qbView('qbLocked');
      if (e.code === 'rangt_pin' && $('qbPin').value) showErr('qErr', e.message);
    }
  }
  $('qbOpen').onclick = () => loadBank(($('qbPin').value || '').trim());
  $('qbPin').addEventListener('keydown', e => { if (e.key === 'Enter') $('qbOpen').click(); });

  function qDiffOk(d) { const f = $('qDiff').value; return !f || f.includes(String(d)); }
  // Barnaspurningar eru sér: ekki með í „Allir flokkar“, aðeins þegar flokkurinn er valinn
  const KIDS = 'Barnaspurningar';
  function qPool() {
    return (S.bank || []).filter(q => q.active && (S.qcats.size ? S.qcats.has(q.category) : q.category !== KIDS) && qDiffOk(q.difficulty));
  }
  function renderCats() {
    const counts = {};
    (S.bank || []).filter(q => q.active && qDiffOk(q.difficulty)).forEach(q => { counts[q.category] = (counts[q.category] || 0) + 1; });
    const cats = [...new Set((S.bank || []).filter(q => q.active).map(q => q.category))].sort((a, b) => a.localeCompare(b, 'is'));
    [...S.qcats].forEach(c => { if (!cats.includes(c)) S.qcats.delete(c); });
    const chip = c => `<button type="button" data-cat="${esc(c)}" class="${S.qcats.has(c) ? 'on' : ''}">${esc(c)}<small>${counts[c] || 0}</small></button>`;
    $('qCats').innerHTML = `<button type="button" data-cat="" class="${S.qcats.size ? '' : 'on'}">Allir flokkar</button>` +
      cats.filter(c => c !== KIDS).map(chip).join('') +
      (cats.includes(KIDS) ? `<div class="catkids"><span>Fyrir krakka (ekki með í „Allir flokkar“):</span>${chip(KIDS)}</div>` : '');
    const active = (S.bank || []).filter(q => q.active).length;
    $('qbInfo').textContent = `${active} virkar spurningar í ${cats.length} flokkum`;
    const n = qPool().length;
    $('qPoolInfo').textContent = n ? `${n} ${n === 1 ? 'spurning kemur' : 'spurningar koma'} til greina.` : 'Engar spurningar passa við valið.';
  }
  $('qCats').addEventListener('click', e => {
    const b = e.target.closest('[data-cat]'); if (!b) return;
    const c = b.dataset.cat;
    if (!c) S.qcats.clear(); else if (S.qcats.has(c)) S.qcats.delete(c); else S.qcats.add(c);
    renderCats(); autoPick(); updatePick();
  });
  $('qDiff').addEventListener('change', () => { renderCats(); autoPick(); updatePick(); });
  $('qFresh').addEventListener('change', () => autoPick());

  // Velur spurningar: helst ónotaðar, og dreift jafnt á flokka
  function rankQs(list) {
    const fresh = $('qFresh').checked;
    return shuffle(list).map(q => ({ q, k: fresh ? q.times_used : 0 })).sort((a, b) => a.k - b.k).map(x => x.q);
  }
  function questionRound(q) {
    const correct = Math.floor(Math.random() * 4);
    const options = shuffle([q.wrong1, q.wrong2, q.wrong3]); options.splice(correct, 0, q.answer);
    return { options, correct, meta: { type: 'q', qid: q.id, question: q.question, answer: q.answer, category: q.category, difficulty: q.difficulty, note: q.note || '' } };
  }
  function pickQuestions(n, exclude) {
    const ex = exclude || new Set();
    const groups = {};
    rankQs(qPool().filter(q => !ex.has(q.id))).forEach(q => { (groups[q.category] = groups[q.category] || []).push(q); });
    const order = shuffle(Object.keys(groups));
    const out = [];
    while (out.length < n && order.some(c => groups[c].length)) {
      for (const c of order) { if (out.length < n && groups[c].length) out.push(groups[c].shift()); }
    }
    return shuffle(out).map(questionRound);
  }
  // Fléttar tvo lista jafnt saman (t.d. 6 lög og 4 spurningar)
  function interleave(a, b) {
    const tag = (l, w) => l.map((x, i) => ({ x, p: (i + 0.5) / l.length + w }));
    return tag(a, 0).concat(tag(b, 0.0001)).sort((u, v) => u.p - v.p).map(o => o.x);
  }

  function musicReady() { return S.pool.length >= 4; }
  function qReady() { return !!S.bank && qPool().length > 0; }
  function canPick() { return (!needsMusic() || musicReady()) && (!needsQ() || qReady()); }
  function updatePick() {
    $('pickBtn').disabled = !canPick();
    const nM = S.rounds.filter(r => !isQ(r)).length, nQ = S.rounds.filter(isQ).length;
    $('pickInfo').textContent = S.rounds.length && S.type === 'mixed' ? `Alls ${S.rounds.length} umferðir: ${nM} lög og ${nQ} spurningar` : '';
  }
  function autoPick() { if (canPick()) pickRounds(); else { if (!S.rounds.length) renderTrackList(); updatePick(); } }

  $('fetchBtn').onclick = async () => {
    showErr('setupErr', '');
    $('fetchBtn').disabled = true; $('poolInfo').textContent = 'Sæki lög…';
    try {
      const k = $('kind').value;
      S.pool = await PQDeezer.fetchPool(k, k === 'chart' ? $('genre').value : $('value').value);
      const artists = new Set(S.pool.map(t => t.artist.toLowerCase())).size;
      $('poolInfo').textContent = `Fann ${S.pool.length} lög frá ${artists} flytjendum með forskoðun.`;
      updatePick();
      if (window.PQThemes && S.pool.length >= 4) PQThemes.afterFetch(k, k === 'chart' ? $('genre').value : $('value').value, S.pool);
      if (S.pool.length < 4) showErr('setupErr', 'Of fá lög fundust. Prófaðu víðara þema.');
      else autoPick();
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

  function pickMusic(n) {
    const mode = $('mode').value;
    if (mode === 'artist' && new Set(S.pool.map(t => norm(t.artist))).size < 4) {
      showErr('setupErr', 'Þarf a.m.k. 4 ólíka flytjendur til að spyrja um flytjanda. Veldu annað þema eða „Heiti lags“.');
      return null;
    }
    const rounds = []; const seen = new Set();
    for (const t of shuffle(S.pool)) {
      if (rounds.length === n) break;
      const key = mode === 'artist' ? norm(t.artist) + norm(t.title) : norm(label(t, mode));
      if (seen.has(key)) continue;
      const r = makeRound(t, mode);
      if (r) { rounds.push(r); seen.add(key); }
    }
    if (rounds.length < n) toast(`Aðeins ${rounds.length} lög fundust sem henta.`);
    return rounds;
  }

  function pickRounds() {
    showErr('setupErr', ''); showErr('qErr', '');
    let nM = needsMusic() ? Math.max(1, Math.min(30, +$('rounds').value || 10)) : 0;
    let nQ = needsQ() ? Math.max(1, Math.min(40, +$('qrounds').value || 10)) : 0;
    if (nM + nQ > 50) { nQ = 50 - nM; toast('Hámark 50 umferðir í leik. Spurningum var fækkað.'); }
    const music = nM ? pickMusic(nM) : [];
    if (!music) return;
    const qs = nQ ? pickQuestions(nQ) : [];
    if (nQ && qs.length < nQ) toast(`Aðeins ${qs.length} spurningar passa við valið.`);
    S.rounds = S.type === 'mixed' ? interleave(music, qs) : (S.type === 'questions' ? qs : music);
    renderTrackList(); updatePick();
  }
  $('pickBtn').onclick = pickRounds;
  ['mode', 'rounds', 'clip', 'qrounds'].forEach(id => $(id).addEventListener('change', autoPick));

  // Listinn er falinn sjálfgefið svo að enginn sjái svörin ef skjárinn sést (t.d. á skjávarpa)
  let listOpen = false;
  function showList(open) {
    listOpen = open;
    $('trackList').classList.toggle('hidden', !open);
    $('listHidden').classList.toggle('hidden', open);
    $('listToggle').textContent = open ? 'Fela listann' : 'Sýna listann';
    $('listToggle').setAttribute('aria-expanded', String(open));
  }
  $('listToggle').onclick = () => showList(!listOpen);
  function updateLaunch() {
    const nQ = S.rounds.filter(isQ).length, nM = S.rounds.length - nQ;
    const parts = []; if (nM) parts.push(`${nM} ${nM === 1 ? 'lag' : 'lög'}`); if (nQ) parts.push(`${nQ} ${nQ === 1 ? 'spurning' : 'spurningar'}`);
    $('lbInfo').innerHTML = S.rounds.length ? `<b>${S.rounds.length} umferðir tilbúnar</b> · ${parts.join(' og ')}` : 'Veldu þema eða spurningar til að byrja.';
    $('createBtn').disabled = !S.rounds.length;
  }
  function renderTrackList() {
    $('roundsPanel').classList.toggle('hidden', !S.rounds.length);
    const hasQ = S.rounds.some(isQ), hasM = S.rounds.some(r => !isQ(r));
    $('roundsTitle').textContent = hasQ && hasM ? 'Umferðirnar' : hasQ ? 'Spurningarnar' : 'Lögin';
    $('roundsSub').textContent = hasQ && !hasM ? '– skiptu út þeim sem þér líst ekki á' : '– hlustaðu, skiptu út eða haltu áfram';
    $('listHiddenTxt').textContent = `${hasQ && !hasM ? 'Spurningarnar eru faldar' : hasQ ? 'Umferðirnar eru faldar' : 'Lögin eru falin'} svo að enginn á skjánum sjái svörin. Smelltu á „Sýna listann“ ef þú vilt fara yfir ${hasQ && !hasM ? 'þær' : hasQ ? 'þær' : 'þau'} eða skipta út.`;
    showList(listOpen); updateLaunch();
    $('trackList').innerHTML = S.rounds.map((r, i) => isQ(r) ? `
      <li class="qround"><span class="n">${i + 1}</span><span class="qi">?</span>
        <div class="t wrap"><b>${esc(r.meta.question)}</b><small class="muted"><span class="ok">✓ ${esc(r.meta.answer)}</span> · ${esc(r.meta.category)}</small></div>
        <button class="btn ghost small" data-swap="${i}">Skipta</button></li>` : `
      <li><span class="n">${i + 1}</span><img src="${esc(r.meta.cover)}" alt="">
        <div class="t"><b>${esc(r.meta.title)}</b><small class="muted">${esc(r.meta.artist)}</small></div>
        <button class="btn ghost small" data-play="${i}">▶</button>
        <button class="btn ghost small" data-swap="${i}">Skipta</button></li>`).join('');
  }
  $('trackList').addEventListener('click', async e => {
    const p = e.target.closest('[data-play]'), s = e.target.closest('[data-swap]');
    if (p) { const r = S.rounds[+p.dataset.play]; try { await playClip(r.meta, r.meta.clip); } catch (err) { toast(err.message); } }
    if (s && isQ(S.rounds[+s.dataset.swap])) {
      const i = +s.dataset.swap;
      const next = pickQuestions(1, new Set(S.rounds.filter(isQ).map(r => r.meta.qid)));
      if (!next.length) return toast('Engar fleiri spurningar passa við valið.');
      S.rounds[i] = next[0]; renderTrackList(); return;
    }
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
    if (!S.rounds.length) return showErr('createErr', S.type === 'music' ? 'Veldu lög fyrst.' : 'Veldu umferðir fyrst.');
    $('createBtn').disabled = true;
    try {
      const secs = +$('secs').value;
      const res = await rpc('create_game', {
        p_pin: $('pin').value, p_title: $('title').value, p_answer_seconds: secs,
        p_rounds: S.rounds, p_event_tag: cfg.EVENT_TAG || null
      });
      store.set('pq_pin', $('pin').value);
      const qids = S.rounds.filter(isQ).map(r => r.meta.qid);
      if (qids.length) rpc('qb_mark_used', { p_pin: $('pin').value, p_ids: qids }).catch(() => {});
      S.game = { game_id: res.game_id, code: res.code, title: $('title').value || 'Hljómey Pöbbkviss', answer_seconds: secs, total_rounds: S.rounds.length };
      S.token = res.host_token;
      store.set('pq_host', { game_id: res.game_id, host_token: res.host_token });
      enterLobby();
    } catch (e) { showErr('createErr', e.message); }
    $('createBtn').disabled = !S.rounds.length;
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

  // ---------- Merkingar ----------
  function gameKinds() { const q = S.rounds.filter(isQ).length; return { q, m: S.rounds.length - q }; }
  function roundLabel(n) {
    const k = gameKinds(), r = S.rounds[n - 1];
    if (k.q && k.m) return `${isQ(r) ? 'Spurning' : 'Lag'} · ${n} af ${S.game.total_rounds}`;
    return `${isQ(r) ? 'Spurning' : 'Lag'} ${n} af ${S.game.total_rounds}`;
  }
  function countLabel(n) {
    const k = gameKinds();
    if (k.q && k.m) return `${n} ${n === 1 ? 'umferð' : 'umferðir'}`;
    if (k.q) return `${n} ${n === 1 ? 'spurningu' : 'spurningar'}`;
    return `${n} ${n === 1 ? 'lag' : 'lög'}`;
  }
  function lobbyLabel() {
    const k = gameKinds();
    if (k.q && k.m) return `${k.m} lög og ${k.q} spurningar`;
    if (k.q) return `${k.q} ${k.q === 1 ? 'spurning' : 'spurningar'}`;
    return `${S.game.total_rounds} lög`;
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
    $('lobbyRounds').textContent = lobbyLabel();
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
    const q = isQ(r);
    $('primary').disabled = true; info(q ? 'Set spurningu í gang…' : 'Hleð lagi…');
    if (!q) { try { await loadTrack(r.meta); } catch (e) { toast('Náði ekki í lagið. Sleppi því.'); } }
    try {
      await rpc('host_start_round', { p_game_id: S.game.game_id, p_host_token: S.token, p_round: n });
    } catch (e) { toast(e.message); $('primary').disabled = false; return; }

    S.phase = 'question'; show('question');
    $('question').classList.remove('reveal');
    $('qNo').textContent = roundLabel(n);
    setQuestionText(r);
    $('songBox').classList.add('hidden'); $('qmid').classList.remove('hidden');
    $('wave').classList.toggle('hidden', q);
    renderOpts(r, null);
    S.answered = 0; $('ansNum').textContent = '0'; $('ansTot').textContent = S.players;
    if (!q) playClip(r.meta, r.meta.clip || 5).catch(e => toast('Hljóð: ' + e.message));
    $('replayBtn').classList.toggle('hidden', q);

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
    info(`${q ? 'Spurning' : 'Lag'} ${n}/${S.game.total_rounds} · bil = sýna svar`);
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
    const r = S.rounds[S.round - 1], q = isQ(r);
    $('question').classList.add('reveal');
    $('qNo').textContent = roundLabel(S.round);
    setQuestionText(r);
    renderOpts(r, res.counts || [0, 0, 0, 0]);
    $('qmid').classList.add('hidden'); $('songBox').classList.remove('hidden');
    $('songRow').classList.toggle('hidden', q); $('qAnswer').classList.toggle('hidden', !q);
    if (q) {
      $('qAnsText').textContent = r.meta.answer;
      $('qNote').textContent = r.meta.note || ''; $('qNote').classList.toggle('hidden', !r.meta.note);
    } else {
      $('cover').src = r.meta.cover || ''; $('songTitle').textContent = r.meta.title; $('songArtist').textContent = r.meta.artist;
    }
    $('firstBox').innerHTML = res.first
      ? `Fyrst/ur með rétt svar: <b>${esc(res.first)}</b> (${(res.first_ms / 1000).toFixed(1).replace('.', ',')} sek) · +200 bónus`
      : 'Enginn var með rétt svar!';
    $('songBox').classList.add('pop');
    // Lagið fær að hljóma áfram á meðan svarið er sýnt
    if (!q) playClip(r.meta, 0).catch(() => {});
    setPrimary('Stigatafla', showBoard);
    info('bil = stigatafla');
  }

  function setQuestionText(r) {
    const q = isQ(r);
    $('qText').classList.toggle('hidden', !q);
    $('qCat').classList.toggle('hidden', !q);
    $('qText').textContent = q ? r.meta.question : '';
    $('qCat').textContent = q ? r.meta.category : '';
  }

  // ---------- 4. Stigatafla ----------
  async function showBoard() {
    await rpc('host_set_state', { p_game_id: S.game.game_id, p_host_token: S.token, p_state: 'leaderboard' }).catch(e => toast(e.message));
    S.phase = 'leaderboard'; show('board'); setHeads();
    const { data } = await client.from('players').select('name,score').eq('game_id', S.game.game_id)
      .order('score', { ascending: false }).order('joined_at', { ascending: true }).limit(10);
    const top = (data && data[0] && data[0].score) || 1;
    $('boardList').innerHTML = `<h1>Staðan eftir ${countLabel(S.round)}</h1>` +
      (data || []).map((p, i) => `<div class="brow pop" style="animation-delay:${i * 60}ms">
        <span class="fill" style="width:${(p.score / top) * 100}%"></span>
        <span class="r">${i + 1}.</span><span>${esc(p.name)}</span><span class="s">${p.score.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}</span></div>`).join('');
    const last = S.round >= S.game.total_rounds;
    if (last) { setPrimary('Úrslit', showFinal); info('Síðasta umferð búin · bil = úrslit'); }
    else {
      const nextQ = isQ(S.rounds[S.round]);
      setPrimary(nextQ ? 'Næsta spurning' : 'Næsta lag', () => startRound(S.round + 1));
      info(`bil = ${nextQ ? 'næsta spurning' : 'næsta lag'} (${S.round + 1}/${S.game.total_rounds})`);
      if (!nextQ) loadTrack(S.rounds[S.round].meta).catch(() => {});   // forhlaða næsta lag
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
  $('replayBtn').onclick = () => { const r = S.rounds[S.round - 1]; if (r && !isQ(r)) playClip(r.meta, S.phase === 'question' ? (r.meta.clip || 5) : 0).catch(e => toast(e.message)); };
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
  setType(store.get('pq_gtype') || 'music', true);
  checkResume();
  window.__PQ_HOST = S;   // fyrir prófanir
})();
