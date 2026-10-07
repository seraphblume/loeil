// Alpha: the spreadsheet he kept before this app. Its CRM tab has one row per
// ticket: who, when, the glasses and contact lens prescriptions written that
// day, what the ticket carried and what it came to.
//
// Read in the browser and merged into this phone. Client records never leave
// the device, so nothing here is ever published.
//
// THE SAME PERSON COMES BACK: repeat visits are one client. A phone number is
// not a person, though — a mother books her son on her own phone — so a client
// is the name and the phone together.

import { blankRx, blankEye, rxIsBlank, contactIsBlank } from './crm.js';
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

const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
const zero = (v) => num(v) ?? 0;
const nameKey = (s) => fold(s).replace(/\s+/g, ' ').trim();
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
    add: col('add'), pdFar: col('pd far'), pdNear: col('pd near'),
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
  rx.pdNearMM = num(row[c.pdNear]) || null;
  return rxIsBlank(rx) && !rx.pdFarMM ? null : rx;
}

function contactRx(row, c, day) {
  const brand = c.brand >= 0 ? String(row[c.brand] ?? '').trim() : '';
  if (!has(row, c.cl) && !brand) return null;
  const eye = (s, cy, ax) => ({ sphere: zero(row[s]), cylinder: zero(row[cy]), axis: zero(row[ax]) });
  return {
    od: eye(c.cl.odS, c.cl.odC, c.cl.odA), os: eye(c.cl.osS, c.cl.osC, c.cl.osA),
    addition: c.clAdd >= 0 ? zero(row[c.clAdd]) : 0,
    brand, modality: c.modality >= 0 ? String(row[c.modality] ?? '').trim() : '',
    issuedOn: day || null,
  };
}

/** Midday, so the day survives any timezone it is shown in. */
const atNoon = (day) => { const [y, m, d] = day.split('-').map(Number); return new Date(y, m - 1, d, 12).toISOString(); };

/**
 * The CRM table (rows as arrays, the way a spreadsheet reader hands them over)
 * → one entry per person, each with their visits in date order.
 * Throws when the table is not there.
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
  for (const p of people.values()) p.visits.sort((a, b) => a.day.localeCompare(b.day));
  const list = [...people.values()];
  return {
    source: 'Alpha',
    people: list,
    visits: list.reduce((n, p) => n + p.visits.length, 0),
    skipped,
  };
}

/** The newest of two prescriptions; the one already here when neither is dated. */
function newer(here, there, blank) {
  if (!there) return here;
  if (!here || blank(here)) return there;
  if (there.issuedOn && (!here.issuedOn || there.issuedOn > here.issuedOn)) return there;
  return here;
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

/**
 * What the import does to this phone, worked out before anything changes:
 * the merged lists, and the counts the preview shows.
 */
export function mergeAlpha(current, alpha) {
  const clients = current.clients.map((c) => ({ ...c }));
  const byKey = new Map(clients.map((c) => [clientKey(c.name, c.phone), c]));
  const byName = new Map();
  for (const c of clients) if (!digits(c.phone)) byName.set(nameKey(c.name), c);
  const haveSale = new Set(current.orders.flatMap((o) => [o.id, o.saleId && `alpha-${o.saleId}`]).filter(Boolean));
  const orders = [...current.orders];
  const counts = { clients: 0, matched: 0, updated: 0, orders: 0, already: 0 };

  for (const p of alpha.people) {
    let client = byKey.get(clientKey(p.name, p.phone)) ?? byName.get(nameKey(p.name));
    const lastRx = [...p.visits].reverse().find((v) => v.rx)?.rx ?? null;
    const lastCl = [...p.visits].reverse().find((v) => v.contact)?.contact ?? null;
    if (!client) {
      client = {
        id: uid(), name: p.name, phone: p.phone, email: '', notes: '', isFavourite: false,
        prescription: lastRx ?? blankRx(), contactRx: lastCl,
        createdOn: atNoon(p.visits[0].day),
      };
      clients.push(client);
      byKey.set(clientKey(client.name, client.phone), client);
      counts.clients++;
    } else {
      counts.matched++;
      const before = JSON.stringify([client.phone, client.prescription, client.contactRx ?? null]);
      if (!digits(client.phone) && p.phone) client.phone = p.phone;
      client.prescription = newer(client.prescription, lastRx, rxIsBlank);
      client.contactRx = newer(client.contactRx ?? null, lastCl, contactIsBlank);
      if (JSON.stringify([client.phone, client.prescription, client.contactRx ?? null]) !== before) counts.updated++;
    }
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
