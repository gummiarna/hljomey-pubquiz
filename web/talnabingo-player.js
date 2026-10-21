// Hljómey Bingó (tölur 1–75) – spjald í síma
(function () {
  const { client, rpc, store, esc } = window.PQ;
  const { LETTERS, COLORS, NAME, HOW, letterOf, patHtml } = window.TB;
  const $ = id => document.getElementById(id);
  const REVEAL_MS = 5600;   // hjólið snýst í u.þ.b. 5 sek á stóra skjánum: nýjasta talan birtist ekki fyrr

  let me = null, card = null, marked = null, game = null, shown = [], revealTimer = null, bannerKey = '';

  function toast(msg, ms) { const t = $('toast'); t.textContent = msg; t.classList.remove('hidden'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.add('hidden'), ms || 3500); }

  // ---------- Skráning ----------
  const params = new URLSearchParams(location.search);
  const urlCode = (params.get('k') || '').toUpperCase();
  $('codeIn').value = urlCode;
  $('nameIn').value = params.get('n') || store.get('pq_name') || '';
  $('helpChk').checked = store.get('pq_tb_help') === true;
  $('helpChk').onchange = () => { store.set('pq_tb_help', $('helpChk').checked); renderCard(); };

  async function join() {
    $('joinErr').classList.add('hidden'); $('joinBtn').disabled = true;
    try {
      const code = $('codeIn').value.trim().toUpperCase();
      const r = await rpc('tb_join', { p_code: code, p_name: $('nameIn').value });
      me = { game_id: r.game_id, player_id: r.player_id, token: r.token, name: r.name, code };
      store.set('pq_tb_player', me); store.set('pq_name', r.name);
      start();
    } catch (e) { $('joinErr').textContent = e.message; $('joinErr').classList.remove('hidden'); }
    $('joinBtn').disabled = false;
  }
  $('joinBtn').onclick = join;
  $('nameIn').addEventListener('keydown', e => { if (e.key === 'Enter') join(); });

  // ---------- Tenging ----------
  function start() {
    $('vJoin').classList.add('hidden'); $('vCard').classList.remove('hidden');
    $('me').textContent = me.name; $('me').classList.remove('hidden');
    subscribe(); load(true);
    setInterval(() => { if (!document.hidden) load(); }, 8000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
  }
  function subscribe() {
    client.channel('tb-' + me.game_id)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tb_games', filter: 'id=eq.' + me.game_id }, p => onGame(p.new))
      .subscribe(st => { $('conn').classList.toggle('hidden', st === 'SUBSCRIBED'); if (st === 'SUBSCRIBED') load(); });
  }
  let loading = false;
  async function load(first) {
    if (loading) return; loading = true;
    try {
      const d = await rpc('tb_my_card', { p_player_id: me.player_id, p_token: me.token });
      card = d.card; marked = d.marked.slice();
      onGame(d.game, first);
    } catch (e) {
      if (e.code === 'ogildur_leikmadur') { store.del('pq_tb_player'); location.reload(); }
    } finally { loading = false; }
  }
  function onGame(g, immediate) {
    game = Object.assign({}, game, g);
    const called = game.called || [];
    if (immediate || called.length < shown.length) { clearTimeout(revealTimer); shown = called.slice(); }
    else if (called.length > shown.length) {
      // Eldri tölur strax, nýjasta talan þegar hjólið hefur stöðvast
      if (called.length > shown.length + 1) shown = called.slice(0, -1);
      if (!revealTimer) revealTimer = setTimeout(() => { revealTimer = null; const was = shown.length; shown = (game.called || []).slice(); renderNow(shown.length > was); renderCard(); }, REVEAL_MS);
      if (shown.length === called.length - 1 && revealTimer) $('nowText').textContent = 'Hjólið snýst…';
    }
    renderCard(); renderNow(false); renderStatus();
    if (shown.length < called.length) $('nowText').textContent = 'Hjólið snýst…';
  }

  // ---------- Spjaldið ----------
  function renderCard() {
    if (!card) return;
    const set = new Set(shown), help = $('helpChk').checked;
    $('grid').innerHTML = LETTERS.map(L => `<div class="hd" style="background:${COLORS[L]}">${L}</div>`).join('') + card.map((n, i) => n === 0
      ? `<button class="cell free" data-i="${i}" aria-label="Fríreitur"><span>FRÍTT</span></button>`
      : `<button class="cell ${marked[i] ? 'marked' : ''} ${help && set.has(n) && !marked[i] ? 'hint' : ''}" data-i="${i}" style="--dab:${COLORS[LETTERS[i % 5]]}" aria-pressed="${!!marked[i]}"><span>${n}</span></button>`).join('');
  }
  function renderNow(isNew) {
    const last = shown[shown.length - 1];
    const b = $('nowBall');
    if (last) {
      b.style.background = COLORS[letterOf(last)];
      b.innerHTML = `<small>${letterOf(last)}</small>${last}`;
      if (isNew) { b.classList.remove('new'); void b.offsetWidth; b.classList.add('new'); try { navigator.vibrate && navigator.vibrate(30); } catch (e) {} }
      $('nowText').textContent = `${shown.length} af 75 tölum komnar`;
    } else { b.style.background = ''; b.textContent = '–'; $('nowText').textContent = game && game.state === 'finished' ? 'Bingóinu er lokið' : 'Bíð eftir fyrstu tölunni'; }
    $('recent').innerHTML = shown.slice(-7, -1).reverse().map(x => `<div class="ball" style="background:${COLORS[letterOf(x)]}">${x}</div>`).join('');
  }
  function renderStatus() {
    if (!game) return;
    const stage = game.stages[game.stage_idx];
    const playing = game.state === 'playing' || game.state === 'claim';
    $('patMini').innerHTML = patHtml(stage);
    $('patMini').title = NAME[stage];
    $('bingoBtn').disabled = !playing;
    $('hint').innerHTML = game.state === 'lobby' ? 'Bíddu eftir að stjórnandinn snúi hjólinu. Pikkaðu svo á tölurnar sem koma upp.'
      : playing ? `Spilað um <b style="color:var(--text)">${NAME[stage]}</b>: þú þarft ${HOW[stage]}.` : '';
    renderBanner();
  }

  $('grid').addEventListener('click', async e => {
    const b = e.target.closest('.cell'); if (!b || !game || game.state === 'finished') return;
    const i = +b.dataset.i; if (card[i] === 0) return;
    if (game.state === 'lobby') return toast('Bíddu þar til fyrsta talan er komin.');
    marked[i] = !marked[i]; renderCard();
    try { navigator.vibrate && navigator.vibrate(20); } catch (err) {}
    try {
      const r = await rpc('tb_mark', { p_player_id: me.player_id, p_token: me.token, p_cell: i + 1, p_marked: marked[i] });
      if (!r.ok) { marked[i] = !marked[i]; renderCard(); }
    } catch (err) { marked[i] = !marked[i]; renderCard(); toast(err.message); }
  });

  // ---------- BINGÓ! ----------
  $('bingoBtn').onclick = async () => {
    $('bingoBtn').disabled = true;
    try {
      const r = await rpc('tb_claim', { p_player_id: me.player_id, p_token: me.token });
      if (r.ok) { game.state = 'claim'; load(); }
      else if (r.reason === 'ekki_bingo') {
        toast(`Ekki BINGÓ ennþá! Þú þarft ${HOW[r.stage] || 'mynstrið'} af tölum sem eru komnar upp. Þú getur reynt aftur eftir næstu tölu.`, 6000);
        document.querySelectorAll('.cell.marked').forEach(c => { if (!shown.includes(+c.textContent)) c.classList.add('shake'); });
      }
      else if (r.reason === 'bida') toast('Bíddu eftir næstu tölu áður en þú kallar aftur.');
    } catch (err) { toast(err.message); }
    renderStatus();
  };

  function renderBanner() {
    const bn = $('banner');
    if (!game) return;
    let key = '', html = '', mine = false;
    if (game.state === 'claim' && game.claim) {
      const names = game.claim.names || [];
      mine = names.includes(me.name);
      key = 'claim' + names.join('|');
      const what = NAME[game.claim.stage] || '';
      html = mine
        ? `<h1>BINGÓ!</h1><p>Til hamingju! Vinningur: <b>${esc(what)}</b></p><p class="sub">Kerfið staðfesti spjaldið þitt. Láttu stjórnandann vita.</p>`
        : `<h1>BINGÓ!</h1><p><b>${esc(names.join(', '))}</b> ${names.length > 1 ? 'fengu' : 'fékk'} BINGÓ · ${esc(what)}</p><p class="sub">Ertu líka með? Ýttu á BINGÓ strax!</p>
           <button class="bingo-btn" id="bannerBingo" style="max-width:300px">BINGÓ!</button>`;
    } else if (game.state === 'finished') {
      key = 'fin';
      const w = game.winners || [];
      html = `<h1 style="font-size:44px">Bingóinu er lokið</h1>
        <div class="winners-list">${w.map(x => `<div><span>${esc(NAME[x.stage] || '')}</span><b>${esc(x.name)}</b></div>`).join('') || '<div><span>Enginn vinningshafi</span></div>'}</div>
        <button class="btn ghost small" id="newGame" style="margin-top:22px">Taka þátt í öðrum leik</button>`;
    }
    if (!key) { bn.classList.add('hidden'); bannerKey = ''; return; }
    if (key === bannerKey) return;
    bannerKey = key;
    bn.className = 'banner pop' + (mine ? ' me' : '');
    bn.innerHTML = html;
    const bb = $('bannerBingo'); if (bb) bb.onclick = () => $('bingoBtn').click();
    const ng = $('newGame'); if (ng) ng.onclick = () => { store.del('pq_tb_player'); location.href = location.pathname; };
    if (mine) { try { navigator.vibrate && navigator.vibrate([100, 60, 100, 60, 200]); } catch (e) {} }
  }

  // ---------- Ræsing ----------
  const saved = store.get('pq_tb_player');
  if (saved && (!urlCode || urlCode === saved.code)) { me = saved; start(); }
  else if (urlCode && params.get('n')) { join(); }
})();
