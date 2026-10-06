// The receipt: one order read two ways.
//
// THE REGISTER COPY is what the POS needs typed, in the order the checkout asks
// for it — 1 the frame's SKU, 2 the lens and coating codes, 3 the set or
// discount numbers, 4 the extras, 5 the prescription — each value copyable on
// its own, with the prices beside them to check the register against.
//
// THE CUSTOMER COPY is a quote: what they are buying in plain words and what it
// costs. No internal codes, no prescription.
//
// The coating is its own register line (×2, like the lens) under the code the
// register takes today: a coating whose vocabulary row says `printAs` prints
// as that (Crizal Sapphire, CZS, prints as CZN).

import { priceOrder, lineText, lineQuantity, isPair, isShare } from './orders.js';
import { lensCodeText } from './lens.js';
import { promoNumbers } from './sets.js';
import { rxIsBlank, eyeIsBlank } from './crm.js';
import { money } from './money.js';

/** `#4821` — short, stable for an order, easy to say across a counter. */
export function orderNumber(order) {
  let h = 0;
  for (const ch of String(order.id ?? '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return String(1000 + (h % 9000));
}

/** The code the register takes for a coating, or null when the lens has none. */
export function coatingCode(lens, catalogue) {
  const t = (lens.attributes ?? []).find((a) => a.key === 'treatment');
  if (!t || !t.code || t.code === 'N/A') return null;
  const printAs = catalogue?.meta('treatment', t.code)?.printAs;
  return { code: printAs || t.code, label: printAs ? catalogue.meta('treatment', printAs)?.english || t.label : t.label };
}

/** Everything the register needs typed for one line: `[{ code, qty, label }]`. */
export function registerCodes(line, catalogue) {
  if (line.kind === 'lens') {
    const out = [{ code: lensCodeText(line.lens), qty: lineQuantity(line), label: isPair(line) ? 'Lenses' : `${line.eye} lens` }];
    const c = isPair(line) ? coatingCode(line.lens, catalogue) : null;
    if (c) out.push({ code: c.code, qty: lineQuantity(line), label: c.label });
    return out;
  }
  if (line.kind === 'frame') return [{ code: line.sku, qty: 1, label: 'Frame' }];
  return [{ code: line.code, qty: lineQuantity(line), label: line.description }];
}

// ---------------------------------------------------------------------------
// The prescription, the way the register's form asks for it

const num = (n) => (Number(n) || 0);
const dioptre = (n) => (num(n) === 0 ? '0.00' : (num(n) > 0 ? '+' : '-') + Math.abs(num(n)).toFixed(2));
const mm = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/**
 * `{ od, os, split }` with SPH CYL AXI ADD PD as text per eye, or null when
 * there is no prescription. PD is each eye's own when it was measured;
 * otherwise half the binocular PD, and `split` says so.
 */
export function rxFields(rx) {
  if (!rx || rxIsBlank(rx)) return null;
  const binocular = num(rx.pdFarMM) || null;
  let split = false;
  const eye = (e) => {
    if (!e) return null;
    const cyl = num(e.cylinder);
    const own = num(e.pdFar) || null;
    const pd = own ?? (binocular ? Math.round((binocular / 2) * 10) / 10 : null);
    if (!own && binocular) split = true;
    return {
      sph: eyeIsBlank(e) ? '' : dioptre(e.sphere),
      cyl: cyl ? dioptre(cyl) : '0.00',
      axi: cyl ? String(Math.round(num(e.axis))) : '',
      add: num(e.addition) ? dioptre(e.addition) : '',
      pd: pd ? mm(pd) : '',
    };
  };
  return { od: eye(rx.od), os: eye(rx.os), split, binocular, issuedOn: rx.issuedOn ?? null };
}

export const RX_COLUMNS = [['sph', 'SPH'], ['cyl', 'CYL'], ['axi', 'AXI'], ['add', 'ADD'], ['pd', 'PD']];

// ---------------------------------------------------------------------------
// The receipt model, drawn by the screen and by the image alike

/**
 * @param order   the order, resolved against the campaign (sets, discounts)
 * @param kind    'register' | 'customer'
 */
export function buildReceipt({ order, catalogue, kind = 'register', client = null, rx = null, now = new Date() }) {
  const p = priceOrder(order);
  const rows = p.rows;
  const net = (r) => (r.pending ? null : r.net);
  const frames = rows.filter((r) => r.line.kind === 'frame');
  const lenses = rows.filter((r) => r.line.kind === 'lens');
  const extras = rows.filter((r) => r.line.kind === 'extra');
  const promos = promoNumbers(order);
  const manual = rows.filter((r) => typeof r.line.discount === 'number' && r.line.discount > 0);
  const setEnds = order.lines.map((l) => l.set?.id).filter(Boolean)
    .map((id) => catalogue?.setsById.get(id)?.validTo).filter(Boolean).sort()[0] ?? null;

  const base = {
    kind,
    number: orderNumber(order),
    date: order.createdOn ? new Date(order.createdOn) : now,
    seller: order.sellerEmployeeNumber ? [order.sellerEmployeeNumber, order.sellerName].filter(Boolean).join(' · ') : '',
    sellerName: order.sellerName || '',
    client: client?.name || order.clientNameAtSale || '',
    totals: { list: p.list, off: p.off, total: p.total, pending: p.pending.length, unpriced: p.unpriced.length },
    validUntil: setEnds,
    barcode: frames[0]?.line.sku ?? null,
    empty: !rows.length,
  };

  if (kind === 'customer') {
    const items = rows.map((r) => {
      const l = r.line;
      let name = lineText(l);
      let detail = '';
      if (l.kind === 'frame') { name = l.description; detail = l.set ? `${l.set.name}: frame and single vision lenses` : 'Frame'; }
      if (l.kind === 'lens') { name = l.lens.displayName; detail = l.setLens?.id ? `${l.setLens.name}, in ${l.setLens.setName}` : isPair(l) ? 'Lenses, the pair' : `${l.eye} · ${lineQuantity(l)} box${lineQuantity(l) === 1 ? '' : 'es'}`; }
      if (isShare(l)) detail = `${l.percent}% of the glasses`;
      return { name, detail, price: net(r), list: r.discount ? r.list : null, discount: r.discount, pending: r.pending };
    });
    return { ...base, items };
  }

  const group = (n, title, list) => ({ n, title, items: list });
  const groups = [
    group(1, 'Frame SKU', frames.map((r) => ({
      copy: r.line.sku, qty: 1, text: r.line.description, price: net(r),
      note: r.line.set ? r.line.set.name : r.line.priceSource === 'tag' ? 'price from the tag' : '',
    }))),
    group(2, 'Treatments', lenses.flatMap((r) => registerCodes(r.line, catalogue).map((c, i) => ({
      copy: c.code, qty: c.qty, text: i === 0 ? r.line.lens.displayName : c.label, price: i === 0 ? net(r) : null,
      note: i === 0 && r.line.setLens?.id ? `${r.line.setLens.setName} · ${r.line.setLens.name}` : i === 0 && r.pending ? 'set row not chosen' : '',
    })))),
    group(3, 'Set / discount', [
      ...promos.map((x) => ({ copy: x.id, text: x.name })),
      ...manual.map((r) => ({ copy: null, text: `${r.discount}% off ${r.line.kind === 'frame' ? 'the frame' : 'the lenses'} (no promotion number)` })),
    ]),
    group(4, 'Extras', extras.map((r) => ({
      copy: r.line.code, qty: lineQuantity(r.line), text: r.line.description, price: net(r),
      note: isShare(r.line) ? `${r.line.percent}% of ${money(r.base)}` : r.net == null ? 'priced at the register' : '',
    }))),
  ];
  return { ...base, groups, rx: rxFields(rx) };
}

/** The register copy as text — "Copy all", for a note or a chat. */
export function receiptText(r) {
  const out = [`L'Œil · #${r.number}`];
  if (r.client) out.push(r.client);
  out.push('');
  if (r.kind === 'customer') {
    for (const i of r.items) out.push(`${i.name}${i.detail ? ` — ${i.detail}` : ''}: ${i.price == null ? 'at the register' : money(i.price)}`);
  } else {
    for (const g of r.groups) {
      if (!g.items.length) continue;
      out.push(`${g.n} ${g.title}`);
      for (const i of g.items) out.push(`  ${i.copy ?? '—'}${i.qty ? `  ×${i.qty}` : ''}  ${i.text}${i.price != null ? `  ${money(i.price)}` : ''}`);
    }
    if (r.rx) {
      out.push('5 Prescription');
      for (const eye of ['od', 'os']) {
        const e = r.rx[eye];
        if (e) out.push(`  ${eye.toUpperCase()}  ${RX_COLUMNS.map(([k, label]) => `${label} ${e[k] || '—'}`).join('  ')}`);
      }
      if (r.rx.split) out.push(`  PD: half of the binocular ${r.rx.binocular} mm`);
    }
  }
  out.push('');
  if (r.totals.off) out.push(`Before discounts ${money(r.totals.list)} · discounts −${money(r.totals.off)}`);
  out.push(`Total ${money(r.totals.total)}`);
  if (r.seller) out.push(r.seller);
  return out.join('\n');
}
