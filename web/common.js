// Sameiginlegur kóði fyrir stjórnanda- og símasíðu.
(function () {
  const cfg = window.PQ_CONFIG || {};
  const client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    realtime: { params: { eventsPerSecond: 20 } }
  });

  const ERRORS = {
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
    lag_fannst_ekki: 'Lagið er ekki lengur í biðröðinni.'
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
