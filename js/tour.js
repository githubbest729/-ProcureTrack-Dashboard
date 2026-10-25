/* Spotlight onboarding tour (zero dependencies) */
(function (global) {
  'use strict';
  const STEPS = [
    { view: 'dashboard', sel: '.topbar', title: 'Search & quick actions', text: 'Press Ctrl+K to search every BOM item and issue. Use + New PO and + Log Issue (or the N and I keys) to capture work in seconds. ? opens the guide, the gear opens quick settings.' },
    { view: 'dashboard', sel: '.kpis', title: 'KPI cards', text: 'Budget vs committed spend, on-time procurement rate, open critical blockers, pending approvals and active projects. Thresholds come from Settings.' },
    { view: 'procurement', sel: '#proc-body [data-next]', fallback: '.tablewrap', title: 'Procurement pipeline & one-click stage advance', text: 'Each row is a BOM / PO item. Press Next to move it to the following stage (PR Raised, PO Issued, FAT, In Transit, Delivered). Every advance is written to the audit trail.' },
    { view: 'progress', sel: '.proj-card', title: 'Project progress sliders', text: 'Each project shows all 8 engineering phases in a wide card. Drag a slider or press +10% to update progress; hours and burn rate update with it.' },
    { view: 'issues', sel: '.tablewrap', title: 'Issue & NCR escalation', text: 'Log blockers against a project and PO. Open a row and set the status to Escalated to PM when schedule or cost is at risk.' },
    { view: 'vault', sel: '#meter', title: '3-year storage vault', text: 'The telemetry bar shows how IndexedDB space is split across stores. Back up to JSON regularly and archive completed fiscal years from here.' }
  ];
  let idx = 0, cfg = null, spot = null, tip = null, active = false;

  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  async function find(sel, fallback) {
    for (let i = 0; i < 20; i++) {
      const el = document.querySelector(sel);
      if (el) return el;
      await wait(100);
    }
    return (fallback && document.querySelector(fallback)) || null;
  }

  function build() {
    spot = document.createElement('div'); spot.className = 'tour-spot';
    tip = document.createElement('div'); tip.className = 'tour-tip'; tip.setAttribute('role', 'dialog'); tip.setAttribute('aria-live', 'polite');
    document.body.appendChild(spot); document.body.appendChild(tip);
  }

  function place(el) {
    const vw = window.innerWidth, vh = window.innerHeight;
    if (!el) { spot.style.cssText = 'left:50%;top:50%;width:0;height:0'; tip.style.left = Math.max(12, (vw - tip.offsetWidth) / 2) + 'px'; tip.style.top = Math.max(12, (vh - tip.offsetHeight) / 3) + 'px'; return; }
    const r = el.getBoundingClientRect(), pad = 6;
    spot.style.left = (r.left - pad) + 'px'; spot.style.top = (r.top - pad) + 'px';
    spot.style.width = (r.width + pad * 2) + 'px'; spot.style.height = (r.height + pad * 2) + 'px';
    const th = tip.offsetHeight, tw = tip.offsetWidth;
    let top = r.bottom + 14;
    if (top + th > vh - 8) top = r.top - th - 14;
    if (top < 8) top = Math.min(vh - th - 8, Math.max(8, r.top + 16));
    let left = Math.min(Math.max(12, r.left), vw - tw - 12);
    tip.style.top = top + 'px'; tip.style.left = left + 'px';
  }

  async function show(n) {
    idx = Math.max(0, Math.min(STEPS.length - 1, n));
    const st = STEPS[idx];
    if (cfg && cfg.navigate) await cfg.navigate(st.view);
    const el = await find(st.sel, st.fallback);
    if (el) { el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' }); }
    const last = idx === STEPS.length - 1;
    tip.innerHTML = `<div class="tour-n">Step ${idx + 1} of ${STEPS.length}</div><h3>${st.title}</h3><p>${st.text}</p>
      <div class="tour-btns"><button class="btn sm skip" data-a="skip">Skip</button><button class="btn sm" data-a="back" ${idx === 0 ? 'disabled' : ''}>Back</button><button class="btn sm primary" data-a="next">${last ? 'Finish' : 'Next'}</button></div>`;
    tip.querySelector('[data-a="skip"]').onclick = () => stop(false);
    tip.querySelector('[data-a="back"]').onclick = () => show(idx - 1);
    tip.querySelector('[data-a="next"]').onclick = () => (last ? stop(true) : show(idx + 1));
    await wait(60);
    place(el);
    tip.querySelector('[data-a="next"]').focus();
    tip._el = el;
  }

  function onKey(e) {
    if (!active) return;
    if (e.key === 'Escape') { e.preventDefault(); stop(false); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); if (idx < STEPS.length - 1) show(idx + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); if (idx > 0) show(idx - 1); }
  }
  function onResize() { if (active && tip) place(tip._el); }

  function stop(completed) {
    active = false;
    document.removeEventListener('keydown', onKey, true); window.removeEventListener('resize', onResize);
    if (spot) spot.remove(); if (tip) tip.remove(); spot = tip = null;
    if (cfg && cfg.onDone) cfg.onDone(completed);
  }

  function start(config) {
    if (active) stop(false);
    cfg = config || {}; active = true; build();
    document.addEventListener('keydown', onKey, true); window.addEventListener('resize', onResize);
    return show(0);
  }

  global.Tour = { start, stop, steps: STEPS };
})(window);
