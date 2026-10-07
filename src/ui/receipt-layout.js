// The receipt as a list of blocks: the screen draws them as HTML, the shared
// image draws the same blocks on a canvas, so the two can never disagree.
//
// The layout is the register's own ticket, top to bottom: the branch, who sold
// it and to whom, the material lines, the amount and the amount in words, the
// prescription with its measurements, the foot.

import { money } from '../core/money.js';
import { footerLines } from '../core/store.js';

const pad = (n) => String(n).padStart(2, '0');
const dmy = (d) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
const hms = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
const amount = (c) => (c == null ? '' : money(c, { cents: true }));
/** In the line table the columns say what they are; the figures go without the sign, as on the register's ticket. */
const figure = (c) => amount(c).replace('$', '');
const join = (...xs) => xs.filter(Boolean).join(', ');

export function receiptBlocks(r) {
  const register = r.kind === 'register';
  const s = r.store ?? {};
  const B = [];
  B.push({ t: 'brand', title: 'L’ŒIL', copy: register ? 'REGISTER COPY' : 'CUSTOMER COPY' });
  B.push({ t: 'field', k: 'Order', v: `#${r.number}`, strong: true });
  B.push({ t: 'text', text: join(s.city, s.state, dmy(r.date)).toUpperCase() });
  if (s.branchName || s.branchCode) B.push({ t: 'field', k: 'Branch', v: `${s.branchCode ? `[ ${s.branchCode} ] ` : ''}${s.branchName ?? ''}` });
  if (s.address) B.push({ t: 'field', k: 'Address', v: s.address });
  if (s.district) B.push({ t: 'field', k: 'District', v: s.district });
  if (s.municipality) B.push({ t: 'field', k: 'Municipality', v: s.municipality });
  if (s.country) B.push({ t: 'field', k: 'Country', v: s.country });
  if (s.state || s.zip) B.push({ t: 'field', k: 'State', v: [s.state, s.zip && `ZIP: ${s.zip}`].filter(Boolean).join('   ') });
  if (s.phone) B.push({ t: 'field', k: 'Phone', v: s.phone });
  B.push({ t: 'gap' });
  if (r.seller) B.push({ t: 'field', k: 'Employee', v: `${r.seller.number} [${String(r.seller.name).toUpperCase()}]` });
  if (r.client?.name) B.push({ t: 'field', k: 'Client', v: `[ ${r.client.name} ]` });
  if (r.client?.phone) B.push({ t: 'field', k: 'Phone', v: r.client.phone });
  if (r.discounts.length) B.push({ t: 'field', k: 'Discount', v: r.discounts.join(' · ') });

  B.push({ t: 'rule' });
  B.push({
    t: 'items',
    head: ['MATERIAL', 'QTY', 'PRICE', 'NET', 'TOTAL'],
    rows: r.items.map((i) => ({
      code: i.code ?? '—', qty: String(i.qty ?? ''), desc: i.desc, note: i.note ?? null,
      cells: i.included ? ['incl.', 'incl.', 'incl.'] : i.pending ? ['—', '—', '—'] : i.register ? ['reg.', 'reg.', 'reg.'] : [figure(i.price), figure(i.net), figure(i.total)],
    })),
  });
  B.push({ t: 'rule' });
  B.push({ t: 'field', k: 'Time', v: hms(r.printedAt ?? r.date) });
  B.push({ t: 'amount', k: 'Amount', v: amount(r.totals.total) });
  B.push({ t: 'words', text: `** ${r.words} **` });
  if (r.totals.off) B.push({ t: 'fine', text: `Before discounts ${amount(r.totals.list)} · you save ${amount(r.totals.off)}` });
  if (r.totals.pending) B.push({ t: 'fine', text: 'A lens still needs its row of the set — amount so far' });
  if (r.totals.unpriced) B.push({ t: 'fine', text: `${r.totals.unpriced} item${r.totals.unpriced === 1 ? '' : 's'} priced at the register (reg.)` });

  B.push({ t: 'rule' });
  if (r.rx) {
    B.push({
      t: 'rx',
      cols: r.rx.cols.map(([, label]) => label),
      rows: ['od', 'os'].filter((e) => r.rx[e]).map((e) => [e.toUpperCase(), ...r.rx.cols.map(([k]) => r.rx[e][k] || '—')]),
    });
    if (r.rx.split) B.push({ t: 'fine', text: `PD: half the binocular ${r.rx.binocular} mm`, left: true });
    for (const p of r.rx.prisms) B.push({ t: 'fine', text: `Prism ${p}`, left: true });
    if (r.aobMissing) B.push({ t: 'fine', text: 'AOB not measured yet', left: true });
  } else {
    B.push({ t: 'fine', text: 'No prescription on this order', left: true });
  }
  B.push({ t: 'rule' });
  const foot = footerLines(r.store);
  for (const line of foot) B.push(line ? { t: 'foot', text: line } : { t: 'gap' });
  if (!register) B.push({ t: 'thanks', text: 'Thank you for your visit!' });
  const code = register && r.barcode ? r.barcode : r.number;
  B.push({ t: 'barcode', value: code, caption: `* ${code} *` });
  if (r.validUntil) B.push({ t: 'fine', text: `Set prices valid until ${dmy(new Date(r.validUntil + 'T12:00'))}` });
  return B;
}
