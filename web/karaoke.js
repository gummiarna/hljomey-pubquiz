// Hljómey Karaoke – YouTube-karaoke með biðröð í símanum.
//   karaoke.html         → stjórnandi (sjónvarpið): spilari, QR, biðröð
//   karaoke.html?k=KÓÐI  → gestir (síminn): leita, hlusta, velja, biðröð
(function () {
  const { client, rpc, store, esc } = window.PQ;
  const app = document.getElementById('app');
  const params = new URLSearchParams(location.search);
  const CODE = (params.get('k') || '').trim().toUpperCase();
  const YT_API = 'https://www.googleapis.com/youtube/v3/';
  const COLS = 'id,singer,video_id,title,channel,duration,position,status';

  const I = {
    mic: '<svg class="ico" viewBox="0 0 24 24"><rect x="9" y="2.5" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"/></svg>',
    play: '<svg class="ico" viewBox="0 0 24 24"><path d="M7 4.5v15l12-7.5z" fill="currentColor" stroke="none"/></svg>',
    pause: '<svg class="ico" viewBox="0 0 24 24"><path d="M8 5v14M16 5v14" stroke-width="3"/></svg>',
    next: '<svg class="ico" viewBox="0 0 24 24"><path d="M5 5v14l10-7z" fill="currentColor" stroke="none"/><path d="M18 5v14" stroke-width="2.6"/></svg>',
    plus: '<svg class="ico" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
    gear: '<svg class="ico" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
    full: '<svg class="ico" viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
    side: '<svg class="ico" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/></svg>',
    listen: '<svg class="ico" viewBox="0 0 24 24"><path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="3" y="14" width="4.5" height="6" rx="1.5"/><rect x="16.5" y="14" width="4.5" height="6" rx="1.5"/></svg>'
  };

  // ---------- Hjálparföll ----------
  const fmtDur = s => s ? Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') : '';
  const isoDur = iso => { const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso || ''); return m ? (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0) : null; };
  const decode = s => { const t = document.createElement('textarea'); t.innerHTML = s || ''; return t.value; };
  const thumb = id => 'https://i.ytimg.com/vi/' + id + '/mqdefault.jpg';
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => (Math.random() * 16 | 0).toString(16)));
  const isMissing = e => /Could not find the function|karaoke_|PGRST202|does not exist/i.test(e.message || '') && !e.code;
  function toast(msg, bad) {
    const t = document.getElementById('toast'); t.textContent = msg; t.classList.toggle('bad', !!bad); t.classList.remove('hidden');
    clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.add('hidden'), 4200);
  }
  function videoIdFrom(s) {
    s = String(s || '').trim();
    const m = s.match(/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/|v\/))([A-Za-z0-9_-]{11})/);
    return m ? m[1] : null;
  }
  function qrSvg(url) { const q = window.qrcode(0, 'M'); q.addData(url); q.make(); return q.createSvgTag({ cellSize: 8, margin: 2, scalable: true }); }
  const joinUrl = code => new URL('karaoke.html?k=' + code, location.href).href;
  const prettyUrl = () => new URL('./', location.href).href.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const guestId = (() => { let g = store.get('kk_guest'); if (!g) { g = uuid(); store.set('kk_guest', g); } return g; })();
  let wake = null;
  function keepAwake() { if ('wakeLock' in navigator && !wake) navigator.wakeLock.request('screen').then(w => { wake = w; w.addEventListener('release', () => { wake = null; }); }).catch(() => {}); }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && keepAwake.on) keepAwake(); });

  // ---------- Gagnalag ----------
  const D = {
    session: async code => { const { data, error } = await client.from('karaoke_sessions').select('*').eq('code', code).maybeSingle(); if (error) throw error; return data; },
    queue: async code => { const { data, error } = await client.from('karaoke_queue').select(COLS).eq('code', code).in('status', ['queued', 'current']).order('position'); if (error) throw error; return data || []; },
    doneCount: async code => { const { data } = await client.from('karaoke_queue').select('id').eq('code', code).eq('status', 'done'); return (data || []).length; },
    songs: async () => { const { data, error } = await client.from('karaoke_songs').select('*').order('times_queued', { ascending: false }).order('last_queued', { ascending: false }).limit(500); if (error) throw error; return data || []; },
    live(code, onChange, onStatus) {
      let t = null; const fire = () => { clearTimeout(t); t = setTimeout(onChange, 120); };
      const ch = client.channel('kk-' + code + '-' + Math.random().toString(36).slice(2, 7))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'karaoke_queue', filter: 'code=eq.' + code }, fire)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'karaoke_sessions', filter: 'code=eq.' + code }, fire)
        .subscribe(s => onStatus && onStatus(s));
      return () => client.removeChannel(ch);
    }
  };

  // ---------- YouTube-leit ----------
  let cfg = null;
  async function getCfg(force) {
    if (!cfg || force) { try { cfg = await rpc('karaoke_config', {}); } catch (e) { cfg = { youtube_key: '', error: e }; } }
    return cfg;
  }
  const MODES = [['karaoke', 'Karaoke', ' karaoke'], ['lyrics', 'Með texta', ' lyrics'], ['instr', 'Án söngs', ' instrumental'], ['all', 'Allt', '']];
  function ytError(status, body) {
    const err = (body && body.error) || {}; const reason = ((err.errors || [])[0] || {}).reason || ''; const msg = err.message || '';
    const s = reason + ' ' + msg + ' ' + JSON.stringify(err.details || '');
    if (/quota|dailyLimit|rateLimit/i.test(s)) return 'YouTube-leitin er uppurin í dag (um 100 leitir á dag). Veldu úr lagalistanum eða límdu inn YouTube-slóð.';
    if (/referer|referrer/i.test(s)) return 'YouTube-lykillinn leyfir ekki þessa síðu. Bættu síðunni við í Google Cloud (sjá ⚙ Stillingar).';
    if (/accessNotConfigured|SERVICE_DISABLED|has not been used/i.test(s)) return 'Það á eftir að kveikja á „YouTube Data API v3“ í Google Cloud.';
    if (/keyInvalid|API key not valid|API_KEY_INVALID/i.test(s)) return 'YouTube-lykillinn er ógildur. Athugaðu hann í ⚙ Stillingum á sjónvarpinu.';
    return 'YouTube svaraði með villu (' + status + ')' + (msg ? ': ' + msg : '.');
  }
  async function ytGet(path, q) {
    const c = await getCfg();
    if (!c.youtube_key) {
      const e = new Error(c.error && isMissing(c.error) ? 'Karaoke er ekki uppsett í gagnagrunninum. Keyrðu karaoke.sql í Supabase.'
        : 'Það vantar YouTube-lykil. Hann er settur inn undir ⚙ Stillingar á sjónvarpinu. Þangað til má líma inn YouTube-slóð.');
      e.nokey = true; throw e;
    }
    let r;
    try { r = await fetch(YT_API + path + '?' + new URLSearchParams(Object.assign({ key: c.youtube_key }, q))); }
    catch (e) { throw new Error('Náði ekki sambandi við YouTube.'); }
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(ytError(r.status, body));
    return body;
  }
  async function ytDetails(ids) {
    if (!ids.length) return {};
    const d = await ytGet('videos', { part: 'snippet,contentDetails,status', id: ids.join(','), maxResults: 50 });
    const out = {};
    (d.items || []).forEach(v => {
      out[v.id] = { title: decode(v.snippet && v.snippet.title), channel: decode(v.snippet && v.snippet.channelTitle),
        duration: isoDur(v.contentDetails && v.contentDetails.duration), embeddable: !(v.status && v.status.embeddable === false) };
    });
    return out;
  }
  async function ytSearch(q, mode) {
    const suffix = (MODES.find(m => m[0] === mode) || MODES[0])[2];
    const ck = 'kk_s:' + mode + ':' + q.trim().toLowerCase();
    const hit = store.get(ck);
    if (hit && Date.now() - hit.t < 864e5) return hit.r;
    const d = await ytGet('search', { part: 'snippet', type: 'video', videoEmbeddable: 'true', maxResults: 12, q: q.trim() + suffix });
    const items = (d.items || []).filter(i => i.id && i.id.videoId).map(i => ({ id: i.id.videoId, title: decode(i.snippet.title), channel: decode(i.snippet.channelTitle), duration: null }));
    let det = {};
    try { det = await ytDetails(items.map(i => i.id)); } catch (e) { /* lengd er aukaatriði */ }
    const res = items.filter(i => !det[i.id] || det[i.id].embeddable).map(i => Object.assign(i, { duration: det[i.id] ? det[i.id].duration : null }));
    store.set(ck, { t: Date.now(), r: res });
    return res;
  }
  async function ytByUrl(id) {
    try { const d = await ytDetails([id]); if (d[id]) return Object.assign({ id }, d[id]); }
    catch (e) { if (!e.nokey) throw e; }
    return { id, title: 'YouTube-myndband', channel: '', duration: null };
  }

  // ---------- Lagaspjöld og leitarhluti (sameiginlegt) ----------
  let openPv = null;
  function closePreview() {
    if (!openPv) return;
    openPv.querySelector('.pv').innerHTML = ''; openPv.classList.remove('open');
    const b = openPv.querySelector('[data-act=listen]'); if (b) b.innerHTML = I.listen + ' Hlusta';
    openPv = null;
  }
  function songCard(v, onPick, extra) {
    const el = document.createElement('article');
    el.className = 'song';
    el.innerHTML = `<div class="row">
        <button type="button" class="thumb" data-act="listen" aria-label="Hlusta"><img src="${thumb(v.id)}" alt="" loading="lazy">${v.duration ? `<span class="dur">${fmtDur(v.duration)}</span>` : ''}</button>
        <div class="meta"><b>${esc(v.title)}</b><small>${esc(v.channel || '')}${extra ? ' · ' + extra : ''}</small></div></div>
      <div class="acts"><button type="button" class="btn ghost small" data-act="listen">${I.listen} Hlusta</button><button type="button" class="btn small" data-act="pick">Velja</button></div>
      <div class="pv"></div>`;
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      if (b.dataset.act === 'pick') { closePreview(); onPick(v); return; }
      if (openPv === el) { closePreview(); return; }
      closePreview();
      el.querySelector('.pv').innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${v.id}?autoplay=1&playsinline=1&rel=0" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen title="${esc(v.title)}"></iframe>`;
      el.classList.add('open'); el.querySelector('.acts [data-act=listen]').innerHTML = '■ Loka';
      openPv = el;
    });
    return el;
  }
  function mountSearch(root, onPick) {
    let mode = store.get('kk_mode') || 'karaoke';
    root.innerHTML = `<form class="sform"><input type="search" placeholder="Lag, flytjandi eða YouTube-slóð" enterkeyhint="search" aria-label="Leita á YouTube"><button class="btn">Leita</button></form>
      <div class="smodes">${MODES.map(m => `<button type="button" data-m="${m[0]}" class="${m[0] === mode ? 'on' : ''}">${m[1]}</button>`).join('')}</div>
      <div class="sres"><div class="hint">Leitaðu að laginu. Þú getur hlustað á útgáfurnar áður en þú velur.</div></div>`;
    const inp = root.querySelector('input'), res = root.querySelector('.sres');
    let seq = 0;
    async function run() {
      const q = inp.value.trim(); if (!q) return;
      const my = ++seq; closePreview();
      res.innerHTML = '<div class="hint">Leita á YouTube…</div>';
      try {
        const vid = videoIdFrom(q);
        const list = vid ? [await ytByUrl(vid)] : await ytSearch(q, mode);
        if (my !== seq) return;
        res.innerHTML = list.length ? '' : '<div class="hint">Ekkert fannst. Prófaðu annað orðalag eða annan flokk hér fyrir ofan.</div>';
        list.forEach(v => res.appendChild(songCard(v, onPick)));
      } catch (e) { if (my === seq) res.innerHTML = `<div class="hint bad">${esc(e.message)}</div>`; }
    }
    root.querySelector('form').addEventListener('submit', e => { e.preventDefault(); inp.blur(); run(); });
    root.querySelector('.smodes').addEventListener('click', e => {
      const b = e.target.closest('[data-m]'); if (!b) return;
      mode = b.dataset.m; store.set('kk_mode', mode);
      root.querySelectorAll('.smodes button').forEach(x => x.classList.toggle('on', x === b));
      if (inp.value.trim()) run();
    });
    return { focus: () => inp.focus() };
  }

  // Spurt hver syngur, svo bætt í röðina
  function pickSheet(v, defName, onDone, opts) {
    closePreview();
    const bg = document.createElement('div'); bg.className = 'sheet-bg';
    bg.innerHTML = `<form class="sheet"><h3>Hver syngur?</h3><p class="sub">${esc(v.title)}</p>
      <input type="text" maxlength="40" value="${esc(defName || '')}" placeholder="Nafn, t.d. Gummi og Sædís" aria-label="Nafn söngvara" autocomplete="nickname">
      <div class="btns"><button type="button" class="btn ghost" data-x>Hætta við</button><button class="btn">Setja í röðina</button></div></form>`;
    document.body.appendChild(bg);
    const inp = bg.querySelector('input');
    setTimeout(() => { inp.focus(); inp.select(); }, 40);
    const close = () => bg.remove();
    bg.addEventListener('mousedown', e => { if (e.target === bg) close(); });
    bg.querySelector('[data-x]').onclick = close;
    bg.querySelector('form').addEventListener('submit', async e => {
      e.preventDefault();
      const singer = inp.value.trim(); if (!singer) { inp.focus(); return; }
      const btn = bg.querySelector('.btn:not(.ghost)'); btn.disabled = true;
      try {
        const id = await rpc('karaoke_add', { p_code: opts.code, p_guest: guestId, p_singer: singer, p_video_id: v.id, p_title: v.title, p_channel: v.channel || '', p_duration: v.duration || null });
        close(); onDone(id, singer);
      } catch (err) { btn.disabled = false; toast(err.message, true); }
    });
  }

  // =====================================================================
  //  GESTUR (sími)
  // =====================================================================
  const G = { name: store.get('kk_name') || (params.get('n') || '').trim(), queue: [], session: null, songs: null, tab: 'find', alerted: '', unsub: null };
  const mine = () => new Set(store.get('kk_mine_' + CODE) || []);
  function addMine(id) { const s = [...mine(), id].slice(-60); store.set('kk_mine_' + CODE, s); }

  async function guest() {
    app.innerHTML = '<div class="center-wrap"><div class="hint">Tengist…</div></div>';
    let ok = false;
    try { ok = await rpc('karaoke_find', { p_code: CODE }); }
    catch (e) { return guestMsg(isMissing(e) ? 'Karaoke er ekki uppsett í gagnagrunninum.' : e.message); }
    if (!ok) return guestMsg(`Ekkert karaoke-kvöld fannst með kóðanum ${esc(CODE)}.`, true);
    if (!G.name) return guestName();
    guestRoom();
  }
  function guestMsg(msg, retry) {
    app.innerHTML = `<div class="center-wrap"><div class="brand">Hljómey <span>Karaoke</span></div><p>${msg}</p>
      ${retry ? `<form class="card" id="cf"><label for="cin">Kóði</label><input type="text" id="cin" maxlength="4" autocapitalize="characters" style="text-transform:uppercase;letter-spacing:.3em;font-weight:700;text-align:center;font-size:22px"><div style="height:12px"></div><button class="btn">Áfram</button></form>` : ''}</div>`;
    const f = document.getElementById('cf');
    if (f) f.addEventListener('submit', e => { e.preventDefault(); const c = document.getElementById('cin').value.trim().toUpperCase(); if (c) location.href = 'karaoke.html?k=' + encodeURIComponent(c); });
  }
  function guestName() {
    app.innerHTML = `<div class="center-wrap">
      <svg class="mic-art" viewBox="0 0 96 96" aria-hidden="true"><circle cx="48" cy="48" r="46" fill="#163a4b"/><rect x="38" y="18" width="20" height="36" rx="10" fill="#6fc4dc"/><path d="M28 46a20 20 0 0 0 40 0M48 66v10M38 78h20" fill="none" stroke="#f2b544" stroke-width="5" stroke-linecap="round"/></svg>
      <div class="brand">Hljómey <span>Karaoke</span></div><p>Veldu lag, hlustaðu á útgáfurnar og settu þig í röðina.</p>
      <form class="card" id="nf"><label for="nin">Hvað heitirðu?</label><input type="text" id="nin" maxlength="40" autocomplete="nickname" placeholder="t.d. Gummi" value="${esc(G.name)}"><div style="height:12px"></div><button class="btn">Áfram</button></form></div>`;
    setTimeout(() => document.getElementById('nin').focus(), 40);
    document.getElementById('nf').addEventListener('submit', e => {
      e.preventDefault(); const n = document.getElementById('nin').value.trim(); if (!n) return;
      G.name = n; store.set('kk_name', n); guestRoom();
    });
  }
  function guestRoom() {
    app.innerHTML = `<div class="g">
      <div class="g-top"><div class="brand">Hljómey <span>Karaoke</span></div><span class="chip">Kóði <b>${esc(CODE)}</b></span><button class="chip" id="gName" title="Breyta nafni">${esc(G.name)}</button></div>
      <div id="gNow"></div>
      <div class="tabs" role="tablist">
        <button data-tab="find" role="tab">Finna lag</button><button data-tab="list" role="tab">Lagalistinn</button><button data-tab="queue" role="tab">Biðröðin<i id="qCount"></i></button>
      </div>
      <section id="tFind"></section>
      <section id="tList" class="hidden"><input type="search" class="lfilter" id="lFilter" placeholder="Sía lagalistann"><div class="slist" id="lItems"><div class="hint">Sæki…</div></div></section>
      <section id="tQueue" class="hidden"><div class="slist" id="qItems"></div></section></div>`;
    mountSearch(document.getElementById('tFind'), v => pickSheet(v, G.name, onAdded, { code: CODE }));
    document.querySelector('.tabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) setTab(b.dataset.tab); });
    document.getElementById('gName').onclick = () => { const n = prompt('Nafnið þitt:', G.name); if (n && n.trim()) { G.name = n.trim(); store.set('kk_name', G.name); document.getElementById('gName').textContent = G.name; } };
    document.getElementById('lFilter').addEventListener('input', renderSongs);
    document.getElementById('qItems').addEventListener('click', async e => {
      const b = e.target.closest('[data-rm]'); if (!b) return;
      if (!confirm('Taka lagið af biðlistanum?')) return;
      try { await rpc('karaoke_remove', { p_code: CODE, p_id: b.dataset.rm, p_guest: guestId, p_token: null }); refreshGuest(); }
      catch (err) { toast(err.message, true); }
    });
    setTab('find');
    G.unsub = D.live(CODE, refreshGuest, s => { if (s === 'SUBSCRIBED') refreshGuest(); });
    setInterval(() => { if (!document.hidden) refreshGuest(); }, 10000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshGuest(); });
    refreshGuest();
  }
  function setTab(t) {
    G.tab = t; closePreview();
    document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
    document.getElementById('tFind').classList.toggle('hidden', t !== 'find');
    document.getElementById('tList').classList.toggle('hidden', t !== 'list');
    document.getElementById('tQueue').classList.toggle('hidden', t !== 'queue');
    if (t === 'list') loadSongs();
  }
  function onAdded(id, singer) {
    addMine(id);
    if (singer && !store.get('kk_name')) store.set('kk_name', singer);
    refreshGuest().then(() => {
      const pos = G.queue.filter(q => q.status === 'queued').findIndex(q => q.id === id) + 1;
      toast(pos ? `Komið! Þú ert nr. ${pos} í röðinni.` : 'Komið í röðina!');
    });
    setTab('queue');
  }
  async function loadSongs() {
    try { G.songs = await D.songs(); renderSongs(); }
    catch (e) { document.getElementById('lItems').innerHTML = `<div class="hint bad">${esc(e.message)}</div>`; }
  }
  function renderSongs() {
    const box = document.getElementById('lItems'); if (!box || !G.songs) return;
    const f = (document.getElementById('lFilter').value || '').trim().toLowerCase();
    const list = G.songs.filter(s => !f || (s.title + ' ' + s.channel).toLowerCase().includes(f));
    box.innerHTML = list.length ? '' : `<div class="hint">${G.songs.length ? 'Ekkert passar við síuna.' : 'Lagalistinn er tómur. Lög sem eru valin bætast hér við sjálfkrafa.'}</div>`;
    list.forEach(s => box.appendChild(songCard({ id: s.video_id, title: s.title, channel: s.channel, duration: s.duration },
      v => pickSheet(v, G.name, onAdded, { code: CODE }), `<span class="badge-n">${s.times_queued}× valið</span>`)));
  }
  let gBusy = false;
  async function refreshGuest() {
    if (gBusy) return; gBusy = true;
    try {
      const [s, q] = await Promise.all([D.session(CODE), D.queue(CODE)]);
      G.session = s; G.queue = q; renderNow(); renderQueue();
    } catch (e) { /* reynt aftur */ } finally { gBusy = false; }
  }
  function renderNow() {
    const box = document.getElementById('gNow'); if (!box) return;
    const s = G.session || {}, cur = G.queue.find(q => q.id === s.current_id), my = mine();
    const queued = G.queue.filter(q => q.status === 'queued');
    let cls = 'now', kick = '', who = '', what = '';
    if (cur && my.has(cur.id)) {
      cls += ' me';
      kick = s.state === 'intro' ? 'Þú ert næst/ur á svið!' : 'Þú ert á sviðinu!';
      who = s.state === 'intro' ? 'Gerðu þig klára/n' : 'Syngdu!'; what = cur.title;
      const key = cur.id + s.state;
      if (G.alerted !== key) { G.alerted = key; const ua = navigator.userActivation; if (navigator.vibrate && (!ua || ua.hasBeenActive)) { try { navigator.vibrate([200, 100, 200]); } catch (e) {} } }
    } else if (cur) {
      kick = s.state === 'intro' ? 'Næst á svið' : s.state === 'paused' ? 'Í pásu' : 'Á sviðinu núna';
      who = cur.singer; what = cur.title;
    } else {
      kick = 'Sviðið er laust'; who = queued.length ? 'Byrjar bráðum' : 'Enginn í röðinni'; what = queued.length ? '' : 'Veldu lag og vertu fyrst/ur!';
    }
    const firstMine = queued.findIndex(q => my.has(q.id));
    const note = !(cur && my.has(cur.id)) && firstMine === 0 && cur ? '<div style="margin-top:8px;color:var(--accent);font-weight:500">Þú ert næst/ur í röðinni!</div>' : '';
    box.innerHTML = `<div class="${cls}"><span class="live">${I.mic}</span><div class="tx"><small>${esc(kick)}</small><b>${esc(who)}</b>${what ? `<span class="t">${esc(what)}</span>` : ''}${note}</div></div>`;
  }
  function renderQueue() {
    const box = document.getElementById('qItems'); if (!box) return;
    const s = G.session || {}, my = mine();
    const cur = G.queue.find(q => q.id === s.current_id);
    const queued = G.queue.filter(q => q.status === 'queued');
    document.getElementById('qCount').textContent = queued.length ? ' ' + queued.length : '';
    let html = '';
    if (cur) html += `<div class="qrow cur"><span class="n">${I.mic}</span><div class="tx"><b>${esc(cur.singer)}</b><small>${esc(cur.title)}</small></div></div>`;
    html += queued.map((q, i) => `<div class="qrow${my.has(q.id) ? ' mine' : ''}"><span class="n">${i + 1}</span><div class="tx"><b>${esc(q.singer)}</b><small>${esc(q.title)}</small></div>${my.has(q.id) ? `<button class="x" data-rm="${q.id}">Taka af</button>` : ''}</div>`).join('');
    box.innerHTML = html || '<div class="hint">Enginn í röðinni enn. Finndu lag og vertu fyrst/ur!</div>';
  }

  // =====================================================================
  //  STJÓRNANDI (sjónvarp)
  // =====================================================================
  const H = { code: '', token: '', session: null, queue: [], running: false, player: null, ready: false, wide: false,
    stageKey: '', introFor: null, introT: null, loadedVid: null, done: 0, unsub: null };
  const introSecs = () => +(store.get('kk_intro') || 10);

  async function hostStart() {
    const c = await getCfg();
    const saved = store.get('kk_host');
    if (saved) {
      try { if (await rpc('karaoke_is_host', { p_code: saved.code, p_token: saved.token })) return hostRoom(saved.code, saved.token); }
      catch (e) { /* byrja upp á nýtt */ }
      store.del('kk_host');
    }
    const missing = c.error && isMissing(c.error);
    app.innerHTML = `<div class="kk-top"><div class="brand">Hljómey</div><nav class="modes"><a href="stjorn.html">Pöbbkviss</a><a href="bingo-stjorn.html">Tónlistarbingó</a><a href="gitar.html">Gítarpartý</a><a class="on" href="karaoke.html">Karaoke</a><a href="hvadaar.html">Hvaða ár?</a></nav></div>
      <div class="center-wrap">
      <svg class="mic-art" viewBox="0 0 96 96" aria-hidden="true"><circle cx="48" cy="48" r="46" fill="#163a4b"/><rect x="38" y="18" width="20" height="36" rx="10" fill="#6fc4dc"/><path d="M28 46a20 20 0 0 0 40 0M48 66v10M38 78h20" fill="none" stroke="#f2b544" stroke-width="5" stroke-linecap="round"/></svg>
      <div class="brand">Hljómey <span>Karaoke</span></div>
      <p>Opnaðu þessa síðu á sjónvarpinu eða tölvunni sem er tengd við það. Gestir skanna QR-kóðann, finna lag á YouTube og fara í röðina.</p>
      <div class="card">
        ${missing ? '<p class="badline" style="margin:0 0 12px">Karaoke er ekki uppsett í gagnagrunninum. Keyrðu <b>karaoke.sql</b> í Supabase.</p>' : ''}
        ${!missing && !c.youtube_key ? '<p class="badline" style="margin:0 0 12px">YouTube-lykil vantar, svo leitin virkar ekki enn. Settu hann inn undir Stillingar.</p>' : ''}
        <button class="btn" id="hGo" ${missing ? 'disabled' : ''}>Byrja karaoke-kvöld</button>
        <div style="height:10px"></div><button class="btn ghost" id="hSet">${I.gear.replace('class="ico"', 'class="ico" style="vertical-align:-4px"')} Stillingar</button>
      </div></div>`;
    document.getElementById('hGo').onclick = async () => {
      try { const r = await rpc('karaoke_start', {}); store.set('kk_host', { code: r.code, token: r.token }); hostRoom(r.code, r.token); }
      catch (e) { toast(e.message, true); }
    };
    document.getElementById('hSet').onclick = () => settings(() => hostStart());
  }

  function hostRoom(code, token) {
    H.code = code; H.token = token; keepAwake.on = true; keepAwake();
    app.innerHTML = `<div class="h" id="h">
      <section class="stage" id="stage">
        <div class="pwrap hidden" id="pwrap"><div id="yt"></div><div class="onair hidden" id="onair"></div><div class="upnext hidden" id="upnext"></div><div class="paused hidden" id="pausedOv">Í pásu</div></div>
        <div class="scard" id="scard"></div>
      </section>
      <aside class="side">
        <div class="join"><div class="qr">${qrSvg(joinUrl(code))}</div><div><small>Skannaðu og veldu lag</small><b>${esc(code)}</b><span>${esc(prettyUrl())}</span></div></div>
        <h3><span>Biðröðin</span><span id="hCount"></span></h3>
        <div class="hq" id="hq"></div>
      </aside>
      <nav class="hbar">
        <button class="btn" id="bPlay">${I.play}<span class="lbl">Byrja</span></button>
        <button class="btn ghost" id="bNext">${I.next}<span class="lbl">Næsta lag</span></button>
        <button class="btn ghost" id="bAdd">${I.plus}<span class="lbl">Bæta við lagi</span></button>
        <span class="sp"></span><span class="stat" id="hStat"></span><span class="sp"></span>
        <button class="btn ghost small" id="bSide" title="Fela/sýna biðröð">${I.side}</button>
        <button class="btn ghost small" id="bFull" title="Fullur skjár">${I.full}</button>
        <button class="btn ghost small" id="bSet" title="Stillingar">${I.gear}</button>
        <button class="btn ghost small" id="bQuit">Hætta</button>
      </nav></div>`;
    document.getElementById('bPlay').onclick = playPause;
    document.getElementById('bNext').onclick = () => { if (H.queue.length || H.session.current_id) next(); };
    document.getElementById('bAdd').onclick = hostAdd;
    document.getElementById('bSide').onclick = () => { H.wide = !H.wide; document.getElementById('h').classList.toggle('wide', H.wide); };
    document.getElementById('bFull').onclick = () => { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen().catch(() => {}); };
    document.getElementById('bSet').onclick = () => settings();
    document.getElementById('bQuit').onclick = async () => {
      if (!confirm('Ljúka karaoke-kvöldinu?')) return;
      try { await rpc('karaoke_set', { p_code: H.code, p_token: H.token, p_id: null, p_state: 'idle', p_requeue: false }); } catch (e) {}
      if (H.unsub) H.unsub(); store.del('kk_host'); location.href = location.pathname;
    };
    document.getElementById('hq').addEventListener('click', hostQueueClick);
    document.addEventListener('keydown', e => {
      if (/INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName) || document.querySelector('.ov, .sheet-bg')) return;
      if (e.code === 'Space') { e.preventDefault(); playPause(); }
      if (e.key === 'ArrowRight' && e.shiftKey) next();
    });
    H.unsub = D.live(code, refreshHost, s => { if (s === 'SUBSCRIBED') refreshHost(); });
    setInterval(() => { if (!document.hidden) refreshHost(); }, 8000);
    loadYT();
    refreshHost();
  }

  let hBusy = false, hAgain = false;
  async function refreshHost() {
    if (hBusy) { hAgain = true; return; }
    hBusy = true;
    try {
      const [s, q, done] = await Promise.all([D.session(H.code), D.queue(H.code), D.doneCount(H.code)]);
      H.session = s || { state: 'idle', current_id: null }; H.queue = q; H.done = done;
      renderSide(); renderStage();
    } catch (e) { /* reynt aftur næst */ }
    finally { hBusy = false; if (hAgain) { hAgain = false; refreshHost(); } }
  }
  const curItem = () => H.queue.find(q => q.id === (H.session || {}).current_id) || null;
  const waiting = () => H.queue.filter(q => q.status === 'queued');

  function renderSide() {
    const cur = curItem(), qd = waiting();
    document.getElementById('hCount').textContent = qd.length ? qd.length + (qd.length === 1 ? ' lag' : ' lög') : '';
    const row = (q, n, isCur) => `<div class="it${isCur ? ' cur' : ''}" data-id="${q.id}" tabindex="0">
        <span class="n">${isCur ? I.mic : n}</span><img src="${thumb(q.video_id)}" alt="" loading="lazy">
        <div class="tx"><b>${esc(q.singer)}</b><small>${esc(q.title)}</small></div>
        ${isCur ? '' : `<span class="ctl"><button class="ib" data-a="up" title="Upp">▲</button><button class="ib" data-a="down" title="Niður">▼</button><button class="ib" data-a="now" title="Spila núna">▶</button><button class="ib" data-a="rm" title="Taka af lista">✕</button></span>`}</div>`;
    document.getElementById('hq').innerHTML = (cur ? row(cur, 0, true) : '') + qd.map((q, i) => row(q, i + 1, false)).join('') ||
      '<div class="empty">Enginn í röðinni.<br>Gestir skanna QR-kóðann hér fyrir ofan.</div>';
    document.getElementById('hStat').textContent = (H.done ? `Sungið í kvöld: ${H.done}` : '') ;
    const st = (H.session || {}).state;
    document.getElementById('bPlay').innerHTML = st === 'playing' ? `${I.pause}<span class="lbl">Pása</span>` : `${I.play}<span class="lbl">${st === 'paused' ? 'Halda áfram' : st === 'intro' ? 'Byrja núna' : 'Byrja'}</span>`;
    document.getElementById('bPlay').disabled = !cur && !qd.length;
  }

  async function hostQueueClick(e) {
    const b = e.target.closest('[data-a]'); if (!b) return;
    const id = b.closest('.it').dataset.id, qd = waiting(), i = qd.findIndex(q => q.id === id);
    try {
      if (b.dataset.a === 'rm') await rpc('karaoke_remove', { p_code: H.code, p_id: id, p_guest: null, p_token: H.token });
      else if (b.dataset.a === 'now') { H.running = true; await setStage(id, 'intro'); }
      else {
        const j = b.dataset.a === 'up' ? i - 1 : i + 1; if (j < 0 || j >= qd.length) return;
        const ids = qd.map(q => q.id); [ids[i], ids[j]] = [ids[j], ids[i]];
        await rpc('karaoke_reorder', { p_code: H.code, p_token: H.token, p_ids: ids });
      }
      refreshHost();
    } catch (err) { toast(err.message, true); }
  }

  async function setStage(id, state) {
    await rpc('karaoke_set', { p_code: H.code, p_token: H.token, p_id: id, p_state: state, p_requeue: false });
    H.session = Object.assign({}, H.session, { current_id: id, state: id ? state : 'idle' });
    if (id) { const it = H.queue.find(q => q.id === id); if (it) it.status = 'current'; }
    renderSide(); renderStage();
    refreshHost();
  }
  async function next() {
    clearInterval(H.introT); H.introFor = null;
    const cur = (H.session || {}).current_id;
    const nx = waiting().find(q => q.id !== cur);
    try { await setStage(nx ? nx.id : null, nx ? 'intro' : 'idle'); } catch (e) { toast(e.message, true); }
  }
  async function playPause() {
    const s = H.session || {}, cur = curItem();
    H.running = true;
    try {
      if (!cur) { const f = waiting()[0]; if (f) await setStage(f.id, 'intro'); return; }
      if (s.state === 'intro') return startPlaying();
      if (s.state === 'playing') { if (H.player && H.ready) H.player.pauseVideo(); await setStage(cur.id, 'paused'); return; }
      if (s.state === 'paused') { if (H.player && H.ready) H.player.playVideo(); await setStage(cur.id, 'playing'); }
    } catch (e) { toast(e.message, true); }
  }
  async function startPlaying() {
    clearInterval(H.introT); H.introFor = null;
    const cur = curItem(); if (!cur) return;
    try { await setStage(cur.id, 'playing'); } catch (e) { toast(e.message, true); }
  }

  function renderStage() {
    const s = H.session || {}, cur = curItem(), qd = waiting();
    const key = [s.state, s.current_id || '', s.state === 'idle' ? (qd[0] || {}).id || '' : ''].join(':');
    const pw = document.getElementById('pwrap'), card = document.getElementById('scard');
    // Næst-merki á meðan lag er í gangi
    const nx = qd.find(q => q.id !== s.current_id);
    const up = document.getElementById('upnext');
    up.classList.toggle('hidden', !nx || !(s.state === 'playing' || s.state === 'paused'));
    if (nx) up.innerHTML = `<small>Næst á svið</small><b>${esc(nx.singer)}</b>`;
    document.getElementById('pausedOv').classList.toggle('hidden', s.state !== 'paused');
    if (key === H.stageKey) return;
    H.stageKey = key;

    if ((s.state === 'playing' || s.state === 'paused') && cur) {
      card.classList.add('hidden'); pw.classList.remove('hidden');
      ensureVideo(cur, s.state === 'playing');
      const oa = document.getElementById('onair');
      oa.innerHTML = I.mic + esc(cur.singer); oa.classList.remove('hidden'); oa.style.opacity = '1';
      clearTimeout(H.oaT); H.oaT = setTimeout(() => { oa.style.opacity = '0'; }, 9000);
      return;
    }
    // Ekkert í spilun: stöðva myndband og sýna spjald
    if (H.player && H.ready) { try { H.player.stopVideo(); } catch (e) {} }
    H.loadedVid = null;
    pw.classList.add('hidden'); card.classList.remove('hidden');
    if (s.state === 'intro' && cur) {
      card.innerHTML = `<div class="kick">Næst á svið</div><div class="who">${esc(cur.singer)}</div><div class="what">${esc(cur.title)}</div>
        <div class="cd" id="cd"><b id="cdn">${introSecs()}</b></div>
        <div class="row"><button class="btn" id="cGo">${I.play} Byrja núna</button><button class="btn ghost" id="cSkip">Sleppa</button></div>`;
      document.getElementById('cGo').onclick = startPlaying;
      document.getElementById('cSkip').onclick = next;
      if (H.introFor !== cur.id) {
        H.introFor = cur.id; clearInterval(H.introT);
        const total = introSecs(), end = Date.now() + total * 1000;
        const tick = () => {
          const left = Math.max(0, (end - Date.now()) / 1000);
          const n = document.getElementById('cdn'), c = document.getElementById('cd');
          if (n) n.textContent = Math.ceil(left); if (c) c.style.setProperty('--p', (left / total) * 100 + '%');
          if (left <= 0) { clearInterval(H.introT); startPlaying(); }
        };
        tick(); H.introT = setInterval(tick, 200);
      }
      return;
    }
    clearInterval(H.introT); H.introFor = null;
    if (qd.length) {
      if (H.running) { setStage(qd[0].id, 'intro').catch(e => toast(e.message, true)); return; }
      card.innerHTML = `<div class="kick">Fyrst á svið</div><div class="who">${esc(qd[0].singer)}</div><div class="what">${esc(qd[0].title)}</div>
        <img class="thumbbig" src="${thumb(qd[0].video_id)}" alt=""><div class="row" style="margin-top:3vh"><button class="btn" id="cStart">${I.play} Byrja kvöldið</button></div>`;
      document.getElementById('cStart').onclick = playPause;
      return;
    }
    card.innerHTML = `<div class="kick">Karaoke</div><div class="bigqr">${qrSvg(joinUrl(H.code))}</div>
      <div class="what">Skannaðu, finndu lag og settu þig í röðina</div><div class="code" style="margin-top:2vh">${esc(H.code)}</div>`;
  }

  // ---------- YouTube-spilarinn ----------
  function loadYT() {
    if (window.YT && window.YT.Player) return createPlayer();
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { if (prev) prev(); createPlayer(); };
    const s = document.createElement('script'); s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = () => toast('Náði ekki í YouTube-spilarann. Athugaðu nettenginguna.', true);
    document.head.appendChild(s);
  }
  function createPlayer() {
    if (H.player) return;
    H.player = new window.YT.Player('yt', {
      width: '100%', height: '100%',
      playerVars: { autoplay: 1, rel: 0, playsinline: 1, modestbranding: 1, iv_load_policy: 3 },
      events: {
        onReady: () => { H.ready = true; H.stageKey = ''; renderStage(); },
        onStateChange: e => {
          // Lagi lokið: aðeins ef það var lagið sem er á sviðinu (svo ekki sé hoppað yfir tvö)
          const cur = curItem();
          if (e.data === 0 && cur && (H.session || {}).state === 'playing' && H.loadedVid === cur.video_id) next();
        },
        onError: e => {
          const cur = curItem(); if (!cur) return;
          toast(`Ekki hægt að spila „${cur.title}“ hér (villa ${e.data}). Sleppi því.`, true);
          const id = cur.id;
          setTimeout(() => { if ((H.session || {}).current_id === id) next(); }, 2500);
        }
      }
    });
  }
  function ensureVideo(cur, play) {
    if (!H.player || !H.ready) return;   // onReady teiknar aftur
    if (H.loadedVid !== cur.video_id) {
      H.loadedVid = cur.video_id;
      if (play) H.player.loadVideoById(cur.video_id); else H.player.cueVideoById(cur.video_id);
    } else if (play) H.player.playVideo(); else H.player.pauseVideo();
  }

  // ---------- Stjórnandi bætir við lagi ----------
  function hostAdd() {
    const ov = document.createElement('div'); ov.className = 'ov';
    ov.innerHTML = '<div class="box"><header><h2>Bæta við lagi</h2><button class="xbtn" aria-label="Loka">×</button></header><div id="hs"></div></div>';
    document.body.appendChild(ov);
    const close = () => { closePreview(); ov.remove(); };
    ov.querySelector('.xbtn').onclick = close;
    ov.addEventListener('mousedown', e => { if (e.target === ov) close(); });
    document.addEventListener('keydown', function esc_(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc_); } });
    mountSearch(ov.querySelector('#hs'), v => pickSheet(v, store.get('kk_name') || '', (id, singer) => {
      store.set('kk_name', singer); close(); toast(`${singer} er komin/n í röðina.`); refreshHost();
    }, { code: H.code })).focus();
  }

  // ---------- Stillingar ----------
  async function settings(after) {
    const c = await getCfg(true);
    const ov = document.createElement('div'); ov.className = 'ov';
    const k = c.youtube_key || '';
    ov.innerHTML = `<div class="box"><header><h2>Stillingar</h2><button class="xbtn" aria-label="Loka">×</button></header>
      <div class="set-sec"><h3>YouTube-lykill</h3>
        <p>${k ? `Lykill er vistaður (${esc(k.slice(0, 6))}…${esc(k.slice(-4))}).` : 'Enginn lykill vistaður enn. Leitin þarf ókeypis lykil frá Google.'}</p>
        <ol><li>Farðu á <b>console.cloud.google.com</b> og skráðu þig inn með Google-reikningi.</li>
          <li>Búðu til verkefni (t.d. „Hljomey karaoke“).</li>
          <li><b>APIs &amp; Services → Library</b> → leitaðu að <b>YouTube Data API v3</b> → <b>Enable</b>.</li>
          <li><b>APIs &amp; Services → Credentials → Create credentials → API key</b>.</li>
          <li>Takmarkaðu lykilinn: <b>Websites</b> → bættu við <code>https://hljomey.is/*</code> og <code>https://www.hljomey.is/*</code>, og <b>Restrict key</b> → YouTube Data API v3.</li>
          <li>Afritaðu lykilinn og límdu hann hér.</li></ol>
        <div class="row"><div><label for="sKey">API-lykill</label><input type="text" id="sKey" placeholder="AIza…" autocomplete="off" spellcheck="false"></div>
          <div style="flex:0 1 160px"><label for="sPin">PIN stjórnanda</label><input type="password" id="sPin" autocomplete="off" value="${esc(store.get('pq_pin') || '')}"></div>
          <button class="btn" id="sSave">Vista og prófa</button></div>
        <div id="sMsg"></div></div>
      <div class="set-sec"><h3>Biðtími á milli laga</h3><p>Hve lengi „Næst á svið“ birtist áður en næsta lag byrjar.</p>
        <select id="sIntro" style="max-width:200px">${[5, 10, 15, 20, 30].map(n => `<option value="${n}" ${n === introSecs() ? 'selected' : ''}>${n} sekúndur</option>`).join('')}</select></div>
      <div class="set-sec"><h3>Lagalistinn</h3><p>Lög sem hafa verið valin. Gestir geta valið þau aftur án þess að leita.</p><div class="libl" id="sLib"><div class="hint">Sæki…</div></div></div></div>`;
    document.body.appendChild(ov);
    const close = () => { ov.remove(); if (after) after(); };
    ov.querySelector('.xbtn').onclick = close;
    ov.addEventListener('mousedown', e => { if (e.target === ov) close(); });
    ov.querySelector('#sIntro').onchange = e => store.set('kk_intro', +e.target.value);
    ov.querySelector('#sSave').onclick = async () => {
      const msg = ov.querySelector('#sMsg'), key = ov.querySelector('#sKey').value.trim(), pin = ov.querySelector('#sPin').value.trim();
      if (!key) { msg.innerHTML = '<div class="badline">Límdu lykilinn inn fyrst.</div>'; return; }
      msg.innerHTML = '<div class="hint" style="text-align:left;padding:8px 0">Vista og prófa…</div>';
      try {
        await rpc('karaoke_set_key', { p_pin: pin, p_key: key });
        store.set('pq_pin', pin);
        await getCfg(true);
        await ytGet('videos', { part: 'id', id: 'dQw4w9WgXcQ' });
        msg.innerHTML = '<div class="okline">✓ Lykillinn er vistaður og virkar. Leitin er tilbúin.</div>';
      } catch (e) { msg.innerHTML = `<div class="badline">${esc(e.message)}</div>`; }
    };
    const lib = ov.querySelector('#sLib');
    const drawLib = async () => {
      let songs = [];
      try { songs = await D.songs(); } catch (e) { lib.innerHTML = `<div class="badline">${esc(e.message)}</div>`; return; }
      lib.innerHTML = songs.length ? songs.map(s => `<div><span>${esc(s.title)}</span><small class="muted">${s.times_queued}×</small><button class="ib" data-del="${esc(s.video_id)}" title="Eyða úr lagalista">✕</button></div>`).join('') : '<div class="hint">Tómur enn.</div>';
    };
    lib.addEventListener('click', async e => {
      const b = e.target.closest('[data-del]'); if (!b) return;
      const pin = ov.querySelector('#sPin').value.trim() || store.get('pq_pin');
      try { await rpc('karaoke_song_delete', { p_pin: pin, p_video_id: b.dataset.del }); drawLib(); }
      catch (err) { toast(err.message, true); }
    });
    drawLib();
  }

  // ---------- Ræsing ----------
  if (CODE) guest(); else hostStart();
  window.__KK = { G, H };   // fyrir prófanir
})();
