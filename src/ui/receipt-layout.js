// The receipt as a list of blocks: the screen draws them as HTML, the shared
// image draws the same blocks on a canvas, so the two can never disagree.

import { money } from '../core/money.js';
import { RX_COLUMNS } from '../core/receipt.js';

const when = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });
const day = (iso) => { const [y, m, d] = String(iso).split('-').map(Number); return when.format(new Date(y, m - 1, d)); };

export function receiptBlocks(r) {
  const register = r.kind === 'register';
  const B = [];
  B.push({ t: 'logo' }, { t: 'title', text: 'L’ŒIL' }, { t: 'subtitle', text: register ? 'Register copy' : 'Your quote' });
  B.push({ t: 'rule' });
  B.push({ t: 'kv', k: 'ORDER NO:', v: `#${r.number}`, strong: true });
  B.push({ t: 'kv', k: 'DATE:', v: `${when.format(r.date)} · ${time.format(r.date)}` });
  if (register && r.seller) B.push({ t: 'kv', k: 'SELLER:', v: r.seller });
  if (!register && r.sellerName) B.push({ t: 'kv', k: 'ADVISOR:', v: r.sellerName });
  if (r.client) B.push({ t: 'kv', k: register ? 'CLIENT:' : 'FOR:', v: r.client });
  B.push({ t: 'rule' });

  if (register) {
    for (const g of r.groups) {
      B.push({ t: 'head', n: g.n, text: g.title.toUpperCase() });
      if (!g.items.length) B.push({ t: 'none', text: '—' });
      for (const i of g.items) B.push({ t: 'item', ...i });
    }
    B.push({ t: 'head', n: 5, text: 'PRESCRIPTION' });
    if (r.rx) {
      B.push({
        t: 'rx',
        cols: RX_COLUMNS.map(([, label]) => label),
        rows: ['od', 'os'].filter((e) => r.rx[e]).map((e) => [e.toUpperCase(), ...RX_COLUMNS.map(([k]) => r.rx[e][k] || '—')]),
      });
      if (r.rx.split) B.push({ t: 'fine', text: `PD: half the binocular ${r.rx.binocular} mm`, left: true });
      if (r.rx.issuedOn) B.push({ t: 'fine', text: `Issued ${day(r.rx.issuedOn)}`, left: true });
    } else {
      B.push({ t: 'none', text: 'No prescription on file' });
    }
  } else {
    B.push({ t: 'cols', left: 'ITEM', right: 'PRICE' });
    for (const i of r.items) B.push({ t: 'line', ...i });
  }

  B.push({ t: 'rule' });
  if (r.totals.off) {
    B.push({ t: 'kv', k: 'SUBTOTAL:', v: money(r.totals.list) });
    B.push({ t: 'kv', k: 'DISCOUNTS:', v: '−' + money(r.totals.off) });
  }
  B.push({ t: 'total', k: 'TOTAL:', v: money(r.totals.total) });
  if (r.totals.pending) B.push({ t: 'fine', text: 'A lens still needs its row of the set — total so far' });
  if (r.totals.unpriced) B.push({ t: 'fine', text: `${r.totals.unpriced} item${r.totals.unpriced === 1 ? '' : 's'} priced at the register` });
  B.push({ t: 'rule' });
  const code = register && r.barcode ? r.barcode : r.number;
  B.push({ t: 'barcode', value: code, caption: `* ${code} *` });
  B.push({ t: 'thanks', text: register ? 'Ready for the register' : 'Thank you for your visit!' });
  B.push({ t: 'fine', text: r.validUntil ? `Set prices valid until ${day(r.validUntil)}` : 'L’ŒIL · GINAILE' });
  return B;
}
