// Deezer-tenging (JSONP, því Deezer leyfir ekki beinar fyrirspurnir úr vafra).
(function () {
  let n = 0;
  function dz(path, params) {
    return new Promise((resolve, reject) => {
      const cb = 'pqdz' + Date.now() + '_' + (n++);
      const q = new URLSearchParams(Object.assign({}, params || {}, { output: 'jsonp', callback: cb }));
      const s = document.createElement('script');
      const done = () => { clearTimeout(timer); delete window[cb]; s.remove(); };
      const timer = setTimeout(() => { done(); reject(new Error('Deezer svaraði ekki.')); }, 12000);
      window[cb] = d => { done(); (d && d.error) ? reject(new Error('Deezer: ' + (d.error.message || 'villa'))) : resolve(d); };
      s.onerror = () => { done(); reject(new Error('Náði ekki sambandi við Deezer.')); };
      s.src = 'https://api.deezer.com' + path + '?' + q.toString();
      document.body.appendChild(s);
    });
  }

  // Hreinsar "(Remastered 2011)", "- Live" o.fl. af heitum laga
  function cleanTitle(t) {
    return String(t || '')
      .replace(/\s*[\(\[][^\)\]]*(remaster|version|edit|live|mono|stereo|feat\.?|ft\.|mix|radio|explicit|acoustic)[^\)\]]*[\)\]]/ig, '')
      .replace(/\s+-\s+.*(remaster|version|edit|live|mono|stereo|mix).*$/i, '')
      .trim();
  }

  function toTrack(t) {
    if (!t || !t.preview || t.readable === false) return null;
    return {
      deezer_id: t.id,
      title: cleanTitle(t.title_short || t.title),
      artist: (t.artist && t.artist.name) || '',
      cover: (t.album && (t.album.cover_big || t.album.cover_medium)) || '',
      preview: t.preview
    };
  }

  function dedupe(list) {
    const seen = new Set(); const out = [];
    for (const t of list) {
      if (!t) continue;
      const k = (t.title + '|' + t.artist).toLowerCase();
      if (!seen.has(k)) { seen.add(k); out.push(t); }
    }
    return out;
  }

  async function paged(path, params, max) {
    let all = []; let index = 0;
    while (all.length < max) {
      const d = await dz(path, Object.assign({}, params, { limit: 100, index }));
      const items = (d && d.data) || [];
      all = all.concat(items);
      if (items.length < 100 || !d.next) break;
      index += 100;
    }
    return all;
  }

  function playlistId(input) {
    const m = String(input).match(/playlist\/(\d+)/) || String(input).match(/^\s*(\d{4,})\s*$/);
    return m ? m[1] : null;
  }

  // Sækir lagalista (pool) eftir tegund þema
  async function fetchPool(kind, value) {
    let raw = [];
    if (kind === 'search') {
      if (!value.trim()) throw new Error('Sláðu inn leitarorð.');
      raw = await paged('/search', { q: value.trim() }, 200);
    } else if (kind === 'playlist') {
      const id = playlistId(value);
      if (!id) throw new Error('Límdu inn slóð á Deezer-lagalista, t.d. https://www.deezer.com/playlist/1234567');
      raw = await paged('/playlist/' + id + '/tracks', {}, 400);
    } else if (kind === 'artists') {
      const names = value.split(/[,;\n]/).map(s => s.trim()).filter(Boolean);
      if (names.length < 1) throw new Error('Sláðu inn a.m.k. einn flytjanda.');
      for (const name of names) {
        const a = await dz('/search/artist', { q: name, limit: 1 });
        const artist = a && a.data && a.data[0];
        if (!artist) continue;
        const top = await dz('/artist/' + artist.id + '/top', { limit: 40 });
        raw = raw.concat((top && top.data) || []);
      }
    } else if (kind === 'chart') {
      const d = await dz('/chart/' + (value || '0') + '/tracks', { limit: 100 });
      raw = (d && d.data) || [];
    }
    return dedupe(raw.map(toTrack));
  }

  async function refreshPreview(deezerId) {
    const t = await dz('/track/' + deezerId);
    return t && t.preview;
  }

  window.PQDeezer = { dz, fetchPool, refreshPreview, cleanTitle };
})();
