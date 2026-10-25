/* ProcureTrack Dashboard - main application */
(function () {
  'use strict';
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const today = () => new Date().toISOString().slice(0, 10);

  const STATUSES = ['Draft BOM', 'PR Raised', 'PO Issued', 'In Manufacturing', 'Ready for FAT', 'In Transit', 'Customs Hold', 'Delivered to Site', 'Installed'];
  const CATS = ['Wonderware Licenses', 'PLCs & I/O', 'HMI/Servers', 'OPC/Modbus Gateways', 'Panels & Cabling', 'Networking', 'UPS & Power'];
  const INCO = ['DDP Dubai', 'CIF Jebel Ali', 'EXW', 'FOB', 'DAP Site'];
  const ISS_CATS = ['Supply Chain Delay', 'Technical/Spec Mismatch', 'Quality/NCR', 'Customs/Logistics', 'Site Readiness', 'Budget Blocker'];
  const SEV = ['Critical', 'High', 'Medium', 'Low'];
  const ISS_ST = ['Open', 'Escalated to PM', 'Waiting on Vendor', 'Resolved'];
  const CUR = { AED: 1, USD: 0.2723, EUR: 0.25, GBP: 0.215 }; // per 1 AED (indicative; AED pegged to USD at 3.6725)
  const DONE = ['Delivered to Site', 'Installed'];

  const state = { view: 'dashboard', projects: [], vendors: [], cur: 'AED', page: { proc: 0, audit: 0, iss: 0 }, pageSize: 50, deferredPrompt: null };

  const DEFAULTS = { engineerName: 'SCADA Lead Engineer', empId: '', office: 'Dubai, U.A.E.', unit: 'Al Gurg Automation & Controls', signoff: 'SCADA Engineer', theme: 'dark', density: 'comfortable', warnDays: 7, burnPct: 85, currency: 'AED', notify: false, autoAudit: true, landing: 'dashboard', purposeHidden: false, tourDone: false, checks: {} };
  const prefs = Object.assign({}, DEFAULTS, { checks: {} });

  const STAGE_FLOW = ['Draft BOM', 'PR Raised', 'PO Issued', 'In Manufacturing', 'Ready for FAT', 'In Transit', 'Delivered to Site', 'Installed'];
  const nextStage = (st) => (st === 'Customs Hold' ? 'Delivered to Site' : STAGE_FLOW[STAGE_FLOW.indexOf(st) + 1] || null);

  async function loadPrefs() {
    Object.assign(prefs, DEFAULTS, { checks: {} });
    (await DB.getAll('settings')).forEach(r => { if (r.key === 'fx') Object.assign(CUR, r.value); else prefs[r.key] = r.value; });
    state.cur = CUR[prefs.currency] ? prefs.currency : 'AED';
    DB.setAuditEnabled(prefs.autoAudit); DB.setUser(prefs.engineerName);
    applyAppearance(); updateBadge();
  }
  async function setPref(k, v) { prefs[k] = v; await DB.setSetting(k, v); }
  function applyAppearance() {
    document.documentElement.setAttribute('data-theme', prefs.theme);
    document.body.classList.toggle('compact', prefs.density === 'compact');
    try { localStorage.setItem('pt-theme', prefs.theme); } catch (e) {}
  }
  function updateBadge() { const b = document.querySelector('.badge.company'); if (b) b.textContent = prefs.unit + ' • ' + prefs.engineerName; }

  const moneyShort = (aed) => { const v = (aed || 0) * CUR[state.cur]; const a = Math.abs(v); return state.cur + ' ' + (a >= 1e6 ? (v / 1e6).toFixed(2) + 'M' : a >= 1e3 ? (v / 1e3).toFixed(0) + 'K' : Math.round(v)); };
  const money = (aed) => (state.cur === 'AED' ? 'AED ' : state.cur + ' ') + Math.round((aed || 0) * CUR[state.cur]).toLocaleString();
  const projName = (id) => { const p = state.projects.find(x => x.id === id); return p ? p.projectCode : '-'; };
  const vendName = (id) => { const v = state.vendors.find(x => x.id === id); return v ? v.name : '-'; };
  const isDelayed = (i) => (!DONE.includes(i.status) && i.expectedDelivery && i.expectedDelivery < today()) || !!(i.actualDelivery && i.expectedDelivery && i.actualDelivery > i.expectedDelivery);
  const isLate = (i) => isDelayed(i) && !DONE.includes(i.status);
  const isSoon = (i) => { if (DONE.includes(i.status) || !i.expectedDelivery || i.expectedDelivery < today()) return false; return (new Date(i.expectedDelivery) - new Date(today())) / 864e5 <= prefs.warnDays; };
  const stTag = (s) => { const c = DONE.includes(s) ? 'ok' : s === 'Customs Hold' ? 'bad' : ['In Transit', 'Ready for FAT'].includes(s) ? 'info' : ['Draft BOM', 'PR Raised'].includes(s) ? 'warn' : ''; return `<span class="tag ${c}">${esc(s)}</span>`; };
  const sevTag = (s) => `<span class="tag ${s === 'Critical' ? 'bad' : s === 'High' ? 'warn' : s === 'Medium' ? 'info' : ''}">${esc(s)}</span>`;
  const opts = (arr, sel, blank) => (blank ? `<option value="">${blank}</option>` : '') + arr.map(a => { const v = typeof a === 'object' ? a.v : a, l = typeof a === 'object' ? a.l : a; return `<option value="${esc(v)}"${v === sel ? ' selected' : ''}>${esc(l)}</option>`; }).join('');
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  function toast(msg) { const n = document.querySelectorAll('.toast').length; const t = document.createElement('div'); t.className = 'toast'; t.style.bottom = (20 + n * 52) + 'px'; t.setAttribute('role', 'status'); t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 3200); }
  function download(name, text, type) { const b = new Blob([text], { type: type || 'text/plain' }); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }

  /* ---------- Modal ---------- */
  function modal(title, bodyHTML, onSave, extraBtn, o) {
    const bg = $('#modal'); $('#modal-title').textContent = title; $('#modal-body').innerHTML = bodyHTML;
    bg.classList.add('open');
    $('#modal-save').classList.toggle('hidden', !!(o && o.hideSave));
    const close = () => bg.classList.remove('open');
    $('#modal-cancel').onclick = close;
    $('#modal-del').classList.toggle('hidden', !extraBtn); $('#modal-del').onclick = () => { if (extraBtn && confirm('Delete this record permanently?')) { extraBtn(); close(); } };
    $('#modal-form').onsubmit = async (e) => { e.preventDefault(); const fd = Object.fromEntries(new FormData(e.target).entries()); try { await onSave(fd); close(); } catch (err) { toast('Error: ' + err.message); } };
    const f = $('#modal-body input,#modal-body select'); if (f) f.focus();
  }
  const fld = (label, name, val, type, extra) => `<label class="field">${label}<input name="${name}" type="${type || 'text'}" value="${esc(val)}" ${extra || ''}></label>`;
  const sel = (label, name, arr, val, blank) => `<label class="field">${label}<select name="${name}">${opts(arr, val, blank)}</select></label>`;

  /* ---------- Data helpers ---------- */
  async function refs() { state.projects = await DB.getAll('projects'); state.vendors = await DB.getAll('vendors'); }
  const projOpts = () => state.projects.map(p => ({ v: p.id, l: p.projectCode + ' - ' + p.name }));
  const vendOpts = () => state.vendors.map(v => ({ v: v.id, l: v.name }));

  /* ---------- Views ---------- */
  const views = {};

  views.dashboard = async (el) => {
    const items = await DB.getAll('procurement_items'), issues = await DB.getAll('issues'), ms = await DB.getAll('milestones');
    const active = state.projects.filter(p => p.status === 'Active');
    const budget = state.projects.reduce((a, p) => a + (p.budget || 0), 0);
    const committed = items.filter(i => i.poNumber).reduce((a, i) => a + (i.totalCost || 0), 0);
    const delivered = items.filter(i => DONE.includes(i.status));
    const onTime = delivered.filter(i => !i.actualDelivery || !i.expectedDelivery || i.actualDelivery <= i.expectedDelivery).length;
    const otr = delivered.length ? Math.round(onTime / delivered.length * 100) : 100;
    const critical = issues.filter(i => i.severity === 'Critical' && i.status !== 'Resolved').length;
    const pending = items.filter(i => ['PR Raised', 'Draft BOM'].includes(i.status) || (i.status === 'PO Issued' && !i.poNumber)).length;
    const delayed = items.filter(isDelayed).length;
    el.innerHTML = `${purposeHTML()}<h1>Executive Command Center</h1>
    <div class="grid kpis">
      <div class="card kpi"><div class="l">Total Project Budget</div><div class="v" title="${money(budget)}">${moneyShort(budget)}</div><div class="s">Committed: ${moneyShort(committed)} (${budget ? Math.round(committed / budget * 100) : 0}%)</div></div>
      <div class="card kpi ${otr >= 85 ? 'ok' : 'bad'}"><div class="l">On-Time Procurement Rate</div><div class="v">${otr}%</div><div class="s">${delayed} item(s) delayed now</div></div>
      <div class="card kpi ${critical ? 'bad' : 'ok'}"><div class="l">Open Critical Blockers</div><div class="v">${critical}</div><div class="s">${issues.filter(i => i.status !== 'Resolved').length} open issues total</div></div>
      <div class="card kpi"><div class="l">Pending PR/PO Approvals</div><div class="v">${pending}</div><div class="s">Draft BOM / PR Raised</div></div>
      <div class="card kpi"><div class="l">Active SCADA Projects</div><div class="v">${active.length}</div><div class="s">${state.projects.length} total</div></div>
    </div>
    <div class="grid cols2" style="margin-top:14px">
      <div class="card"><h2>Procurement Pipeline by Stage</h2><div id="ch-pipe"></div></div>
      <div class="card"><h2>Spend by Category</h2><div id="ch-cat"></div></div>
      <div class="card"><h2>Project Schedule Health</h2><div id="ch-health"></div></div>
      <div class="card"><h2>Attention Needed</h2><div id="attn"></div></div>
    </div>`;
    const stage = [['BOM', ['Draft BOM']], ['PR', ['PR Raised']], ['PO', ['PO Issued', 'In Manufacturing']], ['FAT', ['Ready for FAT']], ['Shipped', ['In Transit']], ['Customs', ['Customs Hold']], ['Delivered', DONE]];
    Charts.hbar($('#ch-pipe'), stage.map(([l, ss]) => ({ label: l, value: items.filter(i => ss.includes(i.status)).length })), { title: 'Pipeline' });
    const byCat = {}; items.forEach(i => { byCat[i.category] = (byCat[i.category] || 0) + (i.totalCost || 0) * CUR[state.cur]; });
    Charts.donut($('#ch-cat'), Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value })), { title: 'Spend by category' });
    Charts.health($('#ch-health'), active.map(p => {
      const dur = (new Date(p.endDate) - new Date(p.startDate)) || 1, planned = Math.max(0, Math.min(100, Math.round((Date.now() - new Date(p.startDate)) / dur * 100)));
      return { label: p.projectCode + ' \u2013 ' + p.name, planned, actual: p.progress || 0 };
    }));
    const att = [];
    issues.filter(i => i.status !== 'Resolved' && i.severity === 'Critical').forEach(i => att.push(attnCard('bad', 'Critical issue', i.title, projName(i.projectId) + ' • ' + i.status, 's:' + i.id)));
    items.filter(isLate).slice(0, 4).forEach(i => att.push(attnCard('bad', 'Delayed', i.itemTag + ' – ' + i.description, projName(i.projectId) + ' • ' + i.status + ' • due ' + i.expectedDelivery, 'i:' + i.id)));
    issues.filter(i => i.status !== 'Resolved' && i.severity === 'High').slice(0, 2).forEach(i => att.push(attnCard('warn', 'High issue', i.title, projName(i.projectId) + ' • ' + i.status, 's:' + i.id)));
    items.filter(isSoon).slice(0, 3).forEach(i => att.push(attnCard('warn', 'Due soon', i.itemTag + ' – ' + i.description, 'Expected ' + i.expectedDelivery + ' • ' + i.status, 'i:' + i.id)));
    state.projects.filter(p => p.status === 'Active' && p.budget).forEach(p => {
      const c = items.filter(i => i.projectId === p.id && i.poNumber).reduce((a, i) => a + (i.totalCost || 0), 0), pct = Math.round(c / p.budget * 100);
      if (pct >= prefs.burnPct) att.push(attnCard('warn', 'Budget burn ' + pct + '%', p.projectCode + ' – ' + p.name, money(c) + ' committed of ' + money(p.budget), 'p:' + p.id));
    });
    $('#attn').innerHTML = att.slice(0, 8).join('') || '<span class="muted">Nothing urgent. All clear.</span>';
    $$('[data-inspect]', el).forEach(b => b.onclick = () => inspect(b.dataset.inspect));
    bindPurpose(el);
  };

  /* Procurement */
  const pf = { q: '', project: '', status: '', category: '', delayed: false, stages: null };
  views.procurement = async (el) => {
    el.innerHTML = `<h1>Procurement &amp; BOM Pipeline</h1>${pf.stages ? `<div class="toolbar"><span class="tag info">Stage filter: ${esc(pf.stages.join(' / '))}</span><button class="btn sm" id="clr-stage">Clear</button></div>` : ''}
    <div class="toolbar">
      <input id="pf-q" type="search" placeholder="Search tag, description, PO, PR..." value="${esc(pf.q)}" aria-label="Search procurement">
      <select id="pf-project">${opts(projOpts(), pf.project, 'All projects')}</select>
      <select id="pf-status">${opts(STATUSES, pf.status, 'All statuses')}</select>
      <select id="pf-cat">${opts(CATS, pf.category, 'All categories')}</select>
      <label><input type="checkbox" id="pf-delay" ${pf.delayed ? 'checked' : ''}> Delayed only</label>
      <select id="cur" aria-label="Display currency">${opts(Object.keys(CUR), state.cur)}</select>
      <span style="flex:1"></span><button class="btn primary" id="add-item">+ New BOM / PO</button><button class="btn" id="csv-proc">Export CSV</button>
    </div>
    <div class="tablewrap"><table><thead><tr><th>Tag</th><th>Project</th><th>Description</th><th>Category</th><th>PR#</th><th>PO#</th><th>Vendor</th><th>Qty</th><th>Unit</th><th>Total</th><th>Incoterms</th><th>Lead (wk)</th><th>FAT</th><th>Expected</th><th>Actual</th><th>Status</th><th></th></tr></thead><tbody id="proc-body"></tbody></table><div class="pager" id="proc-pager"></div></div>`;
    const reload = () => { state.page.proc = 0; loadProc(); };
    $('#pf-q').oninput = debounce((e) => { pf.q = e.target.value; reload(); }, 200);
    $('#pf-project').onchange = (e) => { pf.project = e.target.value; reload(); };
    $('#pf-status').onchange = (e) => { pf.status = e.target.value; if (pf.stages) { pf.stages = null; render(); } else reload(); };
    if ($('#clr-stage')) $('#clr-stage').onclick = () => { pf.stages = null; render(); };
    $('#pf-cat').onchange = (e) => { pf.category = e.target.value; reload(); };
    $('#pf-delay').onchange = (e) => { pf.delayed = e.target.checked; reload(); };
    $('#cur').onchange = (e) => { state.cur = e.target.value; setPref('currency', state.cur); loadProc(); };
    $('#add-item').onclick = () => itemForm();
    $('#csv-proc').onclick = () => exportCSV('bom');
    loadProc();
  };
  function procFilter() {
    const q = pf.q.trim().toLowerCase();
    return (i) => (!pf.project || i.projectId === pf.project) && (!pf.status || i.status === pf.status) && (!pf.stages || pf.stages.includes(i.status)) && (!pf.category || i.category === pf.category) && (!pf.delayed || isDelayed(i)) &&
      (!q || (i.itemTag + ' ' + i.description + ' ' + i.poNumber + ' ' + i.prNumber).toLowerCase().includes(q));
  }
  async function loadProc() {
    const { rows, total } = await DB.query('procurement_items', { index: 'expectedDelivery', filter: procFilter(), offset: state.page.proc * state.pageSize, limit: state.pageSize });
    const body = $('#proc-body'); if (!body) return;
    body.innerHTML = rows.map(i => `<tr class="${isDelayed(i) ? 'delayed' : ''}"><td>${esc(i.itemTag)}</td><td>${esc(projName(i.projectId))}</td><td title="${esc(i.description)}">${esc(i.description)}</td><td>${esc(i.category)}</td><td>${esc(i.prNumber)}</td><td>${esc(i.poNumber)}</td><td>${esc(vendName(i.vendorId))}</td><td>${i.quantity}</td><td>${money(i.unitCost)}</td><td>${money(i.totalCost)}</td><td>${esc(i.incoterms)}</td><td>${esc(i.leadTimeWeeks)}</td><td>${esc(i.fatDate)}</td><td>${esc(i.expectedDelivery)}</td><td>${esc(i.actualDelivery)}</td><td>${stTag(i.status)}</td><td class="acts"><button class="btn sm" data-edit="${i.id}">Edit</button>${nextBtn(i)}</td></tr>`).join('') || '<tr><td colspan="17" class="muted">No items match.</td></tr>';
    $$('[data-edit]', body).forEach(b => b.onclick = async () => itemForm(await DB.get('procurement_items', b.dataset.edit)));
    $$('[data-next]', body).forEach(b => b.onclick = () => advanceItem(b.dataset.next));
    pager('#proc-pager', total, state.page.proc, (p) => { state.page.proc = p; loadProc(); });
  }
  function pager(sel, total, page, go) {
    const pages = Math.max(1, Math.ceil(total / state.pageSize)), el = $(sel); if (!el) return;
    el.innerHTML = `<span>${total.toLocaleString()} record(s)</span><button class="btn sm" ${page <= 0 ? 'disabled' : ''} id="pg-prev">Prev</button><span>Page ${page + 1} / ${pages}</span><button class="btn sm" ${page + 1 >= pages ? 'disabled' : ''} id="pg-next">Next</button>`;
    $('#pg-prev', el).onclick = () => go(page - 1); $('#pg-next', el).onclick = () => go(page + 1);
  }
  function itemForm(it) {
    const isNew = !it; it = it || { quantity: 1, unitCost: 0, currency: 'AED', incoterms: 'DDP Dubai', status: 'Draft BOM', category: CATS[0], leadTimeWeeks: 4, projectId: state.projects[0] && state.projects[0].id, vendorId: state.vendors[0] && state.vendors[0].id };
    modal(isNew ? 'New BOM / PO Item' : 'Edit ' + it.itemTag, `
      ${fld('Item / Tag ID', 'itemTag', it.itemTag, 'text', 'required')}${sel('Project', 'projectId', projOpts(), it.projectId)}
      <label class="field wide">Equipment Description<input name="description" value="${esc(it.description)}" required></label>
      ${sel('Category', 'category', CATS, it.category)}${sel('Vendor', 'vendorId', vendOpts(), it.vendorId)}
      ${fld('PR #', 'prNumber', it.prNumber)}${fld('PO #', 'poNumber', it.poNumber)}
      ${fld('Quantity', 'quantity', it.quantity, 'number', 'min="0" step="1" required')}${fld('Unit Cost (AED)', 'unitCost', it.unitCost, 'number', 'min="0" step="0.01" required')}
      ${sel('Incoterms', 'incoterms', INCO, it.incoterms)}${fld('Lead Time (weeks)', 'leadTimeWeeks', it.leadTimeWeeks, 'number', 'min="0"')}
      ${fld('FAT Date', 'fatDate', it.fatDate, 'date')}${fld('Expected Delivery', 'expectedDelivery', it.expectedDelivery, 'date')}
      ${fld('Actual Delivery', 'actualDelivery', it.actualDelivery, 'date')}${sel('Stage / Status', 'status', STATUSES, it.status)}
      <label class="field wide">Expediting Notes<textarea name="notes" rows="2">${esc(it.notes)}</textarea></label>`,
      async (f) => {
        const rec = Object.assign({}, it, f, { quantity: +f.quantity, unitCost: +f.unitCost, leadTimeWeeks: +f.leadTimeWeeks });
        rec.totalCost = rec.quantity * rec.unitCost;
        rec.fiscalYear = DB.fiscalYear(rec.expectedDelivery || undefined);
        await DB.put('procurement_items', rec); toast('Saved ' + rec.itemTag); loadProc(); if (state.view === 'dashboard') render();
      }, isNew ? null : async () => { await DB.remove('procurement_items', it.id); loadProc(); });
  }

  /* Progress */
  async function setMilestonePercent(id, pct) {
    const m = await DB.get('milestones', id); pct = Math.max(0, Math.min(100, Math.round(pct)));
    const before = m.percent; if (before === pct) return;
    m.percent = pct; m.status = pct >= 100 ? 'Completed' : pct > 0 ? (m.status === 'Blocked' ? 'Blocked' : 'In Progress') : 'Not Started';
    await DB.put('milestones', m, { silent: true });
    await DB.audit('PROGRESS', 'milestones', id, m.phase + ': ' + before + '% -> ' + pct + '%');
    const all = await DB.getByIndex('milestones', 'projectId', m.projectId); const p = await DB.get('projects', m.projectId);
    p.progress = Math.round(all.reduce((a, x) => a + x.percent, 0) / all.length); await DB.put('projects', p, { silent: true });
    await refs();
    const main = $('main'), st = main.scrollTop; await render(); main.scrollTop = st;
  }
  views.progress = async (el) => {
    const ms = await DB.getAll('milestones'), items = await DB.getAll('procurement_items');
    el.innerHTML = '<div class="page-head"><h1>Project Progress &amp; Schedule Tracker</h1><button class="btn primary" id="add-proj">+ New Project</button></div><div class="grid proj-grid" id="proj-grid"></div>';
    $('#proj-grid').innerHTML = state.projects.map(p => {
      const rows = ms.filter(m => m.projectId === p.id).sort((a, b) => a.order - b.order);
      const spend = items.filter(i => i.projectId === p.id && i.poNumber).reduce((a, i) => a + i.totalCost, 0) + rows.reduce((a, m) => a + (m.spend || 0), 0);
      const hb = rows.reduce((a, m) => a + m.hoursBudget, 0), ha = rows.reduce((a, m) => a + m.hoursActual, 0);
      const burn = p.budget ? Math.round(spend / p.budget * 100) : 0;
      return `<div class="card proj-card"><div style="display:flex;justify-content:space-between;gap:8px"><div><strong>${esc(p.name)}</strong><div class="muted">${esc(p.projectCode)} &bull; ${esc(p.client)} &bull; PM ${esc(p.manager)}</div></div><button class="btn sm" data-proj="${p.id}">Edit</button></div>
      <div class="progress big" aria-label="Progress ${p.progress}%"><i style="width:${p.progress}%"></i></div>
      <div class="muted">${p.progress}% overall &bull; ${ha} / ${hb} hrs &bull; Burn ${money(spend)} of ${money(p.budget)} <span class="tag ${burn >= prefs.burnPct ? 'bad' : 'ok'}">${burn}%</span></div>
      <div class="muted">Client comms: ${esc(p.clientComms)}</div>
      <div>${rows.map(m => `<div class="phase2"><div class="ph-top"><span class="ph-name">${esc(m.phase)}</span>${stTagM(m.status)}<span class="muted ph-hrs">${m.hoursActual} / ${m.hoursBudget} hrs</span></div>
        <div class="progress big"><i style="width:${m.percent}%"></i></div>
        <div class="ph-ctl"><input type="range" min="0" max="100" step="5" value="${m.percent}" data-slide="${m.id}" aria-label="${esc(m.phase)} percent complete"><strong class="ph-pct">${m.percent}%</strong><button class="btn sm" data-inc="${m.id}" ${m.percent >= 100 ? 'disabled' : ''}>+10%</button><button class="btn sm" data-ms="${m.id}">Edit</button></div></div>`).join('')}</div></div>`;
    }).join('');
    $$('[data-slide]').forEach(r => { r.oninput = () => { r.parentElement.querySelector('.ph-pct').textContent = r.value + '%'; }; r.onchange = () => setMilestonePercent(r.dataset.slide, +r.value); });
    $$('[data-inc]').forEach(b => b.onclick = async () => { const m = await DB.get('milestones', b.dataset.inc); setMilestonePercent(m.id, m.percent + 10); });
    $$('[data-ms]').forEach(b => b.onclick = async () => msForm(await DB.get('milestones', b.dataset.ms)));
    $$('[data-proj]').forEach(b => b.onclick = async () => projForm(await DB.get('projects', b.dataset.proj)));
    $('#add-proj').onclick = () => projForm();
  };
  const stTagM = (s) => `<span class="tag ${s === 'Completed' ? 'ok' : s === 'In Progress' ? 'info' : ''}">${esc(s)}</span>`;
  function msForm(m) {
    modal(m.phase, `${fld('% Complete', 'percent', m.percent, 'number', 'min="0" max="100" required')}${sel('Status', 'status', ['Not Started', 'In Progress', 'Blocked', 'Completed'], m.status)}
      ${fld('Assigned Engineer', 'engineer', m.engineer)}${fld('Due Date', 'dueDate', m.dueDate, 'date')}${fld('Budgeted Hours', 'hoursBudget', m.hoursBudget, 'number', 'min="0"')}${fld('Actual Hours', 'hoursActual', m.hoursActual, 'number', 'min="0"')}${fld('Spend to date (AED)', 'spend', m.spend, 'number', 'min="0"')}`,
      async (f) => {
        const rec = Object.assign({}, m, f, { percent: +f.percent, hoursBudget: +f.hoursBudget, hoursActual: +f.hoursActual, spend: +f.spend });
        if (rec.percent >= 100) rec.status = 'Completed'; else if (rec.percent > 0 && rec.status === 'Not Started') rec.status = 'In Progress';
        await DB.put('milestones', rec);
        const all = (await DB.getByIndex('milestones', 'projectId', m.projectId)); const p = await DB.get('projects', m.projectId);
        p.progress = Math.round(all.reduce((a, x) => a + x.percent, 0) / all.length); await DB.put('projects', p, { silent: true });
        await refs(); render(); toast('Milestone updated');
      });
  }
  function projForm(p) {
    const isNew = !p; p = p || { status: 'Active', budget: 0, progress: 0, engineer: 'SCADA Engineer', hoursBudget: 0, hoursActual: 0 };
    modal(isNew ? 'New Project' : 'Edit ' + p.projectCode, `${fld('Project Code', 'projectCode', p.projectCode, 'text', 'required')}${fld('Client', 'client', p.client)}
      <label class="field wide">Project Name<input name="name" value="${esc(p.name)}" required></label>
      ${fld('Project Manager', 'manager', p.manager)}${sel('Status', 'status', ['Active', 'On Hold', 'Completed', 'Cancelled'], p.status)}
      ${fld('Budget (AED)', 'budget', p.budget, 'number', 'min="0"')}${fld('Hours Budget', 'hoursBudget', p.hoursBudget, 'number', 'min="0"')}
      ${fld('Start', 'startDate', p.startDate, 'date')}${fld('End', 'endDate', p.endDate, 'date')}
      <label class="field wide">Client Communication Status<input name="clientComms" value="${esc(p.clientComms)}"></label>`,
      async (f) => {
        const rec = Object.assign({}, p, f, { budget: +f.budget, hoursBudget: +f.hoursBudget }); await DB.put('projects', rec);
        if (isNew) await DB.bulkPut('milestones', Seed.phases.map((ph, i) => ({ id: 'mil-' + rec.id + '-' + i, projectId: rec.id, phase: ph, order: i, status: 'Not Started', percent: 0, engineer: 'SCADA Engineer', hoursBudget: 0, hoursActual: 0, dueDate: '', spend: 0 })));
        await refs(); render(); toast('Project saved');
      });
  }

  /* Issues */
  const iff = { q: '', status: '', severity: '', project: '' };
  views.issues = async (el) => {
    el.innerHTML = `<h1>Issue, Blocker &amp; NCR Register</h1><div class="toolbar">
      <input id="if-q" type="search" placeholder="Search issues..." value="${esc(iff.q)}" aria-label="Search issues"><select id="if-st">${opts(ISS_ST, iff.status, 'All statuses')}</select><select id="if-sev">${opts(SEV, iff.severity, 'All severities')}</select><select id="if-pr">${opts(projOpts(), iff.project, 'All projects')}</select>
      <span style="flex:1"></span><button class="btn primary" id="add-iss">+ Log Issue</button><button class="btn" id="csv-iss">Open Blockers CSV</button></div>
      <div class="tablewrap"><table><thead><tr><th>ID</th><th>Project</th><th>PO#</th><th>Issue</th><th>Category</th><th>Severity</th><th>Owner</th><th>Due</th><th>Status</th><th></th></tr></thead><tbody id="iss-body"></tbody></table><div class="pager" id="iss-pager"></div></div>`;
    const re = () => { state.page.iss = 0; loadIssues(); };
    $('#if-q').oninput = debounce(e => { iff.q = e.target.value; re(); }, 200);
    $('#if-st').onchange = e => { iff.status = e.target.value; re(); }; $('#if-sev').onchange = e => { iff.severity = e.target.value; re(); }; $('#if-pr').onchange = e => { iff.project = e.target.value; re(); };
    $('#add-iss').onclick = () => issueForm(); $('#csv-iss').onclick = () => exportCSV('blockers');
    loadIssues();
  };
  async function loadIssues() {
    const q = iff.q.toLowerCase();
    const { rows, total } = await DB.query('issues', { index: 'createdAt', direction: 'prev', offset: state.page.iss * state.pageSize, limit: state.pageSize, filter: i => (!iff.status || i.status === iff.status) && (!iff.severity || i.severity === iff.severity) && (!iff.project || i.projectId === iff.project) && (!q || (i.title + i.issueNo + i.poNumber + i.rootCause).toLowerCase().includes(q)) });
    const b = $('#iss-body'); if (!b) return;
    b.innerHTML = rows.map(i => `<tr><td>${esc(i.issueNo)}</td><td>${esc(projName(i.projectId))}</td><td>${esc(i.poNumber)}</td><td title="${esc(i.rootCause)}">${esc(i.title)}</td><td>${esc(i.category)}</td><td>${sevTag(i.severity)}</td><td>${esc(i.assignedTo)}</td><td>${esc(i.dueDate)}</td><td><span class="tag ${i.status === 'Resolved' ? 'ok' : i.status === 'Escalated to PM' ? 'bad' : 'warn'}">${esc(i.status)}</span></td><td><button class="btn sm" data-e="${i.id}">Edit</button></td></tr>`).join('') || '<tr><td colspan="10" class="muted">No issues.</td></tr>';
    $$('[data-e]', b).forEach(x => x.onclick = async () => issueForm(await DB.get('issues', x.dataset.e)));
    pager('#iss-pager', total, state.page.iss, p => { state.page.iss = p; loadIssues(); });
  }
  async function issueForm(it) {
    const isNew = !it; const n = await DB.count('issues');
    it = it || { issueNo: 'ISS-' + String(n + 1).padStart(4, '0'), category: ISS_CATS[0], severity: 'Medium', status: 'Open', assignedTo: 'SCADA Engineer', projectId: state.projects[0] && state.projects[0].id };
    modal(isNew ? 'Log Issue / Blocker' : it.issueNo, `${fld('Issue ID', 'issueNo', it.issueNo, 'text', 'required')}${sel('Linked Project', 'projectId', projOpts(), it.projectId)}
      <label class="field wide">Title<input name="title" value="${esc(it.title)}" required></label>
      ${fld('Linked PO#', 'poNumber', it.poNumber)}${sel('Category', 'category', ISS_CATS, it.category)}${sel('Severity', 'severity', SEV, it.severity)}${sel('Status', 'status', ISS_ST, it.status)}
      ${fld('Owner', 'assignedTo', it.assignedTo)}${fld('Due Date', 'dueDate', it.dueDate, 'date')}
      <label class="field wide">Root Cause<textarea name="rootCause" rows="2">${esc(it.rootCause)}</textarea></label>
      <label class="field wide">Mitigation Action Plan<textarea name="mitigation" rows="3">${esc(it.mitigation)}</textarea></label>`,
      async (f) => { const rec = Object.assign({}, it, f); if (isNew) rec.createdAt = new Date().toISOString(); await DB.put('issues', rec); toast('Issue saved'); loadIssues(); },
      isNew ? null : async () => { await DB.remove('issues', it.id); loadIssues(); });
  }

  /* Vendors */
  views.vendors = async (el) => {
    const items = await DB.getAll('procurement_items');
    el.innerHTML = `<h1>Vendor &amp; Supplier Directory</h1><div class="toolbar"><button class="btn primary" id="add-ven">+ New Vendor</button></div>
    <div class="tablewrap"><table><thead><tr><th>Vendor</th><th>Category</th><th>Country</th><th>Contact</th><th>Tech Support</th><th>Rating</th><th>On-time %</th><th>Quality %</th><th>Lead-time reliability</th><th>Active POs</th><th></th></tr></thead><tbody>${state.vendors.map(v => `<tr><td>${esc(v.name)}</td><td>${esc(v.category)}</td><td>${esc(v.country)}</td><td>${esc(v.contact)}<br><span class="muted">${esc(v.email)} ${esc(v.phone)}</span></td><td>${esc(v.support)}</td><td>${'&#9733;'.repeat(Math.round(v.rating))} ${v.rating}</td><td>${v.onTimePct}%</td><td>${v.qualityPct}%</td><td><div class="progress" style="width:90px"><i style="width:${v.leadReliability}%"></i></div></td><td>${items.filter(i => i.vendorId === v.id && i.poNumber && !DONE.includes(i.status)).length}</td><td><button class="btn sm" data-v="${v.id}">Edit</button></td></tr>`).join('')}</tbody></table></div>`;
    $('#add-ven').onclick = () => vendForm(); $$('[data-v]').forEach(b => b.onclick = async () => vendForm(await DB.get('vendors', b.dataset.v)));
  };
  function vendForm(v) {
    const isNew = !v; v = v || { rating: 4, onTimePct: 90, qualityPct: 95, leadReliability: 85, status: 'Approved', country: 'UAE' };
    modal(isNew ? 'New Vendor' : 'Edit Vendor', `<label class="field wide">Name<input name="name" value="${esc(v.name)}" required></label>${fld('Category', 'category', v.category)}${fld('Country', 'country', v.country)}${fld('Contact', 'contact', v.contact)}${fld('Email', 'email', v.email, 'email')}${fld('Phone', 'phone', v.phone)}${fld('Technical Support', 'support', v.support)}
      ${fld('Rating (0-5)', 'rating', v.rating, 'number', 'min="0" max="5" step="0.1"')}${fld('On-time %', 'onTimePct', v.onTimePct, 'number', 'min="0" max="100"')}${fld('Quality %', 'qualityPct', v.qualityPct, 'number', 'min="0" max="100"')}${fld('Lead-time reliability %', 'leadReliability', v.leadReliability, 'number', 'min="0" max="100"')}${sel('Status', 'status', ['Approved', 'Conditional', 'Blocked'], v.status)}`,
      async (f) => { await DB.put('vendors', Object.assign({}, v, f, { rating: +f.rating, onTimePct: +f.onTimePct, qualityPct: +f.qualityPct, leadReliability: +f.leadReliability })); await refs(); render(); toast('Vendor saved'); },
      isNew ? null : async () => { await DB.remove('vendors', v.id); await refs(); render(); });
  }

  /* Vault */
  views.vault = async (el) => {
    const s = await DB.storageStats(); const mb = (b) => b >= 1073741824 ? (b / 1073741824).toFixed(2) + ' GB' : (b / 1048576).toFixed(2) + ' MB';
    const years = [...new Set((await DB.getAll('procurement_items')).map(i => i.fiscalYear))].sort();
    el.innerHTML = `<h1>3-Year Storage Vault, Audit &amp; Backup</h1>
    <div class="grid cols2">
      <div class="card"><h2>Storage Health &amp; Quota</h2><div id="meter"></div><div class="legend" id="meter-legend"></div>
        <p>Used <strong>${mb(s.usage)}</strong> of ${s.quota ? mb(s.quota) : 'unknown'} quota (${s.pct.toFixed(3)}%)<br>Persistent storage: <span class="tag ${s.persisted ? 'ok' : 'warn'}">${s.persisted ? 'Locked (protected from eviction)' : 'Not granted'}</span> ${s.persisted ? '' : '<button class="btn sm" id="req-persist">Request</button>'}<br>Estimated capacity remaining: <strong>${s.remainingYears > 99 ? '99+' : s.remainingYears.toFixed(0)} years</strong> at ~80 records/day</p>
        <table style="min-width:0"><tbody>${Object.entries(s.counts).map(([k, v]) => `<tr><td>${k}</td><td style="text-align:right">${v.toLocaleString()}</td></tr>`).join('')}<tr><th>Total</th><th style="text-align:right">${s.total.toLocaleString()}</th></tr></tbody></table></div>
      <div class="card"><h2>Backup &amp; Restore</h2><div class="toolbar"><button class="btn primary" id="bk-json">Full JSON Backup</button><label class="btn">Import JSON<input type="file" id="im-file" accept=".json,application/json" hidden></label><select id="im-mode"><option value="merge">Merge</option><option value="replace">Replace all</option></select></div>
        <h2 style="margin-top:14px">CSV Reports</h2><div class="toolbar"><button class="btn" data-csv="bom">BOM Costing Sheet</button><button class="btn" data-csv="expedite">Expediting Status</button><button class="btn" data-csv="blockers">Open Blockers</button></div>
        <h2 style="margin-top:14px">Fiscal Year Archiver</h2><div class="toolbar"><select id="arc-year">${opts(years.length ? years : [new Date().getFullYear()], '')}</select><button class="btn" id="arc-go">Archive completed items</button></div><div class="toolbar"><input id="arc-q" type="search" placeholder="Search archives..."><button class="btn" id="arc-search">Search</button></div><div id="arc-res" class="muted"></div>
        <h2 style="margin-top:14px">Maintenance</h2><div class="toolbar"><button class="btn danger" id="reset">Factory Reset &amp; Re-seed</button><button class="btn" id="stress">Add 5,000 test rows</button></div></div>
    </div>
    <div class="card" style="margin-top:14px"><h2>Immutable Audit Trail</h2><div class="tablewrap"><table><thead><tr><th>Time</th><th>Action</th><th>Entity</th><th>ID</th><th>Detail</th><th>User</th></tr></thead><tbody id="aud-body"></tbody></table><div class="pager" id="aud-pager"></div></div></div>`;
    const kb = (b) => b >= 1048576 ? (b / 1048576).toFixed(2) + ' MB' : (b / 1024).toFixed(1) + ' KB';
    const segs = ['procurement_items', 'milestones', 'projects', 'issues', 'vendors', 'audit_logs', 'archives', 'settings'].map((k, i) => ({ label: k + ' – ' + kb(s.sizes[k] || 0) + ' (' + (s.counts[k] || 0).toLocaleString() + ' rec)', key: k, value: s.sizes[k] || 0, color: Charts.PALETTE[i % Charts.PALETTE.length] }));
    Charts.stack($('#meter'), segs);
    $('#meter-legend').innerHTML = segs.filter(g => g.value > 0).map(g => `<span><i style="background:${g.color}"></i>${esc(g.label)}</span>`).join('');
    if ($('#req-persist')) $('#req-persist').onclick = async () => { const ok = await DB.requestPersistence(); toast(ok ? 'Persistent storage granted' : 'Browser declined; install the app to improve odds'); render(); };
    $('#bk-json').onclick = async () => { download('procuretrack-backup-' + today() + '.json', JSON.stringify(await DB.dump()), 'application/json'); await DB.audit('EXPORT', 'database', 'all', 'Full JSON backup'); };
    $('#im-file').onchange = async (e) => { const f = e.target.files[0]; if (!f) return; try { const obj = JSON.parse(await f.text()); const n = await DB.importDump(obj, $('#im-mode').value); await refs(); toast('Imported ' + n + ' records'); render(); } catch (err) { toast('Import failed: ' + err.message); } };
    $$('[data-csv]').forEach(b => b.onclick = () => exportCSV(b.dataset.csv));
    $('#arc-go').onclick = async () => { if (!confirm('Move completed items of this fiscal year into a compressed archive?')) return; const r = await DB.archiveFiscalYear($('#arc-year').value); toast('Archived ' + r.items + ' items, ' + r.projects + ' projects'); render(); };
    $('#arc-search').onclick = async () => { const r = await DB.searchArchives($('#arc-q').value); $('#arc-res').innerHTML = r.length ? r.map(a => `<div><strong>FY${a.fiscalYear}</strong>: ${a.hits.length} hit(s)<br>${a.hits.slice(0, 8).map(h => esc(h.itemTag + ' ' + h.description)).join('<br>')}</div>`).join('') : 'No archives found.'; };
    $('#reset').onclick = async () => { if (!confirm('This deletes ALL data and reloads sample data. Export a backup first. Continue?')) return; await DB.clearAll(false); await Seed.seedIfEmpty(); await loadPrefs(); await refs(); toast('Database reset'); render(); };
    $('#stress').onclick = async () => { await Seed.bulkStress(5000); toast('Added 5,000 rows'); render(); };
    loadAudit();
  };
  async function loadAudit() {
    const { rows, total } = await DB.query('audit_logs', { index: 'timestamp', direction: 'prev', offset: state.page.audit * state.pageSize, limit: state.pageSize });
    const b = $('#aud-body'); if (!b) return;
    b.innerHTML = rows.map(a => `<tr><td>${esc(new Date(a.timestamp).toLocaleString())}</td><td><span class="tag info">${esc(a.action)}</span></td><td>${esc(a.entityType)}</td><td>${esc(a.entityId)}</td><td>${esc(a.detail)}</td><td>${esc(a.user)}</td></tr>`).join('');
    pager('#aud-pager', total, state.page.audit, p => { state.page.audit = p; loadAudit(); });
  }

  async function exportCSV(kind) {
    let rows, cols, name;
    if (kind === 'bom') { rows = await DB.getAll('procurement_items'); name = 'bom-costing'; cols = [{ label: 'Tag', key: 'itemTag' }, { label: 'Project', get: r => projName(r.projectId) }, { label: 'Description', key: 'description' }, { label: 'Category', key: 'category' }, { label: 'PR', key: 'prNumber' }, { label: 'PO', key: 'poNumber' }, { label: 'Vendor', get: r => vendName(r.vendorId) }, { label: 'Qty', key: 'quantity' }, { label: 'Unit Cost AED', key: 'unitCost' }, { label: 'Total AED', key: 'totalCost' }, { label: 'Incoterms', key: 'incoterms' }, { label: 'Lead Weeks', key: 'leadTimeWeeks' }, { label: 'FAT', key: 'fatDate' }, { label: 'Expected', key: 'expectedDelivery' }, { label: 'Actual', key: 'actualDelivery' }, { label: 'Status', key: 'status' }, { label: 'Notes', key: 'notes' }]; }
    else if (kind === 'expedite') { rows = (await DB.getAll('procurement_items')).filter(i => !DONE.includes(i.status)); name = 'expediting-status'; cols = [{ label: 'Tag', key: 'itemTag' }, { label: 'Project', get: r => projName(r.projectId) }, { label: 'Description', key: 'description' }, { label: 'PO', key: 'poNumber' }, { label: 'Vendor', get: r => vendName(r.vendorId) }, { label: 'Status', key: 'status' }, { label: 'FAT', key: 'fatDate' }, { label: 'Expected', key: 'expectedDelivery' }, { label: 'Delayed', get: r => isDelayed(r) ? 'YES' : 'no' }, { label: 'Notes', key: 'notes' }]; }
    else { rows = (await DB.getAll('issues')).filter(i => i.status !== 'Resolved'); name = 'open-blockers'; cols = [{ label: 'ID', key: 'issueNo' }, { label: 'Project', get: r => projName(r.projectId) }, { label: 'PO', key: 'poNumber' }, { label: 'Title', key: 'title' }, { label: 'Category', key: 'category' }, { label: 'Severity', key: 'severity' }, { label: 'Root Cause', key: 'rootCause' }, { label: 'Mitigation', key: 'mitigation' }, { label: 'Owner', key: 'assignedTo' }, { label: 'Due', key: 'dueDate' }, { label: 'Status', key: 'status' }]; }
    const q = (v) => '"' + String(v).replace(/"/g, '""') + '"';
    const foot = '\r\n\r\n' + ['Prepared by', prefs.engineerName + (prefs.empId ? ' (' + prefs.empId + ')' : ''), prefs.signoff, prefs.unit + ', ' + prefs.office, today()].map(q).join(',');
    download(name + '-' + today() + '.csv', '\ufeff' + DB.toCSV(rows, cols) + foot, 'text/csv;charset=utf-8');
    DB.audit('EXPORT', 'csv', kind, rows.length + ' rows');
  }

  /* ---------- v2 helpers: stage advance, inspect, attention ---------- */
  const nextBtn = (i) => { const n = nextStage(i.status); return n ? `<button class="btn sm" data-next="${i.id}" title="Advance to ${esc(n)}">Next &#10142;</button>` : '<span class="muted">Final</span>'; };
  function attnCard(cls, badge, title, sub, key) {
    return `<div class="attn"><div class="attn-main"><span class="tag ${cls}">${esc(badge)}</span><div class="attn-title">${esc(title)}</div><div class="muted attn-sub">${esc(sub)}</div></div><button class="btn sm" data-inspect="${esc(key)}">Inspect &rarr;</button></div>`;
  }
  async function advanceItem(id) {
    const it = await DB.get('procurement_items', id); if (!it) return;
    const next = nextStage(it.status); if (!next) { toast('Already at the final stage'); return; }
    if (next === 'PO Issued' && !it.poNumber) {
      const po = prompt('Enter the PO number to issue (e.g. PO-' + new Date().getFullYear().toString().slice(2) + '-2300):', ''); if (!po || !po.trim()) return; it.poNumber = po.trim();
    }
    const from = it.status; it.status = next;
    if (next === 'Delivered to Site' && !it.actualDelivery) it.actualDelivery = today();
    await DB.put('procurement_items', it, { silent: true });
    await DB.audit('STAGE', 'procurement_items', it.id, it.itemTag + ': ' + from + ' -> ' + next);
    toast(it.itemTag + ': ' + next);
    if (state.view === 'procurement') loadProc(); else if (state.view === 'dashboard') render();
  }
  async function quickAdvance() {
    const items = (await DB.getAll('procurement_items')).filter(isLate);
    const html = items.length ? `<div class="wide qa-list">${items.map(i => `<div class="attn"><div class="attn-main"><span class="tag bad">Delayed</span><div class="attn-title">${esc(i.itemTag)} &ndash; ${esc(i.description)}</div><div class="muted attn-sub">${esc(projName(i.projectId))} &bull; ${esc(i.status)} &bull; due ${esc(i.expectedDelivery)}</div></div>${nextBtn(i)}</div>`).join('')}</div>` : '<p class="muted wide">No delayed POs right now.</p>';
    modal('Quick Advance Delayed POs', html, async () => {}, null, { hideSave: true });
    $$('#modal-body [data-next]').forEach(b => b.onclick = async () => { await advanceItem(b.dataset.next); quickAdvance(); });
  }
  async function inspect(key) {
    const t = key.slice(0, 1), id = key.slice(2);
    if (t === 'i') { const it = await DB.get('procurement_items', id); Object.assign(pf, { q: it.itemTag, project: '', status: '', category: '', delayed: false, stages: null }); await go('procurement'); itemForm(it); }
    else if (t === 's') { const is = await DB.get('issues', id); Object.assign(iff, { q: is.issueNo, status: '', severity: '', project: '' }); await go('issues'); issueForm(is); }
    else go('progress');
  }
  function startTour() { return Tour.start({ navigate: (v) => go(v), onDone: () => setPref('tourDone', true) }); }

  /* purpose banner */
  function purposeHTML() {
    if (prefs.purposeHidden) return '<div class="toolbar"><button class="btn sm" id="purpose-toggle">Show Purpose</button></div>';
    return `<section class="card purpose"><div class="purpose-head"><h2>ProcureTrack Hub &mdash; Task 16: Project Procurement, Progress &amp; Issue Command Center</h2><button class="btn sm" id="purpose-toggle">Hide Purpose</button></div>
      <p>Engineered for SCADA &amp; Control Systems Engineers at Al Gurg Automation &amp; Controls (Dubai, U.A.E.) to oversee end-to-end project procurement (BOM &rarr; PR &rarr; PO &rarr; FAT &rarr; Jebel Ali Customs &rarr; Site SAT), monitor multi-disciplinary Wonderware SCADA &amp; PLC milestone progress, control project expenditure burn rates, and resolve supply chain or technical blockers under QHSE Annexure-SCT-HR-001.</p>
      <div class="toolbar"><button class="btn primary" id="p-tour">&#9654; Start Interactive Tour</button><button class="btn" id="p-guide">&#128214; How-To Workflow Guide</button><button class="btn" id="p-adv">&#9889; Quick Advance Delayed POs</button></div></section>`;
  }
  function bindPurpose(root) {
    const t = $('#purpose-toggle', root); if (t) t.onclick = async () => { await setPref('purposeHidden', !prefs.purposeHidden); render(); };
    if ($('#p-tour', root)) $('#p-tour', root).onclick = startTour;
    if ($('#p-guide', root)) $('#p-guide', root).onclick = () => go('guide');
    if ($('#p-adv', root)) $('#p-adv', root).onclick = quickAdvance;
  }

  /* ---------- Guide & SOP ---------- */
  const GUIDE_STAGES = [
    { title: 'Site Survey & BOM', statuses: ['Draft BOM'], summary: 'Capture what the site really needs before any money is committed.',
      resp: ['Survey panels, field instruments, network points and existing PLC/SCADA assets', 'Count I/O and tags; confirm licence tiers (AVEVA / Wonderware)', 'Build the BOM with vendor part numbers, quantities, lead times and AED estimates', 'Flag long-lead items early'],
      checklist: ['I/O list and tag count agreed with client', 'BOM reviewed by Project Manager', 'Estimate checked against project budget', 'Long-lead items identified'],
      docs: ['Site survey report', 'I/O list', 'BOM costing sheet', 'Request for quotation (RFQ) package'] },
    { title: 'PR & Vendor Quote', statuses: ['PR Raised'], summary: 'Turn the approved BOM into purchase requisitions and compare vendor offers.',
      resp: ['Raise PRs per BOM package', 'Collect and compare technical and commercial quotes', 'Confirm Incoterms (DDP Dubai, CIF Jebel Ali, EXW) and lead times', 'Route PR for approval'],
      checklist: ['PR raised and numbered', 'Quotes compared (or sole-source justification written)', 'Incoterms and delivery terms confirmed', 'PR approved'],
      docs: ['Purchase requisition', 'Quote comparison sheet', 'Sole-source justification (if applicable)', 'Budget approval'] },
    { title: 'PO & Manufacturing', statuses: ['PO Issued', 'In Manufacturing'], summary: 'Place the order and keep production on schedule.',
      resp: ['Issue the PO with technical specification and FAT requirements', 'Obtain order acknowledgement and confirmed ship date', 'Expedite: chase vendors on production progress', 'Review vendor drawings and datasheets'],
      checklist: ['PO issued and acknowledged', 'Delivery schedule confirmed in writing', 'Vendor drawings approved', 'FAT date agreed'],
      docs: ['Purchase order', 'Order acknowledgement', 'Approved vendor drawings', 'FAT procedure / inspection test plan'] },
    { title: 'FAT & Quality Check', statuses: ['Ready for FAT'], summary: 'Prove the equipment works before it ships.',
      resp: ['Witness or review FAT against the approved procedure', 'Check hardware, firmware and OI/OPC compatibility with the SCADA platform', 'Record punch-list items; raise an NCR for any failure', 'Release for shipment only after sign-off'],
      checklist: ['FAT executed against procedure', 'Firmware / driver compatibility confirmed', 'Punch list closed or accepted', 'FAT certificate signed'],
      docs: ['FAT report and signed certificate', 'Non-conformance report (if raised)', 'Calibration / test certificates'] },
    { title: 'Jebel Ali Customs & Site Delivery', statuses: ['In Transit', 'Customs Hold'], summary: 'Move the goods through logistics and customs and on to site.',
      resp: ['Check shipping documents and HS codes before dispatch', 'Coordinate with the clearing agent for Jebel Ali / Dubai clearance', 'Confirm type-approval for radio / wireless devices where required', 'Arrange site delivery and inspect on receipt'],
      checklist: ['Commercial invoice and packing list verified', 'Customs entry filed', 'Any hold logged as an issue with owner and due date', 'Goods inspected on site and receipt recorded'],
      docs: ['Commercial invoice and packing list', 'Bill of lading / air waybill', 'Customs declaration', 'Delivery note / goods receipt'] },
    { title: 'SAT, QHSE & Handover', statuses: ['Delivered to Site', 'Installed'], summary: 'Install, test on site and hand over safely.',
      resp: ['Prepare and run the Site Acceptance Test', 'Apply QHSE controls per Annexure-SCT-HR-001 (permits, risk assessment, toolbox talks)', 'Deliver client training and as-built documentation', 'Obtain handover certificate'],
      checklist: ['Permit to work and risk assessment approved', 'SAT passed and signed', 'As-built documents and manuals issued', 'Client training done; handover certificate signed'],
      docs: ['SAT report', 'Permit to work / risk assessment', 'As-built drawings and O&M manuals', 'Training attendance record', 'Handover certificate'] }
  ];
  const SOPS = [
    { q: 'How do I log a Customs Hold blocker?', steps: ['Open Procurement, find the item and press Edit, then set Stage / Status to Customs Hold and save.', 'Open Issues and press + Log Issue (or press I).', 'Link the project and the PO number, choose category Customs/Logistics, and set severity by schedule impact.', 'Write the root cause (for example HS code mismatch or missing type approval) and a mitigation plan with owner and due date.', 'If the schedule or cost is at risk, set status to Escalated to PM.'] },
    { q: 'How do I update Wonderware / PLC milestone hours?', steps: ['Open Progress and find the project card.', 'On the phase row press Edit.', 'Enter actual hours, percent complete and spend to date, then Save.', 'For a quick change, drag the slider or press +10% on the phase row.'] },
    { q: 'How do I export a CSV costing sheet for the estimation team?', steps: ['Open Procurement and apply any filters you need, or open Vault.', 'Press Export CSV (BOM) or choose BOM Costing Sheet under CSV Reports.', 'Open the file in Excel. A sign-off line with your name and title is added at the bottom; edit these in Settings.'] },
    { q: 'How do I back up and archive the 3-year vault?', steps: ['Open Vault and press Full JSON Backup. Store a copy off this device (for example a shared drive).', 'At fiscal year-end choose the year and press Archive completed items. Delivered and installed items move to a compressed, searchable archive.', 'To restore, press Import JSON and choose Merge (keeps current data) or Replace all.'] },
    { q: 'Where is my data stored? Is it uploaded anywhere?', steps: ['Everything lives in IndexedDB on this device and nothing is sent to a server. Back up regularly to protect against a lost or cleared device.'] },
    { q: 'Persistent storage shows "Not granted". What can I do?', steps: ['Install the app (Install App button) or bookmark it, then press Request in the Vault. Browsers grant persistence more readily to installed or frequently used apps.'] }
  ];
  const SHORTCUTS = [['Ctrl + K', 'Global search'], ['N', 'New PO / BOM item'], ['I', 'Log issue'], ['G', 'Open Guide & SOP'], ['S', 'Open Settings'], ['Esc', 'Close modal, drawer or tour']];
  let guideStage = 0;
  views.guide = async (el) => {
    const st = GUIDE_STAGES[guideStage];
    el.innerHTML = `<div class="page-head"><h1>Guide &amp; SOP</h1><button class="btn primary" id="g-tour">&#9654; Start 60-Second Tour</button></div><div class="guide-stack">
      <div class="card"><h2>Procurement &amp; engineering workflow &mdash; click a stage</h2>
        <div class="flow">${GUIDE_STAGES.map((g, i) => `<button class="flow-step ${i === guideStage ? 'active' : ''}" data-stage="${i}" aria-pressed="${i === guideStage}"><b>Stage ${i + 1}</b><span>${esc(g.title)}</span></button>`).join('<span class="flow-arrow" aria-hidden="true">&rarr;</span>')}</div>
        <div class="stage-detail"><h2>Stage ${guideStage + 1}: ${esc(st.title)}</h2><p class="muted">${esc(st.summary)}</p>
          <div class="grid cols3"><div><h3>SCADA Engineer responsibilities</h3><ul>${st.resp.map(r => `<li>${esc(r)}</li>`).join('')}</ul></div>
          <div><h3>Checklist</h3>${st.checklist.map((c, j) => `<label class="chk"><input type="checkbox" data-chk="${guideStage}-${j}" ${prefs.checks[guideStage + '-' + j] ? 'checked' : ''}> <span>${esc(c)}</span></label>`).join('')}</div>
          <div><h3>Required paperwork</h3><ul>${st.docs.map(r => `<li>${esc(r)}</li>`).join('')}</ul></div></div>
          <p><button class="btn primary" id="g-go">Go to Filtered View &rarr;</button></p></div></div>
      <div class="card"><h2>Standard operating procedures &amp; FAQ</h2>${SOPS.map(x => `<details class="sop"><summary>${esc(x.q)}</summary><ol>${x.steps.map(t => `<li>${esc(t)}</li>`).join('')}</ol></details>`).join('')}</div>
      <div class="card"><h2>Keyboard shortcuts</h2><table style="min-width:0"><tbody>${SHORTCUTS.map(k => `<tr><td><kbd class="k">${esc(k[0])}</kbd></td><td>${esc(k[1])}</td></tr>`).join('')}</tbody></table></div></div>`;
    $('#g-tour').onclick = startTour;
    $$('[data-stage]').forEach(b => b.onclick = () => { guideStage = +b.dataset.stage; render(); });
    $$('[data-chk]').forEach(c => c.onchange = () => { prefs.checks[c.dataset.chk] = c.checked; setPref('checks', prefs.checks); });
    $('#g-go').onclick = () => { Object.assign(pf, { q: '', project: '', status: '', category: '', delayed: false, stages: st.statuses.slice() }); state.page.proc = 0; go('procurement'); };
  };

  /* ---------- Settings (view + slide-over drawer) ---------- */
  function settingsHTML() {
    const chk = (n, label, v) => `<label class="field row"><input type="checkbox" name="${n}" ${v ? 'checked' : ''}> ${label}</label>`;
    const landing = [{ v: 'dashboard', l: 'Command Center' }, { v: 'procurement', l: 'Procurement' }, { v: 'progress', l: 'Progress' }, { v: 'issues', l: 'Issues' }, { v: 'vendors', l: 'Vendors' }, { v: 'vault', l: 'Vault' }, { v: 'guide', l: 'Guide & SOP' }];
    return `<form class="settings-form" autocomplete="off">
      <section class="card"><h2>Engineer profile &amp; role</h2><div class="form">${fld('Engineer name', 'engineerName', prefs.engineerName)}${fld('Employee ID', 'empId', prefs.empId)}${fld('Office location', 'office', prefs.office)}${fld('Business unit', 'unit', prefs.unit)}${fld('Default sign-off title (exported reports)', 'signoff', prefs.signoff)}</div></section>
      <section class="card"><h2>Appearance &amp; ergonomics</h2><div class="form">${sel('Theme', 'theme', [{ v: 'dark', l: 'Industrial Dark Navy (default)' }, { v: 'slate', l: 'High-Contrast Control Room Slate' }, { v: 'light', l: 'Daylight / Field Tablet Light' }], prefs.theme)}${sel('Table density', 'density', [{ v: 'comfortable', l: 'Comfortable' }, { v: 'compact', l: 'Compact' }], prefs.density)}${sel('Default landing tab', 'landing', landing, prefs.landing)}</div></section>
      <section class="card"><h2>Procurement &amp; SLA alert thresholds</h2><div class="form">${fld('Warning days before expected delivery', 'warnDays', prefs.warnDays, 'number', 'min="0" max="90"')}${fld('Budget burn alert threshold (%)', 'burnPct', prefs.burnPct, 'number', 'min="1" max="200"')}${sel('Default currency', 'currency', Object.keys(CUR), prefs.currency)}</div>
        <h2 style="margin-top:14px">FX rates (per 1 AED, editable)</h2><div class="form">${['USD', 'EUR', 'GBP'].map(c => fld(c, 'fx_' + c, CUR[c], 'number', 'min="0" step="0.0001"')).join('')}</div></section>
      <section class="card"><h2>Data &amp; notifications</h2>${chk('notify', 'Browser notifications for overdue and due-soon POs', prefs.notify)}${chk('autoAudit', 'Automatic audit logging of record changes', prefs.autoAudit)}</section>
      <div class="modal-actions"><button type="submit" class="btn primary">Save settings</button></div></form>`;
  }
  function bindSettings(root) {
    const form = $('.settings-form', root);
    form.elements.theme.onchange = async (e) => { await setPref('theme', e.target.value); applyAppearance(); };
    form.elements.density.onchange = async (e) => { await setPref('density', e.target.value); applyAppearance(); };
    form.onsubmit = async (e) => {
      e.preventDefault(); const f = new FormData(form), g = (k) => (f.get(k) || '').toString().trim();
      for (const k of ['engineerName', 'office', 'unit', 'signoff']) await setPref(k, g(k) || DEFAULTS[k]);
      await setPref('empId', g('empId')); await setPref('landing', g('landing') || 'dashboard'); await setPref('currency', g('currency') || 'AED');
      await setPref('warnDays', Math.max(0, +g('warnDays') || 0)); await setPref('burnPct', Math.max(1, +g('burnPct') || 85));
      const fx = {}; ['USD', 'EUR', 'GBP'].forEach(c => { const v = +g('fx_' + c); if (v > 0) CUR[c] = v; fx[c] = CUR[c]; }); await DB.setSetting('fx', fx);
      const n = f.has('notify'); await setPref('notify', n);
      if (n && window.Notification && Notification.permission === 'default') { try { await Notification.requestPermission(); } catch (x) {} }
      await setPref('autoAudit', f.has('autoAudit'));
      await DB.audit('SETTINGS', 'settings', 'preferences', 'Preferences updated');
      DB.setAuditEnabled(prefs.autoAudit); DB.setUser(prefs.engineerName); state.cur = prefs.currency; applyAppearance(); updateBadge();
      toast('Settings saved'); render();
    };
  }
  views.settings = async (el) => { el.innerHTML = '<div class="page-head"><h1>Settings</h1></div>' + settingsHTML(); bindSettings(el); };
  function openDrawer() { const d = $('#drawer'); $('#drawer-body').innerHTML = settingsHTML(); bindSettings($('#drawer-body')); d.classList.add('open'); $('#drawer-bg').classList.add('open'); d.setAttribute('aria-hidden', 'false'); }
  function closeDrawer() { const d = $('#drawer'); if (!d) return; d.classList.remove('open'); $('#drawer-bg').classList.remove('open'); d.setAttribute('aria-hidden', 'true'); }

  function setupShortcuts() {
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target; if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
      if ($('#modal').classList.contains('open') || $('#drawer').classList.contains('open') || document.querySelector('.tour-tip')) return;
      const k = e.key.toLowerCase();
      if (k === 'n') { e.preventDefault(); go('procurement').then(() => itemForm()); }
      else if (k === 'i') { e.preventDefault(); go('issues').then(() => issueForm()); }
      else if (k === 'g') { e.preventDefault(); go('guide'); }
      else if (k === 's') { e.preventDefault(); go('settings'); }
    });
  }

  /* ---------- Shell ---------- */
  function render() { const el = $('#view'); $$('.nav').forEach(n => { n.classList.toggle('active', n.dataset.view === state.view); n.setAttribute('aria-current', n.dataset.view === state.view ? 'page' : 'false'); }); return views[state.view](el); }
  async function go(v) { state.view = v; try { history.replaceState(null, '', '#' + v); } catch (e) {} await render(); updateQuota(); }
  async function updateQuota() { const s = await DB.storageStats(); const mb = s.usage / 1048576; $('#quota-pill').textContent = (mb >= 1024 ? (mb / 1024).toFixed(2) + ' GB' : mb.toFixed(1) + ' MB') + ' (' + s.pct.toFixed(2) + '%)' + (s.persisted ? ' \u{1F512}' : ''); }

  function setupSearch() {
    const input = $('#gsearch'), box = $('#gresults');
    const run = debounce(async () => {
      const q = input.value.trim().toLowerCase(); if (q.length < 2) { box.classList.add('hidden'); return; }
      const [it, is] = await Promise.all([DB.query('procurement_items', { limit: 6, filter: i => (i.itemTag + ' ' + i.description + ' ' + i.poNumber + ' ' + i.prNumber).toLowerCase().includes(q) }), DB.query('issues', { limit: 4, filter: i => (i.issueNo + ' ' + i.title + ' ' + i.poNumber).toLowerCase().includes(q) })]);
      box.innerHTML = it.rows.map(i => `<div data-t="i" data-id="${i.id}">BOM ${esc(i.itemTag)} - ${esc(i.description.slice(0, 44))}</div>`).join('') + is.rows.map(i => `<div data-t="s" data-id="${i.id}">Issue ${esc(i.issueNo)} - ${esc(i.title.slice(0, 44))}</div>`).join('') || '<div class="muted">No results</div>';
      box.classList.remove('hidden');
      $$('[data-id]', box).forEach(d => d.onclick = async () => { box.classList.add('hidden'); input.value = ''; if (d.dataset.t === 'i') { go('procurement'); itemForm(await DB.get('procurement_items', d.dataset.id)); } else { go('issues'); issueForm(await DB.get('issues', d.dataset.id)); } });
    }, 200);
    input.oninput = run;
    document.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); input.focus(); input.select(); } if (e.key === 'Escape') { box.classList.add('hidden'); $('#modal').classList.remove('open'); closeDrawer(); } });
    document.addEventListener('click', (e) => { if (!e.target.closest('.search')) box.classList.add('hidden'); });
  }

  function setupPWA() {
    const net = () => { document.body.classList.toggle('offline', !navigator.onLine); $('#net-label').textContent = navigator.onLine ? 'Online' : 'Offline (working locally)'; };
    window.addEventListener('online', net); window.addEventListener('offline', net); net();
    window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); state.deferredPrompt = e; $('#install-btn').classList.remove('hidden'); });
    $('#install-btn').onclick = async () => { if (!state.deferredPrompt) return; state.deferredPrompt.prompt(); await state.deferredPrompt.userChoice; state.deferredPrompt = null; $('#install-btn').classList.add('hidden'); };
    window.addEventListener('appinstalled', () => { $('#install-btn').classList.add('hidden'); toast('ProcureTrack installed'); });
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').then((reg) => {
        const showUpdate = (w) => { const b = $('#update-banner'); b.classList.add('show'); $('#update-now').onclick = () => w.postMessage({ type: 'SKIP_WAITING' }); };
        if (reg.waiting && navigator.serviceWorker.controller) showUpdate(reg.waiting);
        reg.addEventListener('updatefound', () => { const w = reg.installing; w && w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) showUpdate(w); }); });
        if (reg.sync && reg.sync.register) reg.sync.register('procuretrack-sync').catch(() => {});
      }).catch(() => {});
      let reloaded = false; navigator.serviceWorker.addEventListener('controllerchange', () => { if (reloaded) return; reloaded = true; location.reload(); });
    }
    if (window.Notification && Notification.permission === 'default') { /* requested on demand via delivery alerts */ }
  }

  function deliveryAlerts() {
    DB.getAll('procurement_items').then(items => {
      const soon = items.filter(isSoon), late = items.filter(isLate);
      if (!soon.length && !late.length) return;
      const body = late.length + ' delayed, ' + soon.length + ' due within ' + prefs.warnDays + ' days';
      toast(body);
      if (prefs.notify && window.Notification && Notification.permission === 'granted' && navigator.serviceWorker) {
        navigator.serviceWorker.ready.then(r => r.showNotification('ProcureTrack delivery alert', { body, icon: 'icons/icon-192.png', tag: 'delivery-alert' }));
      }
    });
  }

  async function init() {
    await DB.open();
    DB.requestPersistence();
    await Seed.seedIfEmpty();
    await loadPrefs();
    await refs();
    $$('.nav').forEach(n => n.onclick = () => go(n.dataset.view));
    $('#q-po').onclick = () => { go('procurement').then(() => itemForm()); };
    $('#q-issue').onclick = () => { go('issues').then(() => issueForm()); };
    $('#help-btn').onclick = () => go('guide');
    $('#settings-btn').onclick = openDrawer;
    $('#drawer-close').onclick = closeDrawer; $('#drawer-bg').onclick = closeDrawer;
    setupSearch(); setupShortcuts(); setupPWA();
    const params = new URLSearchParams(location.search), act = params.get('action'), hash = location.hash.slice(1);
    state.view = views[hash] ? hash : (views[prefs.landing] ? prefs.landing : 'dashboard');
    if (act === 'storage') state.view = 'vault'; if (act === 'bom') state.view = 'procurement'; if (act === 'new-po') state.view = 'procurement'; if (act === 'new-issue') state.view = 'issues';
    await render(); updateQuota();
    if (act === 'new-po') itemForm(); if (act === 'new-issue') issueForm();
    setInterval(updateQuota, 60000);
    setTimeout(deliveryAlerts, 1500);
    window.__ptReady = true;
  }
  document.addEventListener('DOMContentLoaded', () => { init().catch(err => { document.body.insertAdjacentHTML('afterbegin', '<div class="toast">Startup error: ' + esc(err.message) + '</div>'); console.error(err); }); });
})();
