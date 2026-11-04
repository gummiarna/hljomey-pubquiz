// Sjónvarpsskjár: stjórnandinn stýrir leiknum í símanum og stóri skjárinn birtist
// í fullri stærð á sjónvarpi sem hefur opnað leikir.hljomey.is/skjar.
// Síðan sendir afrit af skjánum (HTML) og hljóðið yfir Supabase Realtime.
// Ekkert er vistað: rásin lifir aðeins meðan báðir eru tengdir.

(function () {
  if (!window.PQ || !window.PQ.client) return;
  const client = window.PQ.client;
  const KEY = 'hljomey-skjar';
  const S = { code: null, ch: null, on: false, tvHljod: true, last: '', lastStyles: '', timer: null };

  /* ---------- Hljóð: hvert Audio-hlutur fær auðkenni og spilast líka í sjónvarpinu ---------- */
  const ids = new WeakMap(); let nextId = 1; const thekkt = new Set();
  const idOf = el => { if (!ids.has(el)) { ids.set(el, nextId++); thekkt.add(el); } return ids.get(el); };
  const media = el => !(el instanceof HTMLVideoElement);
  function sendaHljod(el) {
    if (!S.on || !media(el)) return;
    send('hljod', { id: idOf(el), src: el.currentSrc || el.src, t: el.currentTime, v: el.volume, p: el.paused });
  }
  const origPlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    if (media(this)) {
      if (!ids.has(this)) {
        idOf(this);
        ['pause', 'seeked', 'ended', 'volumechange', 'playing'].forEach(ev => this.addEventListener(ev, () => sendaHljod(this)));
      }
      if (S.on && S.tvHljod) this.muted = true;
    }
    const r = origPlay.apply(this, arguments);
    sendaHljod(this);
    return r;
  };
  function stillaHljod() {
    thekkt.forEach(el => { el.muted = S.on && S.tvHljod; });
    // YouTube (karaoke): þagga í símanum meðan sjónvarpið spilar
    document.querySelectorAll('iframe[src*="youtube"]').forEach(f => {
      try { f.contentWindow.postMessage(JSON.stringify({ event: 'command', func: S.on && S.tvHljod ? 'mute' : 'unMute', args: [] }), '*'); } catch (e) {}
    });
  }

  /* ---------- Afrit af skjánum ---------- */
  function stilar() {
    const out = [];
    document.querySelectorAll('link[rel="stylesheet"], style').forEach(n => {
      if (n.closest('[data-skjar-ignore]')) return;
      if (n.tagName === 'LINK') out.push({ href: n.href });
      else out.push({ css: n.textContent });
    });
    return out;
  }
  function afrit() {
    const clone = document.body.cloneNode(true);
    clone.querySelectorAll('script, noscript, template, [data-skjar-ignore]').forEach(n => n.remove());
    // Gildi í reitum eru ekki í HTML-inu sjálfu
    const orig = document.body.querySelectorAll('input, select, textarea');
    const copy = clone.querySelectorAll('input, select, textarea');
    if (orig.length === copy.length) orig.forEach((o, i) => {
      const c = copy[i];
      if (o.tagName === 'SELECT') Array.from(c.options).forEach((op, j) => op.toggleAttribute('selected', j === o.selectedIndex));
      else if (o.type === 'checkbox' || o.type === 'radio') c.toggleAttribute('checked', o.checked);
      else if (o.tagName === 'TEXTAREA') c.textContent = o.value;
      else c.setAttribute('value', o.value);
    });
    // Teikningar á canvas fara sem mynd
    const oc = document.body.querySelectorAll('canvas'), cc = clone.querySelectorAll('canvas');
    if (oc.length === cc.length) oc.forEach((o, i) => {
      try { const img = document.createElement('img'); img.src = o.toDataURL('image/webp', 0.8); img.className = o.className; img.setAttribute('style', o.getAttribute('style') || ''); img.style.width = o.clientWidth ? o.clientWidth + 'px' : ''; cc[i].replaceWith(img); } catch (e) {}
    });
    return clone.innerHTML;
  }
  function sendaSkja(alltaf) {
    if (!S.on) return;
    const html = afrit();
    if (!alltaf && html === S.last) return;
    if (html.length > 240000) return;   // of stórt fyrir eitt skeyti
    S.last = html;
    send('skjar', {
      html, bc: document.body.className, bs: document.body.getAttribute('style') || '',
      hc: document.documentElement.className, hs: document.documentElement.getAttribute('style') || '',
      title: document.title,
    });
  }
  function sendaAllt() {
    if (!S.on) return;
    send('stilar', { list: stilar() });
    sendaSkja(true);
    thekkt.forEach(el => { if (!el.paused) sendaHljod(el); });
  }
  function send(event, payload) {
    if (S.ch) S.ch.send({ type: 'broadcast', event, payload }).catch(() => {});
  }
  const obs = new MutationObserver(muts => {
    if (!S.on) return;
    if (muts.every(m => m.target.closest && m.target.closest('[data-skjar-ignore]'))) return;
    if (S.timer) return;
    S.timer = setTimeout(() => { S.timer = null; sendaSkja(false); }, 200);
  });

  /* ---------- Tenging ---------- */
  function tengja(code) {
    aftengja(true);
    S.code = code; S.on = true; S.last = '';
    S.ch = client.channel('skjar-' + code, { config: { broadcast: { self: false } } });
    S.ch.on('broadcast', { event: 'hallo' }, () => sendaAllt());
    S.ch.subscribe(st => { if (st === 'SUBSCRIBED') { sendaAllt(); teikna(); } });
    obs.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
    try { localStorage.setItem(KEY, JSON.stringify({ code, tv: S.tvHljod, at: Date.now() })); } catch (e) {}
    stillaHljod(); teikna();
  }
  function aftengja(hljodlaust) {
    if (S.ch) { if (!hljodlaust) send('bless', {}); client.removeChannel(S.ch); }
    S.ch = null; S.on = false; S.code = null; obs.disconnect();
    if (!hljodlaust) { try { localStorage.removeItem(KEY); } catch (e) {} }
    stillaHljod(); teikna();
  }

  /* ---------- Hnappurinn: flipi á vinstri brún, í skugga-DOM svo stílar síðunnar trufli ekki ---------- */
  const css = `:host{all:initial}
*{box-sizing:border-box;font-family:system-ui,-apple-system,'Segoe UI',sans-serif}
.flipi{position:fixed;left:0;top:50%;transform:translateY(-50%);z-index:2147483000;width:44px;height:60px;border:1px solid rgba(255,255,255,.22);border-left:0;border-radius:0 14px 14px 0;background:rgba(11,31,41,.9);color:#f5fbfc;font-size:22px;cursor:pointer;display:grid;place-items:center;padding:0;backdrop-filter:blur(6px);box-shadow:0 6px 20px rgba(0,0,0,.35)}
.flipi.on{background:#f2b544;border-color:#f2b544;color:#123647}
.flipi small{display:block;font-size:10px;font-weight:800;letter-spacing:.04em;margin-top:-6px}
.ov[hidden]{display:none}
.ov{position:fixed;inset:0;z-index:2147483001;display:grid;place-items:center;background:rgba(5,14,19,.72);padding:16px}
form{width:min(400px,100%);background:#102c3a;color:#f5fbfc;border:1px solid #255066;border-radius:18px;padding:24px;display:grid;gap:14px;font-size:16px;line-height:1.45;margin:0}
h2{margin:0;font-size:22px;font-weight:700}p{margin:0;color:#a9c9d4}b{color:#f5fbfc}
input.k{width:100%;font-size:32px;font-weight:700;letter-spacing:.3em;text-align:center;text-transform:uppercase;padding:12px;border-radius:12px;border:1px solid #255066;background:#0b1f29;color:#f5fbfc;margin:0}
label{display:flex;gap:10px;align-items:center;color:#a9c9d4;cursor:pointer}
label input{width:20px;height:20px;margin:0;accent-color:#f2b544}
.r{display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap}
button.b{border:0;border-radius:999px;padding:11px 18px;font-size:15px;font-weight:600;cursor:pointer}
.go{background:#f2b544;color:#123647}.x{background:transparent;color:#a9c9d4;border:1px solid #255066!important}
.stada{display:flex;align-items:center;gap:10px;background:#0b1f29;border:1px solid #255066;border-radius:12px;padding:12px 14px}
.stada i{width:10px;height:10px;border-radius:50%;background:#2fbf71;flex:0 0 auto}`;
  const host = document.createElement('div'); host.dataset.skjarIgnore = '1';
  const sh = host.attachShadow({ mode: 'open' });
  sh.innerHTML = `<style>${css}</style><button type="button" class="flipi" title="Sýna á sjónvarpi" aria-label="Sýna á sjónvarpi"></button><div class="ov" hidden></div>`;
  const flipi = sh.querySelector('.flipi'), ov = sh.querySelector('.ov');
  function teikna() {
    flipi.classList.toggle('on', S.on);
    flipi.innerHTML = S.on ? `<span>📺<small>${S.code}</small></span>` : '📺';
  }
  function loka() { ov.hidden = true; ov.innerHTML = ''; }
  function gluggi() {
    ov.hidden = false;
    ov.innerHTML = S.on
      ? `<form><h2>Sýnt á sjónvarpi</h2>
          <div class="stada"><i></i><span>Tengt við skjá <b>${S.code}</b></span></div>
          <label><input type="checkbox" name="tv" ${S.tvHljod ? 'checked' : ''}> Hljóðið kemur úr sjónvarpinu</label>
          <div class="r"><button type="button" class="b x" data-a="af">Aftengja</button><button class="b go">Loka</button></div></form>`
      : `<form><h2>Sýna á sjónvarpi</h2>
          <p>Opnaðu <b>leikir.hljomey.is/skjar</b> í vafranum í sjónvarpinu, eða í tölvu sem er tengd við það, og sláðu inn kóðann sem birtist þar.</p>
          <input class="k" name="k" maxlength="4" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABCD">
          <label><input type="checkbox" name="tv" ${S.tvHljod ? 'checked' : ''}> Hljóðið kemur úr sjónvarpinu</label>
          <div class="r"><button type="button" class="b x" data-a="loka">Hætta við</button><button class="b go">Tengja</button></div></form>`;
    const f = ov.querySelector('form');
    if (f.k) setTimeout(() => f.k.focus(), 30);
    f.tv.onchange = () => {
      if (!S.on) return;
      S.tvHljod = f.tv.checked; stillaHljod();
      thekkt.forEach(el => sendaHljod(el));
      send('hljodstilling', { tv: S.tvHljod });
      try { localStorage.setItem(KEY, JSON.stringify({ code: S.code, tv: S.tvHljod, at: Date.now() })); } catch (e) {}
    };
    f.addEventListener('click', e => {
      const a = e.target.closest('[data-a]'); if (!a) return;
      if (a.dataset.a === 'af') { aftengja(false); loka(); } else loka();
    });
    f.onsubmit = e => {
      e.preventDefault();
      if (S.on) { loka(); return; }
      const code = f.k.value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (code.length !== 4) { f.k.focus(); return; }
      S.tvHljod = f.tv.checked; loka(); tengja(code);
    };
  }
  flipi.onclick = gluggi;
  ov.addEventListener('mousedown', e => { if (e.target === ov) loka(); });
  function start() {
    document.body.appendChild(host); teikna();
    // Tengjast aftur sjálfkrafa eftir endurhleðslu eða þegar farið er á milli leikja (innan 12 klst.)
    try {
      const v = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (v && v.code && Date.now() - v.at < 12 * 3600e3) { S.tvHljod = v.tv !== false; tengja(v.code); }
    } catch (e) {}
  }
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
  window.addEventListener('pagehide', () => { if (S.ch) send('bless', { endurhleðsla: true }); });
})();
