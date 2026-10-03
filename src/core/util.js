// Small, pure helpers shared by the app and the Node publish tool.
// No DOM, no storage, no network.

/** Accent- and case-insensitive form for searching: `Asférico` → `asferico`. */
export function fold(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/** Brand names compare on letters and digits only: `Ray-Ban` = `Ray Ban`. */
export function brandKey(s) {
  return fold(s).replace(/[^a-z0-9]/g, '');
}

const DASHES = [' — ', ' – ', ' - '];

/**
 * `4300 — Polylite` and `BLC (Blanco)` are the same idea in two shapes.
 * Returns the POS code and the POS label. A value with neither separator —
 * `Blanco`, `N/A` — is its own code and its own label.
 *
 * NEVER NORMALISE THE CODE. It composes the POS product code the register
 * reads. Only the surrounding whitespace goes.
 */
export function parseCodeLabel(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return { code: '', pos: '' };
  for (const dash of DASHES) {
    const i = text.indexOf(dash);
    if (i >= 0) return { code: text.slice(0, i), pos: text.slice(i + dash.length) };
  }
  if (text.endsWith(')')) {
    const open = text.indexOf(' (');
    if (open > 0) return { code: text.slice(0, open), pos: text.slice(open + 2, -1) };
  }
  return { code: text, pos: text };
}

/** One spreadsheet cell as text. Long integer codes never go near exponent form. */
export function cellText(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') {
    if (Number.isInteger(v)) return String(v);
    if (Math.abs(v - Math.round(v)) < 1e-9) return String(Math.round(v));
    return String(v);
  }
  if (v instanceof Date) return isoDay(v);
  return String(v);
}

/** Pesos (number or `$2,019.00`) → centavos, rounded half away from zero. */
export function toCents(v) {
  if (v === null || v === undefined || v === '') return null;
  let n = v;
  if (typeof v === 'string') {
    const cleaned = v.replace(/[^0-9.\-]/g, '');
    if (!cleaned) return null;
    n = Number(cleaned);
  }
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  return Math.sign(n) * Math.round(Math.abs(n) * 100);
}

/** `YES`/`NO` checkbox columns. Anything that is not a clear yes is a no. */
export function isYes(v) {
  return String(v ?? '').trim().toUpperCase() === 'YES';
}

/** Digits only — barcodes arrive as numbers, strings, or with stray spaces. */
export function digits(v) {
  return cellText(v).replace(/\D/g, '');
}

/** `2026-08-10` from a Date, using its calendar day. */
export function isoDay(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * A spreadsheet date as `YYYY-MM-DD`, or '' when absent or unreadable.
 * Serial numbers are converted arithmetically (1899-12-30 epoch) so the result
 * never depends on the timezone of the machine doing the reading.
 */
export function sheetDay(v) {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    const ms = Math.round((v - 25569) * 86400000); // 25569 = 1970-01-01
    const d = new Date(ms);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  }
  if (v instanceof Date) return isoDay(v);
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); // day/month/year, as Mexico writes it
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return '';
}

/** A local Date at midnight from `YYYY-MM-DD`. */
export function dayToDate(s) {
  const m = String(s ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function addMonths(d, n) {
  const x = new Date(d);
  const day = x.getDate();
  x.setDate(1);
  x.setMonth(x.getMonth() + n);
  const last = new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate();
  x.setDate(Math.min(day, last));
  return x;
}

export function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function uid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

/** `+2.25`, `-1.00`. ASCII signs, so it survives a copy into the register. */
export function signed(n, places = 2) {
  const v = Number(n) || 0;
  return (v >= 0 ? '+' : '-') + Math.abs(v).toFixed(places);
}

export function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}
