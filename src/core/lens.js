// The catalogue as logic rather than screens.
//
// Options are always gathered from real rows, never from a list of every
// possible value, so a combination the sheet does not contain cannot be built.
// That is also what keeps `4709 — Ultralite` out of every non-photochromic
// path without a special case: it only ever appears in photochromic rows.
//
// A SELECTION HOLDS CODES, NOT VALUES. Codes are the only part of a lens that is
// stable across a catalogue update, so a selection made before a publish still
// means the same thing after it.

import { fold } from './util.js';
import { promoKeyFor } from './promotions.js';

export const FAMILIES = [
  {
    id: 'SV', label: 'Single vision', blurb: 'One correction across the lens.', icon: 'sv',
    steps: [
      { key: 'category', title: 'Filter' },
      { key: 'material', title: 'Material' },
      { key: 'design', title: 'Design' },
      { key: 'colour', title: 'Colour', filter: true },
      { key: 'treatment', title: 'Coating' },
    ],
  },
  {
    id: 'MF', label: 'Multifocal', blurb: 'Bifocal and progressive.', icon: 'mf',
    steps: [
      { key: 'category', title: 'Filter' },
      { key: 'material', title: 'Material' },
      { key: 'type', title: 'Lens type' },
      { key: 'design', title: 'Design' },
      { key: 'colour', title: 'Colour', filter: true },
      { key: 'treatment', title: 'Coating' },
    ],
  },
  {
    id: 'CL', label: 'Contact lenses', blurb: 'Spherical, toric, multifocal and coloured.', icon: 'cl',
    steps: [
      { key: 'material', title: 'Correction' },
      { key: 'product', title: 'Product', filter: true },
      { key: 'colour', title: 'Colour', filter: true },
    ],
  },
];

export const familyById = (id) => FAMILIES.find((f) => f.id === id);

/** Every row that agrees with the choices made so far. */
export function matches(catalogue, familyId, chosen) {
  return catalogue.rows(familyId).filter((row) => {
    for (const [k, code] of Object.entries(chosen)) if (code != null && row[k]?.code !== code) return false;
    return true;
  });
}

/** The first step with nothing chosen, or null when the lens is resolved. */
export function currentStep(familyId, chosen) {
  return familyById(familyId).steps.find((s) => chosen[s.key] == null) ?? null;
}

/**
 * Distinct values at a step with the count each would leave standing, and
 * whether anything behind it can actually be sold. Ordered by the vocabulary's
 * rank where one is set (the coating ladder), otherwise by catalogue order.
 */
export function options(catalogue, familyId, chosen, stepKey) {
  const rows = matches(catalogue, familyId, chosen);
  const seen = new Map();
  rows.forEach((row, i) => {
    const v = row[stepKey];
    const hit = seen.get(v.code);
    if (hit) { hit.count++; hit.available ||= row.available; hit.minPrice = Math.min(hit.minPrice, row.price); }
    else seen.set(v.code, { value: v, count: 1, available: row.available, first: i, minPrice: row.price });
  });
  return [...seen.values()]
    .sort((a, b) => (a.value.rank ?? Infinity) - (b.value.rank ?? Infinity) || a.first - b.first)
    .map((o) => ({
      code: o.value.code,
      label: o.value.label,
      pos: o.value.pos,
      blurb: o.value.blurb,
      // The code is worth showing because he reads against a register that
      // speaks codes — but only when it IS a code. Category has none.
      detail: o.value.code !== o.value.label && o.value.code !== o.value.pos ? o.value.code : '',
      count: o.count,
      available: o.available,
      highRx: o.value.highRx,
      fromPrice: o.minPrice,
    }));
}

/** The English label for a chosen code, read off the rows that survived. */
export function chosenLabel(catalogue, familyId, chosen, stepKey) {
  const code = chosen[stepKey];
  if (code == null) return null;
  return matches(catalogue, familyId, chosen)[0]?.[stepKey]?.label ?? code;
}

/** Choosing again at an earlier step invalidates everything downstream. */
export function clearFrom(familyId, chosen, stepKey) {
  const steps = familyById(familyId).steps;
  const at = steps.findIndex((s) => s.key === stepKey);
  const out = {};
  steps.forEach((s, i) => { if (i < at && chosen[s.key] != null) out[s.key] = chosen[s.key]; });
  return out;
}

// ---------------------------------------------------------------------------
// The POS product code

/**
 * The register wants the attribute codes run together. Observed: material
 * `4300`, lens type `SV`, design `ES`, colour `TSI` prints as `4300SVESTSI1`.
 * The trailing `1` and the omission of `N/A` segments are inferred from that
 * single example — confirm against a second printed code before relying on it
 * for a lens whose design or colour is N/A.
 */
export function posCode(row) {
  if (row.family === 'CL') return '';
  const segs = row.family === 'SV'
    ? [row.material.code, 'SV', row.design.code, row.colour.code]
    : [row.material.code, row.type.code, row.design.code, row.colour.code];
  return segs.filter((s) => s && s !== 'N/A').join('') + '1';
}

const ATTRS = {
  SV: [['category', 'Filter'], ['material', 'Material'], ['design', 'Design'], ['colour', 'Colour'], ['treatment', 'Coating']],
  MF: [['category', 'Filter'], ['material', 'Material'], ['type', 'Lens type'], ['design', 'Design'], ['colour', 'Colour'], ['treatment', 'Coating']],
  CL: [['material', 'Correction'], ['product', 'Product'], ['colour', 'Colour']],
};

/**
 * A finished configuration: everything the result screen and a saved order
 * need, denormalised so a later catalogue change cannot rewrite history.
 */
export function resolve(catalogue, row) {
  const attrs = ATTRS[row.family].map(([key, name]) => ({
    key, name, code: row[key].code, label: row[key].label, pos: row[key].pos,
  }));
  const nameParts = row.family === 'CL'
    ? [row.product, row.colour]
    : ATTRS[row.family].filter(([k]) => k !== 'category').map(([k]) => row[k]);
  return {
    family: row.family,
    rowId: row.id,
    displayName: nameParts.filter((v) => !v.isNone && v.label !== 'None').map((v) => v.label).join(' · '),
    posCode: posCode(row),
    priceCents: row.price,
    attributes: attrs,
    available: row.available,
    promoKey: promoKeyFor(catalogue, row),
  };
}

export function rowFor(catalogue, rowId) { return catalogue.rowsById.get(rowId) ?? null; }

/** The code the register wants for a lens line: the POS code, or the parts. */
export function lensCodeText(lens) {
  return lens.posCode || lens.attributes.map((a) => a.code).join(' ');
}

/** Every row that differs from this one in exactly the named attribute. */
export function alternatives(catalogue, rowId, key) {
  const row = rowFor(catalogue, rowId);
  if (!row) return [];
  const keys = ATTRS[row.family].map(([k]) => k).filter((k) => k !== key);
  return catalogue.rows(row.family).filter((r) => keys.every((k) => r[k].code === row[k].code));
}

/**
 * The upgrade ladder: same lens, a coating ranked higher in the vocabulary.
 * Coatings with no rank (mirrors, kids) are a different axis, not a rung, so
 * they neither offer nor appear as upgrades.
 */
export function upgrades(catalogue, rowId) {
  const row = rowFor(catalogue, rowId);
  if (!row || row.family === 'CL' || row.treatment.rank == null) return [];
  return alternatives(catalogue, rowId, 'treatment')
    .filter((r) => r.treatment.rank != null && r.treatment.rank > row.treatment.rank && r.available)
    .sort((a, b) => a.treatment.rank - b.treatment.rank || a.price - b.price)
    .map((r) => ({ row: r, delta: r.price - row.price }));
}

/** Loose token search over every family. Every token must match. */
export function searchLenses(catalogue, term, limit = 30) {
  const tokens = fold(term).split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];
  const out = [];
  for (const row of [...catalogue.single, ...catalogue.multifocal, ...catalogue.contact]) {
    if (!row._hay) {
      const parts = Object.values(row).filter((v) => v && typeof v === 'object' && 'code' in v);
      row._hay = fold([posCode(row), FAMILY_WORDS[row.family], ...parts.flatMap((v) => [v.code, v.label, v.pos])].join(' '));
    }
    let score = 0;
    let ok = true;
    for (const t of tokens) { if (!row._hay.includes(t)) { ok = false; break; } score += t.length; }
    if (ok) out.push({ row, score });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit).map((h) => resolve(catalogue, h.row));
}

const FAMILY_WORDS = {
  SV: 'single vision vision sencilla monofocal',
  MF: 'multifocal progressive progresivo bifocal',
  CL: 'contact lens lente de contacto',
};
