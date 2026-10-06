// An order is a LIST OF LINES, not a configured product.
//
// Spectacle lenses are one line for the pair, priced per pair as the catalogue
// prices them. The register still takes the lens code once per eye, so the
// line's quantity is 2 — that is a register count, not a multiplier.
// Contact lenses routinely differ between eyes — a different power, often a
// different product — so they are one line per eye (OD or OS), priced per box.
//
// A frame in one of the campaign's sets is priced at the set, and the pair of
// lenses that goes with it at the set's row for that lens (core/sets.js) — the
// draft is resolved against the campaign before it is priced.
//
// A priced line can carry a discount: one the seller chose (LINE_DISCOUNTS),
// or, when he has not chosen, a campaign discount that applies on its own. An
// add-on with a percentage, like Plus Protection, is priced from the glasses
// it covers — the frame and the spectacle lenses, after their discounts.
//
// Other add-ons, cases and solutions carry no price here. They reach the ticket
// as code, description and quantity, and the register prices them. An invented
// price is worse than no price, and a blank currency column reads as free.

import { uid, plural } from './util.js';
import { money } from './money.js';
import { lensCodeText } from './lens.js';
import { promoNumbers } from './sets.js';

export const STATUSES = [
  { id: 'draft', label: 'Draft' },
  { id: 'presented', label: 'Presented' },
  { id: 'sold', label: 'Sold' },
  { id: 'lost', label: 'Lost' },
];
export const statusLabel = (id) => STATUSES.find((s) => s.id === id)?.label ?? id;

export const EYES = { OU: 'Both eyes', OD: 'Right (OD)', OS: 'Left (OS)' };

export function newOrder() {
  return {
    id: uid(), clientId: null, lines: [], status: 'draft',
    createdOn: new Date().toISOString(), closedOn: null,
    clientNameAtSale: '', sellerEmployeeNumber: null, sellerName: null,
  };
}

/** Contact lenses: one eye, a box count. */
export const lensLine = (lens, eye, power, quantity) => ({ id: uid(), kind: 'lens', lens, eye, power: power ?? '', quantity });

/** Spectacle lenses: the pair. */
export const pairLine = (lens) => ({ id: uid(), kind: 'lens', lens, eye: 'OU', power: '', quantity: 2 });

export const frameLine = (frame, priceCents, priceSource) => ({
  id: uid(), kind: 'frame', sku: frame.sku, product: frame.product ?? frame.vendorSku ?? '',
  description: frame.description, brand: frame.brand ?? '', category: frame.category ?? '', priceCents, priceSource,
  stock: frame.stock ?? null,
});

/** `percent` set: priced as that share of the glasses on the order (Plus Protection). */
export const extraLine = (code, description, quantity = 1, stock = null, percent = null) => ({
  id: uid(), kind: 'extra', code, description, quantity, stock, ...(percent ? { percent } : {}),
});

export const isPair = (line) => line.kind === 'lens' && line.lens.family !== 'CL';
export const isShare = (line) => line.kind === 'extra' && Number(line.percent) > 0;
/** Lines a percentage add-on covers. */
export const isGlasses = (line) => line.kind === 'frame' || isPair(line);
/** Lines a seller can discount. */
export const discountable = (line) => line.kind === 'frame' || line.kind === 'lens';

/** The code the register wants typed: the POS lens code, or the true SKU. */
export function lineCode(line) {
  if (line.kind === 'lens') return lensCodeText(line.lens);
  if (line.kind === 'frame') return line.sku;
  return line.code;
}

export function lineText(line) {
  if (line.kind === 'lens') {
    return [isPair(line) || line.eye === 'OU' ? null : line.eye, line.power || null, line.lens.displayName].filter(Boolean).join(' · ');
  }
  return line.description;
}

export const lineQuantity = (line) => (line.kind === 'frame' ? 1 : line.quantity);

/** A lens in a set whose row is not settled yet: no price until he picks one. */
export const isPending = (line) => Boolean(line.setLens) && !line.setLens.id;

/** Before any discount. null means "the register prices this", which is not zero. */
function listCents(line) {
  if (line.kind === 'lens') {
    // Per pair for spectacles: a pair is two lenses. An older one-eye line is half.
    const unit = line.setLens ? line.setLens.price : line.lens.priceCents;
    if (unit == null) return null;
    return isPair(line) ? Math.round((unit * line.quantity) / 2) : unit * line.quantity;
  }
  if (line.kind === 'frame') return line.set ? line.set.price : line.priceCents;
  return null;
}

/** The percentage off a line: the seller's choice, else the campaign's. */
export function discountOf(line) {
  if (!discountable(line)) return 0;
  if (typeof line.discount === 'number') return line.discount;
  return line.auto?.percent ?? 0;
}

const sum = (rows, k) => rows.reduce((s, r) => s + (r[k] ?? 0), 0);

/**
 * Every line with its list price, discount and net, and the order's totals.
 * The one place an order is priced, so the screen, the ticket and the
 * dashboard can never disagree.
 */
export function priceOrder(order) {
  const rows = order.lines.map((line) => {
    const list = isPending(line) ? null : listCents(line);
    const discount = list != null ? discountOf(line) : 0;
    const off = Math.round((list ?? 0) * discount / 100);
    return { line, list, discount, auto: discount > 0 && typeof line.discount !== 'number', off, net: list == null ? null : list - off, pending: isPending(line) };
  });
  const covered = rows.filter((r) => r.net != null && isGlasses(r.line)).reduce((s, r) => s + r.net, 0);
  for (const r of rows) {
    if (!isShare(r.line)) continue;
    r.base = covered;
    r.list = Math.round((covered * Number(r.line.percent)) / 100) * r.line.quantity;
    r.net = r.list;
  }
  const priced = rows.filter((r) => r.net != null);
  return {
    rows,
    byId: new Map(rows.map((r) => [r.line.id, r])),
    list: sum(priced, 'list'),
    off: sum(priced, 'off'),
    total: sum(priced, 'net'),
    unpriced: rows.filter((r) => r.net == null && !r.pending).map((r) => r.line),
    pending: rows.filter((r) => r.pending).map((r) => r.line),
  };
}

export const orderTotal = (o) => priceOrder(o).total;
export const unpriced = (o) => priceOrder(o).unpriced;

export function orderTitle(o) {
  const lens = o.lines.find((l) => l.kind === 'lens');
  return lens ? lineText(lens) : o.lines[0] ? lineText(o.lines[0]) : 'Empty order';
}

export function composition(o) {
  const n = (k) => o.lines.filter((l) => l.kind === k).length;
  const bits = [];
  if (n('lens')) bits.push(plural(n('lens'), 'lens line', 'lens lines'));
  if (n('frame')) bits.push(plural(n('frame'), 'frame', 'frames'));
  if (n('extra')) bits.push(plural(n('extra'), 'extra', 'extras'));
  return bits.length ? bits.join(', ') : 'Nothing yet';
}

export const lensesOf = (o) => o.lines.filter((l) => l.kind === 'lens').map((l) => l.lens);
export const framesOf = (o) => o.lines.filter((l) => l.kind === 'frame');

const longDate = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

/** The ticket, as plain text. It goes to WhatsApp, so nothing but text. */
export function ticketText(order, clientName) {
  const p = priceOrder(order);
  const out = [];
  if (clientName) out.push(clientName);
  out.push('');
  for (const r of p.rows.filter((x) => x.net != null)) {
    const { line } = r;
    out.push(`${lineCode(line)}  ×${lineQuantity(line)}`);
    out.push(`  ${lineText(line)}`);
    if (line.set) out.push(`  ${line.set.name} (${line.set.id})`);
    if (line.setLens?.id) out.push(`  ${line.setLens.setName}: ${line.setLens.name}`);
    if (isShare(line)) out.push(`  ${line.percent}% of ${money(r.base)}: ${money(r.net)}`);
    else if (r.discount) out.push(`  ${money(r.list)} less ${r.discount}%${r.auto ? ` (${line.auto.id})` : ''}: ${money(r.net)}`);
    else out.push(`  ${money(r.net)}`);
  }
  out.push('');
  const promos = promoNumbers(order);
  if (promos.length) {
    out.push(`Promotions: ${promos.map((x) => `${x.id} ${x.name}`).join(' · ')}`);
    out.push('');
  }
  if (p.off) {
    out.push(`Before discounts: ${money(p.list)}`);
    out.push(`Discounts: −${money(p.off)}`);
  }
  out.push(`Total: ${money(p.total)}`);
  if (p.unpriced.length) {
    out.push('');
    out.push('Priced at the register:');
    for (const line of p.unpriced) out.push(`  ${lineCode(line)}  ×${lineQuantity(line)}  ${lineText(line)}`);
  }
  out.push('');
  if (order.sellerEmployeeNumber) out.push([order.sellerEmployeeNumber, order.sellerName].filter(Boolean).join(' · '));
  out.push(longDate.format(new Date(order.createdOn)));
  return out.join('\n');
}
