// Lifestyle presets: one tap puts a whole lens on the order — single vision or
// progressive as the prescription says, high-index when it is strong — with
// Plus Protection and the accessories that go with it.
//
// Each preset (Digital nomad, First glasses…) has tiers: an accessible price,
// the better value, and sometimes a third. A tier names its lens the way a set
// row does — family|material|design|filter|colour|coating — once for single
// vision and once for progressives, so the catalogue decides what exists.
//
// CLEANING SOLUTIONS DAMAGE CRIZAL (ANY OF THEM), TRANSITIONS AND POLAREX, and
// void their warranty. A preset never adds a solution to such a lens, whatever
// its data says, and an order that ends up with both is flagged — only a
// customer who insists takes one home with them.

import { factsMatch, lensFacts } from './sets.js';
import { resolve } from './lens.js';
import { isPair } from './orders.js';
import { needsAddition, strongestSphere, rxIsBlank } from './crm.js';
import { HIGH_RX_SPHERE } from '../config.js';

// ---------------------------------------------------------------------------
// Items: `Pouch: 61004120/61004121; Cleaning solution*: 61004172`
// A label, the SKUs in order of preference (the first in stock is taken), and
// a star when the item is a cleaning solution.

export function parseItems(text) {
  return String(text ?? '').split(';').map((part) => part.trim()).filter(Boolean).map((part) => {
    const at = part.indexOf(':');
    const rawLabel = at >= 0 ? part.slice(0, at).trim() : '';
    const skus = (at >= 0 ? part.slice(at + 1) : part).split(/[/,\s]+/).map((s) => s.replace(/\D/g, '')).filter(Boolean);
    const solution = rawLabel.endsWith('*');
    return { label: rawLabel.replace(/\*$/, '').trim() || 'Accessory', skus, ...(solution ? { solution: true } : {}) };
  });
}

export function itemsText(items) {
  return (items ?? []).map((i) => `${i.label}${i.solution ? '*' : ''}: ${i.skus.join('/')}`).join('; ');
}

// ---------------------------------------------------------------------------
// What a cleaning solution is, and what it damages

const SOLUTION_WORDS = /SOLUCI|SPRAY|TOALLITA|LIMPIADOR/i;

/** A stock item or an extra that is (or carries) a cleaning liquid. */
export function isSolution(catalogue, code, description = '') {
  const inv = catalogue?.inventoryBySku?.get(String(code));
  if (inv?.kind === 'solution') return true;
  return SOLUTION_WORDS.test(description || inv?.description || '');
}

/** The filters a solution damages, by promo group: Transitions and Polarex. Coatings: every Crizal. */
const SENSITIVE_FILTERS = new Set(['TRANS', 'POLAR']);
export const SOLUTION_WARNING = 'cleaning solutions damage Crizal, Transitions and Polarex and void their warranty';

/** Crizal, Transitions or Polarex: the lenses a solution damages. */
export function solutionSensitive(catalogue, lens) {
  if (!lens || lens.family === 'CL') return false;
  const a = Object.fromEntries((lens.attributes ?? []).map((x) => [x.key, x.code]));
  const filter = SENSITIVE_FILTERS.has(catalogue?.meta('category', a.category)?.group);
  const crizal = catalogue?.codesInGroup('treatment', 'CRIZAL').has(a.treatment);
  return Boolean(filter || crizal);
}

/** The solution lines on an order that also carries Crizal, Transitions or Polarex — empty when there is no clash. */
export function solutionClash(order, catalogue) {
  if (!order.lines.some((l) => isPair(l) && solutionSensitive(catalogue, l.lens))) return [];
  return order.lines.filter((l) => l.kind === 'extra' && isSolution(catalogue, l.code, l.description));
}

// ---------------------------------------------------------------------------
// Presets as the app shows them

/** The flat rows grouped into presets, each with its tiers, in the order the data lists them. */
export function presetGroups(catalogue) {
  const groups = new Map();
  for (const t of catalogue?.presets ?? []) {
    if (!groups.has(t.presetId)) groups.set(t.presetId, { id: t.presetId, name: t.preset, blurb: t.blurb, tiers: [] });
    groups.get(t.presetId).tiers.push(t);
  }
  return [...groups.values()];
}

export const presetKey = (t) => `${t.presetId}|${t.tier}`;

/**
 * A tier read against the prescription: the lens it lands on (or why none),
 * the extras and the accessories it adds, and what it left out.
 */
export function resolvePreset(catalogue, tier, rx) {
  const hasRx = rx && !rxIsBlank(rx);
  const wantsMf = Boolean(hasRx && needsAddition(rx));
  let family = wantsMf && tier.mf ? 'MF' : 'SV';
  const notes = [];
  if (wantsMf && !tier.mf) notes.push('No progressive version — single vision.');
  const spec = family === 'MF' ? tier.mf : tier.sv;
  if (!spec) return { tier, lens: null, why: 'No lens is named for this tier.', extras: [], items: [], skipped: [], notes };

  const rows = catalogue.rows(family).filter((r) => r.available && r.price > 0)
    .map((row) => ({ row, lens: resolve(catalogue, row) }))
    .filter(({ lens }) => factsMatch(catalogue, spec, lensFacts(lens)));
  if (!rows.length) return { tier, lens: null, why: 'Not in the catalogue right now.', extras: [], items: [], skipped: [], notes };

  // A strong prescription takes a high-index material when the tier has one.
  const high = Boolean(hasRx && strongestSphere(rx) > HIGH_RX_SPHERE);
  const isHigh = (r) => Boolean(r.row.material.highRx);
  let pool = rows.filter((r) => isHigh(r) === high);
  if (!pool.length) {
    pool = rows;
    if (high) notes.push('No high-index version — standard material.');
  }
  const pick = pool.sort((a, b) => a.row.price - b.row.price)[0];
  const lens = pick.lens;
  const sensitive = solutionSensitive(catalogue, lens);

  const skipped = [];
  const extras = [];
  for (const id of tier.extras ?? []) {
    const e = catalogue.extras.find((x) => x.id === id);
    if (!e) { skipped.push({ label: id, why: 'not in the extras list' }); continue; }
    if (sensitive && isSolution(catalogue, e.id, e.description)) { skipped.push({ label: e.description, why: SOLUTION_WARNING }); continue; }
    extras.push(e);
  }
  const items = [];
  for (const spec2 of tier.items ?? []) {
    const known = spec2.skus.map((s) => catalogue.inventoryBySku.get(s)).filter(Boolean);
    const solution = spec2.solution || known.some((i) => isSolution(catalogue, i.sku, i.description));
    if (sensitive && solution) { skipped.push({ label: spec2.label, why: SOLUTION_WARNING }); continue; }
    const item = known.find((i) => i.stock > 0) ?? null;
    if (!item) { skipped.push({ label: spec2.label, why: known.length ? 'out of stock' : 'not in the stock list' }); continue; }
    items.push({ label: spec2.label, sku: item.sku, description: item.description, stock: item.stock, solution });
  }
  return { tier, family, lens, high, sensitive, extras, items, skipped, notes };
}
