// Clients, prescriptions, and what a prescription already decides.
//
// Device-local only. These are the employer's client records on a personal
// phone; the smallest footprint is the defensible one. A quote marked Sold IS
// the purchase history — there is no second model for the two to disagree.

import { uid, addMonths, addDays, signed, dayToDate } from './util.js';
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

/** Monocular far PD per eye: the eye's own, else half the binocular figure. */
export function monoPd(rx, side) {
  const own = rx?.[side]?.pdFar;
  if (own) return Number(own);
  return rx?.pdFarMM ? Number(rx.pdFarMM) / 2 : null;
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

/** Contact lenses: powers per eye, and the lens the fitting settled on. */
export const blankContactEye = () => ({ sphere: 0, cylinder: 0, axis: 0 });
export const blankContactRx = () => ({
  od: blankContactEye(), os: blankContactEye(), addition: 0, brand: '', modality: '', issuedOn: null,
});
export const contactIsBlank = (cl) => !cl || (!cl.brand && ['od', 'os'].every((e) => !Number(cl[e]?.sphere) && !Number(cl[e]?.cylinder)));

export function newClient(name = '') {
  return {
    id: uid(), name, phone: '', email: '', prescription: blankRx(), contactRx: null, notes: '',
    isFavourite: false, createdOn: new Date().toISOString(),
  };
}

export const eyeIsBlank = (e) => !e || (!Number(e.sphere) && !Number(e.cylinder) && !Number(e.axis) && !Number(e.addition));
export const rxIsBlank = (rx) => !rx || (eyeIsBlank(rx.od) && eyeIsBlank(rx.os));

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
    reasons.push(`Add of ${signed(add)} — needs a multifocal lens.`);
  } else {
    family = 'SV';
  }
  if (strongestSphere(rx) > HIGH_RX_SPHERE) {
    highRx = catalogue ? catalogue.highRxMaterials() : [];
    const list = highRx.length ? ` (${highRx.join(', ')})` : '';
    reasons.push(`Sphere of ${strongestSphere(rx).toFixed(2)} — needs a high-Rx material${list}.`);
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
    .filter((c) => isDue(c, orders, now))
    .map((c) => ({ client: c, due: recallDate(c, orders) }))
    .sort((a, b) => a.due - b.due);
}
