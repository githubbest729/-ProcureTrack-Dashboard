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
  try { state.cur = localStorage.getItem('pt-cur') || 'AED'; const r = JSON.parse(localStorage.getItem('pt-rates') || 'null'); if (r) Object.assign(CUR, r); } catch (e) {}

  const money = (aed) => (state.cur === 'AED' ? 'AED ' : state.cur + ' ') + Math.round((aed || 0) * CUR[state.cur]).toLocaleString();
  const projName = (id) => { const p = state.projects.find(x => x.id === id); return p ? p.projectCode : '-'; };
  const vendName = (id) => { const v = state.vendors.find(x => x.id === id); return v ? v.name : '-'; };
  const isDelayed = (i) => !DONE.includes(i.status) && i.expectedDelivery && i.expectedDelivery < today() || (i.actualDelivery && i.expectedDelivery && i.actualDelivery > i.expectedDelivery);
  const stTag = (s) => { const c = DONE.includes(s) ? 'ok' : s === 'Customs Hold' ? 'bad' : ['In Transit', 'Ready for FAT'].includes(s) ? 'info' : ['Draft BOM', 'PR Raised'].includes(s) ? 'warn' : ''; return `<span class="tag ${c}">${esc(s)}</span>`; };
  const sevTag = (s) => `<span class="tag ${s === 'Critical' ? 'bad' : s === 'High' ? 'warn' : s === 'Medium' ? 'info' : ''}">${esc(s)}</span>`;
  const opts = (arr, sel, blank) => (blank ? `<option value="">${blank}</option>` : '') + arr.map(a => { const v = typeof a === 'object' ? a.v : a, l = typeof a === 'object' ? a.l : a; return `<option value="${esc(v)}"${v === sel ? ' selected' : ''}>${esc(l)}</option>`; }).join('');
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  function toast(msg) { const t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 3200); }
  function download(name, text, type) { const b = new Blob([text], { type: type || 'text/plain' }); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }

  /* ---------- Modal ---------- */
  function modal(title, bodyHTML, onSave, extraBtn) {
    const bg = $('#modal'); $('#modal-title').textContent = title; $('#modal-body').innerHTML = bodyHTML;
    bg.classList.add('open');
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
    el.innerHTML = `<h1>Executive Command Center</h1>
    <div class="grid kpis">
      <div class="card kpi"><div class="l">Total Project Budget</div><div class="v">${money(budget)}</div><div class="s">Committed: ${money(committed)} (${budget ? Math.round(committed / budget * 100) : 0}%)</div></div>
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
      return { label: p.projectCode + ' ' + p.name.slice(0, 18), planned, actual: p.progress || 0 };
    }));
    const attn = [];
    items.filter(isDelayed).slice(0, 5).forEach(i => attn.push(`<div>${stTag(i.status)} ${esc(i.itemTag)} - ${esc(i.description.slice(0, 50))} <span class="muted">due ${esc(i.expectedDelivery)}</span></div>`));
    issues.filter(i => i.status !== 'Resolved' && ['Critical', 'High'].includes(i.severity)).slice(0, 5).forEach(i => attn.push(`<div>${sevTag(i.severity)} ${esc(i.title)}</div>`));
    $('#attn').innerHTML = attn.join('') || '<span class="muted">Nothing urgent. All clear.</span>';
  };

  /* Procurement */
  const pf = { q: '', project: '', status: '', category: '', delayed: false };
  views.procurement = async (el) => {
    el.innerHTML = `<h1>Procurement &amp; BOM Pipeline</h1>
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
    $('#pf-status').onchange = (e) => { pf.status = e.target.value; reload(); };
    $('#pf-cat').onchange = (e) => { pf.category = e.target.value; reload(); };
    $('#pf-delay').onchange = (e) => { pf.delayed = e.target.checked; reload(); };
    $('#cur').onchange = (e) => { state.cur = e.target.value; try { localStorage.setItem('pt-cur', state.cur); } catch (x) {} loadProc(); };
    $('#add-item').onclick = () => itemForm();
    $('#csv-proc').onclick = () => exportCSV('bom');
    loadProc();
  };
  function procFilter() {
    const q = pf.q.trim().toLowerCase();
    return (i) => (!pf.project || i.projectId === pf.project) && (!pf.status || i.status === pf.status) && (!pf.category || i.category === pf.category) && (!pf.delayed || isDelayed(i)) &&
      (!q || (i.itemTag + ' ' + i.description + ' ' + i.poNumber + ' ' + i.prNumber).toLowerCase().includes(q));
  }
  async function loadProc() {
    const { rows, total } = await DB.query('procurement_items', { index: 'expectedDelivery', filter: procFilter(), offset: state.page.proc * state.pageSize, limit: state.pageSize });
    const body = $('#proc-body'); if (!body) return;
    body.innerHTML = rows.map(i => `<tr class="${isDelayed(i) ? 'delayed' : ''}"><td>${esc(i.itemTag)}</td><td>${esc(projName(i.projectId))}</td><td title="${esc(i.description)}">${esc(i.description)}</td><td>${esc(i.category)}</td><td>${esc(i.prNumber)}</td><td>${esc(i.poNumber)}</td><td>${esc(vendName(i.vendorId))}</td><td>${i.quantity}</td><td>${money(i.unitCost)}</td><td>${money(i.totalCost)}</td><td>${esc(i.incoterms)}</td><td>${esc(i.leadTimeWeeks)}</td><td>${esc(i.fatDate)}</td><td>${esc(i.expectedDelivery)}</td><td>${esc(i.actualDelivery)}</td><td>${stTag(i.status)}</td><td><button class="btn sm" data-edit="${i.id}">Edit</button></td></tr>`).join('') || '<tr><td colspan="17" class="muted">No items match.</td></tr>';
    $$('[data-edit]', body).forEach(b => b.onclick = async () => itemForm(await DB.get('procurement_items', b.dataset.edit)));
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
  views.progress = async (el) => {
    const ms = await DB.getAll('milestones'), items = await DB.getAll('procurement_items');
    el.innerHTML = '<h1>Project Progress &amp; Schedule Tracker</h1><div class="grid cols2" id="proj-grid"></div>';
    $('#proj-grid').innerHTML = state.projects.map(p => {
      const rows = ms.filter(m => m.projectId === p.id).sort((a, b) => a.order - b.order);
      const spend = items.filter(i => i.projectId === p.id && i.poNumber).reduce((a, i) => a + i.totalCost, 0) + rows.reduce((a, m) => a + (m.spend || 0), 0);
      const hb = rows.reduce((a, m) => a + m.hoursBudget, 0), ha = rows.reduce((a, m) => a + m.hoursActual, 0);
      return `<div class="card proj-card"><div style="display:flex;justify-content:space-between;gap:8px"><div><strong>${esc(p.name)}</strong><div class="muted">${esc(p.projectCode)} &bull; ${esc(p.client)} &bull; PM ${esc(p.manager)}</div></div><button class="btn sm" data-proj="${p.id}">Edit</button></div>
      <div class="progress" aria-label="Progress ${p.progress}%"><i style="width:${p.progress}%"></i></div>
      <div class="muted">${p.progress}% overall &bull; Hours ${ha}/${hb} &bull; Burn ${money(spend)} of ${money(p.budget)} (${Math.round(spend / p.budget * 100)}%)</div>
      <div class="muted">Client comms: ${esc(p.clientComms)}</div>
      <div>${rows.map(m => `<div class="phase"><span>${esc(m.phase)}</span><span>${stTagM(m.status)}</span><div class="progress"><i style="width:${m.percent}%"></i></div><span class="muted">${m.hoursActual}/${m.hoursBudget} h</span><button class="btn sm" data-ms="${m.id}">${m.percent}%</button></div>`).join('')}</div></div>`;
    }).join('') + `<div class="card"><button class="btn primary" id="add-proj">+ New Project</button></div>`;
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
      <div class="card"><h2>Storage Health &amp; Quota</h2><div id="meter"></div>
        <p>Used <strong>${mb(s.usage)}</strong> of ${s.quota ? mb(s.quota) : 'unknown'} quota (${s.pct.toFixed(3)}%)<br>Persistent storage: <span class="tag ${s.persisted ? 'ok' : 'warn'}">${s.persisted ? 'Locked (protected from eviction)' : 'Not granted'}</span> ${s.persisted ? '' : '<button class="btn sm" id="req-persist">Request</button>'}<br>Estimated capacity remaining: <strong>${s.remainingYears > 99 ? '99+' : s.remainingYears.toFixed(0)} years</strong> at ~80 records/day</p>
        <table style="min-width:0"><tbody>${Object.entries(s.counts).map(([k, v]) => `<tr><td>${k}</td><td style="text-align:right">${v.toLocaleString()}</td></tr>`).join('')}<tr><th>Total</th><th style="text-align:right">${s.total.toLocaleString()}</th></tr></tbody></table></div>
      <div class="card"><h2>Backup &amp; Restore</h2><div class="toolbar"><button class="btn primary" id="bk-json">Full JSON Backup</button><label class="btn">Import JSON<input type="file" id="im-file" accept=".json,application/json" hidden></label><select id="im-mode"><option value="merge">Merge</option><option value="replace">Replace all</option></select></div>
        <h2 style="margin-top:14px">CSV Reports</h2><div class="toolbar"><button class="btn" data-csv="bom">BOM Costing Sheet</button><button class="btn" data-csv="expedite">Expediting Status</button><button class="btn" data-csv="blockers">Open Blockers</button></div>
        <h2 style="margin-top:14px">Fiscal Year Archiver</h2><div class="toolbar"><select id="arc-year">${opts(years.length ? years : [new Date().getFullYear()], '')}</select><button class="btn" id="arc-go">Archive completed items</button></div><div class="toolbar"><input id="arc-q" type="search" placeholder="Search archives..."><button class="btn" id="arc-search">Search</button></div><div id="arc-res" class="muted"></div>
        <h2 style="margin-top:14px">Currency Rates (per 1 AED)</h2><div class="toolbar">${['USD', 'EUR', 'GBP'].map(c => `<label>${c} <input data-rate="${c}" type="number" step="0.0001" value="${CUR[c]}" style="width:90px"></label>`).join('')}<button class="btn sm" id="rate-save">Save</button></div>
        <h2 style="margin-top:14px">Maintenance</h2><div class="toolbar"><button class="btn danger" id="reset">Factory Reset &amp; Re-seed</button><button class="btn" id="stress">Add 5,000 test rows</button></div></div>
    </div>
    <div class="card" style="margin-top:14px"><h2>Immutable Audit Trail</h2><div class="tablewrap"><table><thead><tr><th>Time</th><th>Action</th><th>Entity</th><th>ID</th><th>Detail</th><th>User</th></tr></thead><tbody id="aud-body"></tbody></table><div class="pager" id="aud-pager"></div></div></div>`;
    Charts.meter($('#meter'), s.pct);
    if ($('#req-persist')) $('#req-persist').onclick = async () => { const ok = await DB.requestPersistence(); toast(ok ? 'Persistent storage granted' : 'Browser declined; install the app to improve odds'); render(); };
    $('#bk-json').onclick = async () => { download('procuretrack-backup-' + today() + '.json', JSON.stringify(await DB.dump()), 'application/json'); await DB.audit('EXPORT', 'database', 'all', 'Full JSON backup'); };
    $('#im-file').onchange = async (e) => { const f = e.target.files[0]; if (!f) return; try { const obj = JSON.parse(await f.text()); const n = await DB.importDump(obj, $('#im-mode').value); await refs(); toast('Imported ' + n + ' records'); render(); } catch (err) { toast('Import failed: ' + err.message); } };
    $$('[data-csv]').forEach(b => b.onclick = () => exportCSV(b.dataset.csv));
    $('#arc-go').onclick = async () => { if (!confirm('Move completed items of this fiscal year into a compressed archive?')) return; const r = await DB.archiveFiscalYear($('#arc-year').value); toast('Archived ' + r.items + ' items, ' + r.projects + ' projects'); render(); };
    $('#arc-search').onclick = async () => { const r = await DB.searchArchives($('#arc-q').value); $('#arc-res').innerHTML = r.length ? r.map(a => `<div><strong>FY${a.fiscalYear}</strong>: ${a.hits.length} hit(s)<br>${a.hits.slice(0, 8).map(h => esc(h.itemTag + ' ' + h.description)).join('<br>')}</div>`).join('') : 'No archives found.'; };
    $('#rate-save').onclick = () => { $$('[data-rate]').forEach(i => CUR[i.dataset.rate] = +i.value || CUR[i.dataset.rate]); try { localStorage.setItem('pt-rates', JSON.stringify(CUR)); } catch (e) {} toast('Rates saved'); };
    $('#reset').onclick = async () => { if (!confirm('This deletes ALL data and reloads sample data. Export a backup first. Continue?')) return; await DB.clearAll(false); await Seed.seedIfEmpty(); await refs(); toast('Database reset'); render(); };
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
    download(name + '-' + today() + '.csv', '﻿' + DB.toCSV(rows, cols), 'text/csv;charset=utf-8');
    DB.audit('EXPORT', 'csv', kind, rows.length + ' rows');
  }

  /* ---------- Shell ---------- */
  function render() { const el = $('#view'); $$('.nav').forEach(n => { n.classList.toggle('active', n.dataset.view === state.view); n.setAttribute('aria-current', n.dataset.view === state.view ? 'page' : 'false'); }); return views[state.view](el); }
  function go(v) { state.view = v; try { history.replaceState(null, '', '#' + v); } catch (e) {} render(); updateQuota(); }
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
    document.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); input.focus(); input.select(); } if (e.key === 'Escape') { box.classList.add('hidden'); $('#modal').classList.remove('open'); } });
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
      const soon = items.filter(i => !DONE.includes(i.status) && i.expectedDelivery && i.expectedDelivery >= today() && (new Date(i.expectedDelivery) - Date.now()) < 3 * 864e5);
      const late = items.filter(isDelayed);
      if (soon.length || late.length) toast(late.length + ' delayed, ' + soon.length + ' due within 3 days');
      if (window.Notification && Notification.permission === 'granted' && navigator.serviceWorker && navigator.serviceWorker.controller && (soon.length || late.length)) {
        navigator.serviceWorker.ready.then(r => r.showNotification('ProcureTrack delivery alert', { body: late.length + ' delayed, ' + soon.length + ' due within 3 days', icon: 'icons/icon-192.png', tag: 'delivery-alert' }));
      }
    });
  }

  async function init() {
    await DB.open();
    DB.requestPersistence();
    await Seed.seedIfEmpty();
    await refs();
    $$('.nav').forEach(n => n.onclick = () => go(n.dataset.view));
    $('#q-po').onclick = () => { go('procurement'); itemForm(); };
    $('#q-issue').onclick = () => { go('issues'); issueForm(); };
    setupSearch(); setupPWA();
    const params = new URLSearchParams(location.search), act = params.get('action'), hash = location.hash.slice(1);
    state.view = views[hash] ? hash : 'dashboard';
    if (act === 'storage') state.view = 'vault'; if (act === 'bom') state.view = 'procurement'; if (act === 'new-po') state.view = 'procurement'; if (act === 'new-issue') state.view = 'issues';
    await render(); updateQuota();
    if (act === 'new-po') itemForm(); if (act === 'new-issue') issueForm();
    setInterval(updateQuota, 60000);
    setTimeout(deliveryAlerts, 1500);
    window.__ptReady = true;
  }
  document.addEventListener('DOMContentLoaded', () => { init().catch(err => { document.body.insertAdjacentHTML('afterbegin', '<div class="toast">Startup error: ' + esc(err.message) + '</div>'); console.error(err); }); });
})();
