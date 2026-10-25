/* Zero-dependency SVG charts (offline-safe) */
(function (global) {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const PALETTE = ['#00B4D8', '#48CAE4', '#90E0EF', '#F4A261', '#E76F51', '#2A9D8F', '#9B8AFB', '#FFD166'];
  const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = (n) => n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(0) + 'K' : String(Math.round(n));

  function tip(el) {
    let t = document.getElementById('chart-tip');
    if (!t) { t = document.createElement('div'); t.id = 'chart-tip'; t.className = 'chart-tip'; document.body.appendChild(t); }
    el.addEventListener('mousemove', (e) => { const txt = e.target.getAttribute && e.target.getAttribute('data-tip'); if (txt) { t.textContent = txt; t.style.display = 'block'; t.style.left = (e.clientX + 12) + 'px'; t.style.top = (e.clientY + 12) + 'px'; } else t.style.display = 'none'; });
    el.addEventListener('mouseleave', () => { t.style.display = 'none'; });
  }

  /* Horizontal funnel / bar chart: data = [{label,value,color?}] */
  function hbar(el, data, opts) {
    opts = opts || {}; const W = 560, rowH = 34, H = data.length * rowH + 10, lab = 130;
    const max = Math.max(1, ...data.map(d => d.value));
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.title || 'Bar chart')}" width="100%">`;
    data.forEach((d, i) => {
      const y = i * rowH + 5, w = (W - lab - 60) * d.value / max;
      s += `<text x="0" y="${y + 18}" class="ch-lab">${esc(d.label)}</text>`;
      s += `<rect x="${lab}" y="${y + 4}" width="${Math.max(2, w)}" height="20" rx="4" fill="${d.color || PALETTE[i % PALETTE.length]}" data-tip="${esc(d.label)}: ${opts.money ? 'AED ' + d.value.toLocaleString() : d.value}"/>`;
      s += `<text x="${lab + Math.max(2, w) + 6}" y="${y + 19}" class="ch-val">${opts.money ? fmt(d.value) : d.value}</text>`;
    });
    el.innerHTML = s + '</svg>'; tip(el);
  }

  /* Donut: data=[{label,value}] */
  function donut(el, data, opts) {
    opts = opts || {}; const total = data.reduce((a, b) => a + b.value, 0) || 1, R = 70, r = 42, cx = 90, cy = 90;
    let a0 = -Math.PI / 2, s = `<svg viewBox="0 0 400 180" width="100%" role="img" aria-label="${esc(opts.title || 'Donut chart')}">`;
    data.forEach((d, i) => {
      const a1 = a0 + d.value / total * Math.PI * 2 - 0.0001, large = a1 - a0 > Math.PI ? 1 : 0;
      const p = (rad, a) => [cx + rad * Math.cos(a), cy + rad * Math.sin(a)];
      const [x1, y1] = p(R, a0), [x2, y2] = p(R, a1), [x3, y3] = p(r, a1), [x4, y4] = p(r, a0);
      if (d.value > 0) s += `<path d="M${x1} ${y1} A${R} ${R} 0 ${large} 1 ${x2} ${y2} L${x3} ${y3} A${r} ${r} 0 ${large} 0 ${x4} ${y4}Z" fill="${PALETTE[i % PALETTE.length]}" data-tip="${esc(d.label)}: AED ${Math.round(d.value).toLocaleString()} (${(d.value / total * 100).toFixed(1)}%)"/>`;
      a0 += d.value / total * Math.PI * 2;
      s += `<rect x="200" y="${14 + i * 24}" width="12" height="12" rx="2" fill="${PALETTE[i % PALETTE.length]}"/><text x="220" y="${24 + i * 24}" class="ch-lab">${esc(d.label)} (${(d.value / total * 100).toFixed(0)}%)</text>`;
    });
    s += `<text x="${cx}" y="${cy - 2}" text-anchor="middle" class="ch-big">${fmt(total)}</text><text x="${cx}" y="${cy + 14}" text-anchor="middle" class="ch-lab">AED</text>`;
    el.innerHTML = s + '</svg>'; tip(el);
  }

  /* Planned vs actual bars; project title on its own line above the bars */
  function health(el, data) {
    const W = 560, rowH = 62, H = data.length * rowH + 22;
    let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Project schedule health">`;
    data.forEach((d, i) => {
      const y = i * rowH + 4, bw = W - 54;
      const col = d.actual >= d.planned - 5 ? '#2A9D8F' : d.actual >= d.planned - 15 ? '#F4A261' : '#E76F51';
      s += `<text x="0" y="${y + 12}" class="ch-name">${esc(d.label)}</text>`;
      s += `<rect x="0" y="${y + 20}" width="${bw}" height="10" rx="5" class="ch-track"/>`;
      s += `<rect x="0" y="${y + 20}" width="${Math.max(2, bw * d.planned / 100)}" height="10" rx="5" class="ch-plan" data-tip="${esc(d.label)} planned ${d.planned}%"/>`;
      s += `<rect x="0" y="${y + 35}" width="${bw}" height="10" rx="5" class="ch-track"/>`;
      s += `<rect x="0" y="${y + 35}" width="${Math.max(2, bw * d.actual / 100)}" height="10" rx="5" fill="${col}" data-tip="${esc(d.label)} actual ${d.actual}%"/>`;
      s += `<text x="${bw + 6}" y="${y + 27}" class="ch-lab">${d.planned}%</text><text x="${bw + 6}" y="${y + 43}" class="ch-val">${d.actual}%</text>`;
    });
    s += `<text x="0" y="${H - 4}" class="ch-lab">Top bar: planned  |  Bottom bar: actual</text>`;
    el.innerHTML = s + '</svg>'; tip(el);
  }

  /* Multi-segment stacked telemetry bar: segs=[{label,value,color}] */
  function stack(el, segs) {
    const tot = segs.reduce((a, b) => a + b.value, 0) || 1;
    el.innerHTML = '<div class="stackbar" role="img" aria-label="Storage distribution by store">' + segs.map(g =>
      `<span style="flex:${Math.max(g.value, tot * 0.006)};background:${g.color}" data-tip="${esc(g.label)}"></span>`).join('') + '</div>';
    tip(el);
  }

  /* Simple single-value gauge */
  function meter(el, pct) {
    const p = Math.min(100, Math.max(0, pct)), w = 300;
    el.innerHTML = `<svg viewBox="0 0 ${w} 22" width="100%" role="img" aria-label="Storage used ${p.toFixed(2)} percent"><rect width="${w}" height="14" y="4" rx="7" fill="rgba(128,128,128,.25)"/><rect width="${Math.max(3, w * p / 100)}" height="14" y="4" rx="7" fill="${p > 80 ? '#E76F51' : '#00B4D8'}"/></svg>`;
  }

  global.Charts = { hbar, donut, health, stack, meter, PALETTE };
})(window);
