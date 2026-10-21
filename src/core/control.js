// Control: the orders on their way to the client (Delivery) and the visits
// that ended without a sale (Follow Up) — Alpha's Control sheet, on the phone.
//
// THE WORKBOOK IS THE SOURCE. Rows come in only by importing the Alpha workbook,
// never from a checkout here, and an import puts this seller's rows back exactly
// as the workbook has them: its Status, Promised, Delivered and Pending win over
// anything changed on the phone since. Each phone keeps only its own seller's rows.

import { sheetDay, toCents, digits, dayToDate, isoDay, cellText } from './util.js';
import { parseVendor } from './alpha.js';

/** The statuses, in the order Alpha's dropdown lists them. */
export const DELIVERY_STATUSES = ['In Production', 'Sent to Store', 'Ready for Pickup', 'Delivered', 'Delayed'];
export const DELIVERED = 'Delivered';

/** The WhatsApp messages, as Alpha's Config has them; an import brings the workbook's own. */
export const DEFAULT_MESSAGES = {
  ready: 'Hola {customer} gusto saludarle por este medio! Su pedido {order} ya está listo en óptica para su entrega.\n\nLe esperamos con mucho gusto, cualquier duda o aclaración estamos atentos.☀️\n\nHorario de atención de 11:30 AM a 08:00 PM. Agradecemos su preferencia.\nÓpticas Devlyn, Plaza Agora.',
  newDate: 'Hola {customer}, le saludamos de Ópticas Devlyn. Le informamos que la fecha de entrega de su pedido {order} cambió al {date}.\n\nLe avisaremos en cuanto esté listo; cualquier duda o aclaración estamos atentos.☀️\n\nHorario de atención de 11:30 AM a 08:00 PM. Agradecemos su comprensión.\nÓpticas Devlyn, Plaza Agora.',
  review: 'Hola {customer}, ¡gracias por recoger su pedido {order} con nosotros! Esperamos que lo disfrute mucho.\n\n¿Nos apoyaría con una reseña en este enlace? Nos ayuda muchísimo ☺️\n{review}\n\nÓpticas Devlyn, Plaza Agora.',
  reviewLink: 'https://search.google.com/local/writereview?placeid=ChIJwXqatL3jLYQRhWxiAJMXW9M&source=g.page.m.ia._&laa=nmx-review-solicitation-ia2',
};

export const blankControl = () => ({ deliveries: [], followUps: [], messages: null, followUpMessages: null, importedAt: null, vendorFilter: null });

// ---------------------------------------------------------------------------
// The rules the sheet's script keeps, kept here the same way.

const today = () => isoDay(new Date());
const daysBetween = (from, to) => Math.round((dayToDate(to) - dayToDate(from)) / 86400000);

/**
 * Promised minus Delivered — or minus today while it is not delivered. A
 * delivered row keeps how early (positive) or late (negative) it went out.
 */
export function daysLeft(row, now = today()) {
  if (!row?.promised) return null;
  return daysBetween(row.delivered ?? now, row.promised);
}

export const isOpen = (row) => row.status !== DELIVERED;

/**
 * A change to a delivery row, with what follows from it: turning Delivered
 * stamps today's date, leaving Delivered clears it, a delivered date makes the
 * row Delivered, and the first promised date is kept as the first promise.
 */
export function editDelivery(row, patch, now = today()) {
  const next = { ...row, ...patch };
  if ('status' in patch) {
    if (next.status === DELIVERED && !next.delivered) next.delivered = now;
    if (next.status !== DELIVERED) next.delivered = null;
  } else if ('delivered' in patch && next.delivered) {
    next.status = DELIVERED;
  }
  if ('promised' in patch && next.promised && !next.firstPromise) next.firstPromise = next.promised;
  return next;
}

/** Which message the row's WhatsApp sends: ready, new date, the review request — or none, just the chat. */
export function messageKind(row) {
  if (row.status === DELIVERED) return 'review';
  if (row.status === 'Ready for Pickup') return 'ready';
  if (row.promised && row.firstPromise && row.promised !== row.firstPromise) return 'newDate';
  return null;
}

const ddmmyyyy = (day) => (day ? day.split('-').reverse().join('/') : '');
const ddmmyy = (day) => (day ? `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(2, 4)}` : '');

/** The message with the row filled in: {customer}, {order}, {date}, {review}. */
export function fillMessage(template, row, messages = DEFAULT_MESSAGES) {
  return String(template ?? '')
    .replaceAll('{customer}', row.customer ?? '')
    .replaceAll('{order}', row.shipmentId ?? '')
    .replaceAll('{date}', ddmmyyyy(row.promised))
    .replaceAll('{review}', messages.reviewLink ?? DEFAULT_MESSAGES.reviewLink);
}

/**
 * A chat with a Mexican mobile (52 and the ten digits), the message filled in.
 * Straight to api.whatsapp.com: the wa.me short link redirects there and the
 * redirect mangles four-byte characters, so every emoji arrived as �.
 */
export function whatsappLink(phone, message = null) {
  const d = digits(phone);
  if (d.length < 10) return null;
  const n = d.length === 10 ? '52' + d : d;
  return `https://api.whatsapp.com/send?phone=${n}${message ? `&text=${encodeURIComponent(message)}` : ''}`;
}

/** The row's WhatsApp: the link and what it does. */
export function deliveryWhatsApp(row, phone, messages) {
  const m = { ...DEFAULT_MESSAGES, ...(messages ?? {}) };
  const kind = messageKind(row);
  return { kind, link: whatsappLink(phone, kind ? fillMessage(m[kind], row, m) : null) };
}

// ---------------------------------------------------------------------------
// Follow Up: a message per preset, as Alpha's Config writes them.

/** Alpha's PROPER(first word): `MARIA de los Angeles` → `Maria`. */
export function firstName(full) {
  const w = String(full ?? '').trim().split(/\s+/)[0] ?? '';
  return w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : '';
}

/** The preset's message with the row filled in: {name}, {customer}, {promos}, {until}. */
export function fillFollowUp(template, row, fu) {
  return String(template ?? '')
    .replaceAll('{promos}', fu?.promos ?? '')
    .replaceAll('{until}', ddmmyy(fu?.until))
    .replaceAll('{name}', firstName(row.customer))
    .replaceAll('{customer}', String(row.customer ?? '').trim());
}

/** The message a row's preset sends, or null: the row has no preset, or the workbook has no message for it. */
export function followUpMessage(row, fu) {
  const m = row?.preset ? (fu?.presets ?? []).find((p) => p.name === row.preset) : null;
  return m?.text ? fillFollowUp(m.text, row, fu) : null;
}

/** The row's WhatsApp: the preset's message (Send), else just the chat. */
export function followUpWhatsApp(row, phone, fu) {
  const message = followUpMessage(row, fu);
  return { message, link: whatsappLink(phone, message) };
}

/** Whose rows these are: this seller's — and on the admin's phone, the ones nobody could be matched to. */
export function rowsFor(rows, seller, admin = false) {
  if (!seller) return rows;
  return rows.filter((r) => r.sellerEmployeeNumber === String(seller) || (admin && !r.sellerEmployeeNumber));
}

// ---------------------------------------------------------------------------
// Reading the workbook

const lower = (v) => String(v ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
const text = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
const day = (v) => sheetDay(v) || null;

/**
 * The Control tab (rows as arrays) → its two lists, before anyone is matched
 * to a seller. The Delivered cell of an open order holds a live today's date
 * (=TODAY()); the reader blanks those before they get here.
 */
export function readControl(rows) {
  const at = (rows ?? []).findIndex((r) => Array.isArray(r) && lower(r[0]) === 'sell id');
  if (at < 0) return null;
  const head = rows[at].map(lower);
  const starts = head.reduce((a, h, i) => (h === 'sell id' ? [...a, i] : a), []);
  const block = (from, to) => (name) => { for (let i = from; i < to; i++) if (head[i] === name) return i; return -1; };
  const d = block(starts[0], starts[1] ?? head.length);
  const D = {
    sell: d('sell id'), shipment: d('shipment id'), customer: d('customer'), phone: d('phone'), issued: d('date issued'),
    status: d('status'), promised: d('promised'), delivered: d('delivered'), pending: d('pending'), first: d('first promise'),
  };
  const deliveries = [];
  const followUps = [];
  for (const row of rows.slice(at + 1)) {
    const saleId = text(row?.[D.sell]);
    if (!saleId) continue;
    const pending = D.pending >= 0 ? toCents(row[D.pending]) : null;
    deliveries.push({
      saleId,
      shipmentId: text(row[D.shipment]) || null,
      customer: text(row[D.customer]),
      phone: D.phone >= 0 ? digits(row[D.phone]) : '',
      issuedOn: day(row[D.issued]),
      status: text(row[D.status]),
      promised: D.promised >= 0 ? day(row[D.promised]) : null,
      delivered: D.delivered >= 0 ? day(row[D.delivered]) : null,
      pendingCents: pending || null,
      firstPromise: D.first >= 0 ? day(row[D.first]) : null,
      sellerEmployeeNumber: null, sellerName: null,
    });
  }
  let vendorFilter = null;
  if (starts[1] != null) {
    const f = block(starts[1], head.length);
    const F = {
      sell: f('sell id'), customer: f('customer'), customerId: f('customer id'), phone: f('phone'),
      visited: f('date visited'), vendor: f('vendor'), preset: f('preset') >= 0 ? f('preset') : f('plan id'),
    };
    for (const row of rows.slice(at + 1)) {
      const saleId = text(row?.[F.sell]);
      if (!saleId) continue;
      followUps.push({
        saleId,
        customer: text(row[F.customer]),
        customerId: F.customerId >= 0 ? digits(row[F.customerId]) : '',
        phone: F.phone >= 0 ? digits(row[F.phone]) : '',
        visitedOn: F.visited >= 0 ? day(row[F.visited]) : null,
        vendor: F.vendor >= 0 ? text(row[F.vendor]) : '',
        preset: F.preset >= 0 ? text(cellText(row[F.preset])) : '',
        sellerEmployeeNumber: null, sellerName: null,
      });
    }
    // The list is rebuilt for one vendor or for All: the cell after "Vendor" above the Follow Up block.
    const above = (rows[at - 1] ?? []).map(lower);
    const v = above.findIndex((h, i) => i >= starts[1] && h === 'vendor');
    if (v >= 0) vendorFilter = text(rows[at - 1][v + 1]) || null;
  }
  return { deliveries, followUps, vendorFilter };
}

/** Config's vendor table — `[99709]`, the name as the register writes it, the short name — by short name. */
export function readVendors(configRows, staff = []) {
  const out = new Map();
  for (const r of configRows ?? []) {
    const code = String(r?.[0] ?? '').match(/^\s*\[(\d+)\]\s*$/);
    if (!code) continue;
    const short = lower(r[2]);
    const known = staff.find((s) => String(s.employeeNumber) === code[1]);
    if (short) out.set(short, { employeeNumber: code[1], name: known?.name ?? parseVendor(r[1], staff).name ?? text(r[2]) });
  }
  return out;
}

/** Config's Delivery messages, found by their labels. Null when the workbook has none. */
export function readMessages(configRows) {
  const m = {};
  for (const r of configRows ?? []) {
    const k = lower(r?.[0]);
    const v = String(r?.[1] ?? '').trim();
    if (!v) continue;
    if (k.startsWith('ready for pickup')) m.ready = v;
    else if (k.startsWith('promised date changed')) m.newDate = v;
    else if (k.startsWith('delivered') && k.includes('review')) m.review = v;
    else if (k.startsWith('google review link')) m.reviewLink = v;
  }
  return Object.keys(m).length ? m : null;
}

/**
 * Config's Follow Up messages: under the label, Promotions ({promos}),
 * Promotions valid until ({until}), then a message per preset until No preset.
 * Null when the workbook has none.
 */
export function readFollowUpMessages(configRows) {
  const rows = configRows ?? [];
  const at = rows.findIndex((r) => lower(r?.[0]) === 'follow up messages');
  if (at < 0) return null;
  const out = { promos: '', until: null, presets: [] };
  for (const r of rows.slice(at + 1)) {
    const k = text(r?.[0]);
    if (!k || lower(k) === 'no preset') break;
    const v = String(r?.[1] ?? '').trim();
    if (lower(k) === 'promotions') out.promos = v;
    else if (lower(k) === 'promotions valid until') out.until = day(r?.[1]);
    else if (v) out.presets.push({ name: k, text: v });
  }
  return out.presets.length ? out : null;
}

/**
 * Who sold each row: the vendor on the All tab for its Sell ID, else (Follow
 * Up) its Vendor column through Config's short names.
 */
export function assignSellers(control, tickets, vendors = new Map()) {
  const bySale = new Map(tickets.map((t) => [t.saleId, t.vendor]));
  const who = (row, short) => {
    const v = bySale.get(row.saleId) ?? (short ? vendors.get(lower(short)) : null);
    return { ...row, sellerEmployeeNumber: v?.employeeNumber ?? null, sellerName: v?.name ?? null };
  };
  return {
    ...control,
    deliveries: control.deliveries.map((r) => who(r)),
    followUps: control.followUps.map((r) => who(r, r.vendor)),
  };
}

/** Merge a backup's Control into this phone's: rows it does not have are added; everything here stays. */
export function mergeControl(here, incoming) {
  if (!incoming) return here;
  const add = (a, b) => [...a, ...b.filter((r) => !a.some((x) => x.saleId === r.saleId))];
  return {
    ...here,
    deliveries: add(here.deliveries, incoming.deliveries ?? []),
    followUps: add(here.followUps, incoming.followUps ?? []),
    messages: here.messages ?? incoming.messages ?? null,
    followUpMessages: here.followUpMessages ?? incoming.followUpMessages ?? null,
    importedAt: here.importedAt ?? incoming.importedAt ?? null,
  };
}

/** A backup's Control, made safe to keep. */
export function normalizeControl(c) {
  if (!c || typeof c !== 'object') return null;
  const s = (v) => (v == null ? null : String(v));
  return {
    deliveries: (c.deliveries ?? []).filter((r) => r?.saleId).map((r) => ({
      saleId: String(r.saleId), shipmentId: s(r.shipmentId), customer: String(r.customer ?? ''), phone: String(r.phone ?? ''),
      issuedOn: s(r.issuedOn), status: String(r.status ?? ''), promised: s(r.promised), delivered: s(r.delivered),
      pendingCents: r.pendingCents == null ? null : Number(r.pendingCents), firstPromise: s(r.firstPromise),
      sellerEmployeeNumber: s(r.sellerEmployeeNumber), sellerName: s(r.sellerName),
    })),
    followUps: (c.followUps ?? []).filter((r) => r?.saleId).map((r) => ({
      saleId: String(r.saleId), customer: String(r.customer ?? ''), customerId: String(r.customerId ?? ''), phone: String(r.phone ?? ''),
      visitedOn: s(r.visitedOn), vendor: String(r.vendor ?? ''), preset: String(r.preset ?? r.planId ?? ''),
      sellerEmployeeNumber: s(r.sellerEmployeeNumber), sellerName: s(r.sellerName),
    })),
    messages: c.messages && typeof c.messages === 'object' ? { ...c.messages } : null,
    followUpMessages: c.followUpMessages?.presets ? {
      promos: String(c.followUpMessages.promos ?? ''), until: s(c.followUpMessages.until),
      presets: c.followUpMessages.presets.filter((p) => p?.name).map((p) => ({ name: String(p.name), text: String(p.text ?? '') })),
    } : null,
    importedAt: s(c.importedAt),
    vendorFilter: s(c.vendorFilter),
  };
}
