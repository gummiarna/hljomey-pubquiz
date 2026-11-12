// Hvaða ár? Bingó – spjald og svör í síma
(function () {
  const { client, rpc, store, esc } = window.PQ;
  const { CATS, STAGE_NAME, STAGE_HOW, LETTERS, patHtml } = window.HB;
  const $ = id => document.getElementById(id);
  const SPIN_MS = 5500;   // hjólið snýst á stóra skjánum áður en spurningin opnast

  let me = null, st = null, openAt = 0, openTimer = null, tbar = null, lastRound = -1, lastMarked = null, bannerKey = '', sending = false;

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
      const r = await rpc('hb_join', { p_code: code, p_name: $('nameIn').value });
      me = { game_id: r.game_id, player_id: r.player_id, token: r.token, name: r.name, code };
      store.set('pq_hb_player', me); store.set('pq_name', r.name);
      start();
    } catch (e) { $('joinErr').textContent = e.message; $('joinErr').classList.remove('hidden'); }
    $('joinBtn').disabled = false;
  }
  $('joinBtn').onclick = join;
  $('nameIn').addEventListener('keydown', e => { if (e.key === 'Enter') join(); });

  // ---------- Tenging ----------
  function start() {
    $('vJoin').classList.add('hidden'); $('vGame').classList.remove('hidden');
    $('me').textContent = me.name; $('me').classList.remove('hidden');
    client.channel('hb-' + me.game_id)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'hb_games', filter: 'id=eq.' + me.game_id }, () => load())
      .subscribe(s => { $('conn').classList.toggle('hidden', s === 'SUBSCRIBED'); if (s === 'SUBSCRIBED') load(); });
    load(true);
    setInterval(() => { if (!document.hidden) load(); }, 6000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
  }
  let loading = false, again = false;
  async function load(first) {
    if (loading) { again = true; return; }
    loading = true;
    try {
      const d = await rpc('hb_my_state', { p_player: me.player_id, p_token: me.token });
      const g = d.game;
      // Ný spurning: opnast þegar hjólið hefur stöðvast á stóra skjánum
      if (g.state === 'question' && g.round_no !== lastRound) {
        lastRound = g.round_no;
        openAt = first ? Date.now() : Date.now() + SPIN_MS;
        if (!first) { const left = (new Date(g.started_at).getTime() - Date.now()); if (left < SPIN_MS && left > -30000) openAt = Date.now() + Math.max(0, Math.min(SPIN_MS, left)); }
        clearTimeout(openTimer); openTimer = setTimeout(render, Math.max(0, openAt - Date.now()) + 30);
      }
      st = d; render();
    } catch (e) {
      if (e.code === 'ogildur_leikmadur') { store.del('pq_hb_player'); location.reload(); }
    } finally { loading = false; if (again) { again = false; load(); } }
  }

  // ---------- Teikning ----------
  function render() {
    if (!st) return;
    const g = st.game;
    renderBox(g); renderCard(g);
    $('score').textContent = st.score || 0;
    const stage = g.stages[g.stage_idx];
    $('stageName').textContent = STAGE_NAME[stage]; $('patMini').innerHTML = patHtml(stage);
    renderBanner(g);
  }
  function renderBox(g) {
    const box = $('box');
    clearInterval(tbar);
    if (g.state === 'lobby') { box.innerHTML = `<h2>Þú ert með!</h2><div class="muted">Bíddu eftir að stjórnandinn snúi hjólinu. Spjaldið þitt er hér fyrir neðan: hver reitur er flokkur.</div>`; return; }
    if (g.state === 'finished') { box.innerHTML = `<h2>Leiknum er lokið</h2><div class="muted">Takk fyrir að spila!</div>`; return; }
    const c = CATS[g.category] || { name: '', color: 'var(--line)', q: '' };
    if (g.state === 'question' && Date.now() < openAt) {
      box.innerHTML = `<div class="spin"><div class="disc"></div><div><h2 style="margin:0">Hjólið snýst…</h2><div class="muted">Fylgstu með stóra skjánum</div></div></div>`;
      return;
    }
    const opts = g.options || [], a = st.answer, rev = g.state === 'reveal' && g.reveal;
    const right = rev ? g.reveal.answer_idx : null;
    let top = `<span class="cat" style="background:${c.color}">${c.name}</span><h2>${c.q}</h2>`;
    if (rev) {
      top = `<span class="cat" style="background:${c.color}">${c.name}</span>`
        + (a ? (a.ok ? `<p class="res ok">Rétt! ${a.cell ? 'Reitur merktur á spjaldinu.' : 'Allir reitir þessa flokks eru þegar merktir.'}</p>` : `<p class="res no">Ekki rétt í þetta sinn</p>`)
             : `<p class="res no">Ekkert svar</p>`)
        + `<div class="muted" style="margin-bottom:10px"><b style="color:var(--text)">${esc(g.reveal.title)}</b> · ${esc(g.reveal.artist)} · ${g.reveal.year}</div>`;
    } else if (a) {
      top += `<div class="muted" style="margin-bottom:8px">Svar sent! Bíddu eftir rétta svarinu.</div>`;
    } else top += `<div class="tbar"><i id="tb"></i></div>`;
    box.innerHTML = top + `<div class="opts">${opts.map((t, i) => {
      const cls = rev ? (i === right ? 'right' : a && a.choice === i ? 'wrong' : '') : a && a.choice === i ? 'picked' : '';
      return `<button data-i="${i}" class="${cls}" ${a || rev ? 'disabled' : ''}><i>${LETTERS[i]}</i><span>${esc(t)}</span></button>`;
    }).join('')}</div>`;
    if (!a && !rev) {
      const end = openAt + g.secs * 1000;
      const upd = () => { const p = Math.max(0, (end - Date.now()) / (g.secs * 1000)); const el = $('tb'); if (el) el.style.width = (p * 100) + '%'; if (p <= 0) clearInterval(tbar); };
      upd(); tbar = setInterval(upd, 250);
    }
  }
  function renderCard(g) {
    const card = st.card, marked = st.marked;
    const newCell = g.state === 'reveal' && st.answer && st.answer.ok ? st.answer.cell : null;
    const changed = lastMarked && marked.some((m, i) => m && !lastMarked[i]);
    $('grid').innerHTML = card.map((k, i) => k === 'free'
      ? `<div class="cell free">FRÍTT</div>`
      : `<div class="cell ${marked[i] ? 'on' : ''} ${g.state === 'question' && k === g.category && Date.now() >= openAt ? 'now' : ''} ${changed && newCell === i + 1 ? 'new' : ''}" style="--cc:${CATS[k].color}">${CATS[k].short}</div>`).join('');
    if (changed) { try { navigator.vibrate && navigator.vibrate(40); } catch (e) {} }
    lastMarked = marked.slice();
  }

  $('box').addEventListener('click', async e => {
    const b = e.target.closest('button[data-i]'); if (!b || sending || !st || st.answer) return;
    sending = true;
    const i = +b.dataset.i;
    st.answer = { choice: i, ok: null }; renderBox(st.game);
    try {
      const r = await rpc('hb_answer', { p_player: me.player_id, p_token: me.token, p_round: st.game.round_no, p_choice: i });
      if (!r.ok) { st.answer = null; toast(r.reason === 'of_seint' ? 'Of seint! Tíminn er liðinn.' : 'Svarið náði ekki í gegn. Reyndu aftur.'); load(); }
    } catch (err) { st.answer = null; toast(err.message); renderBox(st.game); }
    sending = false;
  });

  function renderBanner(g) {
    const bn = $('banner');
    let key = '', html = '', mine = false;
    const nw = (g.state === 'reveal' && g.reveal && g.reveal.new_winners) || [];
    if (nw.length) {
      const names = nw.map(x => x.name); mine = names.includes(me.name);
      key = 'w' + g.round_no;
      const what = STAGE_NAME[nw[0].stage] || '';
      html = mine ? `<h1>BINGÓ!</h1><p>Til hamingju! Vinningur: <b>${esc(what)}</b></p><p class="sub">Kerfið hefur staðfest spjaldið þitt.</p>`
                  : `<h1>BINGÓ!</h1><p><b>${esc(names.join(', '))}</b> ${names.length > 1 ? 'fengu' : 'fékk'} BINGÓ · ${esc(what)}</p>`;
      html += `<button class="btn ghost small" id="closeB" style="margin-top:22px">Loka</button>`;
    } else if (g.state === 'finished') {
      key = 'fin';
      const w = g.winners || [];
      html = `<h1 style="font-size:40px">Leiknum er lokið</h1>
        <div class="winners-list">${w.map(x => `<div><span>${esc(STAGE_NAME[x.stage] || '')}</span><b>${esc(x.name)}</b></div>`).join('') || '<div><span>Enginn fékk BINGÓ</span></div>'}</div>
        <p class="sub">Þú svaraðir ${st.score || 0} sinnum rétt.</p>
        <button class="btn ghost small" id="newGame" style="margin-top:22px">Taka þátt í öðrum leik</button>`;
    }
    if (!key) { bn.classList.add('hidden'); return; }
    if (key === bannerKey) return;
    bannerKey = key;
    bn.className = 'banner pop' + (mine ? ' me' : '');
    bn.innerHTML = html;
    const cb = $('closeB'); if (cb) cb.onclick = () => bn.classList.add('hidden');
    const ng = $('newGame'); if (ng) ng.onclick = () => { store.del('pq_hb_player'); location.href = 'index.html'; };
    if (mine) { try { navigator.vibrate && navigator.vibrate([100, 60, 100, 60, 200]); } catch (e) {} }
  }

  // ---------- Ræsing ----------
  const saved = store.get('pq_hb_player');
  if (saved && (!urlCode || urlCode === saved.code)) { me = saved; start(); }
  else if (urlCode && params.get('n')) { join(); }
})();
