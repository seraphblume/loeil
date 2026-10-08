// The quote: up to three options for one client, side by side on one ticket,
// the way the register's own quote (presupuesto) prints them.
//
// AN OPTION IS A SNAPSHOT of the order in progress, taken when he taps Add to
// quote. He changes the lens or the frame and adds again; each snapshot keeps
// the prices it was quoted at, whatever the order does next.

import { priceOrder, isPair, isShare, lineQuantity } from './orders.js';
import { fold, uid } from './util.js';
import { liveSets } from './sets.js';

export const QUOTE_OPTIONS = 3;

export function newQuote() {
  return { id: uid(), clientId: null, options: [], createdOn: new Date().toISOString() };
}

/** `8423876` — seven digits, stable for a quote. */
export function quoteNumber(quote) {
  let h = 7;
  for (const ch of String(quote.id ?? '')) h = (h * 33 + ch.charCodeAt(0)) >>> 0;
  return String(1000000 + (h % 9000000));
}

const upper = (s) => String(s ?? '').toUpperCase().trim();
const attrs = (lens) => Object.fromEntries((lens.attributes ?? []).map((a) => [a.key, a]));
const none = (a) => !a || !a.code || a.code === 'N/A' || a.label === 'None';

/** `SINGLE VISION EYEZEN START`, `PROGRESSIVE VARILUX COMFORT` — what the lens is. */
export function lensWords(lens) {
  const a = attrs(lens);
  if (lens.family === 'CL') return upper(lens.displayName);
  const kind = lens.family === 'SV' ? 'Single vision' : a.type?.label || 'Multifocal';
  const design = !none(a.design) && a.design.code !== 'ND' ? a.design.label : null;
  return upper([kind, design].filter(Boolean).join(' '));
}

/** `TRANSITIONS INDIGO CRIZAL PREVENCIA` — the filter when it is not clear, and the coating. */
export function treatmentWords(lens) {
  if (lens.family === 'CL') return '';
  const a = attrs(lens);
  const clear = !a.category || fold(a.category.code) === 'blanco';
  const filter = !clear && !none(a.colour) ? a.colour.label : null;
  const coating = !none(a.treatment) ? a.treatment.label : null;
  return upper([filter, coating].filter(Boolean).join(' '));
}

/** When an option's prices stop holding: the earliest end of its set or campaign discount, else the campaign's. */
function validUntil(order, catalogue, on) {
  const ends = [];
  for (const l of order.lines) {
    if (l.set?.id) ends.push(catalogue?.setsById?.get(l.set.id)?.validTo);
    if (l.auto?.id) ends.push((catalogue?.discounts ?? []).find((d) => d.id === l.auto.id)?.validTo);
  }
  const own = ends.filter(Boolean).sort()[0];
  if (own) return own;
  const campaign = catalogue ? liveSets(catalogue, on).map((s) => s.validTo).filter(Boolean).sort() : [];
  return campaign[campaign.length - 1] ?? null;
}

/** One option, as the ticket lists it: Frame, Lenses, Treatments, extras, and its sums. */
export function quoteOption(order, catalogue, n, on = new Date()) {
  const p = priceOrder(order);
  const rows = [];
  const byKind = (k) => p.rows.filter((r) => r.line.kind === k);
  for (const r of byKind('frame')) {
    rows.push({ label: 'Frame', desc: upper(r.line.brand || r.line.description), qty: 1, price: r.list });
  }
  for (const r of byKind('lens')) {
    const l = r.line;
    if (isPair(l)) {
      rows.push({ label: 'Lenses', desc: lensWords(l.lens), qty: l.quantity, price: r.pending ? null : r.list, pending: r.pending, included: r.list === 0 && Boolean(l.setLens) });
      const t = treatmentWords(l.lens);
      if (t) rows.push({ label: 'Treatments', desc: t });
    } else {
      rows.push({ label: 'Contact lenses', desc: upper([l.eye, l.power, l.lens.displayName].filter(Boolean).join(' ')), qty: lineQuantity(l), price: r.list });
    }
  }
  for (const r of byKind('extra')) {
    rows.push({ label: isShare(r.line) ? 'Protection' : 'Extra', desc: upper(r.line.description), qty: lineQuantity(r.line), price: r.list, register: r.list == null });
  }
  return {
    n,
    id: order.id,
    rows,
    subtotal: p.list,
    save: p.off,
    total: p.total,
    pending: p.pending.length,
    unpriced: p.unpriced.length,
    validUntil: validUntil(order, catalogue, on),
  };
}

/** The whole ticket, drawn by the screen and the image alike. */
export function buildQuote({ quote, catalogue, client = null, seller = null, now = new Date() }) {
  const name = client?.name || '';
  return {
    number: quoteNumber(quote),
    date: now,
    store: catalogue?.store ?? null,
    seller: seller ? { number: seller.employeeNumber, name: seller.name } : null,
    client: name ? { name, first: name.split(/\s+/)[0], phone: client?.phone || '' } : null,
    options: quote.options.map((o, i) => quoteOption(o.order, catalogue, i + 1, now)),
  };
}

const pesos = (c) => (c == null ? '—' : '$' + (c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

/** The quote as text, for a chat. */
export function quoteText(q) {
  const out = [`L'Œil · Quote ${q.number}`];
  if (q.client) out.push(q.client.name);
  for (const o of q.options) {
    out.push('', `Option ${o.n}`);
    for (const r of o.rows) out.push(`  ${r.label}: ${r.desc}${r.qty ? ` ×${r.qty}` : ''}${r.included ? '  in the set' : r.price != null ? `  ${pesos(r.price)}` : r.label === 'Treatments' ? '' : '  at the register'}`);
    if (o.save) out.push(`  Subtotal ${pesos(o.subtotal)} · you save ${pesos(o.save)}`);
    out.push(`  Total to pay ${pesos(o.total)}`);
  }
  return out.join('\n');
}

