// Sameiginlegur kóði fyrir stjórnanda- og símasíðu.

(function () {
  // Valmynd leikjanna (nav.modes) verður fellilisti í símum. Virkar líka á valmyndir
  // sem eru teiknaðar seinna með JavaScript (Gítarpartý, Hvaða ár?).
  const pickCss = `.modes-pick{display:none;position:relative;flex:0 0 auto;min-width:0}
.modes-pick select{appearance:none;-webkit-appearance:none;margin:0;width:auto;max-width:62vw;background:var(--accent);color:var(--accent-ink,#1b1300);border:0;border-radius:999px;padding:9px 36px 9px 16px;font:inherit;font-size:15px;font-weight:600;line-height:1.2;cursor:pointer;text-overflow:ellipsis}
.modes-pick select:focus-visible{outline:2px solid var(--text,#fff);outline-offset:2px}
.modes-pick select option{background:var(--bg2,var(--panel2,#1f1a2e));color:var(--text,#f6f3ff);font-weight:500}
.modes-pick::after{content:'';position:absolute;right:16px;top:50%;width:7px;height:7px;border-right:2px solid var(--accent-ink,#1b1300);border-bottom:2px solid var(--accent-ink,#1b1300);transform:translateY(-70%) rotate(45deg);pointer-events:none}
@media (max-width:760px){nav.modes[data-pick]{display:none!important}.modes-pick{display:block}.modes-has-pick .brand span{display:none}}`;
  function modesMenu() {
    document.querySelectorAll('nav.modes:not([data-pick])').forEach(nav => {
      const links = Array.from(nav.querySelectorAll('a[href]'));
      if (links.length < 3) return;
      if (!document.getElementById('modes-pick-css')) {
        const st = document.createElement('style'); st.id = 'modes-pick-css'; st.textContent = pickCss; document.head.appendChild(st);
      }
      nav.dataset.pick = '1';
      const wrap = document.createElement('div'); wrap.className = 'modes-pick';
      const sel = document.createElement('select'); sel.setAttribute('aria-label', 'Velja leik');
      links.forEach(a => { const o = new Option(a.textContent.trim(), a.getAttribute('href')); if (a.classList.contains('on')) { o.selected = true; sel.dataset.cur = o.value; } sel.add(o); });
      sel.onchange = () => { if (sel.value && sel.value !== sel.dataset.cur) location.href = sel.value; };
      wrap.appendChild(sel); nav.after(wrap);
      if (nav.parentElement) nav.parentElement.classList.add('modes-has-pick');   // í símum er nafn leiksins aðeins í fellilistanum
    });
  }
  let pickPending = false;
  const pickObs = new MutationObserver(() => {
    if (pickPending) return; pickPending = true;
    requestAnimationFrame(() => { pickPending = false; modesMenu(); });
  });
  const pickStart = () => { modesMenu(); pickObs.observe(document.body, { childList: true, subtree: true }); };
  if (document.body) pickStart(); else document.addEventListener('DOMContentLoaded', pickStart);
  // Til baka í vafranum: sýna aftur leikinn sem er opinn
  window.addEventListener('pageshow', () => document.querySelectorAll('.modes-pick select').forEach(s => { if (s.dataset.cur) s.value = s.dataset.cur; }));
})();

(function () {
  const cfg = window.PQ_CONFIG || {};
  const client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
    // Stjórnendur haldast innskráðir í vafranum. Gestir skrá sig aldrei inn.
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'hljomey-stjornandi' },
    realtime: { params: { eventsPerSecond: 20 } }
  });

  const ERRORS = {
    innskraning_vantar: 'Skráðu þig inn sem stjórnandi til að búa til leik.',
    innskraning_haett: 'Hætt við innskráningu. Stjórnendur þurfa að skrá sig inn til að búa til leik.',
    adgangur_lokadur: 'Lokað hefur verið á þennan aðgang. Hafðu samband við umsjónarmann síðunnar.',
    gestapin_ekki: 'Gestapin dugar aðeins til að stýra leikjum. Notaðu aðal-PIN til að breyta bönkum og stillingum.',
    rangt_pin: 'Rangt PIN-númer.',
    leikur_fannst_ekki: 'Enginn leikur fannst með þessum kóða.',
    leik_lokid: 'Þessum leik er lokið.',
    nafn_tekid: 'Þetta nafn er frátekið, veldu annað.',
    vantar_nafn: 'Sláðu inn nafn.',
    leikur_fullur: 'Leikurinn er fullur.',
    ogildur_stjornandi: 'Aðgangur stjórnanda rann út. Búðu til nýjan leik.',
    ogildur_leikmadur: 'Skráningin fannst ekki. Skráðu þig aftur.',
    ogildar_umferdir: 'Engin lög valin.',
    of_fa_log: 'Bingó þarf a.m.k. 24 lög í pottinum.',
    ogild_mynstur: 'Veldu a.m.k. eitt vinningsmynstur.',
    spurning_til: 'Þessi spurning er þegar til í bankanum.',
    svor_eins: 'Svörin fjögur verða að vera ólík.',
    spurning_fannst_ekki: 'Spurningin fannst ekki. Hún hefur kannski verið eydd.',
    of_margar_linur: 'Of margar línur í einu (hámark 3000).',
    karaoke_fannst_ekki: 'Karaoke-kvöldið fannst ekki. Skannaðu QR-kóðann aftur.',
    ogilt_myndband: 'Þetta YouTube-myndband virkar ekki.',
    rodin_full: 'Biðröðin er full.',
    ma_ekki_fjarlaegja: 'Aðeins sá sem valdi lagið (eða stjórnandinn) getur tekið það af lista.',
    lag_fannst_ekki: 'Lagið er ekki lengur í biðröðinni.',
    ogilt_saeti: 'Veldu stað á tímalínunni.',
    of_fa_tokn: 'Þú þarft 3 tákn til að fá aukaspil.',
    stokkur_tomur: 'Engin spil eftir í stokknum.',
    ekki_nuna: 'Það er ekki hægt núna. Bíddu eftir svarinu.'
  };

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- Innskráning stjórnenda ----------
  // Gagnagrunnurinn (innskraning.sql) hafnar nýjum leik frá óinnskráðum með „innskraning_vantar“.
  // Þá opnast innskráningarglugginn og beiðnin er send aftur, svo síðurnar sjálfar þurfa engu að breyta.
  const A = { user: null, profile: null, req: undefined, reqP: null, touched: null, modal: null };
  const userOf = u => u ? { id: u.id, email: u.email || '', name: String((u.user_metadata || {}).name || '').trim() } : null;
  function setUser(u) {
    const nu = userOf(u);
    if ((nu && nu.id) !== (A.user && A.user.id)) { A.profile = null; A.touched = null; }
    A.user = nu; drawChips();
    if (nu && document.querySelector('.pq-acct')) touch();
  }
  // Ekki kalla á Supabase beint inni í þessu falli (læsing í auth); setTimeout leysir það
  client.auth.onAuthStateChange((ev, s) => setTimeout(() => setUser(s && s.user), 0));

  // true/false eftir stillingu; null ef innskraning.sql hefur ekki verið keyrt (þá er allt eins og áður)
  function loginRequired() {
    if (!A.reqP) A.reqP = client.rpc('login_required').then(r => (A.req = r.error ? null : !!r.data), () => (A.req = null));
    return A.reqP;
  }
  function touch(name) {
    if (!A.user) return Promise.resolve(null);
    if (A.touched && !name) return A.touched;
    A.touched = client.rpc('me_touch', name ? { p_name: name } : {})
      .then(r => { if (!r.error && r.data) { A.profile = r.data; drawChips(); } return A.profile; }, () => null);
    return A.touched;
  }
  const AUTH_ERR = [
    [/invalid login credentials|invalid_credentials/i, 'Rangt netfang eða lykilorð.'],
    [/already registered|already been registered|user_already_exists|email_exists/i, 'Þetta netfang er þegar með aðgang. Veldu „Skrá inn“.'],
    [/password.*(at least|characters|short)|weak_password/i, 'Lykilorðið þarf að vera a.m.k. 6 stafir.'],
    [/email not confirmed|email_not_confirmed/i, 'Netfangið hefur ekki verið staðfest. Hafðu samband við umsjónarmann síðunnar.'],
    [/signups? not allowed|signup_disabled|email_provider_disabled|logins are disabled/i, 'Nýskráning er lokuð í bili. Hafðu samband við umsjónarmann síðunnar.'],
    [/invalid format|validate email|email_address_invalid|invalid email|is invalid/i, 'Netfangið er ekki gilt.'],
    [/rate limit|too many|over_request_rate_limit|over_email_send_rate_limit/i, 'Of margar tilraunir í röð. Bíddu smástund og reyndu aftur.'],
    [/fetch|network|load failed/i, 'Næ ekki sambandi. Athugaðu nettenginguna.']
  ];
  const authMsg = e => { const m = String((e && (e.code || '')) + ' ' + ((e && e.message) || '')); const hit = AUTH_ERR.find(x => x[0].test(m)); return hit ? hit[1] : 'Innskráning tókst ekki: ' + ((e && e.message) || 'óþekkt villa'); };

  const authCss = `.pq-auth{position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(8,6,14,.72);overflow:auto}
.pq-auth form{position:relative;width:min(420px,100%);margin:auto;background:var(--card,var(--panel,#2a2340));color:var(--text,#f6f3ff);border:1px solid var(--line,#3b3357);border-radius:18px;padding:22px 20px 18px;box-shadow:0 24px 60px rgba(0,0,0,.5);font-family:inherit}
.pq-auth h2{margin:0 36px 6px 0;font-size:21px;line-height:1.25}
.pq-auth .pqa-sub{margin:0 0 16px;color:var(--muted,#b3aacb);font-size:14px;line-height:1.45}
.pq-auth .pqa-x{position:absolute;top:10px;right:10px;width:36px;height:36px;border-radius:50%;border:0;background:transparent;color:var(--muted,#b3aacb);font-size:24px;line-height:1;cursor:pointer}
.pq-auth .pqa-x:hover{color:var(--text,#fff);background:rgba(255,255,255,.06)}
.pq-auth .pqa-tabs{display:flex;gap:4px;padding:4px;background:var(--bg2,var(--panel2,#1f1a2e));border-radius:999px;margin:0 0 16px}
.pq-auth .pqa-tabs button{flex:1;border:0;border-radius:999px;padding:9px 10px;background:transparent;color:var(--muted,#b3aacb);font:inherit;font-size:14px;font-weight:600;cursor:pointer}
.pq-auth .pqa-tabs button[aria-pressed=true]{background:var(--accent,#ffb938);color:var(--accent-ink,#1b1300)}
.pq-auth [hidden]{display:none!important}
.pq-auth label{display:block;margin:0 0 12px;font-size:13px;font-weight:600;color:var(--muted,#b3aacb)}
.pq-auth label small{font-weight:400}
.pq-auth input{display:block;width:100%;box-sizing:border-box;margin:6px 0 0;padding:11px 12px;border-radius:10px;border:1px solid var(--line,#3b3357);background:var(--bg2,var(--panel2,#1f1a2e));color:var(--text,#f6f3ff);font:inherit;font-size:16px}
.pq-auth input:focus{outline:2px solid var(--accent,#ffb938);outline-offset:1px;border-color:transparent}
.pq-auth .pqa-err{min-height:0;margin:0 0 10px;color:var(--bad,var(--danger,#ef4d5a));font-size:14px;font-weight:600;line-height:1.4}
.pq-auth .pqa-err:empty{display:none}
.pq-auth .pqa-go{display:block;width:100%;border:0;border-radius:12px;padding:13px;background:var(--accent,#ffb938);color:var(--accent-ink,#1b1300);font:inherit;font-size:16px;font-weight:700;cursor:pointer}
.pq-auth .pqa-go:disabled{opacity:.6;cursor:wait}
.pq-auth .pqa-foot{margin:12px 0 0;color:var(--muted,#b3aacb);font-size:12.5px;text-align:center;line-height:1.4}
.pq-acct{display:flex;justify-content:flex-end;align-items:center;flex-wrap:wrap;gap:6px 10px;margin:8px 0 0;font-size:13.5px;color:var(--muted,#b3aacb);line-height:1.3}
.pq-acct[hidden]{display:none}
.pq-acct b{color:var(--text,#f6f3ff);font-weight:600}
.pq-acct button{border:1px solid var(--line,#3b3357);background:transparent;color:var(--text,#f6f3ff);border-radius:999px;padding:6px 14px;font:inherit;font-size:13.5px;font-weight:600;cursor:pointer;line-height:1.2}
.pq-acct button.pri{background:var(--accent,#ffb938);color:var(--accent-ink,#1b1300);border-color:transparent}
.pq-acct button:focus-visible{outline:2px solid var(--accent,#ffb938);outline-offset:2px}
.kk-top+.pq-acct{max-width:980px;margin:8px auto 0;padding:0 4vw}`;
  function authStyles() {
    if (document.getElementById('pq-auth-css')) return;
    const st = document.createElement('style'); st.id = 'pq-auth-css'; st.textContent = authCss; document.head.appendChild(st);
  }
  function cancelled() { const e = new Error('innskraning_haett'); e.code = 'innskraning_haett'; return e; }

  // Opnar innskráningargluggann. Skilar notandanum þegar innskráning tekst, hafnar ef hætt er við.
  function openLogin(opts) {
    opts = opts || {};
    if (A.modal) return A.modal;
    authStyles();
    let done;
    A.modal = new Promise((res, rej) => { done = (ok, v) => (ok ? res(v) : rej(v)); });
    const prev = document.activeElement;
    const ov = document.createElement('div'); ov.className = 'pq-auth';
    ov.innerHTML = `<form role="dialog" aria-modal="true" aria-labelledby="pqa-h" novalidate>
      <button type="button" class="pqa-x" aria-label="Loka">×</button>
      <h2 id="pqa-h"></h2>
      <p class="pqa-sub">${esc(opts.message || 'Stjórnendur skrá sig inn til að búa til leiki. Gestir í símum þurfa aldrei að skrá sig inn.')}</p>
      <div class="pqa-tabs"><button type="button" data-m="in">Skrá inn</button><button type="button" data-m="up">Nýr aðgangur</button></div>
      <label class="pqa-name">Nafn <small>(sést aðeins umsjónarmanni síðunnar)</small><input name="name" autocomplete="name" maxlength="60"></label>
      <label>Netfang<input name="email" type="email" autocomplete="email" inputmode="email" autocapitalize="off" spellcheck="false"></label>
      <label><span class="pqa-pwl">Lykilorð</span><input name="password" type="password" minlength="6"></label>
      <div class="pqa-err" role="alert"></div>
      <button type="submit" class="pqa-go"></button>
      <p class="pqa-foot">Gleymt lykilorð? Hafðu samband við umsjónarmann síðunnar.</p>
    </form>`;
    document.body.appendChild(ov);
    const f = ov.querySelector('form'), err = ov.querySelector('.pqa-err'), go = ov.querySelector('.pqa-go');
    let mode = opts.mode === 'up' ? 'up' : 'in';
    function setMode(m) {
      mode = m; err.textContent = '';
      ov.querySelector('#pqa-h').textContent = m === 'up' ? 'Nýr aðgangur stjórnanda' : 'Innskráning stjórnanda';
      ov.querySelectorAll('.pqa-tabs button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.m === m)));
      ov.querySelector('.pqa-name').hidden = m !== 'up';
      ov.querySelector('.pqa-pwl').textContent = m === 'up' ? 'Lykilorð (a.m.k. 6 stafir)' : 'Lykilorð';
      f.password.autocomplete = m === 'up' ? 'new-password' : 'current-password';
      go.textContent = m === 'up' ? 'Búa til aðgang' : 'Skrá inn';
    }
    setMode(mode);
    function close(ok, v) {
      ov.remove(); document.removeEventListener('keydown', onKey, true); A.modal = null;
      try { if (prev && prev.focus) prev.focus(); } catch (e) {}
      done(ok, v);
    }
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(false, cancelled()); return; }
      if (e.key === 'Tab') {   // halda fókus inni í glugganum
        const els = Array.from(f.querySelectorAll('button,input')).filter(x => !x.closest('[hidden]') && !x.disabled);
        const first = els[0], last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener('keydown', onKey, true);
    f.addEventListener('input', () => { err.textContent = ''; });
    ov.querySelector('.pqa-x').onclick = () => close(false, cancelled());
    ov.addEventListener('mousedown', e => { if (e.target === ov) close(false, cancelled()); });
    ov.querySelectorAll('.pqa-tabs button').forEach(b => b.onclick = () => { setMode(b.dataset.m); (mode === 'up' ? f.name : f.email).focus(); });
    f.onsubmit = async e => {
      e.preventDefault(); err.textContent = '';
      const email = f.email.value.trim(), password = f.password.value, name = f.name.value.trim().replace(/\s+/g, ' ');
      if (mode === 'up' && !name) { err.textContent = 'Sláðu inn nafn.'; f.name.focus(); return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { err.textContent = 'Sláðu inn netfang.'; f.email.focus(); return; }
      if (password.length < 6) { err.textContent = 'Lykilorðið þarf að vera a.m.k. 6 stafir.'; f.password.focus(); return; }
      const label = go.textContent; go.disabled = true; go.textContent = mode === 'up' ? 'Bý til aðgang…' : 'Skrái inn…';
      try {
        const r = mode === 'up'
          ? await client.auth.signUp({ email, password, options: { data: { name } } })
          : await client.auth.signInWithPassword({ email, password });
        if (r.error) throw r.error;
        const s = r.data && r.data.session;
        if (!s) { err.textContent = 'Aðgangurinn var búinn til en netfangið þarf staðfestingu. Hafðu samband við umsjónarmann síðunnar.'; return; }
        setUser(s.user);
        const p = await touch(mode === 'up' ? name : null);
        if (p && p.blocked) { err.textContent = ERRORS.adgangur_lokadur; return; }
        close(true, A.user);
      } catch (ex) { err.textContent = authMsg(ex); }
      finally { go.disabled = false; go.textContent = label; }
    };
    setTimeout(() => (mode === 'up' ? f.name : f.email).focus(), 30);
    return A.modal;
  }
  function ensureLogin(opts) { return A.user ? Promise.resolve(A.user) : openLogin(opts); }
  async function signOut() {
    try { await client.auth.signOut({ scope: 'local' }); } catch (e) {}
    setUser(null);
  }
  // Keyrir Supabase-kall; ef gagnagrunnurinn krefst innskráningar er skráð inn og reynt aftur
  async function withLogin(call) {
    let r = await call();
    if (r && r.error && /innskraning_vantar/.test(r.error.message || '')) {
      if (A.user) { try { await client.auth.refreshSession(); } catch (e) {} }
      else {
        try { await openLogin(); } catch (e) { return { data: null, error: e }; }
      }
      r = await call();
    }
    return r;
  }

  // Innskráningarlína undir leikjavalmyndinni á stjórnendasíðum (ekki hjá gestum)
  function fillChip(el) {
    if (!A.req && A.req !== false) { el.hidden = true; return; }
    el.hidden = false;
    const u = A.user, p = A.profile || {};
    if (u && p.blocked) el.innerHTML = `<span>Lokað hefur verið á aðganginn <b>${esc(u.email)}</b></span><button type="button" data-pqa="out">Skrá út</button>`;
    else if (u) el.innerHTML = `<span title="${esc(u.email)}">Stjórnandi: <b>${esc(p.name || u.name || u.email)}</b></span><button type="button" data-pqa="out">Skrá út</button>`;
    else el.innerHTML = `<span>${A.req ? 'Stjórnendur skrá sig inn til að búa til leiki' : 'Innskráning stjórnenda'}</span><button type="button" class="pri" data-pqa="in">Skrá inn</button>`;
  }
  function drawChips() { document.querySelectorAll('.pq-acct').forEach(fillChip); }
  function mountChips() {
    let added = false;
    document.querySelectorAll('nav.modes').forEach(nav => {
      if (nav.querySelectorAll('a[href]').length < 3) return;
      const top = nav.parentElement; if (!top || (top.nextElementSibling && top.nextElementSibling.classList.contains('pq-acct'))) return;
      authStyles();
      const el = document.createElement('div'); el.className = 'pq-acct'; el.hidden = true;
      el.addEventListener('click', e => {
        const b = e.target.closest('[data-pqa]'); if (!b) return;
        if (b.dataset.pqa === 'in') openLogin().catch(() => {}); else signOut();
      });
      top.after(el); fillChip(el); added = true;
    });
    if (added) {
      loginRequired().then(drawChips);
      if (A.user) touch();
    }
  }
  let chipPending = false;
  const chipObs = new MutationObserver(() => {
    if (chipPending) return; chipPending = true;
    requestAnimationFrame(() => { chipPending = false; mountChips(); });
  });
  const chipStart = () => { mountChips(); chipObs.observe(document.body, { childList: true, subtree: true }); };
  if (document.body) chipStart(); else document.addEventListener('DOMContentLoaded', chipStart);

  async function rpc(fn, args) {
    const { data, error } = await withLogin(() => client.rpc(fn, args));
    if (error) {
      const key = Object.keys(ERRORS).find(k => (error.message || '').includes(k));
      const e = new Error(key ? ERRORS[key] : 'Villa: ' + (error.message || 'óþekkt'));
      e.code = key; throw e;
    }
    return data;
  }

  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} }
  };

  // Litir og form á svarhnöppum (eins og Kahoot: litblindir geta stuðst við formið)
  const SHAPES = ['▲', '◆', '●', '■'];

  const auth = { user: () => A.user, profile: () => A.profile, ensure: ensureLogin, open: openLogin, signOut, required: loginRequired };
  window.PQ = { client, rpc, store, esc, SHAPES, cfg, auth, withLogin };
})();
