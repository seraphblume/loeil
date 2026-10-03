// The catalogue back out as workbooks — an offline copy, or a way to do a big
// edit on a computer in any spreadsheet app. The layout matches what the import
// reads, so an exported pair can be edited and imported straight back.

import { cellText } from './util.js';

const amount = (cents) => (cents == null ? null : cents / 100);

export function bundleToWorkbooks(b, XLSX) {
  const sheet = (rows) => XLSX.utils.aoa_to_sheet(rows);
  const backend = XLSX.utils.book_new();
  const add = (wb, name, rows, widths) => {
    const ws = sheet(rows);
    if (widths) ws['!cols'] = widths.map((w) => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, name);
  };

  add(backend, '_README', [
    ['L’Œil — catalogue export'],
    [`Data version ${b.dataVersion || 'unpublished'} · exported ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`],
    [''],
    ['This is a copy, not the source. The source is what the app publishes.'],
    ['Edit here only for a big change, then import it back in the app (Me → Catalogue data → Import)'],
    ['and publish. Never change a code: codes compose the POS product code.'],
  ], [100]);
  add(backend, '_manifest', [['Field', 'Value'], ['schema_version', 1], ['data_version', b.dataVersion || ''], ['publish_notes', 'Exported from the app']], [18, 30]);
  add(backend, 'staff', [['employee_number', 'name', 'short_name', 'role', 'active'],
    ...b.staff.map((s) => [s.employeeNumber, s.name, s.shortName, s.role, s.active ? 'YES' : 'NO'])], [16, 24, 14, 10, 8]);
  add(backend, 'lenses_single', [['Category', 'Material', 'Design', 'Color', 'Treatment', 'Price MXN', 'available'],
    ...b.lenses.single.map((r) => [r.category, r.material, r.design, r.colour, r.treatment, amount(r.price), r.available ? 'YES' : 'NO'])], [14, 24, 20, 28, 26, 11, 9]);
  add(backend, 'lenses_multifocal', [['Category', 'Material', 'Lens Type', 'Design', 'Color', 'Treatment', 'Price MXN', 'available'],
    ...b.lenses.multifocal.map((r) => [r.category, r.material, r.type, r.design, r.colour, r.treatment, amount(r.price), r.available ? 'YES' : 'NO'])], [14, 24, 18, 24, 28, 26, 11, 9]);
  add(backend, 'lenses_contact', [['Material', 'Lens Type', 'Color', 'Price MXN', 'available'],
    ...b.lenses.contact.map((r) => [r.material, r.product, r.colour, amount(r.price), r.available ? 'YES' : 'NO'])], [20, 34, 26, 11, 9]);
  add(backend, 'vocabulary', [['kind', 'code', 'english', 'blurb', 'rank', 'promo_group', 'same_as', 'high_rx'],
    ...b.vocabulary.map((v) => [v.kind, v.code, v.english, v.blurb, v.rank, v.group, v.sameAs, v.highRx ? 'YES' : ''])], [16, 8, 26, 58, 6, 12, 9, 8]);
  add(backend, 'frame_brands', [['Brand', 'Tier'], ...b.frameBrands.map((x) => [x.brand, x.tier])], [24, 22]);
  add(backend, 'inventory', [['SKU', 'Material (True SKU)', 'Descripción', 'Clasificación', 'Existencia', 'Lote', 'Caducidad'],
    ...b.inventory.map((i) => [i.vendorSku, i.sku, i.description, i.classification, i.stock, '', i.expires])], [18, 18, 46, 14, 10, 8, 12]);
  add(backend, 'extras', [['ID', 'Description'], ...b.extras.map((e) => [e.id, e.description])], [16, 24]);
  add(backend, 'promotions', [['promo_id', 'kind', 'name', 'description', 'category', 'conditions', 'valid_from', 'valid_to', 'notes'],
    ...b.promotions.map((p) => [p.id, p.kind, p.name, p.description, p.category, p.conditions, p.validFrom, p.validTo, p.notes])], [10, 13, 26, 30, 16, 50, 12, 12, 40]);
  add(backend, 'promo_lens_map', [['promo_id', 'package', 'match_key', 'lens_description', 'resolved'],
    ...b.promoLensMap.map((l) => [l.promoId, l.package, l.matchKey, l.lensDescription, 'YES'])], [10, 10, 34, 50, 9]);

  const catalogue = XLSX.utils.book_new();
  const brands = [...new Set(b.frames.map((f) => f.brand || 'Other'))].sort((a, c) => a.localeCompare(c));
  const used = new Set();
  for (const brand of brands) {
    // Sheet names: 31 characters, no []:*?/\ and unique.
    let name = cellText(brand).replace(/[[\]:*?/\\]/g, ' ').slice(0, 31).trim() || 'Other';
    while (used.has(name.toLowerCase())) name = name.slice(0, 28) + ' ' + Math.floor(Math.random() * 90 + 10);
    used.add(name.toLowerCase());
    add(catalogue, name, [['Product', 'Material (True SKU)', 'Description', 'Price', 'Brand', 'Frame Type', 'Category', 'Material', 'Size'],
      ...b.frames.filter((f) => (f.brand || 'Other') === brand).map((f) => [f.product, f.sku, f.description, amount(f.price), f.brand, f.frameType, f.category, f.material, f.size])],
    [16, 18, 46, 10, 18, 13, 12, 10, 6]);
  }
  return { backend, catalogue };
}
