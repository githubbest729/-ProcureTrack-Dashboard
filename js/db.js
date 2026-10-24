/* ProcureTrack DB engine: IndexedDB multi-store, designed for 100k+ records */
(function (global) {
  'use strict';
  const DB_NAME = 'ProcureTrackDB';
  const DB_VERSION = 1;
  const STORES = {
    projects: { keyPath: 'id', indexes: ['projectCode', 'status', 'client', 'manager', 'updatedAt'] },
    procurement_items: { keyPath: 'id', indexes: ['projectId', 'poNumber', 'prNumber', 'vendorId', 'category', 'status', 'expectedDelivery', 'fiscalYear', ['projectId_status', ['projectId', 'status']]] },
    vendors: { keyPath: 'id', indexes: ['name', 'category', 'rating', 'status', 'country'] },
    issues: { keyPath: 'id', indexes: ['projectId', 'poNumber', 'severity', 'status', 'assignedTo', 'createdAt'] },
    milestones: { keyPath: 'id', indexes: ['projectId', 'phase', 'status', 'dueDate', ['projectId_phase', ['projectId', 'phase']]] },
    audit_logs: { keyPath: 'id', autoIncrement: true, indexes: ['timestamp', 'entityType', 'action', 'fiscalYear'] },
    archives: { keyPath: 'id', indexes: ['fiscalYear', 'createdAt'] }
  };
  const STORE_NAMES = Object.keys(STORES);
  let dbp = null;

  function open() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const name of STORE_NAMES) {
          if (db.objectStoreNames.contains(name)) continue;
          const cfg = STORES[name];
          const os = db.createObjectStore(name, { keyPath: cfg.keyPath, autoIncrement: !!cfg.autoIncrement });
          for (const ix of cfg.indexes) {
            if (Array.isArray(ix)) os.createIndex(ix[0], ix[1], { unique: false });
            else os.createIndex(ix, ix, { unique: false });
          }
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbp;
  }

  const wrap = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const txDone = (tx) => new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });

  function uid(prefix) { return (prefix || 'id') + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function fiscalYear(d) { return (d ? new Date(d) : new Date()).getFullYear(); }

  async function getAll(store) { const db = await open(); return wrap(db.transaction(store).objectStore(store).getAll()); }
  async function get(store, key) { const db = await open(); return wrap(db.transaction(store).objectStore(store).get(key)); }
  async function count(store) { const db = await open(); return wrap(db.transaction(store).objectStore(store).count()); }
  async function getByIndex(store, index, value) { const db = await open(); return wrap(db.transaction(store).objectStore(store).index(index).getAll(value)); }

  async function put(store, record, opts) {
    opts = opts || {};
    const db = await open();
    const now = new Date().toISOString();
    const isNew = !record.id && store !== 'audit_logs';
    if (isNew) { record.id = uid(store.slice(0, 3)); record.createdAt = record.createdAt || now; }
    if (store !== 'audit_logs' && store !== 'archives') record.updatedAt = now;
    const tx = db.transaction(store, 'readwrite');
    const id = await wrap(tx.objectStore(store).put(record));
    await txDone(tx);
    if (!opts.silent && store !== 'audit_logs') {
      await audit(isNew ? 'CREATE' : 'UPDATE', store, record.id || id, summarize(record));
    }
    return record;
  }

  async function remove(store, key) {
    const db = await open();
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(key);
    await txDone(tx);
    await audit('DELETE', store, key, '');
  }

  function summarize(r) { return r.name || r.title || r.description || r.projectCode || r.poNumber || r.phase || r.id || ''; }

  async function audit(action, entityType, entityId, detail) {
    const db = await open();
    const rec = { timestamp: new Date().toISOString(), action, entityType, entityId: String(entityId), detail: String(detail || '').slice(0, 200), fiscalYear: fiscalYear(), user: 'SCADA Engineer' };
    const tx = db.transaction('audit_logs', 'readwrite');
    tx.objectStore('audit_logs').add(rec);
    await txDone(tx);
  }

  async function bulkPut(store, records) {
    const db = await open();
    const tx = db.transaction(store, 'readwrite');
    const os = tx.objectStore(store);
    for (const r of records) os.put(r);
    await txDone(tx);
  }

  /* Paginated query using a cursor with optional predicate. Returns {rows,total}. */
  async function query(store, { index, range, direction, filter, offset = 0, limit = 50 } = {}) {
    const db = await open();
    const os = db.transaction(store).objectStore(store);
    const src = index ? os.index(index) : os;
    return new Promise((resolve, reject) => {
      const rows = []; let matched = 0;
      const req = src.openCursor(range || null, direction || 'next');
      req.onsuccess = () => {
        const c = req.result;
        if (!c) return resolve({ rows, total: matched });
        if (!filter || filter(c.value)) {
          if (matched >= offset && rows.length < limit) rows.push(c.value);
          matched++;
        }
        c.continue();
      };
      req.onerror = () => reject(req.error);
    });
  }

  async function dump() {
    const out = { app: 'ProcureTrackDB', version: DB_VERSION, exportedAt: new Date().toISOString(), stores: {} };
    for (const s of STORE_NAMES) out.stores[s] = await getAll(s);
    return out;
  }

  function validateDump(obj) {
    if (!obj || typeof obj !== 'object') throw new Error('Not a valid JSON object');
    if (obj.app !== 'ProcureTrackDB') throw new Error('Not a ProcureTrack backup file');
    if (!obj.stores || typeof obj.stores !== 'object') throw new Error('Missing stores section');
    for (const s of Object.keys(obj.stores)) {
      if (!STORE_NAMES.includes(s)) throw new Error('Unknown store: ' + s);
      if (!Array.isArray(obj.stores[s])) throw new Error('Store ' + s + ' must be an array');
    }
    return true;
  }

  async function importDump(obj, mode) {
    validateDump(obj);
    let n = 0;
    if (mode === 'replace') await clearAll(true);
    for (const s of Object.keys(obj.stores)) {
      const recs = obj.stores[s];
      if (!recs.length) continue;
      await bulkPut(s, recs); n += recs.length;
    }
    await audit('IMPORT', 'database', 'all', n + ' records (' + (mode || 'merge') + ')');
    return n;
  }

  async function clearAll(keepAudit) {
    const db = await open();
    for (const s of STORE_NAMES) {
      if (keepAudit && s === 'audit_logs') continue;
      const tx = db.transaction(s, 'readwrite');
      tx.objectStore(s).clear();
      await txDone(tx);
    }
  }

  /* Archive: compress records of a fiscal year (completed items/projects) into a snapshot */
  async function compress(str) {
    if ('CompressionStream' in global) {
      const cs = new CompressionStream('gzip');
      const w = cs.writable.getWriter(); w.write(new TextEncoder().encode(str)); w.close();
      const buf = await new Response(cs.readable).arrayBuffer();
      return { enc: 'gzip', data: buf };
    }
    return { enc: 'none', data: str };
  }
  async function decompress(p) {
    if (p.enc === 'gzip') {
      const ds = new DecompressionStream('gzip');
      const w = ds.writable.getWriter(); w.write(p.data); w.close();
      return new Response(ds.readable).text();
    }
    return p.data;
  }

  async function archiveFiscalYear(year) {
    const items = (await getAll('procurement_items')).filter(i => Number(i.fiscalYear) === Number(year) && ['Delivered to Site', 'Installed'].includes(i.status));
    const projects = (await getAll('projects')).filter(p => p.status === 'Completed' && fiscalYear(p.updatedAt) === Number(year));
    if (!items.length && !projects.length) return { items: 0, projects: 0 };
    const payload = JSON.stringify({ items, projects });
    const c = await compress(payload);
    const snap = { id: uid('arc'), fiscalYear: Number(year), createdAt: new Date().toISOString(), itemCount: items.length, projectCount: projects.length, totalValue: items.reduce((a, b) => a + (b.totalCost || 0), 0), enc: c.enc, payload: c.data, searchText: items.map(i => [i.itemTag, i.description, i.poNumber].join(' ')).join(' | ').toLowerCase() };
    const db = await open();
    const tx = db.transaction(['archives', 'procurement_items', 'projects'], 'readwrite');
    tx.objectStore('archives').put(snap);
    items.forEach(i => tx.objectStore('procurement_items').delete(i.id));
    projects.forEach(p => tx.objectStore('projects').delete(p.id));
    await txDone(tx);
    await audit('ARCHIVE', 'archives', snap.id, 'FY' + year + ': ' + items.length + ' items, ' + projects.length + ' projects');
    return { items: items.length, projects: projects.length };
  }

  async function searchArchives(term) {
    const all = await getAll('archives'); const t = (term || '').toLowerCase(); const out = [];
    for (const a of all) {
      if (t && !a.searchText.includes(t)) continue;
      const data = JSON.parse(await decompress({ enc: a.enc, data: a.payload }));
      const hits = data.items.filter(i => !t || [i.itemTag, i.description, i.poNumber].join(' ').toLowerCase().includes(t));
      out.push({ archiveId: a.id, fiscalYear: a.fiscalYear, hits });
    }
    return out;
  }

  async function storageStats() {
    const counts = {}; let total = 0;
    for (const s of STORE_NAMES) { counts[s] = await count(s); total += counts[s]; }
    let usage = 0, quota = 0, persisted = false;
    try { if (navigator.storage && navigator.storage.estimate) { const e = await navigator.storage.estimate(); usage = e.usage || 0; quota = e.quota || 0; } } catch (e) {}
    try { if (navigator.storage && navigator.storage.persisted) persisted = await navigator.storage.persisted(); } catch (e) {}
    // capacity projection: avg bytes per record, daily growth assumption (80 records/day)
    const avg = total ? Math.max(usage / total, 300) : 1500;
    const perYear = avg * 80 * 365;
    const remainingYears = quota && perYear ? Math.max(0, (quota - usage) / perYear) : 0;
    return { counts, total, usage, quota, pct: quota ? usage / quota * 100 : 0, persisted, remainingYears };
  }

  async function requestPersistence() {
    try { if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist(); } catch (e) {}
    return false;
  }

  function toCSV(rows, cols) {
    const esc = (v) => { v = v == null ? '' : String(v); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    return [cols.map(c => esc(c.label)).join(',')].concat(rows.map(r => cols.map(c => esc(typeof c.get === 'function' ? c.get(r) : r[c.key])).join(','))).join('\r\n');
  }

  global.DB = { STORE_NAMES, open, get, getAll, count, getByIndex, put, remove, audit, bulkPut, query, dump, validateDump, importDump, clearAll, archiveFiscalYear, searchArchives, storageStats, requestPersistence, toCSV, uid, fiscalYear };
})(window);
