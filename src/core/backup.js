// Backups in, backups out.
//
// There is no sync and no account, so a lost phone or a browser that clears its
// storage is otherwise the end of every client record. Export is not optional.
//
// IMPORT READS THREE SHAPES: this app's own, the iOS app's export, and the
// Android app's export — so moving from the native apps loses nothing.

import { blankRx, blankEye } from './crm.js';
import { uid } from './util.js';

export const BACKUP_FORMAT = 'loeil-backup';

export function exportBackup({ clients, orders }) {
  return { format: BACKUP_FORMAT, version: 1, exportedAt: new Date().toISOString(), clients, orders };
}

const STATUS = { DRAFT: 'draft', PRESENTED: 'presented', SOLD: 'sold', LOST: 'lost' };
const EYE = { RIGHT: 'OD', LEFT: 'OS', BOTH: 'OU', OD: 'OD', OS: 'OS', OU: 'OU' };
const FAMILY = { SINGLE_VISION: 'SV', MULTIFOCAL: 'MF', CONTACT_LENS: 'CL', SV: 'SV', MF: 'MF', CL: 'CL' };

const day = (v) => (v ? String(v).slice(0, 10) : null);
const iso = (v) => (v ? new Date(v).toISOString() : null);
const num = (v, d = 0) => (v === null || v === undefined || v === '' ? d : Number(v));
const opt = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

function eye(e) {
  const b = blankEye();
  if (!e) return b;
  return {
    ...b,
    sphere: num(e.sphere), cylinder: num(e.cylinder), axis: num(e.axis), addition: num(e.addition),
    pdFar: opt(e.pdFar), pdNear: opt(e.pdNear),
    samples: Array.isArray(e.samples) ? e.samples.map((s) => ({ sphere: num(s.sphere), cylinder: num(s.cylinder), axis: num(s.axis), confidence: opt(s.confidence) })) : [],
    confidence: opt(e.confidence),
  };
}

function rx(p) {
  const b = blankRx();
  if (!p) return b;
  return {
    ...b,
    od: eye(p.od), os: eye(p.os), issuedOn: day(p.issuedOn), notes: p.notes ?? '',
    pdFarMM: opt(p.pdFarMM), pdNearMM: opt(p.pdNearMM),
    vertexDistanceMM: opt(p.vertexDistanceMM), workingDistanceCM: opt(p.workingDistanceCM),
    ticketNumber: p.ticketNumber ?? null, site: p.site ?? null, expiryOverride: day(p.expiryOverride),
  };
}

function client(c) {
  return {
    id: String(c.id ?? uid()), name: c.name ?? '', phone: c.phone ?? '', email: c.email ?? '',
    prescription: rx(c.prescription), notes: c.notes ?? '', isFavourite: Boolean(c.isFavourite),
    createdOn: iso(c.createdOn) ?? new Date().toISOString(),
  };
}

function lens(cfg) {
  return {
    family: FAMILY[cfg.family] ?? cfg.family,
    rowId: cfg.rowId ?? cfg.rowID ?? '',
    displayName: cfg.displayName ?? '',
    posCode: cfg.posCode ?? '',
    priceCents: num(cfg.priceCents),
    attributes: (cfg.attributes ?? []).map((a) => ({ key: '', name: a.name, code: a.code, label: a.label, pos: a.pos ?? a.posLabel ?? a.label })),
    available: cfg.available ?? cfg.isAvailable ?? true,
    promoKey: cfg.promoKey ?? null,
  };
}

/** One order line, from any of the three shapes. */
function line(l) {
  // Web: { kind: 'lens', ... }
  if (l.kind) return { ...l, id: String(l.id ?? uid()) };
  // iOS: { lens: {...} } / { frame: {...} } / { extra: {...} }
  if (l.lens) return { id: String(l.lens.id ?? uid()), kind: 'lens', lens: lens(l.lens.configuration), eye: EYE[l.lens.eye] ?? 'OU', power: l.lens.power ?? '', quantity: num(l.lens.quantity, 1) };
  if (l.frame) {
    const it = l.frame.item ?? {};
    return { id: String(l.frame.id ?? uid()), kind: 'frame', sku: it.trueSKU ?? '', product: it.vendorSKU ?? '', description: it.description ?? '', brand: '', priceCents: num(l.frame.priceCents), priceSource: 'tag', stock: opt(it.stock) };
  }
  if (l.extra) return { id: String(l.extra.id ?? uid()), kind: 'extra', code: l.extra.code ?? '', description: l.extra.description ?? '', quantity: num(l.extra.quantity, 1), stock: opt(l.extra.stock) };
  // Android: { type: "…OrderLine.Lens", … }
  const type = String(l.type ?? '');
  if (type.endsWith('Lens')) return { id: String(l.id ?? uid()), kind: 'lens', lens: lens(l.configuration), eye: EYE[l.eye] ?? 'OU', power: l.power ?? '', quantity: num(l.quantity, 1) };
  if (type.endsWith('Frame')) return { id: String(l.id ?? uid()), kind: 'frame', sku: l.trueSku ?? '', product: '', description: l.description ?? '', brand: '', priceCents: num(l.priceCents), priceSource: 'tag', stock: opt(l.stockOnHand) };
  if (type.endsWith('Extra')) return { id: String(l.id ?? uid()), kind: 'extra', code: l.code ?? '', description: l.description ?? '', quantity: num(l.quantity, 1), stock: opt(l.stock) };
  return null;
}

function order(o) {
  return {
    id: String(o.id ?? uid()),
    clientId: o.clientId ?? o.clientID ?? null,
    lines: (o.lines ?? []).map(line).filter(Boolean),
    status: STATUS[o.status] ?? o.status ?? 'draft',
    createdOn: iso(o.createdOn) ?? new Date().toISOString(),
    closedOn: iso(o.closedOn),
    clientNameAtSale: o.clientNameAtSale ?? '',
    sellerEmployeeNumber: o.sellerEmployeeNumber ?? null,
    sellerName: o.sellerName ?? null,
  };
}

/** Any supported backup → `{ clients, orders, source }`. Throws on anything else. */
export function readBackup(json) {
  const data = typeof json === 'string' ? JSON.parse(json) : json;
  if (!data || !Array.isArray(data.clients) || !Array.isArray(data.orders)) {
    throw new Error('This file is not an L’Œil backup.');
  }
  const source = data.format === BACKUP_FORMAT ? 'web'
    : data.orders.some((o) => (o.lines ?? []).some((l) => l.type)) ? 'Android'
      : data.orders.some((o) => 'clientID' in o) ? 'iOS' : 'web';
  return { clients: data.clients.map(client), orders: data.orders.map(order), source };
}

/** Merge without overwriting: anything already on this phone wins. */
export function mergeBackup(current, incoming) {
  const haveC = new Set(current.clients.map((c) => c.id));
  const haveO = new Set(current.orders.map((o) => o.id));
  const clients = [...current.clients, ...incoming.clients.filter((c) => !haveC.has(c.id))];
  const orders = [...current.orders, ...incoming.orders.filter((o) => !haveO.has(o.id))];
  return {
    clients, orders,
    added: { clients: clients.length - current.clients.length, orders: orders.length - current.orders.length },
  };
}
