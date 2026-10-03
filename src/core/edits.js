// Every change the data editor can make, as pure functions: a bundle in, a new
// bundle out. Nothing here touches storage or the screen, so each edit is easy
// to preview (run it, show the result, throw it away) and to test.

import { parseCodeLabel, brandKey } from './util.js';
import { LENS_FIELDS } from './validate.js';

const clone = (b) => ({ ...b, lenses: { ...b.lenses } });

// ---------------------------------------------------------------------------
// Lens rows

export function setLensRow(b, list, index, row) {
  const n = clone(b);
  n.lenses[list] = b.lenses[list].map((r, i) => (i === index ? row : r));
  return n;
}

export function addLensRow(b, list, row) {
  const n = clone(b);
  n.lenses[list] = [...b.lenses[list], row];
  return n;
}

export function deleteLensRow(b, list, index) {
  const n = clone(b);
  n.lenses[list] = b.lenses[list].filter((_, i) => i !== index);
  return n;
}

/** Every distinct value a lens column has, with how often — the choices in a picker. */
export function fieldValues(b, list, field) {
  const by = new Map();
  for (const r of b.lenses[list]) {
    const raw = r[field];
    const { code, pos } = parseCodeLabel(raw);
    if (!code) continue;
    const hit = by.get(code);
    if (hit) hit.count++;
    else by.set(code, { raw, code, pos, count: 1 });
  }
  return [...by.values()];
}

/**
 * How this column glues a code to its label, so a new value looks like the old
 * ones: `4300 — Polylite`, `BLC (Blanco)`, or a bare word for filters.
 */
export function composeRaw(b, list, field, code, label) {
  code = String(code ?? '').trim();
  label = String(label ?? '').trim();
  if (!label || label === code) return code;
  const sample = b.lenses[list].map((r) => String(r[field] ?? '')).find((s) => s && s !== 'N/A' && (s.includes(' — ') || /\)$/.test(s)));
  if (sample && /\)$/.test(sample) && !sample.includes(' — ')) return `${code} (${label})`;
  if (sample) return `${code} — ${label}`;
  return code;
}

/** Lens "bases": every combination except the coating, with the coatings it has. */
export function lensBases(b, list) {
  const fields = LENS_FIELDS[list].map(([f]) => f).filter((f) => f !== 'treatment');
  const by = new Map();
  for (const r of b.lenses[list]) {
    const key = fields.map((f) => parseCodeLabel(r[f]).code).join('|');
    if (!by.has(key)) by.set(key, { key, base: Object.fromEntries(fields.map((f) => [f, r[f]])), coatings: new Map() });
    by.get(key).coatings.set(parseCodeLabel(r.treatment).code, r);
  }
  return [...by.values()];
}

/** Add one coating to many lens bases at once — the way a new treatment arrives. */
export function addCoating(b, list, treatmentRaw, entries) {
  const rows = entries.map((e) => ({ ...e.base, treatment: treatmentRaw, price: e.price, available: true }));
  const n = clone(b);
  n.lenses[list] = [...b.lenses[list], ...rows];
  return n;
}

// ---------------------------------------------------------------------------
// Bulk price changes

/** Round up to the next whole peso ending in 9 — how the printed tables price. */
const toNine = (cents) => { const pesos = Math.ceil(cents / 100); return (Math.ceil((pesos + 1) / 10) * 10 - 1) * 100; };

export function newPrice(cents, { mode, amount, rounding }) {
  let next = cents;
  if (mode === 'add') next = cents + Math.round(amount * 100);
  else if (mode === 'percent') next = Math.round(cents * (1 + amount / 100));
  else if (mode === 'set') next = Math.round(amount * 100);
  if (rounding === 'peso') next = Math.round(next / 100) * 100;
  else if (rounding === 'nine') next = toNine(next);
  return Math.max(0, next);
}

/**
 * Apply one price rule to every row a filter selects.
 * `filter` is `{ field: code }` on lens rows or `{ field: value }` on frames.
 * Returns the new bundle and what changed, so the screen can preview first.
 */
export function adjustPrices(b, { target, lists = ['single', 'multifocal', 'contact'], filter = {}, rule }) {
  const changes = [];
  const matches = (row, codeOf) => Object.entries(filter).every(([f, v]) => v === '' || v == null || codeOf(row, f) === v);
  if (target === 'frames') {
    const frames = b.frames.map((f) => {
      if (!matches(f, (r, k) => String(r[k] ?? ''))) return f;
      const price = newPrice(f.price, rule);
      if (price === f.price) return f;
      changes.push({ label: f.description, from: f.price, to: price });
      return { ...f, price };
    });
    return { bundle: { ...b, frames }, changes };
  }
  const n = clone(b);
  for (const list of lists) {
    n.lenses[list] = b.lenses[list].map((r) => {
      if (!matches(r, (row, k) => parseCodeLabel(row[k]).code)) return r;
      const price = newPrice(r.price, rule);
      if (price === r.price) return r;
      changes.push({ label: LENS_FIELDS[list].map(([f]) => parseCodeLabel(r[f]).code).filter((c) => c !== 'N/A').join(' · '), from: r.price, to: price });
      return { ...r, price };
    });
  }
  return { bundle: n, changes };
}

// ---------------------------------------------------------------------------
// Keyed lists: vocabulary, frames, tiers, stock, extras, staff

function upsertBy(list, keyOf, item, originalKey) {
  const k = originalKey ?? keyOf(item);
  const i = list.findIndex((x) => keyOf(x) === k);
  if (i < 0) return [...list, item];
  return list.map((x, j) => (j === i ? item : x));
}

const vKey = (v) => `${v.kind}|${v.code}`;
export const upsertVocab = (b, v, originalKey) => ({ ...b, vocabulary: upsertBy(b.vocabulary, vKey, v, originalKey) });
export const deleteVocab = (b, key) => ({ ...b, vocabulary: b.vocabulary.filter((v) => vKey(v) !== key) });

export const upsertFrame = (b, f, originalSku) => ({ ...b, frames: upsertBy(b.frames, (x) => x.sku, f, originalSku) });
export const deleteFrame = (b, sku) => ({ ...b, frames: b.frames.filter((f) => f.sku !== sku) });

export function setTier(b, brand, tier) {
  const k = brandKey(brand);
  const rest = b.frameBrands.filter((x) => brandKey(x.brand) !== k);
  return { ...b, frameBrands: tier ? [...rest, { brand, tier }] : rest };
}

export const upsertStock = (b, item, originalSku) => ({ ...b, inventory: upsertBy(b.inventory, (x) => x.sku, item, originalSku) });
export const deleteStock = (b, sku) => ({ ...b, inventory: b.inventory.filter((i) => i.sku !== sku) });
export const replaceStock = (b, inventory, report) => ({ ...b, inventory, stockReport: report ?? b.stockReport ?? null });

export const upsertExtra = (b, e, originalId) => ({ ...b, extras: upsertBy(b.extras, (x) => x.id, e, originalId) });
export const deleteExtra = (b, id) => ({ ...b, extras: b.extras.filter((e) => e.id !== id) });

export const upsertStaff = (b, s, originalNumber) => ({ ...b, staff: upsertBy(b.staff, (x) => x.employeeNumber, s, originalNumber) });
export const deleteStaff = (b, n) => ({ ...b, staff: b.staff.filter((s) => s.employeeNumber !== n) });

// ---------------------------------------------------------------------------
// Promotions and their lens lines

/** Renaming a promo number carries its lens lines with it. */
export function upsertPromo(b, p, originalId) {
  const promotions = upsertBy(b.promotions, (x) => x.id, p, originalId);
  const promoLensMap = originalId && originalId !== p.id
    ? b.promoLensMap.map((l) => (l.promoId === originalId ? { ...l, promoId: p.id } : l))
    : b.promoLensMap;
  return { ...b, promotions, promoLensMap };
}

export const deletePromo = (b, id) => ({
  ...b, promotions: b.promotions.filter((p) => p.id !== id), promoLensMap: b.promoLensMap.filter((l) => l.promoId !== id),
});

/** A new campaign window for several promotions at once. */
export function setPromoDates(b, ids, validFrom, validTo) {
  const set = new Set(ids);
  return { ...b, promotions: b.promotions.map((p) => (set.has(p.id) ? { ...p, validFrom, validTo } : p)) };
}

export function setLine(b, index, line) {
  if (index == null || index < 0) return { ...b, promoLensMap: [...b.promoLensMap, line] };
  return { ...b, promoLensMap: b.promoLensMap.map((l, i) => (i === index ? line : l)) };
}
export const deleteLine = (b, index) => ({ ...b, promoLensMap: b.promoLensMap.filter((_, i) => i !== index) });

// ---------------------------------------------------------------------------
// Imports replace whole domains.

export function applyPieces(b, pieces) {
  const n = { ...b };
  for (const k of ['vocabulary', 'frameBrands', 'frames', 'inventory', 'extras', 'staff', 'promotions', 'promoLensMap']) if (pieces[k]) n[k] = pieces[k];
  if (pieces.lenses) n.lenses = pieces.lenses;
  if (pieces.stockReport) n.stockReport = pieces.stockReport;
  return n;
}

// ---------------------------------------------------------------------------
// Frames: what a product code already says, as suggestions for a new frame.

const MATERIAL_DIGIT = { 2: 'Acetate', Z: 'Injected', 1: 'Metal', 4: 'Metal', 5: 'Metal', 6: 'Metal', 8: 'Metal', 0: 'Metal', F: 'Metal', H: 'Metal', A: 'Metal', E: 'Metal', C: 'Metal', 7: 'Titanium' };

/**
 * The 14-character product code: characters 1–4 the brand line (a leading 2 is
 * a sun line), 12 the material family, 13–14 the eye size.
 */
export function framesFromCode(product) {
  const p = String(product ?? '').trim().toUpperCase();
  if (p.length < 13) return {};
  const size = Number(p.slice(-2));
  return {
    category: p[0] === '2' ? 'Sunglasses' : 'Ophthalmic',
    material: MATERIAL_DIGIT[p[11]] ?? '',
    size: size >= 30 && size <= 99 ? size : null,
  };
}

/** The brand a description starts with, matched against brands already known. */
export function brandFromDescription(description, brands) {
  const d = brandKey(description);
  return [...brands].sort((a, b) => b.length - a.length).find((br) => d.startsWith(brandKey(br))) ?? '';
}
