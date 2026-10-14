// Hljómey Tónlistarbingó – spjald í síma
(function () {
  const { client, rpc, store, esc } = window.PQ;
  const $ = id => document.getElementById(id);
  const STAGE = { line: '1 lína', two_lines: '2 línur', full: 'Fullt spjald' };
  const STAGE_HOW = { line: 'heila röð, dálk eða skálínu', two_lines: 'tvær heilar línur', full: 'allt spjaldið' };

  let me = null, card = null, game = null, channel = null;
  let bannerKey = '';

  function toast(msg, ms) { const t = $('toast'); t.textContent = msg; t.classList.remove('hidden'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.add('hidden'), ms || 3500); }

  // ---------- Skráning ----------
  const params = new URLSearchParams(location.search);
  const urlCode = (params.get('k') || '').toUpperCase();
  $('codeIn').value = urlCode;
  $('nameIn').value = params.get('n') || store.get('pq_name') || '';

  async function join() {
    $('joinErr').classList.add('hidden'); $('joinBtn').disabled = true;
    try {
      const code = $('codeIn').value.trim().toUpperCase();
      const r = await rpc('bingo_join', { p_code: code, p_name: $('nameIn').value });
      me = { game_id: r.game_id, player_id: r.player_id, token: r.token, name: r.name, code };
      store.set('pq_bingo_player', me); store.set('pq_name', r.name);
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
    subscribe(); load();
    setInterval(() => { if (!document.hidden) load(); }, 8000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
  }
  function subscribe() {
    channel = client.channel('bingo-' + me.game_id)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'bingo_games', filter: 'id=eq.' + me.game_id },
          p => onGame(p.new))
      .subscribe(st => { $('conn').classList.toggle('hidden', st === 'SUBSCRIBED'); if (st === 'SUBSCRIBED') load(); });
  }
  let loading = false;
  async function load() {
    if (loading) return; loading = true;
    try {
      const d = await rpc('bingo_my_card', { p_player_id: me.player_id, p_token: me.token });
      card = d.cells; game = d.game; renderCard(); renderStatus();
    } catch (e) {
      if (e.code === 'ogildur_leikmadur') { store.del('pq_bingo_player'); location.reload(); }
    } finally { loading = false; }
  }
  function onGame(g) {
    const prev = game || {};
    game = Object.assign({}, game, g);
    renderStatus();
    // Erfiða útgáfan: nýtt lag opnar læsta reiti
    if (game.card_mode === 'artist_hard' && g.played_count !== prev.played_count) load();
  }

  // ---------- Spjaldið ----------
  function cellText(c) {
    if (c.free) return '<span class="tx">FRÍTT</span>';
    if (game.card_mode === 'artist_hard') return `<span class="tx">${esc(c.artist)}</span>`;
    if (game.card_mode === 'song') return `<span class="tx">${esc(c.title)}</span>`;
    return `<span class="tx">${esc(c.title)}</span><small>${esc(c.artist)}</small>`;
  }
  function renderCard() {
    const n = (game && game.grid_size) || Math.round(Math.sqrt(card.length));
    $('grid').style.setProperty('--n', n);
    $('grid').className = 'grid5 n' + n;
    $('grid').innerHTML = card.map((c, i) =>
      `<button class="cell ${c.free ? 'free' : ''} ${c.marked ? 'marked' : ''} ${c.locked && !c.marked ? 'locked' : ''}" data-i="${i}">${cellText(c)}</button>`).join('');
  }
  function renderStatus() {
    if (!game) return;
    const stage = game.stages[game.stage_idx];
    const playing = game.state === 'playing' || game.state === 'claim';
    $('stLeft').innerHTML = game.state === 'lobby' ? 'Bíð eftir að bingóið hefjist'
      : game.state === 'finished' ? 'Bingóinu er lokið' : `Lag <b>${game.played_count}</b> af ${game.total_songs}`;
    $('stRight').innerHTML = playing ? `Spilað um: <b>${STAGE[stage]}</b>` : '';
    $('bingoBtn').disabled = !playing;
    if (!$('hint').dataset.busy) {
      $('hint').textContent = game.state === 'lobby'
        ? (game.card_mode === 'artist_hard' ? 'Erfitt: pikkaðu á flytjanda og veldu rétt lag til að merkja.' : 'Pikkaðu á reit til að merkja við lag sem hefur verið spilað.')
        : playing ? `Þú þarft ${STAGE_HOW[stage]} til að fá BINGÓ.` : '';
    }
    renderBanner();
  }

  $('grid').addEventListener('click', async e => {
    const b = e.target.closest('.cell'); if (!b || !game || game.state === 'finished') return;
    const c = card[+b.dataset.i]; if (c.free) return;
    if (game.state === 'lobby') return toast('Bíddu þar til fyrsta lagið hefur verið spilað.');
    if (game.card_mode === 'artist_hard' && !c.marked) {
      if (c.locked) return toast('Reiturinn er læstur fram að næsta lagi.');
      return openSheet(c, +b.dataset.i);
    }
    // Auðvelda útgáfan: merkja/afmerkja strax
    c.marked = !c.marked; renderCard();
    try { navigator.vibrate && navigator.vibrate(20); } catch (err) {}
    try {
      const r = await rpc('bingo_mark', { p_player_id: me.player_id, p_token: me.token, p_song_no: c.song_no, p_marked: c.marked, p_guess: null });
      if (!r.ok) { c.marked = !c.marked; renderCard(); }
    } catch (err) { c.marked = !c.marked; renderCard(); toast(err.message); }
  });

  // Erfiða útgáfan: velja rétt lagaheiti
  let sheetCell = null, sheetIdx = -1;
  function openSheet(c, i) {
    sheetCell = c; sheetIdx = i;
    $('sheetArtist').textContent = c.artist;
    $('sheetOpts').innerHTML = (c.options || []).map((o, k) => `<button class="opt-btn" data-k="${k}">${esc(o)}</button>`).join('');
    $('sheet').classList.remove('hidden');
  }
  function closeSheet() { $('sheet').classList.add('hidden'); sheetCell = null; }
  $('sheetCancel').onclick = closeSheet;
  $('sheet').addEventListener('click', async e => {
    if (e.target.id === 'sheet') return closeSheet();
    const b = e.target.closest('.opt-btn'); if (!b || !sheetCell) return;
    const c = sheetCell, i = sheetIdx; closeSheet();
    try {
      const r = await rpc('bingo_mark', { p_player_id: me.player_id, p_token: me.token, p_song_no: c.song_no, p_marked: true, p_guess: +b.dataset.k });
      if (r.ok) { c.marked = true; renderCard(); try { navigator.vibrate && navigator.vibrate(20); } catch (err) {} }
      else {
        c.locked = true; renderCard();
        const el = document.querySelector(`.cell[data-i="${i}"]`); if (el) el.classList.add('shake');
        toast(r.reason === 'rangt' ? 'Rangt lag! Reiturinn er læstur fram að næsta lagi.' : 'Reiturinn er læstur fram að næsta lagi.');
      }
    } catch (err) { toast(err.message); }
  });

  // ---------- BINGÓ! ----------
  $('bingoBtn').onclick = async () => {
    $('bingoBtn').disabled = true;
    try {
      const r = await rpc('bingo_claim', { p_player_id: me.player_id, p_token: me.token });
      if (r.ok) { game.state = 'claim'; load(); }
      else if (r.reason === 'ekki_bingo') toast(`Ekki BINGÓ ennþá! Þú þarft ${STAGE_HOW[r.stage]} af lögum sem hafa verið spiluð. Þú getur reynt aftur eftir næsta lag.`, 6000);
      else if (r.reason === 'bida') toast('Bíddu eftir næsta lagi áður en þú kallar aftur.');
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
      html = mine
        ? `<h1>BINGÓ!</h1><p>Til hamingju – þú fékkst ${STAGE[game.claim.stage].toLowerCase()}!</p><p class="sub">Kerfið staðfesti spjaldið þitt. Láttu stjórnandann vita.</p>`
        : `<h1>BINGÓ!</h1><p><b>${esc(names.join(', '))}</b> ${names.length > 1 ? 'fengu' : 'fékk'} ${STAGE[game.claim.stage].toLowerCase()}.</p><p class="sub">Ertu líka með? Ýttu á BINGÓ strax!</p>
           <button class="bingo-btn" id="bannerBingo" style="max-width:300px">BINGÓ!</button>`;
    } else if (game.state === 'finished') {
      key = 'fin';
      const w = game.winners || [];
      html = `<h1 style="font-size:44px">Bingóinu er lokið</h1>
        <div class="winners-list">${w.map(x => `<div><span>${STAGE[x.stage]}</span><b>${esc(x.name)}</b></div>`).join('') || '<div><span>Enginn vinningshafi</span></div>'}</div>
        <button class="btn ghost small" id="newGame" style="margin-top:22px">Taka þátt í öðrum leik</button>`;
    }
    if (!key) { bn.classList.add('hidden'); bannerKey = ''; return; }
    if (key === bannerKey) return;
    bannerKey = key;
    bn.className = 'banner pop' + (mine ? ' me' : '');
    bn.innerHTML = html;
    const bb = $('bannerBingo'); if (bb) bb.onclick = () => $('bingoBtn').click();
    const ng = $('newGame'); if (ng) ng.onclick = () => { store.del('pq_bingo_player'); location.href = location.pathname; };
    if (mine) { try { navigator.vibrate && navigator.vibrate([100, 60, 100, 60, 200]); } catch (e) {} }
  }

  // ---------- Ræsing ----------
  const saved = store.get('pq_bingo_player');
  if (saved && (!urlCode || urlCode === saved.code)) { me = saved; start(); }
  else if (urlCode && params.get('n')) { join(); }
})();
