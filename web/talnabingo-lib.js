// Hljómey Bingó – sameiginlegt fyrir stjórnanda og síma
(function () {
  const LETTERS = ['B', 'I', 'N', 'G', 'O'];
  const COLORS = { B: '#ff6f59', I: '#2e86a6', N: '#e0a53a', G: '#2e9e74', O: '#9b6ee0' };
  const ORDER = ['line', 'B', 'I', 'N', 'G', 'O', 'X', 'full'];
  const NAME = { line: 'Ein lína', B: 'B-röðin', I: 'I-röðin', N: 'N-röðin', G: 'G-röðin', O: 'O-röðin', X: 'X', full: 'Allt spjaldið' };
  const HOW = {
    line: 'heila línu: lárétt, lóðrétt eða á ská',
    B: 'allan B-dálkinn', I: 'allan I-dálkinn', N: 'allan N-dálkinn', G: 'allan G-dálkinn', O: 'allan O-dálkinn',
    X: 'báðar skálínurnar (X)', full: 'allt spjaldið'
  };
  const idx = [0, 1, 2, 3, 4];
  const LINES = [];
  for (const r of idx) LINES.push(idx.map(c => r * 5 + c));
  for (const c of idx) LINES.push(idx.map(r => r * 5 + c));
  LINES.push(idx.map(r => r * 5 + r), idx.map(r => r * 5 + 4 - r));

  const letterOf = n => LETTERS[Math.min(4, Math.floor((n - 1) / 15))];
  const label = n => letterOf(n) + ' ' + n;

  // Reitir sem mynstrið nær yfir (til sýnis). „line“ sýnir miðjulínuna sem dæmi.
  function cells(stage) {
    if (stage === 'line') return LINES[2];
    const c = LETTERS.indexOf(stage);
    if (c >= 0) return idx.map(r => r * 5 + c);
    if (stage === 'X') return [...new Set([...LINES[10], ...LINES[11]])];
    return [...Array(25).keys()];
  }
  // Reitir sem uppfylla mynstrið á tilteknu spjaldi (ok = 25 sannleiksgildi)
  function winCells(ok, stage) {
    const s = new Set();
    const lines = stage === 'line' ? LINES : stage === 'X' ? [LINES[10], LINES[11]] : stage === 'full' ? [[...Array(25).keys()]]
      : [idx.map(r => r * 5 + LETTERS.indexOf(stage))];
    const all = stage === 'X' || stage === 'full' || LETTERS.includes(stage);
    if (all && !lines.every(l => l.every(i => ok[i]))) return s;
    lines.filter(l => l.every(i => ok[i])).forEach(l => l.forEach(i => s.add(i)));
    return s;
  }
  function patHtml(stage) {
    const h = new Set(cells(stage));
    return [...Array(25).keys()].map(i => `<span class="${h.has(i) ? 'h' : i === 12 ? 'f' : ''}"></span>`).join('');
  }
  window.TB = { LETTERS, COLORS, ORDER, NAME, HOW, LINES, letterOf, label, cells, winCells, patHtml };
})();
