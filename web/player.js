// Hljómey Pöbbkviss – sími þátttakanda
(function () {
  const { client, rpc, store, esc, SHAPES } = window.PQ;
  const $ = id => document.getElementById(id);
  const VIEWS = ['vJoin', 'vWait', 'vQuestion', 'vSent', 'vResult'];

  let me = null;              // {game_id, player_id, token, name, code}
  let channel = null;
  let answeredRound = 0;      // umferð sem ég hef svarað
  let shownRound = 0;         // umferð sem hnappar eru sýndir fyrir
  let countdown = null, deadline = 0;
  let lastState = '';

  function view(id) { VIEWS.forEach(v => $(v).classList.toggle('hidden', v !== id)); }
  function fmt(n) { return String(Math.round(Number(n || 0))).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
  function setMe(p) {
    $('me').classList.remove('hidden');
    $('meName').textContent = p.name;
    if (p.score != null) $('meScore').textContent = fmt(p.score) + ' stig';
  }

  // ---------- Skráning ----------
  const params = new URLSearchParams(location.search);
  const urlCode = (params.get('k') || '').toUpperCase();
  $('codeIn').value = urlCode;
  $('nameIn').value = (store.get('pq_name') || '');
  if (urlCode) setTimeout(() => $('nameIn').focus(), 50);

  $('joinBtn').onclick = async () => {
    $('joinErr').classList.add('hidden');
    $('joinBtn').disabled = true;
    try {
      const code = $('codeIn').value.trim().toUpperCase();
      // Er þetta gítarpartý? Þá þarf ekki nafn: beint á textann.
      try {
        if (await rpc('gitar_find', { p_code: code })) { location.href = 'gitar.html?k=' + encodeURIComponent(code); return; }
      } catch (err) { /* gitar.sql ekki uppsett: halda áfram */ }
      // Karaoke-kvöld? Þá á karaoke-síðuna.
      try {
        if (await rpc('karaoke_find', { p_code: code })) { location.href = 'karaoke.html?k=' + encodeURIComponent(code) + '&n=' + encodeURIComponent($('nameIn').value.trim()); return; }
      } catch (err) { /* karaoke.sql ekki uppsett: halda áfram */ }
      // Er þetta bingókóði? Þá er farið á bingósíðuna.
      try {
        const f = await rpc('find_game', { p_code: code });
        if (f && f.kind === 'bingo') { location.href = 'bingo.html?k=' + encodeURIComponent(code) + '&n=' + encodeURIComponent($('nameIn').value.trim()); return; }
      } catch (err) { /* bingo.sql ekki uppsett: halda áfram */ }
      const r = await rpc('join_game', { p_code: code, p_name: $('nameIn').value });
      me = { game_id: r.game_id, player_id: r.player_id, token: r.token, name: r.name, code };
      store.set('pq_player', me); store.set('pq_name', r.name);
      start();
    } catch (e) { $('joinErr').textContent = e.message; $('joinErr').classList.remove('hidden'); }
    $('joinBtn').disabled = false;
  };
  $('nameIn').addEventListener('keydown', e => { if (e.key === 'Enter') $('joinBtn').click(); });

  // ---------- Tenging og samstilling ----------
  function start() {
    setMe({ name: me.name, score: 0 });
    view('vWait');
    subscribe();
    sync();
    setInterval(() => { if (!document.hidden) sync(); }, 6000);   // öryggisnet ef rauntími missir af
    document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(); });
  }

  function subscribe() {
    if (channel) client.removeChannel(channel);
    channel = client.channel('game-' + me.game_id)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'games', filter: 'id=eq.' + me.game_id },
          payload => onGame(payload.new))
      .subscribe(status => {
        $('conn').classList.toggle('hidden', status === 'SUBSCRIBED');
        if (status === 'SUBSCRIBED') sync();
      });
  }

  let syncing = false;
  async function sync() {
    if (!me || syncing) return; syncing = true;
    try {
      const s = await rpc('my_state', { p_player_id: me.player_id, p_token: me.token });
      setMe(s.player);
      if (s.answer) answeredRound = s.game.current_round;
      render(s);
    } catch (e) {
      if (e.code === 'ogildur_leikmadur') { store.del('pq_player'); location.reload(); }
    } finally { syncing = false; }
  }

  // Rauntímaboð: leikurinn breyttist
  function onGame(g) {
    if (g.state === 'question') {
      if (g.current_round !== shownRound && answeredRound !== g.current_round) {
        showQuestion(g, g.answer_seconds);
      }
    } else if (g.state === 'lobby') {
      view('vWait');
    } else if (g.state !== lastState || g.state === 'reveal') {
      sync();   // sækir niðurstöðu (rétt/rangt, stig, sæti)
    }
    lastState = g.state;
  }

  function render(s) {
    const g = s.game; lastState = g.state;
    if (g.state === 'lobby') {
      $('waitTitle').textContent = 'Þú ert með!';
      $('waitText').textContent = 'Bíddu eftir að leikurinn hefjist. Fylgstu með stóra skjánum.';
      return view('vWait');
    }
    if (g.state === 'question') {
      if (s.answer || answeredRound === g.current_round) return showSent();
      if (shownRound !== g.current_round || $('vQuestion').classList.contains('hidden')) showQuestion(g, g.seconds_left);
      return;
    }
    showResult(s);
  }

  // ---------- Spurning ----------
  function showQuestion(g, secondsLeft) {
    shownRound = g.current_round;
    const prompt = g.current_prompt || '';
    $('qNo').textContent = `${prompt ? 'Spurning' : 'Lag'} ${g.current_round} af ${g.total_rounds}`;
    $('qPrompt').textContent = prompt; $('qPrompt').classList.toggle('hidden', !prompt);
    $('answers').classList.toggle('q', !!prompt);
    $('answers').innerHTML = (g.current_options || []).map((o, i) =>
      `<button class="ans opt${i}" data-i="${i}"><span class="sh">${SHAPES[i]}</span><span>${esc(o)}</span></button>`).join('');
    view('vQuestion');
    clearInterval(countdown);
    deadline = Date.now() + Math.max(0, secondsLeft == null ? g.answer_seconds : secondsLeft) * 1000;
    const tick = () => {
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      $('qTime').textContent = left;
      if (left <= 0) { clearInterval(countdown); if (!$('vQuestion').classList.contains('hidden')) showSent(true); }
    };
    tick(); countdown = setInterval(tick, 250);
  }

  $('answers').addEventListener('click', async e => {
    const b = e.target.closest('.ans'); if (!b) return;
    const round = shownRound;
    if (answeredRound === round) return;
    answeredRound = round;
    try { navigator.vibrate && navigator.vibrate(30); } catch (err) {}
    showSent();
    try {
      const r = await rpc('submit_answer', { p_player_id: me.player_id, p_token: me.token, p_choice: +b.dataset.i });
      if (!r.ok && r.reason === 'of_seint') showSent(true);
    } catch (err) {
      answeredRound = 0; showQuestionAgain(err.message);
    }
  });
  function showQuestionAgain(msg) {
    view('vQuestion'); $('qNo').textContent = msg + ' Reyndu aftur.';
  }

  function showSent(late) {
    clearInterval(countdown);
    $('sentTitle').textContent = late ? 'Tíminn er búinn!' : 'Svar sent!';
    $('sentText').textContent = late ? 'Bíðum eftir rétta svarinu…' : 'Sjáum hvort það var rétt…';
    view('vSent');
  }

  // ---------- Niðurstaða ----------
  function showResult(s) {
    clearInterval(countdown);
    const g = s.game, a = s.answer, p = s.player;
    const box = $('resBox');
    box.classList.remove('good', 'bad', 'none', 'pop'); void box.offsetWidth; box.classList.add('pop');
    $('resBadge').innerHTML = '';
    if (g.state === 'finished') {
      box.classList.add(p.rank <= 3 ? 'good' : 'none');
      $('resTitle').textContent = p.rank === 1 ? 'Þú vannst!' : 'Leik lokið';
      $('resPts').textContent = fmt(p.score) + ' stig';
      $('resHint').textContent = 'Takk fyrir að spila Hljómey Pöbbkviss!';
    } else if (!a) {
      box.classList.add('none');
      $('resTitle').textContent = 'Ekkert svar';
      $('resPts').textContent = '0 stig';
      $('resHint').textContent = 'Vertu fljótari næst!';
    } else if (a.correct) {
      box.classList.add('good');
      $('resTitle').textContent = 'Rétt!';
      $('resPts').textContent = '+' + fmt(a.points) + ' stig';
      if (a.is_first) $('resBadge').innerHTML = '<span class="badge">Fyrst/ur! +200 bónus</span>';
      $('resHint').textContent = g.state === 'leaderboard' ? 'Stigataflan er á skjánum.' : '';
    } else {
      box.classList.add('bad');
      $('resTitle').textContent = 'Rangt';
      $('resPts').textContent = g.current_options && g.current_correct != null ? 'Rétt var: ' + g.current_options[g.current_correct] : '';
      $('resHint').textContent = g.current_prompt ? 'Næsta umferð kemur!' : 'Næsta lag kemur!';
    }
    $('resRank').innerHTML = g.state === 'finished'
      ? `Þú lentir í <b>${p.rank}.</b> sæti af ${p.total}`
      : `Þú ert í <b>${p.rank}.</b> sæti af ${p.total}`;
    $('newBtn').classList.toggle('hidden', g.state !== 'finished');
    view('vResult');
  }
  $('newBtn').onclick = () => { store.del('pq_player'); location.href = location.pathname; };

  // ---------- Ræsing ----------
  const saved = store.get('pq_player');
  if (saved && (!urlCode || urlCode === saved.code)) { me = saved; start(); }
  else view('vJoin');
})();
