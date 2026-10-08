// What changed between the published catalogue and the working copy — the list
// read before publishing, so nothing reaches a phone unseen.

import { parseCodeLabel, brandKey } from './util.js';
import { LENS_FIELDS } from './validate.js';
import { money } from './money.js';
import { STORE_FIELDS } from './store.js';
import { itemsText } from './presets.js';

const lensLabel = (list) => (r) => LENS_FIELDS[list].map(([f]) => parseCodeLabel(r[f]).code).filter((c) => c && c !== 'N/A').join(' · ');
const fmt = { price: (v) => (v == null ? '—' : money(v)), available: (v) => (v ? 'available' : 'unavailable'), highRx: (v) => (v ? 'YES' : 'no'), aob: (v) => (v ? 'needs AOB' : 'no AOB'), active: (v) => (v ? 'active' : 'inactive') };
const show = (field, v) => (fmt[field] ? fmt[field](v) : v === null || v === undefined || v === '' ? '—' : String(v));

const lensSpec = (list) => ({
  title: { single: 'Single vision', multifocal: 'Multifocal', contact: 'Contact lenses' }[list],
  get: (b) => b.lenses[list],
  key: (r) => LENS_FIELDS[list].map(([f]) => parseCodeLabel(r[f]).code).join('|'),
  label: lensLabel(list),
  fields: [...LENS_FIELDS[list].map(([f]) => f), 'price', 'available'],
});

export const SPECS = [
  lensSpec('single'), lensSpec('multifocal'), lensSpec('contact'),
  { title: 'Coatings and names', get: (b) => b.vocabulary, key: (v) => `${v.kind}|${v.code}`, label: (v) => `${v.kind} ${v.code}`, fields: ['english', 'blurb', 'rank', 'group', 'sameAs', 'highRx', 'printAs', 'aob'] },
  { title: 'Frames', get: (b) => b.frames, key: (f) => f.sku, label: (f) => f.description || f.sku, fields: ['price', 'description', 'brand', 'category', 'frameType', 'material', 'size', 'product'] },
  { title: 'Brand tiers', get: (b) => b.frameBrands, key: (x) => brandKey(x.brand), label: (x) => x.brand, fields: ['tier'] },
  { title: 'Stock', get: (b) => b.inventory, key: (i) => i.sku, label: (i) => i.description || i.sku, fields: ['stock', 'description', 'classification', 'expires'] },
  { title: 'Extras', get: (b) => b.extras, key: (e) => e.id, label: (e) => e.description || e.id, fields: ['description', 'percent'] },
  { title: 'Staff', get: (b) => b.staff, key: (s) => s.employeeNumber, label: (s) => s.name || s.employeeNumber, fields: ['name', 'shortName', 'role', 'active'] },
  { title: 'Promotions', get: (b) => b.promotions, key: (p) => p.id, label: (p) => `${p.id} ${p.name}`, fields: ['name', 'kind', 'description', 'category', 'conditions', 'validFrom', 'validTo', 'notes'] },
  { title: 'Sets', get: (b) => b.sets ?? [], key: (s) => s.id, label: (s) => `${s.id} ${s.name}`, fields: ['name', 'price', 'validFrom', 'validTo', 'brands', 'notes'] },
  { title: 'Set lens rows', get: (b) => b.setLenses ?? [], key: (d) => d.id, label: (d) => `${d.group} · ${d.name}`, fields: ['group', 'name', 'match'] },
  { title: 'Set prices', get: (b) => b.setPrices ?? [], key: (p) => `${p.setId}|${p.lensId}`, label: (p) => `${p.setId} ${p.lensId}`, fields: ['price', 'special'] },
  { title: 'Campaign discounts', get: (b) => b.discounts ?? [], key: (d) => d.id, label: (d) => `${d.id} ${d.name}`, fields: ['name', 'percent', 'appliesTo', 'only', 'except', 'validFrom', 'validTo'] },
  { title: 'Lifestyle presets', get: (b) => (b.presets ?? []).map((t) => ({ ...t, itemsText: itemsText(t.items), extrasText: (t.extras ?? []).join(', '), brandsText: (t.brands ?? []).join(', ') })), key: (t) => `${t.presetId}|${t.tier}`, label: (t) => `${t.preset} · ${t.tier}`, fields: ['preset', 'blurb', 'tierBlurb', 'sv', 'mf', 'extrasText', 'itemsText', 'brandsText'] },
  { title: 'Store', get: (b) => STORE_FIELDS.filter((f) => b.store?.[f.key]).map((f) => ({ field: f.key, label: f.label, value: b.store[f.key] })), key: (x) => x.field, label: (x) => x.label, fields: ['value'] },
  { title: 'Promo lines', get: (b) => b.promoLensMap, key: (l) => `${l.promoId}|${l.package}|${l.matchKey}`, label: (l) => `${l.promoId} ${l.matchKey}`, fields: ['lensDescription'] },
];

/**
 * `[{ title, added: [label], removed: [label], changed: [{ label, what }] }]`,
 * only for domains that changed. `what` reads like `price $6,949 → $7,199`.
 */
export function diffBundles(base, next) {
  const out = [];
  for (const spec of SPECS) {
    const a = new Map(); const b = new Map();
    for (const r of spec.get(base) ?? []) a.set(spec.key(r), r);
    for (const r of spec.get(next) ?? []) b.set(spec.key(r), r);
    const added = []; const removed = []; const changed = [];
    for (const [k, r] of b) {
      const old = a.get(k);
      if (!old) { added.push(spec.label(r)); continue; }
      const what = spec.fields.filter((f) => JSON.stringify(old[f] ?? null) !== JSON.stringify(r[f] ?? null))
        .map((f) => `${f} ${show(f, old[f])} → ${show(f, r[f])}`);
      if (what.length) changed.push({ label: spec.label(r), what: what.join('; ') });
    }
    for (const [k, r] of a) if (!b.has(k)) removed.push(spec.label(r));
    if (added.length || removed.length || changed.length) out.push({ title: spec.title, added, removed, changed });
  }
  return out;
}

export const changeCount = (diff) => diff.reduce((n, d) => n + d.added.length + d.removed.length + d.changed.length, 0);
