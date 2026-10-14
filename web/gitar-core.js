/* Gítarpartý — kjarni: lestur laga, hljómar, tónflutningur og birting.
 * Engin háð — virkar bæði í vafra (window.GitarCore) og í Node (prófanir).
 *
 * Snið laga (ChordPro-líkt):
 *   [Am]Sofðu unga [E7]ástin mín     ← hljómur í hornklofa á undan atkvæði
 *   Viðlag:                           ← lína sem endar á tvípunkti = merki
 *   {soc} … {eoc}                     ← viðlag (ChordPro)
 *   {c: Endurtaka}                    ← athugasemd/merki
 *   Auð lína skilur á milli erinda.
 * Einnig má líma inn „hljómar fyrir ofan texta" — fromChordsOverLyrics() breytir því.
 */
(function (root) {
  'use strict';

  // ---------- Hljómar ----------
  var SUF = '(?:maj|min|m|M|dim|aug|sus|add|°|ø|\\+)?(?:\\d{1,2})?(?:(?:sus|add|maj|no|b|#)\\d{0,2})*';
  var CHORD_RE = new RegExp('^[A-H](?:#|b)?' + SUF + '(?:\\/[A-H](?:#|b)?)?$');
  var NEUTRAL_RE = /^(?:\||\|\||\/|%|-+|\.+|x\d+|\(x\d+\)|\d+x|N\.?C\.?|\(|\))$/i;

  function isChord(tok) {
    if (!tok) return false;
    var t = tok.replace(/^\(/, '').replace(/\)$/, '');
    return CHORD_RE.test(t);
  }

  function isChordLine(line) {
    var toks = String(line).trim().split(/\s+/).filter(Boolean);
    if (!toks.length) return false;
    var chords = 0;
    for (var i = 0; i < toks.length; i++) {
      if (isChord(toks[i])) chords++;
      else if (!NEUTRAL_RE.test(toks[i])) return false;
    }
    return chords > 0;
  }

  var SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  var FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
  var BASE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11, H: 11 };

  // Í lagi sem notar H (þýsk/íslensk eldri venja) merkir B í raun Bb.
  function noteIndex(note, germanB) {
    var letter = note.charAt(0), acc = note.charAt(1);
    var i = BASE[letter];
    if (i === undefined) return null;
    if (letter === 'B' && germanB) i = 10;
    if (acc === '#') i += 1;
    if (acc === 'b') i -= 1;
    return (i + 12) % 12;
  }

  function transposeChord(chord, steps, opts) {
    opts = opts || {};
    if (!steps) return chord;
    var names = opts.flats ? FLAT : SHARP;
    function tr(n) {
      var i = noteIndex(n, opts.germanB);
      return i === null ? n : names[(i + steps + 120) % 12];
    }
    var lead = '', tail = '', c = chord;
    if (c.charAt(0) === '(') { lead = '('; c = c.slice(1); }
    if (c.slice(-1) === ')') { tail = ')'; c = c.slice(0, -1); }
    c = c.replace(/^[A-H](?:#|b)?/, tr).replace(/\/([A-H](?:#|b)?)$/, function (m, n) { return '/' + tr(n); });
    return lead + c + tail;
  }

  // Sharp eða flat eftir tóntegund sem flutt er í.
  function prefersFlats(keyChord, steps, germanB) {
    if (!keyChord) return false;
    var m = /^([A-H](?:#|b)?)(m(?!aj)|min)?/.exec(keyChord.replace(/^\(/, ''));
    if (!m) return false;
    var i = noteIndex(m[1], germanB);
    if (i === null) return false;
    var minor = !!m[2];
    var target = (i + steps + 120) % 12;
    var rel = minor ? (target + 3) % 12 : target;
    return [5, 10, 3, 8, 1].indexOf(rel) !== -1;
  }

  // ---------- Innflutningur: hljómar fyrir ofan texta ----------
  function hasInlineChords(line) {
    var re = /\[([^\]]+)\]/g, m;
    while ((m = re.exec(line))) if (isChord(m[1])) return true;
    return false;
  }

  function mergeChordLine(chordLine, lyric) {
    var marks = [], re = /\S+/g, m;
    while ((m = re.exec(chordLine))) marks.push({ pos: m.index, tok: m[0] });
    var s = lyric.replace(/\s+$/, '');
    var maxPos = 0;
    marks.forEach(function (k) { if (k.pos > maxPos) maxPos = k.pos; });
    if (s.length < maxPos) s += new Array(maxPos - s.length + 1).join(' ');
    for (var k = marks.length - 1; k >= 0; k--) {
      if (!isChord(marks[k].tok)) continue;
      var p = marks[k].pos;
      s = s.slice(0, p) + '[' + marks[k].tok.replace(/^\(|\)$/g, '') + ']' + s.slice(p);
    }
    return s.replace(/\s+$/, '');
  }

  function looksLikeLabel(line) {
    var t = line.trim();
    return /^\{.*\}$/.test(t) || (/:$/.test(t) && t.split(/\s+/).length <= 4);
  }

  // Gítartabs (e|---3---|) og hausar af gítarsíðum (Tuning, Capo, Key)
  var TAB_RE = /^\s*[eBGDAEbgda]\s*[|:][-\d\s|hpbrstxv\/\\~()^.*=<>]{3,}$/;
  function cleanPaste(lines) {
    var out = [];
    lines.forEach(function (L) {
      var t = L.trim();
      if (TAB_RE.test(t)) return;
      var capo = /^capo\s*[:\-]?\s*(?:on\s*)?(?:fret\s*)?(\d{1,2})/i.exec(t) || /^capo\b.{0,20}?(\d{1,2})\s*(?:st|nd|rd|th)?\s*fret/i.exec(t);
      if (capo) { out.push('{capo: ' + capo[1] + '}'); return; }
      if (/^capo\s*:?\s*(no capo|none|nei|0)?\s*$/i.test(t)) return;
      var key = /^(?:key|tóntegund)\s*:\s*([A-H][#b]?m?)\s*$/i.exec(t);
      if (key) { out.push('{key: ' + key[1] + '}'); return; }
      if (/^(tuning|stilling|difficulty|author|strumming)\s*:/i.test(t)) return;
      out.push(L);
    });
    return out;
  }

  function fromChordsOverLyrics(text) {
    var lines = cleanPaste(String(text).replace(/\r\n?/g, '\n').replace(/\t/g, '    ').replace(/\u00a0/g, ' ').split('\n'));
    var out = [];
    for (var i = 0; i < lines.length; i++) {
      var L = lines[i];
      if (isChordLine(L) && !hasInlineChords(L)) {
        var next = lines[i + 1];
        if (next !== undefined && next.trim() !== '' && !isChordLine(next) && !looksLikeLabel(next) && !hasInlineChords(next)) {
          out.push(mergeChordLine(L, next));
          i++;
        } else {
          out.push(L.trim().split(/\s+/).map(function (t) { return isChord(t) ? '[' + t.replace(/^\(|\)$/g, '') + ']' : t; }).join(' '));
        }
      } else {
        out.push(L.replace(/\s+$/, ''));
      }
    }
    return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  // Er textinn á „hljómar fyrir ofan" formi? (a.m.k. ein hljómalína og engir [hljómar])
  function needsConversion(text) {
    var lines = String(text).split(/\r?\n/);
    var chordLines = 0, inline = 0;
    lines.forEach(function (l) { if (hasInlineChords(l)) inline++; else if (isChordLine(l)) chordLines++; });
    return chordLines > 0 && inline === 0;
  }

  // ---------- Lestur ----------
  // Skilar { meta:{title,artist,key,capo}, blocks:[{label, chorus, lines:[…]}], firstChord, germanB }
  function parseSong(text) {
    var meta = {};
    var blocks = [];
    var cur = null;
    var inChorus = false;
    var firstChord = null, usesH = false;

    function block() {
      if (!cur) { cur = { label: '', chorus: inChorus, lines: [] }; blocks.push(cur); }
      return cur;
    }
    function end() { cur = null; }

    String(text || '').replace(/\r\n?/g, '\n').split('\n').forEach(function (raw) {
      var line = raw.replace(/\s+$/, '');
      var t = line.trim();
      if (!t) { end(); return; }

      var d = /^\{\s*([a-z_]+)\s*(?::\s*(.*?))?\s*\}$/i.exec(t);
      if (d) {
        var k = d[1].toLowerCase(), v = (d[2] || '').trim();
        if (k === 't' || k === 'title') meta.title = v;
        else if (k === 'st' || k === 'subtitle' || k === 'artist') meta.artist = v;
        else if (k === 'key') meta.key = v;
        else if (k === 'capo') meta.capo = parseInt(v, 10) || 0;
        else if (k === 'soc' || k === 'start_of_chorus') { end(); inChorus = true; block().label = v || 'Viðlag'; }
        else if (k === 'eoc' || k === 'end_of_chorus') { inChorus = false; end(); }
        else if (k === 'c' || k === 'comment' || k === 'ci') {
          var b = block();
          if (!b.lines.length && !b.label) b.label = v; else b.lines.push({ type: 'note', text: v });
        }
        return;
      }

      // Merki eins og „Viðlag:" eða „[Viðlag]" (ef ekki hljómur)
      var lb = /^\[([^\]]+)\]$/.exec(t);
      if ((lb && !isChord(lb[1])) || (/:$/.test(t) && !hasInlineChords(t) && t.split(/\s+/).length <= 4)) {
        end();
        var label = lb ? lb[1] : t.slice(0, -1);
        cur = { label: label, chorus: inChorus || /^(viðlag|chorus|kór)/i.test(label), lines: [] };
        blocks.push(cur);
        return;
      }

      // Hljómar inni í línu
      var segs = [], re = /\[([^\]]*)\]/g, m, last = 0, pending = null;
      while ((m = re.exec(line))) {
        if (!isChord(m[1])) continue;
        var before = line.slice(last, m.index);
        if (pending !== null || before) segs.push({ c: pending, t: before });
        pending = m[1];
        if (!firstChord) firstChord = m[1];
        if (/^\(?H/.test(m[1]) || /\/H/.test(m[1])) usesH = true;
        last = m.index + m[0].length;
      }
      var rest = line.slice(last);
      if (pending !== null || rest || !segs.length) segs.push({ c: pending, t: rest });

      var onlyChords = segs.every(function (s) { return !s.t.trim(); }) && segs.some(function (s) { return s.c; });
      if (onlyChords) {
        block().lines.push({ type: 'chords', chords: segs.filter(function (s) { return s.c; }).map(function (s) { return s.c; }) });
      } else if (!segs.some(function (s) { return s.c; }) && isChordLine(t)) {
        // hljómalína án hornklofa (t.d. forspil)
        var cs = t.split(/\s+/).filter(isChord);
        if (!firstChord) firstChord = cs[0];
        block().lines.push({ type: 'chords', chords: cs });
      } else {
        block().lines.push({ type: 'lyric', segs: segs });
      }
    });

    return { meta: meta, blocks: blocks.filter(function (b) { return b.lines.length || b.label; }), firstChord: firstChord, germanB: usesH };
  }

  // ---------- Birting ----------
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function chordHTML(c, opts) {
    return esc(transposeChord(c, opts.tr || 0, opts));
  }

  // Ein textalína með hljómum: orð sem innihalda hljóma brotna ekki í sundur.
  function lyricLineHTML(segs, opts) {
    if (!opts.chords) {
      var plain = segs.map(function (s) { return s.t; }).join('').replace(/\s{2,}/g, ' ').trim();
      return '<div class="gp-ln">' + (esc(plain) || '&nbsp;') + '</div>';
    }
    // Byggja straum stafa með hljómamerkjum
    var text = '', marks = {};
    segs.forEach(function (s) {
      if (s.c) {
        var at = text.length;
        marks[at] = (marks[at] ? marks[at] + ' ' : '') + s.c;
      }
      text += s.t;
    });
    var html = '', i = 0, n = text.length;
    // Hljómur á bili færist á upphaf næsta orðs
    var shifted = {};
    Object.keys(marks).forEach(function (k) {
      var p = +k;
      while (p < n && text.charAt(p) === ' ') p++;
      shifted[p] = (shifted[p] ? shifted[p] + ' ' : '') + marks[k];
    });
    while (i < n) {
      if (text.charAt(i) === ' ') {
        var j = i; while (j < n && text.charAt(j) === ' ') j++;
        html += j >= n ? '' : ' ';
        i = j; continue;
      }
      var e = i; while (e < n && text.charAt(e) !== ' ') e++;
      var word = '', hasC = false;
      var cuts = [i];
      for (var p = i + 1; p < e; p++) if (shifted[p] !== undefined) cuts.push(p);
      cuts.push(e);
      for (var q = 0; q < cuts.length - 1; q++) {
        var a = cuts[q], b = cuts[q + 1], piece = esc(text.slice(a, b));
        if (shifted[a] !== undefined) {
          hasC = true;
          var name = shifted[a].split(' ').map(function (c) { return chordHTML(c, opts); }).join(' ');
          word += '<span class="gp-c" style="--n:' + (name.replace(/&[a-z]+;/g, 'x').length) + '"><i>' + name + '</i>' + piece + '</span>';
        } else word += piece;
      }
      html += hasC ? '<span class="gp-w">' + word + '</span>' : word;
      i = e;
    }
    if (shifted[n] !== undefined) {
      var tailName = shifted[n].split(' ').map(function (c) { return chordHTML(c, opts); }).join(' ');
      html += ' <span class="gp-c" style="--n:' + tailName.length + '"><i>' + tailName + '</i>&nbsp;</span>';
    }
    var any = Object.keys(shifted).length > 0;
    return '<div class="gp-ln' + (any ? ' gp-has' : '') + '">' + (html || '&nbsp;') + '</div>';
  }

  function renderSong(parsed, opts) {
    opts = opts || {};
    var o = {
      chords: !!opts.chords,
      tr: opts.tr || 0,
      germanB: parsed.germanB,
      flats: prefersFlats(parsed.meta.key || parsed.firstChord, opts.tr || 0, parsed.germanB)
    };
    var out = [];
    parsed.blocks.forEach(function (b) {
      var inner = [];
      b.lines.forEach(function (l) {
        if (l.type === 'lyric') inner.push(lyricLineHTML(l.segs, o));
        else if (l.type === 'chords') { if (o.chords) inner.push('<div class="gp-ln gp-only">' + l.chords.map(function (c) { return '<b>' + chordHTML(c, o) + '</b>'; }).join('') + '</div>'); }
        else if (l.type === 'note') inner.push('<div class="gp-note">' + esc(l.text) + '</div>');
      });
      if (!inner.length && !b.label) return;
      if (!inner.length && b.label) {
        // merki án texta, t.d. „Viðlag:" sem endurtekning
        out.push('<div class="gp-blk gp-rep"><div class="gp-lbl">' + esc(b.label) + '</div></div>');
        return;
      }
      out.push('<div class="gp-blk' + (b.chorus ? ' gp-chorus' : '') + '">' + (b.label ? '<div class="gp-lbl">' + esc(b.label) + '</div>' : '') + inner.join('') + '</div>');
    });
    return out.join('');
  }

  function songKey(parsed, tr) {
    var k = parsed.meta.key || parsed.firstChord;
    if (!k) return '';
    var m = /^\(?([A-H](?:#|b)?)(m(?!aj)|min)?/.exec(k);
    if (!m) return k;
    var root = m[1] + (m[2] ? 'm' : '');
    return transposeChord(root, tr || 0, { flats: prefersFlats(k, tr || 0, parsed.germanB), germanB: parsed.germanB });
  }

  // Allir hljómar lagsins (í röð, án tvítekninga) — fyrir yfirlit/gripamyndir
  function chordList(parsed, tr) {
    var seen = {}, list = [];
    var o = { flats: prefersFlats(parsed.meta.key || parsed.firstChord, tr || 0, parsed.germanB), germanB: parsed.germanB };
    parsed.blocks.forEach(function (b) {
      b.lines.forEach(function (l) {
        var cs = l.type === 'lyric' ? l.segs.filter(function (s) { return s.c; }).map(function (s) { return s.c; }) : (l.chords || []);
        cs.forEach(function (c) {
          var t = transposeChord(c, tr || 0, o);
          if (!seen[t]) { seen[t] = 1; list.push(t); }
        });
      });
    });
    return list;
  }

  // ---------- Innflutningur úr PDF (t.d. söngbók af guitarparty.com) ----------
  // pages: [{ items: [{ str, x, y, w, size, font }] }] — staðsetningar úr pdf.js (y vex upp á við)
  // measure(str, size): breidd strengs í punktum (canvas í vafra) — notað til að finna
  // nákvæmlega yfir hvaða staf hver hljómur á heima.
  function fromPdfPages(pages, measure, opts) {
    measure = measure || function (s, size) { return s.length * size * 0.5; };
    opts = opts || {};
    // Hljómar í PDF-skjölum standa örlítið vinstra megin við atkvæðið sitt; hliðrun
    // (hlutfall af leturstærð) og það að hljómur lendi aldrei á bili laga það.
    var BIAS = opts.bias != null ? opts.bias : 0.1;
    var SNAP = opts.snap != null ? opts.snap : true;
    var SPACEFIT = opts.spaceFit != null ? opts.spaceFit : true;
    var CREDIT = /^(song by|lyrics by|music by|words by|artists?|lag|texti|lag og texti)\s*:/i;

    // Hvaða letur er notað fyrir hljóma? Það sem hefur hæst hlutfall hljóma.
    var fontStat = {};
    pages.forEach(function (pg) { pg.items.forEach(function (it) {
      var t = it.str.trim(); if (!t) return;
      var f = fontStat[it.font] || (fontStat[it.font] = { n: 0, c: 0 });
      f.n++; if (t.split(/\s+/).every(function (x) { return isChord(x) || NEUTRAL_RE.test(x); })) f.c++;
    }); });
    var chordFont = null, best = 0;
    Object.keys(fontStat).forEach(function (f) { var s = fontStat[f]; var r = s.c / s.n; if (s.n >= 5 && r > best) { best = r; chordFont = f; } });
    if (best < 0.6) chordFont = null;

    // Leturstærð texta = algengasta stærð
    var sizeCount = {};
    pages.forEach(function (pg) { pg.items.forEach(function (it) { if (it.str.trim()) { var k = Math.round(it.size); sizeCount[k] = (sizeCount[k] || 0) + it.str.length; } }); });
    var bodySize = +Object.keys(sizeCount).sort(function (a, b) { return sizeCount[b] - sizeCount[a]; })[0] || 11;

    // Síða í tveimur dálkum? (langar söngbækur prenta lög í tvo dálka)
    function columns(pg) {
      var its = pg.items.filter(function (it) { return it.str.trim(); });
      if (!its.length) return [];
      var W = pg.width || Math.max.apply(null, its.map(function (it) { return it.x + (it.w || 0); })) + Math.min.apply(null, its.map(function (it) { return it.x; }));
      var body = its.filter(function (it) { return it.size >= bodySize - 1.6 && it.size < bodySize * 1.45; });
      var right = body.filter(function (it) { return it.x > W * 0.42; });
      if (right.length >= 3) {
        var split = Math.min.apply(null, right.map(function (it) { return it.x; }));
        var crosses = body.some(function (it) { return it.x < split - 2 && it.x + (it.w || 0) > split + 2; });
        var leftBody = body.filter(function (it) { return it.x < split - 2; }).length;
        if (!crosses && leftBody >= 3) {
          return [its.filter(function (it) { return it.x < split - 1; }), its.filter(function (it) { return it.x >= split - 1; })].map(lines);
        }
      }
      return [lines(its)];
    }

    function lines(items) {
      var its = items.slice().sort(function (a, b) { return b.y - a.y || a.x - b.x; });
      var out = [];
      its.forEach(function (it) {
        var L = out.length && Math.abs(out[out.length - 1].y - it.y) < 2 ? out[out.length - 1] : null;
        if (!L) { L = { y: it.y, items: [] }; out.push(L); }
        L.items.push(it);
      });
      out.forEach(function (L) {
        L.items.sort(function (a, b) { return a.x - b.x; });
        L.x = L.items[0].x;
        L.size = Math.max.apply(null, L.items.map(function (i) { return i.size; }));
        L.text = L.items.map(function (i) { return i.str; }).join(' ').replace(/\s+/g, ' ').trim();
        L.chords = !!chordFont && L.items.every(function (i) { return i.font === chordFont; });
        if (!chordFont) L.chords = isChordLine(L.text);
      });
      return out;
    }

    // Stafir textalínu með x-staðsetningu hvers stafs
    function charsOf(L) {
      var chars = [];
      L.items.forEach(function (it, k) {
        var s = it.str;
        var natural = measure(s, it.size) || 1;
        var scale = it.w > 0 ? it.w / natural : 1;
        if (k > 0 && chars.length) {
          var prev = chars[chars.length - 1];
          var gap = it.x - prev.end;
          if (gap > it.size * 0.15 && prev.c !== ' ') chars.push({ c: ' ', x: prev.end, end: it.x });
        }
        for (var i = 0; i < s.length; i++) {
          var x0 = it.x + measure(s.slice(0, i), it.size) * scale;
          var x1 = it.x + measure(s.slice(0, i + 1), it.size) * scale;
          chars.push({ c: s.charAt(i), x: x0, end: x1 });
        }
      });
      return chars;
    }

    // „FDm" → F + Dm (pdf.js límir stundum saman hljóma sem standa þétt)
    function splitGlued(t) {
      if (isChord(t)) return [t];
      for (var k = 1; k < t.length; k++) {
        if (!isChord(t.slice(0, k))) continue;
        var rest = splitGlued(t.slice(k));
        if (rest) return [t.slice(0, k)].concat(rest);
      }
      return null;
    }

    function chordTokens(L) {
      var toks = [];
      L.items.forEach(function (it) {
        var s = it.str, re = /\S+/g, m;
        var natural = measure(s, it.size) || 1;
        var nsp = (s.match(/ /g) || []).length;
        var scale = 1, perSpace = 0;
        if (it.w > 0) {
          // Auka breidd í hljómalínu kemur úr bilunum á milli hljóma, ekki hljómunum sjálfum
          if (SPACEFIT && nsp && it.w > natural * 1.02) perSpace = (it.w - natural) / nsp;
          else scale = it.w / natural;
        }
        var xAt = function (i) { var pre = s.slice(0, i); return it.x + measure(pre, it.size) * scale + perSpace * (pre.match(/ /g) || []).length; };
        while ((m = re.exec(s))) {
          var raw = m[0], lead = raw.charAt(0) === '(' ? 1 : 0, core = raw.replace(/^\(|\)$/g, '');
          var parts = isChord(core) ? null : splitGlued(core);
          if (parts && parts.length > 1) {
            var off = m.index + lead;
            parts.forEach(function (p) { toks.push({ t: p, x: xAt(off) }); off += p.length; });
          } else toks.push({ t: raw, x: xAt(m.index) });
        }
      });
      return toks;
    }

    function merge(chL, lyL) {
      var chars = charsOf(lyL);
      var toks = chordTokens(chL);
      var marks = {}, tail = [], extra = [], lead = [];
      var startX = chars.length ? chars[0].x : Infinity;
      toks.forEach(function (tk) {
        var t = tk.t.replace(/^\(|\)$/g, '');
        if (!isChord(t)) { if (!/^\|+$/.test(tk.t)) extra.push(tk.t); return; }
        // Hljómur sem endar áður en textinn byrjar = forspil á undan fyrsta orði
        if (tk.x + measure(t, chL.size || bodySize) * 0.9 < startX) { lead.push(t); return; }
        var idx = -1, cx = tk.x + BIAS * lyL.size;
        for (var i = 0; i < chars.length; i++) {
          var mid = (chars[i].x + chars[i].end) / 2;
          if (cx < mid) { idx = i; break; }
        }
        if (SNAP && idx !== -1) {
          while (idx < chars.length && chars[idx].c === ' ') idx++;   // aldrei á bil: á upphaf næsta orðs
          if (idx >= chars.length) idx = -1;
        }
        if (idx === -1) tail.push(t);
        else marks[idx] = (marks[idx] || '') + '[' + t + ']';
      });
      var s = '';
      if (lead.length === 1) marks[0] = '[' + lead[0] + ']' + (marks[0] || '');
      else if (lead.length > 1) s = lead.map(function (t) { return '[' + t + ']'; }).join(' ') + '\n';
      chars.forEach(function (ch, i) { if (marks[i]) s += marks[i]; s += ch.c; });
      if (tail.length) s += ' ' + tail.map(function (t) { return '[' + t + ']'; }).join(' ');
      if (extra.length) s += ' ' + extra.join(' ');
      return s.replace(/\s+$/, '');
    }

    function chordOnly(L) {
      return chordTokens(L).map(function (tk) {
        var t = tk.t.replace(/^\(|\)$/g, '');
        return isChord(t) ? '[' + t + ']' : tk.t;
      }).join(' ');
    }

    var songs = [], cur = null;
    var stepGuess = bodySize * 1.0;

    pages.forEach(function (pg, pi) {
      var cols = columns(pg);
      var flat = [].concat.apply([], cols);
      if (!flat.length) return;
      // Efnisyfirlit er hunsað
      var isToc = flat.some(function (L) { return /table of contents|efnisyfirlit/i.test(L.text); }) ||
                  flat.filter(function (L) { return /(\.\s*){5,}\d+\s*$/.test(L.text); }).length > 3;
      if (isToc) return;
      cols.forEach(function (ls) { doColumn(ls); });
    });

    function doColumn(ls) {
      // Haus og fótur (síðutal, „generated at …")
      ls = ls.filter(function (L) {
        if (/guitarparty\.com|songbook was generated/i.test(L.text)) return false;
        return !(L.size < bodySize - 1.5 && /^(bls\.?\s*\d+|\d+|síða \d+)$/i.test(L.text));
      });

      if (!ls.length) return;
      var baseX = Math.min.apply(null, ls.map(function (L) { return L.x; }));
      var prevY = null, block = null;

      function addLine(text, indented) {
        if (!cur) return;
        if (!block) { block = { lines: [], indented: true }; cur.blocks.push(block); }
        block.lines.push(text);
        if (!indented) block.indented = false;
      }
      function newBlock() { block = null; }

      for (var i = 0; i < ls.length; i++) {
        var L = ls[i];
        // Titill: stórt letur
        if (L.size >= bodySize * 1.45) {
          var next = ls[i + 1];
          if (cur && !cur.blocks.length && !cur.title) { cur.title = L.text; continue; }
          cur = { title: L.text, artist: '', blocks: [] };
          songs.push(cur); block = null; prevY = null;
          if (next && CREDIT.test(next.text)) {
            cur.credits = next.text; i++; prevY = next.y;
            // höfundalína getur náð yfir fleiri línur í smáu letri
            while (ls[i + 1] && ls[i + 1].size < bodySize - 1.5 && !ls[i + 1].chords) { i++; cur.credits += ' ' + ls[i].text; prevY = ls[i].y; }
          }
          else prevY = L.y;
          continue;
        }
        if (!cur) continue; // forsíða o.þ.h.
        if (CREDIT.test(L.text) && !cur.blocks.length && !cur.credits) { cur.credits = L.text; prevY = L.y; continue; }

        // Auð lína milli erinda: stórt bil
        if (prevY !== null && (prevY - L.y) > stepGuess * 1.6) newBlock();
        if (prevY === null) newBlock(); // ný síða = nýtt erindi
        var indented = L.x > baseX + bodySize * 0.8;

        if (L.chords) {
          var nx = ls[i + 1];
          var close = nx && !nx.chords && nx.size < bodySize * 1.45 && (L.y - nx.y) < stepGuess * 1.6 && !CREDIT.test(nx.text);
          if (close) { addLine(merge(L, nx), indented); prevY = nx.y; i++; continue; }
          addLine(chordOnly(L), indented);
        } else {
          addLine(L.text, indented);
        }
        prevY = L.y;
      }
    }

    return songs.filter(function (s) { return s.title && s.blocks.length; }).map(function (s) {
      var out = s.blocks.map(function (b) {
        var body = b.lines.join('\n');
        var allChords = b.lines.every(function (l) { return !l.replace(/\[[^\]]*\]/g, '').trim(); });
        return b.indented && !allChords ? '{soc}\n' + body + '\n{eoc}' : body;
      }).join('\n\n');
      return { title: s.title.replace(/\s+/g, ' ').trim(), artist: creditsToArtist(s.credits || ''), body: out };
    });
  }

  function creditsToArtist(c) {
    if (!c) return '';
    // Skipta eftir merkjum: „Song by:", „Lyrics by:", „Artists:" o.s.frv.
    var re = /(song by|music by|lyrics by|words by|artists?|höfundur lags og texta|höfundur lags|höfundur texta|flytjandi|flytjendur|lag og texti|lag|texti)\s*:/gi, m, marks = [];
    while ((m = re.exec(c))) marks.push({ k: m[1].toLowerCase(), s: m.index, e: re.lastIndex });
    var val = {};
    marks.forEach(function (mk, i) {
      var v = c.slice(mk.e, i + 1 < marks.length ? marks[i + 1].s : c.length).replace(/[,\s]+$/, '').replace(/\s*,\s*/g, ', ').trim();
      var k = /lags og texta|^lag og texti$/.test(mk.k) ? 'both' : /song|music|^lag$|höfundur lags/.test(mk.k) ? 'song' : /lyrics|words|text/.test(mk.k) ? 'words' : 'artists';
      if (v && !val[k]) val[k] = v;
    });
    if (val.both) return val.both.slice(0, 200);
    var parts = [];
    if (val.song && val.words && val.song === val.words) parts.push(val.song);
    else { if (val.song) parts.push('Lag: ' + val.song); if (val.words) parts.push('Texti: ' + val.words); }
    if (!parts.length && val.artists) parts.push(val.artists);
    return parts.join(' · ').slice(0, 200);
  }

  // ---------- Afritun af vefsíðu með merktum hljómum (gitargrip.is, guitarparty.com) ----------
  // root: DOM-hnútur (t.d. úr DOMParser á text/html úr klippiborðinu). Skilar {title, artist, body} eða null.
  function fromChordDom(root) {
    if (!root || !root.querySelector || !root.querySelector('[data-chord]')) return null;
    function lineText(el) {
      var s = '';
      (function walk(n) {
        if (n.nodeType === 3) { s += n.nodeValue; return; }
        if (n.nodeType !== 1) return;
        var ch = n.getAttribute('data-chord');
        if (ch) { s += '[' + ch.trim() + ']'; return; }   // sleppa földum hornklofum inni í hljómnum
        if (n.tagName === 'BR') { s += '\n'; return; }
        for (var c = n.firstChild; c; c = c.nextSibling) walk(c);
      })(el);
      // Óbrjótanleg bil við hljóm eru bara pláss fyrir hljóminn („Kiða   [E7]gil"), ekki hluti af textanum
      return s.replace(/\u00a0+(?=\[|\s*$)/g, '').replace(/\u00a0+/g, ' ').replace(/[ \t]+/g, ' ').replace(/^\s+|\s+$/g, '');
    }
    var out = [], inChorus = false;
    var cls = root.querySelectorAll('.chordline');
    if (cls.length) {
      Array.prototype.forEach.call(cls, function (div) {
        var empty = /\bempty\b/.test(div.className) || !div.textContent.replace(/\u00a0/g, ' ').trim();
        if (empty) { if (inChorus) { out.push('{eoc}'); inChorus = false; } out.push(''); return; }
        var ind = /margin-left\s*:\s*[1-9]/.test(div.getAttribute('style') || '');
        if (ind && !inChorus) { out.push('{soc}'); inChorus = true; }
        if (!ind && inChorus) { out.push('{eoc}'); inChorus = false; }
        out.push(lineText(div));
      });
      if (inChorus) out.push('{eoc}');
    } else {
      // Almennt: línur eftir blokk-einingum og <br>
      var BLOCK = /^(DIV|P|LI|PRE|H[1-6]|TR|SECTION|ARTICLE)$/;
      var cur = '';
      (function walk(n) {
        if (n.nodeType === 3) { cur += n.nodeValue; return; }
        if (n.nodeType !== 1 || /^(SCRIPT|STYLE)$/.test(n.tagName)) return;
        var ch = n.getAttribute('data-chord');
        if (ch) { cur += '[' + ch.trim() + ']'; return; }
        if (n.tagName === 'BR') { out.push(cur); cur = ''; return; }
        var blk = BLOCK.test(n.tagName);
        if (blk && cur.trim()) { out.push(cur); cur = ''; }
        for (var c = n.firstChild; c; c = c.nextSibling) walk(c);
        if (blk) { out.push(cur); cur = ''; }
      })(root);
      if (cur) out.push(cur);
      out = out.map(function (l) { return l.replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').trim(); });
    }
    var body = out.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\{soc\}\n\n/g, '{soc}\n').trim();
    var t = root.querySelector('h2.title, h1');
    var a = root.querySelector('ul.artists, .artists');
    return { title: t ? t.textContent.replace(/\s+/g, ' ').trim() : '', artist: a ? creditsToArtist(a.textContent.replace(/\s+/g, ' ')) : '', body: body };
  }

  // ---------- Íslenskt eða erlent? ----------
  // Greint út frá textanum: ð/þ eru séríslensk, æ og kommustafir algengir; ø/å/ä/ü/ñ benda annað.
  function detectLang(song) {
    var t = ((song && song.title) || '') + ' ' + ((song && song.body) || '');
    t = t.replace(/\[[^\]]*\]|\{[^}]*\}/g, ' ');
    var letters = (t.match(/[a-záðéíóúýþæöøåäüñç]/gi) || []).length;
    if (!letters) return 'is';
    var strong = (t.match(/[ðþ]/gi) || []).length;
    var weak = (t.match(/[áéíóúýæö]/gi) || []).length;
    var other = (t.match(/[øåäüñç]/gi) || []).length;
    var score = (strong * 3 + weak - other * 3) / letters;
    return score > 0.02 ? 'is' : 'erl';
  }
  function songLang(song) { return (song && (song.lang === 'is' || song.lang === 'erl')) ? song.lang : detectLang(song); }

  // Stafrófsröð og fyrirsagnarstafur (íslensk röð: A Á B D Ð E É … Þ Æ Ö)
  function titleKey(t) { return String(t || '').replace(/^[^0-9A-Za-zÀ-ÿĀ-ž]+/, ''); }
  function compareTitles(a, b) { return titleKey(a).localeCompare(titleKey(b), 'is', { sensitivity: 'base' }); }
  function initialOf(t) { var c = titleKey(t).charAt(0).toUpperCase(); return /[0-9]/.test(c) || !c ? '#' : c; }

  var api = {
    detectLang: detectLang,
    songLang: songLang,
    compareTitles: compareTitles,
    initialOf: initialOf,
    fromChordDom: fromChordDom,
    fromPdfPages: fromPdfPages,
    creditsToArtist: creditsToArtist,
    isChord: isChord,
    isChordLine: isChordLine,
    transposeChord: transposeChord,
    prefersFlats: prefersFlats,
    fromChordsOverLyrics: fromChordsOverLyrics,
    needsConversion: needsConversion,
    parseSong: parseSong,
    renderSong: renderSong,
    songKey: songKey,
    chordList: chordList,
    esc: esc
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GitarCore = api;
})(this);
