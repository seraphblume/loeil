// Alpha: the spreadsheet he keeps beside this app.
//
// Two shapes of its CRM tab are read. The earlier one has a row per ticket: who,
// when, the glasses and contact lens prescriptions written that day, what the
// ticket carried and what it came to. The current one has a row per client —
// Customer ID, birthdate, quality, and their spectacle, lecture (near work) and
// contact lens prescriptions — and the tickets live on the All tab.
//
// Read in the browser and merged into this phone. Client records never leave
// the device, so nothing here is ever published.
//
// THE SAME PERSON COMES BACK: repeat visits are one client. A phone number is
// not a person, though — a mother books her son on her own phone — so a client
// is the name and the phone together.

import { blankRx, blankEye, blankContactRx, blankContactEye, rxIsBlank, mirrorRx, canon, QUALITIES } from './crm.js';
import { fold, sheetDay, toCents, digits, uid } from './util.js';

/** What the Products column abbreviates, in the order a ticket reads. */
export const ALPHA_PRODUCTS = {
  EX: 'Eye exam',
  'VS/VC': 'Spectacle lenses',
  VARILUX: 'Varilux',
  AR: 'Anti-reflective',
  CRIZAL: 'Crizal',
  BLU: 'Blue filter',
  TRANSITIONS: 'Transitions',
  LC: 'Contact lenses',
  PP: 'Plus Protection',
  ACC: 'Accessories',
};

const num = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null; // a word in a figure's cell is not a figure
};
const zero = (v) => num(v) ?? 0;
export const nameKey = (s) => fold(s).replace(/\s+/g, ' ').trim();
export const clientKey = (name, phone) => `${nameKey(name)}|${digits(phone)}`;

/** `[12345] NAME SURNAME` → the number and the name as people write it. */
export function parseVendor(v, staff = []) {
  const m = String(v ?? '').match(/^\s*\[(\d+)\]\s*(.*)$/);
  if (!m) return { employeeNumber: null, name: null };
  const known = staff.find((s) => String(s.employeeNumber) === m[1]);
  const titled = m[2].toLowerCase().replace(/(^|\s)(\p{L})/gu, (_, a, b) => a + b.toUpperCase()).trim();
  return { employeeNumber: m[1], name: known?.name ?? (titled || null) };
}

/** `9053`, `9053 17276`, `Venta Normal` → promo numbers. A normal sale has none. */
export function parseDeal(v) {
  return String(v ?? '').split(/[\s,;/]+/).filter((t) => /^\d+$/.test(t));
}

/** `EX, VS/VC, CRIZAL` → the codes, and the line a person reads. */
export function parseProducts(v) {
  const codes = String(v ?? '').split(',').map((t) => t.trim().toUpperCase()).filter(Boolean);
  return { codes, text: codes.map((c) => ALPHA_PRODUCTS[c] ?? c).join(' · ') };
}

/** Finds the header row (the one that starts with Sell ID) and names its columns. */
function columns(rows) {
  const at = rows.findIndex((r) => Array.isArray(r) && String(r[0] ?? '').trim().toLowerCase() === 'sell id');
  if (at < 0) return null;
  const head = rows[at].map((h) => String(h ?? '').trim().toLowerCase());
  const col = (name, nth = 0) => {
    let seen = -1;
    for (let i = 0; i < head.length; i++) if (head[i] === name && ++seen === nth) return i;
    return -1;
  };
  // The spectacle block comes first; the contact lens block repeats its names.
  const c = {
    sell: col('sell id'), shipment: col('shipment id'), customer: col('customer'), phone: col('phone'),
    date: col('date issued'), products: col('products'),
    g: { odS: col('od sph'), odC: col('od cyl'), odA: col('od axis'), osS: col('os sph'), osC: col('os cyl'), osA: col('os axis') },
    add: col('add'), pdFar: col('pd far'), gPdNear: col('pd near'),
    cl: { odS: col('od sph', 1), odC: col('od cyl', 1), odA: col('od axis', 1), osS: col('os sph', 1), osC: col('os cyl', 1), osA: col('os axis', 1) },
    brand: col('brand'), modality: col('modality'), clAdd: col('cl add'),
    vendor: col('vendor'), price: col('price mxn'), deal: col('deal'),
  };
  if (c.customer < 0 || c.date < 0) return null;
  return { at, c };
}

const has = (row, idx) => Object.values(idx).some((i) => i >= 0 && num(row[i]) != null);

function eyeFrom(row, s, cy, ax, add) {
  return { ...blankEye(), sphere: zero(row[s]), cylinder: zero(row[cy]), axis: zero(row[ax]), addition: add ?? 0 };
}

function glassesRx(row, c, day) {
  if (!has(row, c.g)) return null;
  const add = c.add >= 0 ? zero(row[c.add]) : 0;
  const rx = blankRx();
  rx.od = eyeFrom(row, c.g.odS, c.g.odC, c.g.odA, add);
  rx.os = eyeFrom(row, c.g.osS, c.g.osC, c.g.osA, add);
  rx.issuedOn = day || null;
  rx.pdFarMM = num(row[c.pdFar]) || null;   // 0 is not a PD
  rx.pdNearMM = c.gPdNear >= 0 ? num(row[c.gPdNear]) || null : null;
  return rxIsBlank(rx) && !rx.pdFarMM ? null : rx;
}

function contactRx(row, c, day) {
  const brand = c.brand >= 0 ? String(row[c.brand] ?? '').trim() : '';
  if (!has(row, c.cl) && !brand) return null;
  const eye = (s, cy, ax) => ({ ...blankContactEye(), sphere: zero(row[s]), cylinder: zero(row[cy]), axis: zero(row[ax]) });
  // A multifocal lens's ADD is a figure, or a word (Low, Med, High) — kept as written.
  const add = c.clAdd >= 0 ? row[c.clAdd] : null;
  return {
    ...blankContactRx(),
    od: eye(c.cl.odS, c.cl.odC, c.cl.odA), os: eye(c.cl.osS, c.cl.osC, c.cl.osA),
    addition: num(add) ?? 0,
    ...(num(add) == null && String(add ?? '').trim() ? { addLabel: String(add).trim() } : {}),
    brand, modality: c.modality >= 0 ? String(row[c.modality] ?? '').trim() : '',
    issuedOn: day || null,
  };
}

/** The lecture block: near-work powers, no ADD, and the near PD. */
function nearRx(row, c, day) {
  if (!has(row, c.n) && !num(row[c.pdNear])) return null;
  const rx = blankRx();
  rx.od = eyeFrom(row, c.n.odS, c.n.odC, c.n.odA, 0);
  rx.os = eyeFrom(row, c.n.osS, c.n.osC, c.n.osA, 0);
  rx.issuedOn = day || null;
  rx.pdNearMM = num(row[c.pdNear]) || null;
  return rx;
}

/** Midday, so the day survives any timezone it is shown in. */
const atNoon = (day) => { const [y, m, d] = day.split('-').map(Number); return new Date(y, m - 1, d, 12).toISOString(); };

/**
 * The CRM table in its earlier shape (rows as arrays, the way a spreadsheet
 * reader hands them over) → one entry per person, each with their visits in
 * date order. Throws when the table is not there.
 */
export function readAlpha(rows, staff = []) {
  const found = columns(rows);
  if (!found) throw new Error('This workbook has no CRM table — the sheet with a Sell ID column.');
  const { at, c } = found;
  const people = new Map();
  let skipped = 0;
  for (const row of rows.slice(at + 1)) {
    const name = String(row?.[c.customer] ?? '').replace(/\s+/g, ' ').trim();
    const day = sheetDay(row?.[c.date]);
    if (!name || !day) { if (row?.some((v) => v !== null && v !== undefined && v !== '')) skipped++; continue; }
    const phone = digits(row[c.phone]);
    const key = clientKey(name, phone);
    if (!people.has(key)) people.set(key, { name, phone, visits: [] });
    const products = parseProducts(row[c.products]);
    const vendor = parseVendor(row[c.vendor], staff);
    people.get(key).visits.push({
      day,
      saleId: String(row[c.sell] ?? '').trim() || null,
      shipmentId: c.shipment >= 0 ? String(row[c.shipment] ?? '').trim() || null : null,
      products,
      priceCents: c.price >= 0 ? toCents(row[c.price]) : null,
      promo: c.deal >= 0 ? parseDeal(row[c.deal]) : [],
      vendor,
      rx: glassesRx(row, c, day),
      contact: contactRx(row, c, day),
    });
  }
  const list = [...people.values()];
  for (const p of list) {
    p.visits.sort((a, b) => a.day.localeCompare(b.day));
    p.rxs = { glasses: p.visits.map((v) => v.rx).filter(Boolean), near: [], contact: p.visits.map((v) => v.contact).filter(Boolean) };
  }
  return {
    source: 'Alpha',
    layout: 'tickets',
    provides: { fields: c.phone >= 0 ? ['phone'] : [], kinds: ['glasses', 'contact'] },
    people: list,
    visits: list.reduce((n, p) => n + p.visits.length, 0),
    skipped,
  };
}

// ---------------------------------------------------------------------------
// The CRM as Alpha keeps it now: a row per client, its blocks named on the row
// above the header — SPECTACLE Rx, LECTURE Rx, CONTACT LENS Rx.

const lower = (v) => String(v ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

function clientColumns(rows) {
  const at = rows.findIndex((r) => Array.isArray(r) && lower(r[0]) === 'customer id' && r.some((v) => lower(v) === 'customer'));
  if (at < 0) return null;
  const head = rows[at].map(lower);
  const groups = (rows[at - 1] ?? []).map(lower);
  const starts = { spectacle: -1, lecture: -1, contact: -1 };
  groups.forEach((g, i) => {
    if (g.startsWith('spectacle')) starts.spectacle = i;
    else if (g.startsWith('lecture')) starts.lecture = i;
    else if (g.startsWith('contact')) starts.contact = i;
  });
  // Without the block names, the eye columns come in their order: spectacle, lecture, contact lens.
  const sph = head.reduce((a, h, i) => (h === 'od sph' ? [...a, i] : a), []);
  if (starts.spectacle < 0) starts.spectacle = sph[0] ?? -1;
  if (starts.contact < 0) starts.contact = sph.length > 2 ? sph[2] : sph[1] ?? -1;
  if (starts.lecture < 0 && sph.length > 2) starts.lecture = sph[1];
  const bounds = Object.values(starts).filter((i) => i >= 0).sort((a, b) => a - b);
  const end = (from) => bounds.find((b) => b > from) ?? head.length;
  const within = (from) => (name) => {
    if (from < 0) return -1;
    for (let i = from; i < end(from); i++) if (head[i] === name) return i;
    return -1;
  };
  const first = (name) => head.indexOf(name);
  const eyes = (col) => ({ odS: col('od sph'), odC: col('od cyl'), odA: col('od axis'), osS: col('os sph'), osC: col('os cyl'), osA: col('os axis') });
  const g = within(starts.spectacle);
  const n = within(starts.lecture);
  const cl = within(starts.contact);
  const c = {
    id: first('customer id'), customer: first('customer'), phone: first('phone'), email: first('email'),
    birth: first('birthdate'), quality: first('quality'), date: first('date issued'),
    g: eyes(g), add: g('add'), pdFar: g('pd far'),
    n: eyes(n), pdNear: n('pd near'),
    cl: eyes(cl), brand: cl('brand'), modality: cl('modality'), clAdd: cl('cl add'),
  };
  return c.customer < 0 ? null : { at, c };
}

/** Is this the CRM as Alpha keeps it now — a row per client? */
export const isClientLayout = (rows) => Boolean(clientColumns(rows));

const text = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
const quality = (v) => QUALITIES.find((q) => q.toLowerCase() === text(v).toLowerCase()) ?? '';

/**
 * The current CRM → one entry per person with what Alpha knows of them and
 * each prescription it has, ready for their tickets (`readTickets`).
 */
export function readClients(rows) {
  const found = clientColumns(rows);
  if (!found) throw new Error('This workbook has no CRM table — the sheet with a Customer ID column.');
  const { at, c } = found;
  const people = new Map();
  let skipped = 0;
  for (const row of rows.slice(at + 1)) {
    const name = text(row?.[c.customer]);
    if (!name) { if (row?.slice(0, c.customer + 3).some((v) => v !== null && v !== undefined && v !== '')) skipped++; continue; }
    const day = sheetDay(row[c.date]);
    const phone = digits(row[c.phone]);
    const key = clientKey(name, phone);
    if (!people.has(key)) people.set(key, { name, phone, email: '', customerId: '', birthdate: null, quality: '', rxs: { glasses: [], near: [], contact: [] }, visits: [] });
    const p = people.get(key);
    // The same person on two rows is one client: the first value of each field stands.
    p.email ||= c.email >= 0 ? text(row[c.email]) : '';
    p.customerId ||= c.id >= 0 ? digits(row[c.id]) : '';
    p.birthdate ||= c.birth >= 0 ? sheetDay(row[c.birth]) || null : null;
    p.quality ||= c.quality >= 0 ? quality(row[c.quality]) : '';
    const g = glassesRx(row, c, day);
    const n = c.n.odS >= 0 ? nearRx(row, c, day) : null;
    const cl = contactRx(row, c, day);
    if (g) p.rxs.glasses.push(g);
    if (n) p.rxs.near.push(n);
    if (cl) p.rxs.contact.push(cl);
  }
  const list = [...people.values()];
  const fields = [['phone', c.phone], ['email', c.email], ['customerId', c.id], ['birthdate', c.birth], ['quality', c.quality]].filter(([, i]) => i >= 0).map(([k]) => k);
  const kinds = ['glasses', ...(c.n.odS >= 0 ? ['near'] : []), ...(c.cl.odS >= 0 || c.brand >= 0 ? ['contact'] : [])];
  return { source: 'Alpha', layout: 'clients', provides: { fields, kinds }, people: list, visits: 0, skipped };
}

/** The All tab's header row (it starts with Sell ID) and its columns. */
function ticketColumns(rows) {
  const at = rows.findIndex((r) => Array.isArray(r) && lower(r[0]) === 'sell id');
  if (at < 0) return null;
  const head = rows[at].map(lower);
  const col = (name) => head.indexOf(name);
  const c = {
    sell: col('sell id'), shipment: col('shipment id'), customer: col('customer'), date: col('date issued'),
    vendor: col('vendor'), price: col('price mxn'), deal: col('deal'), products: col('type & branded'),
  };
  if (c.products < 0) c.products = col('products');
  return c.customer < 0 || c.date < 0 ? null : { at, c };
}

/** Every ticket on the All tab, by Sell ID: who, when, who sold it, what it carried. */
export function readTickets(rows, staff = []) {
  const found = rows && ticketColumns(rows);
  if (!found) return [];
  const { at, c } = found;
  const out = [];
  for (const row of rows.slice(at + 1)) {
    const saleId = text(row?.[c.sell]);
    const name = text(row?.[c.customer]);
    const day = sheetDay(row?.[c.date]);
    if (!saleId || !name || !day) continue;
    out.push({
      name, day, saleId,
      shipmentId: c.shipment >= 0 ? text(row[c.shipment]) || null : null,
      products: parseProducts(row[c.products]),
      priceCents: c.price >= 0 ? toCents(row[c.price]) : null,
      promo: c.deal >= 0 ? parseDeal(row[c.deal]) : [],
      vendor: parseVendor(row[c.vendor], staff),
      rx: null,
    });
  }
  return out;
}

/**
 * Each person's tickets from the All tab, matched by name — only the ones
 * `seller` sold, when there is a seller: the figures on this phone are theirs.
 */
export function attachTickets(alpha, tickets, seller = null) {
  const byName = new Map();
  for (const t of tickets) {
    if (seller && t.vendor.employeeNumber !== String(seller)) continue;
    const k = nameKey(t.name);
    if (!byName.has(k)) byName.set(k, []);
    byName.get(k).push(t);
  }
  for (const p of alpha.people) p.visits = (byName.get(nameKey(p.name)) ?? []).sort((a, b) => a.day.localeCompare(b.day));
  alpha.visits = alpha.people.reduce((n, p) => n + p.visits.length, 0);
  return alpha;
}


/** One past ticket as a sold order. The line is the ticket as Alpha recorded it. */
export function historyOrder(v, client) {
  const id = v.saleId ? `alpha-${v.saleId}` : `alpha-${uid()}`;
  const on = atNoon(v.day);
  return {
    id,
    clientId: client.id,
    status: 'sold',
    createdOn: on,
    closedOn: on,
    clientNameAtSale: client.name,
    sellerEmployeeNumber: v.vendor.employeeNumber,
    sellerName: v.vendor.name,
    source: 'alpha',
    saleId: v.saleId,
    shipmentId: v.shipmentId,
    promo: v.promo,
    rx: v.rx,
    lines: [{
      id: `${id}-1`, kind: 'history', code: v.products.codes.join(', '),
      description: v.products.text || 'Sale', priceCents: v.priceCents, quantity: 1,
    }],
  };
}

const KINDS = ['glasses', 'near', 'contact'];
const FIELDS = ['phone', 'email', 'customerId', 'birthdate', 'quality'];
const known = (c) => canon([...FIELDS.map((k) => c[k] || null), c.prescription ?? null, c.nearRx ?? null, c.contactRx ?? null, (c.rxHistory ?? []).map((h) => [h.kind, h.rx])]);
const earliest = (p) => [...p.visits.map((v) => v.day), ...KINDS.flatMap((k) => (p.rxs[k] ?? []).map((r) => r.issuedOn))].filter(Boolean).sort()[0] ?? null;

/**
 * What the import does to this phone, worked out before anything changes:
 * the merged lists, and the counts the preview shows.
 *
 * THE WORKBOOK IS THE SOURCE OF RECORD. Someone already here takes what Alpha
 * has for them — phone, email, Customer ID, birthdate, quality, and each
 * prescription it has a block for (the one it replaces goes into their
 * history) — and keeps what Alpha has no column for: notes, favourite, orders.
 * Clients Alpha does not list stay as they are. Their tickets become sales,
 * once each.
 */
export function mergeAlpha(current, alpha) {
  const clients = current.clients.map((c) => ({ ...c }));
  const byKey = new Map(clients.map((c) => [clientKey(c.name, c.phone), c]));
  const byName = new Map();
  for (const c of clients) if (!digits(c.phone)) byName.set(nameKey(c.name), c);
  const named = new Map();
  for (const c of clients) { const k = nameKey(c.name); named.set(k, named.has(k) ? null : c); } // null: more than one by that name
  const byId = new Map(clients.filter((c) => c.customerId).map((c) => [`${c.customerId}|${nameKey(c.name)}`, c]));
  const taken = new Set();
  const haveSale = new Set(current.orders.flatMap((o) => [o.id, o.saleId && `alpha-${o.saleId}`]).filter(Boolean));
  const orders = [...current.orders];
  const counts = { clients: 0, matched: 0, updated: 0, orders: 0, already: 0, history: 0 };
  const provides = alpha.provides ?? { fields: ['phone'], kinds: ['glasses', 'contact'] };

  for (const p of alpha.people) {
    // A Customer ID is shared by a family, so it counts together with the name.
    // The name alone is enough when only one client on this phone has it.
    let client = [
      p.customerId && byId.get(`${p.customerId}|${nameKey(p.name)}`),
      byKey.get(clientKey(p.name, p.phone)), byName.get(nameKey(p.name)), named.get(nameKey(p.name)),
    ].find((c) => c && !taken.has(c.id)) ?? null;
    const fresh = !client;
    if (fresh) {
      const first = earliest(p);
      client = {
        id: uid(), name: p.name, phone: p.phone, email: '', customerId: '', birthdate: null, quality: '', notes: '', isFavourite: false,
        prescription: blankRx(), nearRx: null, contactRx: null, rxHistory: [],
        createdOn: first ? atNoon(first) : new Date().toISOString(),
      };
      clients.push(client);
      byKey.set(clientKey(client.name, client.phone), client);
      counts.clients++;
    } else counts.matched++;
    taken.add(client.id);
    const before = known(client);
    const historyBefore = (client.rxHistory ?? []).length;
    for (const k of provides.fields) client[k] = p[k] || (k === 'birthdate' ? null : '');
    let next = client;
    for (const kind of provides.kinds) next = mirrorRx(next, kind, p.rxs?.[kind] ?? []);
    Object.assign(client, next);
    counts.history += Math.max(0, (client.rxHistory ?? []).length - historyBefore);
    if (!fresh && known(client) !== before) counts.updated++;
    if (client.customerId) byId.set(`${client.customerId}|${nameKey(client.name)}`, client);
    for (const v of p.visits) {
      const o = historyOrder(v, client);
      if (haveSale.has(o.id)) { counts.already++; continue; }
      haveSale.add(o.id);
      orders.push(o);
      counts.orders++;
    }
  }
  return { clients, orders, counts };
}
