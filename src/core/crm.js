// Clients, prescriptions, and what a prescription already decides.
//
// Device-local only. These are the employer's client records on a personal
// phone; the smallest footprint is the defensible one. A quote marked Sold IS
// the purchase history — there is no second model for the two to disagree.

import { uid, addMonths, addDays, signed, dayToDate } from './util.js';
import { tr } from '../i18n.js';
import {
  RX_VALID_MONTHS, RX_WARN_MONTHS, HIGH_RX_SPHERE, RECALL_MONTHS, RECALL_WINDOW_DAYS,
} from '../config.js';

export const SPHERE_RANGE = [-20, 20];
export const CYLINDER_RANGE = [-8, 8];

/**
 * What each value may be, and its step: the register's own limits, so a
 * prescription typed here is one the POS will take.
 */
export const RX_LIMITS = {
  sphere: { min: -25, max: 10, step: 0.25 },
  cylinder: { min: -8, max: 0, step: 0.25 },
  axis: { min: 0, max: 180, step: 1 },
  pd: { min: 20, max: 40, step: 0.5 },
  addition: { min: 0, max: 4, step: 0.25 },
  prism: { min: 0, max: 10, step: 0.25 },
  aob: { min: 15, max: 30, step: 1, ticks: [15, 19, 23, 26, 30] },
  // Contact lens fittings: gas permeable (SPH K1 K2 RC DIA), multifocal (SE ADD).
  clSphere: { min: -30, max: 30, step: 0.25 },
  clAdd: { min: 0, max: 4, step: 0.25 },
  k: { min: 35, max: 52, step: 0.25 },          // keratometry, dioptres
  rc: { min: 6.5, max: 9.5, step: 0.05 },        // radius of curvature (base curve), mm
  dia: { min: 8, max: 24, step: 0.1, ticks: [8, 12, 16, 20, 24] }, // diameter, mm (scleral up to 24)
};

export const PRISM_BASES = [
  { value: 'up', label: 'Up' }, { value: 'down', label: 'Down' },
  { value: 'in', label: 'In' }, { value: 'out', label: 'Out' },
];

/** Into range and onto the step: 2.3 → 2.25, 45 → 40. */
export function snap(value, { min, max, step }) {
  const n = Math.min(max, Math.max(min, Number(value) || 0));
  const s = Math.round((n - min) / step) * step + min;
  return Number(s.toFixed(2));
}

/** Monocular PD per eye: the eye's own, else half the binocular figure. Far, or near for a lecture Rx. */
export function monoPd(rx, side, near = false) {
  const own = rx?.[side]?.[near ? 'pdNear' : 'pdFar'];
  if (own) return Number(own);
  const bin = near ? rx?.pdNearMM : rx?.pdFarMM;
  return bin ? Number(bin) / 2 : null;
}

export const hasPrism = (rx) => ['od', 'os'].some((e) => Number(rx?.[e]?.prism?.amount) > 0);

export const blankEye = () => ({
  sphere: 0, cylinder: 0, axis: 0, addition: 0, pdFar: null, pdNear: null, prism: null,
});

export const blankRx = () => ({
  od: blankEye(), os: blankEye(), issuedOn: null, notes: '',
  pdFarMM: null, pdNearMM: null, vertexDistanceMM: null, workingDistanceCM: null,
  ticketNumber: null, site: null, expiryOverride: null,
});

/**
 * Contact lenses: powers per eye, and the lens the fitting settled on. A
 * gas-permeable fitting (`gp`) is written as sphere, the two keratometries
 * (K1, K2), the lens's radius of curvature — its base curve (RC) — and its
 * diameter (DIA), per eye.
 */
export const blankContactEye = () => ({ sphere: 0, cylinder: 0, axis: 0, k1: null, k2: null, rc: null, dia: null });
export const blankContactRx = () => ({
  od: blankContactEye(), os: blankContactEye(), addition: 0, brand: '', modality: '', issuedOn: null, gp: false,
});
const hasGp = (e) => ['k1', 'k2', 'rc', 'dia'].some((k) => e?.[k] != null);
export const contactIsBlank = (cl) => !cl || (!cl.brand && ['od', 'os'].every((e) => !Number(cl[e]?.sphere) && !Number(cl[e]?.cylinder) && !hasGp(cl[e])));

/**
 * The figures a contact lens's fitting asks for, per eye, as the register asks
 * for them. The vocabulary says which materials need one (`fit`): gas
 * permeable — sphere, the two keratometries, the base curve (RC), the
 * diameter (DIA); multifocal — the spherical equivalent (SE) and the ADD.
 */
export const GP_FIELDS = [
  { key: 'sphere', label: 'SPH', kind: 'clSphere' },
  { key: 'k1', label: 'K1', kind: 'k', unit: 'D' },
  { key: 'k2', label: 'K2', kind: 'k', unit: 'D' },
  { key: 'rc', label: 'RC', kind: 'rc', unit: 'mm' },
  { key: 'dia', label: 'DIA', kind: 'dia', unit: 'mm' },
];
export const MF_FIELDS = [
  { key: 'se', label: 'SE', kind: 'clSphere' },
  { key: 'addition', label: 'ADD', kind: 'clAdd' },
];
export const CL_FITS = {
  gp: { label: 'Gas permeable', fields: GP_FIELDS, note: 'K1 and K2 are the keratometries, RC the lens’s base curve, DIA its diameter.' },
  mf: { label: 'Multifocal', fields: MF_FIELDS, note: 'SE is the spherical equivalent: the sphere plus half the cylinder. The register asks for nothing else.' },
};
export const blankFit = (fit) => Object.fromEntries((CL_FITS[fit]?.fields ?? []).map((f) => [f.key, null]));
export const fitComplete = (fit, m) => Boolean(m) && Boolean(CL_FITS[fit]) && CL_FITS[fit].fields.every((f) => m[f.key] != null);
const signedFig = (v) => (Number(v) === 0 ? '0.00' : (v > 0 ? '+' : '−') + Math.abs(v).toFixed(2));
const FIT_FIGURE = {
  clSphere: signedFig, k: (v) => Number(v).toFixed(2), rc: (v) => Number(v).toFixed(2), dia: (v) => Number(v).toFixed(1),
  clAdd: (v) => '+' + Math.abs(Number(v)).toFixed(2),
};
/** `SPH −3.25 · K1 42.50 · K2 43.75 · RC 7.85 · DIA 9.6`, `SE −2.25 · ADD +2.00` — the line's power. */
export function fitText(fit, m) {
  if (!m || !CL_FITS[fit]) return '';
  return CL_FITS[fit].fields.filter((f) => m[f.key] != null).map((f) => `${f.label} ${FIT_FIGURE[f.kind](Number(m[f.key]))}`).join(' · ');
}
/** Sphere plus half the cylinder, on the quarter. */
export function sphericalEquivalent(sphere, cylinder = 0) {
  const se = Number(sphere || 0) + Number(cylinder || 0) / 2;
  return Math.round(se * 4) / 4;
}

const quarter = (v) => (v == null || v === '' ? null : Math.round(Number(v) * 4) / 4);

/**
 * Where a fitting starts. Gas permeable: the client's GP record. Multifocal:
 * SE and ADD from the contact lens prescription, else the glasses one.
 */
export function startingFit(fit, side, cl, rx) {
  const blank = blankFit(fit);
  if (fit === 'gp') return cl?.gp ? Object.fromEntries(Object.keys(blank).map((k) => [k, cl[side]?.[k] ?? null])) : blank;
  if (cl && !cl.gp && !contactIsBlank(cl)) {
    return { se: sphericalEquivalent(cl[side].sphere, cl[side].cylinder), addition: Number(cl.addition) ? quarter(cl.addition) : null };
  }
  if (rx && !rxIsBlank(rx)) {
    return { se: sphericalEquivalent(rx[side].sphere, rx[side].cylinder), addition: Number(rx[side].addition) ? quarter(rx[side].addition) : null };
  }
  return blank;
}

/** How he sizes up a client, as Alpha's CRM does. */
export const QUALITIES = ['Easygoing', 'Regular', 'Demanding', 'Difficult'];

/**
 * A client. Besides the glasses (`prescription`) and contact lens ones, a
 * lecture prescription for near work (`nearRx`, its PD the near one), and the
 * prescriptions they had before (`rxHistory`).
 */
export function newClient(name = '') {
  return {
    id: uid(), name, phone: '', email: '', customerId: '', birthdate: null, quality: '',
    prescription: blankRx(), nearRx: null, contactRx: null, rxHistory: [], notes: '',
    isFavourite: false, createdOn: new Date().toISOString(),
  };
}

/** Whole years since `YYYY-MM-DD`. */
export function ageOn(birthdate, now = new Date()) {
  const b = dayToDate(birthdate);
  if (!b) return null;
  let a = now.getFullYear() - b.getFullYear();
  if (now.getMonth() < b.getMonth() || (now.getMonth() === b.getMonth() && now.getDate() < b.getDate())) a--;
  return a >= 0 ? a : null;
}

export const eyeIsBlank = (e) => !e || (!Number(e.sphere) && !Number(e.cylinder) && !Number(e.axis) && !Number(e.addition));
export const rxIsBlank = (rx) => !rx || (eyeIsBlank(rx.od) && eyeIsBlank(rx.os));

// ---------------------------------------------------------------------------
// History: the prescriptions a client had before.
//
// A PRESCRIPTION IS ITS ISSUE DATE. Saving one with another date puts the one
// it replaces into the history; saving one with the same date is a correction,
// and leaves nothing behind. The history holds one of each kind per date.

export const RX_KINDS = {
  glasses: { field: 'prescription', label: 'Glasses', blank: rxIsBlank },
  near: { field: 'nearRx', label: 'Lecture', blank: rxIsBlank },
  contact: { field: 'contactRx', label: 'Contact lenses', blank: (cl) => contactIsBlank(cl) },
};

const dateOf = (rx) => rx?.issuedOn ?? null;

/** The history with `rx` in it, in place of any of its kind from the same day. */
function archived(history, kind, rx) {
  return [
    { id: uid(), kind, rx, archivedOn: new Date().toISOString() },
    ...(history ?? []).filter((h) => !(h.kind === kind && dateOf(h.rx) === dateOf(rx))),
  ];
}

/** The client with this prescription on file; the one it replaces goes into their history when it was another. */
export function withRx(client, kind, rx) {
  const { field, blank } = RX_KINDS[kind];
  const old = client[field] ?? null;
  let rxHistory = client.rxHistory ?? [];
  if (old && !blank(old) && (!rx || blank(rx) || dateOf(old) !== dateOf(rx))) rxHistory = archived(rxHistory, kind, old);
  // The one now on file is no longer history.
  if (rx && !blank(rx)) rxHistory = rxHistory.filter((h) => !(h.kind === kind && dateOf(h.rx) === dateOf(rx)));
  return { ...client, [field]: rx, rxHistory };
}

/** Key order aside, the same value: what a backup round trip or an edit leaves alone compares equal. */
export function canon(x) {
  if (Array.isArray(x)) return `[${x.map(canon).join(',')}]`;
  if (x && typeof x === 'object') return `{${Object.keys(x).sort().map((k) => `${JSON.stringify(k)}:${canon(x[k])}`).join(',')}}`;
  return JSON.stringify(x ?? null);
}

/**
 * The client's prescriptions of one kind made to match the Alpha workbook's,
 * the source of record: its newest is on file — whatever was on the phone, a
 * correction on the same day included — and its older ones are in the history.
 * Nothing is lost: what it replaces on file goes into the history. With none of
 * that kind in the workbook, the one on file goes into the history too.
 */
export function mirrorRx(client, kind, incoming = []) {
  const { field, blank } = RX_KINDS[kind];
  const byDay = new Map();
  for (const rx of [...incoming].filter((r) => r && !blank(r)).sort((a, b) => (dateOf(a) ?? '').localeCompare(dateOf(b) ?? ''))) byDay.set(dateOf(rx), rx);
  const days = [...byDay.values()];
  const newest = days.pop() ?? null;
  let c = client;
  const current = c[field] ?? null;
  if (newest) { if (canon(current) !== canon(newest)) c = withRx(c, kind, newest); }
  else if (current && !blank(current)) c = withRx(c, kind, kind === 'glasses' ? blankRx() : null);
  for (const rx of days) {
    const h = (c.rxHistory ?? []).find((x) => x.kind === kind && dateOf(x.rx) === dateOf(rx));
    if (!h || canon(h.rx) !== canon(rx)) c = { ...c, rxHistory: archived(c.rxHistory, kind, rx) };
  }
  return c;
}

/** The history, newest prescription first. */
export const historyOf = (client) => [...(client?.rxHistory ?? [])].sort((a, b) => (dateOf(b.rx) ?? '').localeCompare(dateOf(a.rx) ?? ''));

/** `-2.25 -1.00 × 175°` — the way it is written on the form. */
export function eyeText(e) {
  if (eyeIsBlank(e)) return '—';
  const s = Number(e.sphere) ? signed(e.sphere) : '0.00';
  if (!Number(e.cylinder)) return s;
  return `${s} ${signed(e.cylinder)} × ${e.axis}°`;
}

/** Derived, never stored: a stored copy goes stale when the issue date is corrected. */
export function expiresOn(rx) {
  if (rx?.expiryOverride) return dayToDate(rx.expiryOverride) ?? new Date(rx.expiryOverride);
  if (!rx?.issuedOn) return null;
  const issued = dayToDate(rx.issuedOn) ?? new Date(rx.issuedOn);
  return addMonths(issued, RX_VALID_MONTHS);
}

export function issuedDate(rx) {
  if (!rx?.issuedOn) return null;
  return dayToDate(rx.issuedOn) ?? new Date(rx.issuedOn);
}

/** Warn three months out. A badge on everybody is a badge on nobody. */
export function validity(rx, now = new Date()) {
  const exp = expiresOn(rx);
  if (!exp) return 'unknown';
  if (exp < now) return 'expired';
  return exp <= addMonths(now, RX_WARN_MONTHS) ? 'expiring' : 'valid';
}

export const VALIDITY_LABEL = { unknown: 'No date', valid: 'Valid', expiring: 'Expiring', expired: 'Expired' };

/** An icon while something is wrong, nothing while it is fine. */
export function warningIcon(rx, now = new Date()) {
  const v = validity(rx, now);
  return v === 'expired' ? 'warning' : v === 'expiring' ? 'clock' : null;
}

export const strongestSphere = (rx) => Math.max(Math.abs(Number(rx.od.sphere) || 0), Math.abs(Number(rx.os.sphere) || 0));
export const needsAddition = (rx) => Number(rx.od.addition) > 0 || Number(rx.os.addition) > 0;

/** Binocular PD: the machine's figure if it printed one, otherwise the monocular sum. */
export function pd(rx, near) {
  const bin = near ? rx.pdNearMM : rx.pdFarMM;
  if (bin) return Number(bin);
  const r = near ? rx.od.pdNear : rx.od.pdFar;
  const l = near ? rx.os.pdNear : rx.os.pdFar;
  return r && l ? Number(r) + Number(l) : null;
}

/**
 * The Rx answers two cascade steps on its own. The app states this once and
 * gets out of the way — every step stays editable.
 */
export function guidance(rx, catalogue) {
  const reasons = [];
  let family = null;
  let highRx = [];
  if (rxIsBlank(rx)) return { family, highRx, reasons };
  if (needsAddition(rx)) {
    family = 'MF';
    const add = Math.max(Number(rx.od.addition) || 0, Number(rx.os.addition) || 0);
    reasons.push(tr('Add of {add} — needs a multifocal lens.', { add: signed(add) }));
  } else {
    family = 'SV';
  }
  if (strongestSphere(rx) > HIGH_RX_SPHERE) {
    highRx = catalogue ? catalogue.highRxMaterials() : [];
    const sphere = strongestSphere(rx).toFixed(2);
    reasons.push(highRx.length
      ? tr('Sphere of {sphere} — needs a high-Rx material ({list}).', { sphere, list: highRx.join(', ') })
      : tr('Sphere of {sphere} — needs a high-Rx material.', { sphere }));
  }
  return { family, highRx, reasons };
}

export function initials(name) {
  return String(name ?? '').trim().split(/\s+/).slice(0, 2).map((w) => w[0] ?? '').join('').toUpperCase();
}

/** Favourites first, then name. */
export function sortClients(list) {
  return [...list].sort((a, b) => (a.isFavourite === b.isFavourite
    ? a.name.localeCompare(b.name, 'es', { sensitivity: 'base' })
    : a.isFavourite ? -1 : 1));
}

// ---------------------------------------------------------------------------
// Recall

/** The earlier of (last sale + 12 months) and the prescription expiry. */
export function recallDate(client, orders) {
  const sold = orders.filter((o) => o.clientId === client.id && o.status === 'sold' && o.closedOn);
  const last = sold.length ? new Date(Math.max(...sold.map((o) => new Date(o.closedOn).getTime()))) : null;
  const fromSale = last ? addMonths(last, RECALL_MONTHS) : null;
  const exp = expiresOn(client.prescription);
  if (fromSale && exp) return fromSale < exp ? fromSale : exp;
  return fromSale ?? exp ?? null;
}

export function isDue(client, orders, now = new Date()) {
  const due = recallDate(client, orders);
  return Boolean(due && due <= addDays(now, RECALL_WINDOW_DAYS));
}

export function dueForRecall(clients, orders, now = new Date()) {
  return clients
    .filter((c) => !c.showcase && isDue(c, orders, now))
    .map((c) => ({ client: c, due: recallDate(c, orders) }))
    .sort((a, b) => a.due - b.due);
}
