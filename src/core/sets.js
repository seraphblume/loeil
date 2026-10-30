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
//   discounts   percentages applied without asking (30% on contacts), a table
//               of lens prices (prescription Polarex in a sun frame: $2,099
//               with anti-scratch, $3,999 with anti-reflective…), and the ones
//               the client claims by showing something (a Sam's Club card). A
//               line takes one discount, never two. A discount can also list
//               the frames that participate, by SKU, each with its percentage
//               (frameSkus: { '20105189': 50 }, from the POS's report): a listed
//               frame outside a set takes it on its own, and one in a set
//               keeps the set unless the seller takes the frame out of it
//               (sets and these discounts do not combine). Without a list, a
//               discount can name sticker percentages (framePicks: [30, 50])
//               for the seller to pick on the frame.
//
// A MATCH reads `family|material|design|filter|colour|coating`. Each part is
// `*` (anything), a list of codes, or `*GROUP` for every code whose vocabulary
// promo group is GROUP; a leading `!` turns the part into "anything but".
// Several matches separate with `;`. A row with no match is chosen by hand.

import { brandKey, dayToDate, startOfDay } from './util.js';
import { resolveAlliance, applyAlliance, cfePair } from './alliances.js';
import { tr } from '../i18n.js';

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
  if (!entry.price) return tr('Included');
  return entry.special ? tr('Special price {price}', { price: money(entry.price) }) : money(entry.price);
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

/**
 * A participating frame's percentage under a discount that lists its SKUs
 * (`frameSkus: { '20105189': 50 }`), or null. The list is the POS's report of
 * the participating frames: a frame not on it takes nothing.
 */
export function frameSkuPercent(d, line) {
  if (line?.kind !== 'frame' || !d?.frameSkus) return null;
  const p = Number(d.frameSkus[String(line.sku ?? '').trim()]);
  return p > 0 && p <= 100 ? p : null;
}

/** What a line costs before any discount, for comparing what each discount saves. */
function listOf(line) {
  if (line.kind === 'lens') return line.lens?.priceCents ?? 0;
  return line.priceCents ?? 0;
}

// ---------------------------------------------------------------------------
// A discount's lens price table, one row per line: `MATCH = 2099`, or
// `MATCH = ?` for a lens the offer covers at a price not known yet. The first
// row that matches the lens wins.

export function parsePriceTable(text) {
  return String(text ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
    const at = l.lastIndexOf('=');
    const match = (at >= 0 ? l.slice(0, at) : l).trim().toUpperCase();
    const raw = at >= 0 ? l.slice(at + 1).trim() : '?';
    const n = Number(raw.replace(/[^0-9.]/g, ''));
    return { match, price: raw === '?' || raw === '' || !Number.isFinite(n) ? null : Math.round(n * 100) };
  }).filter((r) => r.match);
}

export function priceTableText(rows) {
  return (rows ?? []).map((r) => `${r.match} = ${r.price == null ? '?' : (r.price / 100).toFixed(2).replace(/\.00$/, '')}`).join('\n');
}

/**
 * What one discount does to a line, or null when it does not apply. A percent
 * (`percent`), or — from its lens price table — the lens's price under the
 * offer (`price`), or `pending` when the offer covers it at a price not known.
 *
 * `ctx.frame` is the frame the lens goes in (null: the client's own frame);
 * `ctx.claimed` the discounts the client has claimed on this order.
 */
function discountHit(catalogue, d, line, ctx) {
  if (d.requires && !ctx.claimed?.has(d.id)) return null;
  if (line.kind === 'frame' && d.frameSkus) {
    // A participating frame, by its SKU: its own percentage, outside a set (in
    // one it is the seller's choice — frameDeal). `except` still names brands.
    const percent = frameSkuPercent(d, line);
    if (percent == null || line.set) return null;
    const names = namesOf(catalogue, line);
    if (nameList(d.except).some((alts) => alts.some((k) => names.includes(k)))) return null;
    return { id: d.id, name: d.name, percent };
  }
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
  if (d.prices?.length) {
    // An offer priced lens by lens: the register reprices the lens line itself.
    const facts = isSpectacle ? lensFacts(line.lens) : null;
    const row = facts ? d.prices.find((p) => factsMatch(catalogue, p.match, facts)) : null;
    if (!row) return null;
    return row.price != null ? { ...base, price: row.price } : { ...base, pending: true };
  }
  return { ...base, percent: d.percent };
}

/** What a discount takes off a list price; a price still to confirm saves nothing yet. */
export function savingOf(hit, list) {
  if (!hit || hit.pending || list == null) return 0;
  if (hit.price != null) return Math.max(0, list - hit.price);
  return Math.round((list * (hit.percent ?? 0)) / 100);
}

/** `30% off`, `$3,999 the pair`, `price to confirm` — for the screens. */
export function hitText(hit, money) {
  if (!hit) return '';
  if (hit.pending) return tr('price to confirm');
  if (hit.price != null) return tr('{price} the pair', { price: money(hit.price) });
  return tr('{n}% off', { n: hit.percent });
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
  // A discount that only offers sticker picks takes nothing off on its own; a list of frame SKUs does.
  const live = liveDiscounts(catalogue, on).filter((d) => d.prices?.length || d.percent > 0 || d.frameSkus);
  if (!live.length) return null;
  const hits = live.map((d) => ({ d, hit: discountHit(catalogue, d, line, ctx) })).filter((x) => x.hit);
  if (!hits.length) return null;
  const list = listOf(line);
  const best = (xs) => xs.sort((a, b) => savingOf(b.hit, list) - savingOf(a.hit, list))[0]?.hit ?? null;
  return best(hits.filter((x) => !x.d.requires)) ?? best(hits.filter((x) => x.d.requires));
}

/**
 * What a participating frame can take, as the campaign's stickers say: one
 * choice per percentage — `{ id: '9009', name: 'Pre Buen Fin', percent: 50 }`.
 * Ophthalmic or sun; a frame in a set leaves it when one is picked (sets and
 * these discounts do not combine). Brands the discount excludes (`except`) get none.
 * A discount that lists its frames by SKU offers no stickers: the list decides (frameDeal).
 */
export function framePicks(catalogue, line, on = new Date()) {
  if (line?.kind !== 'frame') return [];
  const names = namesOf(catalogue, line);
  const listed = (text) => nameList(text).some((alts) => alts.some((k) => names.includes(k)));
  return liveDiscounts(catalogue, on)
    .filter((d) => d.framePicks?.length && !d.frameSkus && !d.requires)
    .filter((d) => !listed(d.except))
    .flatMap((d) => d.framePicks.map((percent) => ({ id: d.id, name: d.name, percent })));
}

/**
 * The live discount a frame participates in by its SKU, with its percentage —
 * `{ id: '9009', name: 'Pre Buen Fin', percent: 50 }` — whether or not the
 * frame is in a set right now; null when its SKU is on no list. With two, the
 * larger percentage.
 */
export function frameDeal(catalogue, line, on = new Date()) {
  if (line?.kind !== 'frame' || !line.sku) return null;
  const names = namesOf(catalogue, line);
  const deals = liveDiscounts(catalogue, on)
    .filter((d) => d.frameSkus && !d.requires)
    .filter((d) => !nameList(d.except).some((alts) => alts.some((k) => names.includes(k))))
    .map((d) => ({ id: d.id, name: d.name, percent: frameSkuPercent(d, line) }))
    .filter((x) => x.percent != null)
    .sort((a, b) => b.percent - a.percent);
  return deals[0] ?? null;
}

/** `{ '20105189': 50, … }` → `95 at 50% · 90 at 30%`, largest first — for the screens. */
export function frameSkusSummary(frameSkus, t = tr) {
  const by = new Map();
  for (const p of Object.values(frameSkus ?? {})) by.set(p, (by.get(p) ?? 0) + 1);
  return [...by.entries()].sort((a, b) => b[0] - a[0]).map(([p, n]) => t('{n} at {p}%', { n, p })).join(' · ');
}

/**
 * The POS's report of participating frames — `SKU_SAP` and `DESCUENTO_APLICADO`
 * ("Descuento del %50"), saved as an .xls that is really an HTML table, or as
 * rows already read from a workbook — → `{ '20105189': 50, … }`. Rows without
 * an 8-digit SKU or a percentage are left out and counted.
 */
export function parseFrameSkuReport(input) {
  let rows = input;
  if (typeof input === 'string') {
    const cells = (row) => [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((m) => m[1].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').trim());
    const trs = [...input.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) => cells(m[1]));
    const head = trs.findIndex((r) => r.some((c) => /^sku[_ ]?sap$/i.test(c)));
    if (head < 0) return null;
    const keys = trs[head].map((c) => c.toLowerCase().replace(/\s+/g, '_'));
    rows = trs.slice(head + 1).map((r) => Object.fromEntries(keys.map((k, i) => [k, r[i] ?? ''])));
  }
  if (!Array.isArray(rows) || !rows.length || !('sku_sap' in rows[0])) return null;
  const out = {};
  let skipped = 0;
  for (const r of rows) {
    if (Object.values(r).some((v) => /^total:?$/i.test(String(v).trim()))) continue; // the report's count, not a frame
    const sku = String(r.sku_sap ?? '').replace(/\D/g, '');
    const pct = Number((String(r.descuento_aplicado ?? r.descuento ?? '').match(/(\d+(?:\.\d+)?)/) ?? [])[1]);
    if (sku.length !== 8 || !(pct > 0 && pct <= 100)) { if (sku || r.descuento_aplicado) skipped++; continue; }
    out[sku] = pct;
  }
  return { frameSkus: out, skipped };
}

/** `20105189 = 50` per line ↔ `{ '20105189': 50 }`, for the editor and the workbooks. */
export function frameSkusText(frameSkus, sep = '\n') {
  return Object.entries(frameSkus ?? {}).map(([sku, p]) => `${sku} = ${p}`).join(sep);
}
export function parseFrameSkusText(text) {
  const out = {};
  for (const part of String(text ?? '').split(/[\n;]+/)) {
    const m = part.match(/(\d{8})\D+(\d+(?:\.\d+)?)/);
    if (m && Number(m[2]) > 0 && Number(m[2]) <= 100) out[m[1]] = Number(m[2]);
  }
  return out;
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
  // An alliance that does not combine prices the order without sets or campaign discounts (core/alliances.js).
  const ally = resolveAlliance(order, catalogue);
  const promos = !ally || ally.combines;
  const lines = order.lines.map((l) => {
    const c = { ...l };
    delete c.set; delete c.setLens; delete c.auto; delete c.offer; delete c.setAvailable; delete c.hasLenses; delete c.setExcluded; delete c.outsideSet; delete c.ally;
    // an accessory takes its price from the price list (a saved order keeps the one it had)
    if (c.kind === 'extra' && !(Number(c.percent) > 0) && c.priceCents === undefined) c.priceCents = catalogue.itemPrice?.(c.code) ?? null;
    return c;
  });
  const frames = lines.filter((l) => l.kind === 'frame');
  const pairs = lines.filter((l) => l.kind === 'lens' && l.lens.family !== 'CL');
  const voucher = cfePair(ally, lines); // a CFE voucher prices its lens itself, so that pair and its frame stay out of a set
  frames.forEach((f, i) => {
    if (!promos) return;
    const named = f.setId ? catalogue.setsById?.get(f.setId) : null;
    const set = (named && isCurrent(named, on) ? named : null) ?? setForFrame(catalogue, frameFacts(catalogue, f), on);
    const lens = pairs[i];
    if (lens) f.hasLenses = true;
    if (!set) return;
    f.setAvailable = { id: set.id, name: set.name, price: set.price };
    if (f.noSet || (voucher && lens === voucher)) return;
    if (!lens) { f.set = f.setAvailable; return; }
    const chosen = lens.setLensId ? { def: catalogue.setLensesById.get(lens.setLensId), entry: priceIn(catalogue, set.id, lens.setLensId) } : null;
    const hit = chosen?.def && chosen.entry ? chosen : setLensFor(catalogue, set, lens.lens);
    if (!hit) {
      // A lens the set's table does not name: no plan at all — the frame at its
      // full price and the lens at its own. A row can still be chosen by hand (a tint).
      f.setExcluded = { id: set.id, name: set.name, price: set.price };
      lens.outsideSet = { setId: set.id, setName: set.name };
      return;
    }
    f.set = f.setAvailable;
    lens.setLens = { setId: set.id, setName: set.name, id: hit.def.id, name: hit.def.name, group: hit.def.group, price: hit.entry.price, special: Boolean(hit.entry.special), auto: hit !== chosen };
  });
  const claimed = new Set(order.claimed ?? []);
  for (const l of promos ? lines : []) {
    const pair = pairs.indexOf(l);
    const ctx = { claimed, ...(pair >= 0 ? { frame: frames[pair] ?? null } : {}) };
    const d = autoDiscountFor(catalogue, l, on, ctx);
    if (!d) continue;
    l.offer = d; // what applies without the seller — shown even when he chose otherwise
    if (typeof l.discount !== 'number') l.auto = d;
  }
  applyAlliance(ally, lines);
  const out = { ...order, lines };
  if (ally) out.ally = ally; else delete out.ally;
  return out;
}

/** Promotion numbers the register needs for this order, in order of appearance. */
export function promoNumbers(order) {
  const out = new Map();
  for (const l of order.lines) {
    if (l.set) out.set(l.set.id, l.set.name);
    if (l.ally?.packaged) out.set(l.ally.convenio, l.ally.name);
    if (l.auto && typeof l.discount !== 'number') out.set(l.auto.id, l.auto.name);
    if (l.promo && typeof l.discount === 'number' && l.discount > 0) out.set(l.promo.id, l.promo.name); // a frame's sticker
  }
  return [...out.entries()].map(([id, name]) => ({ id, name }));
}
