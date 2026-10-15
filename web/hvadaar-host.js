// Hljómey „Hvaða ár?“ – stjórnandi: Spotify, lagabanki og leikurinn á stóra skjánum
(function () {
  if (window.HA.CODE) return;   // síminn: hvadaar.js
  const { client, rpc, store, esc, cfg } = window.PQ;
  const { toast, fmt } = window.HA;
  const root = window.HA.root;
  const $ = id => document.getElementById(id);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const yearOf = d => { const m = /^(\d{4})/.exec(String(d || '')); return m ? +m[1] : null; };
  const norm = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/\(.*?\)|\[.*?\]/g, ' ').replace(/\s[-–]\s.*$/, '').replace(/&/g, ' and ').replace(/[^a-z0-9þðæ]+/g, ' ').trim();
  const isMissing = e => /Could not find the function|ha_|PGRST202/i.test(e.message || '') && !e.code;
  const pin = () => (($('pin') && $('pin').value) || store.get('pq_pin') || '').trim();

  // =====================================================================
  //  Spotify (innskráning með PKCE: enginn leynilykill í vafranum)
  // =====================================================================
  const SCOPES = 'user-read-playback-state user-modify-playback-state playlist-read-private playlist-read-collaborative';
  const rnd = n => { const a = new Uint8Array(n); crypto.getRandomValues(a); return Array.from(a, b => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'[b % 62]).join(''); };
  async function challenge(v) {
    const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v));
    return btoa(String.fromCharCode(...new Uint8Array(h))).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  }
  function spErr(status, d) {
    const r = (d && d.error && (d.error.reason || d.error.message)) || '';
    if (status === 404 || /NO_ACTIVE_DEVICE/i.test(r)) return 'Ekkert virkt Spotify-tæki fannst. Opnaðu Spotify á tækinu sem er tengt hátölurunum og veldu það í „Tæki“.';
    if (/PREMIUM_REQUIRED/i.test(r)) return 'Spotify Premium þarf til að stjórna spilun.';
    if (status === 401) return 'Spotify-innskráningin rann út. Tengdu Spotify aftur.';
    if (status === 403) return 'Spotify neitaði beiðninni' + (r ? ': ' + r : '.') + ' Er notandinn skráður í forritið hjá Spotify for Developers?';
    return 'Spotify-villa ' + status + (r ? ': ' + r : '');
  }
  const SP = {
    cid: '',
    redirect: () => location.origin + location.pathname,
    tok: () => store.get('ha_sp'),
    connected() { return !!(this.cid && this.tok()); },
    async login() {
      if (!this.cid) return toast('Settu fyrst inn Client ID frá Spotify.', true);
      const ver = rnd(64), state = rnd(16);
      store.set('ha_sp_pkce', { ver, state });
      location.href = 'https://accounts.spotify.com/authorize?' + new URLSearchParams({
        client_id: this.cid, response_type: 'code', redirect_uri: this.redirect(), code_challenge_method: 'S256',
        code_challenge: await challenge(ver), state, scope: SCOPES });
    },
    async callback() {
      const q = new URLSearchParams(location.search), code = q.get('code'), err = q.get('error');
      if (!code && !err) return;
      history.replaceState(null, '', location.pathname);
      if (err) return toast('Spotify: ' + (err === 'access_denied' ? 'aðgangi hafnað.' : err), true);
      const pk = store.get('ha_sp_pkce');
      if (!pk || pk.state !== q.get('state')) return toast('Spotify-innskráningin passaði ekki. Reyndu aftur.', true);
      const r = await fetch('https://accounts.spotify.com/api/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: this.redirect(), client_id: this.cid, code_verifier: pk.ver }) });
      const d = await r.json().catch(() => ({}));
      store.del('ha_sp_pkce');
      if (!r.ok) return toast('Spotify: ' + (d.error_description || d.error || r.status), true);
      this.save(d); toast('Spotify er tengt.');
    },
    save(d) { const old = this.tok() || {}; store.set('ha_sp', { access: d.access_token, refresh: d.refresh_token || old.refresh, exp: Date.now() + ((d.expires_in || 3600) - 60) * 1000 }); },
    logout() { store.del('ha_sp'); },
    async access() {
      const t = this.tok(); if (!t) throw new Error('Spotify er ekki tengt.');
      if (Date.now() < t.exp) return t.access;
      const r = await fetch('https://accounts.spotify.com/api/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: t.refresh, client_id: this.cid }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { this.logout(); throw new Error('Spotify-innskráningin rann út. Tengdu Spotify aftur.'); }
      this.save(d); return d.access_token;
    },
    async api(path, opt) {
      opt = opt || {};
      const tk = await this.access();
      const r = await fetch('https://api.spotify.com/v1' + path, { method: opt.method || 'GET', body: opt.body,
        headers: Object.assign({ Authorization: 'Bearer ' + tk }, opt.body ? { 'Content-Type': 'application/json' } : {}) });
      this.lastStatus = r.status;
      if (r.status === 429) { await sleep(((+r.headers.get('Retry-After')) || 2) * 1000); return this.api(path, opt); }
      if (r.status === 204 || r.status === 202) return null;
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { const e = new Error(spErr(r.status, d)); e.status = r.status; throw e; }
      return d;
    },
    me() { return this.api('/me'); },
    async devices() { const d = await this.api('/me/player/devices'); return (d && d.devices) || []; },
    async playlists() {
      let out = [], url = '/me/playlists?limit=50';
      while (url && out.length < 400) { const d = await this.api(url); out = out.concat(d.items || []); url = d.next ? d.next.replace('https://api.spotify.com/v1', '') : null; }
      return out;
    },
    async items(id) {
      let out = [], off = 0;
      for (;;) {
        const d = await this.api(`/playlists/${id}/items?limit=50&offset=${off}`);
        const it = d.items || [];
        out = out.concat(it.map(x => x.item || x.track).filter(t => t && t.type !== 'episode' && t.uri && !t.is_local));
        off += 50; if (!d.next || !it.length || off >= 2000) break;
      }
      return out;
    },
    async search(q) { const d = await this.api('/search?' + new URLSearchParams({ q, type: 'track', limit: 10, market: 'from_token' })); return (d && d.tracks && d.tracks.items) || []; },
    play(dev, uri, pos) { return this.api('/me/player/play' + (dev ? '?device_id=' + encodeURIComponent(dev) : ''), { method: 'PUT', body: JSON.stringify({ uris: [uri], position_ms: pos || 0 }) }); },
    state() { return this.api('/me/player'); },
    transfer(dev, play) { return this.api('/me/player', { method: 'PUT', body: JSON.stringify({ device_ids: [dev], play: !!play }) }); },
    seek(dev, pos) { return this.api('/me/player/seek?position_ms=' + (pos || 0) + '&device_id=' + encodeURIComponent(dev), { method: 'PUT' }); },
    // Spilar lag og gengur úr skugga um að það fari í raun af stað. Spotify svarar „OK“ (204/202) þótt
    // tæki í dvala geri ekkert, svo tækið er vakið, beðið eftir að það verði virkt og staðan lesin.
    // Skráir hvert skref í e.diag svo villuboðin segi nákvæmlega hvað Spotify gerði.
    async playSure(uri, pos, title) {
      const log = [], note = t => log.push(t);
      const fail = (msg, e) => { const x = e || new Error(msg); if (msg && e) x.message = msg; x.diag = log.join(' → '); return x; };
      const ds = await this.devices();
      let d = ds.find(x => x.id === A.dev) || ds.find(x => A.devName && x.name === A.devName) || (!A.dev && (ds.find(x => x.is_active) || ds[0]));
      if (!d) {
        if (!ds.length) throw new Error('Ekkert Spotify-tæki er opið. Opnaðu Spotify á tölvunni (eða hátalaranum) og ýttu á ↻ við „Tæki“.');
        throw new Error(`Spotify-tækið sem er valið („${A.devName || 'óþekkt'}“) finnst ekki. Opnaðu Spotify á því, eða veldu annað tæki í „Tæki“.`);
      }
      if (d.id !== A.dev) setDev(d);
      if (d.is_restricted) throw new Error(`Spotify leyfir ekki fjarstýringu á „${d.name}“. Veldu annað tæki.`);
      const step = async (label, fn) => { try { await fn(); note(`${label} ${this.lastStatus}`); return null; } catch (e) { note(`${label} ${e.status || 'villa'}`); return e; } };
      const waitActive = async () => {
        for (let k = 0; k < 10; k++) { try { const x = (await this.devices()).find(y => y.id === d.id); if (x && x.is_active) return true; } catch (e) { /* aftur */ } await sleep(500); }
        return false;
      };
      if (!d.is_active) {
        await step('vekja', () => this.transfer(d.id, false));
        note(await waitActive() ? 'virkt' : 'varð ekki virkt');
      }
      // Upplýsingar um lagið í landi notandans: spilanlegt? Spotify gefur jafngilt lag ef þetta er ekki í boði hér.
      let info = null;
      try { info = await this.api(`/tracks/${uri.split(':').pop()}?market=from_token`); } catch (e) { note(`lag ${e.status || 'villa'}`); }
      if (info) {
        note(`lag „${info.name}“ ${info.is_playable === false ? 'ekki spilanlegt' : info.is_playable ? 'spilanlegt' : '?'}`);
        if (info.is_playable === false) throw Object.assign(fail(`Lagið „${title || info.name}“ er ekki spilanlegt í þínu landi á Spotify.`), { unplayable: true });
        if (info.uri && info.uri !== uri) { note('jafngilt lag notað'); uri = info.uri; }
        if (!title) title = info.name;
      }
      let prev = null; try { prev = await this.state(); } catch (e) { /* ekkert */ }
      const prevUri = prev && prev.item && prev.item.uri;
      const tn = norm(title);
      const isOn = st => st && st.is_playing && st.item && (st.item.uri === uri || (tn && norm(st.item.name) === tn) || (!!prevUri && st.item.uri !== prevUri));
      const desc = st => !st ? 'ekkert virkt tæki' : `${st.is_playing ? 'spilar' : 'spilar ekki'}, ${st.item ? '„' + st.item.name + '“' : 'ekkert lag'}`;
      const watch = async () => { let st = null; for (let k = 0; k < 10; k++) { await sleep(500); try { st = await this.state(); } catch (e) { st = null; } if (isOn(st)) return true; } note(desc(st)); return false; };
      const q = 'device_id=' + encodeURIComponent(d.id);
      const seekLater = async () => { if (pos) { await sleep(900); await this.seek(d.id, pos).catch(() => {}); } };
      // Mismunandi leiðir til að setja lag í gang; sú sem virkar er munuð og reynd fyrst næst.
      const ways = {
        lag: ['spila lag', () => this.play(d.id, uri, pos)],
        plata: ['spila af plötu', async () => {
          const alb = info && info.album && info.album.uri; if (!alb) throw Object.assign(new Error('engin plata'), { status: 'engin plata' });
          await this.api('/me/player/play?' + q, { method: 'PUT', body: JSON.stringify({ context_uri: alb, offset: { uri }, position_ms: pos || 0 }) });
        }],
        rod: ['biðröð+næsta', async () => {
          await this.api('/me/player/queue?uri=' + encodeURIComponent(uri) + '&' + q, { method: 'POST' });
          await sleep(600); await this.api('/me/player/next?' + q, { method: 'POST' }); await seekLater();
        }],
        vekja: ['vekja+spila', async () => { await this.transfer(d.id, true).catch(() => {}); await waitActive(); await this.play(d.id, uri, 0); await seekLater(); }]
      };
      const pref = store.get('ha_sp_way');
      const order = [pref, 'lag', 'plata', 'rod', 'vekja'].filter((k, n, a) => k && ways[k] && a.indexOf(k) === n);
      let last = null;
      for (const k of order) {
        const [label, fn] = ways[k];
        const e = await step(label, fn);
        if (e) { last = e; if (e.status === 401 || e.status === 403) throw fail(null, e); continue; }
        last = null;
        if (await watch()) { if (k !== pref) store.set('ha_sp_way', k); return d; }
      }
      if (last) throw fail(null, last);
      throw fail(`Spotify tók við skipuninni en ekkert fór að spila á „${d.name}“.`);
    },
    pause(dev) { return this.api('/me/player/pause' + (dev ? '?device_id=' + encodeURIComponent(dev) : ''), { method: 'PUT' }); },
    resume(dev) { return this.api('/me/player/play' + (dev ? '?device_id=' + encodeURIComponent(dev) : ''), { method: 'PUT' }); }
  };
  const img = imgs => { imgs = imgs || []; return (imgs[1] || imgs[0] || {}).url || ''; };
  const fromSp = t => ({ title: t.name, artist: ((t.artists || [])[0] || {}).name || '', spotify_uri: t.uri, isrc: (t.external_ids || {}).isrc || '',
    cover: img(t.album && t.album.images), spYear: yearOf(t.album && t.album.release_date), albumType: t.album && t.album.album_type });
  function bestSp(items, title, artist) {
    const nt = norm(title), na = norm(artist);
    const artOk = x => (x.artists || []).some(a => { const n = norm(a.name); return n === na || n.includes(na) || na.includes(n); });
    let pool = items.filter(x => artOk(x) && (norm(x.name) === nt || norm(x.name).startsWith(nt) || nt.startsWith(norm(x.name))));
    if (!pool.length) pool = items.filter(artOk);
    if (!pool.length) return null;
    const score = x => (x.album && x.album.album_type === 'compilation' ? 1e5 : 0) + (/\blive\b|karaoke|cover|instrumental/i.test(x.name) ? 5e4 : 0)
      + (yearOf(x.album && x.album.release_date) || 3000);
    return pool.sort((a, b) => score(a) - score(b))[0];
  }

  // =====================================================================
  //  Ártillögur: MusicBrainz (elsta útgáfa) og Deezer
  // =====================================================================
  let mbLast = 0, mbBroken = false;
  async function mb(path) {
    const wait = mbLast + (window.__HA_FAST ? 0 : 1100) - Date.now(); if (wait > 0) await sleep(wait);
    mbLast = Date.now();
    const r = await fetch('https://musicbrainz.org/ws/2/' + path + (path.includes('?') ? '&' : '?') + 'fmt=json');
    if (r.status === 503) { await sleep(2500); return mb(path); }
    if (r.status === 404) return {};
    if (!r.ok) throw new Error('MusicBrainz ' + r.status);
    return r.json();
  }
  async function mbYear(s) {
    if (mbBroken) return null;
    try {
      let recs = [];
      if (s.isrc) { const d = await mb('isrc/' + encodeURIComponent(s.isrc) + '?inc=releases'); recs = d.recordings || []; }
      if (!recs.length) {
        const q = `recording:"${s.title.replace(/"/g, '')}" AND artist:"${s.artist.replace(/"/g, '')}"`;
        const d = await mb('recording?limit=10&query=' + encodeURIComponent(q));
        recs = (d.recordings || []).filter(r => (r.score || 0) >= 90 && norm(r.title) === norm(s.title));
      }
      const ys = [];
      recs.forEach(r => { const y = yearOf(r['first-release-date']); if (y) ys.push(y); (r.releases || []).forEach(x => { const yy = yearOf(x.date); if (yy) ys.push(yy); }); });
      return ys.length ? Math.min(...ys) : null;
    } catch (e) {
      if (e instanceof TypeError) { mbBroken = true; toast('Náði ekki í MusicBrainz úr vafranum. Ártillögur koma þá frá Spotify og Deezer.', true); }
      return null;
    }
  }
  async function dzInfo(s) {
    try {
      let t = null;
      if (s.isrc) { try { t = await PQDeezer.dz('/track/isrc:' + s.isrc); } catch (e) { t = null; } }
      if (!t || !t.id) {
        const d = await PQDeezer.dz('/search', { q: `artist:"${s.artist}" track:"${s.title}"`, limit: 6 });
        const list = d.data || [];
        const hit = list.find(x => norm(x.title_short || x.title) === norm(s.title)) || list[0];
        if (hit && hit.id) { try { t = await PQDeezer.dz('/track/' + hit.id); } catch (e) { t = hit; } }
      }
      if (!t || !t.id) return null;
      return { deezer_id: t.id, year: yearOf(t.release_date || (t.album && t.album.release_date)), cover: (t.album && (t.album.cover_medium || t.album.cover)) || '', isrc: t.isrc || '' };
    } catch (e) { return null; }
  }
  // Elsta árið vinnur (safnplötur og endurútgáfur eru yngri). Sjálfkrafa staðfest aðeins ef
  // MusicBrainz eða byrjunarlistinn er sammála hinum heimildunum.
  function decide(sug) {
    const vals = Object.values(sug).filter(Boolean);
    if (!vals.length) return { year: null, verified: false };
    const lo = Math.min(...vals), hi = Math.max(...vals);
    return { year: lo, verified: vals.length >= 2 && lo === hi && !!(sug.musicbrainz || sug.listi) };
  }
  async function enrich(s) {
    s.suggest = s.suggest || {};
    if (s.spYear) s.suggest.spotify = s.spYear;
    const dz = await dzInfo(s);
    if (dz) { s.deezer_id = dz.deezer_id; if (dz.year) s.suggest.deezer = dz.year; if (!s.cover) s.cover = dz.cover; if (!s.isrc) s.isrc = dz.isrc; }
    const m = await mbYear(s); if (m) s.suggest.musicbrainz = m;
    const d = decide(s.suggest);
    return { title: s.title, artist: s.artist, lang: s.lang, suggest: s.suggest, year: d.year, verified: d.verified,
      spotify_uri: s.spotify_uri || '', isrc: s.isrc || '', deezer_id: s.deezer_id || '', cover: s.cover || '' };
  }

  // =====================================================================
  //  Ástand
  // =====================================================================
  const S = {
    bank: null, view: 'setup', job: null,
    game: null, token: null, rounds: [], round: 0, phase: 'setup', players: 0, answered: 0,
    timer: null, poll: null, deadline: 0, revealing: false, lastReveal: null
  };
  const A = { mode: store.get('ha_audio') || 'spotify', dev: store.get('ha_dev') || '', devName: store.get('ha_dev_name') || '', devs: [], startMs: +(store.get('ha_start') || 0), el: new Audio(), paused: false };

  // =====================================================================
  //  1. Uppsetning
  // =====================================================================
  function setupView() {
    S.view = 'setup';
    root.innerHTML = `<section id="setup" class="stage"><div class="setup-wrap">
      <div class="topline"><div class="brand">Hljómey <span>Hvaða ár?</span></div><nav class="modes"><a href="stjorn.html">Pöbbkviss</a><a href="bingo-stjorn.html">Tónlistarbingó</a><a href="gitar.html">Gítarpartý</a><a href="karaoke.html">Karaoke</a><a class="on" href="hvadaar.html">Hvaða ár?</a></nav></div>
      <div id="resumeBox" class="panel hidden"><div class="resume"><div>Leikur <b id="resumeCode"></b> er enn í gangi.</div><div class="row"><button class="btn small" id="resumeBtn">Halda áfram</button><button class="btn small ghost" id="discardBtn">Hunsa</button></div></div></div>
      <div class="panel"><h2>1. Hljóð</h2><div id="spBox"><div class="hint">Sæki stillingar…</div></div></div>
      <div class="panel"><h2>2. Lögin</h2>
        <div class="bank-sum" id="bankSum"><span class="hint">Opnaðu lagabankann með PIN.</span></div>
        <div class="row" style="margin-top:12px"><button class="btn ghost" id="openBank">Opna lagabankann</button></div>
        <label style="margin-top:18px">Blanda</label>
        <div class="chipsel" id="mix">${[[100, 'Bara íslensk'], [75, 'Mest íslensk'], [50, 'Jafnt'], [25, 'Mest erlend'], [0, 'Bara erlend']].map(([v, l]) => `<button type="button" data-v="${v}">${l}</button>`).join('')}</div>
        <label class="qfresh" style="margin-top:14px"><input type="checkbox" id="onlyOk" checked> Aðeins lög með staðfestu ári</label>
        <p class="hint" id="deckInfo" style="margin:4px 0 0"></p>
      </div>
      <div class="panel"><h2>3. Stillingar</h2><div class="grid">
        <div><label for="title">Heiti leiks</label><input type="text" id="title" value="Hvaða ár?"></div>
        <div><label for="target">Spil til sigurs</label><select id="target"><option>5</option><option>7</option><option selected>10</option><option>12</option><option>15</option></select></div>
        <div><label for="secs">Svartími</label><select id="secs"><option value="30">30 sek</option><option value="45" selected>45 sek</option><option value="60">1 mín</option><option value="90">1½ mín</option><option value="0">Ótakmarkaður</option></select></div>
        <div><label for="tol">Erfiðleiki</label><select id="tol"><option value="0">Venjulegt</option><option value="3">Létt (±3 ár)</option></select></div>
        <div><label for="pin">PIN stjórnanda</label><input type="password" id="pin" autocomplete="off"></div>
      </div>
      <div class="row" style="margin-top:16px"><button class="btn" id="createBtn">Búa til leik</button></div>
      <div id="createErr" class="err hidden"></div></div>
    </div></section>`;
    $('pin').value = store.get('pq_pin') || '';
    const mix = store.get('ha_mix') == null ? 50 : store.get('ha_mix');
    document.querySelectorAll('#mix button').forEach(b => b.classList.toggle('on', +b.dataset.v === mix));
    $('mix').onclick = e => { const b = e.target.closest('[data-v]'); if (!b) return; store.set('ha_mix', +b.dataset.v); document.querySelectorAll('#mix button').forEach(x => x.classList.toggle('on', x === b)); deckInfo(); };
    $('onlyOk').onchange = deckInfo;
    $('openBank').onclick = () => openBank();
    $('createBtn').onclick = createGame;
    $('pin').addEventListener('change', () => { if (!S.bank) loadBank(true); });
    renderSp();
    loadBank(true);
    checkResume();
  }

  async function renderSp() {
    const box = $('spBox'); if (!box) return;
    let conf = {};
    try { conf = await rpc('ha_config', {}); }
    catch (e) { box.innerHTML = `<p class="badline">${isMissing(e) ? 'Hvaða ár? er ekki uppsett. Keyrðu <b>hvadaar.sql</b> í Supabase.' : esc(e.message)}</p>`; return; }
    SP.cid = conf.spotify_client_id || '';
    const modeRow = `<div class="chipsel" id="aMode" style="margin-top:14px"><button type="button" data-m="spotify">Spotify – heil lög</button><button type="button" data-m="deezer">Deezer – 30 sek. bútar</button></div>
      <div class="row" style="margin-top:12px"><div style="flex:0 1 220px"><label for="aStart">Lagið byrjar</label><select id="aStart"><option value="0">Í byrjun</option><option value="30000">Eftir 30 sek.</option><option value="45000">Eftir 45 sek.</option></select></div></div>`;
    if (!SP.cid) {
      box.innerHTML = `<p style="margin:0 0 6px">Til að spila heil lög þarf að tengja Spotify (Premium) einu sinni. Annars eru notaðir 30 sek. bútar frá Deezer.</p>
        <ol class="setup-steps"><li>Farðu á <b>developer.spotify.com/dashboard</b> og skráðu þig inn → <b>Create app</b>.</li>
          <li>Nafn: t.d. „Hljómey Hvaða ár“. Undir <b>Redirect URIs</b>: <code>${esc(SP.redirect())}</code>. Hakaðu við <b>Web API</b> → <b>Save</b>.</li>
          <li>Afritaðu <b>Client ID</b> og límdu hér, ásamt PIN-inu.</li></ol>
        <div class="row" style="margin-top:10px"><div class="grow"><label for="cid">Spotify Client ID</label><input type="text" id="cid" autocomplete="off" spellcheck="false"></div><button class="btn" id="cidSave">Vista</button></div>${modeRow}`;
      $('cidSave').onclick = async () => {
        try { await rpc('ha_set_client_id', { p_pin: pin(), p_client_id: $('cid').value }); store.set('pq_pin', pin()); toast('Client ID vistað.'); renderSp(); }
        catch (e) { toast(e.message, true); }
      };
      if (A.mode === 'spotify') A.mode = 'deezer';
    } else if (!SP.connected()) {
      box.innerHTML = `<div class="sp-status"><span class="sp-dot"></span><span>Spotify er ekki tengt.</span><button class="btn small" id="spLogin">Tengja Spotify</button><button class="btn small ghost" id="cidEdit">Breyta Client ID</button></div>
        <p class="hint" style="margin:8px 0 0">Redirect URI í Spotify-forritinu þarf að vera nákvæmlega: <code>${esc(SP.redirect())}</code></p>${modeRow}`;
      $('spLogin').onclick = () => SP.login();
      $('cidEdit').onclick = async () => { const v = prompt('Nýtt Spotify Client ID (tómt = fjarlægja):', SP.cid); if (v == null) return; try { await rpc('ha_set_client_id', { p_pin: pin(), p_client_id: v }); renderSp(); } catch (e) { toast(e.message, true); } };
    } else {
      box.innerHTML = `<div class="sp-status"><span class="sp-dot on"></span><span id="spWho">Spotify er tengt</span>
          <label style="margin:0">Tæki</label><select id="spDev"><option value="">Sæki tæki…</option></select><button class="btn small ghost" id="spRef" title="Endurnýja tækjalista">↻</button>
          <button class="btn small" id="spTest">Prófa Spotify</button><button class="btn small ghost" id="spOut">Aftengja</button></div>
        <p class="hint" style="margin:8px 0 0">Opnaðu Spotify á tækinu sem er tengt hátölurunum (tölvu, síma eða hátalara) svo það birtist í listanum. <b>Prófa Spotify</b> spilar eitt lag í 8 sek.</p>
        <p class="hint hidden" id="spTestRes" style="margin:6px 0 0"></p>${modeRow}`;
      $('spOut').onclick = () => { SP.logout(); renderSp(); };
      $('spRef').onclick = loadDevices;
      $('spDev').onchange = e => { const d = A.devs.find(x => x.id === e.target.value); if (d) setDev(d); };
      $('spTest').onclick = testSpotify;
      SP.me().then(m => { const w = $('spWho'); if (w && m) w.textContent = 'Tengt: ' + (m.display_name || m.id); }).catch(e => toast(e.message, true));
      loadDevices();
    }
    if (!SP.connected() && A.mode === 'spotify') A.mode = 'deezer';
    document.querySelectorAll('#aMode button').forEach(b => b.classList.toggle('on', b.dataset.m === A.mode));
    $('aMode').onclick = e => {
      const b = e.target.closest('[data-m]'); if (!b) return;
      if (b.dataset.m === 'spotify' && !SP.connected()) return toast('Tengdu Spotify fyrst.', true);
      A.mode = b.dataset.m; store.set('ha_audio', A.mode); document.querySelectorAll('#aMode button').forEach(x => x.classList.toggle('on', x === b));
    };
    $('aStart').value = String(A.startMs); $('aStart').onchange = e => { A.startMs = +e.target.value; store.set('ha_start', A.startMs); };
  }
  function setDev(d) {
    A.dev = d.id; A.devName = d.name; store.set('ha_dev', A.dev); store.set('ha_dev_name', A.devName);
    const sel = $('spDev'); if (sel && [...sel.options].some(o => o.value === d.id)) sel.value = d.id;
  }
  // Finnur lag á Spotify ef það vantar slóð (t.d. lög sem voru sótt áður en Spotify var tengt) og vistar hana í bankanum.
  async function spFind(s, songId) {
    const best = bestSp(await SP.search(`${s.title} artist:${s.artist}`), s.title, s.artist)
      || bestSp(await SP.search(`${s.artist} ${s.title}`), s.title, s.artist);
    if (!best) return null;
    const x = fromSp(best);
    if (songId && pin()) {
      rpc('ha_bank_upsert', { p_pin: pin(), p_rows: [{ id: songId, spotify_uri: x.spotify_uri, isrc: x.isrc, cover: x.cover }] })
        .then(() => { const b = (S.bank || []).find(y => y.id === songId); if (b) b.spotify_uri = x.spotify_uri; }).catch(() => {});
    }
    return x.spotify_uri;
  }
  async function testSpotify() {
    const out = $('spTestRes'), btn = $('spTest'); if (!out) return;
    const say = (t, bad) => { out.classList.remove('hidden'); out.className = 'hint' + (bad ? ' badline' : ''); out.textContent = t; };
    btn.disabled = true; say('Prófa… (getur tekið allt að hálfa mínútu)');
    const diags = [];
    const tryOne = async (s, uri) => {
      try {
        const d = await SP.playSure(uri, A.startMs, s.title); A.spBroken = false;
        say(`✓ Spotify spilar „${s.title}“ á ${d.name}. Stöðvast eftir 8 sek.`);
        setTimeout(() => { SP.pause(d.id).catch(() => {}); }, 8000);
        return true;
      } catch (e) { diags.push({ s, uri, e }); return false; }
    };
    try {
      const s = (S.bank || []).find(x => x.spotify_uri && x.active);
      if (s && await tryOne(s, s.spotify_uri)) return;
      const q = { title: 'Bohemian Rhapsody', artist: 'Queen' }, uri = await spFind(q);
      if (uri && await tryOne(q, uri)) {
        if (s) out.innerHTML += `<br><small style="opacity:.8">Lag úr bankanum („${esc(s.title)}“) spilaðist ekki, en nýtt lag úr leit gerði það. Sendu Claude þetta: ${esc(s.spotify_uri)} · ${esc(diags[0].e.diag || diags[0].e.message)}</small>`;
        return;
      }
      if (!uri && !s) throw new Error('Fann ekkert prufulag á Spotify.');
      const e = diags[diags.length - 1].e;
      say('✗ ' + e.message, true);
      out.innerHTML += diags.map(x => `<br><small style="opacity:.8">„${esc(x.s.title)}“ (${esc(x.uri)}): ${esc(x.e.diag || x.e.message)}</small>`).join('')
        + '<br><small style="opacity:.8">Prófaðu að velja símann þinn sem tæki (opnaðu Spotify í honum og ýttu á ↻). Ef það virkar þar liggur vandinn í Spotify á tölvunni.</small>';
    } catch (e) { say('✗ ' + e.message, true); }
    finally { btn.disabled = false; }
  }
  async function loadDevices() {
    const sel = $('spDev'); if (!sel) return;
    try {
      const ds = A.devs = await SP.devices();
      sel.innerHTML = ds.length ? ds.map(d => `<option value="${esc(d.id)}">${esc(d.name)} (${esc(d.type)})</option>`).join('') : '<option value="">Ekkert tæki – opnaðu Spotify</option>';
      const d = ds.find(x => x.id === A.dev) || ds.find(x => A.devName && x.name === A.devName) || ds.find(x => x.is_active) || ds[0];
      if (d) setDev(d);
    } catch (e) { sel.innerHTML = '<option value="">Náði ekki í tæki</option>'; toast(e.message, true); }
  }

  // ---------- Lagabankinn ----------
  async function loadBank(quiet) {
    if (!pin()) { if (!quiet) toast('Sláðu inn PIN fyrst.', true); return false; }
    try { S.bank = await rpc('ha_bank_list', { p_pin: pin() }); store.set('pq_pin', pin()); bankSum(); return true; }
    catch (e) {
      if (!quiet) toast(isMissing(e) ? 'Keyrðu hvadaar.sql í Supabase fyrst.' : e.message, true);
      const b = $('bankSum'); if (b) b.innerHTML = `<span class="badline">${isMissing(e) ? 'Hvaða ár? er ekki uppsett. Keyrðu hvadaar.sql í Supabase.' : esc(e.message)}</span>`;
      return false;
    }
  }
  function bankSum() {
    const b = $('bankSum'); if (!b || !S.bank) return;
    const all = S.bank, is = all.filter(s => s.lang === 'is').length, ok = all.filter(s => s.verified && s.year).length, noSp = all.filter(s => !s.spotify_uri).length;
    b.innerHTML = all.length ? `<span><b>${all.length}</b> lög</span><span><b>${is}</b> íslensk</span><span><b>${all.length - is}</b> erlend</span><span><b>${ok}</b> staðfest</span>${SP.connected() && noSp ? `<span class="warn"><b>${noSp}</b> ekki tengd Spotify</span>` : ''}${all.length - ok ? `<span class="warn"><b>${all.length - ok}</b> bíða yfirferðar</span>` : ''}`
      : '<span>Lagabankinn er tómur. Opnaðu hann og sæktu byrjunarlistann eða Spotify-lagalista.</span>';
    deckInfo();
  }
  function usable() { const only = $('onlyOk') ? $('onlyOk').checked : true; return (S.bank || []).filter(s => s.active && s.year && (s.verified || !only)); }
  function deckInfo() {
    const el = $('deckInfo'); if (!el || !S.bank) return;
    const u = usable(), is = u.filter(s => s.lang === 'is').length;
    el.textContent = `${u.length} lög koma til greina (${is} íslensk, ${u.length - is} erlend).`;
  }

  function openBank() {
    if (!S.bank) { loadBank(false).then(ok => { if (ok) openBank(); }); return; }
    const ov = document.createElement('div'); ov.className = 'bank'; ov.id = 'bank';
    ov.innerHTML = `<div class="bank-top"><h2>Lagabankinn</h2><button class="btn small ghost" id="bkClose">Loka</button></div>
      <div class="bank-tools">
        <input type="search" id="bkQ" placeholder="Leita að lagi eða flytjanda">
        <select id="bkF"><option value="">Öll lög</option><option value="todo">Bíða yfirferðar</option><option value="ok">Staðfest</option><option value="is">Íslensk</option><option value="erl">Erlend</option><option value="off">Óvirk</option><option value="nosp">Ekki á Spotify</option></select>
        <button class="btn small" id="bkStart">Sækja byrjunarlista</button>
        <button class="btn small ghost" id="bkPl">Úr Spotify-lagalista</button>
        <button class="btn small ghost" id="bkAdd">+ Bæta við lagi</button>
        <button class="btn small ghost" id="bkAgree">Staðfesta samhljóða</button>
        ${SP.connected() ? '<button class="btn small ghost" id="bkSp">Finna á Spotify</button>' : ''}
      </div>
      <div class="bank-prog hidden" id="bkProg"><span id="bkProgT"></span><span class="bar"><i id="bkBar"></i></span><button class="btn small ghost" id="bkStop">Stöðva</button></div>
      <div class="bank-list" id="bkList"></div>`;
    document.body.appendChild(ov);
    $('bkClose').onclick = () => { ov.remove(); bankSum(); };
    $('bkQ').oninput = drawBank; $('bkF').onchange = drawBank;
    $('bkStart').onclick = importStarter;
    $('bkPl').onclick = importPlaylist;
    $('bkAdd').onclick = addSong;
    $('bkAgree').onclick = confirmAgreeing;
    if ($('bkSp')) $('bkSp').onclick = findOnSpotify;
    $('bkStop').onclick = () => { if (S.job) S.job.cancel = true; };
    $('bkList').addEventListener('click', bankClick);
    $('bkList').addEventListener('change', bankChange);
    drawProg(); drawBank();
  }
  function rowStatus(s) {
    if (!s.year) return 'bad';
    if (s.verified) return 'ok';
    return 'warn';
  }
  const SRC = { listi: 'Listi', spotify: 'Spotify', musicbrainz: 'MusicBrainz', deezer: 'Deezer' };
  function drawBank() {
    const box = $('bkList'); if (!box) return;
    const q = norm($('bkQ').value), f = $('bkF').value;
    const list = S.bank.filter(s => (!q || norm(s.title + ' ' + s.artist).includes(q)) &&
      (!f || (f === 'todo' && (!s.verified || !s.year)) || (f === 'ok' && s.verified && s.year) || (f === s.lang) || (f === 'off' && !s.active) || (f === 'nosp' && !s.spotify_uri)))
      .sort((a, b) => (rowStatus(a) === 'ok') - (rowStatus(b) === 'ok') || a.artist.localeCompare(b.artist, 'is') || a.title.localeCompare(b.title, 'is'));
    if (!S.bank.length) { box.innerHTML = '<div class="empty2">Lagabankinn er tómur.<br>Smelltu á <b>Sækja byrjunarlista</b> (um 215 lög) eða sæktu lög úr þínum eigin Spotify-lagalista.</div>'; return; }
    if (!list.length) { box.innerHTML = '<div class="empty2">Ekkert passar við leitina.</div>'; return; }
    box.innerHTML = list.slice(0, 600).map(s => {
      const sug = s.suggest || {};
      const chips = Object.keys(SRC).filter(k => sug[k]).map(k => `<button type="button" data-set="${sug[k]}" class="${sug[k] === s.year ? 'same' : 'diff'}" title="Nota ${sug[k]}">${SRC[k]}<b>${sug[k]}</b></button>`).join('');
      return `<div class="brow2 ${rowStatus(s)}${s.active ? '' : ' off'}" data-id="${s.id}">
        ${s.cover ? `<img src="${esc(s.cover)}" alt="" loading="lazy">` : '<span class="noimg"></span>'}
        <div class="tx"><b>${esc(s.title)}</b><small>${esc(s.artist)}${s.spotify_uri ? '' : ' · ekki á Spotify'}</small></div>
        <button type="button" class="lang ${s.lang}" data-act="lang" title="Íslenskt / erlent">${s.lang === 'is' ? 'ÍSL' : 'ERL'}</button>
        <input type="number" class="yr" value="${s.year || ''}" placeholder="Ár" min="1900" max="2100" aria-label="Ár">
        <div class="sugg">${chips || '<span class="hint" style="font-size:12px">Engar tillögur</span>'}</div>
        <div class="bact"><button type="button" class="ib2${s.verified ? ' on' : ''}" data-act="ok" title="${s.verified ? 'Staðfest' : 'Staðfesta árið'}">✓</button>
          <button type="button" class="ib2" data-act="play" title="Hlusta">▶</button><button type="button" class="ib2" data-act="del" title="Eyða">✕</button></div></div>`;
    }).join('') + (list.length > 600 ? `<div class="empty2">… og ${list.length - 600} til viðbótar. Notaðu leitina.</div>` : '');
  }
  async function saveRow(id, patch) {
    const s = S.bank.find(x => x.id === id); if (!s) return;
    Object.assign(s, patch);
    try { await rpc('ha_bank_upsert', { p_pin: pin(), p_rows: [Object.assign({ id }, patch)] }); }
    catch (e) { toast(e.message, true); }
  }
  async function bankClick(e) {
    const row = e.target.closest('.brow2'); if (!row) return;
    const id = row.dataset.id, s = S.bank.find(x => x.id === id);
    const setB = e.target.closest('[data-set]'), act = e.target.closest('[data-act]');
    if (setB) { await saveRow(id, { year: +setB.dataset.set, verified: true }); drawBank(); return; }
    if (!act) return;
    const a = act.dataset.act;
    if (a === 'lang') { await saveRow(id, { lang: s.lang === 'is' ? 'erl' : 'is' }); drawBank(); }
    if (a === 'ok') { if (!s.year) return toast('Settu inn ár fyrst.', true); await saveRow(id, { verified: !s.verified }); drawBank(); }
    if (a === 'del') { if (!confirm(`Eyða „${s.title}“ úr lagabankanum?`)) return; try { await rpc('ha_bank_delete', { p_pin: pin(), p_ids: [id] }); S.bank = S.bank.filter(x => x.id !== id); drawBank(); } catch (err) { toast(err.message, true); } }
    if (a === 'play') previewSong(s);
  }
  async function bankChange(e) {
    const inp = e.target.closest('input.yr'); if (!inp) return;
    const id = inp.closest('.brow2').dataset.id, v = +inp.value;
    if (inp.value && (v < 1900 || v > 2100)) return toast('Árið verður að vera á bilinu 1900–2100.', true);
    await saveRow(id, { year: inp.value ? v : '', verified: !!inp.value }); drawBank();
  }
  async function previewSong(s) {
    try {
      if (A.mode === 'spotify' && SP.connected()) {
        const uri = s.spotify_uri || await spFind(s, s.id);
        if (uri) { toast(`Set „${s.title}“ í gang á Spotify…`); const d = await SP.playSure(uri, A.startMs, s.title); toast(`Spilar á ${d.name}.`); drawBank(); return; }
      }
      let id = s.deezer_id; if (!id) { const d = await dzInfo(s); id = d && d.deezer_id; }
      if (!id) return toast('Fann ekki hljóð fyrir lagið.', true);
      A.el.src = await PQDeezer.refreshPreview(id); A.el.currentTime = 0; await A.el.play();
      toast(`Spila 30 sek. bút: „${s.title}“`);
    } catch (e) { toast(e.message, true); }
  }
  async function confirmAgreeing() {
    const rows = S.bank.filter(s => !s.verified && s.year && (() => { const v = Object.values(s.suggest || {}).filter(Boolean); return v.length >= 2 && v.every(y => y === s.year); })());
    if (!rows.length) return toast('Engin óstaðfest lög þar sem allar heimildir eru sammála.');
    if (!confirm(`Staðfesta ${rows.length} lög þar sem allar heimildir eru sammála um árið?`)) return;
    try {
      await rpc('ha_bank_upsert', { p_pin: pin(), p_rows: rows.map(s => ({ id: s.id, verified: true })) });
      rows.forEach(s => { s.verified = true; }); drawBank(); toast(`${rows.length} lög staðfest.`);
    } catch (e) { toast(e.message, true); }
  }

  // ---------- Innflutningur (keyrir í bakgrunni með framvindu) ----------
  function drawProg() {
    const p = $('bkProg'); if (!p) return;
    const j = S.job;
    p.classList.toggle('hidden', !j);
    if (!j) return;
    $('bkProgT').textContent = `${j.label}: ${j.done} af ${j.total}${j.note ? ' · ' + j.note : ''}`;
    $('bkBar').style.width = (j.total ? (j.done / j.total) * 100 : 0) + '%';
  }
  async function runJob(label, items, work, note, finish) {
    if (S.job) return toast('Innflutningur er þegar í gangi.', true);
    const j = S.job = { label, total: items.length, done: 0, cancel: false, note };
    drawProg();
    let batch = [], added = 0, saved = 0;
    const flush = async () => {
      if (!batch.length) return;
      const rows = batch; batch = [];
      try { const r = await rpc('ha_bank_upsert', { p_pin: pin(), p_rows: rows }); added += r.added; saved += r.added + r.updated; }
      catch (e) { toast(e.message, true); }
    };
    for (const it of items) {
      if (j.cancel) break;
      try { const row = await work(it); if (row) batch.push(row); } catch (e) { /* sleppa laginu */ }
      j.done++; drawProg();
      if (batch.length >= 8) { await flush(); await loadBank(true); drawBank(); }
    }
    await flush(); await loadBank(true);
    S.job = null; drawProg(); drawBank();
    toast(finish ? finish(j, saved) : `${label}: ${j.done} lög unnin, ${added} ný í bankanum.`);
  }
  function findOnSpotify() {
    if (!SP.connected()) return toast('Tengdu Spotify fyrst (efst á síðunni).', true);
    const items = (S.bank || []).filter(s => !s.spotify_uri);
    if (!items.length) return toast('Öll lögin í bankanum eru þegar tengd Spotify.');
    if (!confirm(`Finna ${items.length} lög á Spotify? Árin breytast ekki, aðeins tengingin við Spotify bætist við.`)) return;
    runJob('Finna á Spotify', items, async s => {
      const best = bestSp(await SP.search(`${s.title} artist:${s.artist}`), s.title, s.artist)
        || bestSp(await SP.search(`${s.artist} ${s.title}`), s.title, s.artist);
      if (!best) return null;
      const x = fromSp(best), row = { id: s.id, spotify_uri: x.spotify_uri };
      if (!s.isrc && x.isrc) row.isrc = x.isrc;
      if (!s.cover && x.cover) row.cover = x.cover;
      if (x.spYear && !(s.suggest || {}).spotify) row.suggest = { spotify: x.spYear };
      return row;
    }, null, (j, saved) => `Finna á Spotify: ${saved} af ${j.done} lögum fundust.` + (j.done - saved ? ' Hin spilast sem Deezer-bútar.' : ''));
  }
  function importStarter() {
    const have = new Set((S.bank || []).map(s => norm(s.artist) + '|' + norm(s.title)));
    const items = (window.HA_START || []).filter(([t, a]) => !have.has(norm(a) + '|' + norm(t)));
    if (!items.length) return toast('Öll lögin úr byrjunarlistanum eru þegar í bankanum.');
    const mins = Math.ceil(items.length * 1.3 / 60);
    if (!confirm(`Sækja ${items.length} lög úr byrjunarlistanum?\n\nKerfið finnur hvert lag ${SP.connected() ? 'á Spotify og ' : ''}á Deezer og ber árið saman við MusicBrainz. Það tekur um ${mins} mín. Þú getur haldið áfram að vinna á meðan.`)) return;
    runJob('Byrjunarlisti', items, async ([t, a, y, l]) => {
      const s = { title: t, artist: a, lang: l, suggest: y ? { listi: y } : {} };
      if (SP.connected()) {
        try {
          const best = bestSp(await SP.search(`${t} artist:${a}`), t, a);
          if (best) { const x = fromSp(best); Object.assign(s, { spotify_uri: x.spotify_uri, isrc: x.isrc, cover: x.cover, spYear: x.spYear }); }
        } catch (e) { if (e.status === 401) throw e; }
      }
      return enrich(s);
    }, 'MusicBrainz leyfir eitt lag á sekúndu');
  }
  async function importPlaylist() {
    if (!SP.connected()) return toast('Tengdu Spotify fyrst (efst á síðunni).', true);
    let pls;
    try { pls = await SP.playlists(); } catch (e) { return toast(e.message, true); }
    const ov = document.createElement('div'); ov.className = 'ovl';
    ov.innerHTML = `<div class="box"><h3>Sækja lög úr Spotify-lagalista</h3>
      <p class="hint" style="margin:0">Aðeins listar sem þú átt eða ert meðhöfundur að. Ritstýrðir Spotify-listar virka ekki: afritaðu lögin yfir í eigin lista.</p>
      <label style="margin-top:12px">Lögin í listanum eru</label><div class="chipsel" id="plLang"><button type="button" data-l="is">Íslensk</button><button type="button" data-l="erl" class="on">Erlend</button></div>
      <div class="list">${pls.map(p => `<button type="button" data-id="${esc(p.id)}">${img(p.images) ? `<img src="${esc(img(p.images))}" alt="">` : ''}<span><b>${esc(p.name)}</b><small>${(p.items || p.tracks || {}).total || 0} lög</small></span></button>`).join('') || '<div class="hint">Engir lagalistar fundust.</div>'}</div>
      <div class="foot"><button class="btn ghost" id="plX">Hætta við</button></div></div>`;
    document.body.appendChild(ov);
    let lang = 'erl';
    $('plLang').onclick = e => { const b = e.target.closest('[data-l]'); if (!b) return; lang = b.dataset.l; ov.querySelectorAll('#plLang button').forEach(x => x.classList.toggle('on', x === b)); };
    $('plX').onclick = () => ov.remove();
    ov.querySelector('.list').addEventListener('click', async e => {
      const b = e.target.closest('[data-id]'); if (!b) return;
      ov.remove();
      let tracks;
      try { tracks = await SP.items(b.dataset.id); } catch (err) { return toast(err.message, true); }
      const key = x => norm(x.artist) + '|' + norm(x.title);
      const byKey = new Map((S.bank || []).map(s => [key(s), s]));
      const all = tracks.map(fromSp);
      const fill = all.filter(x => byKey.has(key(x)) && !byKey.get(key(x)).spotify_uri)
        .map(x => ({ id: byKey.get(key(x)).id, spotify_uri: x.spotify_uri, isrc: x.isrc, cover: x.cover }));
      if (fill.length) { try { await rpc('ha_bank_upsert', { p_pin: pin(), p_rows: fill }); await loadBank(true); drawBank(); } catch (err) { /* sleppt */ } }
      const items = all.filter(x => !byKey.has(key(x)));
      if (!items.length) return toast('Öll lögin í listanum eru þegar í bankanum.' + (fill.length ? ` ${fill.length} þeirra voru tengd Spotify.` : ''));
      runJob('Spotify-lagalisti', items, s => enrich(Object.assign(s, { lang })), 'MusicBrainz leyfir eitt lag á sekúndu');
    });
  }
  function addSong() {
    const ov = document.createElement('div'); ov.className = 'ovl';
    ov.innerHTML = `<div class="box"><h3>Bæta við lagi</h3>
      <form class="row" id="asF"><div class="grow"><input type="search" id="asQ" placeholder="Heiti lags og flytjandi" style="width:100%;background:var(--bg2);border:1px solid var(--line);border-radius:10px;padding:11px 12px"></div><button class="btn">Leita</button></form>
      <div class="chipsel" id="asLang" style="margin-top:10px"><button type="button" data-l="is">Íslenskt</button><button type="button" data-l="erl" class="on">Erlent</button></div>
      <div class="list" id="asL"></div><div class="foot"><button class="btn ghost" id="asX">Loka</button></div></div>`;
    document.body.appendChild(ov);
    let lang = 'erl', found = [];
    $('asLang').onclick = e => { const b = e.target.closest('[data-l]'); if (!b) return; lang = b.dataset.l; ov.querySelectorAll('#asLang button').forEach(x => x.classList.toggle('on', x === b)); };
    $('asX').onclick = () => ov.remove();
    setTimeout(() => $('asQ').focus(), 30);
    $('asF').onsubmit = async e => {
      e.preventDefault();
      const q = $('asQ').value.trim(); if (!q) return;
      $('asL').innerHTML = '<div class="hint">Leita…</div>';
      try {
        if (SP.connected()) found = (await SP.search(q)).map(fromSp);
        else { const d = await PQDeezer.dz('/search', { q, limit: 10 }); found = (d.data || []).map(t => ({ title: t.title_short || t.title, artist: (t.artist || {}).name || '', cover: (t.album || {}).cover_medium || '', deezer_id: t.id })); }
        $('asL').innerHTML = found.map((t, i) => `<button type="button" data-i="${i}">${t.cover ? `<img src="${esc(t.cover)}" alt="">` : ''}<span><b>${esc(t.title)}</b><small>${esc(t.artist)}${t.spYear ? ' · plata ' + t.spYear : ''}</small></span></button>`).join('') || '<div class="hint">Ekkert fannst.</div>';
      } catch (err) { $('asL').innerHTML = `<div class="badline">${esc(err.message)}</div>`; }
    };
    $('asL').addEventListener('click', async e => {
      const b = e.target.closest('[data-i]'); if (!b) return;
      const s = Object.assign({}, found[+b.dataset.i], { lang });
      b.disabled = true; b.querySelector('small').textContent = 'Finn ár…';
      try {
        const row = await enrich(s);
        const r = await rpc('ha_bank_upsert', { p_pin: pin(), p_rows: [row] });
        await loadBank(true); drawBank();
        toast(r.added ? `„${s.title}“ komið í bankann${row.year ? ' (' + row.year + ')' : ''}.` : `„${s.title}“ var þegar í bankanum.`);
        b.querySelector('small').textContent = row.year ? 'Komið · ' + row.year + (row.verified ? ' ✓' : ' – athugaðu árið') : 'Komið – ár vantar';
      } catch (err) { toast(err.message, true); b.disabled = false; }
    });
  }

  // =====================================================================
  //  2. Leikurinn búinn til
  // =====================================================================
  function spreadPick(list, n) {
    // Dreifir á áratugi og tekur helst lög sem hafa verið minnst notuð
    const by = {};
    shuffle(list).sort((a, b) => a.times_used - b.times_used).forEach(s => { const d = Math.floor(s.year / 10); (by[d] = by[d] || []).push(s); });
    const decs = shuffle(Object.keys(by)), out = [];
    while (out.length < n && decs.some(d => by[d].length)) for (const d of decs) if (out.length < n && by[d].length) out.push(by[d].shift());
    return out;
  }
  function interleave(a, b) {
    const tag = (l, w) => l.map((x, i) => ({ x, p: (i + 0.5) / l.length + w }));
    return tag(a, 0).concat(tag(b, 1e-4)).sort((u, v) => u.p - v.p).map(o => o.x);
  }
  function artistOptions(song, pool) {
    const seen = new Set([norm(song.artist)]), wrong = [];
    const same = shuffle(pool.filter(s => s.lang === song.lang)), other = shuffle(pool.filter(s => s.lang !== song.lang));
    for (const s of same.concat(other)) { const k = norm(s.artist); if (!seen.has(k)) { seen.add(k); wrong.push(s.artist); } if (wrong.length === 3) break; }
    while (wrong.length < 3) wrong.push(['Stuðmenn', 'ABBA', 'Queen', 'Björk', 'Madonna'][wrong.length]);
    const idx = Math.floor(Math.random() * 4); const opts = wrong.slice(); opts.splice(idx, 0, song.artist);
    return { artists: opts, artist_idx: idx };
  }
  async function createGame() {
    const err = m => { $('createErr').textContent = m; $('createErr').classList.toggle('hidden', !m); };
    err('');
    if (!S.bank && !(await loadBank(false))) return err('Sláðu inn rétt PIN svo hægt sé að sækja lagabankann.');
    const all = usable();
    if (all.length < 12) return err(`Of fá lög koma til greina (${all.length}). Opnaðu lagabankann og staðfestu ár eða taktu hakið af „Aðeins lög með staðfestu ári“.`);
    const mix = store.get('ha_mix') == null ? 50 : store.get('ha_mix');
    const isL = all.filter(s => s.lang === 'is'), erL = all.filter(s => s.lang === 'erl');
    const src = mix === 100 ? isL : mix === 0 ? erL : all;
    if (src.length < 12) return err(`Of fá ${mix === 100 ? 'íslensk' : 'erlend'} lög koma til greina (${src.length}). Veldu aðra blöndu eða bættu við lögum.`);
    const nPool = Math.min(60, Math.max(8, Math.floor(src.length * 0.25)));
    const nDeck = Math.min(80, src.length - nPool);
    let nIs, nEr;
    if (mix === 100) { nIs = nDeck; nEr = 0; }
    else if (mix === 0) { nIs = 0; nEr = nDeck; }
    else {
      nIs = Math.min(Math.round(nDeck * mix / 100), isL.length);
      nEr = Math.min(nDeck - nIs, erL.length);
      if (nIs + nEr < nDeck) nIs = Math.min(isL.length, nDeck - nEr);
    }
    const deck = interleave(spreadPick(isL, nIs), spreadPick(erL, nEr));
    const used = new Set(deck.map(s => s.id));
    const pool = spreadPick(src.filter(s => !used.has(s.id)), nPool);
    const rounds = deck.map(s => Object.assign({ song_id: s.id, title: s.title, artist: s.artist, year: s.year, cover: s.cover || '', lang: s.lang,
      meta: { spotify_uri: s.spotify_uri || '', deezer_id: s.deezer_id || '', isrc: s.isrc || '' } }, artistOptions(s, all)));
    $('createBtn').disabled = true;
    try {
      const res = await rpc('ha_create', { p_pin: pin(), p_title: $('title').value, p_answer_seconds: +$('secs').value, p_target: +$('target').value,
        p_tolerance: +$('tol').value, p_rounds: rounds, p_pool: pool.map(s => ({ title: s.title, artist: s.artist, year: s.year, cover: s.cover || '' })) });
      store.set('pq_pin', pin());
      S.game = { game_id: res.game_id, code: res.code, title: $('title').value || 'Hvaða ár?', answer_seconds: +$('secs').value, target: +$('target').value, total_rounds: rounds.length };
      S.token = res.host_token; S.rounds = rounds; S.round = 0;
      store.set('ha_host', { game_id: res.game_id, host_token: res.host_token });
      enterLobby();
      return;
    } catch (e) { err(e.message); }
    if ($('createBtn')) $('createBtn').disabled = false;
  }
  async function checkResume() {
    const saved = store.get('ha_host'); if (!saved) return;
    try {
      const d = await rpc('ha_host_get', { p_game: saved.game_id, p_token: saved.host_token });
      if (!d || !d.game || d.game.state === 'finished') { store.del('ha_host'); return; }
      $('resumeCode').textContent = d.game.code; $('resumeBox').classList.remove('hidden');
      $('resumeBtn').onclick = () => {
        const g = d.game;
        S.game = { game_id: g.id, code: g.code, title: g.title, answer_seconds: g.answer_seconds, target: g.target, total_rounds: g.total_rounds };
        S.token = saved.host_token; S.rounds = d.rounds; S.round = g.current_round;
        if (g.state === 'lobby') return enterLobby();
        stageShell();
        if (g.state === 'question') { S.phase = 'question'; return doReveal(); }
        showBoard();
      };
      $('discardBtn').onclick = () => { store.del('ha_host'); $('resumeBox').classList.add('hidden'); };
    } catch (e) { store.del('ha_host'); }
  }

  // =====================================================================
  //  3. Stóri skjárinn
  // =====================================================================
  const joinUrl = () => new URL('hvadaar.html?k=' + S.game.code, location.href).href;
  const prettyUrl = () => new URL('./', location.href).href.replace(/^https?:\/\//, '').replace(/\/$/, '');
  let wake = null;
  function keepAwake() { if ('wakeLock' in navigator && !wake) navigator.wakeLock.request('screen').then(w => { wake = w; w.addEventListener('release', () => { wake = null; }); }).catch(() => {}); }
  function stageShell() {
    keepAwake();
    root.innerHTML = `<section id="stage" class="stage"><div class="topline"><div class="brand" id="sTitle"></div><div class="muted" id="sCode"></div></div><div id="sBody" style="flex:1;display:flex;flex-direction:column;min-height:0"></div></section>
      <div class="bar-ctl" id="ctl"><button class="btn" id="primary">Byrja</button><button class="btn ghost small" id="replay">▶ Spila aftur</button><button class="btn ghost small" id="pauseB">❚❚ Pása</button>
        <div class="info" id="ctlInfo"></div><button class="btn ghost small" id="fsBtn">Fullur skjár</button><button class="btn ghost small" id="quitBtn">Hætta</button></div>`;
    $('sTitle').textContent = S.game.title;
    $('sCode').textContent = `${prettyUrl()} · ${S.game.code}`;
    $('primary').onclick = () => { if (primaryFn && !$('primary').disabled) primaryFn(); };
    $('replay').onclick = () => { const r = S.rounds[S.round - 1]; if (r) playRound(r, true); };
    $('pauseB').onclick = togglePause;
    $('fsBtn').onclick = () => { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen().catch(() => {}); };
    $('quitBtn').onclick = () => { if (confirm('Hætta í leiknum og sýna úrslit?')) showFinal(); };
  }
  let primaryFn = null;
  function setPrimary(t, fn) { $('primary').textContent = t; primaryFn = fn; $('primary').disabled = false; }
  const info = t => { $('ctlInfo').textContent = t; };
  document.addEventListener('click', e => { const b = e.target.closest('button'); if (b) b.blur(); });
  document.addEventListener('keydown', e => {
    if (!$('ctl') || /INPUT|SELECT|TEXTAREA/.test((document.activeElement || {}).tagName)) return;
    if (e.code === 'Space' || e.key === 'Enter') { e.preventDefault(); $('primary').click(); }
  });

  function enterLobby() {
    stageShell(); S.phase = 'lobby';
    const qr = qrcode(0, 'M'); qr.addData(joinUrl()); qr.make();
    $('sBody').innerHTML = `<div class="lobby"><div class="qr">${qr.createSvgTag({ cellSize: 8, margin: 2, scalable: true })}</div>
      <div><div class="join-url">Skannaðu QR eða farðu á <b>${esc(prettyUrl())}</b></div><div class="code">${esc(S.game.code)}</div>
      <div class="pcount" id="pcount">0 leikmenn</div><div class="chips" id="pchips"></div>
      <p class="muted" style="font-size:clamp(14px,1.4vw,22px);margin-top:2vh">Fyrst/ur í ${S.game.target} spil vinnur. Hver fær eitt byrjunarspil með ártali.</p></div></div>`;
    setPrimary('Byrja leik', () => startRound(1));
    $('replay').classList.add('hidden'); $('pauseB').classList.add('hidden');
    info('Bíð eftir leikmönnum…');
    clearInterval(S.poll); refreshLobby(); S.poll = setInterval(refreshLobby, 2000);
  }
  async function refreshLobby() {
    const { data } = await client.from('ha_players').select('name').eq('game_id', S.game.game_id).order('joined_at', { ascending: false }).limit(80);
    if (!data || !$('pcount')) return;
    S.players = data.length;
    $('pcount').textContent = `${data.length} ${data.length === 1 ? 'leikmaður' : 'leikmenn'}`;
    $('pchips').innerHTML = data.map(p => `<span>${esc(p.name)}</span>`).join('');
    $('primary').disabled = !data.length;
  }

  // ---------- Hljóð ----------
  async function playRound(r, again) {
    A.paused = false; $('pauseB') && ($('pauseB').textContent = '❚❚ Pása');
    const m = r.meta || {};
    if (A.mode === 'spotify' && SP.connected() && !A.spBroken) {
      try {
        if (!m.spotify_uri) m.spotify_uri = await spFind(r, r.song_id);
        if (m.spotify_uri) { await SP.playSure(m.spotify_uri, A.startMs, r.title); return; }
        toast('Lagið fannst ekki á Spotify. Spila 30 sek. bút frá Deezer.', true);
      } catch (e) {
        // Ekki bíða aftur og aftur í sama leik: næstu lög fara beint á Deezer
        if (!e.unplayable && (!e.status || e.status === 404)) A.spBroken = true;
        toast(e.message + ' Spila Deezer-bút' + (A.spBroken ? ' í þessum leik.' : ' í staðinn.'), true);
      }
    }
    try {
      let id = m.deezer_id;
      if (!id) { const d = await dzInfo(r); id = d && d.deezer_id; m.deezer_id = id; }
      if (!id) return toast('Fann ekki hljóð fyrir lagið.', true);
      A.el.src = await PQDeezer.refreshPreview(id); A.el.currentTime = 0; await A.el.play();
    } catch (e) { toast('Hljóð: ' + e.message, true); }
  }
  async function stopAudio() { A.el.pause(); if (A.mode === 'spotify' && SP.connected()) { try { await SP.pause(A.dev); } catch (e) {} } }
  async function togglePause() {
    try {
      if (A.paused) { if (A.mode === 'spotify' && SP.connected()) await SP.resume(A.dev); else await A.el.play(); A.paused = false; }
      else { if (A.mode === 'spotify' && SP.connected()) await SP.pause(A.dev); else A.el.pause(); A.paused = true; }
      $('pauseB').textContent = A.paused ? '▶ Halda áfram' : '❚❚ Pása';
    } catch (e) { toast(e.message, true); }
  }

  // ---------- Umferð ----------
  async function startRound(n) {
    clearInterval(S.poll); clearInterval(S.timer);
    const r = S.rounds[n - 1]; if (!r) return showFinal();
    S.round = n; S.revealing = false;
    $('primary').disabled = true; info('Set lag í gang…');
    try { await rpc('ha_start_round', { p_game: S.game.game_id, p_token: S.token, p_round: n }); }
    catch (e) { toast(e.message, true); $('primary').disabled = false; return; }
    S.phase = 'question';
    const secs = S.game.answer_seconds;
    $('sBody').innerHTML = `<div class="ha-q"><div><div class="vinyl spin"></div><h1>Hvaða <span>ár?</span></h1><div class="sub">Lag ${n} · settu það á tímalínuna þína</div>
      <div class="qmid2">${secs ? '<div class="timer" id="timer"><b id="timerNum"></b></div>' : ''}<div class="answered"><span id="ansNum">0</span> / <span id="ansTot">${S.players}</span><small>hafa svarað</small></div></div></div></div>`;
    $('replay').classList.remove('hidden'); $('pauseB').classList.remove('hidden');
    playRound(r);
    if (secs) {
      S.deadline = Date.now() + secs * 1000;
      const tick = () => {
        const left = Math.max(0, (S.deadline - Date.now()) / 1000);
        if ($('timerNum')) { $('timerNum').textContent = Math.ceil(left); $('timer').style.setProperty('--p', (left / secs) * 100 + '%'); }
        if (left <= 0) doReveal();
      };
      tick(); S.timer = setInterval(tick, 200);
    }
    setPrimary('Sýna svar', doReveal);
    info(`Lag ${n} · bil = sýna svar`);
    S.poll = setInterval(pollStatus, 1000);
  }
  async function pollStatus() {
    try {
      const s = await rpc('ha_round_status', { p_game: S.game.game_id, p_token: S.token });
      S.players = s.players; S.answered = s.answered;
      if ($('ansNum')) { $('ansNum').textContent = s.answered; $('ansTot').textContent = s.players; }
      if (S.phase === 'question' && s.players > 0 && s.answered >= s.players) doReveal();
    } catch (e) { /* reynt aftur */ }
  }
  async function doReveal() {
    if (S.phase !== 'question' || S.revealing) return;
    S.revealing = true; clearInterval(S.timer); clearInterval(S.poll);
    let res;
    try { res = await rpc('ha_reveal', { p_game: S.game.game_id, p_token: S.token }); }
    catch (e) { toast(e.message, true); S.revealing = false; return; }
    S.phase = 'reveal'; S.lastReveal = res;
    const rv = res.reveal || {}, cor = res.correct || [], ex = res.exact || [];
    const closest = res.closest && res.closest.off > 0 ? `<span>Næst árinu: <b>${esc(res.closest.name)}</b> (${res.closest.guess})</span>` : '';
    $('sBody').innerHTML = `<div class="rev pop">${rv.cover ? `<img src="${esc(rv.cover)}" alt="">` : '<div></div>'}
      <div><div class="year" id="bigYear">${rv.year}</div><div class="ttl">${esc(rv.title || '')}</div><div class="art">${esc(rv.artist || '')}</div>
        <div class="stats"><span><b>${cor.length}</b> af ${res.answered} settu lagið rétt</span><span><b>${res.artist_ok}</b> þekktu flytjandann</span>
          ${ex.length ? `<span>Nákvæmt ár: <b>${ex.map(esc).join(', ')}</b></span>` : closest}</div>
        <div class="names">${cor.slice(0, 24).map(n => `<span>${esc(n)}</span>`).join('')}</div>
        ${(res.winners || []).length ? `<div class="winner" style="text-align:left">${esc(res.winners[0])} er komin/n með ${S.game.target} spil!</div>` : ''}</div></div>`;
    rollYear(rv.year);
    setPrimary('Staðan', showBoard);
    info('bil = staðan');
  }
  function rollYear(y) {
    const el = $('bigYear'); if (!el || !y) return;
    const start = y - 25 - Math.floor(Math.random() * 15), t0 = performance.now(), dur = 1400;
    const step = now => { const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3); el.textContent = Math.round(start + (y - start) * e); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }
  async function showBoard() {
    await rpc('ha_set_state', { p_game: S.game.game_id, p_token: S.token, p_state: 'leaderboard' }).catch(e => toast(e.message, true));
    S.phase = 'leaderboard';
    const [{ data: ps }, { data: cs }] = await Promise.all([
      client.from('ha_players').select('id,name,cards,tokens,speed_ms').eq('game_id', S.game.game_id).order('cards', { ascending: false }).order('tokens', { ascending: false }).limit(12),
      client.from('ha_cards').select('player_id,year,round_no').eq('game_id', S.game.game_id).order('year')
    ]);
    const byP = {}; (cs || []).forEach(c => { (byP[c.player_id] = byP[c.player_id] || []).push(c); });
    const winners = (S.lastReveal && S.lastReveal.winners) || [];
    $('sBody').innerHTML = `<div class="tl-board"><h1>Staðan eftir ${S.round} ${S.round === 1 ? 'lag' : 'lög'}</h1>` +
      (ps || []).map((p, i) => `<div class="tl-row pop" style="animation-delay:${i * 50}ms"><span class="r">${i + 1}.</span><span class="nm">${esc(p.name)}</span>
        <span class="yrs">${(byP[p.id] || []).map(c => `<i class="${c.round_no === S.round ? 'new' : ''}">${c.year}</i>`).join('')}</span>
        <span class="sc">${p.cards}/${S.game.target}<small>${p.tokens} tákn</small></span></div>`).join('') +
      (winners.length ? `<div class="winner">${esc(winners[0])} vinnur!</div>` : '') + '</div>';
    const last = winners.length || S.round >= S.rounds.length;
    if (last) { setPrimary('Úrslit', showFinal); info(winners.length ? 'Við höfum sigurvegara · bil = úrslit' : 'Lögin búin · bil = úrslit'); }
    else { setPrimary('Næsta lag', () => startRound(S.round + 1)); info(`bil = næsta lag (${S.round + 1})`); }
  }
  async function showFinal() {
    clearInterval(S.timer); clearInterval(S.poll); stopAudio();
    await rpc('ha_set_state', { p_game: S.game.game_id, p_token: S.token, p_state: 'finished' }).catch(e => toast(e.message, true));
    S.phase = 'finished';
    if (!$('sBody')) stageShell();
    const { data } = await client.from('ha_players').select('name,cards,tokens').eq('game_id', S.game.game_id)
      .order('cards', { ascending: false }).order('tokens', { ascending: false }).order('speed_ms', { ascending: true }).limit(3);
    const order = [1, 0, 2];
    $('sBody').innerHTML = `<div class="podium">${order.filter(i => data && data[i]).map(i => `<div class="pod p${i + 1} pop" style="animation-delay:${(2 - i) * 400}ms">
      <div class="name">${esc(data[i].name)}</div><div class="pts">${data[i].cards} spil · ${data[i].tokens} tákn</div><div class="block">${i + 1}</div></div>`).join('')}</div>`;
    store.del('ha_host');
    setPrimary('Nýr leikur', () => location.reload());
    $('replay').classList.add('hidden'); $('pauseB').classList.add('hidden');
    info('Takk fyrir að spila Hvaða ár?');
  }

  // ---------- Ræsing ----------
  (async () => {
    try { const c = await rpc('ha_config', {}); SP.cid = c.spotify_client_id || ''; await SP.callback(); } catch (e) { /* setupView sýnir villuna */ }
    setupView();
  })();
  window.__HA_H = { S, A, SP, decide, bestSp, norm, loadBank };
})();
