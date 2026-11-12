// Hvaða ár? Bingó – sameiginlegt fyrir stjórnanda og síma
(function () {
  const CATS = {
    aratugur:  { name: 'Áratugur',          short: 'Áratugur',  color: '#ff6f59', q: 'Á hvaða áratug kom lagið út?' },
    ar:        { name: 'Árið',              short: 'Árið',      color: '#e0a53a', q: 'Hvaða ár kom lagið út?' },
    flytjandi: { name: 'Flytjandi',         short: 'Flytjandi', color: '#2e86a6', q: 'Hver flytur lagið?' },
    heiti:     { name: 'Heiti lagsins',     short: 'Lagið',     color: '#2e9e74', q: 'Hvað heitir lagið?' },
    fyrir2000: { name: 'Fyrir eða eftir 2000', short: '2000',   color: '#9b6ee0', q: 'Kom lagið út fyrir eða eftir árið 2000?' },
    islenskt:  { name: 'Íslenskt',          short: 'Íslenskt',  color: '#d55181', q: 'Íslenskt lag! Hver flytur það?' },
  };
  const STAGES = ['line', 'X', 'full'];
  const STAGE_NAME = { line: 'Ein lína', X: 'X', full: 'Allt spjaldið' };
  const STAGE_HOW = { line: 'heila línu: lárétt, lóðrétt eða á ská', X: 'báðar skálínurnar (X)', full: 'allt spjaldið' };
  const LETTERS = ['A', 'B', 'C', 'D'];
  const idx = [0, 1, 2, 3, 4];
  const LINES = [];
  for (const r of idx) LINES.push(idx.map(c => r * 5 + c));
  for (const c of idx) LINES.push(idx.map(r => r * 5 + c));
  LINES.push(idx.map(r => r * 5 + r), idx.map(r => r * 5 + 4 - r));
  function winCells(ok, stage) {
    const s = new Set();
    if (stage === 'full') { if (ok.every(Boolean)) ok.forEach((_, i) => s.add(i)); return s; }
    if (stage === 'X') { const l = [...LINES[10], ...LINES[11]]; if (l.every(i => ok[i])) l.forEach(i => s.add(i)); return s; }
    LINES.filter(l => l.every(i => ok[i])).forEach(l => l.forEach(i => s.add(i)));
    return s;
  }
  function patHtml(stage) {
    const h = new Set(stage === 'line' ? LINES[2] : stage === 'X' ? [...LINES[10], ...LINES[11]] : [...Array(25).keys()]);
    return [...Array(25).keys()].map(i => `<span class="${h.has(i) ? 'h' : i === 12 ? 'f' : ''}"></span>`).join('');
  }
  window.HB = { CATS, STAGES, STAGE_NAME, STAGE_HOW, LETTERS, LINES, winCells, patHtml };
})();
