// Hljómey – spurningabanki: skoða, breyta, flytja inn og út
(function () {
  const { rpc, store, esc } = window.PQ;
  const $ = id => document.getElementById(id);
  const DIFF = { 1: 'Létt', 2: 'Miðlungs', 3: 'Erfitt' };
  const HEAD = ['Spurning', 'Rétt svar', 'Rangt 1', 'Rangt 2', 'Rangt 3', 'Flokkur', 'Erfiðleiki (1-3)', 'Fróðleikur'];
  const XLSX_URL = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';

  let PIN = '', all = [], editing = null, edDiff = 2, parsed = [];

  // ---------- Hjálparföll ----------
  const norm = s => String(s == null ? '' : s).trim().toLowerCase().replace(/\s+/g, ' ');
  const isMissing = e => /Could not find the function|qb_list|PGRST202/i.test(e.message || '') && !e.code;
  function view(id) { ['login', 'missing', 'app'].forEach(v => $(v).classList.toggle('hidden', v !== id)); }
  function toast(msg, bad) {
    const t = $('toast'); t.textContent = msg; t.classList.toggle('bad', !!bad); t.classList.remove('hidden');
    clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.add('hidden'), 3500);
  }
  function showErr(id, msg) { $(id).textContent = msg || ''; $(id).classList.toggle('hidden', !msg); }
  const cats = () => [...new Set(all.map(q => q.category))].sort((a, b) => a.localeCompare(b, 'is'));

  // ---------- Innskráning ----------
  async function open(pin, silent) {
    try {
      all = await rpc('qb_list', { p_pin: pin });
      PIN = pin; store.set('pq_pin', pin);
      view('app'); fillCats(); render();
    } catch (e) {
      if (isMissing(e)) return view('missing');
      view('login');
      if (!silent) { showErr('loginErr', e.message); $('pinIn').select(); }
    }
  }
  async function reload() {
    try { all = await rpc('qb_list', { p_pin: PIN }); fillCats(); render(); }
    catch (e) { toast(e.message, true); }
  }
  $('loginForm').addEventListener('submit', e => { e.preventDefault(); showErr('loginErr', ''); open($('pinIn').value.trim(), false); });

  // ---------- Listi ----------
  function fillCats() {
    const cur = $('fCat').value;
    const list = cats();
    $('fCat').innerHTML = '<option value="">Allir flokkar</option>' + list.map(c => `<option>${esc(c)}</option>`).join('');
    $('fCat').value = list.includes(cur) ? cur : '';
    $('catList').innerHTML = list.map(c => `<option value="${esc(c)}">`).join('');
  }

  function filtered() {
    const q = norm($('q').value), cat = $('fCat').value, d = $('fDiff').value, st = $('fState').value;
    let out = all.filter(x =>
      (!cat || x.category === cat) && (!d || String(x.difficulty) === d) &&
      (!st || (st === 'on') === x.active) &&
      (!q || norm([x.question, x.answer, x.wrong1, x.wrong2, x.wrong3, x.note, x.category].join(' ')).includes(q)));
    const sort = $('fSort').value;
    const byText = (a, b) => a.question.localeCompare(b.question, 'is');
    if (sort === 'new') out.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    else if (sort === 'used') out.sort((a, b) => a.times_used - b.times_used || byText(a, b));
    else if (sort === 'abc') out.sort(byText);
    else out.sort((a, b) => a.category.localeCompare(b.category, 'is') || a.difficulty - b.difficulty || byText(a, b));
    return out;
  }

  function render() {
    const list = filtered();
    const active = all.filter(q => q.active).length;
    $('stats').innerHTML = `<b>${all.length}</b> spurningar · <b>${cats().length}</b> flokkar · <b>${active}</b> virkar` +
      (list.length !== all.length ? ` · sýni <b>${list.length}</b>` : '');
    const counts = {}; all.forEach(q => { counts[q.category] = (counts[q.category] || 0) + 1; });
    const cur = $('fCat').value;
    $('catChips').innerHTML = cats().map(c =>
      `<button type="button" class="chip${c === cur ? ' on' : ''}" data-cat="${esc(c)}"><b>${esc(c)}</b>${counts[c]}</button>`).join('');
    if (!all.length) {
      $('list').innerHTML = '<div class="empty">Bankinn er tómur. Smelltu á <b>+ Ný spurning</b> eða <b>Flytja inn</b>.</div>';
      return;
    }
    if (!list.length) { $('list').innerHTML = '<div class="empty">Engin spurning passar við leitina.</div>'; return; }
    $('list').innerHTML = list.map(q => `
      <article class="qcard${q.active ? '' : ' off'}" data-id="${q.id}">
        <div class="qmain" data-act="edit">
          <div class="qq">${esc(q.question)}</div>
          <div class="qa"><span class="right">✓ ${esc(q.answer)}</span><span class="wr">${esc(q.wrong1)}</span><span class="wr">${esc(q.wrong2)}</span><span class="wr">${esc(q.wrong3)}</span></div>
          ${q.note ? `<div class="qn">${esc(q.note)}</div>` : ''}
          <div class="qm"><span class="cat">${esc(q.category)}</span>
            <span class="dots" title="Erfiðleiki: ${DIFF[q.difficulty]}">${[1, 2, 3].map(i => `<i class="${i <= q.difficulty ? 'on' : ''}">●</i>`).join('')} ${DIFF[q.difficulty]}</span>
            <span>${q.times_used ? 'Notuð ' + q.times_used + '×' : 'Ónotuð'}</span>
            ${q.active ? '' : '<span class="offtag">Óvirk</span>'}</div>
        </div>
        <div class="qact">
          <label class="sw" title="${q.active ? 'Virk' : 'Óvirk'}"><input type="checkbox" data-act="toggle" ${q.active ? 'checked' : ''} aria-label="Virk"><i></i></label>
          <button type="button" class="ic" data-act="edit" title="Breyta" aria-label="Breyta">✎</button>
        </div>
      </article>`).join('');
  }

  ['q', 'fDiff', 'fState', 'fSort'].forEach(id => $(id).addEventListener('input', render));
  $('fCat').addEventListener('change', render);
  $('catChips').addEventListener('click', e => {
    const c = e.target.closest('[data-cat]'); if (!c) return;
    $('fCat').value = $('fCat').value === c.dataset.cat ? '' : c.dataset.cat; render();
  });
  $('list').addEventListener('click', e => {
    const card = e.target.closest('.qcard'); if (!card) return;
    const q = all.find(x => x.id === card.dataset.id); if (!q) return;
    if (e.target.closest('[data-act=edit]')) openEditor(q);
  });
  $('list').addEventListener('change', async e => {
    const t = e.target.closest('[data-act=toggle]'); if (!t) return;
    const q = all.find(x => x.id === t.closest('.qcard').dataset.id);
    try { await rpc('qb_set_active', { p_pin: PIN, p_ids: [q.id], p_active: t.checked }); q.active = t.checked; render(); }
    catch (err) { t.checked = !t.checked; toast(err.message, true); }
  });

  // ---------- Ritill ----------
  function setDiff(v) { edDiff = v; $('eDiff').querySelectorAll('button').forEach(b => b.classList.toggle('on', +b.dataset.v === v)); }
  $('eDiff').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setDiff(+b.dataset.v); });

  function openEditor(q, keep) {
    editing = q || null;
    showErr('edErr', '');
    $('edTitle').textContent = q ? 'Breyta spurningu' : 'Ný spurning';
    $('eQ').value = q ? q.question : '';
    $('eA').value = q ? q.answer : '';
    $('eW1').value = q ? q.wrong1 : ''; $('eW2').value = q ? q.wrong2 : ''; $('eW3').value = q ? q.wrong3 : '';
    $('eCat').value = q ? q.category : (keep ? keep.category : ($('fCat').value || ''));
    setDiff(q ? q.difficulty : (keep ? keep.difficulty : 2));
    $('eNote').value = q ? q.note : '';
    $('eActive').checked = q ? q.active : true;
    $('edDel').classList.toggle('hidden', !q);
    $('edSaveNew').classList.toggle('hidden', !!q);
    $('edOverlay').classList.remove('hidden');
    setTimeout(() => $('eQ').focus(), 30);
  }
  function closeOverlays() { $('edOverlay').classList.add('hidden'); $('imOverlay').classList.add('hidden'); }
  document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', closeOverlays));
  ['edOverlay', 'imOverlay'].forEach(id => $(id).addEventListener('mousedown', e => { if (e.target.id === id) closeOverlays(); }));
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeOverlays();
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !$('edOverlay').classList.contains('hidden')) { e.preventDefault(); save(false); }
  });
  $('newBtn').onclick = () => openEditor(null);

  function formValues() {
    return {
      question: $('eQ').value.trim(), answer: $('eA').value.trim(),
      wrong: [$('eW1').value.trim(), $('eW2').value.trim(), $('eW3').value.trim()],
      category: $('eCat').value.trim() || 'Almennt', difficulty: edDiff,
      note: $('eNote').value.trim(), active: $('eActive').checked
    };
  }
  async function save(andNew) {
    const v = formValues();
    showErr('edErr', '');
    if (v.question.length < 3) { showErr('edErr', 'Skrifaðu spurninguna.'); return $('eQ').focus(); }
    if (!v.answer || v.wrong.some(w => !w)) { showErr('edErr', 'Fylltu út rétta svarið og öll þrjú röngu svörin.'); return; }
    if (new Set([v.answer, ...v.wrong].map(norm)).size < 4) { showErr('edErr', 'Svörin fjögur verða að vera ólík.'); return; }
    $('edSave').disabled = $('edSaveNew').disabled = true;
    try {
      await rpc('qb_save', {
        p_pin: PIN, p_id: editing ? editing.id : null, p_question: v.question, p_answer: v.answer,
        p_wrong1: v.wrong[0], p_wrong2: v.wrong[1], p_wrong3: v.wrong[2],
        p_category: v.category, p_difficulty: v.difficulty, p_note: v.note, p_active: v.active
      });
      await reload();
      toast(editing ? 'Breytingin er vistuð.' : 'Spurningin er komin í bankann.');
      if (andNew) openEditor(null, v); else closeOverlays();
    } catch (e) { showErr('edErr', e.message); }
    $('edSave').disabled = $('edSaveNew').disabled = false;
  }
  $('edForm').addEventListener('submit', e => { e.preventDefault(); save(false); });
  $('edSaveNew').onclick = () => save(true);
  $('edDel').onclick = async () => {
    if (!editing || !confirm('Eyða þessari spurningu úr bankanum?\n\n' + editing.question)) return;
    try { await rpc('qb_delete', { p_pin: PIN, p_ids: [editing.id] }); closeOverlays(); await reload(); toast('Spurningunni var eytt.'); }
    catch (e) { showErr('edErr', e.message); }
  };

  // ---------- Excel (SheetJS, sótt þegar þarf) ----------
  let xlsxP = null;
  function loadXlsx() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (!xlsxP) xlsxP = new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = XLSX_URL;
      s.onload = () => window.XLSX ? res(window.XLSX) : rej(new Error('Excel-lesari hlóðst ekki.'));
      s.onerror = () => { xlsxP = null; rej(new Error('Náði ekki í Excel-lesarann. Athugaðu nettenginguna.')); };
      document.head.appendChild(s);
    });
    return xlsxP;
  }
  async function writeXlsx(name, rows, widths) {
    const X = await loadXlsx();
    const ws = X.utils.aoa_to_sheet(rows);
    ws['!cols'] = widths.map(w => ({ wch: w }));
    const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, ws, 'Spurningar');
    X.writeFile(wb, name);
  }
  $('exportBtn').onclick = async () => {
    try {
      const rows = filtered().map(q => [q.question, q.answer, q.wrong1, q.wrong2, q.wrong3, q.category, q.difficulty, q.note, q.active ? 'Já' : 'Nei', q.times_used]);
      await writeXlsx('spurningabanki.xlsx', [HEAD.concat(['Virk', 'Notuð']), ...rows], [60, 26, 22, 22, 22, 18, 10, 50, 6, 7]);
    } catch (e) { toast(e.message, true); }
  };
  $('tplBtn').onclick = async () => {
    try {
      await writeXlsx('spurningar-snidmat.xlsx', [HEAD,
        ['Hvaða ár hófst gosið á Heimaey?', '1973', '1963', '1968', '1983', 'Vestmannaeyjar', 1, 'Gosið hófst 23. janúar 1973.'],
        ['Hver er höfuðborg Kanada?', 'Ottawa', 'Toronto', 'Montreal', 'Vancouver', 'Heimurinn', 2, '']
      ], [60, 26, 22, 22, 22, 18, 10, 50]);
    } catch (e) { toast(e.message, true); }
  };

  // ---------- Innflutningur ----------
  function parseDelimited(text) {
    const first = text.split(/\r?\n/)[0] || '';
    const d = first.includes('\t') ? '\t' : ((first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : ',');
    const rows = []; let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
        else if (c === '"') q = false;
        else cell += c;
      } else if (c === '"' && cell === '') q = true;
      else if (c === d) { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); rows.push(row); row = []; cell = '';
      } else cell += c;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }
  function diffOf(v) {
    const s = norm(v);
    if (!s) return 2;
    if (/^[123]$/.test(s)) return +s;
    if (/^(létt|auðv|easy|1\b)/.test(s)) return 1;
    if (/^(erfi|þung|hard|3\b)/.test(s)) return 3;
    return 2;
  }
  function mapHeader(row) {
    const m = { wrong: [] };
    row.forEach((h, i) => {
      const s = norm(h);
      if (!s) return;
      if (/rang|wrong|vitlaus|incorrect/.test(s)) m.wrong.push(i);
      else if (/spurning|question/.test(s)) m.question = i;
      else if (/rétt|correct|^svar|answer/.test(s)) m.answer = i;
      else if (/flokk|categor/.test(s)) m.category = i;
      else if (/erfi|difficult/.test(s)) m.difficulty = i;
      else if (/fróðl|skýr|note|athugas/.test(s)) m.note = i;
    });
    return m.question != null && m.answer != null && m.wrong.length >= 3 ? m : null;
  }
  function analyse(table) {
    table = table.filter(r => r && r.some(c => String(c == null ? '' : c).trim()));
    if (!table.length) return [];
    let map = mapHeader(table[0]);
    if (map) table = table.slice(1);
    else map = { question: 0, answer: 1, wrong: [2, 3, 4], category: 5, difficulty: 6, note: 7 };
    const known = new Set(all.map(q => norm(q.question)));
    const seen = new Set();
    const defCat = $('imCat').value.trim() || 'Almennt';
    const cell = (r, i) => i == null ? '' : String(r[i] == null ? '' : r[i]).trim();
    return table.map(r => {
      const it = {
        question: cell(r, map.question), answer: cell(r, map.answer),
        wrong: map.wrong.slice(0, 3).map(i => cell(r, i)),
        category: cell(r, map.category) || defCat, difficulty: diffOf(cell(r, map.difficulty)), note: cell(r, map.note).slice(0, 400)
      };
      const k = norm(it.question);
      if (it.question.length < 3) { it.st = 'bad'; it.why = 'Vantar spurningu'; }
      else if (!it.answer || it.wrong.some(w => !w)) { it.st = 'bad'; it.why = 'Vantar svör'; }
      else if (new Set([it.answer, ...it.wrong].map(norm)).size < 4) { it.st = 'bad'; it.why = 'Svör eins'; }
      else if (it.question.length > 400 || [it.answer, ...it.wrong].some(x => x.length > 120)) { it.st = 'bad'; it.why = 'Of langt'; }
      else if (known.has(k) || seen.has(k)) { it.st = 'dup'; it.why = known.has(k) ? 'Til nú þegar' : 'Tvítekin'; }
      else it.st = 'ok';
      seen.add(k);
      return it;
    });
  }
  function showParsed() {
    const ok = parsed.filter(p => p.st === 'ok').length, dup = parsed.filter(p => p.st === 'dup').length, bad = parsed.filter(p => p.st === 'bad').length;
    $('imSummary').innerHTML = parsed.length
      ? `<span class="ok">${ok} ${ok === 1 ? 'ný spurning' : 'nýjar spurningar'}</span>` + (dup ? `<span class="dup">${dup} þegar til</span>` : '') + (bad ? `<span class="bad">${bad} með villu</span>` : '')
      : '';
    $('imPreview').classList.toggle('hidden', !parsed.length);
    $('imPreview').innerHTML = parsed.length ? `<table><thead><tr><th>Staða</th><th>Spurning</th><th>Rétt svar</th><th>Röng svör</th><th>Flokkur</th><th>Erf.</th></tr></thead><tbody>` +
      parsed.slice(0, 300).map(p => `<tr class="${p.st}"><td class="st">${p.st === 'ok' ? '✓ Ný' : esc(p.why)}</td><td>${esc(p.question)}</td><td class="r">${esc(p.answer)}</td><td>${p.wrong.map(esc).join(' · ')}</td><td>${esc(p.category)}</td><td>${p.difficulty}</td></tr>`).join('') +
      (parsed.length > 300 ? `<tr><td colspan="6" class="muted">… og ${parsed.length - 300} til viðbótar</td></tr>` : '') + '</tbody></table>' : '';
    $('imGo').disabled = !ok;
    $('imGo').textContent = ok ? `Flytja inn ${ok} ${ok === 1 ? 'spurningu' : 'spurningar'}` : 'Flytja inn';
  }
  let lastTable = null;
  function fromTable(t) { lastTable = t; parsed = analyse(t); showParsed(); }
  $('imText').addEventListener('input', () => { $('imFileName').textContent = ''; const t = $('imText').value; fromTable(t.trim() ? parseDelimited(t) : []); });
  $('imCat').addEventListener('input', () => { if (lastTable) fromTable(lastTable); });
  $('imFile').addEventListener('change', async e => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    showErr('imErr', '');
    try {
      let table;
      if (/\.xlsx?$/i.test(f.name)) {
        const X = await loadXlsx();
        const wb = X.read(await f.arrayBuffer(), { type: 'array' });
        table = X.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: '' });
      } else {
        table = parseDelimited(await f.text());
      }
      $('imText').value = '';
      $('imFileName').textContent = f.name;
      fromTable(table);
      if (!parsed.length) showErr('imErr', 'Engar línur fundust í skránni.');
    } catch (err) { showErr('imErr', err.message); }
  });
  $('importBtn').onclick = () => {
    parsed = []; lastTable = null; $('imText').value = ''; $('imFileName').textContent = ''; showErr('imErr', '');
    showParsed(); $('imOverlay').classList.remove('hidden'); setTimeout(() => $('imText').focus(), 30);
  };
  $('imGo').onclick = async () => {
    const rows = parsed.filter(p => p.st === 'ok').map(({ question, answer, wrong, category, difficulty, note }) => ({ question, answer, wrong, category, difficulty, note }));
    if (!rows.length) return;
    $('imGo').disabled = true; showErr('imErr', '');
    let added = 0, dup = 0, bad = 0;
    try {
      for (let i = 0; i < rows.length; i += 500) {
        const r = await rpc('qb_import', { p_pin: PIN, p_rows: rows.slice(i, i + 500) });
        added += r.added; dup += r.duplicates; bad += r.invalid;
      }
      closeOverlays(); await reload();
      toast(`${added} ${added === 1 ? 'spurning bættist' : 'spurningar bættust'} við bankann.` + (dup + bad ? ` ${dup + bad} slepptu.` : ''));
    } catch (e) { showErr('imErr', e.message); $('imGo').disabled = false; }
  };

  // ---------- Ræsing ----------
  const saved = store.get('pq_pin');
  if (saved) open(saved, true); else view('login');
  window.__QB = { get all() { return all; } };   // fyrir prófanir
})();
