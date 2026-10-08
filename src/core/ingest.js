// Workbooks in, data out — the optional bulk path.
//
// L'Œil does not need a spreadsheet: everything can be edited in the app.
// Workbooks remain a way to bring a lot in at once (a new brand list, a full
// price table) and a way to keep an offline copy. Input is plain arrays —
// whichever runner opened the .xlsx hands over `{ sheetName: { rows, hidden } }`.

import { fold, parseCodeLabel, cellText, toCents, isYes, digits, sheetDay } from './util.js';
import { Report, validateBundle, VOCAB_KINDS } from './validate.js';
import { TRUE_SKU_DIGITS } from '../config.js';
import { STORE_FIELDS, cleanStore } from './store.js';
import { parseItems } from './presets.js';

export { stockKind } from './stock.js';
export { VOCAB_KINDS, parseCodeLabel };

export const BUNDLE_FORMAT = 'loeil-bundle';
export const BUNDLE_VERSION = 1;
/** The oldest app build that can read what this file writes. */
export const BUNDLE_MIN_APP_BUILD = 1;

export function emptyBundle() {
  return {
    format: BUNDLE_FORMAT, version: BUNDLE_VERSION, dataVersion: '', generatedAt: '', minAppBuild: BUNDLE_MIN_APP_BUILD,
    source: {}, vocabulary: [], lenses: { single: [], multifocal: [], contact: [] },
    frameBrands: [], frames: [], inventory: [], extras: [], staff: [], promotions: [], promoLensMap: [],
    sets: [], setLenses: [], setPrices: [], discounts: [], store: null, presets: [],
  };
}

/** Stamp a bundle for publishing: a fresh data version every time. */
export function stamp(bundle, now = new Date()) {
  return {
    ...bundle, format: BUNDLE_FORMAT, version: BUNDLE_VERSION, minAppBuild: BUNDLE_MIN_APP_BUILD,
    dataVersion: stampVersion(now), generatedAt: now.toISOString(),
  };
}

/** `2026.10.02.2215` — sortable, and what every phone compares. */
export function stampVersion(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}.${p(d.getHours())}${p(d.getMinutes())}`;
}

// ---------------------------------------------------------------------------
// Opening workbooks

/** SheetJS workbook → `{ name: { rows, hidden } }`. The caller supplies XLSX. */
export function tablesFromWorkbook(XLSX, wb) {
  const out = {};
  const meta = wb.Workbook?.Sheets ?? [];
  wb.SheetNames.forEach((name, i) => {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null, blankrows: false });
    out[name] = { rows, hidden: Boolean(meta[i]?.Hidden) };
  });
  return out;
}

const HEADER_ALIASES = {
  descripcion: 'description', clasificacion: 'classification', existencia: 'stock', existencias: 'stock',
  lote: 'lot', caducidad: 'expires', expiry: 'expires', 'material (true sku)': 'true sku', barcode: 'true sku', colour: 'color',
};
const headerKey = (h) => { const k = fold(cellText(h)).trim().replace(/\s+/g, ' '); return HEADER_ALIASES[k] ?? k; };

function records(table) {
  if (!table || !table.rows.length) return { cols: new Set(), rows: [] };
  const header = (table.rows[0] ?? []).map(headerKey);
  const rows = [];
  for (let r = 1; r < table.rows.length; r++) {
    const raw = table.rows[r] ?? [];
    if (!raw.some((v) => v !== null && v !== undefined && String(v).trim() !== '')) continue;
    const rec = { _row: r + 1 };
    header.forEach((h, i) => { if (h && !(h in rec)) rec[h] = raw[i] ?? null; });
    rows.push(rec);
  }
  return { cols: new Set(header.filter(Boolean)), rows };
}

const findSheet = (sheets, name) => { const k = Object.keys(sheets).find((n) => n.toLowerCase() === name); return k ? sheets[k] : null; };

export function isBackend(sheets) {
  const n = Object.keys(sheets).map((s) => s.toLowerCase());
  return n.includes('lenses_single') || n.includes('promo_lens_map') || n.includes('vocabulary');
}

export function frameSheets(sheets) {
  return Object.entries(sheets).filter(([, t]) => {
    const h = (t.rows[0] ?? []).map(headerKey);
    return h.includes('true sku') && h.includes('price') && h.includes('description');
  });
}

/** Which of the picked workbooks is which, by what is inside them. */
export function classify(workbooks) {
  let backend = null; let catalogue = null;
  for (const wb of workbooks) {
    if (isBackend(wb.sheets)) backend = wb;
    else if (frameSheets(wb.sheets).length) catalogue = wb;
  }
  return { backend, catalogue };
}

// ---------------------------------------------------------------------------
// The Backend workbook → every domain except frames. Only tabs present are read.

export function readBackend(sheets, report = new Report()) {
  const out = {};
  const tab = (name, cols) => {
    const t = findSheet(sheets, name);
    if (!t) return null;
    const rec = records(t);
    const missing = cols.filter((c) => !rec.cols.has(c));
    if (missing.length) { report.error(name, `Missing column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}.`); return null; }
    return rec;
  };

  const manifest = {};
  const mt = findSheet(sheets, '_manifest');
  if (mt) for (const row of mt.rows.slice(1)) if (row?.[0]) manifest[cellText(row[0]).trim()] = row[1];
  if (Number(manifest.schema_version ?? 1) > 1) report.error('_manifest', `schema_version is ${manifest.schema_version}; this app reads layout 1.`);
  out.source = { dataVersion: cellText(manifest.data_version), notes: cellText(manifest.publish_notes) };

  const v = tab('vocabulary', ['kind', 'code']);
  if (v) {
    out.vocabulary = [];
    for (const r of v.rows) {
      const kind = fold(cellText(r.kind)).trim().replace(/\s+/g, '_');
      const code = cellText(r.code).trim();
      if (!kind && !code) continue;
      const rank = r.rank === null || r.rank === undefined || r.rank === '' ? null : Number(r.rank);
      out.vocabulary.push({
        kind, code, english: cellText(r.english).trim(), blurb: cellText(r.blurb).trim(),
        rank: Number.isFinite(rank) ? rank : null,
        group: cellText(r.promo_group ?? r.group).trim().toUpperCase(),
        sameAs: cellText(r.same_as).trim(), highRx: isYes(r.high_rx),
        ...(cellText(r.print_as).trim() ? { printAs: cellText(r.print_as).trim() } : {}),
        ...(isYes(r.needs_aob) ? { aob: true } : {}),
      });
    }
  }

  const lensCols = ['category', 'material', 'design', 'color', 'treatment', 'price mxn', 'available'];
  const sv = tab('lenses_single', lensCols);
  const mf = tab('lenses_multifocal', [...lensCols, 'lens type']);
  const cl = tab('lenses_contact', ['material', 'lens type', 'color', 'price mxn', 'available']);
  if (sv || mf || cl) out.lenses = { single: [], multifocal: [], contact: [] };
  for (const r of sv?.rows ?? []) {
    if (!cellText(r.category).trim() && !cellText(r.material).trim()) continue;
    out.lenses.single.push({ category: cellText(r.category).trim(), material: cellText(r.material), design: cellText(r.design), colour: cellText(r.color), treatment: cellText(r.treatment), price: toCents(r['price mxn']), available: isYes(r.available) });
  }
  for (const r of mf?.rows ?? []) {
    if (!cellText(r.category).trim() && !cellText(r.material).trim()) continue;
    out.lenses.multifocal.push({ category: cellText(r.category).trim(), material: cellText(r.material), type: cellText(r['lens type']), design: cellText(r.design), colour: cellText(r.color), treatment: cellText(r.treatment), price: toCents(r['price mxn']), available: isYes(r.available) });
  }
  for (const r of cl?.rows ?? []) {
    if (!cellText(r.material).trim() && !cellText(r['lens type']).trim()) continue;
    out.lenses.contact.push({ material: cellText(r.material), product: cellText(r['lens type']), colour: cellText(r.color), price: toCents(r['price mxn']), available: isYes(r.available) });
  }

  const fb = tab('frame_brands', ['brand', 'tier']);
  if (fb) out.frameBrands = fb.rows.filter((r) => cellText(r.brand).trim()).map((r) => ({ brand: cellText(r.brand).trim(), tier: cellText(r.tier).trim() }));

  const inv = tab('inventory', ['sku', 'true sku', 'description', 'stock']);
  if (inv) {
    const by = new Map();
    for (const r of inv.rows) {
      const sku = digits(r['true sku']);
      if (!sku && !cellText(r.description)) continue;
      if (sku.length !== TRUE_SKU_DIGITS) { report.error('inventory', `Row ${r._row}: barcode "${cellText(r['true sku'])}" is not ${TRUE_SKU_DIGITS} digits.`); continue; }
      if (r.stock === null || r.stock === '') report.error('inventory', `Row ${r._row}: stock is blank.`);
      const stock = Number(r.stock) || 0;
      const expires = sheetDay(r.expires);
      const prev = by.get(sku);
      if (prev) { prev.stock += stock; prev.batches += 1; if (expires && (!prev.expires || expires < prev.expires)) prev.expires = expires; }
      else by.set(sku, { sku, vendorSku: cellText(r.sku).trim(), description: cellText(r.description).trim(), classification: cellText(r.classification).trim(), stock, expires, batches: 1 });
    }
    out.inventory = [...by.values()];
  }

  const ex = tab('extras', ['id', 'description']);
  if (ex) {
    out.extras = ex.rows.filter((r) => cellText(r.id).trim()).map((r) => {
      const percent = Number(cellText(r.percent).replace('%', '').trim());
      return { id: cellText(r.id).trim(), description: cellText(r.description).trim(), ...(percent > 0 ? { percent } : {}) };
    });
  }

  const st = tab('staff', ['employee_number', 'name', 'role', 'active']);
  if (st) {
    out.staff = st.rows.filter((r) => cellText(r.employee_number).trim()).map((r) => ({
      employeeNumber: cellText(r.employee_number).trim(), name: cellText(r.name).trim(), shortName: cellText(r.short_name).trim(),
      role: cellText(r.role).trim().toLowerCase(), active: isYes(r.active),
    }));
  }

  const pr = tab('promotions', ['promo_id', 'kind', 'name', 'conditions', 'valid_from', 'valid_to']);
  if (pr) {
    out.promotions = [];
    for (const r of pr.rows) {
      const id = cellText(r.promo_id).trim();
      const name = cellText(r.name).trim();
      if (!id && !name && !cellText(r.kind)) continue;
      out.promotions.push({
        id, kind: cellText(r.kind).trim(), name, description: cellText(r.description).trim(), category: cellText(r.category).trim(),
        conditions: cellText(r.conditions).trim(), validFrom: sheetDay(r.valid_from), validTo: sheetDay(r.valid_to), notes: cellText(r.notes).trim(),
      });
    }
  }

  const pm = tab('promo_lens_map', ['promo_id', 'package', 'match_key']);
  if (pm) {
    out.promoLensMap = [];
    for (const r of pm.rows) {
      const promoId = cellText(r.promo_id).trim();
      const matchKey = cellText(r.match_key).trim();
      if (!promoId && !matchKey) continue;
      if (r.resolved !== undefined && r.resolved !== null && !isYes(r.resolved)) report.error('promo_lens_map', `Row ${r._row}: line is not resolved yet.`);
      out.promoLensMap.push({ promoId, package: cellText(r.package).trim(), matchKey, lensDescription: cellText(r.lens_description).trim() });
    }
  }

  // Sets (see core/sets.js). Optional tabs: a workbook without them leaves the sets alone.
  const se = tab('sets', ['id_maestro', 'name', 'price']);
  if (se) {
    out.sets = se.rows.filter((r) => cellText(r.id_maestro).trim()).map((r) => ({
      id: cellText(r.id_maestro).trim(), name: cellText(r.name).trim(), price: toCents(r.price),
      validFrom: sheetDay(r.valid_from), validTo: sheetDay(r.valid_to), brands: cellText(r.brands).trim(), notes: cellText(r.notes).trim(),
    }));
  }
  const sl = tab('set_lenses', ['id', 'group', 'name']);
  if (sl) {
    out.setLenses = sl.rows.filter((r) => cellText(r.id).trim()).map((r) => ({
      id: cellText(r.id).trim(), group: cellText(r.group).trim(), name: cellText(r.name).trim(), match: cellText(r.match).trim(),
    }));
  }
  const sp = tab('set_prices', ['set_id', 'lens_id', 'price']);
  if (sp) {
    out.setPrices = sp.rows.filter((r) => cellText(r.set_id).trim() && cellText(r.lens_id).trim()).map((r) => ({
      setId: cellText(r.set_id).trim(), lensId: cellText(r.lens_id).trim(), price: toCents(r.price) ?? 0, ...(isYes(r.special) ? { special: true } : {}),
    }));
  }
  const di = tab('discounts', ['promo_id', 'name', 'percent', 'applies_to']);
  if (di) {
    out.discounts = di.rows.filter((r) => cellText(r.promo_id).trim()).map((r) => ({
      id: cellText(r.promo_id).trim(), name: cellText(r.name).trim(), percent: Number(cellText(r.percent).replace('%', '')) || 0,
      appliesTo: cellText(r.applies_to).trim(), only: cellText(r.only).trim(), except: cellText(r.except).trim(),
      validFrom: sheetDay(r.valid_from), validTo: sheetDay(r.valid_to),
    }));
  }
  const presetTab = tab('presets', ['preset_id', 'preset', 'tier']);
  if (presetTab) {
    out.presets = presetTab.rows.filter((r) => cellText(r.preset_id).trim() && cellText(r.tier).trim()).map((r) => ({
      presetId: cellText(r.preset_id).trim(), preset: cellText(r.preset).trim(), blurb: cellText(r.blurb).trim(),
      tier: cellText(r.tier).trim(), tierBlurb: cellText(r.tier_blurb).trim(),
      sv: cellText(r.single_vision).trim(), mf: cellText(r.progressive).trim(),
      extras: cellText(r.extras).split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean),
      items: parseItems(cellText(r.items)),
    }));
  }
  const storeTab = tab('store', ['field', 'value']);
  if (storeTab) {
    const byLabel = new Map(STORE_FIELDS.flatMap((f) => [[fold(f.key), f.key], [fold(f.label), f.key]]));
    const raw = {};
    for (const r of storeTab.rows) { const k = byLabel.get(fold(cellText(r.field)).trim()); if (k) raw[k] = cellText(r.value); }
    out.store = cleanStore(raw);
  }
  return out;
}

// ---------------------------------------------------------------------------
// The frame catalogue → frames. Every tab shaped like a brand tab is read.

export function readCatalogue(sheets, report = new Report()) {
  const frames = [];
  for (const [sheetName, table] of frameSheets(sheets)) {
    for (const r of records(table).rows) {
      const sku = digits(r['true sku']);
      const description = cellText(r.description).trim();
      if (!sku && !description) continue;
      if (sku.length !== TRUE_SKU_DIGITS) { report.error('Catalogue', `${sheetName} row ${r._row}: barcode "${cellText(r['true sku'])}" is not ${TRUE_SKU_DIGITS} digits.`); continue; }
      const size = Number(r.size);
      frames.push({
        sku, product: cellText(r.product).trim(), description, price: toCents(r.price),
        brand: cellText(r.brand).trim() || sheetName, frameType: cellText(r['frame type']).trim(),
        category: cellText(r.category).trim(), material: cellText(r.material).trim(),
        size: Number.isFinite(size) && size > 0 ? size : null,
      });
    }
  }
  return frames;
}

/**
 * Any mix of workbooks → the domains they contain, ready to replace the same
 * domains of the working copy. A Backend workbook brings everything it has a
 * tab for; a catalogue workbook brings frames.
 */
export function readWorkbooks(workbooks) {
  const report = new Report();
  const pieces = {};
  for (const wb of workbooks) {
    if (isBackend(wb.sheets)) {
      const p = readBackend(wb.sheets, report);
      Object.assign(pieces, p);
      pieces.source = { ...(pieces.source ?? {}), backend: { ...p.source, file: wb.name } };
    } else if (frameSheets(wb.sheets).length) {
      pieces.frames = readCatalogue(wb.sheets, report);
      pieces.source = { ...(pieces.source ?? {}), catalogue: { file: wb.name } };
    } else {
      report.error('Workbooks', `${wb.name} is neither the Backend workbook nor a frame catalogue.`);
    }
  }
  return { pieces, report };
}

// ---------------------------------------------------------------------------
// Both workbooks → a complete, stamped bundle and the gate's report.
// Used by tools/publish.mjs.

export function ingest(workbooks, { now = new Date() } = {}) {
  const report = new Report();
  const { backend, catalogue } = classify(workbooks);
  if (!backend) report.error('Workbooks', 'No Backend workbook found (it has a lenses_single tab).');
  if (!catalogue) report.error('Workbooks', 'No frame catalogue found (brand tabs with Product, Material (True SKU), Description and Price).');
  if (!backend || !catalogue) return { bundle: null, report: report.done() };
  const pieces = readBackend(backend.sheets, report);
  const bundle = stamp({ ...emptyBundle(), ...pieces, frames: readCatalogue(catalogue.sheets, report) }, now);
  bundle.source = { backend: { ...pieces.source, file: backend.name }, catalogue: { file: catalogue.name } };
  return { bundle, report: validateBundle(bundle, report) };
}

/** What each data domain is called on screen. */
export const DOMAIN_LABEL = {
  vocabulary: 'Coatings and names', lenses: 'Lens prices', frameBrands: 'Brand tiers', inventory: 'Stock',
  extras: 'Extras', staff: 'Staff', promotions: 'Promotions', promoLensMap: 'Promo lines', frames: 'Frames',
  sets: 'Sets', setLenses: 'Set lens rows', setPrices: 'Set prices', discounts: 'Campaign discounts', store: 'Store', presets: 'Lifestyle presets',
};
