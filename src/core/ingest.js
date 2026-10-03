// Workbooks in, one data bundle and a gate report out.
//
// Shared by the in-app publisher (browser) and `tools/publish.mjs` (Node), so
// both refuse exactly the same mistakes. Input is plain arrays — whichever
// runner opened the .xlsx files hands over `{ sheetName: { rows, hidden } }`.
//
// THE GATE replaces a database's constraints. A spreadsheet has no types, so
// one stray edit — a price deleted, a row pasted twice, a code with a trailing
// space — would otherwise reach every phone mid-shift. Errors stop a publish;
// warnings are shown and published anyway.

import {
  fold, parseCodeLabel, cellText, toCents, isYes, digits, sheetDay, brandKey,
} from './util.js';
import {
  PRICE_BOUNDS, EMPLOYEE_NUMBER_DIGITS, TRUE_SKU_DIGITS,
} from '../config.js';

export const BUNDLE_FORMAT = 'loeil-bundle';
export const BUNDLE_VERSION = 1;
/** The oldest app build that can read what this file writes. */
export const BUNDLE_MIN_APP_BUILD = 1;

/** Vocabulary kinds, and which lens column each one names. */
export const VOCAB_KINDS = [
  'category', 'material', 'lens_type', 'design', 'colour', 'treatment',
  'contact_material', 'contact_product', 'contact_colour', 'tier',
];

// ---------------------------------------------------------------------------
// Opening workbooks

/** SheetJS workbook → `{ name: { rows, hidden } }`. The caller supplies XLSX. */
export function tablesFromWorkbook(XLSX, wb) {
  const out = {};
  const meta = wb.Workbook?.Sheets ?? [];
  wb.SheetNames.forEach((name, i) => {
    const ws = wb.Sheets[name];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: false });
    out[name] = { rows, hidden: Boolean(meta[i]?.Hidden) };
  });
  return out;
}

/** Which of the picked workbooks is which, by what is inside them. */
export function classify(workbooks) {
  let backend = null;
  let catalogue = null;
  for (const wb of workbooks) {
    const names = Object.keys(wb.sheets).map((n) => n.toLowerCase());
    if (names.includes('lenses_single') || names.includes('promo_lens_map')) backend = wb;
    else if (frameSheets(wb.sheets).length) catalogue = wb;
  }
  return { backend, catalogue };
}

// ---------------------------------------------------------------------------
// Headers

const HEADER_ALIASES = {
  descripcion: 'description',
  clasificacion: 'classification',
  existencia: 'stock',
  lote: 'lot',
  caducidad: 'expires',
  expiry: 'expires',
  'material (true sku)': 'true sku',
  barcode: 'true sku',
  colour: 'color',
};

function headerKey(h) {
  const k = fold(cellText(h)).trim().replace(/\s+/g, ' ');
  return HEADER_ALIASES[k] ?? k;
}

/** Rows as objects keyed by normalised header. Blank rows are dropped. */
function records(table, { headerRow = 0 } = {}) {
  if (!table || !table.rows.length) return { cols: new Set(), rows: [] };
  const header = (table.rows[headerRow] ?? []).map(headerKey);
  const cols = new Set(header.filter(Boolean));
  const rows = [];
  for (let r = headerRow + 1; r < table.rows.length; r++) {
    const raw = table.rows[r] ?? [];
    if (!raw.some((v) => v !== null && v !== undefined && String(v).trim() !== '')) continue;
    const rec = { _row: r + 1 };
    header.forEach((h, i) => { if (h && !(h in rec)) rec[h] = raw[i] ?? null; });
    rows.push(rec);
  }
  return { cols, rows };
}

function findSheet(sheets, name) {
  const key = Object.keys(sheets).find((n) => n.toLowerCase() === name);
  return key ? sheets[key] : null;
}

function frameSheets(sheets) {
  return Object.entries(sheets).filter(([, t]) => {
    const header = (t.rows[0] ?? []).map(headerKey);
    return header.includes('true sku') && header.includes('price') && header.includes('description');
  });
}

// ---------------------------------------------------------------------------
// The ingest

export function ingest(workbooks, { now = new Date() } = {}) {
  const report = new Report();
  const { backend, catalogue } = classify(workbooks);

  if (!backend) report.error('Workbooks', 'No Backend workbook found. Pick LOEIL_Backend.xlsx (it has a lenses_single tab).');
  if (!catalogue) report.error('Workbooks', 'No frame catalogue found. Pick Catalogue.xlsx (brand tabs with Product, Material (True SKU), Description and Price).');
  if (!backend || !catalogue) return { bundle: null, report: report.done() };

  const S = backend.sheets;
  const need = (sheet, cols, label = sheet) => {
    const t = findSheet(S, sheet);
    if (!t) { report.error(label, `The ${sheet} tab is missing.`); return null; }
    const rec = records(t);
    const missing = cols.filter((c) => !rec.cols.has(c));
    if (missing.length) { report.error(label, `Missing column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}.`); return null; }
    return rec;
  };

  // --- manifest (optional, informational)
  const manifest = {};
  const mt = findSheet(S, '_manifest');
  if (mt) for (const row of mt.rows.slice(1)) if (row?.[0]) manifest[cellText(row[0]).trim()] = row[1];
  const sheetSchema = Number(manifest.schema_version ?? 1);
  if (sheetSchema > 1) report.error('_manifest', `schema_version is ${sheetSchema}; this app reads layout 1. Update the app before publishing this workbook.`);

  // --- vocabulary (optional but strongly recommended)
  const vocabulary = [];
  const vt = findSheet(S, 'vocabulary');
  if (!vt) {
    report.warn('vocabulary', 'No vocabulary tab. English names, upgrade order and promo families will fall back to the POS wording, and promotions cannot match.');
  } else {
    const v = records(vt);
    for (const c of ['kind', 'code']) if (!v.cols.has(c)) report.error('vocabulary', `Missing column: ${c}.`);
    const seen = new Set();
    for (const r of v.rows) {
      const kind = fold(cellText(r.kind)).trim().replace(/\s+/g, '_');
      const code = cellText(r.code).trim();
      if (!kind && !code) continue;
      if (!VOCAB_KINDS.includes(kind)) { report.error('vocabulary', `Row ${r._row}: unknown kind "${cellText(r.kind)}". Use one of ${VOCAB_KINDS.join(', ')}.`); continue; }
      if (!code) { report.error('vocabulary', `Row ${r._row}: code is blank.`); continue; }
      const key = kind + '|' + code;
      if (seen.has(key)) report.error('vocabulary', `Row ${r._row}: ${kind} ${code} is listed twice.`);
      seen.add(key);
      const rank = r.rank === null || r.rank === undefined || r.rank === '' ? null : Number(r.rank);
      if (rank !== null && !Number.isFinite(rank)) report.error('vocabulary', `Row ${r._row}: rank must be a number.`);
      vocabulary.push({
        kind, code,
        english: cellText(r.english).trim(),
        blurb: cellText(r.blurb).trim(),
        rank: Number.isFinite(rank) ? rank : null,
        group: cellText(r['promo_group'] ?? r.group).trim().toUpperCase(),
        sameAs: cellText(r['same_as']).trim(),
        highRx: isYes(r['high_rx']),
      });
    }
  }
  const vocabIndex = new Set(vocabulary.map((v) => v.kind + '|' + v.code));

  // --- lenses
  const lensCols = ['category', 'material', 'design', 'color', 'treatment', 'price mxn', 'available'];
  const sv = need('lenses_single', lensCols);
  const mf = need('lenses_multifocal', [...lensCols, 'lens type']);
  const cl = need('lenses_contact', ['material', 'lens type', 'color', 'price mxn', 'available']);

  const lenses = { single: [], multifocal: [], contact: [] };
  const usedCodes = new Map(); // kind|code → count

  const use = (kind, raw) => {
    const { code } = parseCodeLabel(raw);
    if (!code) return;
    const k = kind + '|' + code;
    usedCodes.set(k, (usedCodes.get(k) ?? 0) + 1);
  };

  const checkPrice = (sheet, fam, r, price, available, label) => {
    const [lo, hi] = PRICE_BOUNDS[fam];
    if (available && (price === null || price <= 0)) report.error(sheet, `Row ${r._row}: ${label} is available but has no price.`);
    else if (available && (price < lo * 100 || price > hi * 100)) report.error(sheet, `Row ${r._row}: ${label} is priced ${price / 100}, outside ${lo}–${hi}.`);
  };

  if (sv) {
    const seen = new Map();
    for (const r of sv.rows) {
      const row = {
        category: cellText(r.category).trim(), material: cellText(r.material), design: cellText(r.design),
        colour: cellText(r.color), treatment: cellText(r.treatment),
        price: toCents(r['price mxn']), available: isYes(r.available),
      };
      if (!row.category && !row.material) continue;
      const key = ['category', 'material', 'design', 'colour', 'treatment'].map((k) => parseCodeLabel(row[k]).code).join('|');
      if (seen.has(key)) report.error('lenses_single', `Row ${r._row} repeats row ${seen.get(key)} (${key}).`);
      seen.set(key, r._row);
      checkPrice('lenses_single', 'SV', r, row.price, row.available, key);
      use('category', row.category); use('material', row.material); use('design', row.design);
      use('colour', row.colour); use('treatment', row.treatment);
      lenses.single.push(row);
    }
  }
  if (mf) {
    const seen = new Map();
    for (const r of mf.rows) {
      const row = {
        category: cellText(r.category).trim(), material: cellText(r.material), type: cellText(r['lens type']),
        design: cellText(r.design), colour: cellText(r.color), treatment: cellText(r.treatment),
        price: toCents(r['price mxn']), available: isYes(r.available),
      };
      if (!row.category && !row.material) continue;
      const key = ['category', 'material', 'type', 'design', 'colour', 'treatment'].map((k) => parseCodeLabel(row[k]).code).join('|');
      if (seen.has(key)) report.error('lenses_multifocal', `Row ${r._row} repeats row ${seen.get(key)} (${key}).`);
      seen.set(key, r._row);
      checkPrice('lenses_multifocal', 'MF', r, row.price, row.available, key);
      use('category', row.category); use('material', row.material); use('lens_type', row.type);
      use('design', row.design); use('colour', row.colour); use('treatment', row.treatment);
      lenses.multifocal.push(row);
    }
  }
  if (cl) {
    const seen = new Map();
    for (const r of cl.rows) {
      const row = {
        material: cellText(r.material), product: cellText(r['lens type']), colour: cellText(r.color),
        price: toCents(r['price mxn']), available: isYes(r.available),
      };
      if (!row.material && !row.product) continue;
      const key = ['material', 'product', 'colour'].map((k) => parseCodeLabel(row[k]).code).join('|');
      if (seen.has(key)) report.error('lenses_contact', `Row ${r._row} repeats row ${seen.get(key)} (${key}).`);
      seen.set(key, r._row);
      checkPrice('lenses_contact', 'CL', r, row.price, row.available, key);
      use('contact_material', row.material); use('contact_product', row.product); use('contact_colour', row.colour);
      lenses.contact.push(row);
    }
  }
  const unavailable = [...lenses.single, ...lenses.multifocal, ...lenses.contact].filter((r) => !r.available).length;
  if (unavailable) report.note('Lenses', `${unavailable} row${unavailable > 1 ? 's are' : ' is'} listed but marked unavailable — shown greyed, never added to an order.`);

  // --- frame brands and tiers
  const frameBrands = [];
  const fb = need('frame_brands', ['brand', 'tier']);
  if (fb) {
    const seen = new Set();
    for (const r of fb.rows) {
      const brand = cellText(r.brand).trim();
      if (!brand) continue;
      if (seen.has(brandKey(brand))) report.error('frame_brands', `Row ${r._row}: ${brand} is listed twice.`);
      seen.add(brandKey(brand));
      frameBrands.push({ brand, tier: cellText(r.tier).trim() });
      use('tier', cellText(r.tier));
    }
  }

  // --- inventory, collapsed by barcode: stock summed, earliest expiry kept
  const inventory = [];
  const inv = need('inventory', ['sku', 'true sku', 'description', 'stock']);
  if (inv) {
    const bySku = new Map();
    for (const r of inv.rows) {
      const sku = digits(r['true sku']);
      if (!sku && !cellText(r.description)) continue;
      if (sku.length !== TRUE_SKU_DIGITS) { report.error('inventory', `Row ${r._row}: barcode "${cellText(r['true sku'])}" is not ${TRUE_SKU_DIGITS} digits.`); continue; }
      const stockRaw = r.stock;
      if (stockRaw === null || stockRaw === '') report.error('inventory', `Row ${r._row}: stock is blank.`);
      const stock = Number(stockRaw) || 0;
      const expires = sheetDay(r.expires);
      const prev = bySku.get(sku);
      if (prev) {
        prev.stock += stock;
        prev.batches += 1;
        if (expires && (!prev.expires || expires < prev.expires)) prev.expires = expires;
      } else {
        const item = {
          sku, vendorSku: cellText(r.sku).trim(), description: cellText(r.description).trim(),
          classification: cellText(r.classification).trim(), stock, expires, batches: 1,
        };
        bySku.set(sku, item);
        inventory.push(item);
      }
    }
  }

  // --- extras
  const extras = [];
  const ex = need('extras', ['id', 'description']);
  if (ex) for (const r of ex.rows) {
    const id = cellText(r.id).trim();
    if (id) extras.push({ id, description: cellText(r.description).trim() });
  }

  // --- staff
  const staff = [];
  const st = need('staff', ['employee_number', 'name', 'role', 'active']);
  if (st) {
    const seen = new Set();
    for (const r of st.rows) {
      const employeeNumber = cellText(r.employee_number).trim();
      if (!employeeNumber) continue;
      if (!new RegExp(`^\\d{${EMPLOYEE_NUMBER_DIGITS}}$`).test(employeeNumber)) report.error('staff', `Row ${r._row}: employee number ${employeeNumber} is not ${EMPLOYEE_NUMBER_DIGITS} digits.`);
      if (seen.has(employeeNumber)) report.error('staff', `Row ${r._row}: employee number ${employeeNumber} is listed twice.`);
      seen.add(employeeNumber);
      staff.push({
        employeeNumber, name: cellText(r.name).trim(), shortName: cellText(r.short_name).trim(),
        role: cellText(r.role).trim().toLowerCase(), active: isYes(r.active),
      });
    }
    if (!staff.some((s) => s.role === 'admin')) report.error('staff', 'No one has the admin role.');
  }

  // --- promotions
  const promotions = [];
  const pr = need('promotions', ['promo_id', 'kind', 'name', 'conditions', 'valid_from', 'valid_to']);
  if (pr) {
    for (const r of pr.rows) {
      const id = cellText(r.promo_id).trim();
      const name = cellText(r.name).trim();
      if (!id && !name && !cellText(r.kind)) continue;
      if (!id) { report.error('promotions', `Row ${r._row}: ${name || 'a promotion'} has no promo_id.`); continue; }
      const validFrom = sheetDay(r.valid_from);
      const validTo = sheetDay(r.valid_to);
      if (validFrom && validTo && validTo < validFrom) report.error('promotions', `Row ${r._row}: promo ${id} ends before it starts.`);
      promotions.push({
        id, kind: cellText(r.kind).trim(), name, description: cellText(r.description).trim(),
        category: cellText(r.category).trim(), conditions: cellText(r.conditions).trim(),
        validFrom, validTo, notes: cellText(r.notes).trim(),
      });
    }
  }
  const promoIds = new Set(promotions.map((p) => p.id));

  const promoLensMap = [];
  const pm = need('promo_lens_map', ['promo_id', 'package', 'match_key']);
  if (pm) {
    for (const r of pm.rows) {
      const promoId = cellText(r.promo_id).trim();
      const matchKey = cellText(r.match_key).trim();
      if (!promoId && !matchKey) continue;
      if (!promoIds.has(promoId)) report.error('promo_lens_map', `Row ${r._row}: promo ${promoId} is not on the promotions tab.`);
      if (r.resolved !== undefined && r.resolved !== null && !isYes(r.resolved)) report.error('promo_lens_map', `Row ${r._row}: line is not resolved yet.`);
      if (matchKey.split('|').length !== 5) report.error('promo_lens_map', `Row ${r._row}: match_key "${matchKey}" needs five parts.`);
      promoLensMap.push({
        promoId, package: cellText(r.package).trim(), matchKey,
        lensDescription: cellText(r.lens_description).trim(),
      });
    }
  }

  // --- frames, from the catalogue workbook: every tab shaped like a brand tab
  const frames = [];
  const frameSeen = new Map();
  let framesNoPrice = 0;
  for (const [sheetName, table] of frameSheets(catalogue.sheets)) {
    const rec = records(table);
    for (const r of rec.rows) {
      const sku = digits(r['true sku']);
      const description = cellText(r.description).trim();
      if (!sku && !description) continue;
      const where = `${sheetName} row ${r._row}`;
      if (sku.length !== TRUE_SKU_DIGITS) { report.error('Catalogue', `${where}: barcode "${cellText(r['true sku'])}" is not ${TRUE_SKU_DIGITS} digits.`); continue; }
      if (frameSeen.has(sku)) { report.error('Catalogue', `${where}: barcode ${sku} already appears at ${frameSeen.get(sku)}.`); continue; }
      frameSeen.set(sku, where);
      const price = toCents(r.price);
      const [lo, hi] = PRICE_BOUNDS.FRAME;
      if (price === null || price <= 0) { framesNoPrice++; report.error('Catalogue', `${where}: ${description} has no price.`); continue; }
      if (price < lo * 100 || price > hi * 100) report.warn('Catalogue', `${where}: ${description} is priced ${price / 100}, outside ${lo}–${hi}.`);
      const size = Number(r.size);
      frames.push({
        sku, product: cellText(r.product).trim(), description, price,
        brand: cellText(r.brand).trim() || sheetName,
        frameType: cellText(r['frame type']).trim(),
        category: cellText(r.category).trim(),
        material: cellText(r.material).trim(),
        size: Number.isFinite(size) && size > 0 ? size : null,
      });
    }
  }
  if (!frames.length) report.error('Catalogue', 'No frames were read from the catalogue.');

  // --- cross-checks, reported rather than hidden
  if (vocabulary.length) {
    const missing = [...usedCodes.keys()].filter((k) => !vocabIndex.has(k));
    if (missing.length) {
      const byKind = {};
      for (const k of missing) { const [kind, code] = k.split('|'); (byKind[kind] ??= []).push(code); }
      for (const [kind, codes] of Object.entries(byKind)) {
        report.warn('vocabulary', `No ${kind} entry for ${codes.join(', ')} — shown in the POS wording until one is added.`);
      }
    }
    // Promo groups the matcher depends on.
    const groupOf = new Map(vocabulary.filter((v) => v.group).map((v) => [v.kind + '|' + v.code, v.group]));
    const noGroup = [];
    for (const k of usedCodes.keys()) {
      const [kind] = k.split('|');
      if ((kind === 'material' || kind === 'category') && !groupOf.has(k)) noGroup.push(k.replace('|', ' '));
    }
    if (noGroup.length) report.warn('vocabulary', `No promo_group for ${noGroup.join(', ')} — those lenses cannot match a promotion.`);
  }

  if (promoLensMap.length && (lenses.single.length || lenses.multifocal.length)) {
    const designs = new Set();
    const coatings = new Set();
    for (const r of [...lenses.single, ...lenses.multifocal]) {
      designs.add(parseCodeLabel(r.design).code);
      coatings.add(parseCodeLabel(r.treatment).code);
    }
    const orphans = promoLensMap.filter((l) => {
      const [, , design, , coating] = l.matchKey.split('|');
      const dUnknown = design && !design.startsWith('*') && !designs.has(design);
      const cUnknown = coating && !coating.startsWith('*') && !coatings.has(coating);
      return dUnknown || cUnknown;
    });
    if (orphans.length) report.note('promo_lens_map', `${orphans.length} promo line${orphans.length > 1 ? 's name' : ' names'} a design or coating no lens row has, so ${orphans.length > 1 ? 'they' : 'it'} can never match.`);
  }

  const frameSkus = new Set(frames.map((f) => f.sku));
  const invFramesOutside = inventory.filter((i) => isFrameStock(i) && !frameSkus.has(i.sku)).length;
  if (invFramesOutside) report.note('inventory', `${invFramesOutside} frame${invFramesOutside > 1 ? 's' : ''} in stock ${invFramesOutside > 1 ? 'are' : 'is'} not in the catalogue — those still need the tag price typed.`);

  const brandTiers = new Set(frameBrands.map((b) => brandKey(b.brand)));
  const untiered = [...new Set(frames.map((f) => f.brand))].filter((b) => !brandTiers.has(brandKey(b)));
  if (untiered.length) report.note('frame_brands', `${untiered.length} catalogue brand${untiered.length > 1 ? 's have' : ' has'} no tier: ${untiered.slice(0, 12).join(', ')}${untiered.length > 12 ? '…' : ''}.`);

  const counts = {
    'Single vision': lenses.single.length,
    Multifocal: lenses.multifocal.length,
    'Contact lenses': lenses.contact.length,
    Frames: frames.length,
    'Frame brands': new Set(frames.map((f) => f.brand)).size,
    'Stock items': inventory.length,
    Extras: extras.length,
    Staff: staff.length,
    Promotions: promotions.length,
    'Promo lines': promoLensMap.length,
    Vocabulary: vocabulary.length,
  };

  const bundle = {
    format: BUNDLE_FORMAT,
    version: BUNDLE_VERSION,
    dataVersion: stampVersion(now),
    generatedAt: now.toISOString(),
    minAppBuild: BUNDLE_MIN_APP_BUILD,
    source: {
      backend: { file: backend.name, dataVersion: cellText(manifest.data_version), notes: cellText(manifest.publish_notes) },
      catalogue: { file: catalogue.name },
    },
    vocabulary, lenses, frameBrands, frames, inventory, extras, staff, promotions, promoLensMap,
  };

  return { bundle, report: report.done(counts) };
}

/** Cases, solutions and accessories by vendor SKU; contact lenses by barcode range. */
export function stockKind(item) {
  const v = item.vendorSku ?? '';
  if (v.startsWith('6003')) return 'case';
  if (v.startsWith('6006')) return 'solution';
  if (v.startsWith('6008')) return 'accessory';
  if ((item.sku ?? '').startsWith('500') && item.sku.length === 8) return 'contact';
  return 'frame';
}

function isFrameStock(item) { return stockKind(item) === 'frame'; }

/** `2026.10.02.2215` — sortable, and what every phone compares. */
export function stampVersion(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}.${p(d.getHours())}${p(d.getMinutes())}`;
}

class Report {
  constructor() { this.errors = []; this.warnings = []; this.notes = []; }
  error(sheet, message) { this.errors.push({ sheet, message }); }
  warn(sheet, message) { this.warnings.push({ sheet, message }); }
  note(sheet, message) { this.notes.push({ sheet, message }); }
  done(counts = {}) {
    return { ok: this.errors.length === 0, errors: this.errors, warnings: this.warnings, notes: this.notes, counts };
  }
}
