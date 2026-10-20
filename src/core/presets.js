// Lifestyle presets: one tap puts a whole lens on the order — single vision or
// progressive as the prescription says, high-index when it is strong — with
// Plus Protection and the accessories that go with it.
//
// Each preset (Digital, First Glasses…) has five tiers, from the lowest price
// up. On the order a tier reads as one name: Digital Pro, Kids Lite.
//
//   Lite        no paid accessories, no Plus Protection, low-tier materials (CR-39)
//   Essential   no paid accessories, no Plus Protection, polycarbonate at the sets’ price
//               (free gifts — a cloth, a kids' strap — go with every tier)
//   Plus        1 accessory and Plus Protection, mid-tier materials
//   Pro         1 accessory and Plus Protection, Essilor
//   Ultra       1–2 accessories and Plus Protection, Essilor's best
//
// A tier names its lens the way a set row does —
// family|material|design|filter|colour|coating — once for single vision and
// once for progressives, so the catalogue decides what exists. Of what matches,
// the tier takes the lens the client pays least for WITH THE FRAME IN HAND: in
// a set, the set's row (a lens the set's table does not name would take the
// frame out of its set), in a sunglasses frame the prescription sun price, and
// otherwise the price list. Among equals, the lower list price.
//
// POLAREX CANNOT TAKE CRIZAL. The catalogue holds those rows back (see
// core/catalogue.js), so no tier can land on one, and an order that carries one
// from before is flagged.
//
// CLEANING SOLUTIONS DAMAGE CRIZAL (ANY OF THEM), TRANSITIONS AND POLAREX, and
// void their warranty. A preset never adds a solution to such a lens, whatever
// its data says, and an order that ends up with both is flagged — only a
// customer who insists takes one home with them. The Saco Maravilloso pouch
// carries a solution of its own, and anything antiempañante is alcohol-based,
// so both count as one. The Toalla Maravillosa is only a polishing cloth.
//
// A tier that names no spectacle lens is a contact lens preset. With no contact
// lens either it is a care tier — its solution and case, leaving every lens on
// the order as it is. With one (`cl`: material|product|colour, the cheapest after
// the campaign's discount) it puts that lens on for both eyes, one box each,
// the fitting started from the prescription.
//
// VARIETY: an accessory is listed with its alternatives (colours, models). Each
// order takes one of those on hand at the first one's price — so the price never
// moves — chosen by the order, so the same order always shows the same one and
// the next order likely another.

import { factsMatch, lensFacts, resolveOrder, autoDiscountFor, savingOf } from './sets.js';
import { resolve } from './lens.js';
import { isPair, pairLine, lensLine, extraLine, priceOrder, contactFit } from './orders.js';
import { needsAddition, strongestSphere, rxIsBlank, contactIsBlank, startingFit, fitText } from './crm.js';
import { isPolarexCrizal, POLAREX_CRIZAL } from './catalogue.js';
import { HIGH_RX_SPHERE } from '../config.js';

/** The tiers in their order, with what each stands for — the editor's hints and the README say the same. */
export const TIERS = [
  { name: 'Lite', rule: 'Free gifts only, no Plus Protection, low-tier materials' },
  { name: 'Essential', rule: 'Free gifts only, no Plus Protection, polycarbonate at the sets’ price' },
  { name: 'Plus', rule: '1 accessory and Plus Protection, mid-tier materials' },
  { name: 'Pro', rule: '1 accessory and Plus Protection, Essilor' },
  { name: 'Ultra', rule: '1–2 accessories and Plus Protection, Essilor’s best' },
];

/** `Digital Pro`: a tier as the order, the quote and the toast name it. */
export const tierName = (t) => [t?.preset, t?.tier].filter(Boolean).join(' ');

// ---------------------------------------------------------------------------
// Items: `Pouch: 61004120/61004121; Cleaning solution*: 61004172`
// A label, the SKUs in order of preference (the first on hand is taken, else the first known), and
// a star when the item is a cleaning solution.

export function parseItems(text) {
  return String(text ?? '').split(';').map((part) => part.trim()).filter(Boolean).map((part) => {
    const at = part.indexOf(':');
    const rawLabel = at >= 0 ? part.slice(0, at).trim() : '';
    const skus = (at >= 0 ? part.slice(at + 1) : part).split(/[/,\s]+/).map((s) => s.replace(/\D/g, '')).filter(Boolean);
    const solution = rawLabel.endsWith('*');
    return { label: rawLabel.replace(/\*$/, '').trim() || 'Accessory', skus, ...(solution ? { solution: true } : {}) };
  });
}

export function itemsText(items) {
  return (items ?? []).map((i) => `${i.label}${i.solution ? '*' : ''}: ${i.skus.join('/')}`).join('; ');
}

// ---------------------------------------------------------------------------
// What a cleaning solution is, and what it damages

const SOLUTION_WORDS = /SOLUCI|SPRAY|TOALLITA|LIMPIADOR|SACO MARAVILLOS|ANTIEMPA/i;

/**
 * A stock item or an extra that is (or carries) a lens-cleaning liquid. Contact
 * lens care (product codes 6006: ReNu, Simplus, eye drops) is not one — it
 * never touches the spectacle lenses, so it is read by its words, not its kind.
 */
export function isSolution(catalogue, code, description = '') {
  const inv = catalogue?.inventoryBySku?.get(String(code)) ?? catalogue?.listedOnlyBySku?.get(String(code));
  return SOLUTION_WORDS.test(description || inv?.description || '');
}

/** The filters a solution damages, by promo group: Transitions and Polarex. Coatings: every Crizal. */
const SENSITIVE_FILTERS = new Set(['TRANS', 'POLAR']);
export const SOLUTION_WARNING = 'cleaning solutions damage Crizal, Transitions and Polarex and void their warranty';

const SENSITIVE_NAMES = { TRANS: 'Transitions', POLAR: 'Polarex' };

/** A lens's filter and coating groups, read off the catalogue's vocabulary. */
function groupsOf(catalogue, lens) {
  const a = Object.fromEntries((lens?.attributes ?? []).map((x) => [x.key, x.code]));
  return {
    filter: catalogue?.meta('category', a.category)?.group ?? '',
    crizal: Boolean(catalogue?.codesInGroup('treatment', 'CRIZAL').has(a.treatment)),
  };
}

/** What on a lens a solution damages: `['Transitions', 'Crizal']`, or none. */
export function sensitiveParts(catalogue, lens) {
  if (!lens || lens.family === 'CL') return [];
  const g = groupsOf(catalogue, lens);
  const out = [];
  if (SENSITIVE_FILTERS.has(g.filter)) out.push(SENSITIVE_NAMES[g.filter]);
  if (g.crizal) out.push('Crizal');
  return out;
}

/** Crizal, Transitions or Polarex: the lenses a solution damages. */
export const solutionSensitive = (catalogue, lens) => sensitiveParts(catalogue, lens).length > 0;

/** The solution lines on an order that also carries Crizal, Transitions or Polarex — empty when there is no clash. */
export function solutionClash(order, catalogue) {
  if (!order.lines.some((l) => isPair(l) && solutionSensitive(catalogue, l.lens))) return [];
  return order.lines.filter((l) => l.kind === 'extra' && isSolution(catalogue, l.code, l.description));
}

/** The names a clash is about, once each: `Transitions and Crizal`. */
export function clashParts(order, catalogue) {
  const names = [...new Set(order.lines.filter(isPair).flatMap((l) => sensitiveParts(catalogue, l.lens)))];
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0] ?? '';
}

/** A Polarex lens with a Crizal coating: one the lab cannot make. */
export function polarexCrizal(catalogue, lens) {
  if (!lens || lens.family === 'CL') return false;
  const g = groupsOf(catalogue, lens);
  return isPolarexCrizal(g.filter, g.crizal ? 'CRIZAL' : '');
}

/** The pairs on an order that are Polarex with Crizal (saved before the rule, or found by search). */
export const polarexCrizalLines = (order, catalogue) => order.lines.filter((l) => isPair(l) && polarexCrizal(catalogue, l.lens));
export { POLAREX_CRIZAL };

// ---------------------------------------------------------------------------
// Presets as the app shows them

/** The flat rows grouped into presets, each with its tiers, in the order the data lists them. */
export function presetGroups(catalogue) {
  const groups = new Map();
  for (const t of catalogue?.presets ?? []) {
    if (!groups.has(t.presetId)) groups.set(t.presetId, { id: t.presetId, name: t.preset, blurb: t.blurb, tiers: [] });
    groups.get(t.presetId).tiers.push(t);
  }
  return [...groups.values()];
}

export const presetKey = (t) => `${t.presetId}|${t.tier}`;

/** A tier that names only a progressive lens. */
export const isProgressiveOnly = (t) => Boolean(t?.mf && !t?.sv);

/** A tier that names a contact lens: it puts that lens on for both eyes with its care. */
export const isContactTier = (t) => Boolean(t && !t.sv && !t.mf && t.cl);

/** A tier that names no lens: it adds its accessories (contact lens care) and nothing else. */
export const isCareOnly = (t) => Boolean(t && !t.sv && !t.mf && !t.cl);

/** FNV-1a: a small, steady number from a string. */
function hash(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h;
}

/**
 * One accessory of a tier: of its codes on hand at the first one's price, the
 * one this order lands on (weighted by stock, so shelves empty evenly). Without
 * a seed — or with nothing on hand — the first on hand, else the first known.
 */
function pickItem(catalogue, spec, seed) {
  // Stock counts drift between imports, so a count never drops an item.
  const known = spec.skus.map((s) => catalogue.inventoryBySku.get(s) ?? catalogue.listedOnlyBySku?.get(s)).filter(Boolean);
  const onHand = known.filter((i) => i.stock > 0);
  const first = onHand[0] ?? known[0] ?? null;
  if (!first || !seed || onHand.length < 2) return { first, known };
  const price = (i) => catalogue.itemPrice?.(i.sku) ?? null;
  const alike = onHand.filter((i) => price(i) === price(first));
  const total = alike.reduce((t, i) => t + i.stock, 0);
  let at = hash(`${seed}|${spec.label}`) % total;
  for (const i of alike) { if (at < i.stock) return { first: i, known }; at -= i.stock; }
  return { first, known };
}

/** A tier's extras and accessories, minus what would harm a `sensitive` lens. */
function addsOf(catalogue, tier, sensitive, seed) {
  const skipped = [];
  const extras = [];
  for (const id of tier.extras ?? []) {
    const e = catalogue.extras.find((x) => x.id === id);
    if (!e) { skipped.push({ label: id, why: 'not in the extras list' }); continue; }
    if (sensitive && isSolution(catalogue, e.id, e.description)) { skipped.push({ label: e.description, why: SOLUTION_WARNING }); continue; }
    extras.push(e);
  }
  const items = [];
  for (const spec of tier.items ?? []) {
    const { first: item, known } = pickItem(catalogue, spec, seed);
    const solution = spec.solution || known.some((i) => isSolution(catalogue, i.sku, i.description));
    if (sensitive && solution) { skipped.push({ label: spec.label, why: SOLUTION_WARNING }); continue; }
    if (!item) { skipped.push({ label: spec.label, why: 'not in the price list' }); continue; }
    // The price list's wording when it has the item: the stock report mangles a few (ReNu's ®).
    const description = catalogue.accessoriesBySku?.get(item.sku)?.description ?? item.description;
    items.push({ label: spec.label, sku: item.sku, description, stock: item.stock, solution, price: catalogue.itemPrice?.(item.sku) ?? null });
  }
  return { extras, items, skipped };
}

// ---------------------------------------------------------------------------
// What a lens costs the client with this frame

/**
 * The pair with its frame, as the order would price it: a set's row, an offer's
 * lens price, the frame's own price when the lens takes it out of its set. A
 * price still to confirm counts at the lens's list price, so it never looks free.
 */
function pairCost(catalogue, frame, lens, on, claimed) {
  const p = priceOrder(resolveOrder({ lines: [...(frame ? [frame] : []), pairLine(lens)], claimed }, catalogue, on));
  return p.total + p.pending.reduce((t, l) => t + (l.lens?.priceCents ?? 0), 0);
}

/** Contact lens parts a `cl` spec reads: material|product|colour. */
const CL_PARTS = ['material', 'product', 'colour'];
export function clMatches(spec, row) {
  return String(spec ?? '').split(';').map((s) => s.trim()).filter(Boolean).some((one) => {
    const parts = one.split('|').map((s) => s.trim());
    return CL_PARTS.every((key, i) => {
      let p = parts[i] ?? '*';
      const not = p.startsWith('!');
      if (not) p = p.slice(1);
      if (p === '*' || p === '') return !not;
      const hit = p.split(',').map((t) => t.trim()).includes(row[key]?.code);
      return not ? !hit : hit;
    });
  });
}

/** A contact lens tier: the lens for both eyes (one box each), its fitting started from the prescriptions. */
function resolveContact(catalogue, tier, rx, { seed, contactRx, on }) {
  const off = (why) => ({ tier, family: 'CL', lens: null, care: true, contact: true, why, extras: [], items: [], skipped: [], notes: [], brands: [] });
  const rows = catalogue.contact.filter((r) => r.available && r.price > 0 && clMatches(tier.cl, r));
  if (!rows.length) return off('Not in the catalogue right now.');
  // what a box costs after the campaign's discount on contacts (30% on Hydra Glyde)
  const box = (lens) => lens.priceCents - savingOf(autoDiscountFor(catalogue, { kind: 'lens', lens }, on), lens.priceCents);
  const pick = rows.map((row) => ({ row, lens: resolve(catalogue, row) })).map((x) => ({ ...x, box: box(x.lens) }))
    .sort((a, b) => a.box - b.box || a.row.price - b.row.price)[0];
  const fit = contactFit(pick.lens, catalogue);
  const hasRx = rx && !rxIsBlank(rx);
  const hasCl = contactRx && !contactIsBlank(contactRx);
  const add = Number(contactRx?.addition) > 0 || (hasRx && needsAddition(rx));
  if (fit === 'mf' && (hasRx || hasCl) && !add) return off('Multifocal — this prescription has no ADD.');
  const eyes = ['od', 'os'].map((side) => {
    const measures = fit ? startingFit(fit, side, contactRx, rx) : null;
    return { eye: side.toUpperCase(), fit, measures, power: fit ? fitText(fit, measures) : '' };
  });
  const adds = addsOf(catalogue, tier, false, seed);
  return { tier, family: 'CL', lens: pick.lens, care: true, contact: true, eyes, box: pick.box, sensitive: false, ...adds, notes: [], brands: [] };
}

/**
 * A tier read against the prescription and the frame: the lens it lands on (or
 * why none), the extras and the accessories it adds, and what it left out.
 * `seed` (the order's id) picks among an accessory's alternatives; `frame` (a
 * frame line, or null for the client's own) and `claimed` decide what the
 * client pays, and so which lens is the cheapest.
 */
export function resolvePreset(catalogue, tier, rx, { seed = null, frame = null, contactRx = null, claimed = [], on = new Date() } = {}) {
  if (isContactTier(tier)) return resolveContact(catalogue, tier, rx, { seed, contactRx, on });
  if (isCareOnly(tier)) {
    const adds = addsOf(catalogue, tier, false, seed);
    return { tier, family: 'CL', lens: null, care: true, sensitive: false, ...adds, notes: [], brands: [] };
  }
  const hasRx = rx && !rxIsBlank(rx);
  const wantsMf = Boolean(hasRx && needsAddition(rx));
  // A tier with a progressive and no single vision lens (the Progressive
  // preset) is progressive only: priced as one before the Rx is in, and off
  // for a prescription with no ADD.
  const mfOnly = isProgressiveOnly(tier);
  if (mfOnly && hasRx && !wantsMf) return { tier, lens: null, why: 'Progressive only — this prescription has no ADD.', extras: [], items: [], skipped: [], notes: [] };
  let family = (wantsMf || mfOnly) && tier.mf ? 'MF' : 'SV';
  const notes = [];
  if (wantsMf && !tier.mf) notes.push('No progressive version — single vision.');
  const spec = family === 'MF' ? tier.mf : tier.sv;
  if (!spec) return { tier, lens: null, why: 'No lens is named for this tier.', extras: [], items: [], skipped: [], notes };

  // Held rows (Polarex with Crizal) are not available, so they never match here.
  const rows = catalogue.rows(family).filter((r) => r.available && r.price > 0)
    .map((row) => ({ row, lens: resolve(catalogue, row) }))
    .filter(({ lens }) => factsMatch(catalogue, spec, lensFacts(lens)));
  if (!rows.length) return { tier, lens: null, why: 'Not in the catalogue right now.', extras: [], items: [], skipped: [], notes };

  // A strong prescription takes a high-index material when the tier has one.
  const high = Boolean(hasRx && strongestSphere(rx) > HIGH_RX_SPHERE);
  const isHigh = (r) => Boolean(r.row.material.highRx);
  let pool = rows.filter((r) => isHigh(r) === high);
  if (!pool.length) {
    pool = rows;
    if (high) notes.push('No high-index version — standard material.');
  }
  const pick = pool.map((r) => ({ ...r, cost: pairCost(catalogue, frame, r.lens, on, claimed) }))
    .sort((a, b) => a.cost - b.cost || a.row.price - b.row.price)[0];
  const lens = pick.lens;
  const sensitive = solutionSensitive(catalogue, lens);
  const { extras, items, skipped } = addsOf(catalogue, tier, sensitive, seed);
  return { tier, family, lens, high, sensitive, extras, items, skipped, notes, brands: tier.brands ?? [] };
}

/** A tier that can go on the order: a lens, or care with something to add. */
export const offers = (r) => Boolean(r && (r.lens || (r.care && !r.contact && r.items.length)));

/** The lines a tier puts on the order — the frame aside. */
export function tierLines(result) {
  const lines = [];
  if (result.contact && result.lens) for (const e of result.eyes) lines.push(lensLine(result.lens, e.eye, e.power, 1, e.measures ? { ...e.measures } : null, e.fit));
  else if (result.lens) lines.push(pairLine(result.lens));
  for (const e of result.extras ?? []) lines.push(extraLine(e.id, e.description, 1, null, e.percent));
  for (const i of result.items ?? []) lines.push(extraLine(i.sku, i.description, 1, i.stock));
  return lines;
}

/**
 * What a tier comes to with the frame in hand, priced the way the order prices
 * it. `total` is the frame and everything the tier adds; `lens` the pair (or
 * both boxes); `plus` Plus Protection. `outsideSet` names the set the lens
 * takes the frame out of; `setLens` the set row it falls under.
 */
export function tierPrice(catalogue, result, { frame = null, claimed = [], on = new Date() } = {}) {
  if (!offers(result)) return null;
  const withFrame = Boolean(frame) && !result.care;
  const lines = [...(withFrame ? [frame] : []), ...tierLines(result)];
  const p = priceOrder(resolveOrder({ lines, claimed }, catalogue, on));
  const net = (pred) => p.rows.filter((r) => pred(r.line)).reduce((t, r) => t + (r.net ?? 0), 0);
  const pair = p.rows.find((r) => r.line.kind === 'lens')?.line ?? null;
  return {
    total: p.total + p.pending.reduce((t, l) => t + (l.lens?.priceCents ?? 0), 0),
    withFrame,
    frame: withFrame ? net((l) => l.kind === 'frame') : 0,
    lens: net((l) => l.kind === 'lens'),
    plus: net((l) => l.kind === 'extra' && Number(l.percent) > 0),
    pending: p.pending.length > 0,
    setLens: pair?.setLens ?? null,
    outsideSet: pair?.outsideSet ?? null,
  };
}
