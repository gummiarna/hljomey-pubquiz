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
  #themeSave { font-size: 14px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  #themeSave:not(:empty) { margin-top: 12px; }
  #themeSave .ok { color: var(--good, #2fbf71); }
  #themeSave .bad { color: #ffb3bb; }
  #themeSave input { flex: 0 1 170px; min-width: 96px; width: auto; padding: 8px 12px; }
  #themeSaveBtn { white-space: nowrap; }
  #themeSaveBtn.saved { border-color: var(--accent); color: var(--accent); }
  #themeSaveBtn.nudge { animation: thNudge 1.6s ease-in-out 2; border-color: var(--accent); }
  @keyframes thNudge { 50% { box-shadow: 0 0 0 4px rgba(255,185,56,.25); } }
  @media (hover: none) { .th-card .ac { opacity: 1; } }
  `;
  document.head.appendChild(css);

  // „☆ Vista lagalista" við hliðina á „Sækja lög", og stöðulína beint undir
  const saveBtn = document.createElement('button');
  saveBtn.type = 'button'; saveBtn.id = 'themeSaveBtn'; saveBtn.className = 'btn ghost';
  const fetchBtn = $('fetchBtn');
  if (fetchBtn) fetchBtn.insertAdjacentElement('afterend', saveBtn);
  const saveLine = document.createElement('div');
  saveLine.id = 'themeSave';
  const row = fetchBtn && fetchBtn.closest('.row');
  if (row) row.insertAdjacentElement('afterend', saveLine);
  else if ($('poolInfo')) $('poolInfo').insertAdjacentElement('afterend', saveLine);
  let lastFetch = null;   // { key, pool } – síðast sóttu lögin (fyrir mynd og fjölda)

  const isPl = v => !!(window.PQDeezer && PQDeezer.isPlaylistUrl && PQDeezer.isPlaylistUrl(v));
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
    syncBtn();
    if (missing) {
      box.innerHTML = '<div class="th-head"><b>Vistuð þemu</b></div><div class="th-empty">Keyrðu <b>themes.sql</b> í Supabase til að geta vistað lagalista og þemu.</div>';
      return;
    }
    if (!ready) { box.innerHTML = ''; return; }
    if (!list.length) {
      box.innerHTML = '<div class="th-head"><b>Vistuð þemu</b></div><div class="th-empty">Límdu slóð á Deezer-lagalista hér fyrir neðan og smelltu á <b>☆ Vista lagalista</b>. Þá birtist hann hér og þú velur hann aftur með einum smelli.</div>';
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
    missing = false; ready = true;
    list = (data || []).map(t => {
      if (t.kind !== 'playlist' && t.kind !== 'chart' && isPl(t.value))
        return Object.assign({}, t, { kind: 'playlist', value: canon('playlist', t.value), _legacy: t.kind, _raw: t.value });
      return t;
    });
    render();
    repairLegacy();
  }

  // Lagfæra lagalista sem voru vistaðir sem „Leit" (vantar mynd og fjölda laga): þarf PIN
  let repairing = false;
  async function repairLegacy() {
    const bad = list.filter(t => t._legacy);
    if (!bad.length || repairing || !pin()) return;
    repairing = true;
    try {
      for (const t of bad.slice().reverse()) {   // elsta fyrst, svo röðin haldist
        let inf = null;
        try { inf = await PQDeezer.playlistInfo(t.value); } catch (e) {}
        const custom = t.name && t.name !== t._raw;
        await rpc('save_theme', { p_pin: pin(), p_kind: 'playlist', p_value: t.value,
          p_name: custom ? t.name : ((inf && inf.title) || 'Deezer-lagalisti'), p_cover: (inf && inf.cover) || '', p_count: (inf && inf.count) || null });
        await rpc('delete_theme', { p_pin: pin(), p_id: t.id });
      }
    } catch (e) { repairing = false; return; }
    await load();
    repairing = false;
  }

  // ---------- aðgerðir ----------
  async function save(kind, value, meta, p) {
    await rpc('save_theme', {
      p_pin: p, p_kind: kind, p_value: canon(kind, value),
      p_name: meta.name || '', p_cover: meta.cover || '', p_count: meta.count || null
    });
    store.set('pq_pin', p);
    if ($('pin') && !$('pin').value) $('pin').value = p;   // þarf þá ekki að slá PIN aftur inn í skrefi 3
    await load();
  }

  function status(html, cls) {
    saveLine.innerHTML = html ? '<span class="' + (cls || 'ok') + '">' + html + '</span>' : '';
  }

  // Hvað er í reitunum núna?
  function current() {
    let kind = $('kind') ? $('kind').value : '';
    const raw = kind === 'chart' ? '' : ($('value') ? $('value').value.trim() : '');
    if (kind !== 'chart' && isPl(raw)) kind = 'playlist';
    return { kind, raw };
  }
  const LABEL = { playlist: 'Vista lagalista', search: 'Vista leit', artists: 'Vista flytjendur' };
  function isSaved(kind, raw) { const v = canon(kind, raw); return list.some(t => t.kind === kind && t.value === v); }

  function syncBtn() {
    const { kind, raw } = current();
    saveBtn.hidden = missing || !LABEL[kind];
    if (saveBtn.hidden) return;
    const valid = kind === 'playlist' ? !!(window.PQDeezer && PQDeezer.playlistId(raw)) : !!raw;
    const saved = valid && isSaved(kind, raw);
    saveBtn.classList.toggle('saved', saved);
    if (saved) saveBtn.classList.remove('nudge');
    saveBtn.textContent = saved ? '★ Vistað' : '☆ ' + LABEL[kind];
    saveBtn.disabled = !valid || saveBtn.dataset.busy === '1';
    saveBtn.title = !valid ? (kind === 'playlist' ? 'Límdu fyrst inn slóð á Deezer-lagalista' : 'Skrifaðu fyrst inn þemað')
      : saved ? 'Þegar vistað undir Vistuð þemu' : 'Geyma undir Vistuð þemu svo þú getir valið það aftur';
  }

  // Heiti, mynd og fjöldi laga
  async function metaFor(kind, raw) {
    const k = keyOf(kind, raw);
    const pool = lastFetch && lastFetch.key === k ? lastFetch.pool : null;
    let meta = { name: raw, cover: (pool && pool[0] && pool[0].cover) || '', count: pool ? pool.length : null };
    if (kind === 'playlist') {
      try {
        const inf = await PQDeezer.playlistInfo(raw);
        meta = { name: (inf && inf.title) || 'Deezer-lagalisti', cover: (inf && inf.cover) || meta.cover, count: (inf && inf.count) || meta.count };
      } catch (e) {
        if (/^Deezer:/.test(e.message)) { const err = new Error('Deezer fann ekki þennan lagalista. Er hann opinber (public)?'); err.fatal = true; throw err; }
        meta.name = 'Deezer-lagalisti';
      }
    }
    return meta;
  }

  function busy(on) { saveBtn.dataset.busy = on ? '1' : ''; syncBtn(); }

  // Smellt á „☆ Vista lagalista"
  async function onSave() {
    const { kind, raw } = current();
    if (!LABEL[kind] || !raw) return;
    if (isSaved(kind, raw)) { status('Þetta er þegar vistað undir Vistuð þemu, efst á síðunni.'); return; }
    busy(true); status('Sæki upplýsingar…', 'muted');
    let meta;
    try { meta = await metaFor(kind, raw); }
    catch (e) { busy(false); status(esc(e.message), 'bad'); return; }
    const p = pin();
    if (p) {
      try { await save(kind, raw, meta, p); busy(false); done(meta); return; }
      catch (e) { if (e.code !== 'rangt_pin') { busy(false); status(esc(e.message), 'bad'); return; } }
    }
    busy(false);
    askPinInline(kind, raw, meta, p ? 'Vistaða PIN-númerið passar ekki.' : '');
  }

  function done(meta) {
    status('✓ Vistað: „' + esc(meta.name) + '“. Þú finnur það efst undir Vistuð þemu.');
  }

  // PIN beðið um á staðnum (í stað sprettiglugga)
  function askPinInline(kind, raw, meta, note) {
    saveLine.innerHTML = '';
    const lab = document.createElement('span'); lab.className = note ? 'bad' : 'muted';
    lab.textContent = note ? note + ' Sláðu inn PIN:' : 'PIN stjórnanda til að vista:';
    const inp = document.createElement('input'); inp.type = 'password'; inp.autocomplete = 'off'; inp.placeholder = 'PIN';
    const ok = document.createElement('button'); ok.type = 'button'; ok.className = 'btn small'; ok.textContent = 'Vista';
    const no = document.createElement('button'); no.type = 'button'; no.className = 'btn small ghost'; no.textContent = 'Hætta við';
    saveLine.append(lab, inp, ok, no);
    inp.focus();
    const go = async () => {
      const p = inp.value.trim(); if (!p) { inp.focus(); return; }
      ok.disabled = true; busy(true);
      try { await save(kind, raw, meta, p); busy(false); done(meta); }
      catch (e) {
        busy(false); ok.disabled = false;
        lab.className = 'bad'; lab.textContent = e.code === 'rangt_pin' ? 'Rangt PIN-númer. Reyndu aftur:' : e.message;
        inp.select();
      }
    };
    ok.onclick = go; no.onclick = () => status('');
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); go(); } if (e.key === 'Escape') status(''); });
  }

  // withPin fyrir endurnefna/eyða
  async function withPin(fn) {
    let p = pin();
    if (!p) { p = askPin(); if (!p) return false; }
    try { await fn(p); store.set('pq_pin', p); return true; }
    catch (e) {
      if (e.code === 'rangt_pin') { const p2 = askPin(); if (!p2) throw e; await fn(p2); store.set('pq_pin', p2); return true; }
      throw e;
    }
  }

  // Kallað af host.js / bingo-host.js eftir að lög hafa verið sótt
  async function afterFetch(kind, rawValue, pool) {
    if (kind !== 'chart' && isPl(rawValue)) kind = 'playlist';
    if (kind === 'chart' || !String(rawValue || '').trim()) { activeKey = ''; lastFetch = null; render(); return; }
    activeKey = keyOf(kind, rawValue);
    lastFetch = { key: activeKey, pool };
    if (!/^(✓|Sæki)/.test(saveLine.textContent)) status('');
    render();
    if (missing) return;
    const value = canon(kind, rawValue);
    const hit = list.find(t => t.kind === kind && t.value === value);
    if (hit && hit._legacy) { repairLegacy(); return; }
    if (hit) {
      // Þegar vistað: merkja sem nýlega notað (hljóðlega, ef PIN er þekkt)
      if (pin()) { try { await rpc('save_theme', { p_pin: pin(), p_kind: kind, p_value: value, p_name: '', p_cover: '', p_count: pool ? pool.length : null }); load(); } catch (e) {} }
    } else if (LABEL[kind]) {
      saveBtn.classList.add('nudge');   // minna á að hægt er að vista
    }
  }

  saveBtn.addEventListener('click', onSave);
  function autoKind() {
    const v = $('value').value;
    if ($('kind').value !== 'playlist' && isPl(v)) {
      $('kind').value = 'playlist';
      $('kind').dispatchEvent(new Event('change'));
      status('Þetta er slóð á Deezer-lagalista, svo ég valdi „Deezer-lagalista“.', 'muted');
      return true;
    }
    if (window.PQDeezer && PQDeezer.isShortLink && PQDeezer.isShortLink(v)) {
      status('Þetta er stutt deilislóð úr Deezer-appinu. Opnaðu hana í vafra og afritaðu slóðina úr veffangastikunni.', 'bad');
      return true;
    }
    return false;
  }
  if ($('value')) $('value').addEventListener('input', () => {
    saveBtn.classList.remove('nudge');
    if (!autoKind() && !/^Sæki/.test(saveLine.textContent)) status('');
    syncBtn();
  });
  if ($('kind')) $('kind').addEventListener('change', e => { if (e.isTrusted) status(''); syncBtn(); });

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
    saveLine.innerHTML = '';
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
