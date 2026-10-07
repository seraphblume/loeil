// The receipt as a picture to send: the same blocks the screen shows, drawn on
// a canvas — paper on the night background, torn edge, a barcode that scans.

import { code128Bars } from '../core/code128.js';

const W = 380;            // paper width, CSS px
const M = 22;             // paper margin
const SCALE = 3;
const PAD = 22;           // background around the paper
const INK = '#14161B';
const SOFT = '#6B717C';
const PAPER = '#F6F6F3';
const NIGHT = '#0B0D13';
const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, "Roboto Mono", monospace';
const SANS = '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, Inter, "Segoe UI", Roboto, sans-serif';

function wrap(ctx, text, width) {
  const words = String(text ?? '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const w of words) {
    const next = line ? line + ' ' + w : w;
    if (ctx.measureText(next).width > width && line) { lines.push(line); line = w; } else line = next;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

/** Lays out (measure) or draws (draw) the blocks; returns the paper height. */
function run(ctx, blocks, draw) {
  let y = 34;
  const inner = W - M * 2;
  const font = (size, weight = 400, family = MONO) => { ctx.font = `${weight} ${size}px ${family}`; };
  const text = (s, x, yy, align = 'left', color = INK) => { if (!draw) return; ctx.fillStyle = color; ctx.textAlign = align; ctx.fillText(s, x, yy); };
  const rule = () => {
    if (draw) {
      ctx.strokeStyle = '#B9BDC4'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(M, y + 0.5); ctx.lineTo(W - M, y + 0.5); ctx.stroke(); ctx.setLineDash([]);
    }
    y += 16;
  };
  // The item table: the code takes what the five figures leave.
  const NUMW = 58; const QTYW = 24; const GAP = 8;
  const colX = () => {
    const total = W - M;
    const net = total - NUMW - GAP;
    const price = net - NUMW - GAP;
    return { total, net, price, qty: price - NUMW - GAP - QTYW };
  };
  for (const b of blocks) {
    if (b.t === 'brand') {
      font(20, 600, SANS); text(b.title, W / 2, y + 4, 'center'); y += 20;
      font(10.5, 600); text(b.copy, W / 2, y + 2, 'center', SOFT); y += 22;
    } else if (b.t === 'field') {
      font(11.5, 400);
      const k = `${b.k}: `;
      const kw = ctx.measureText(k).width;
      const lines = wrap(ctx, b.v, inner - kw);
      text(k, M, y, 'left', SOFT);
      font(11.5, b.strong ? 700 : 500);
      lines.forEach((l, i) => { text(l, M + kw, y); y += 15.5; if (i === lines.length - 1) y += 0; });
    } else if (b.t === 'text') {
      font(11.5, 500); for (const l of wrap(ctx, b.text, inner)) { text(l, M, y); y += 15.5; }
    } else if (b.t === 'gap') {
      y += 8;
    } else if (b.t === 'rule') {
      y += 2; rule();
    } else if (b.t === 'items') {
      const c = colX();
      font(9.5, 700);
      text(b.head[0], M, y, 'left', SOFT); text(b.head[1], c.qty + QTYW / 2, y, 'center', SOFT);
      text(b.head[2], c.price, y, 'right', SOFT); text(b.head[3], c.net, y, 'right', SOFT); text(b.head[4], c.total, y, 'right', SOFT);
      y += 17;
      for (const r of b.rows) {
        font(11, 700); text(r.code, M, y);
        font(10.5, 500);
        text(r.qty, c.qty + QTYW / 2, y, 'center');
        text(r.cells[0], c.price, y, 'right'); text(r.cells[1], c.net, y, 'right'); text(r.cells[2], c.total, y, 'right');
        y += 14;
        font(10.5, 400); for (const l of wrap(ctx, r.desc, inner)) { text(l, M, y, 'left', '#3B3F47'); y += 13.5; }
        if (r.note) { ctx.font = `italic 400 10.5px ${SANS}`; for (const l of wrap(ctx, r.note, inner)) { text(l, M, y, 'left', SOFT); y += 13.5; } }
        y += 7;
      }
    } else if (b.t === 'amount') {
      y += 4; font(13, 700); text(`${b.k}:`, M, y + 2);
      font(19, 700); text(b.v, W - M, y + 3, 'right'); y += 22;
    } else if (b.t === 'words') {
      font(10.5, 600); for (const l of wrap(ctx, b.text, inner)) { text(l, W / 2, y, 'center'); y += 14; }
      y += 4;
    } else if (b.t === 'rx') {
      const n = b.cols.length;
      const cw = (inner - 30) / n;
      font(10, 700); b.cols.forEach((col, i) => text(col, M + 30 + cw * (i + 1) - 2, y, 'right', SOFT)); y += 17;
      for (const row of b.rows) {
        font(11.5, 700); text(row[0], M, y);
        font(11.5, 500); row.slice(1).forEach((v, i) => text(v, M + 30 + cw * (i + 1) - 2, y, 'right')); y += 18;
      }
      y += 2;
    } else if (b.t === 'foot') {
      font(10.5, 400, SANS); for (const l of wrap(ctx, b.text, inner)) { text(l, W / 2, y, 'center', '#3B3F47'); y += 14; }
    } else if (b.t === 'barcode') {
      y += 10;
      const { bars, width } = code128Bars(b.value);
      const unit = Math.min(2.4, (inner - 20) / width);
      const x0 = (W - width * unit) / 2;
      if (draw) { ctx.fillStyle = INK; for (const bar of bars) ctx.fillRect(x0 + bar.x * unit, y, bar.w * unit, 50); }
      y += 64; font(10.5, 400); text(b.caption, W / 2, y, 'center', SOFT); y += 20;
    } else if (b.t === 'thanks') {
      y += 6; font(13, 500, SANS); text(b.text, W / 2, y, 'center', '#2A2D33'); y += 18;
    } else if (b.t === 'fine') {
      font(10.5, 400, SANS);
      for (const l of wrap(ctx, b.text, inner)) { text(l, b.left ? M : W / 2, y, b.left ? 'left' : 'center', SOFT); y += 14; }
    }
  }
  return y + 14;
}

/** A PNG blob of the receipt. */
export async function receiptImage(blocks) {
  try { await document.fonts.ready; } catch { /* system fonts then */ }
  const probe = document.createElement('canvas').getContext('2d');
  const h = run(probe, blocks, false);
  const edge = 9;
  const canvas = document.createElement('canvas');
  canvas.width = (W + PAD * 2) * SCALE;
  canvas.height = (h + edge + PAD * 2) * SCALE;
  const ctx = canvas.getContext('2d');
  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = NIGHT;
  ctx.fillRect(0, 0, W + PAD * 2, h + edge + PAD * 2);
  ctx.translate(PAD, PAD);
  // paper with a torn bottom edge
  ctx.fillStyle = PAPER;
  ctx.beginPath();
  ctx.moveTo(0, 6); ctx.quadraticCurveTo(0, 0, 6, 0); ctx.lineTo(W - 6, 0); ctx.quadraticCurveTo(W, 0, W, 6);
  ctx.lineTo(W, h);
  const teeth = Math.round(W / 12);
  for (let i = teeth; i >= 0; i--) ctx.lineTo((W / teeth) * i, h + (i % 2 ? edge : 0));
  ctx.closePath(); ctx.fill();
  ctx.textBaseline = 'alphabetic';
  run(ctx, blocks, true);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

/** Share sheet with the picture where the phone allows it; a download otherwise. */
export async function shareReceiptImage(blob, name, title) {
  const file = new File([blob], name, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title }); return 'shared'; } catch (e) { if (e.name === 'AbortError') return 'cancelled'; }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return 'downloaded';
}
