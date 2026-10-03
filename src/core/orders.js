// An order is a LIST OF LINES, not a configured product.
//
// Contact lens orders routinely differ between eyes — a different power, often
// a different product — so they are one line per eye with a box count.
// Spectacle lenses are one configuration, quantity 2, both eyes.
//
// Cases, solutions and accessories carry no price here. They reach the ticket
// as code, description and quantity, and the register prices them. An invented
// price is worse than no price, and a blank currency column reads as free.

import { uid, plural } from './util.js';
import { money } from './money.js';
import { lensCodeText } from './lens.js';

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

export const lensLine = (lens, eye, power, quantity) => ({ id: uid(), kind: 'lens', lens, eye, power: power ?? '', quantity });

export const frameLine = (frame, priceCents, priceSource) => ({
  id: uid(), kind: 'frame', sku: frame.sku, product: frame.product ?? frame.vendorSku ?? '',
  description: frame.description, brand: frame.brand ?? '', priceCents, priceSource,
  stock: frame.stock ?? null,
});

export const extraLine = (code, description, quantity = 1, stock = null) => ({ id: uid(), kind: 'extra', code, description, quantity, stock });

/** The code the register wants typed: the POS lens code, or the true SKU. */
export function lineCode(line) {
  if (line.kind === 'lens') return lensCodeText(line.lens);
  if (line.kind === 'frame') return line.sku;
  return line.code;
}

export function lineText(line) {
  if (line.kind === 'lens') {
    return [line.eye === 'OU' ? null : line.eye, line.power || null, line.lens.displayName].filter(Boolean).join(' · ');
  }
  return line.description;
}

export const lineQuantity = (line) => (line.kind === 'frame' ? 1 : line.quantity);

/** null means "the register prices this", which is not the same as zero. */
export function unitCents(line) {
  if (line.kind === 'lens') return line.lens.priceCents;
  if (line.kind === 'frame') return line.priceCents;
  return null;
}

export function lineTotal(line) {
  const u = unitCents(line);
  return u == null ? null : u * lineQuantity(line);
}

export const priced = (o) => o.lines.filter((l) => unitCents(l) != null);
export const unpriced = (o) => o.lines.filter((l) => unitCents(l) == null);

/** Only priced lines. Unpriced ones are listed under the total, never folded in. */
export const orderTotal = (o) => priced(o).reduce((s, l) => s + lineTotal(l), 0);

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
  const out = [];
  if (clientName) out.push(clientName);
  out.push('');
  for (const line of priced(order)) {
    out.push(`${lineCode(line)}  ×${lineQuantity(line)}`);
    out.push(`  ${lineText(line)}`);
    out.push(`  ${money(lineTotal(line))}`);
  }
  out.push('');
  out.push(`Total: ${money(orderTotal(order))}`);
  const rest = unpriced(order);
  if (rest.length) {
    out.push('');
    out.push('Priced at the register:');
    for (const line of rest) out.push(`  ${lineCode(line)}  ×${lineQuantity(line)}  ${lineText(line)}`);
  }
  out.push('');
  if (order.sellerEmployeeNumber) out.push([order.sellerEmployeeNumber, order.sellerName].filter(Boolean).join(' · '));
  out.push(longDate.format(new Date(order.createdOn)));
  return out.join('\n');
}
