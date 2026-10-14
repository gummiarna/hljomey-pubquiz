// Hljómey Tónlistarbingó – stjórnandi og stór skjár
(function () {
  const { client, rpc, store, esc, cfg } = window.PQ;
  const $ = id => document.getElementById(id);
  const STAGE = { line: '1 lína', two_lines: '2 línur', full: 'Fullt spjald' };

  const S = {
    pool: [], pot: [], game: null, token: null, songs: [], played: [],
    phase: 'setup', paused: false, players: 0, clip: 15, gap: 5, reveal: false,
    poll: null, nextTimer: null, lastClaimKey: '', busy: false
  };
  const audio = new Audio(); audio.preload = 'auto';
  let clipTimer = null, clipAnim = null;

  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const norm = s => String(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
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
  function setPrimary(text, fn) { $('primary').textContent = text; primaryFn = fn; $('primary').disabled = false; }

  // ---------- 1. Stillingar ----------
  const HINTS = {
    search: 'Leitar í öllu Deezer-safninu. Dæmi: „90s“, „Eurovision“, „íslensk lög“, „one hit wonders“.',
    playlist: 'Besta leiðin: búðu til opinberan lagalista á deezer.com með 50–70 lögum og límdu slóðina hér.',
    artists: 'Nöfn flytjenda aðskilin með kommu. Kerfið tekur vinsælustu lögin þeirra.',
    chart: 'Vinsælustu lögin á Deezer núna.'
  };
  function onKind() {
    const k = $('kind').value;
    $('valueWrap').classList.toggle('hidden', k === 'chart');
    $('genreWrap').classList.toggle('hidden', k !== 'chart');
    $('valueLabel').textContent = { search: 'Leitarorð', playlist: 'Slóð á lagalista', artists: 'Flytjendur' }[k] || '';
    $('value').placeholder = { search: 't.d. 90s, Eurovision, bíómyndalög', playlist: 'https://www.deezer.com/playlist/…', artists: 'Stuðmenn, Mugison, GDRN' }[k] || '';
    $('kindHint').textContent = HINTS[k];
  }
  $('kind').addEventListener('change', onKind); onKind();

  function onMode() {
    $('modeHint').textContent = $('cardMode').value === 'artist_hard'
      ? 'Erfitt: á spjaldinu stendur bara flytjandinn. Til að merkja þarf að velja rétt lagaheiti úr 4 möguleikum. Rangt val læsir reitnum fram að næsta lagi.'
      : 'Leikmenn merkja sjálfir. Kerfið athugar við BINGÓ að öll merktu lögin hafi í raun verið spiluð.';
  }
  $('cardMode').addEventListener('change', onMode); onMode();

  $('fetchBtn').onclick = async () => {
    showErr('setupErr', ''); $('fetchBtn').disabled = true; $('poolInfo').textContent = 'Sæki lög…';
    try {
      const k = $('kind').value;
      const raw = await PQDeezer.fetchPool(k, k === 'chart' ? $('genre').value : $('value').value);
      // Sama lagaheiti má ekki koma tvisvar (annars ruglast spjöldin)
      const seen = new Set(); S.pool = raw.filter(t => { const n = norm(t.title); if (!n || seen.has(n)) return false; seen.add(n); return true; });
      $('poolInfo').textContent = `Fann ${S.pool.length} ólík lög með forskoðun.`;
      const need = cardSongs();
      if (S.pool.length < need) showErr('setupErr', `${gridLabel()} spjald þarf a.m.k. ${need} lög (helst ${POT_DEFAULT[gridN()]}). Aðeins ${S.pool.length} fundust – prófaðu víðara þema eða minna spjald.`);
      else pickPot();
    } catch (e) { $('poolInfo').textContent = ''; showErr('setupErr', e.message); }
    $('fetchBtn').disabled = false;
  };
  $('value').addEventListener('keydown', e => { if (e.key === 'Enter') $('fetchBtn').click(); });

  function pickPot() {
    const n = Math.max(cardSongs(), Math.min(100, +$('potSize').value || POT_DEFAULT[gridN()]));
    S.pot = shuffle(S.pool).slice(0, n);
    if (S.pot.length < n) toast(`Aðeins ${S.pot.length} lög í boði – potturinn verður ${S.pot.length} lög.`);
    $('potPanel').classList.remove('hidden');
    $('potCount').textContent = `– ${S.pot.length} lög`;
    $('potGrid').innerHTML = S.pot.map(t => `<div><b>${esc(t.title)}</b> · ${esc(t.artist)}</div>`).join('');
  }
  $('reshuffleBtn').onclick = pickPot;
  $('potSize').addEventListener('change', () => { if (S.pool.length >= cardSongs()) pickPot(); });

  // Stærð spjalds: 5×5 og 3×3 fá fríreit í miðjunni, 4×4 ekki
  const POT_DEFAULT = { 5: 60, 4: 35, 3: 20 };
  const gridN = () => +$('gridSize').value;
  const cardSongs = () => gridN() * gridN() - (gridN() % 2);
  const gridLabel = () => `${gridN()}×${gridN()}`;
  $('gridSize').addEventListener('change', () => {
    $('potSize').value = POT_DEFAULT[gridN()];
    $('potSize').min = cardSongs();
    showErr('setupErr', '');
    if (S.pool.length >= cardSongs()) pickPot();
    else if (S.pool.length) showErr('setupErr', `${gridLabel()} spjald þarf a.m.k. ${cardSongs()} lög.`);
  });

  function titleOptions(track) {
    const opts = [track.title]; const used = new Set([norm(track.title)]);
    for (const t of shuffle(S.pool)) {
      if (opts.length === 4) break;
      const n = norm(t.title); if (used.has(n)) continue;
      used.add(n); opts.push(t.title);
    }
    const shuffled = shuffle(opts);
    return { title_options: shuffled, title_correct: shuffled.indexOf(track.title) };
  }

  try { $('pin').value = store.get('pq_pin') || ''; } catch (e) {}

  $('createBtn').onclick = async () => {
    showErr('createErr', '');
    const stages = [...document.querySelectorAll('.stage-cb')].filter(c => c.checked).map(c => c.value);
    if (!stages.length) return showErr('createErr', 'Veldu a.m.k. eitt vinningsmynstur.');
    if (S.pot.length < cardSongs()) return showErr('createErr', `Potturinn þarf a.m.k. ${cardSongs()} lög fyrir ${gridLabel()} spjald.`);
    const clip = +$('clip').value;
    const songs = S.pot.map(t => Object.assign(
      { meta: Object.assign({}, t, { start: Math.floor(Math.random() * Math.max(1, 30 - clip - 1)) }) },
      titleOptions(t)));
    $('createBtn').disabled = true;
    try {
      const res = await rpc('bingo_new_game', {
        p_pin: $('pin').value, p_title: $('title').value, p_songs: songs, p_stages: stages,
        p_card_mode: $('cardMode').value, p_clip_seconds: clip, p_grid_size: gridN(), p_event_tag: cfg.EVENT_TAG || null
      });
      store.set('pq_pin', $('pin').value);
      store.set('pq_bingo_host', { game_id: res.game_id, host_token: res.host_token, gap: +$('gap').value, reveal: $('reveal').checked });
      await loadGame(res.game_id, res.host_token, +$('gap').value, $('reveal').checked);
    } catch (e) { showErr('createErr', e.message); }
    $('createBtn').disabled = false;
  };

  async function loadGame(gameId, token, gap, reveal) {
    const d = await rpc('bingo_host_get', { p_game_id: gameId, p_host_token: token });
    S.game = d.game; S.token = token; S.gap = gap; S.reveal = reveal; S.clip = d.game.clip_seconds;
    S.songs = d.songs;
    S.played = d.songs.filter(s => s.played_seq).sort((a, b) => a.played_seq - b.played_seq).map(s => s.meta);
    ['lobbyTitle', 'pTitle', 'cTitle', 'fTitle'].forEach(id => $(id).textContent = S.game.title);
    ['pCode', 'cCode'].forEach(id => $(id).textContent = `${prettyUrl()} · ${S.game.code}`);
    clearInterval(S.poll); S.poll = setInterval(pollGame, 1000);
    if (d.game.state === 'lobby') return enterLobby();
    if (d.game.state === 'claim') return showClaim(d.game);
    if (d.game.state === 'finished') return showFinal(d.game);
    S.paused = true; enterPlaying(); updatePauseBtn();
    setPrimary('Næsta lag', () => { S.paused = false; updatePauseBtn(); nextSong(); });
  }

  // Halda áfram eftir endurhleðslu
  (async () => {
    const saved = store.get('pq_bingo_host'); if (!saved) return;
    try {
      const d = await rpc('bingo_host_get', { p_game_id: saved.game_id, p_host_token: saved.host_token });
      if (!d.game || d.game.state === 'finished') { store.del('pq_bingo_host'); return; }
      $('resumeCode').textContent = d.game.code; $('resumeBox').classList.remove('hidden');
      $('resumeBtn').onclick = () => loadGame(saved.game_id, saved.host_token, saved.gap, saved.reveal);
      $('discardBtn').onclick = () => { store.del('pq_bingo_host'); $('resumeBox').classList.add('hidden'); };
    } catch (e) { store.del('pq_bingo_host'); }
  })();

  // ---------- 2. Biðsalur ----------
  function enterLobby() {
    S.phase = 'lobby'; show('lobby');
    const url = baseUrl() + 'bingo.html?k=' + S.game.code;
    const qr = qrcode(0, 'M'); qr.addData(url); qr.make();
    $('qr').innerHTML = qr.createSvgTag({ cellSize: 8, margin: 2, scalable: true });
    $('joinUrl').textContent = prettyUrl(); $('code').textContent = S.game.code;
    $('lobbyInfo').textContent = `${S.game.grid_size || 5}×${S.game.grid_size || 5} spjöld · ${S.game.total_songs} lög · ${S.game.stages.map(s => STAGE[s]).join(' → ')}`;
    setPrimary('Byrja bingó', () => { enterPlaying(); nextSong(); });
    ['pauseBtn', 'replayBtn', 'playedBtn'].forEach(id => $(id).classList.add('hidden'));
    info('Bíð eftir þátttakendum…');
  }
  async function refreshPlayers() {
    const { data } = await client.from('bingo_players').select('name').eq('game_id', S.game.id).order('joined_at', { ascending: false }).limit(300);
    if (!data) return;
    S.players = data.length;
    if (S.phase === 'lobby') {
      $('pcount').textContent = `${data.length} ${data.length === 1 ? 'þátttakandi' : 'þátttakendur'}`;
      $('chips').innerHTML = data.slice(0, 80).map(p => `<span>${esc(p.name)}</span>`).join('');
      $('primary').disabled = data.length === 0;
    }
  }

  // Fylgist með leiknum: BINGÓ-köll koma frá símunum
  let pollN = 0;
  async function pollGame() {
    if (pollN++ % 2 === 0 || S.phase === 'lobby') refreshPlayers();
    const { data } = await client.from('bingo_games').select('state,stage_idx,claim,winners,played_count').eq('id', S.game.id).limit(1);
    const g = data && data[0]; if (!g) return;
    Object.assign(S.game, g);
    if (g.state === 'claim') {
      const key = JSON.stringify(g.claim);
      if (S.phase !== 'claim' || key !== S.lastClaimKey) showClaim(g);
    }
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
    audio.dataset.id = String(meta.deezer_id); audio.src = meta.preview; audio.load();
    try { await waitAudio(8000); }
    catch (e) { meta.preview = await PQDeezer.refreshPreview(meta.deezer_id); audio.src = meta.preview; audio.load(); await waitAudio(8000); }
  }
  function stopAudio() { clearTimeout(clipTimer); cancelAnimationFrame(clipAnim); audio.pause(); $('wave').classList.remove('on'); }
  async function playClip(meta, seconds, onEnd) {
    stopAudio();
    await loadTrack(meta);
    audio.currentTime = meta.start || 0; await audio.play();
    $('wave').classList.add('on');
    const t0 = performance.now();
    const anim = () => { $('clipFill').style.width = Math.min(100, (performance.now() - t0) / (seconds * 10)) + '%'; clipAnim = requestAnimationFrame(anim); };
    anim();
    clipTimer = setTimeout(() => { stopAudio(); $('clipFill').style.width = '100%'; onEnd && onEnd(); }, seconds * 1000);
  }

  // ---------- 3. Spilun ----------
  function enterPlaying() {
    S.phase = 'playing'; show('playing');
    ['pauseBtn', 'replayBtn', 'playedBtn'].forEach(id => $(id).classList.remove('hidden'));
    renderPlaying();
  }
  function renderPlaying() {
    $('songNo').textContent = S.played.length;
    $('songOf').textContent = `af ${S.game.total_songs}`;
    $('stages').innerHTML = S.game.stages.map((s, i) =>
      `<span class="${i < S.game.stage_idx ? 'done' : i === S.game.stage_idx ? 'cur' : ''}">${STAGE[s]}</span>`).join('');
    const playing = !$('wave').classList.contains('on') ? 0 : 1;
    const shown = S.reveal ? S.played.slice(0, S.played.length - playing).reverse() : [];
    $('side').innerHTML = S.reveal
      ? (shown.length ? `<h3>Síðasta lag</h3>` + shown.slice(0, 5).map((m, i) => `
          <div class="last ${i === 0 ? 'big pop' : ''}"><img src="${esc(m.cover)}" alt=""><div><b>${esc(m.title)}</b><small>${esc(m.artist)}</small></div></div>`).join('')
          : `<p class="hiddeninfo">Lögin birtast hér eftir að þau hafa verið spiluð.</p>`)
      : `<h3>Hlustaðu vel!</h3><p class="hiddeninfo">Merktu við lagið ef það er á spjaldinu þínu. Kallaðu BINGÓ í símanum þegar mynstrið er komið – kerfið staðfestir sjálfkrafa.</p>
         <p class="hiddeninfo"><b style="color:var(--text)">${S.players}</b> með spjald</p>`;
  }

  async function nextSong() {
    clearTimeout(S.nextTimer);
    if (S.phase !== 'playing' || S.paused || S.busy) return;
    S.busy = true;
    try {
      // forhlaða lagið sem er næst í röðinni
      const upcoming = S.songs.find(s => !s.played_seq);
      if (upcoming) await loadTrack(upcoming.meta).catch(() => {});
      const r = await rpc('bingo_play_next', { p_game_id: S.game.id, p_host_token: S.token });
      if (!r.ok) {
        if (r.reason === 'claim') { S.busy = false; return pollGame(); }
        if (r.reason === 'buid') { setPrimary('Ljúka leik', () => finish()); info('Öll lög í pottinum hafa verið spiluð.'); }
        return;
      }
      const song = S.songs.find(s => s.song_no === r.song_no); if (song) song.played_seq = r.seq;
      S.played.push(r.meta);
      $('wave').classList.add('on'); renderPlaying();
      setPrimary('Næsta lag', () => { S.paused = false; updatePauseBtn(); nextSong(); });
      info(S.gap ? `Sjálfvirkt: ${S.clip} sek bútur + ${S.gap} sek hlé · bil = næsta lag strax` : 'bil = næsta lag');
      playClip(r.meta, S.clip, () => {
        renderPlaying();
        if (S.gap && !S.paused && S.phase === 'playing') S.nextTimer = setTimeout(nextSong, S.gap * 1000);
      }).catch(e => { toast('Hljóð: ' + e.message); if (S.gap) S.nextTimer = setTimeout(nextSong, S.gap * 1000); });
    } catch (e) { toast(e.message); }
    finally { S.busy = false; }
  }

  function updatePauseBtn() { $('pauseBtn').textContent = S.paused ? '▶ Halda áfram' : '❚❚ Hlé'; }
  $('pauseBtn').onclick = () => {
    S.paused = !S.paused; updatePauseBtn();
    if (S.paused) { clearTimeout(S.nextTimer); stopAudio(); renderPlaying(); info('Hlé'); }
    else nextSong();
  };
  $('replayBtn').onclick = () => { const m = S.played[S.played.length - 1]; if (m) { clearTimeout(S.nextTimer); playClip(m, S.clip, () => { if (S.gap && !S.paused && S.phase === 'playing') S.nextTimer = setTimeout(nextSong, S.gap * 1000); }).catch(e => toast(e.message)); } };
  $('playedBtn').onclick = () => {
    const o = $('playedOverlay'); o.classList.toggle('hidden');
    $('playedCount').textContent = `(${S.played.length})`;
    $('playedList').innerHTML = S.played.map((m, i) => `<div><span>${i + 1}.</span>${esc(m.title)} <span style="width:auto;color:var(--muted);font-weight:400">– ${esc(m.artist)}</span></div>`).join('');
  };

  // ---------- 4. BINGÓ ----------
  // Reitir í heilum línum (til að lýsa upp vinningsmynstrið)
  function winCells(ok) {
    const k = Math.round(Math.sqrt(ok.length)), idx = [...Array(k).keys()], L = [];
    for (const r of idx) L.push(idx.map(c => r * k + c));
    for (const c of idx) L.push(idx.map(r => r * k + c));
    L.push(idx.map(r => r * k + r), idx.map(r => r * k + (k - 1 - r)));
    const s = new Set(); L.filter(l => l.every(i => ok[i])).forEach(l => l.forEach(i => s.add(i)));
    return s;
  }
  async function showClaim(g) {
    S.lastClaimKey = JSON.stringify(g.claim);
    clearTimeout(S.nextTimer); stopAudio();
    const first = S.phase !== 'claim';
    S.phase = 'claim'; show('claimView'); $('playedOverlay').classList.add('hidden');
    const names = (g.claim && g.claim.names) || [];
    $('claimWho').textContent = names.join(', ');
    const stage = g.claim && g.claim.stage;
    $('claimWhat').textContent = `${STAGE[stage] || ''} · eftir ${g.claim ? g.claim.at_song : S.played.length} lög`;
    try {
      const cards = await rpc('bingo_claim_cards', { p_game_id: S.game.id, p_host_token: S.token });
      $('claimCards').classList.toggle('multi', cards.length > 1);
      $('claimCards').innerHTML = cards.slice(0, 4).map(c => {
        const win = winCells(c.ok);
        const k = Math.round(Math.sqrt(c.cells.length));
        return `<div><div class="mini" style="--n:${k};--fs:${k === 3 ? 1.9 : k === 4 ? 1.35 : 1}">${c.cells.map((cell, i) => cell === null
          ? `<div class="free ${win.has(i) ? 'win' : ''}">FRÍTT</div>`
          : `<div class="${c.ok[i] ? 'ok' : ''} ${win.has(i) ? 'win' : ''}">${esc(S.game.card_mode === 'artist_hard' ? cell.artist : cell.title)}</div>`).join('')}</div>
          <div class="mini-name">${esc(c.name)}</div></div>`;
      }).join('');
    } catch (e) { toast(e.message); }
    const last = S.game.stage_idx + 1 >= S.game.stages.length;
    if (last) setPrimary('Ljúka leik', () => finish());
    else setPrimary(`Halda áfram – næst: ${STAGE[S.game.stages[S.game.stage_idx + 1]]}`, () => doContinue());
    info(first ? 'BINGÓ staðfest! Aðrir sem kalla núna fá líka vinning.' : 'Fleiri með BINGÓ!');
    $('pauseBtn').classList.add('hidden'); $('replayBtn').classList.add('hidden');
  }
  async function doContinue() {
    try {
      const g = await rpc('bingo_host_continue', { p_game_id: S.game.id, p_host_token: S.token, p_finish: false });
      Object.assign(S.game, g);
      if (g.state === 'finished') return showFinal(g);
      S.paused = false; updatePauseBtn(); enterPlaying();
      setPrimary('Næsta lag', () => nextSong());
      info(`Nú er spilað um: ${STAGE[g.stages[g.stage_idx]]}`);
      S.nextTimer = setTimeout(nextSong, 2500);
    } catch (e) { toast(e.message); }
  }

  // ---------- 5. Lok ----------
  async function finish() {
    try { const g = await rpc('bingo_host_continue', { p_game_id: S.game.id, p_host_token: S.token, p_finish: true }); showFinal(g); }
    catch (e) { toast(e.message); }
  }
  function showFinal(g) {
    clearTimeout(S.nextTimer); stopAudio(); clearInterval(S.poll);
    S.phase = 'finished'; show('final');
    const w = (g.winners || []);
    $('winners').innerHTML = w.length
      ? w.map(x => `<div class="pop"><span>${STAGE[x.stage]} · lag ${x.at_song}</span><span>${esc(x.name)}</span></div>`).join('')
      : '<div><span>Enginn fékk BINGÓ í þetta sinn</span><span></span></div>';
    store.del('pq_bingo_host');
    ['pauseBtn', 'replayBtn'].forEach(id => $(id).classList.add('hidden'));
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
  if (!cfg.SUPABASE_URL || cfg.SUPABASE_URL.includes('XXXX')) showErr('setupErr', 'Vantar Supabase-stillingar í config.js (sjá leiðbeiningar).');
  window.__PQ_BINGO = S;
})();
