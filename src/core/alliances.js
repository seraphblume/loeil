// Alliances: insurers and employers whose members get glasses as a benefit —
// Seguros Centauro, Dentegra, Dentalia-Mapfre, CFE. Like Sam's Club, the seller
// switches one on for the order; unlike it, the payer covers up to an amount
// and the client pays a copay plus whatever is left.
//
// ALL OF IT IS DATA, published with the catalogue (`bundle.alliances`), money
// in centavos:
//   alliance   name, whether it combines with sets and promotions, and the
//              paperwork: how to authorize, what to collect, what is signed,
//              what goes to Billing, what the register needs
//   plan       the benefit (glasses; contact lenses when different), the copay,
//              the packages it covers (each a convenio), the percentage off
//              anything outside them, and what sunglasses and other contact
//              lenses take
//
// AN ORDER UNDER AN ALLIANCE is priced one of two ways:
//   package     the plan's own package (a frame up to an amount with the
//               plan's lenses, or its contact lenses): the payer covers it, the
//               client pays the copay and any surcharge (a 2nd series)
//   own choice  anything else: every line at the plan's percentage off its
//               list price, the benefit paid towards the frame and lenses (or
//               the contact lenses), the client pays the copay and the rest
// Lines outside the package always take the outside-the-plan percentage.
// An alliance that does not combine prices the order without sets or
// campaign discounts — and without the seller's own line discount.
//
// The selection lives on the order (`order.alliance`); resolving the order
// against the catalogue adds a snapshot (`order.ally`) that pricing reads, so
// a saved order keeps the terms it was sold under.

import { money } from './money.js';

const isPairLine = (l) => l.kind === 'lens' && l.lens?.family !== 'CL';
const isContactLine = (l) => l.kind === 'lens' && l.lens?.family === 'CL';
const isShareLine = (l) => l.kind === 'extra' && Number(l.percent) > 0;
const isSunFrame = (l) => l.kind === 'frame' && /sun/i.test(l.category ?? '');
const cents = (pesos) => (pesos == null || pesos === '' ? null : Math.round(Number(pesos) * 100));
const sum = (xs) => xs.reduce((s, x) => s + (x ?? 0), 0);

export const OPTION_KINDS = { glasses: 'Glasses', contacts: 'Contact lenses' };
export const OWN = 'own';

// ---------------------------------------------------------------------------
// The reference file (backend/alliances.json, pesos) → the catalogue's shape

const PROCESS = ['authorize', 'collect', 'fillIn', 'signatures', 'send', 'atRegister', 'perks', 'providerKeys'];

/** `alliances.json` as the circulares were read → `bundle.alliances`. */
export function fromReference(ref) {
  const byId = new Map((ref.alliances ?? []).map((a) => [a.id, a]));
  return (ref.alliances ?? []).map((a) => {
    const base = a.sameProcessAs ? byId.get(a.sameProcessAs) ?? {} : {};
    const defaults = a.planDefaults ?? {};
    const out = { id: a.id, name: a.name, combines: Boolean(a.combinesWithPromotions) };
    for (const k of PROCESS) {
      const v = a[k] ?? base[k];
      if (v != null) out[k] = v;
    }
    out.rules = [...(defaults.rules ?? []), ...(a.covers ? [a.covers] : [])];
    if (a.scope) out.scope = a.scope;
    if (a.cashDiscount) out.cashDiscount = a.cashDiscount;
    out.plans = a.plans.map((p) => plan(p, a, defaults));
    return out;
  });
}

function plan(p, a, defaults) {
  const outside = p.outsidePlan ?? null;
  const other = p.otherContactLenses ?? null;
  const sun = p.sunglasses ?? null;
  const out = {
    id: p.id,
    name: p.name,
    benefit: cents(p.benefit),
    contactLensBenefit: cents(p.contactLensBenefit),
    copay: cents(p.copay) ?? 0,
    glassesOnly: Boolean(p.coversGlassesOnly),
    options: (p.options ?? []).map((o) => ({
      convenio: o.convenio, kind: o.kind, covers: o.covers,
      frameUpTo: cents(o.frameUpTo), price: cents(o.price),
      extras: (o.extras ?? []).map((x) => ({ label: x.label, amount: cents(x.amount) })),
    })),
    lenses: (p.lensPrices ?? []).filter((l) => l.convenio).map((l) => ({ convenio: l.convenio, lens: l.lens, series: l.series ?? '', price: cents(l.price) })),
    outside: outside ? { convenio: outside.convenio, percent: outside.percent ?? 0, minimumList: cents(outside.minimumListPurchase), appliesTo: outside.appliesTo ?? 'all' } : { convenio: null, percent: 0, minimumList: null, appliesTo: 'all' },
    contacts: other ? { convenio: other.convenio, percent: other.percent ?? 0 } : null,
    sun: sun ? { convenio: sun.convenio, percent: sun.percent ?? 0, benefit: Boolean(sun.benefitApplies) }
      : { convenio: outside?.convenio ?? null, percent: outside?.percent ?? 0, benefit: false },
    replacements: [...(p.replacements ?? []), ...(p.replacement ? [{ ...p.replacement, on: p.replacement.note }] : [])]
      .map((r) => ({ convenio: r.convenio, percent: r.percent, on: r.on ?? '' })),
    addOns: (p.addOns ?? []).map((x) => ({ convenio: x.convenio, sku: x.sku ?? '', item: x.item, price: cents(x.price) })),
    notes: [...(p.notes ?? []), ...(p.benefitNote ? [p.benefitNote] : []), ...(p.seriesNote ? [p.seriesNote] : [])],
    validTo: p.validTo ?? defaults.validTo ?? null,
    circularValidTo: p.circularValidTo ?? defaults.circularValidTo ?? null,
    source: p.source ?? defaults.source ?? '',
    active: true,
  };
  if (p.convenio) out.convenio = p.convenio;
  if (p.copaySku) out.copaySku = p.copaySku;
  if (p.copayAdjustment) out.copayAdjustment = p.copayAdjustment;
  if (p.eventsPerPolicyYear) out.eventsPerYear = p.eventsPerPolicyYear;
  return out;
}

// ---------------------------------------------------------------------------
// The selection on an order, and its snapshot

/** `{ allianceId, planId, option, extras, authorization, policy, vale, cfeLens, checks }` */
export function newSelection(allianceId, planId) {
  return { allianceId, planId, option: null, extras: [], authorization: '', policy: '', vale: null, cfeLens: null, checks: {} };
}

export function findPlan(catalogue, sel) {
  if (!sel) return null;
  const alliance = (catalogue?.alliances ?? []).find((a) => a.id === sel.allianceId);
  const p = alliance?.plans.find((x) => x.id === sel.planId);
  return p ? { alliance, plan: p } : null;
}

export const activePlans = (alliance) => alliance.plans.filter((p) => p.active !== false);

/**
 * The terms an order is priced under, copied from the catalogue so a saved
 * order keeps them. null when there is no alliance (or it left the catalogue).
 */
export function resolveAlliance(order, catalogue) {
  const sel = order.alliance;
  if (!sel) return null;
  if (!catalogue?.alliances) return order.ally ?? null; // a saved order, read without the catalogue
  const hit = findPlan(catalogue, sel);
  if (!hit) return null;
  const { alliance, plan: p } = hit;
  const option = sel.option && sel.option !== OWN ? p.options.find((o) => o.convenio === sel.option) ?? null : null;
  const lens = p.lenses?.length && sel.cfeLens ? p.lenses.find((l) => l.convenio === sel.cfeLens) ?? null : null;
  return {
    allianceId: alliance.id, planId: p.id, name: alliance.name, plan: p.name, combines: Boolean(alliance.combines),
    benefit: p.lenses?.length ? (sel.vale ?? p.benefit) : p.benefit,
    contactLensBenefit: p.contactLensBenefit ?? null,
    glassesOnly: Boolean(p.glassesOnly),
    copay: p.copay ?? 0,
    option: option ? { ...option } : null,
    extras: option ? (option.extras ?? []).filter((x) => (sel.extras ?? []).includes(x.label)) : [],
    lens: lens ? { ...lens } : null,
    vale: p.lenses?.length ? (sel.vale ?? p.benefit) : null,
    outside: p.outside, contacts: p.contacts ?? null, sun: p.sun,
    convenio: p.convenio ?? null, copaySku: p.copaySku ?? null, copayAdjustment: p.copayAdjustment ?? null,
    authorization: String(sel.authorization ?? '').trim(), policy: String(sel.policy ?? '').trim(),
  };
}

// ---------------------------------------------------------------------------
// What the alliance does to each line (called while the order is resolved)

/** The pair the CFE voucher's lens prices: the first spectacle pair, when a voucher lens is chosen. */
export const cfePair = (ally, lines) => (ally?.lens ? lines.find(isPairLine) ?? null : null);

/** The lines the chosen package covers: the first frame and pair, or the contact lenses. */
export function packagedLines(ally, lines) {
  if (!ally?.option) return [];
  if (ally.option.kind === 'contacts') return lines.filter(isContactLine);
  const frame = lines.find((l) => l.kind === 'frame' && !isSunFrame(l));
  const pair = lines.find(isPairLine);
  return [frame, pair].filter(Boolean);
}

/** Why the chosen package cannot price this order, or null. */
export function packageMiss(ally, lines) {
  const o = ally?.option;
  if (!o) return null;
  if (o.kind === 'contacts') return lines.some(isContactLine) ? null : 'The package is contact lenses — add them to the order.';
  const frame = lines.find((l) => l.kind === 'frame' && !isSunFrame(l));
  if (!frame || !lines.some(isPairLine)) return 'The package is a frame with its lenses — both need to be on the order.';
  if (o.frameUpTo && frame.priceCents > o.frameUpTo) return `The frame (${money(frame.priceCents)}) is above the package’s ${money(o.frameUpTo)}.`;
  return null;
}

const listOf = (l) => {
  if (l.kind === 'lens') return l.lens?.priceCents == null ? null : isPairLine(l) ? Math.round((l.lens.priceCents * l.quantity) / 2) : l.lens.priceCents * l.quantity;
  if (l.kind === 'frame') return l.priceCents ?? null;
  return null;
};

/**
 * Marks the resolved lines: the package's lines, the voucher's lens at its
 * CFE price, and the outside-the-plan percentage on the rest (as a discount
 * with the plan's convenio, so the register code travels with it). A line a
 * set or campaign discount already prices keeps that, when the alliance combines.
 */
export function applyAlliance(ally, lines) {
  if (!ally) return lines;
  // A package the order does not fit (a frame above its limit, a piece missing) is priced as Own choice, and says why.
  const miss = packageMiss(ally, lines);
  if (miss) { ally.packageMiss = miss; ally.option = null; ally.extras = []; }
  const packaged = new Set(packagedLines(ally, lines));
  const voucherPair = cfePair(ally, lines);
  const name = `${ally.name} · ${ally.plan}`;
  // A minimum list purchase (MetLife Platino 11250): frames and lenses at list price.
  const glassesList = sum(lines.filter((l) => l.kind === 'frame' || isPairLine(l)).map(listOf));
  const minimumMet = !ally.outside?.minimumList || glassesList >= ally.outside.minimumList;
  for (const l of lines) {
    if (!ally.combines) delete l.discount;
    if (packaged.has(l)) {
      delete l.auto;
      l.ally = { packaged: true, convenio: ally.option.convenio, name: `${name} package` };
      continue;
    }
    if (l === voucherPair) {
      l.auto = { id: ally.lens.convenio, name: `CFE · ${ally.lens.lens}`, price: ally.lens.price, ally: true };
      l.ally = { voucher: true };
      continue;
    }
    if (l.kind === 'history' || (l.kind === 'extra' && !isShareLine(l) && !(l.priceCents > 1))) continue; // a gift stays a gift
    if (ally.combines && (l.auto || l.set || l.setLens)) continue;
    // A payer that covers the frame itself (a CFE voucher): the frame takes no outside-the-plan percentage.
    if (l.kind === 'frame' && !isSunFrame(l) && ally.outside?.appliesTo === 'lenses') { l.ally = { covered: true }; continue; }
    const rule = isSunFrame(l) ? ally.sun : isContactLine(l) ? ally.contacts ?? ally.outside : ally.outside;
    const percent = rule === ally.outside && !minimumMet ? 0 : rule?.percent ?? 0;
    if (!percent || !rule?.convenio) { l.ally = { outside: true }; continue; }
    l.auto = { id: rule.convenio, name: `${name} · ${percent}% outside the plan`, percent, ally: true };
    l.ally = { outside: true };
  }
  return lines;
}

// ---------------------------------------------------------------------------
// The sums (called by priceOrder)

/**
 * `rows` are priceOrder's rows. Returns what the order comes to under the
 * alliance: the products after its prices, the copay and surcharges, what the
 * payer covers and what the client pays.
 */
export function allianceTotals(ally, rows) {
  const packaged = rows.filter((r) => r.line.ally?.packaged && r.list != null);
  const others = rows.filter((r) => !r.line.ally?.packaged && r.net != null);
  const packageList = sum(packaged.map((r) => r.list));
  const hasGlasses = rows.some((r) => r.line.kind === 'frame' || isPairLine(r.line));
  const contactsOnly = !hasGlasses && rows.some((r) => isContactLine(r.line));
  const cap = (ally.option ? ally.option.kind === 'contacts' : contactsOnly) && !ally.glassesOnly
    ? ally.contactLensBenefit ?? ally.benefit ?? 0
    : ally.benefit ?? 0;
  // The package is billed to the payer at its fixed price, or at what it covers: the client pays only the copay and surcharges.
  const packageValue = ally.option ? (ally.option.price ?? Math.min(cap, packageList)) : 0;
  const eligible = (r) => {
    const l = r.line;
    if (l.kind === 'frame') return !isSunFrame(l) || Boolean(ally.sun?.benefit);
    if (isPairLine(l)) return true;
    if (isContactLine(l)) return !ally.glassesOnly && !hasGlasses;
    return false;
  };
  const covered = ally.option
    ? Math.min(cap, packageValue)
    : Math.min(cap, sum(others.filter(eligible).map((r) => r.net)));
  const surcharges = sum(ally.extras.map((x) => x.amount));
  const products = sum(others.map((r) => r.net)) + packageValue;
  const total = products + ally.copay + surcharges;
  const glassesList = sum(rows.filter((r) => r.line.kind === 'frame' || isPairLine(r.line)).map((r) => r.list));
  return {
    products, packageList, packageValue, copay: ally.copay, surcharges, covered, total,
    clientPays: total - covered,
    minimumMissing: Boolean(ally.outside?.minimumList) && !ally.option && glassesList < ally.outside.minimumList,
  };
}

// ---------------------------------------------------------------------------
// What the register needs, the paperwork, and what is not right yet

/** Codes the register takes for the alliance itself, beyond the lines' convenios. */
export function allianceCodes(ally) {
  if (!ally) return [];
  const out = [];
  if (ally.authorization) out.push({ copy: ally.authorization, text: 'Authorization' });
  if (ally.policy) out.push({ copy: ally.policy, text: 'Policy / certificate' });
  if (ally.copaySku) out.push({ copy: ally.copaySku, text: `Order 1 · copay${ally.copay ? ` ${money(ally.copay)}` : ''}` });
  if (ally.convenio) out.push({ copy: ally.convenio, text: `Order 2 · ${ally.plan}` });
  if (ally.copayAdjustment) out.push({ copy: ally.copayAdjustment, text: 'Order 2 · copay adjustment (AJ)' });
  return out;
}

export const CHECK_GROUPS = [
  { key: 'collect', title: 'Collect' },
  { key: 'signatures', title: 'Signatures' },
  { key: 'send', title: 'Send' },
];

/** The paperwork, as ticks: `[{ key, title, items: [{ id, text }] }]`. */
export function checklist(alliance) {
  if (!alliance) return [];
  return CHECK_GROUPS.map((g) => {
    const items = [...(alliance[g.key] ?? [])];
    if (g.key === 'collect' && alliance.fillIn) items.push(`Fill in: ${alliance.fillIn}`);
    return { ...g, items: items.map((text, i) => ({ id: `${g.key}:${i}`, text })) };
  }).filter((g) => g.items.length);
}

/** Ticks still open before the sale: what is collected and what is signed. */
export function openChecks(alliance, sel) {
  const checks = sel?.checks ?? {};
  return checklist(alliance).filter((g) => g.key !== 'send').flatMap((g) => g.items).filter((i) => !checks[i.id]);
}

/**
 * What stops the order being right under the alliance, as sentences.
 * `history` is the client's other orders, for the once-a-year rule.
 */
export function allianceFlags(order, catalogue, history = [], now = new Date()) {
  const sel = order.alliance;
  if (!sel) return [];
  const hit = findPlan(catalogue, sel);
  if (!hit) return ['This alliance or plan is no longer in the catalogue. Choose it again.'];
  const ally = order.ally;
  const out = [];
  if (!sel.option && !hit.plan.lenses?.length && hit.plan.options.length) out.push('Choose the plan’s package or Own choice.');
  if (!ally?.authorization && !hit.plan.lenses?.length) out.push('No authorization number yet.');
  if (ally?.packageMiss) out.push(`${ally.packageMiss} Priced as Own choice until it fits.`);
  if (ally?.lens && !order.lines.some(isPairLine)) out.push('The voucher’s lens prices a pair of spectacle lenses — add the lens to the order.');
  if (ally?.lens) {
    // The voucher names its material; the lens on the order should be that material.
    const pair = order.lines.find(isPairLine);
    const mat = (pair?.lens?.attributes ?? []).find((a) => a.key === 'material');
    const group = mat ? catalogue?.meta?.('material', mat.code)?.group : null;
    const want = /polycarbonat/i.test(ally.lens.lens) ? 'POLY' : /ultralite|cr-?39/i.test(ally.lens.lens) ? 'CR39' : null;
    if (want && group && group !== want) out.push(`The voucher authorizes ${ally.lens.lens}, but the lens on the order is ${mat.label}. Put the voucher’s lens on the order, or choose “Another lens”.`);
  }
  if (hit.plan.eventsPerYear && order.clientId) {
    const year = now.getTime() - 365 * 864e5;
    const used = history.find((o) => o.id !== order.id && o.status === 'sold' && o.alliance?.allianceId === sel.allianceId
      && new Date(o.closedOn ?? o.createdOn).getTime() >= year);
    if (used) out.push(`${hit.alliance.name} already paid for this client on ${new Date(used.closedOn ?? used.createdOn).toLocaleDateString('en-GB')} — one per policy year.`);
  }
  return out;
}


// ---------------------------------------------------------------------------
// The publish gate

export function validateAlliances(b, report) {
  const list = b.alliances ?? [];
  const ids = new Set();
  for (const a of list) {
    const where = a.name || a.id || 'An alliance';
    if (!a.id) report.error('Alliances', `${where} has no id.`);
    if (ids.has(a.id)) report.error('Alliances', `Alliance id ${a.id} is used twice.`);
    ids.add(a.id);
    if (!a.name) report.error('Alliances', `Alliance ${a.id} has no name.`);
    if (!(a.plans ?? []).length) report.warn('Alliances', `${where} has no plans, so it never shows on an order.`);
    const planIds = new Set();
    for (const p of a.plans ?? []) {
      const at = `${where} · ${p.name || p.id || 'a plan'}`;
      if (!p.id) report.error('Alliances', `${at} has no id.`);
      if (planIds.has(p.id)) report.error('Alliances', `${where}: plan id ${p.id} is used twice.`);
      planIds.add(p.id);
      if (!(p.benefit >= 0)) report.error('Alliances', `${at} has no benefit amount.`);
      if (p.copay != null && !(p.copay >= 0)) report.error('Alliances', `${at}: the copay cannot be negative.`);
      for (const r of [p.outside, p.contacts, p.sun].filter(Boolean)) {
        if (!(r.percent >= 0 && r.percent <= 100)) report.error('Alliances', `${at}: ${r.percent}% is not a percentage.`);
        if (r.percent > 0 && !r.convenio) report.error('Alliances', `${at}: a ${r.percent}% discount has no convenio for the register.`);
      }
      const conv = new Set();
      for (const o of p.options ?? []) {
        if (!o.convenio) report.error('Alliances', `${at}: a package has no convenio.`);
        if (conv.has(o.convenio)) report.error('Alliances', `${at}: convenio ${o.convenio} is listed twice.`);
        conv.add(o.convenio);
        if (!OPTION_KINDS[o.kind]) report.error('Alliances', `${at}: package ${o.convenio} is “${o.kind}”; use glasses or contacts.`);
        for (const x of o.extras ?? []) if (!(x.amount > 0)) report.error('Alliances', `${at}: package ${o.convenio}’s “${x.label}” has no amount.`);
      }
      for (const l of p.lenses ?? []) if (!(l.price > 0) || !l.convenio) report.error('Alliances', `${at}: voucher lens ${l.convenio || l.lens} needs a convenio and a price.`);
    }
  }
}

// ---------------------------------------------------------------------------
// Text forms for the editor and the review screen

/** `17899 | glasses | 2500 | covers… | price | 2nd series=300; 1st series=100` per line. */
export function optionsText(options) {
  return (options ?? []).map((o) => [
    o.convenio, o.kind, o.frameUpTo == null ? '' : o.frameUpTo / 100, o.covers ?? '', o.price == null ? '' : o.price / 100,
    (o.extras ?? []).map((x) => `${x.label}=${x.amount / 100}`).join('; '),
  ].join(' | ').replace(/( \| )+$/, '')).join('\n');
}

export function parseOptions(text) {
  return String(text ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
    const [convenio = '', kind = 'glasses', upTo = '', covers = '', price = '', extras = ''] = l.split('|').map((x) => x.trim());
    return {
      convenio, kind: kind.toLowerCase().startsWith('c') ? 'contacts' : kind.toLowerCase() || 'glasses', covers,
      frameUpTo: upTo === '' ? null : cents(upTo.replace(/[^\d.]/g, '')), price: price === '' ? null : cents(price.replace(/[^\d.]/g, '')),
      extras: extras.split(';').map((x) => x.trim()).filter(Boolean).map((x) => {
        const at = x.lastIndexOf('=');
        return { label: (at >= 0 ? x.slice(0, at) : x).trim(), amount: at >= 0 ? cents(x.slice(at + 1).replace(/[^\d.]/g, '')) : null };
      }),
    };
  });
}

/** `6500 | Ultralite (CR-39) single vision | 1st and 2nd | 495` per line. */
export const lensesText = (lenses) => (lenses ?? []).map((l) => [l.convenio, l.lens, l.series ?? '', l.price / 100].join(' | ')).join('\n');

export function parseLenses(text) {
  return String(text ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
    const [convenio = '', lens = '', series = '', price = ''] = l.split('|').map((x) => x.trim());
    return { convenio, lens, series, price: cents(price.replace(/[^\d.]/g, '')) };
  });
}

export const linesText = (xs) => (xs ?? []).join('\n');
export const parseLines = (t) => String(t ?? '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
