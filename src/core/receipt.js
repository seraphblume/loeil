// The receipt: one order read two ways.
//
// THE REGISTER COPY is what the POS needs typed, in the order the checkout asks
// for it — 1 the frame's SKU, 2 the lens and coating codes, 3 the set or
// discount numbers, 4 the extras, 5 the prescription — each value copyable on
// its own, with the prices beside them to check the register against.
//
// BOTH COPIES PRINT AS THE REGISTER'S OWN TICKET: the branch at the top, the
// material lines with price, net and total, the amount in words, the
// prescription with its measurements. The copy is named at the top.
//
// The coating is its own register line (×2, like the lens) under the code the
// register takes today: a coating whose vocabulary row says `printAs` prints
// as that code.

import { priceOrder, lineQuantity, isPair, isShare, needsAob } from './orders.js';
import { lensCodeText } from './lens.js';
import { promoNumbers } from './sets.js';
import { rxIsBlank, eyeIsBlank } from './crm.js';
import { money } from './money.js';
import { amountWords } from './words.js';

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
 * `{ od, os, cols, split, prisms }` with each value as text per eye, or null
 * when there is no prescription. PD is each eye's own when it was measured;
 * otherwise half the binocular PD, and `split` says so. ADD and AOB are
 * columns only when the job has them.
 */
export function rxFields(rx, aob = null) {
  if (!rx || rxIsBlank(rx)) return null;
  const binocular = num(rx.pdFarMM) || null;
  let split = false;
  const eye = (e, side) => {
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
      aob: aob?.[side] ? String(Math.round(aob[side])) : '',
    };
  };
  const od = eye(rx.od, 'od');
  const os = eye(rx.os, 'os');
  const hasAdd = Boolean(od?.add || os?.add);
  const hasAob = Boolean(aob && (aob.od || aob.os));
  const cols = RX_COLUMNS.filter(([k]) => (k === 'add' ? hasAdd : k === 'aob' ? hasAob : true));
  const prisms = ['od', 'os'].filter((s) => num(rx[s]?.prism?.amount) > 0)
    .map((s) => `${s.toUpperCase()} ${num(rx[s].prism.amount).toFixed(2)}Δ base ${rx[s].prism.base}`);
  return { od, os, cols, split, binocular, prisms, issuedOn: rx.issuedOn ?? null };
}

export const RX_COLUMNS = [['sph', 'SPH'], ['cyl', 'CYL'], ['axi', 'AXIS'], ['add', 'ADD'], ['pd', 'PD'], ['aob', 'AOB']];

// ---------------------------------------------------------------------------
// The ticket's lines, the way the register prints them: a pair of lenses is a
// line per eye at half the pair, its coating a line of two (included in the
// lens price), then the frame and the extras. Price is before the discount,
// Net after it, Total the line.

const upper = (s) => String(s ?? '').toUpperCase();

function halves(cents) {
  if (cents == null) return [null, null];
  const a = Math.floor(cents / 2);
  return [a, cents - a];
}

export function ticketItems(rows, catalogue) {
  const out = [];
  const order = [...rows.filter((r) => r.line.kind === 'lens'), ...rows.filter((r) => r.line.kind === 'frame'),
    ...rows.filter((r) => r.line.kind !== 'lens' && r.line.kind !== 'frame')];
  for (const r of order) {
    const l = r.line;
    const pending = r.pending;
    if (l.kind === 'lens' && isPair(l)) {
      const code = lensCodeText(l.lens);
      const desc = upper(l.lens.displayName);
      const [p1, p2] = halves(pending ? null : r.list);
      const [n1, n2] = halves(pending ? null : r.net);
      const one = l.quantity === 1;
      if (one) out.push({ code, desc: `${desc} · ${l.eye}`, qty: 1, price: pending ? null : r.list, net: pending ? null : r.net, total: pending ? null : r.net, pending });
      else {
        out.push({ code, desc: `${desc} · OD`, qty: 1, price: p1, net: n1, total: n1, pending });
        out.push({ code, desc: `${desc} · OS`, qty: 1, price: p2, net: n2, total: n2, pending });
      }
      const c = coatingCode(l.lens, catalogue);
      if (c) out.push({ code: c.code, desc: upper(c.label), qty: l.quantity, included: true });
      continue;
    }
    const qty = lineQuantity(l);
    const unit = (v) => (v == null ? null : Math.round(v / Math.max(1, qty)));
    if (l.kind === 'lens') {
      out.push({ code: lensCodeText(l.lens), desc: upper([l.eye, l.power, l.lens.displayName].filter(Boolean).join(' ')), qty, price: unit(r.list), net: unit(r.net), total: r.net, pending });
    } else if (l.kind === 'frame') {
      out.push({ code: l.sku, desc: upper(l.description), qty: 1, price: r.list, net: r.net, total: r.net, note: l.set ? `${l.set.name} (${l.set.id})` : null });
    } else {
      out.push({ code: l.code, desc: upper(l.description), qty, price: unit(r.list), net: unit(r.net), total: r.net, register: r.net == null, note: isShare(l) ? `${l.percent}% of ${money(r.base)}` : null });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// The receipt model, drawn by the screen and by the image alike

/**
 * @param order   the order, resolved against the campaign (sets, discounts)
 * @param kind    'register' | 'customer' — the same ticket; the copy says which
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
  const fields = rxFields(rx, order.aob ?? null);

  const groups = [
    { n: 1, title: 'Frame SKU', items: frames.map((r) => ({
      copy: r.line.sku, qty: 1, text: r.line.description, price: net(r),
      note: r.line.set ? r.line.set.name : r.line.priceSource === 'tag' ? 'price from the tag' : '',
    })) },
    { n: 2, title: 'Treatments', items: lenses.flatMap((r) => registerCodes(r.line, catalogue).map((c, i) => ({
      copy: c.code, qty: c.qty, text: i === 0 ? r.line.lens.displayName : c.label, price: i === 0 ? net(r) : null,
      note: i === 0 && r.line.setLens?.id ? `${r.line.setLens.setName} · ${r.line.setLens.name}` : i === 0 && r.pending ? 'set row not chosen' : '',
    }))) },
    { n: 3, title: 'Set / discount', items: [
      ...promos.map((x) => ({ copy: x.id, text: x.name })),
      ...manual.map((r) => ({ copy: null, text: `${r.discount}% off ${r.line.kind === 'frame' ? 'the frame' : 'the lenses'} (no promotion number)` })),
    ] },
    { n: 4, title: 'Extras', items: extras.map((r) => ({
      copy: r.line.code, qty: lineQuantity(r.line), text: r.line.description, price: net(r),
      note: isShare(r.line) ? `${r.line.percent}% of ${money(r.base)}` : r.net == null ? 'priced at the register' : '',
    })) },
  ];

  return {
    kind,
    number: orderNumber(order),
    date: order.closedOn ? new Date(order.closedOn) : now,
    printedAt: now,
    store: catalogue?.store ?? null,
    seller: order.sellerEmployeeNumber ? { number: order.sellerEmployeeNumber, name: order.sellerName || '' } : null,
    client: client || order.clientNameAtSale ? { name: client?.name || order.clientNameAtSale || '', phone: client?.phone || '' } : null,
    discounts: [...promos.map((x) => x.id), ...manual.filter((r) => !r.auto).map((r) => `${r.discount}%`)],
    items: ticketItems(rows, catalogue),
    totals: { list: p.list, off: p.off, total: p.total, pending: p.pending.length, unpriced: p.unpriced.length },
    words: amountWords(p.total),
    validUntil: setEnds,
    barcode: frames[0]?.line.sku ?? null,
    groups,
    rx: fields,
    aobMissing: Boolean(catalogue && needsAob(order, catalogue) && !(order.aob?.od && order.aob?.os)),
    empty: !rows.length,
  };
}

/** The ticket as text — "Copy all", for a note or a chat. */
export function receiptText(r) {
  const out = [`L'Œil · #${r.number}`];
  if (r.client?.name) out.push(r.client.name);
  out.push('');
  for (const g of r.groups) {
    if (!g.items.length) continue;
    out.push(`${g.n} ${g.title}`);
    for (const i of g.items) out.push(`  ${i.copy ?? '—'}${i.qty ? `  ×${i.qty}` : ''}  ${i.text}${i.price != null ? `  ${money(i.price)}` : ''}`);
  }
  if (r.rx) {
    out.push('5 Prescription');
    for (const eye of ['od', 'os']) {
      const e = r.rx[eye];
      if (e) out.push(`  ${eye.toUpperCase()}  ${r.rx.cols.map(([k, label]) => `${label} ${e[k] || '—'}`).join('  ')}`);
    }
    if (r.rx.split) out.push(`  PD: half of the binocular ${r.rx.binocular} mm`);
    for (const pr of r.rx.prisms) out.push(`  Prism ${pr}`);
  }
  out.push('');
  if (r.totals.off) out.push(`Before discounts ${money(r.totals.list)} · discounts −${money(r.totals.off)}`);
  out.push(`Total ${money(r.totals.total)}`);
  if (r.seller) out.push(`${r.seller.number} ${r.seller.name}`.trim());
  return out.join('\n');
}
