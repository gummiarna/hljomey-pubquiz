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

  function fromChordsOverLyrics(text) {
    var lines = String(text).replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n');
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

  var api = {
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
