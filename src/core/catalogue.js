// The catalogue, built once from a decrypted bundle and then read-only, so no
// screen can be looking at half a catalogue.
//
// TWO VOCABULARIES. Each lens attribute arrives as the POS code glued to
// the POS's Spanish label (`4300 — Polylite`, `BLC (Blanco)`). The English the
// interface shows comes from the Backend's `vocabulary` tab, keyed by kind and
// code. A code with no entry still displays — in the POS's own words — and still
// sells. Adding a lens or a treatment is a data edit and a publish, never a release.

import { parseCodeLabel, fold, brandKey } from './util.js';
import { stockKind } from './stock.js';

/** One attribute value: the POS code, the POS wording, ours, and its metadata. */
export class LensCode {
  constructor(code, pos, meta) {
    this.code = code;
    this.pos = pos;
    this.label = meta?.english || pos || code;
    this.blurb = meta?.blurb || '';
    this.rank = meta?.rank ?? null;
    this.group = meta?.group || '';
    this.sameAs = meta?.sameAs || '';
    this.highRx = Boolean(meta?.highRx);
  }
  /** `N/A` is a real value in the sheet that means "nothing here". */
  get isNone() { return this.code === 'N/A' || this.code === ''; }
}

const KIND_OF_FIELD = {
  SV: { category: 'category', material: 'material', design: 'design', colour: 'colour', treatment: 'treatment' },
  MF: { category: 'category', material: 'material', type: 'lens_type', design: 'design', colour: 'colour', treatment: 'treatment' },
  CL: { material: 'contact_material', product: 'contact_product', colour: 'contact_colour' },
};

export class Catalogue {
  constructor(bundle) {
    this.bundle = bundle;
    this.dataVersion = bundle?.dataVersion ?? '';
    this.generatedAt = bundle?.generatedAt ? new Date(bundle.generatedAt) : null;

    // vocabulary: kind → code → meta
    this.vocab = new Map();
    for (const v of bundle?.vocabulary ?? []) {
      if (!this.vocab.has(v.kind)) this.vocab.set(v.kind, new Map());
      this.vocab.get(v.kind).set(v.code, v);
    }
    this._codes = new Map();

    const lenses = bundle?.lenses ?? {};
    this.single = (lenses.single ?? []).map((r, i) => this._lensRow('SV', r, i));
    this.multifocal = (lenses.multifocal ?? []).map((r, i) => this._lensRow('MF', r, i));
    this.contact = (lenses.contact ?? []).map((r, i) => this._lensRow('CL', r, i));
    this.rowsById = new Map();
    for (const r of [...this.single, ...this.multifocal, ...this.contact]) if (!this.rowsById.has(r.id)) this.rowsById.set(r.id, r);

    // frame brands and tiers
    this.brands = (bundle?.frameBrands ?? []).map((b) => {
      const { code, pos } = parseCodeLabel(b.tier);
      return { name: b.brand, key: brandKey(b.brand), tier: this.code('tier', code, pos) };
    });
    this.tierByBrand = new Map(this.brands.map((b) => [b.key, b.tier]));

    // stock, collapsed by barcode at publish time
    this.inventory = (bundle?.inventory ?? []).map((i) => ({ ...i, kind: stockKind(i) }));
    this.inventoryBySku = new Map(this.inventory.map((i) => [i.sku, i]));

    // frames: the frame catalogue is the source of truth; stock joins on barcode
    this.frames = (bundle?.frames ?? []).map((f) => {
      const stockItem = this.inventoryBySku.get(f.sku);
      return {
        ...f,
        stock: stockItem ? stockItem.stock : null,
        classification: stockItem?.classification && stockItem.classification !== 'N/A' ? stockItem.classification : '',
        tier: this.tierFor(f.brand),
        hay: fold([f.description, f.brand, f.sku, f.product, f.category, f.material, f.frameType].join(' ')),
      };
    });
    this.framesBySku = new Map(this.frames.map((f) => [f.sku, f]));
    this.framesByProduct = new Map(this.frames.filter((f) => f.product).map((f) => [f.product, f]));
    for (const i of this.inventory) i.inCatalogue = this.framesBySku.has(i.sku);

    this.extras = bundle?.extras ?? [];
    this.staff = bundle?.staff ?? [];
    this.promotions = bundle?.promotions ?? [];
    this.promotionsById = new Map(this.promotions.map((p) => [p.id, p]));
    this.promoLensMap = bundle?.promoLensMap ?? [];

    // sets: the campaign's frame-and-lens packages (see core/sets.js)
    this.sets = bundle?.sets ?? [];
    this.setsById = new Map(this.sets.map((s) => [s.id, s]));
    this.setLenses = bundle?.setLenses ?? [];
    this.setLensesById = new Map(this.setLenses.map((d) => [d.id, d]));
    this.setPrices = bundle?.setPrices ?? [];
    this.setPricesBySet = new Map();
    for (const p of this.setPrices) {
      if (!this.setPricesBySet.has(p.setId)) this.setPricesBySet.set(p.setId, new Map());
      this.setPricesBySet.get(p.setId).set(p.lensId, p);
    }
    this.discounts = bundle?.discounts ?? [];
    this.store = bundle?.store ?? null;
  }

  get isEmpty() { return !this.bundle || this.lensCount === 0; }
  get lensCount() { return this.single.length + this.multifocal.length + this.contact.length; }

  meta(kind, code) { return this.vocab.get(kind)?.get(code) ?? null; }

  /** One LensCode per kind+code+label, shared, so comparisons are cheap. */
  code(kind, code, pos) {
    const key = kind + '|' + code + '|' + pos;
    let c = this._codes.get(key);
    if (!c) { c = new LensCode(code, pos, this.meta(kind, code)); this._codes.set(key, c); }
    return c;
  }

  parse(kind, raw) {
    const { code, pos } = parseCodeLabel(raw);
    return this.code(kind, code, pos);
  }

  _lensRow(family, r, index) {
    const kinds = KIND_OF_FIELD[family];
    const row = { family, index, price: r.price ?? 0, available: Boolean(r.available) };
    for (const [field, kind] of Object.entries(kinds)) row[field] = this.parse(kind, r[field]);
    const parts = Object.keys(kinds).filter((f) => f !== 'category').map((f) => row[f].code);
    row.id = family + '-' + parts.join('-');
    return row;
  }

  rows(family) {
    return family === 'SV' ? this.single : family === 'MF' ? this.multifocal : this.contact;
  }

  tierFor(brand) { return this.tierByBrand.get(brandKey(brand)) ?? null; }

  /** All codes of a kind that a promo group names: `CRIZAL` → CEU, CPU, CZS… */
  codesInGroup(kind, group) {
    const out = new Set();
    for (const [code, v] of this.vocab.get(kind) ?? []) if (v.group === group) out.add(code);
    return out;
  }

  /** Materials flagged for strong prescriptions. */
  highRxMaterials() {
    return [...(this.vocab.get('material') ?? new Map()).values()].filter((v) => v.highRx).map((v) => v.code);
  }

  /** A barcode, as scanned: the true SKU, with check-digit padding tolerated. */
  normaliseBarcode(raw) {
    const d = String(raw ?? '').replace(/\D/g, '');
    if (d.length === 8) return d;
    if (d.length > 8) {
      const tail = d.slice(-8);
      const tailNoCheck = d.slice(-9, -1);
      if (this.framesBySku.has(tail) || this.inventoryBySku.has(tail)) return tail;
      if (this.framesBySku.has(tailNoCheck) || this.inventoryBySku.has(tailNoCheck)) return tailNoCheck;
    }
    return d;
  }

  /** What a scanned code is: a catalogue frame, a stock item, or nothing. */
  lookup(raw) {
    const sku = this.normaliseBarcode(raw);
    const frame = this.framesBySku.get(sku) ?? this.framesByProduct.get(String(raw).trim());
    if (frame) return { kind: 'frame', sku: frame.sku, frame, stock: this.inventoryBySku.get(frame.sku) ?? null };
    const item = this.inventoryBySku.get(sku);
    if (item) return { kind: item.kind === 'frame' ? 'stockFrame' : 'stock', sku, item };
    return { kind: 'none', sku };
  }

  searchFrames(term, { limit = 50, filters = {} } = {}) {
    const tokens = fold(term).split(/\s+/).filter(Boolean);
    const out = [];
    for (const f of this.frames) {
      if (filters.brand && f.brand !== filters.brand) continue;
      if (filters.category && f.category !== filters.category) continue;
      if (filters.material && f.material !== filters.material) continue;
      if (filters.frameType && f.frameType !== filters.frameType) continue;
      if (filters.size && f.size !== filters.size) continue;
      if (filters.inStock && !(f.stock > 0)) continue;
      if (tokens.length && !tokens.every((t) => f.hay.includes(t))) continue;
      out.push(f);
    }
    return { total: out.length, items: limit ? out.slice(0, limit) : out };
  }

  searchStock(term, { limit = 25, kinds = null } = {}) {
    const t = fold(term).trim();
    if (!t && !kinds) return [];
    const out = [];
    for (const i of this.inventory) {
      if (kinds && !kinds.includes(i.kind)) continue;
      if (t && !(fold(i.description).includes(t) || i.sku.includes(t) || i.vendorSku.includes(t))) continue;
      out.push(i);
      if (out.length >= limit) break;
    }
    return out;
  }

  /** Cases, solutions and accessories — unpriced, the register prices them. */
  get consumables() { return this.inventory.filter((i) => i.kind !== 'frame' && i.kind !== 'contact'); }
}

export const STOCK_KIND_LABEL = {
  frame: 'Frame', contact: 'Contact lens', case: 'Case', solution: 'Solution', accessory: 'Accessory',
};

export function stockLabel(n) {
  if (n === null || n === undefined) return 'Not in the stock list';
  if (n === 0) return 'None on hand';
  return `${n} on hand`;
}
