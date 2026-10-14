// Hljómey – vistuð þemu (Deezer-lagalistar, leitir og flytjendur).
// Sameiginlegt fyrir Pöbbkviss (stjorn.html) og Tónlistarbingó (bingo-stjorn.html).
// Geymt í Supabase (themes.sql) svo þemun fylgja þér á hvaða tölvu sem er.
(function () {
  const PQ = window.PQ;
  const $ = id => document.getElementById(id);
  const box = $('savedThemes');
  if (!PQ || !box) return;
  const { client, rpc, store, esc } = PQ;

  const KIND = { playlist: 'Lagalisti', search: 'Leit', artists: 'Flytjendur', chart: 'Vinsælast' };
  const ICON = {
    playlist: '<path d="M4 6h11M4 11h11M4 16h7"/><circle cx="18" cy="16" r="2.5"/><path d="M20.5 16V5l-3 1"/>',
    search: '<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5"/>',
    artists: '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14.2c2.4.1 4 1.6 4.5 4.3"/>',
    chart: '<path d="M5 20V10M12 20V4M19 20v-7"/>'
  };
  let list = [], ready = false, missing = false, showAll = false, activeKey = '';

  // ---------- útlit ----------
  const css = document.createElement('style');
  css.textContent = `
  #savedThemes { margin: -2px 0 16px; }
  .th-head { display: flex; align-items: baseline; gap: 10px; margin-bottom: 10px; }
  .th-head b { font-size: 15px; }
  .th-head .muted { font-size: 13px; }
  .th-head button { margin-left: auto; background: none; color: var(--accent); font-weight: 500; font-size: 14px; padding: 2px 4px; }
  .th-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 10px; }
  .th-card { position: relative; display: flex; align-items: center; gap: 12px; padding: 8px 10px 8px 8px; border-radius: 12px; background: var(--bg2); border: 1px solid var(--line); text-align: left; color: var(--text); min-width: 0; transition: border-color .15s, transform .08s; }
  .th-card:hover { border-color: var(--muted); }
  .th-card:active { transform: scale(.98); }
  .th-card.on { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent) inset; }
  .th-card .cv { width: 46px; height: 46px; border-radius: 8px; flex: 0 0 46px; object-fit: cover; background: var(--card); display: grid; place-items: center; color: var(--accent); }
  .th-card .cv svg { width: 22px; height: 22px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  .th-card .tx { flex: 1; min-width: 0; padding-right: 40px; }
  .th-card .tx b { display: block; font-weight: 700; font-size: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .th-card .tx small { display: block; color: var(--muted); font-size: 12.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .th-card .ac { position: absolute; top: 4px; right: 4px; display: flex; gap: 2px; opacity: .55; }
  .th-card:hover .ac, .th-card:focus-within .ac { opacity: 1; }
  .th-card .ac span { width: 26px; height: 26px; border-radius: 8px; display: grid; place-items: center; color: var(--muted); font-size: 15px; cursor: pointer; }
  .th-card .ac span:hover { background: var(--card); color: var(--text); }
  .th-empty { color: var(--muted); font-size: 14px; padding: 10px 12px; border: 1px dashed var(--line); border-radius: 12px; }
  #themeSave { margin-top: 10px; font-size: 14px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; min-height: 0; }
  #themeSave .ok { color: var(--good, #2fbf71); }
  @media (hover: none) { .th-card .ac { opacity: 1; } }
  `;
  document.head.appendChild(css);

  // Stöðulína fyrir vistun, á eftir „Fann … lög"
  const saveLine = document.createElement('div');
  saveLine.id = 'themeSave';
  const poolInfo = $('poolInfo');
  if (poolInfo) poolInfo.insertAdjacentElement('afterend', saveLine);

  function pin() { return ($('pin') && $('pin').value.trim()) || store.get('pq_pin') || ''; }
  function askPin() {
    const p = window.prompt('PIN stjórnanda (sama og þegar þú býrð til leik):', '');
    return p ? p.trim() : '';
  }
  function canon(kind, value) {
    if (kind === 'playlist') {
      const id = window.PQDeezer && PQDeezer.playlistId(value);
      return id ? 'https://www.deezer.com/playlist/' + id : String(value).trim();
    }
    return String(value).trim();
  }
  const keyOf = (kind, value) => kind + '|' + canon(kind, value);

  function ago(ts) {
    const d = (Date.now() - new Date(ts).getTime()) / 86400000;
    if (d < 1) return 'í dag';
    if (d < 2) return 'í gær';
    if (d < 30) return 'fyrir ' + Math.floor(d) + ' dögum';
    return new Date(ts).toLocaleDateString('is-IS', { day: 'numeric', month: 'short' });
  }

  // ---------- birting ----------
  function render() {
    if (missing) {
      box.innerHTML = '<div class="th-head"><b>Vistuð þemu</b></div><div class="th-empty">Keyrðu <b>themes.sql</b> í Supabase til að geta vistað lagalista og þemu.</div>';
      return;
    }
    if (!ready) { box.innerHTML = ''; return; }
    if (!list.length) {
      box.innerHTML = '<div class="th-head"><b>Vistuð þemu</b></div><div class="th-empty">Deezer-lagalistar sem þú sækir vistast hér, svo þú getir valið þá aftur með einum smelli.</div>';
      return;
    }
    const shown = showAll ? list : list.slice(0, 8);
    box.innerHTML =
      '<div class="th-head"><b>Vistuð þemu</b><span class="muted">smelltu til að nota</span>' +
      (list.length > 8 ? '<button type="button" data-th-all>' + (showAll ? 'Sýna færri' : 'Sýna öll (' + list.length + ')') + '</button>' : '') + '</div>' +
      '<div class="th-grid">' + shown.map(t => {
        const on = keyOf(t.kind, t.value) === activeKey;
        const cover = t.cover
          ? '<img class="cv" src="' + esc(t.cover) + '" alt="" loading="lazy" onerror="this.style.visibility=\'hidden\'">'
          : '<span class="cv"><svg viewBox="0 0 24 24">' + (ICON[t.kind] || ICON.search) + '</svg></span>';
        const meta = [KIND[t.kind] || t.kind, t.track_count ? t.track_count + ' lög' : '', ago(t.last_used)].filter(Boolean).join(' · ');
        return '<button type="button" class="th-card' + (on ? ' on' : '') + '" data-th="' + t.id + '" title="' + esc(t.value) + '">' + cover +
          '<span class="tx"><b>' + esc(t.name || t.value) + '</b><small>' + esc(meta) + '</small></span>' +
          '<span class="ac"><span data-th-ren="' + t.id + '" title="Endurnefna" role="button" aria-label="Endurnefna">✎</span><span data-th-del="' + t.id + '" title="Eyða" role="button" aria-label="Eyða">×</span></span></button>';
      }).join('') + '</div>';
  }

  async function load() {
    const { data, error } = await client.from('saved_themes').select('*').order('last_used', { ascending: false }).limit(200);
    if (error) {
      missing = /saved_themes|does not exist|schema cache|PGRST205|42P01/i.test((error.message || '') + ' ' + (error.code || ''));
      ready = true; render(); return;
    }
    missing = false; ready = true; list = data || []; render();
  }

  // ---------- aðgerðir ----------
  async function withPin(fn) {
    let p = pin();
    if (!p) { p = askPin(); if (!p) return false; }
    try {
      await fn(p);
      store.set('pq_pin', p);
      return true;
    } catch (e) {
      if (e.code === 'rangt_pin') {
        const p2 = askPin(); if (!p2) { status(e.message, true); return false; }
        await fn(p2); store.set('pq_pin', p2); return true;
      }
      throw e;
    }
  }

  async function save(kind, value, meta) {
    const done = await withPin(p => rpc('save_theme', {
      p_pin: p, p_kind: kind, p_value: canon(kind, value),
      p_name: meta.name || '', p_cover: meta.cover || '', p_count: meta.count || null
    }));
    if (done) await load();
    return done;
  }

  function status(html, isErr) {
    saveLine.innerHTML = html ? '<span class="' + (isErr ? 'err-inline' : 'ok') + '" style="' + (isErr ? 'color:#ffb3bb' : '') + '">' + html + '</span>' : '';
  }

  function offer(kind, value, meta, label) {
    saveLine.innerHTML = '';
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'btn small ghost'; b.textContent = '☆ ' + label;
    b.onclick = async () => {
      b.disabled = true;
      try { if (await save(kind, value, meta)) status('✓ Vistað undir Vistuð þemu.'); else b.disabled = false; }
      catch (e) { b.disabled = false; status(esc(e.message), true); saveLine.prepend(b); }
    };
    saveLine.appendChild(b);
  }

  // Kallað af host.js / bingo-host.js eftir að lög hafa verið sótt
  async function afterFetch(kind, rawValue, pool) {
    saveLine.innerHTML = '';
    if (kind === 'chart' || !String(rawValue || '').trim()) { activeKey = ''; render(); return; }
    activeKey = keyOf(kind, rawValue);
    render();
    if (missing) return;
    const value = canon(kind, rawValue);
    const existing = list.find(t => t.kind === kind && t.value === value);
    let meta = { name: String(rawValue).trim(), cover: (pool && pool[0] && pool[0].cover) || '', count: pool ? pool.length : null };
    if (kind === 'playlist') {
      try {
        const inf = await PQDeezer.playlistInfo(value);
        if (inf) meta = { name: inf.title || 'Deezer-lagalisti', cover: inf.cover || meta.cover, count: inf.count || meta.count };
      } catch (e) { meta.name = 'Deezer-lagalisti'; }
    }
    if (existing) {
      // Þegar vistað: merkja sem nýlega notað (hljóðlega, ef PIN er þekkt)
      if (pin()) { try { await rpc('save_theme', { p_pin: pin(), p_kind: kind, p_value: value, p_name: '', p_cover: meta.cover, p_count: meta.count }); load(); } catch (e) {} }
      return;
    }
    if (kind === 'playlist' && pin()) {
      try { await save(kind, value, meta); status('✓ Lagalistinn „' + esc(meta.name) + '“ er vistaður undir Vistuð þemu.'); return; }
      catch (e) { /* bjóða handvirka vistun hér fyrir neðan */ }
    }
    offer(kind, value, meta, kind === 'playlist' ? 'Vista lagalistann' : 'Vista þemað');
  }

  box.addEventListener('click', async e => {
    if (e.target.closest('[data-th-all]')) { showAll = !showAll; render(); return; }
    const del = e.target.closest('[data-th-del]');
    const ren = e.target.closest('[data-th-ren]');
    const card = e.target.closest('[data-th]');
    if (del || ren) {
      e.preventDefault(); e.stopPropagation();
      const t = list.find(x => x.id === (del || ren).getAttribute(del ? 'data-th-del' : 'data-th-ren'));
      if (!t) return;
      try {
        if (del) {
          if (!confirm('Eyða „' + (t.name || t.value) + '“ úr vistuðum þemum?')) return;
          await withPin(p => rpc('delete_theme', { p_pin: p, p_id: t.id }));
        } else {
          const nm = prompt('Nýtt heiti:', t.name || '');
          if (nm == null || !nm.trim()) return;
          await withPin(p => rpc('rename_theme', { p_pin: p, p_id: t.id, p_name: nm }));
        }
        await load();
      } catch (err) { alert(err.message); }
      return;
    }
    if (!card) return;
    const t = list.find(x => x.id === card.getAttribute('data-th'));
    if (!t) return;
    // Setja þemað inn og sækja lögin
    $('kind').value = t.kind;
    $('kind').dispatchEvent(new Event('change'));
    if (t.kind === 'chart') { if ($('genre')) $('genre').value = t.value; }
    else $('value').value = t.value;
    activeKey = keyOf(t.kind, t.value); render();
    $('fetchBtn').click();
  });

  window.PQThemes = { afterFetch, load };
  load();
})();
