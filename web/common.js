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
    auth: { persistSession: false },
    realtime: { params: { eventsPerSecond: 20 } }
  });

  const ERRORS = {
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

  async function rpc(fn, args) {
    const { data, error } = await client.rpc(fn, args);
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

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // Litir og form á svarhnöppum (eins og Kahoot: litblindir geta stuðst við formið)
  const SHAPES = ['▲', '◆', '●', '■'];

  window.PQ = { client, rpc, store, esc, SHAPES, cfg };
})();
