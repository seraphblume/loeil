// Sets: the campaign's frame-and-lens packages, and the arithmetic they make simple.
//
// A set is a price for an ophthalmic frame of a participating brand together
// with single vision lenses (Set $1,999, ID Maestro 19990). Better lenses cost a
// fixed amount on top, read off the set's table: Transitions with Crizal in Set
// $1,999 is $1,999 + $5,099. With a frame from the set, that IS the price; Plus
// Protection, if he adds it, is worked out on it.
//
// ALL OF IT IS DATA, published with the catalogue:
//   sets        id (the ID Maestro), name, price, dates, participating brands
//   setLenses   the table's rows — "Transitions Crizal Easy" — and which
//               catalogue lenses each row covers (its match)
//   setPrices   what each row costs in each set (0 = included)
//   discounts   percentages applied without asking (30% on contacts), a fixed
//               lens price (prescription Polarex in a sun frame for $2,099), and
//               the ones the client claims by showing something (a Sam's Club
//               card). A line takes one discount, never two.
//
// A MATCH reads `family|material|design|filter|colour|coating`. Each part is
// `*` (anything), a list of codes, or `*GROUP` for every code whose vocabulary
// promo group is GROUP; a leading `!` turns the part into "anything but".
// Several matches separate with `;`. A row with no match is chosen by hand.

import { brandKey, dayToDate, startOfDay } from './util.js';

export const SET_GROUPS = ['Single vision', 'Progressive (poly)', 'Varilux Comfort', 'Varilux Physio'];

export const APPLIES_TO = {
  contacts: 'Contact lenses',
  sunglasses: 'Sunglasses frames',
  frames: 'Every frame outside a set',
  lenses: 'Spectacle lenses outside a set',
  ownframe: 'Spectacle lenses for the client’s own frame',
  sunlenses: 'Spectacle lenses in a sunglasses frame',
  all: 'Every line outside a set',
};

const SEGMENTS = ['family', 'material', 'design', 'filter', 'colour', 'coating'];
const KIND = { material: 'material', design: 'design', filter: 'category', colour: 'colour', coating: 'treatment' };

/** Inclusive days; an unreadable date counts as open. */
export function isCurrent(x, on = new Date()) {
  const day = startOfDay(on);
  const from = dayToDate(x.validFrom);
  const to = dayToDate(x.validTo);
  return !(from && day < from) && !(to && day > to);
}

export function setStatus(x, on = new Date()) {
  const day = startOfDay(on);
  const to = dayToDate(x.validTo);
  const from = dayToDate(x.validFrom);
  if (to && day > to) return 'Ended';
  if (from && day < from) return 'Upcoming';
  return 'Live';
}

// ---------------------------------------------------------------------------
// Matching a lens to a row of the table

export function parseMatch(text) {
  return String(text ?? '').split(';').map((k) => k.trim()).filter(Boolean).map((k) => {
    const parts = k.split('|').map((s) => s.trim());
    const out = {};
    SEGMENTS.forEach((seg, i) => {
      let p = parts[i] ?? '*';
      const not = p.startsWith('!');
      if (not) p = p.slice(1);
      out[seg] = { not, any: p === '*' || p === '', tokens: p.split(',').map((t) => t.trim()).filter(Boolean) };
    });
    out.extra = parts.length > SEGMENTS.length;
    return out;
  });
}

/** The parts of a lens a match reads, from a resolved lens (an order line keeps one). */
export function lensFacts(lens) {
  if (!lens || lens.family === 'CL') return null;
  const a = Object.fromEntries((lens.attributes ?? []).map((x) => [x.key, x.code]));
  return { family: lens.family === 'SV' ? 'SV' : a.type, material: a.material, design: a.design, filter: a.category, colour: a.colour, coating: a.treatment };
}

function partMatches(catalogue, seg, part, value) {
  if (part.any) return !part.not;
  const hit = part.tokens.some((t) => (t.startsWith('*') && seg !== 'family'
    ? catalogue.codesInGroup(KIND[seg], t.slice(1)).has(value)
    : t === value));
  return part.not ? !hit : hit;
}

export function factsMatch(catalogue, match, facts) {
  if (!facts) return false;
  return parseMatch(match).some((m) => SEGMENTS.every((seg) => partMatches(catalogue, seg, m[seg], facts[seg])));
}

/** How many catalogue lenses a row's match covers — shown in the editor. */
export function matchCount(catalogue, match, resolveRow) {
  if (!String(match ?? '').trim()) return 0;
  return [...catalogue.single, ...catalogue.multifocal].filter((r) => factsMatch(catalogue, match, lensFacts(resolveRow(r)))).length;
}

// ---------------------------------------------------------------------------
// Sets, brands and rows

/** `Ray-Ban Kids / Ray-Ban Junior, Miraflex` → [['raybankids','raybanjunior'], ['miraflex']]. */
export function brandAlternatives(set) {
  return String(set.brands ?? '').split(',').map((b) => b.split('/').map(brandKey).filter(Boolean)).filter((a) => a.length);
}

export function liveSets(catalogue, on = new Date()) {
  return catalogue.sets.filter((s) => isCurrent(s, on));
}

/**
 * The set a frame belongs to, or null. A catalogue frame is matched on its
 * brand exactly (so Ray-Ban Meta does not fall into the Ray-Ban set); a frame
 * known only from stock is matched on the longest brand its description
 * starts with (LINK FLEXKIDS before LINK). Sets are for ophthalmic frames.
 */
export function setForFrame(catalogue, frame, on = new Date()) {
  if (!frame || frame.category === 'Sunglasses') return null;
  const sets = liveSets(catalogue, on);
  if (!sets.length) return null;
  if (frame.brand) {
    const k = brandKey(frame.brand);
    return sets.find((s) => brandAlternatives(s).some((alts) => alts.includes(k))) ?? null;
  }
  const d = brandKey(frame.description);
  let best = null;
  let bestLength = 0;
  for (const s of sets) {
    for (const alts of brandAlternatives(s)) for (const k of alts) if (d.startsWith(k) && k.length > bestLength) { best = s; bestLength = k.length; }
  }
  return best;
}

/** What one row costs in one set, or null when the set does not offer it. */
export function priceIn(catalogue, setId, lensId) {
  return catalogue.setPricesBySet.get(setId)?.get(lensId) ?? null;
}

/** The set's table: its rows in order, each with its price in this set. */
export function setTable(catalogue, set) {
  return catalogue.setLenses
    .map((def) => ({ def, entry: priceIn(catalogue, set.id, def.id) }))
    .filter((r) => r.entry);
}

/** The row of a set's table a lens falls under, or null. */
export function setLensFor(catalogue, set, lens) {
  const facts = lensFacts(lens);
  if (!facts) return null;
  return setTable(catalogue, set).find((r) => factsMatch(catalogue, r.def.match, facts)) ?? null;
}

/** "Included", "Special price $1,100", or the amount — for any money formatter. */
export function rowPriceText(entry, money) {
  if (!entry.price) return 'Included';
  return entry.special ? `Special price ${money(entry.price)}` : money(entry.price);
}

// ---------------------------------------------------------------------------
// Campaign discounts applied without asking

export function liveDiscounts(catalogue, on = new Date()) {
  return catalogue.discounts.filter((d) => isCurrent(d, on));
}

/** The frame facts a set or a discount needs, from an order line or a frame. */
export function frameFacts(catalogue, line) {
  const known = catalogue.framesBySku.get(line.sku);
  return {
    brand: known?.brand ?? line.brand ?? '',
    description: line.description ?? known?.description ?? '',
    category: known?.category ?? line.category ?? '',
  };
}

/** `Maui Jim, Ray-Ban Meta / RB Meta` → [['mauijim'], ['raybanmeta', 'rbmeta']]. */
const nameList = (text) => String(text ?? '').split(',').map((x) => x.split('/').map(brandKey).filter(Boolean)).filter((a) => a.length);

/** The names a line answers to in a discount's only/except lists: a frame's brand, a contact lens's product. */
function namesOf(catalogue, line) {
  if (line.kind === 'frame') return [brandKey(frameFacts(catalogue, line).brand)].filter(Boolean);
  const p = (line.lens?.attributes ?? []).find((a) => a.key === 'product');
  return p ? [p.code, p.label, p.pos].map(brandKey).filter(Boolean) : [];
}

/** What a line costs before any discount, for comparing what each discount saves. */
function listOf(line) {
  if (line.kind === 'lens') return line.lens?.priceCents ?? 0;
  return line.priceCents ?? 0;
}

/**
 * What one discount does to a line, or null when it does not apply. A percent
 * (`percent`), a fixed price (`price`), or — for a lens the offer counts as an
 * upgrade whose price is not known yet — `pending`.
 *
 * `ctx.frame` is the frame the lens goes in (null: the client's own frame);
 * `ctx.claimed` the discounts the client has claimed on this order.
 */
function discountHit(catalogue, d, line, ctx) {
  if (d.requires && !ctx.claimed?.has(d.id)) return null;
  const isContact = line.kind === 'lens' && line.lens?.family === 'CL';
  const isSpectacle = line.kind === 'lens' && !isContact;
  const isFrame = line.kind === 'frame';
  const isShare = line.kind === 'extra' && Number(line.percent) > 0; // Plus Protection, priced from the list
  const isItem = line.kind === 'extra' && !isShare && line.priceCents > 1; // a $0.01 gift stays a gift
  const sunFrame = (f) => Boolean(f) && frameFacts(catalogue, f).category === 'Sunglasses';
  const fits = ({
    contacts: isContact,
    sunglasses: isFrame && sunFrame(line) && !line.set && !line.hasLenses,
    frames: isFrame && !line.set,
    lenses: isSpectacle && !line.setLens,
    ownframe: isSpectacle && 'frame' in ctx && !ctx.frame,
    sunlenses: isSpectacle && sunFrame(ctx.frame) && !line.setLens,
    all: (isFrame && !line.set) || (isSpectacle && !line.setLens) || isContact || isItem || isShare,
  })[d.appliesTo];
  if (!fits) return null;
  const names = namesOf(catalogue, line);
  const listed = (text) => nameList(text).some((alts) => alts.some((k) => names.includes(k)));
  if (String(d.only ?? '').trim() && !listed(d.only)) return null;
  if (listed(d.except)) return null;
  const base = { id: d.id, name: d.name };
  if (d.lens) {
    // An offer for a particular lens: that lens at its price, an upgrade on top.
    const facts = isSpectacle ? lensFacts(line.lens) : null;
    if (!facts) return null;
    const at = (price) => (price != null ? { ...base, price } : { ...base, percent: d.percent });
    if (factsMatch(catalogue, d.lens, facts)) return at(d.price);
    if (!d.upgrade || !factsMatch(catalogue, d.upgrade, facts)) return null;
    if (d.price == null) return { ...base, percent: d.percent, upgrade: true };
    return d.upgradePrice != null ? { ...base, price: d.price + d.upgradePrice, upgrade: true } : { ...base, pending: true, upgrade: true };
  }
  return d.price != null ? { ...base, price: d.price } : { ...base, percent: d.percent };
}

/** What a discount takes off a list price; a pending upgrade saves nothing yet. */
export function savingOf(hit, list) {
  if (!hit || hit.pending || list == null) return 0;
  if (hit.price != null) return Math.max(0, list - hit.price);
  return Math.round((list * (hit.percent ?? 0)) / 100);
}

/** `30% off`, `$2,099`, `upgrade, price to confirm` — for the screens. */
export function hitText(hit, money) {
  if (!hit) return '';
  if (hit.pending) return 'upgrade, price to confirm';
  if (hit.price != null) return `${money(hit.price)}${hit.upgrade ? ' with the upgrade' : ''}`;
  return `${hit.percent}% off`;
}

/**
 * The discount that applies to a line, if any. Those that apply on their own
 * come first — a set, a campaign percentage, a fixed lens price — and a
 * discount the client claims (a membership card) covers only what they leave.
 * One per line, never stacked; among equals, the one that saves the client most.
 *
 * A sunglasses discount is for the frame sold as it is: with lenses on it, the
 * prescription-sun offer is the one that applies. `only` and `except` name
 * brands (frames) or products (contact lenses), as the campaign states them.
 */
export function autoDiscountFor(catalogue, line, on = new Date(), ctx = {}) {
  const live = liveDiscounts(catalogue, on);
  if (!live.length) return null;
  const hits = live.map((d) => ({ d, hit: discountHit(catalogue, d, line, ctx) })).filter((x) => x.hit);
  if (!hits.length) return null;
  const list = listOf(line);
  const best = (xs) => xs.sort((a, b) => savingOf(b.hit, list) - savingOf(a.hit, list))[0]?.hit ?? null;
  return best(hits.filter((x) => !x.d.requires)) ?? best(hits.filter((x) => x.d.requires));
}

/** The live discounts the client claims by showing something: Sam's Club. */
export function claimableDiscounts(catalogue, on = new Date()) {
  return liveDiscounts(catalogue, on).filter((d) => d.requires);
}

// ---------------------------------------------------------------------------
// An order, read against the campaign

/**
 * The order with every line told what the campaign does to it: which set a
 * frame is in and which row its lenses fall under, and which discounts apply
 * on their own. Pure; the draft is resolved on every render and a saved order
 * keeps what was resolved when it was saved, so a campaign ending later does
 * not reprice a sale.
 *
 * The k-th frame on the order goes with the k-th pair of spectacle lenses.
 */
export function resolveOrder(order, catalogue, on = new Date()) {
  const lines = order.lines.map((l) => {
    const c = { ...l };
    delete c.set; delete c.setLens; delete c.auto; delete c.offer; delete c.setAvailable; delete c.hasLenses;
    // an accessory takes its price from the price list (a saved order keeps the one it had)
    if (c.kind === 'extra' && !(Number(c.percent) > 0) && c.priceCents === undefined) c.priceCents = catalogue.itemPrice?.(c.code) ?? null;
    return c;
  });
  const frames = lines.filter((l) => l.kind === 'frame');
  const pairs = lines.filter((l) => l.kind === 'lens' && l.lens.family !== 'CL');
  frames.forEach((f, i) => {
    const named = f.setId ? catalogue.setsById?.get(f.setId) : null;
    const set = (named && isCurrent(named, on) ? named : null) ?? setForFrame(catalogue, frameFacts(catalogue, f), on);
    const lens = pairs[i];
    if (lens) f.hasLenses = true;
    if (!set) return;
    f.setAvailable = { id: set.id, name: set.name, price: set.price };
    if (f.noSet) return;
    f.set = f.setAvailable;
    if (!lens) return;
    const chosen = lens.setLensId ? { def: catalogue.setLensesById.get(lens.setLensId), entry: priceIn(catalogue, set.id, lens.setLensId) } : null;
    const hit = chosen?.def && chosen.entry ? chosen : setLensFor(catalogue, set, lens.lens);
    lens.setLens = hit
      ? { setId: set.id, setName: set.name, id: hit.def.id, name: hit.def.name, group: hit.def.group, price: hit.entry.price, special: Boolean(hit.entry.special), auto: hit !== chosen }
      : { setId: set.id, setName: set.name, id: null };
  });
  const claimed = new Set(order.claimed ?? []);
  for (const l of lines) {
    const pair = pairs.indexOf(l);
    const ctx = { claimed, ...(pair >= 0 ? { frame: frames[pair] ?? null } : {}) };
    const d = autoDiscountFor(catalogue, l, on, ctx);
    if (!d) continue;
    l.offer = d; // what applies without the seller — shown even when he chose otherwise
    if (typeof l.discount !== 'number') l.auto = d;
  }
  return { ...order, lines };
}

/** Promotion numbers the register needs for this order, in order of appearance. */
export function promoNumbers(order) {
  const out = new Map();
  for (const l of order.lines) {
    if (l.set) out.set(l.set.id, l.set.name);
    if (l.auto && typeof l.discount !== 'number') out.set(l.auto.id, l.auto.name);
  }
  return [...out.entries()].map(([id, name]) => ({ id, name }));
}
