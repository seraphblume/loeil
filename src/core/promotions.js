// Which promotions a lens qualifies for, and the number to type.
//
// It does not apply a discount and does not compute a discounted total. The
// register does the arithmetic; a second opinion from a phone that is wrong by
// ten pesos is worse than no opinion at all.
//
// THE MATCH KEY IS DELIBERATELY COARSER THAN A CATALOGUE ROW:
// `family|material_family|design|colour_family|coating`. The chain's promo table
// never names a specific Transitions colour or poly code, so one promo line
// legitimately matches many lenses.
//
// THE FAMILIES ARE DATA. Which material is POLY or CR39, which filter is TRANS,
// which coatings a `*CRIZAL` line accepts, and which two codes are the same
// coating under old and new names — all of that is the `promo_group` and
// `same_as` columns of the vocabulary tab. A new Crizal coating joins `*CRIZAL`
// the moment its vocabulary row says CRIZAL.
//
// CONDITIONS ARE TEXT, NOT LOGIC. `brand_in: Ray Ban`, `min_boxes: 4` are
// displayed, never parsed into rules. A wrong automatic exclusion costs a
// customer a discount; a line of text costs him one second to read.

import { dayToDate, startOfDay } from './util.js';

export const ANY = '*ANY';

/** The key a lens row is matched with, or null when it has none. */
export function promoKeyFor(catalogue, row) {
  if (row.family === 'CL') return null; // contact-lens offers are brand and quantity deals
  const material = row.material.group;
  const colour = row.category.group;
  if (!material || !colour) return null;
  return {
    family: row.family === 'SV' ? 'SV' : row.type.code,
    materialFamily: material,
    design: row.design.code,
    colourFamily: colour,
    coating: row.treatment.code,
  };
}

export function parseKey(raw) {
  const p = String(raw).split('|');
  return { family: p[0] ?? '', materialFamily: p[1] ?? '', design: p[2] ?? '', colourFamily: p[3] ?? '', coating: p[4] ?? '' };
}

/** Which vocabulary kind a wildcard on each segment refers to. */
const SEGMENT_KIND = { family: 'lens_type', materialFamily: 'material', design: 'design', colourFamily: 'category', coating: 'treatment' };

function segmentMatches(catalogue, seg, promo, lens) {
  if (promo === ANY) return true;
  if (promo.startsWith('*')) {
    // `*CRIZAL` → any code whose vocabulary promo_group is CRIZAL.
    return catalogue.codesInGroup(SEGMENT_KIND[seg], promo.slice(1)).has(lens);
  }
  return promo === lens;
}

export function keyMatches(catalogue, promoKey, lensKey) {
  return Object.keys(SEGMENT_KIND).every((seg) => segmentMatches(catalogue, seg, promoKey[seg], lensKey[seg]));
}

/** `valid_from`/`valid_to` are inclusive days. An unreadable date counts as live. */
export function isLive(promo, on = new Date()) {
  const day = startOfDay(on);
  const from = dayToDate(promo.validFrom);
  const to = dayToDate(promo.validTo);
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}

/** `$999`, `$1,299` — whole pesos written into promotion text. */
export function pesosIn(text) {
  return [...String(text ?? '').matchAll(/\$\s?([\d,]+)/g)].map((m) => Number(m[1].replace(/,/g, ''))).filter(Number.isFinite);
}

const inPackage = (promo, pkg) => promo.conditions.includes(`package: ${pkg}`);

/** The lowest figure written anywhere in a package is its entry price. Never guessed. */
export function entryPriceCents(catalogue, pkg) {
  const figures = catalogue.promotions.filter((p) => inPackage(p, pkg)).flatMap((p) => [...pesosIn(p.notes), ...pesosIn(p.name)]);
  return figures.length ? Math.min(...figures) * 100 : null;
}

export function conditionsOf(promo) {
  return promo.conditions.split(';').map((s) => s.trim()).filter(Boolean);
}

function packagesMatching(catalogue, key, on) {
  const lines = catalogue.promoLensMap.filter((l) => keyMatches(catalogue, parseKey(l.matchKey), key));
  const byPackage = new Map();
  for (const line of lines) {
    const promo = catalogue.promotionsById.get(line.promoId);
    if (!promo || !isLive(promo, on)) continue;
    if (!byPackage.has(line.package)) byPackage.set(line.package, []);
    byPackage.get(line.package).push({ promo, line });
  }
  const packages = [...byPackage.entries()].map(([pkg, hits]) => {
    // Several lines can land on one package through different wildcards. The
    // lowest promo number is the entry tier of those that matched.
    hits.sort((a, b) => a.promo.id.localeCompare(b.promo.id, undefined, { numeric: true }));
    const winner = hits[0].promo;
    return {
      id: pkg + '|' + winner.id,
      package: pkg,
      promo: winner,
      matchedLines: hits.map((h) => h.line),
      entryPriceCents: entryPriceCents(catalogue, pkg),
      siblings: catalogue.promotions.filter((p) => inPackage(p, pkg) && p.id !== winner.id),
      conditions: conditionsOf(winner),
    };
  });
  // Cheapest entry first — the best deal for the customer. Unpriced packages last.
  return packages.sort((a, b) => {
    if (a.entryPriceCents == null && b.entryPriceCents == null) return a.package.localeCompare(b.package);
    if (a.entryPriceCents == null) return 1;
    if (b.entryPriceCents == null) return -1;
    return a.entryPriceCents - b.entryPriceCents || a.package.localeCompare(b.package);
  });
}

/**
 * Everything the lens screen needs to say about promotions.
 * `counterparts` are matches found only by swapping a coating for its `same_as`
 * code (CZS ↔ CZN). Shown separately and labelled — never counted as applying.
 */
export function eligibility(catalogue, lens, on = new Date()) {
  const key = lens.promoKey;
  if (!key) {
    return {
      packages: [], counterparts: [],
      explanation: lens.family === 'CL'
        ? 'The promo table covers spectacle lenses only. Contact-lens offers are brand and quantity deals — check the promotions list.'
        : 'This lens has no promo family in the vocabulary, so nothing can be matched against it.',
    };
  }
  const packages = packagesMatching(catalogue, key, on);
  let counterparts = [];
  const other = counterpartCode(catalogue, key.coating);
  if (other) {
    const found = new Set(packages.map((p) => p.id));
    counterparts = packagesMatching(catalogue, { ...key, coating: other }, on).filter((p) => !found.has(p.id));
  }
  let explanation = null;
  if (!packages.length && !counterparts.length) {
    const ever = catalogue.promoLensMap.some((l) => keyMatches(catalogue, parseKey(l.matchKey), key));
    explanation = ever
      ? 'No promotions apply today. This lens is in the promo table, but every campaign covering it has ended.'
      : 'No promotions apply. Nothing in the current promo table covers this combination.';
  }
  return { packages, counterparts, counterpartCode: other, explanation };
}

/** The other code for the same coating, from `same_as` in either direction. */
export function counterpartCode(catalogue, coating) {
  const own = catalogue.meta('treatment', coating)?.sameAs;
  if (own) return own;
  for (const [code, v] of catalogue.vocab.get('treatment') ?? []) if (v.sameAs === coating) return code;
  return null;
}

/** Promo lines naming a design or coating no lens row has — they can never match. */
export function unmatchableLines(catalogue) {
  const designs = new Set();
  const coatings = new Set();
  for (const r of [...catalogue.single, ...catalogue.multifocal]) { designs.add(r.design.code); coatings.add(r.treatment.code); }
  return catalogue.promoLensMap.filter((l) => {
    const k = parseKey(l.matchKey);
    return (!k.design.startsWith('*') && !designs.has(k.design)) || (!k.coating.startsWith('*') && !coatings.has(k.coating));
  });
}

export function livePromotions(catalogue, on = new Date()) {
  return catalogue.promotions.filter((p) => isLive(p, on));
}
