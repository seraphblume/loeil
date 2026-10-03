// The autorefractor ticket, as it actually prints:
//
//     -----------0438----------
//     NAME                  M/F
//        24/JUL/2026   05:30 PM
//     VD=12.00mm
//     WD=40cm
//     <R>     S      C     A
//           -2.50  -1.25  178   9
//           -2.50  -1.25  177   9
//           -2.75  -1.50  178   9
//         <-2.50  -1.25  178>
//     <L>     ... same shape ...
//     PD 62                N 58
//     GALERIAS URUAPAN
//
// Three sampled readings per eye, then the machine's representative value in
// angle brackets. The trailing digit on a sample is a 0–9 confidence index. PD
// is BINOCULAR here, where a written prescription gives it per eye.
//
// Parsing is deliberately forgiving: OCR on thermal paper splits minus signs
// from digits, reads O for 0, and loses the brackets, so nothing below depends
// on exact punctuation. Text pasted from the phone's own Live Text works too.

import { blankRx, blankEye } from './crm.js';
import { isoDay } from './util.js';

const MONTHS = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
  ENE: 1, ABR: 4, AGO: 8, DIC: 12 };

function normalise(line) {
  let t = String(line).toUpperCase();
  t = t.replace(/[–—−]/g, '-').replace(/＜/g, '<').replace(/＞/g, '>');
  t = t.replace(/([+\-])\s+(?=[\dO])/g, '$1');          // "- 2.50" → "-2.50"
  t = t.replace(/(^|[\s+\-<(])O(?=[.\d])/g, '$10');      // "O.50" → "0.50", never the O of OD/OS
  t = t.replace(/(\d),(\d{2})\b/g, '$1.$2');             // "2,50" → "2.50"
  t = t.replace(/\s+/g, ' ').trim();
  return t;
}

const marksEye = (line, letter) =>
  new RegExp(`[<(\\[]\\s*${letter}\\s*[>)\\]]`).test(line) || new RegExp(`^${letter}\\b.*\\bS\\b.*\\bC\\b.*\\bA\\b`).test(line);

const isRepresentative = (line) => line.includes('<') && !/<\s*[RL]\s*>/.test(line);

function measurement(line) {
  const m = line.match(/([+\-]?\d{1,2}\.\d{2})\s+([+\-]?\d{1,2}\.\d{2})\s+(\d{1,3})(?:\s+(\d))?/);
  if (!m) return null;
  return { sphere: Number(m[1]), cylinder: Number(m[2]), axis: Number(m[3]), confidence: m[4] != null ? Number(m[4]) : null };
}

function ticketNumber(line) {
  // Only the dashed banner line carries it; a reading line also has dashes.
  if (!line.includes('--')) return null;
  return line.match(/-+\s*(\d{3,5})\s*-+/)?.[1] ?? null;
}

function date(line) {
  const m = line.match(/(\d{1,2})[/\-]([A-Z]{3})[/\-](\d{4})/);
  if (!m || !MONTHS[m[2]]) return null;
  return isoDay(new Date(Number(m[3]), MONTHS[m[2]] - 1, Number(m[1])));
}

const valueAfter = (key, line) => {
  const m = line.match(new RegExp(`\\b${key}\\s*[:=]?\\s*(\\d{1,3}(?:\\.\\d{1,2})?)`));
  return m ? Number(m[1]) : null;
};

function pupillary(line) {
  const far = line.match(/\bPD\s*[:=]?\s*(\d{2}(?:\.\d)?)/);
  if (!far) return null;
  const near = line.match(/\bN\s*[:=]?\s*(\d{2}(?:\.\d)?)/);
  return { far: Number(far[1]), near: near ? Number(near[1]) : null };
}

function median(values) {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/** The lowest confidence the machine printed for this eye — the cautious read. */
function lowestConfidence(eye) {
  const c = eye.samples.map((s) => s.confidence).filter((v) => v != null);
  return c.length ? Math.min(...c) : null;
}

export function resolvedEye(eye) {
  if (eye.representative) {
    return { ...eye.representative, confidence: eye.representative.confidence ?? lowestConfidence(eye) };
  }
  if (!eye.samples.length) return null;
  return {
    sphere: median(eye.samples.map((s) => s.sphere)),
    cylinder: median(eye.samples.map((s) => s.cylinder)),
    axis: median(eye.samples.map((s) => s.axis)),
    confidence: lowestConfidence(eye),
  };
}

export function sphereSpread(eye) {
  if (!eye.samples.length) return 0;
  const s = eye.samples.map((x) => x.sphere);
  return Math.max(...s) - Math.min(...s);
}

export function parseTicket(text) {
  const lines = String(text).split(/\r?\n/).map(normalise).filter(Boolean);
  const t = {
    ticketNumber: null, capturedOn: null, vertexDistanceMM: null, workingDistanceCM: null,
    right: { samples: [], representative: null }, left: { samples: [], representative: null },
    pdFarMM: null, pdNearMM: null, site: null,
  };
  let eye = null;
  for (const line of lines) {
    if (!t.ticketNumber) t.ticketNumber = ticketNumber(line);
    if (!t.capturedOn) t.capturedOn = date(line);
    const vd = valueAfter('VD', line); if (vd != null) t.vertexDistanceMM = vd;
    const wd = valueAfter('WD', line); if (wd != null) t.workingDistanceCM = wd;

    if (marksEye(line, 'R')) { eye = 'right'; continue; }
    if (marksEye(line, 'L')) { eye = 'left'; continue; }

    const p = pupillary(line);
    if (p) { t.pdFarMM = p.far; if (p.near != null) t.pdNearMM = p.near; eye = null; continue; }

    if (!eye) continue;
    const m = measurement(line);
    if (!m) continue;
    if (isRepresentative(line)) t[eye].representative = m;
    else t[eye].samples.push(m);
  }
  const last = lines[lines.length - 1];
  if (last && !/\d/.test(last) && last.length > 4) t.site = last;
  return t;
}

export const ticketUsable = (t) => Boolean(resolvedEye(t.right) || resolvedEye(t.left));

/** Everything the machine was unsure about, in plain language. */
export function ticketWarnings(t) {
  const out = [];
  const r = resolvedEye(t.right);
  const l = resolvedEye(t.left);
  if (!r) out.push('Right eye did not read.');
  if (!l) out.push('Left eye did not read.');
  if (sphereSpread(t.right) >= 0.5 || sphereSpread(t.left) >= 0.5) out.push('The three readings vary by 0.50 or more — worth repeating.');
  const conf = [r?.confidence, l?.confidence].filter((c) => c != null);
  if (conf.length && Math.min(...conf) < 7) out.push(`Confidence index ${Math.min(...conf)}. Check before quoting.`);
  if (t.pdFarMM == null) out.push('PD did not read.');
  return out;
}

/** Fold the ticket into the record a client keeps. */
export function ticketToRx(t) {
  const rx = blankRx();
  const r = resolvedEye(t.right);
  const l = resolvedEye(t.left);
  if (r) rx.od = { ...blankEye(), sphere: r.sphere, cylinder: r.cylinder, axis: r.axis, samples: t.right.samples, confidence: r.confidence };
  if (l) rx.os = { ...blankEye(), sphere: l.sphere, cylinder: l.cylinder, axis: l.axis, samples: t.left.samples, confidence: l.confidence };
  rx.pdFarMM = t.pdFarMM;
  rx.pdNearMM = t.pdNearMM;
  rx.vertexDistanceMM = t.vertexDistanceMM;
  rx.workingDistanceCM = t.workingDistanceCM;
  rx.ticketNumber = t.ticketNumber;
  rx.site = t.site;
  rx.issuedOn = t.capturedOn ?? isoDay(new Date());
  return rx;
}
