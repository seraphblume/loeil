// The POS stock report ("Reporte Existencias"), read straight from its PDF.
//
// The report is a table printed to PDF: one row per batch, anchored by the
// vendor SKU and the eight-digit barcode, with the description wrapping onto a
// line above and below. Text comes with positions, so each piece is placed by
// the column it sits under and the row it sits beside — never by guessing which
// number is which.
//
// Input is plain data — `[{ items: [{ str, x, y }] }]`, one entry per page —
// so the same parser runs on the phone (pdf.js) and in tests.

import { fold, sheetDay } from './util.js';

const COLUMNS = [
  ['centro', 'centro'], ['sku', 'sku'], ['material', 'material'], ['descripcion', 'description'],
  ['clasificacion', 'classification'], ['lote', 'lot'], ['caducidad', 'expires'], ['existencias', 'stock'],
  ['ubicacion', 'location'], ['stock', 'ownStock'], ['consigna', 'consignment'], ['proveedor', 'supplier'],
];

function headerColumns(items) {
  const found = [];
  for (const [word, key] of COLUMNS) {
    // CONSIGNA appears twice (ODESA, TERCEROS); keep both, in order.
    const hits = items.filter((i) => fold(i.str).trim() === word).sort((a, b) => a.x - b.x);
    hits.forEach((h, n) => found.push({ key: n ? `${key}${n + 1}` : key, x: h.x, y: h.y }));
  }
  if (!found.some((c) => c.key === 'sku') || !found.some((c) => c.key === 'material')) return null;
  found.sort((a, b) => a.x - b.x);
  return found;
}

function columnOf(cols, x) {
  let pick = null;
  for (const c of cols) if (x >= c.x - 3) pick = c;
  return pick?.key ?? null;
}

/** Pages of positioned text → stock rows, one per batch, plus what the report says about itself. */
export function parseStockReport(pages) {
  const rows = [];
  let total = null;
  let generated = null;
  let branch = '';
  let cols = null;

  for (const page of pages) {
    const items = page.items.filter((i) => i.str && i.str.trim());
    for (const i of items) {
      const t = i.str.match(/de un total de\s+(\d+)/i);
      if (t) total = Number(t[1]);
      if (!generated && /^\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}/.test(i.str.trim())) generated = i.str.trim();
      // The branch carries the long code ([C010155 ] AGORA URUAPAN); the company a short one.
      if (!branch && /^\[C\d{5,}\s*\]/.test(i.str.trim())) branch = i.str.trim().replace(/^\[[^\]]+\]\s*/, '');
    }
    cols = headerColumns(items) ?? cols;
    if (!cols) continue;
    const headerY = Math.min(...cols.map((c) => c.y));
    const skuX = cols.find((c) => c.key === 'sku').x;
    const matX = cols.find((c) => c.key === 'material').x;

    // Anchors: a vendor SKU and an eight-digit barcode on the same baseline.
    const body = items.filter((i) => i.y < headerY - 3);
    const anchors = [];
    for (const i of body) {
      const s = i.str.trim();
      if (Math.abs(i.x - skuX) > 12 || !/^[0-9A-Z]{10,16}$/.test(s)) continue;
      const mat = body.find((m) => Math.abs(m.y - i.y) < 2 && Math.abs(m.x - matX) < 12 && /^\d{8}$/.test(m.str.trim()));
      if (mat) anchors.push({ y: i.y, cells: {} });
    }
    if (!anchors.length) continue;
    anchors.sort((a, b) => b.y - a.y);
    const lowest = anchors[anchors.length - 1].y;

    for (const i of body) {
      if (i.y < lowest - 10) continue; // page footer
      let best = null;
      for (const a of anchors) if (!best || Math.abs(a.y - i.y) < Math.abs(best.y - i.y)) best = a;
      if (!best || Math.abs(best.y - i.y) > 9) continue;
      const key = columnOf(cols, i.x);
      if (!key) continue;
      (best.cells[key] ??= []).push(i);
    }

    for (const a of anchors) {
      const cell = (k) => (a.cells[k] ?? []).sort((p, q) => q.y - p.y || p.x - q.x).map((i) => i.str.trim());
      const description = cell('description').reduce((acc, part) => (!acc ? part : acc.endsWith('-') ? acc + part : `${acc} ${part}`), '');
      const num = (k) => { const v = Number(cell(k).join('').replace(/[^\d.-]/g, '')); return Number.isFinite(v) ? v : 0; };
      rows.push({
        vendorSku: cell('sku').join(''),
        sku: cell('material').join(''),
        description,
        classification: cell('classification').join(' '),
        lot: cell('lot').join(''),
        expires: sheetDay(cell('expires').join('')),
        stock: num('stock'),
        location: cell('location').join(' '),
      });
    }
  }
  return { rows, total, generated, branch };
}

/** Batches collapsed by barcode: stock summed, earliest expiry kept — the shape the app uses. */
export function collapseStock(rows) {
  const by = new Map();
  for (const r of rows) {
    const prev = by.get(r.sku);
    if (prev) {
      prev.stock += r.stock;
      prev.batches += 1;
      if (r.expires && (!prev.expires || r.expires < prev.expires)) prev.expires = r.expires;
    } else {
      by.set(r.sku, {
        sku: r.sku, vendorSku: r.vendorSku, description: r.description,
        classification: r.classification || 'N/A', stock: r.stock, expires: r.expires, batches: 1,
      });
    }
  }
  return [...by.values()];
}
