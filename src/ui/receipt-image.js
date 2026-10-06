// The receipt as a picture to send: the same blocks the screen shows, drawn on
// a canvas — paper on the night background, torn edge, a barcode that scans.

import { code128Bars } from '../core/code128.js';

const W = 380;            // paper width, CSS px
const M = 26;             // paper margin
const SCALE = 3;
const PAD = 22;           // background around the paper
const INK = '#14161B';
const SOFT = '#6B717C';
const PAPER = '#F6F6F3';
const NIGHT = '#0B0D13';
const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, "Roboto Mono", monospace';
const SANS = 'Inter, -apple-system, "Segoe UI", Roboto, sans-serif';

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
  let y = 30;
  const inner = W - M * 2;
  const font = (size, weight = 400, family = MONO) => { ctx.font = `${weight} ${size}px ${family}`; };
  const text = (s, x, yy, align = 'left', color = INK) => { if (!draw) return; ctx.fillStyle = color; ctx.textAlign = align; ctx.fillText(s, x, yy); };
  const rule = () => {
    if (draw) {
      ctx.strokeStyle = '#B9BDC4'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(M, y + 0.5); ctx.lineTo(W - M, y + 0.5); ctx.stroke(); ctx.setLineDash([]);
    }
    y += 18;
  };
  for (const b of blocks) {
    if (b.t === 'logo') {
      if (draw) {
        ctx.fillStyle = '#E8E8E4'; ctx.beginPath(); ctx.arc(W / 2, y + 16, 16, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = INK; ctx.lineWidth = 1.3; ctx.lineJoin = 'round';
        ctx.strokeRect(W / 2 - 6.5, y + 15, 13, 8); ctx.beginPath();
        ctx.moveTo(W / 2 - 8, y + 15); ctx.lineTo(W / 2 - 6, y + 9); ctx.lineTo(W / 2 + 6, y + 9); ctx.lineTo(W / 2 + 8, y + 15); ctx.stroke();
      }
      y += 46;
    } else if (b.t === 'title') {
      font(19, 600, SANS); text(b.text, W / 2, y + 6, 'center'); y += 24;
    } else if (b.t === 'subtitle') {
      font(12.5, 400, SANS); text(b.text, W / 2, y + 2, 'center', SOFT); y += 22;
    } else if (b.t === 'rule') {
      y += 2; rule();
    } else if (b.t === 'kv') {
      font(12, 400); text(b.k, M, y, 'left', SOFT);
      font(12, b.strong ? 700 : 500); text(b.v, W - M, y, 'right'); y += 21;
    } else if (b.t === 'head') {
      y += 4; font(11, 700); text(`${b.n}  ${b.text}`, M, y, 'left', SOFT); y += 20;
    } else if (b.t === 'none') {
      font(11.5, 400); text(b.text, M + 22, y, 'left', SOFT); y += 20;
    } else if (b.t === 'item') {
      font(13.5, 600); text(b.copy ?? '—', M + 22, y);
      if (b.qty) { const w = ctx.measureText(b.copy ?? '—').width; font(11.5, 400); text(`×${b.qty}`, M + 22 + w + 8, y, 'left', SOFT); }
      if (b.price != null) { font(13, 600); text(fmtMoney(b.price), W - M, y, 'right'); }
      y += 17;
      font(11.5, 400);
      for (const l of wrap(ctx, b.text, inner - 22)) { text(l, M + 22, y, 'left', '#3B3F47'); y += 15; }
      if (b.note) { font(11, 400, SANS); ctx.font = `italic 400 11px ${SANS}`; for (const l of wrap(ctx, b.note, inner - 22)) { text(l, M + 22, y, 'left', SOFT); y += 14; } }
      y += 8;
    } else if (b.t === 'cols') {
      font(11, 500); text(b.left, M, y, 'left', SOFT); text(b.right, W - M, y, 'right', SOFT); y += 22;
    } else if (b.t === 'line') {
      font(13, 500);
      const price = b.price == null ? (b.pending ? '—' : 'at register') : fmtMoney(b.price);
      const pw = ctx.measureText(price).width;
      const lines = wrap(ctx, b.name, inner - pw - 16);
      text(price, W - M, y, 'right');
      for (const l of lines) { text(l, M, y); y += 17; }
      if (b.discount) { font(11, 400); text(`${fmtMoney(b.list)} less ${b.discount}%`, W - M, y, 'right', SOFT); }
      if (b.detail) { ctx.font = `italic 400 11px ${SANS}`; for (const l of wrap(ctx, b.detail, inner - 90)) { text(l, M, y, 'left', SOFT); y += 14; } } else if (b.discount) y += 14;
      y += 9;
    } else if (b.t === 'rx') {
      const x0 = M + 22;
      const cw = (inner - 22 - 26) / b.cols.length;
      font(10.5, 600); b.cols.forEach((c, i) => text(c, x0 + 26 + cw * (i + 1) - 4, y, 'right', SOFT)); y += 18;
      for (const row of b.rows) {
        font(12, 700); text(row[0], x0, y);
        font(12.5, 500); row.slice(1).forEach((v, i) => text(v, x0 + 26 + cw * (i + 1) - 4, y, 'right')); y += 19;
      }
      y += 4;
    } else if (b.t === 'total') {
      y += 6; font(14, 700); text(b.k, M, y + 2);
      font(21, 700); text(b.v, W - M, y + 3, 'right'); y += 30;
    } else if (b.t === 'barcode') {
      y += 6;
      const { bars, width } = code128Bars(b.value);
      const unit = Math.min(2.4, (inner - 20) / width);
      const x0 = (W - width * unit) / 2;
      if (draw) { ctx.fillStyle = INK; for (const bar of bars) ctx.fillRect(x0 + bar.x * unit, y, bar.w * unit, 54); }
      y += 70; font(11, 400); text(b.caption, W / 2, y, 'center', SOFT); y += 26;
    } else if (b.t === 'thanks') {
      font(13, 500, SANS); text(b.text, W / 2, y, 'center', '#2A2D33'); y += 20;
    } else if (b.t === 'fine') {
      font(10.5, 400, SANS);
      text(b.text, b.left ? M + 22 : W / 2, y, b.left ? 'left' : 'center', SOFT); y += 17;
    }
  }
  return y + 18;
}

let fmtMoney = (c) => String(c);

/** A PNG blob of the receipt. */
export async function receiptImage(blocks, money) {
  fmtMoney = money;
  try { await Promise.all([document.fonts.load(`600 19px Inter`), document.fonts.load(`400 12px Inter`), document.fonts.load(`500 13px Inter`)]); } catch { /* system fonts then */ }
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
