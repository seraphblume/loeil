// Alpha's figures, as the workbook worked them out: the seller's month and
// cycle (History), the commission and yield at each tier and the tier the
// store reached, and the store against its Main and Soft goals (Dashboard ▸
// Store by month).
//
// Nothing here is recalculated. The workbook is the source — these are the
// values its formulas held when it was exported, kept on the phone until the
// next import. Amounts are pesos before IVA, as Alpha keeps them, in centavos.

import { sheetDay } from './util.js';

const lower = (v) => String(v ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const cents = (v) => (num(v) == null ? null : Math.round(v * 100));
const share = (v) => num(v);

function headerAt(rows, from, test) {
  for (let i = from; i < rows.length; i++) if (Array.isArray(rows[i]) && test(rows[i].map(lower))) return i;
  return -1;
}

/** Column indexes by header text; `many` collects every header matching a pattern, left to right. */
function cols(head) {
  const one = (name) => head.indexOf(name);
  const many = (re) => head.reduce((a, h, i) => (re.test(h) ? [...a, i] : a), []);
  return {
    month: one('month'), start: one('start'), vendor: one('vendor'), full: one('_full'),
    sales: one('sales'), proceeds: one('proceeds mxn'), avg: one('avg sale'), exams: one('exams'),
    closure: one('closure %'), branded: one('% branded'), pp: one('% pp'),
    fullTickets: one('full tickets'), fullShare: one('full ticket %'),
    base: one('comm. base'), tier: one('tier'),
    comm: many(/^comm \d/), yld: many(/^yield /),
    rates: many(/^comm \d/).map((i) => Number(head[i].replace(/[^0-9.]/g, '')) / 100),
  };
}

function figures(row, c) {
  const at = (i) => (i >= 0 ? row[i] : null);
  return {
    sales: num(at(c.sales)), proceeds: cents(at(c.proceeds)), avgSale: cents(at(c.avg)), exams: num(at(c.exams)),
    closure: share(at(c.closure)), branded: share(at(c.branded)), pp: share(at(c.pp)),
    fullTickets: num(at(c.fullTickets)), fullShare: share(at(c.fullShare)),
    tier: num(at(c.tier)),
    pay: c.comm.map((_, k) => ({ rate: c.rates[k], comm: cents(at(c.comm[k])), yield: cents(at(c.yld[k])) })),
  };
}

/** Whose row is it: the `_full` vendor carries the employee number in brackets; else the short name. */
const mine = (row, c, seller, short) =>
  (seller && c.full >= 0 && String(row[c.full] ?? '').includes(`[${seller}]`))
  || (short && c.vendor >= 0 && lower(row[c.vendor]) === lower(short));

function readHistory(rows, seller, short) {
  if (!rows) return null;
  const h = headerAt(rows, 0, (r) => r.includes('start') && r.includes('vendor') && r.includes('proceeds mxn'));
  if (h < 0) return null;
  const c = cols(rows[h].map(lower));
  const months = [];
  let i = h + 1;
  for (; i < rows.length; i++) {
    const row = rows[i] ?? [];
    if (lower(row[0]) === 'cycle to date') break;
    const start = sheetDay(row[c.start]);
    if (!start || !mine(row, c, seller, short)) continue;
    months.push({ start, ...figures(row, c) });
  }
  let cycle = null;
  const ch = headerAt(rows, i, (r) => r.includes('vendor') && r.includes('proceeds mxn'));
  if (ch >= 0) {
    const cc = cols(rows[ch].map(lower));
    for (let j = ch + 1; j < rows.length; j++) {
      const row = rows[j] ?? [];
      if (!lower(row[cc.vendor])) break;
      if (mine(row, cc, seller, short)) { cycle = figures(row, cc); break; }
    }
  }
  return { months, cycle, rates: c.rates };
}

function readStore(rows) {
  if (!rows) return [];
  const t = headerAt(rows, 0, (r) => r.includes('store by month'));
  if (t < 0) return [];
  const h = headerAt(rows, t + 1, (r) => r.includes('start') && r.includes('proceeds mxn'));
  if (h < 0) return [];
  const head = rows[h].map(lower);
  const at = (row, name) => { const i = head.indexOf(name); return i >= 0 ? row[i] : null; };
  const out = [];
  for (let i = h + 1; i < rows.length && out.length < 14; i++) {
    const row = rows[i] ?? [];
    const start = sheetDay(at(row, 'start'));
    if (!start) break;
    out.push({
      start, sales: num(at(row, 'sales')), proceeds: cents(at(row, 'proceeds mxn')),
      main: cents(at(row, 'main goal') ?? at(row, 'goal')), mainShare: share(at(row, '% of goal')),
      daysLeft: num(at(row, 'days left')), mainPerDay: cents(at(row, 'needed / day')),
      soft: cents(at(row, 'soft goal')), softShare: share(at(row, '% of soft')), softPerDay: cents(at(row, 'soft / day')),
    });
  }
  return out;
}

/**
 * The workbook's History and Dashboard → this seller's figures and the store's.
 * `seller` is the phone's employee number; `short` the name Alpha's Config gives them.
 */
export function readStats({ history, dashboard }, seller = null, short = null) {
  const mineRows = readHistory(history, seller, short);
  const store = readStore(dashboard);
  if (!mineRows?.months.length && !store.length) return null;
  return {
    importedAt: new Date().toISOString(),
    seller, months: mineRows?.months ?? [], cycle: mineRows?.cycle ?? null, rates: mineRows?.rates ?? [], store,
  };
}

/** The month to show: the one today falls in, else the latest with sales. */
export function currentMonth(list, today = new Date()) {
  if (!list?.length) return null;
  const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
  return list.find((m) => m.start === key)
    ?? [...list].reverse().find((m) => (m.proceeds ?? 0) > 0)
    ?? null;
}

/** What the tier says this month: the pay line it gives, or null while the month has no tier. */
export function paidAt(m) {
  if (!m?.pay?.length || m.tier == null) return null;
  return m.pay.find((p) => Math.abs(p.rate - m.tier) < 1e-9) ?? null;
}
