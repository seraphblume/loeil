export { brandKey } from '../core/util.js';

const monthYear = new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric' });

/** `2027-01-31` → `Jan 2027`. */
export function fmtExpiry(day) {
  const m = String(day).match(/^(\d{4})-(\d{2})/);
  if (!m) return day;
  return monthYear.format(new Date(Number(m[1]), Number(m[2]) - 1, 1));
}
