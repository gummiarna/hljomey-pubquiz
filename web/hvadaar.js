// Hljómey „Hvaða ár?“ – sameiginleg hjálparföll og síminn (hvadaar.html?k=KÓÐI)
(function () {
  const { client, rpc, store, esc } = window.PQ;
  const root = document.getElementById('root');
  const params = new URLSearchParams(location.search);
  const CODE = (params.get('k') || '').trim().toUpperCase();

  function toast(msg, bad) {
    const t = document.getElementById('toast2'); t.textContent = msg; t.classList.toggle('bad', !!bad); t.classList.remove('hidden');
    clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.add('hidden'), 4500);
  }
  const fmt = n => String(Math.round(+n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  function slotLabel(tl, i) {
    const n = tl.length;
    if (!n) return 'Hér';
    if (i === 0) return 'Fyrir ' + tl[0].year;
    if (i === n) return 'Eftir ' + tl[n - 1].year;
    const a = tl[i - 1].year, b = tl[i].year;
    return a === b ? 'Líka ' + a : 'Milli ' + a + ' og ' + b;
  }
  window.HA = { toast, fmt, slotLabel, CODE, root };
  if (!CODE) return;   // stjórnandi: hvadaar-host.js

  // =====================================================================
  //  SÍMINN
  // =====================================================================
  document.body.classList.add('player');
  let me = store.get('ha_player');
  if (me && me.code !== CODE) me = null;
  let st = null, sel = { slot: null, artist: null, year: null }, selRound = 0;
  let channel = null, countdown = null, deadline = 0, lastKey = '', syncing = false;

  const cardHtml = (c, isNew) => `<div class="card2${isNew ? ' new' : ''}">${c.cover ? `<img src="${esc(c.cover)}" alt="" loading="lazy">` : '<span class="ph"></span>'}
    <span class="y">${c.year}</span><div class="tx"><b>${esc(c.title)}</b><small>${esc(c.artist)}</small></div></div>`;
  function top() {
    return `<div class="ptop"><div class="brand">Hvaða <span>ár?</span></div>${me ? `<div class="me"><b>${esc(me.name)}</b>${st ? `${st.player.cards} spil · ${st.player.tokens} tákn` : ''}</div>` : ''}</div>`;
  }

  // ---------- Skráning ----------
  function joinView(err) {
    const nm = store.get('ha_name') || store.get('pq_name') || params.get('n') || '';
    root.innerHTML = `<div class="pwrap2">${top()}
      <div class="pcard"><h2>Hvaða ár?</h2><p>Lögin hljóma í salnum. Þú setur hvert lag á réttan stað á tímalínunni þinni. Fyrst/ur í mark vinnur.</p>
        <label for="nm">Nafn eða lið</label><input type="text" id="nm" maxlength="20" autocomplete="nickname" value="${esc(nm)}" placeholder="t.d. Lundarnir">
        <div style="height:12px"></div><button class="btn" id="go">Taka þátt</button>
        ${err ? `<div class="err">${esc(err)}</div>` : ''}</div></div>`;
    const go = async () => {
      const name = document.getElementById('nm').value.trim(); if (!name) return;
      document.getElementById('go').disabled = true;
      try {
        const r = await rpc('ha_join', { p_code: CODE, p_name: name });
        me = { game_id: r.game_id, player_id: r.player_id, token: r.token, name: r.name, code: CODE };
        store.set('ha_player', me); store.set('ha_name', r.name);
        room();
      } catch (e) { joinView(e.message); }
    };
    document.getElementById('go').onclick = go;
    document.getElementById('nm').addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
  }

  // ---------- Tenging ----------
  function room() {
    root.innerHTML = `<div class="pwrap2">${top()}<div class="spinner2"></div></div>`;
    if (channel) client.removeChannel(channel);
    channel = client.channel('ha-' + me.game_id)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'ha_games', filter: 'id=eq.' + me.game_id }, () => sync())
      .subscribe(s => { const c = document.getElementById('conn2'); if (c) c.classList.toggle('hidden', s === 'SUBSCRIBED'); if (s === 'SUBSCRIBED') sync(); });
    setInterval(() => { if (!document.hidden) sync(); }, 6000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(); });
    sync();
  }
  async function sync() {
    if (syncing) { sync.again = true; return; }
    syncing = true;
    try {
      st = await rpc('ha_my_state', { p_player: me.player_id, p_token: me.token });
      render();
    } catch (e) {
      if (e.code === 'ogildur_leikmadur') { store.del('ha_player'); me = null; joinView(); }
    } finally { syncing = false; if (sync.again) { sync.again = false; sync(); } }
  }

  function render() {
    const g = st.game;
    const key = [g.state, g.current_round, st.answer ? 1 : 0, st.player.cards, st.player.tokens, st.timeline.length, (g.winners || []).length].join(':');
    if (key === lastKey) return;
    lastKey = key;
    clearInterval(countdown);
    if (g.state === 'lobby') return waitView();
    if (g.state === 'question') return st.answer ? sentView() : questionView();
    if (g.state === 'finished') return finalView();
    return resultView();
  }

  // ---------- Bið ----------
  function waitView() {
    const tl = st.timeline;
    root.innerHTML = `<div class="pwrap2">${top()}
      <div class="pcard" style="text-align:center"><div class="spinner2" style="margin-top:6px"></div><h2>Þú ert með!</h2><p>Fyrsta lagið kemur bráðum. Fylgstu með skjánum.</p></div>
      <div class="sec-h">Byrjunarspilið þitt</div><div class="tl">${tl.map(c => cardHtml(c)).join('')}</div>
      <p class="hint" style="margin-top:14px">Þegar lag hljómar setur þú það fyrir framan, aftan eða á milli spilanna þinna eftir því hvenær það kom út.</p></div>`;
  }

  // ---------- Spurning ----------
  function questionView() {
    const g = st.game, tl = st.timeline;
    if (selRound !== g.current_round) { sel = { slot: null, artist: null, year: null }; selRound = g.current_round; }
    const arts = g.current_artists || [];
    root.innerHTML = `<div class="pwrap2">${top()}
      <div class="qbar"><span>Lag ${g.current_round}</span><span class="t" id="cd">${g.answer_seconds ? '' : '∞'}</span></div>
      <div class="qtitle">Hvar á lagið heima?</div>
      <div class="tl" id="tl"></div>
      <div class="bonus"><h3>Bónus (má sleppa)</h3><p>Réttur flytjandi gefur 1 tákn og nákvæmt ár annað. Þrjú tákn má skipta fyrir aukaspil.</p>
        <div class="arts" id="arts">${arts.map((a, i) => `<button type="button" data-a="${i}">${esc(a)}</button>`).join('')}</div>
        <div class="yrpick"><button type="button" data-y="-1" aria-label="Fyrra ár">−</button><input type="number" id="yr" inputmode="numeric" placeholder="Ár" min="1900" max="2100"><button type="button" data-y="1" aria-label="Næsta ár">+</button><button type="button" class="clr" id="yclr">Hreinsa</button></div>
      </div></div>
      <div class="sendbar"><button class="btn" id="send" disabled>Veldu stað á tímalínunni</button></div>`;
    drawTl();
    document.getElementById('tl').addEventListener('click', e => { const b = e.target.closest('[data-slot]'); if (!b) return; sel.slot = +b.dataset.slot; drawTl(); updSend(); try { navigator.vibrate && navigator.vibrate(15); } catch (x) {} });
    document.getElementById('arts').addEventListener('click', e => {
      const b = e.target.closest('[data-a]'); if (!b) return;
      sel.artist = sel.artist === +b.dataset.a ? null : +b.dataset.a;
      document.querySelectorAll('#arts button').forEach(x => x.classList.toggle('on', +x.dataset.a === sel.artist));
    });
    if (sel.artist != null) document.querySelectorAll('#arts button').forEach(x => x.classList.toggle('on', +x.dataset.a === sel.artist));
    const yr = document.getElementById('yr');
    if (sel.year) yr.value = sel.year;
    yr.addEventListener('input', () => { const v = +yr.value; sel.year = v >= 1900 && v <= 2100 ? v : null; });
    document.querySelectorAll('[data-y]').forEach(b => b.onclick = () => {
      let v = +yr.value;
      if (!v) v = guessYear();
      else v += +b.dataset.y;
      v = Math.max(1900, Math.min(2100, v)); yr.value = v; sel.year = v;
    });
    document.getElementById('yclr').onclick = () => { yr.value = ''; sel.year = null; };
    document.getElementById('send').onclick = send;
    updSend();
    if (g.answer_seconds) {
      deadline = Date.now() + Math.max(0, g.seconds_left == null ? g.answer_seconds : g.seconds_left) * 1000;
      const tick = () => {
        const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
        const el = document.getElementById('cd'); if (el) el.textContent = Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0');
        if (left <= 0) { clearInterval(countdown); timeUp(); }
      };
      tick(); countdown = setInterval(tick, 250);
    }
  }
  function guessYear() {
    const tl = st.timeline, i = sel.slot;
    if (i == null || !tl.length) return 1990;
    if (i === 0) return tl[0].year - 5;
    if (i === tl.length) return Math.min(new Date().getFullYear(), tl[tl.length - 1].year + 5);
    return Math.round((tl[i - 1].year + tl[i].year) / 2);
  }
  function drawTl() {
    const tl = st.timeline, box = document.getElementById('tl'); if (!box) return;
    let h = '';
    for (let i = 0; i <= tl.length; i++) {
      h += `<button type="button" class="slot${sel.slot === i ? ' on' : ''}" data-slot="${i}">${sel.slot === i ? '♪ Hér: ' : '+ '}${esc(window.HA.slotLabel(tl, i))}</button>`;
      if (i < tl.length) h += cardHtml(tl[i]);
    }
    box.innerHTML = h;
  }
  function updSend() {
    const b = document.getElementById('send'); if (!b) return;
    b.disabled = sel.slot == null;
    b.textContent = sel.slot == null ? 'Veldu stað á tímalínunni' : 'Senda svar';
  }
  async function send() {
    const b = document.getElementById('send'); b.disabled = true; b.textContent = 'Sendi…';
    try {
      const r = await rpc('ha_place', { p_player: me.player_id, p_token: me.token, p_slot: sel.slot, p_artist: sel.artist, p_year: sel.year });
      if (!r.ok && r.reason === 'of_seint') toast('Tíminn var búinn.', true);
      lastKey = ''; await sync();
    } catch (e) { toast(e.message, true); b.disabled = false; updSend(); }
  }
  function timeUp() {
    root.querySelector('.sendbar') && (root.querySelector('.sendbar').innerHTML = '<div class="hint" style="text-align:center">Tíminn er búinn. Bíðum eftir svarinu…</div>');
  }

  function sentView() {
    const a = st.answer, tl = st.timeline, g = st.game;
    const lbl = window.HA.slotLabel(tl, a.slot);
    root.innerHTML = `<div class="pwrap2">${top()}
      <div class="pcard" style="text-align:center"><div class="wave on" style="height:60px"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
        <h2>Svar sent!</h2><p>Þú settir lagið: <b style="color:var(--text)">${esc(lbl)}</b>${a.year_guess ? ` · ágiskun ${a.year_guess}` : ''}${a.artist_choice != null && g.current_artists ? ` · ${esc(g.current_artists[a.artist_choice])}` : ''}</p>
        <p class="hint" style="margin:0">Hlustaðu áfram á meðan hinir svara.</p></div>
      <div class="sec-h">Tímalínan þín</div><div class="tl">${tl.map(c => cardHtml(c)).join('')}</div></div>`;
  }

  // ---------- Niðurstaða ----------
  function stats() {
    const p = st.player, g = st.game;
    return `<div class="stat3"><div><b>${p.cards}<small style="font-size:14px;color:var(--muted)">/${g.target}</small></b><small>spil</small></div>
      <div><b>${p.tokens}</b><small>tákn</small></div><div><b>${p.rank}.</b><small>sæti af ${p.total}</small></div></div>`;
  }
  function resultView() {
    const g = st.game, rv = g.current_reveal || {}, a = st.answer, tl = st.timeline;
    let cls = 'none', big = 'Ekkert svar', sub = 'Vertu fljótari næst!';
    if (a) {
      cls = a.placed_ok ? 'good' : 'bad';
      big = a.placed_ok ? 'Rétt!' : 'Rangt';
      sub = a.placed_ok ? 'Spilið fer á tímalínuna þína.' : `Þú settir það ${esc(lowerFirst(slotLabelFromAnswer(a)))}.`;
    }
    const bon = a ? [a.artist_ok ? '+1 tákn: flytjandinn' : '', a.year_ok ? '+1 tákn: nákvæmt ár!' : ''].filter(Boolean) : [];
    const win = (g.winners || []).length ? `<div class="pcard" style="text-align:center;border-color:var(--accent)"><h2 style="color:var(--accent)">${g.winners.includes(me.name) ? 'Þú vannst!' : esc(g.winners[0]) + ' vann!'}</h2><p style="margin:0">Fyrst/ur í ${g.target} spil.</p></div>` : '';
    root.innerHTML = `<div class="pwrap2">${top()}
      <div class="res ${cls} pop"><p class="big">${big}</p><div class="yr">${rv.year || ''}</div>
        <div class="sg"><b>${esc(rv.title || '')}</b><br>${esc(rv.artist || '')}</div>
        <div class="sg" style="margin-top:8px">${sub}</div>
        ${bon.length ? `<div class="bon">${bon.map(x => `<span>${x}</span>`).join('')}</div>` : ''}</div>
      ${win}${stats()}
      ${st.player.tokens >= 3 && g.state !== 'finished' ? `<button class="btn ghost" id="trade" style="width:100%;margin-top:12px">Skipta 3 táknum fyrir aukaspil</button>` : ''}
      <div class="sec-h">Tímalínan þín</div><div class="tl">${tl.map(c => cardHtml(c, c.round_no === g.current_round && c.source === 'round')).join('')}</div></div>`;
    const t = document.getElementById('trade');
    if (t) t.onclick = async () => {
      t.disabled = true;
      try { const c = await rpc('ha_trade', { p_player: me.player_id, p_token: me.token }); toast(`Nýtt spil: ${c.year} – ${c.title}`); lastKey = ''; sync(); }
      catch (e) { toast(e.message, true); t.disabled = false; }
    };
  }
  const lowerFirst = s => s ? s[0].toLowerCase() + s.slice(1) : s;
  function slotLabelFromAnswer(a) {
    if (a.lo == null && a.hi == null) return 'á tímalínuna';
    if (a.lo == null) return 'fyrir ' + a.hi;
    if (a.hi == null) return 'eftir ' + a.lo;
    return a.lo === a.hi ? 'við ' + a.lo : 'milli ' + a.lo + ' og ' + a.hi;
  }
  function finalView() {
    const g = st.game, p = st.player;
    root.innerHTML = `<div class="pwrap2">${top()}
      <div class="res ${p.rank <= 3 ? 'good' : 'none'} pop"><p class="big">${p.rank === 1 ? 'Þú vannst!' : 'Leik lokið'}</p><div class="yr">${p.rank}.</div><div class="sg">sæti af ${p.total}</div></div>
      ${stats()}
      <div class="sec-h">Tímalínan þín</div><div class="tl">${st.timeline.map(c => cardHtml(c)).join('')}</div>
      <button class="btn ghost" id="again" style="width:100%;margin-top:16px">Taka þátt í öðrum leik</button></div>`;
    document.getElementById('again').onclick = () => { store.del('ha_player'); location.href = 'index.html'; };
  }

  root.insertAdjacentHTML('afterend', '<div class="conn2 hidden" id="conn2">Tengist…</div>');
  if (me) room(); else joinView();
  window.__HA_P = { get st() { return st; }, get sel() { return sel; }, sync: () => { lastKey = ''; return sync(); } };
})();
