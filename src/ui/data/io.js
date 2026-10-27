// Files in and out of the data editor: workbooks (.xlsx) and the POS stock
// report (.pdf). The readers load only when a file is actually picked.

import { tablesFromWorkbook, readWorkbooks } from '../../core/ingest.js';
import { parseStockReport, collapseStock } from '../../core/stockreport.js';
import { bundleToWorkbooks } from '../../core/export.js';
import { Report } from '../../core/validate.js';
import { tr } from '../../i18n.js';

const VENDOR = new URL('../../vendor/', import.meta.url);

export function loadXLSX() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = new URL('xlsx.mini.min.js', VENDOR).href;
    s.onload = () => resolve(window.XLSX);
    s.onerror = () => reject(new Error(tr('Could not load the spreadsheet reader.')));
    document.head.appendChild(s);
  });
}

async function loadPdf() {
  const pdfjs = await import(new URL('pdfjs/pdf.min.mjs', VENDOR).href);
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs/pdf.worker.min.mjs', VENDOR).href;
  return pdfjs;
}

/** The POS "Reporte Existencias" PDF → collapsed stock rows and what the report says about itself. */
export async function readStockPdf(file) {
  const pdfjs = await loadPdf();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const tc = await (await doc.getPage(p)).getTextContent();
    pages.push({ items: tc.items.map((i) => ({ str: i.str, x: i.transform[4], y: i.transform[5] })) });
  }
  const parsed = parseStockReport(pages);
  return { ...parsed, inventory: collapseStock(parsed.rows) };
}

/**
 * Any picked files → `{ pieces, report, summary }`, where pieces are whole
 * domains to replace in the working copy.
 */
export async function readFiles(files) {
  const report = new Report();
  const pieces = {};
  const summary = [];
  const books = [];
  for (const f of files) {
    if (/\.pdf$/i.test(f.name) || f.type === 'application/pdf') {
      const r = await readStockPdf(f);
      if (!r.rows.length) { report.error(f.name, tr('No stock rows were found. Is this the stock report (Reporte Existencias)?')); continue; }
      if (r.total != null && r.total !== r.rows.length) report.error(f.name, tr('The report says {total} rows but {read} were read. Nothing was replaced.', { total: r.total, read: r.rows.length }));
      else {
        pieces.inventory = r.inventory;
        pieces.stockReport = { generated: r.generated, branch: r.branch, rows: r.rows.length, file: f.name };
        summary.push(tr('Stock: {items} items ({batches} batches) from the report of {date}', { items: r.inventory.length, batches: r.rows.length, date: r.generated ?? tr('unknown date') }));
      }
    } else {
      const XLSX = await loadXLSX();
      const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' });
      books.push({ name: f.name, sheets: tablesFromWorkbook(XLSX, wb) });
    }
  }
  if (books.length) {
    const r = readWorkbooks(books);
    report.merge({ errors: r.report.errors, warnings: r.report.warnings, notes: r.report.notes });
    Object.assign(pieces, r.pieces);
    const names = Object.fromEntries(Object.entries({ vocabulary: 'coatings and names', lenses: 'lens prices', frameBrands: 'brand tiers', inventory: 'stock', accessories: 'accessory prices', extras: 'extras', staff: 'staff', promotions: 'promotions', promoLensMap: 'promo lines', frames: 'frames' }).map(([k, v]) => [k, tr(v)]));
    const got = Object.keys(r.pieces).filter((k) => names[k]).map((k) => names[k]);
    if (got.length) summary.push(tr(books.length > 1 ? 'From the workbooks: {list}' : 'From the workbook: {list}', { list: got.join(', ') }));
  }
  return { pieces, report: report.done(), summary };
}

function download(name, blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/** The catalogue as two workbooks, shared or downloaded. */
export async function exportWorkbooks(bundle) {
  const XLSX = await loadXLSX();
  const { backend, catalogue } = bundleToWorkbooks(bundle, XLSX);
  const type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const stamp = (bundle.dataVersion || new Date().toISOString().slice(0, 10)).replace(/\./g, '-');
  const files = [
    new File([XLSX.write(backend, { type: 'array', bookType: 'xlsx' })], `LOEIL_Backend ${stamp}.xlsx`, { type }),
    new File([XLSX.write(catalogue, { type: 'array', bookType: 'xlsx' })], `Catalogue ${stamp}.xlsx`, { type }),
  ];
  if (navigator.canShare?.({ files })) {
    try { await navigator.share({ files, title: tr('L’Œil catalogue') }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  for (const f of files) download(f.name, f);
}
