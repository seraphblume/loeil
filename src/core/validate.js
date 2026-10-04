// The publish gate, over the data itself.
//
// Whatever produced a bundle — the in-app editor, a workbook import, the stock
// report — it passes through here before it can reach a phone. A spreadsheet
// had no types and no constraints; this is what replaces them. Errors stop a
// publish; warnings are shown and published anyway; notes are for the record.

import { parseCodeLabel, brandKey } from './util.js';
import { stockKind } from './stock.js';
import { PRICE_BOUNDS, EMPLOYEE_NUMBER_DIGITS, TRUE_SKU_DIGITS } from '../config.js';

export const VOCAB_KINDS = [
  'category', 'material', 'lens_type', 'design', 'colour', 'treatment',
  'contact_material', 'contact_product', 'contact_colour', 'tier',
];

/** Which vocabulary kind each lens column is, per family. */
export const LENS_FIELDS = {
  single: [['category', 'category'], ['material', 'material'], ['design', 'design'], ['colour', 'colour'], ['treatment', 'treatment']],
  multifocal: [['category', 'category'], ['material', 'material'], ['type', 'lens_type'], ['design', 'design'], ['colour', 'colour'], ['treatment', 'treatment']],
  contact: [['material', 'contact_material'], ['product', 'contact_product'], ['colour', 'contact_colour']],
};
export const FAMILY_OF = { single: 'SV', multifocal: 'MF', contact: 'CL' };
export const LIST_OF = { SV: 'single', MF: 'multifocal', CL: 'contact' };
const SHEET_OF = { single: 'lenses_single', multifocal: 'lenses_multifocal', contact: 'lenses_contact' };

export const lensKey = (list, row) => LENS_FIELDS[list].map(([f]) => parseCodeLabel(row[f]).code).join('|');

export class Report {
  constructor() { this.errors = []; this.warnings = []; this.notes = []; }
  error(sheet, message) { this.errors.push({ sheet, message }); }
  warn(sheet, message) { this.warnings.push({ sheet, message }); }
  note(sheet, message) { this.notes.push({ sheet, message }); }
  merge(other) { this.errors.push(...other.errors); this.warnings.push(...other.warnings); this.notes.push(...other.notes); return this; }
  done(counts = {}) {
    return { ok: this.errors.length === 0, errors: this.errors, warnings: this.warnings, notes: this.notes, counts };
  }
}

export function counts(b) {
  return {
    'Single vision': b.lenses.single.length,
    Multifocal: b.lenses.multifocal.length,
    'Contact lenses': b.lenses.contact.length,
    Frames: b.frames.length,
    'Frame brands': new Set(b.frames.map((f) => f.brand)).size,
    'Stock items': b.inventory.length,
    Extras: b.extras.length,
    Staff: b.staff.length,
    Promotions: b.promotions.length,
    'Promo lines': b.promoLensMap.length,
    Vocabulary: b.vocabulary.length,
  };
}

export function validateBundle(b, report = new Report()) {
  // --- vocabulary
  const vocabIndex = new Set();
  for (const v of b.vocabulary) {
    const where = `${v.kind || '?'} ${v.code || '?'}`;
    if (!VOCAB_KINDS.includes(v.kind)) report.error('vocabulary', `${where}: unknown kind. Use one of ${VOCAB_KINDS.join(', ')}.`);
    if (!v.code) report.error('vocabulary', `A ${v.kind} entry has no code.`);
    const k = v.kind + '|' + v.code;
    if (vocabIndex.has(k)) report.error('vocabulary', `${where} is listed twice.`);
    vocabIndex.add(k);
    if (v.rank !== null && v.rank !== undefined && !Number.isFinite(Number(v.rank))) report.error('vocabulary', `${where}: rank must be a number.`);
  }
  if (!b.vocabulary.length) report.warn('vocabulary', 'No vocabulary. English names, upgrade order and promo families fall back to the POS wording, and promotions cannot match.');

  // --- lenses
  const used = new Map();
  let unavailable = 0;
  for (const list of ['single', 'multifocal', 'contact']) {
    const fam = FAMILY_OF[list];
    const [lo, hi] = PRICE_BOUNDS[fam];
    const seen = new Set();
    for (const row of b.lenses[list]) {
      const key = lensKey(list, row);
      if (seen.has(key)) report.error(SHEET_OF[list], `${key} is listed twice.`);
      seen.add(key);
      for (const [f, kind] of LENS_FIELDS[list]) {
        const { code } = parseCodeLabel(row[f]);
        if (!code) { report.error(SHEET_OF[list], `${key}: ${f} is blank.`); continue; }
        used.set(kind + '|' + code, (used.get(kind + '|' + code) ?? 0) + 1);
      }
      if (!row.available) { unavailable++; continue; }
      if (!row.price || row.price <= 0) report.error(SHEET_OF[list], `${key} is available but has no price.`);
      else if (row.price < lo * 100 || row.price > hi * 100) report.error(SHEET_OF[list], `${key} is priced ${row.price / 100}, outside ${lo}–${hi}.`);
    }
  }
  if (unavailable) report.note('Lenses', `${unavailable} row${unavailable > 1 ? 's are' : ' is'} listed but marked unavailable — shown greyed, never added to an order.`);

  if (b.vocabulary.length) {
    const byKind = {};
    for (const k of used.keys()) if (!vocabIndex.has(k)) { const [kind, code] = k.split('|'); (byKind[kind] ??= []).push(code); }
    for (const [kind, codes] of Object.entries(byKind)) report.warn('vocabulary', `No ${kind} entry for ${codes.join(', ')} — shown in the POS wording until one is added.`);
    const grouped = new Set(b.vocabulary.filter((v) => v.group).map((v) => v.kind + '|' + v.code));
    const noGroup = [...used.keys()].filter((k) => (k.startsWith('material|') || k.startsWith('category|')) && !grouped.has(k));
    if (noGroup.length) report.warn('vocabulary', `No promo group for ${noGroup.map((k) => k.replace('|', ' ')).join(', ')} — those lenses cannot match a promotion.`);
  }

  // --- frame brands
  const tiers = new Set();
  for (const fb of b.frameBrands) {
    const k = brandKey(fb.brand);
    if (!k) report.error('frame_brands', 'A brand tier has no brand name.');
    if (tiers.has(k)) report.error('frame_brands', `${fb.brand} is listed twice.`);
    tiers.add(k);
  }

  // --- frames
  const skus = new Set();
  const [flo, fhi] = PRICE_BOUNDS.FRAME;
  for (const f of b.frames) {
    const label = f.description || f.sku;
    if (!new RegExp(`^\\d{${TRUE_SKU_DIGITS}}$`).test(f.sku ?? '')) report.error('Frames', `${label}: barcode "${f.sku ?? ''}" is not ${TRUE_SKU_DIGITS} digits.`);
    if (skus.has(f.sku)) report.error('Frames', `Barcode ${f.sku} is used by two frames.`);
    skus.add(f.sku);
    if (!f.price || f.price <= 0) report.error('Frames', `${label} has no price.`);
    else if (f.price < flo * 100 || f.price > fhi * 100) report.warn('Frames', `${label} is priced ${f.price / 100}, outside ${flo}–${fhi}.`);
    if (!f.description) report.error('Frames', `Frame ${f.sku} has no description.`);
  }
  if (!b.frames.length) report.error('Frames', 'There are no frames.');
  const untiered = [...new Set(b.frames.map((f) => f.brand))].filter((br) => br && !tiers.has(brandKey(br)));
  if (untiered.length) report.note('frame_brands', `${untiered.length} brand${untiered.length > 1 ? 's have' : ' has'} no tier: ${untiered.slice(0, 12).join(', ')}${untiered.length > 12 ? '…' : ''}.`);

  // --- stock
  const stockSkus = new Set();
  for (const i of b.inventory) {
    if (!new RegExp(`^\\d{${TRUE_SKU_DIGITS}}$`).test(i.sku ?? '')) report.error('Stock', `${i.description || '?'}: barcode "${i.sku ?? ''}" is not ${TRUE_SKU_DIGITS} digits.`);
    if (stockSkus.has(i.sku)) report.error('Stock', `Barcode ${i.sku} is listed twice in stock.`);
    stockSkus.add(i.sku);
    if (!Number.isFinite(Number(i.stock))) report.error('Stock', `${i.description}: stock is not a number.`);
  }
  const outside = b.inventory.filter((i) => stockKind(i) === 'frame' && !skus.has(i.sku)).length;
  if (outside) report.note('Stock', `${outside} frame${outside > 1 ? 's' : ''} in stock ${outside > 1 ? 'are' : 'is'} not in the frame catalogue — those still need the tag price typed.`);

  // --- extras
  const extraIds = new Set();
  for (const e of b.extras) {
    if (!e.id) report.error('Extras', `${e.description || 'An extra'} has no code.`);
    if (extraIds.has(e.id)) report.error('Extras', `Code ${e.id} is listed twice.`);
    extraIds.add(e.id);
    if (e.percent != null && !(Number(e.percent) > 0 && Number(e.percent) <= 100)) report.error('Extras', `${e.description || e.id}: the percentage must be more than 0 and at most 100.`);
  }

  // --- staff
  const nums = new Set();
  for (const s of b.staff) {
    if (!new RegExp(`^\\d{${EMPLOYEE_NUMBER_DIGITS}}$`).test(s.employeeNumber)) report.error('Staff', `${s.name || '?'}: employee number ${s.employeeNumber} is not ${EMPLOYEE_NUMBER_DIGITS} digits.`);
    if (nums.has(s.employeeNumber)) report.error('Staff', `Employee number ${s.employeeNumber} is listed twice.`);
    nums.add(s.employeeNumber);
    if (!s.name) report.error('Staff', `Employee ${s.employeeNumber} has no name.`);
  }
  if (b.staff.length && !b.staff.some((s) => s.role === 'admin' && s.active)) report.error('Staff', 'No active person has the admin role.');

  // --- promotions
  const ids = new Set();
  for (const p of b.promotions) {
    if (!p.id) report.error('Promotions', `${p.name || 'A promotion'} has no promo number.`);
    if (ids.has(p.id)) report.error('Promotions', `Promo ${p.id} is listed twice.`);
    ids.add(p.id);
    if (p.validFrom && p.validTo && p.validTo < p.validFrom) report.error('Promotions', `Promo ${p.id} ends before it starts.`);
  }
  const lineKeys = new Set();
  let repeats = 0;
  for (const l of b.promoLensMap) {
    if (!ids.has(l.promoId)) report.error('Promo lines', `A line names promo ${l.promoId}, which does not exist.`);
    if (String(l.matchKey).split('|').length !== 5) report.error('Promo lines', `Promo ${l.promoId}: match key "${l.matchKey}" needs five parts.`);
    const k = `${l.promoId}|${l.package}|${l.matchKey}`;
    if (lineKeys.has(k)) repeats++;
    lineKeys.add(k);
  }
  if (repeats) report.note('Promo lines', `${repeats} promo line${repeats > 1 ? 's repeat' : ' repeats'} a match already listed for the same promotion \u2014 harmless, usually two printed lines that read the same.`);
  if (b.promoLensMap.length) {
    const designs = new Set();
    const coatings = new Set();
    for (const r of [...b.lenses.single, ...b.lenses.multifocal]) { designs.add(parseCodeLabel(r.design).code); coatings.add(parseCodeLabel(r.treatment).code); }
    const orphans = b.promoLensMap.filter((l) => {
      const [, , d, , c] = String(l.matchKey).split('|');
      return (d && !d.startsWith('*') && !designs.has(d)) || (c && !c.startsWith('*') && !coatings.has(c));
    }).length;
    if (orphans) report.note('Promo lines', `${orphans} promo line${orphans > 1 ? 's name' : ' names'} a design or coating no lens has, so ${orphans > 1 ? 'they' : 'it'} can never match.`);
  }

  return report.done(counts(b));
}
