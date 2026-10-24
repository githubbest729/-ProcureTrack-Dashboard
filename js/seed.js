/* Realistic Dubai/UAE industrial automation seed data */
(function (global) {
  'use strict';
  const Y = new Date().getFullYear();
  const d = (offsetDays) => { const x = new Date(); x.setDate(x.getDate() + offsetDays); return x.toISOString().slice(0, 10); };

  const projects = [
    { id: 'prj-dewa', projectCode: 'AGAC-24-101', name: 'DEWA Substation SCADA Retrofit', client: 'DEWA', manager: 'Rashid Al Mansoori', engineer: 'SCADA Engineer', status: 'Active', budget: 1850000, startDate: d(-150), endDate: d(120), progress: 58, clientComms: 'Weekly review held; awaiting approval of HMI graphics rev B', hoursBudget: 2400, hoursActual: 1510 },
    { id: 'prj-dcp', projectCode: 'AGAC-24-117', name: 'Dubai District Cooling Plant Wonderware Upgrade', client: 'Empower', manager: 'Sana Qureshi', engineer: 'SCADA Engineer', status: 'Active', budget: 1240000, startDate: d(-110), endDate: d(90), progress: 46, clientComms: 'Client requested Historian retention change', hoursBudget: 1800, hoursActual: 905 },
    { id: 'prj-jawt', projectCode: 'AGAC-24-123', name: 'Jebel Ali Water Treatment PLC & OPC-UA Migration', client: 'JAFZA Utilities', manager: 'Vikram Nair', engineer: 'SCADA Engineer', status: 'Active', budget: 2150000, startDate: d(-95), endDate: d(160), progress: 33, clientComms: 'Shutdown window to be confirmed by client O&M', hoursBudget: 3200, hoursActual: 1020 },
    { id: 'prj-shj', projectCode: 'AGAC-24-131', name: 'Sharjah Industrial Pumping Station Telemetry', client: 'SEWA', manager: 'Omar Haddad', engineer: 'SCADA Engineer', status: 'Active', budget: 640000, startDate: d(-60), endDate: d(75), progress: 27, clientComms: 'Site access permits pending', hoursBudget: 900, hoursActual: 260 }
  ];

  const vendors = [
    { id: 'ven-1', name: 'Gulf Automation Distribution LLC', category: 'AVEVA / Wonderware Distributor', country: 'UAE', city: 'Dubai', contact: 'Hassan Ali', email: 'sales@gulfautomation.example', phone: '+971 4 555 0101', support: '+971 4 555 0199', rating: 4.6, onTimePct: 92, qualityPct: 97, leadReliability: 90, status: 'Approved' },
    { id: 'ven-2', name: 'Siemens Middle East Industry', category: 'PLC & Drives', country: 'UAE', city: 'Dubai', contact: 'Priya Menon', email: 'plc.orders@siemens-me.example', phone: '+971 4 555 0202', support: '+971 800 555 02', rating: 4.8, onTimePct: 95, qualityPct: 99, leadReliability: 94, status: 'Approved' },
    { id: 'ven-3', name: 'Moxa / NetSys Regional', category: 'Networking & Gateways', country: 'UAE', city: 'Sharjah', contact: 'Daniel Fernandes', email: 'orders@netsys.example', phone: '+971 6 555 0303', support: '+971 6 555 0399', rating: 4.2, onTimePct: 84, qualityPct: 95, leadReliability: 80, status: 'Approved' },
    { id: 'ven-4', name: 'Emirates Panel Systems FZE', category: 'Control Panels & Cabling', country: 'UAE', city: 'Jebel Ali', contact: 'Khalid Saeed', email: 'projects@emiratespanels.example', phone: '+971 4 555 0404', support: '+971 4 555 0499', rating: 3.9, onTimePct: 78, qualityPct: 91, leadReliability: 72, status: 'Approved' },
    { id: 'ven-5', name: 'Dell Technologies (Enterprise Channel)', category: 'Servers & IT Hardware', country: 'Germany', city: 'Frankfurt', contact: 'Markus Weber', email: 'enterprise@dell-channel.example', phone: '+49 69 555 0505', support: '+49 69 555 0599', rating: 4.4, onTimePct: 88, qualityPct: 98, leadReliability: 85, status: 'Approved' },
    { id: 'ven-6', name: 'Schneider Electric Gulf (UPS & Power)', category: 'UPS & Power', country: 'UAE', city: 'Abu Dhabi', contact: 'Layla Ibrahim', email: 'power@schneider-gulf.example', phone: '+971 2 555 0606', support: '+971 2 555 0699', rating: 4.5, onTimePct: 90, qualityPct: 96, leadReliability: 88, status: 'Approved' }
  ];

  let n = 0;
  const mk = (project, tag, desc, cat, pr, po, vendor, qty, unit, inco, lead, fat, exp, act, status, note) => ({
    id: 'itm-' + (++n), itemTag: tag, projectId: project, description: desc, category: cat, prNumber: pr, poNumber: po, vendorId: vendor,
    quantity: qty, unitCost: unit, totalCost: qty * unit, currency: 'AED', incoterms: inco, leadTimeWeeks: lead, fatDate: fat, expectedDelivery: exp,
    actualDelivery: act, status, notes: note, fiscalYear: Y, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
  });

  const items = [
    mk('prj-dewa', 'BOM-101-001', 'AVEVA System Platform 2023 R2 5000 IO Tag License', 'Wonderware Licenses', 'PR-24-0411', 'PO-24-2201', 'ven-1', 1, 68500, 'DDP Dubai', 4, '', d(-20), d(-18), 'Delivered to Site', 'Licenses activated on staging server'),
    mk('prj-dewa', 'BOM-101-002', 'Siemens S7-1500 Redundant PLC Rack (CPU 1513R-1 PN)', 'PLCs & I/O', 'PR-24-0412', 'PO-24-2202', 'ven-2', 2, 41200, 'DDP Dubai', 10, d(-5), d(10), '', 'Ready for FAT', 'FAT scheduled with client witness'),
    mk('prj-dewa', 'BOM-101-003', 'Moxa MGate MB3480 Modbus-to-OPC UA Gateway', 'OPC/Modbus Gateways', 'PR-24-0413', 'PO-24-2203', 'ven-3', 6, 5900, 'CIF Jebel Ali', 8, '', d(-6), '', 'Customs Hold', 'Customs query on HS code, broker engaged'),
    mk('prj-dewa', 'BOM-101-004', 'Dell PowerEdge R760 SQL Server (64GB, 4x1.2TB SAS RAID10)', 'HMI/Servers', 'PR-24-0414', 'PO-24-2204', 'ven-5', 2, 28400, 'DDP Dubai', 6, '', d(14), '', 'In Transit', 'AWB shared, ETA Dubai DWC'),
    mk('prj-dewa', 'BOM-101-005', 'Marshalling Cabinet 800x2000x600 IP55 with terminal blocks', 'Panels & Cabling', 'PR-24-0415', 'PO-24-2205', 'ven-4', 3, 18900, 'EXW', 7, d(3), d(21), '', 'In Manufacturing', 'Terminal block shortage flagged'),
    mk('prj-dcp', 'BOM-117-001', 'Wonderware Historian 2023 Server License (Standard)', 'Wonderware Licenses', 'PR-24-0431', 'PO-24-2231', 'ven-1', 1, 54000, 'DDP Dubai', 3, '', d(-35), d(-33), 'Installed', 'Installed and tested on Historian node'),
    mk('prj-dcp', 'BOM-117-002', 'InTouch HMI 2023 Unlimited Tag Runtime Licenses', 'Wonderware Licenses', 'PR-24-0432', 'PO-24-2232', 'ven-1', 6, 9800, 'DDP Dubai', 3, '', d(-12), d(-14), 'Delivered to Site', ''),
    mk('prj-dcp', 'BOM-117-003', 'Siemens SCALANCE XC208 Managed Industrial Ethernet Switch', 'Networking', 'PR-24-0433', 'PO-24-2233', 'ven-2', 8, 3250, 'DDP Dubai', 5, '', d(2), '', 'PO Issued', 'Awaiting vendor order acknowledgement'),
    mk('prj-dcp', 'BOM-117-004', 'Schneider APC Smart-UPS SRT 3000VA Rack', 'UPS & Power', 'PR-24-0434', 'PO-24-2234', 'ven-6', 4, 7600, 'DDP Dubai', 4, '', d(-4), '', 'In Transit', 'Courier tracking active'),
    mk('prj-dcp', 'BOM-117-005', 'HMI Operator Panel PC 21.5in IP65 (Siemens IPC477E)', 'HMI/Servers', 'PR-24-0435', '', 'ven-2', 3, 22800, 'CIF Jebel Ali', 9, '', d(40), '', 'PR Raised', 'Awaiting PM approval of PR'),
    mk('prj-jawt', 'BOM-123-001', 'Siemens S7-1500 Redundant PLC Rack (CPU 1516R-1 PN)', 'PLCs & I/O', 'PR-24-0451', 'PO-24-2251', 'ven-2', 4, 46500, 'DDP Dubai', 12, d(30), d(60), '', 'In Manufacturing', 'Production slot confirmed'),
    mk('prj-jawt', 'BOM-123-002', 'Moxa MGate 5217 Modbus RTU/TCP Gateway', 'OPC/Modbus Gateways', 'PR-24-0452', 'PO-24-2252', 'ven-3', 10, 4300, 'CIF Jebel Ali', 7, '', d(-9), '', 'Customs Hold', 'Awaiting import permit documents'),
    mk('prj-jawt', 'BOM-123-003', 'ET 200SP Remote I/O Station with DI/DO/AI modules', 'PLCs & I/O', 'PR-24-0453', '', 'ven-2', 12, 8900, 'DDP Dubai', 8, '', d(55), '', 'Draft BOM', 'Pending site survey confirmation of I/O count'),
    mk('prj-jawt', 'BOM-123-004', 'OPC UA Server License for Wonderware OI Gateway', 'Wonderware Licenses', 'PR-24-0454', 'PO-24-2254', 'ven-1', 2, 12700, 'DDP Dubai', 3, '', d(-3), '', 'PO Issued', ''),
    mk('prj-shj', 'BOM-131-001', 'RTU Telemetry Panel with 4G Router and Antenna', 'Panels & Cabling', 'PR-24-0471', 'PO-24-2271', 'ven-4', 5, 15200, 'EXW', 6, d(8), d(25), '', 'Ready for FAT', 'Panel builder FAT report pending'),
    mk('prj-shj', 'BOM-131-002', 'Industrial Fibre Optic Cable 12-core armoured, 500m drums', 'Panels & Cabling', 'PR-24-0472', 'PO-24-2272', 'ven-4', 4, 6400, 'DDP Dubai', 4, '', d(-8), d(-10), 'Delivered to Site', ''),
    mk('prj-shj', 'BOM-131-003', 'Schneider APC UPS 1500VA DIN Rail 24VDC', 'UPS & Power', 'PR-24-0473', '', 'ven-6', 5, 2800, 'DDP Dubai', 3, '', d(45), '', 'Draft BOM', '')
  ];

  const phases = ['Site Survey & BOM Estimation', 'Wonderware SCADA & HMI Design', 'PLC & Modbus/OPC Integration', 'SQL Database & Reporting', 'Procurement & FAT', 'Site Delivery & SAT', 'Documentation & Client Training', 'QHSE Compliance (Annexure-SCT-HR-001)'];
  const pct = { 'prj-dewa': [100, 85, 60, 55, 50, 15, 10, 70], 'prj-dcp': [100, 70, 45, 40, 45, 5, 5, 60], 'prj-jawt': [90, 40, 25, 20, 30, 0, 0, 50], 'prj-shj': [80, 35, 20, 15, 25, 0, 0, 40] };
  const hb = [0.06, 0.2, 0.25, 0.12, 0.14, 0.1, 0.07, 0.06];
  const milestones = [];
  projects.forEach(p => phases.forEach((ph, i) => {
    const pc = pct[p.id][i];
    milestones.push({ id: 'mil-' + p.id + '-' + i, projectId: p.id, phase: ph, order: i, status: pc >= 100 ? 'Completed' : pc > 0 ? 'In Progress' : 'Not Started', percent: pc, engineer: i % 2 ? 'SCADA Engineer' : 'Project Engineer', hoursBudget: Math.round(p.hoursBudget * hb[i]), hoursActual: Math.round(p.hoursBudget * hb[i] * pc / 100 * 1.05), dueDate: d(-120 + i * 35 + (p.id.length % 5) * 3), spend: Math.round(p.budget * hb[i] * pc / 100), updatedAt: new Date().toISOString() });
  }));

  const issues = [
    { id: 'iss-1', issueNo: 'ISS-0001', projectId: 'prj-dewa', poNumber: 'PO-24-2203', title: 'Customs clearance delay at Jebel Ali Port', category: 'Customs/Logistics', severity: 'Critical', rootCause: 'HS code mismatch on Moxa gateway commercial invoice', mitigation: 'Broker to submit corrected invoice; request priority inspection; prepare temporary loan units from stock', assignedTo: 'SCADA Engineer', dueDate: d(4), status: 'Escalated to PM', createdAt: d(-6) + 'T08:00:00.000Z' },
    { id: 'iss-2', issueNo: 'ISS-0002', projectId: 'prj-dcp', poNumber: 'PO-24-2233', title: 'Vendor firmware incompatibility with Wonderware OI Server', category: 'Technical/Spec Mismatch', severity: 'High', rootCause: 'Switch firmware version lacks required SNMP MIB support', mitigation: 'Obtain compatible firmware from vendor; validate in lab before site deployment', assignedTo: 'SCADA Engineer', dueDate: d(9), status: 'Waiting on Vendor', createdAt: d(-8) + 'T09:30:00.000Z' },
    { id: 'iss-3', issueNo: 'ISS-0003', projectId: 'prj-dewa', poNumber: 'PO-24-2205', title: 'Panel marshalling terminal block shortage', category: 'Supply Chain Delay', severity: 'High', rootCause: 'Panel builder component shortage on 2.5mm2 spring terminals', mitigation: 'Approve equivalent make after datasheet review; split delivery of cabinets', assignedTo: 'Procurement Lead', dueDate: d(6), status: 'Open', createdAt: d(-5) + 'T10:15:00.000Z' },
    { id: 'iss-4', issueNo: 'ISS-0004', projectId: 'prj-jawt', poNumber: 'PO-24-2252', title: 'Import permit missing for 4G/radio gateway units', category: 'Customs/Logistics', severity: 'Medium', rootCause: 'TRA type approval certificate not attached to shipment file', mitigation: 'Vendor to send TRA approval; broker to file amendment', assignedTo: 'SCADA Engineer', dueDate: d(7), status: 'Waiting on Vendor', createdAt: d(-3) + 'T11:00:00.000Z' },
    { id: 'iss-5', issueNo: 'ISS-0005', projectId: 'prj-shj', poNumber: 'PO-24-2271', title: 'NCR: RTU panel wiring not per approved drawings', category: 'Quality/NCR', severity: 'Medium', rootCause: 'Panel shop used superseded drawing revision', mitigation: 'Issue NCR, panel builder to rework; re-run FAT checklist', assignedTo: 'QA Engineer', dueDate: d(12), status: 'Open', createdAt: d(-2) + 'T13:20:00.000Z' },
    { id: 'iss-6', issueNo: 'ISS-0006', projectId: 'prj-shj', poNumber: '', title: 'Site not ready: pumping station civil works incomplete', category: 'Site Readiness', severity: 'Low', rootCause: 'Cable trench and cabinet plinth pending by civil contractor', mitigation: 'Coordinate with client PM; reschedule installation; update QHSE permit to work', assignedTo: 'Site Supervisor', dueDate: d(15), status: 'Open', createdAt: d(-1) + 'T07:45:00.000Z' }
  ].map(i => Object.assign(i, { updatedAt: new Date().toISOString() }));

  async function seedIfEmpty() {
    if ((await DB.count('projects')) > 0) return false;
    await DB.bulkPut('projects', projects.map(p => Object.assign({ createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, p)));
    await DB.bulkPut('vendors', vendors.map(v => Object.assign({ createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, v)));
    await DB.bulkPut('procurement_items', items);
    await DB.bulkPut('milestones', milestones);
    await DB.bulkPut('issues', issues);
    await DB.audit('SEED', 'database', 'all', 'Initial Dubai/UAE sample data loaded');
    return true;
  }

  async function bulkStress(n) { // generate synthetic rows to test scale
    const rows = [];
    const sts = ['Draft BOM', 'PR Raised', 'PO Issued', 'In Manufacturing', 'Ready for FAT', 'In Transit', 'Customs Hold', 'Delivered to Site', 'Installed'];
    for (let i = 0; i < n; i++) rows.push({ id: 'syn-' + Date.now() + '-' + i, itemTag: 'SYN-' + i, projectId: projects[i % 4].id, description: 'Synthetic test item ' + i, category: 'PLCs & I/O', prNumber: 'PR-S-' + i, poNumber: 'PO-S-' + i, vendorId: 'ven-' + (1 + i % 6), quantity: 1 + i % 5, unitCost: 1000 + i % 900, totalCost: (1 + i % 5) * (1000 + i % 900), currency: 'AED', incoterms: 'DDP Dubai', leadTimeWeeks: 4, fatDate: '', expectedDelivery: d(i % 90), actualDelivery: '', status: sts[i % sts.length], notes: '', fiscalYear: Y, updatedAt: new Date().toISOString() });
    await DB.bulkPut('procurement_items', rows);
  }

  global.Seed = { seedIfEmpty, bulkStress, phases };
})(window);
