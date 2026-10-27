// Lifestyle presets on the order: one tap for the lens, Plus Protection and
// the accessories that suit how the client lives. And their editor, for the
// admin, under Catalogue data.
//
// The presets are tiles, two to a row, each with the lowest price it comes to
// for this prescription and this frame. Tapping one opens its tiers right
// below it — Lite to Ultra — each priced the way the order will price it.

import { html, useState, useMemo, useRef, useEffect } from './html.js';
import { useApp } from './hooks.js';
import { Sheet, Row, Bar, Screen, Flag, Maker } from './kit.js';
import { makersOf } from '../core/lens.js';
import { Icon } from './icons.js';
import { money } from '../core/money.js';
import {
  presetGroups, resolvePreset, presetKey, itemsText, parseItems, isProgressiveOnly,
  tierPrice, tierName, offers, TIERS,
} from '../core/presets.js';
import { needsAddition, rxIsBlank, strongestSphere, CL_FITS, fitComplete } from '../core/crm.js';
import { HIGH_RX_SPHERE } from '../config.js';
import { applyPreset, setOrderFrame, clientById, toast } from '../state/app.js';
import { FramePicker } from './framepick.js';
import { isPair } from '../core/orders.js';
import { brandKey } from '../core/util.js';
import { FormSheet } from './data/form.js';
import { useWorking } from './data/home.js';
import { edit } from '../state/working.js';
import { upsertPreset, deletePreset } from '../core/edits.js';
import { tr } from '../i18n.js';

/** A glyph for each preset's tile; a preset added later takes the sparkle. */
const PRESET_ICON = {
  progressive: 'mf', first: 'glasses', digital: 'display', everyday: 'halfsun', kids: 'balloon',
  driver: 'wheel', outdoor: 'sun', luxury: 'spark', clarity: 'eye', contacts: 'cl',
};

/** What the prescription and the frame decide before any preset is chosen, said once. */
function basis(rx, anyMfOnly, frame) {
  const bits = [];
  if (!rx || rxIsBlank(rx)) bits.push(anyMfOnly ? tr('No prescription on the order, so these are single vision (Progressive aside). Add the Rx first for progressives.') : tr('No prescription on the order, so these are single vision. Add the Rx first for progressives.'));
  else {
    const high = strongestSphere(rx) > HIGH_RX_SPHERE;
    bits.push(needsAddition(rx)
      ? (high ? tr('Progressive, from the ADD on the prescription; high-index where the tier has it.') : tr('Progressive, from the ADD on the prescription.'))
      : (high ? tr('Single vision, from the prescription; high-index where the tier has it.') : tr('Single vision, from the prescription.')));
  }
  bits.push(frame
    ? (frame.placeholder ? tr('Prices include the frame quoted, as the order will charge them — a set’s own lens prices too.') : tr('Prices include the frame on the order, as the order will charge them — a set’s own lens prices too.'))
    : tr('No frame, so prices are for lenses in the client’s own frame.'));
  return bits.join(' ');
}

const itemText = (i) => (i.price == null ? tr(i.label) : i.price <= 1 ? `${tr(i.label)} · ${tr('gift')}` : `${tr(i.label)} · ${money(i.price)}`);

/** The chips under a tier: Plus Protection and the accessories, priced. */
function adds(result, price) {
  return [
    ...result.extras.map((e) => (e.percent ? `Plus Protection${price?.plus ? ` · ${money(price.plus)}` : ''}` : e.description)),
    ...result.items.map(itemText),
  ];
}

/** Notes under a tier: the set it uses or leaves, what it skipped. */
function notesOf(result, price) {
  const out = (result.notes ?? []).map((n) => tr(n));
  if (price?.setLens) out.push(`${price.setLens.setName}: ${price.setLens.name}${price.setLens.price ? ` +${money(price.setLens.price)}` : ', ' + tr('included')}`);
  if (price?.outsideSet) out.push(tr('Not on {set}’s table — the frame goes at its own price', { set: price.outsideSet.setName }));
  if (price?.pending) out.push(tr('The lens price is still to confirm'));
  for (const s of result.skipped ?? []) out.push(tr('No {what} — {why}', { what: tr(s.label).toLowerCase(), why: tr(s.why) }));
  return out;
}

function TierRow({ result, price, applied, onPick }) {
  const { tier, lens } = result;
  const on = offers(result);
  const chips = on ? adds(result, price) : [];
  const notes = on ? notesOf(result, price) : [];
  // what it is, in a line; then the lens exactly, with its maker
  let what;
  if (!on) what = result.why ? tr(result.why) : (result.care ? tr('Nothing on hand') : tr('Not in the catalogue right now.'));
  else if (result.contact) what = html`${lens.displayName} · ${tr('a box for each eye')}`;
  else if (result.care) what = tr('Care only — the lenses on the order stay');
  else what = html`${lens.displayName}${makersOf(lens).map((m) => html` <${Maker} name=${m} />`)}`;
  if (result.contact && on) {
    const fit = result.eyes[0]?.fit;
    const ready = result.eyes.every((e) => fitComplete(fit, e.measures));
    notes.unshift(ready ? tr('Fitting from the prescription: OD {od} · OS {os}', { od: result.eyes[0].power, os: result.eyes[1].power }) : tr('Add the fitting ({fields}) on the order', { fields: CL_FITS[fit]?.fields.map((f) => f.label).join(', ') }));
  }
  return html`<${Row} title=${html`<span class="tier-n">${tier.tier}</span>${applied ? html`<span class="tier-on"><${Icon} name="check" />${tr('On the order')}</span>` : ''}`}
    detail=${tier.tierBlurb || null}
    sub=${html`<span class="preset-lens">${what}</span>
      ${chips.length > 0 && html`<span class="preset-adds">${chips.map((a) => html`<span class="chip">${a}</span>`)}</span>`}
      ${notes.length > 0 && html`<span class="preset-note">${notes.join(' · ')}</span>`}`}
    end=${on && price ? html`<span class="tier-price">${money(price.total)}</span>` : null} off=${!on} chev=${on} onClick=${on ? () => onPick(result) : null} />`;
}

/** A preset as a tile: its glyph, its name, its line and its lowest price here. */
function PresetTile({ g, open, applied, onToggle }) {
  const live = g.results.some(offers);
  const why = !live ? tr(g.results.find((r) => r.why)?.why ?? 'Not for this prescription').replace(/ —.*$/, '') : null;
  return html`<button type="button" class=${'preset-tile' + (open ? ' open' : '') + (live ? '' : ' off')} aria-expanded=${open ? 'true' : 'false'} aria-controls="preset-tiers"
    onClick=${onToggle}>
    <span class="pt-top"><${Icon} name=${PRESET_ICON[g.id] ?? 'spark'} />${applied && html`<span class="pt-on" aria-label=${tr('On the order')}><${Icon} name="check" /></span>`}</span>
    <span class="pt-n">${g.name}</span>
    ${g.blurb && html`<span class="pt-b">${g.blurb}</span>`}
    <span class="pt-p">${live ? (g.from != null ? html`<span class="k">${tr('price::From')}</span> ${money(g.from)}` : tr('Price at the register')) : why}</span>
  </button>`;
}

/**
 * Presets on the order, one tap each. With `toQuote` it is the quote's option
 * builder: first the frame — the one on the order, one from the catalogue, a
 * brand or a set — then the lenses, and the order goes onto the quote as the
 * next option. A tier that names its brands (Luxury) asks for one of them
 * when the frame is not already theirs.
 */
export function PresetSheet({ onClose, toQuote }) {
  const catalogue = useApp((s) => s.catalogue);
  const rx = useApp((s) => s.draftRx ?? clientById(s.draft.clientId, s)?.prescription ?? null);
  const contactRx = useApp((s) => clientById(s.draft.clientId, s)?.contactRx ?? null);
  const draftFrame = useApp((s) => s.draft.lines.find((l) => l.kind === 'frame') ?? null);
  const hasPair = useApp((s) => s.draft.lines.some((l) => isPair(l)));
  const claimed = useApp((s) => s.draft.claimed);
  const appliedKey = useApp((s) => s.draft.lines.filter((l) => l.preset).map((l) => l.preset).join(';'));
  const orderId = useApp((s) => s.draft.id); // picks the accessories' colours, the same each time for this order
  const [step, setStep] = useState(toQuote ? 'frame' : 'lens');
  const [frame, setFrame] = useState(null); // null: keep the order's · false: none · a line: this one
  const [waiting, setWaiting] = useState(null); // a tier waiting for its brand
  const chosen = frame === null ? draftFrame : frame || null;
  const applied = useMemo(() => new Set(appliedKey ? appliedKey.split(';') : []), [appliedKey]);

  // Every tier read against this prescription and this frame, and priced; a
  // preset with nothing for this prescription (Progressive, for single vision) goes to the end.
  const groups = useMemo(() => {
    const opts = { seed: orderId, frame: chosen, contactRx, claimed: claimed ?? [] };
    const all = presetGroups(catalogue).map((g) => {
      const results = g.tiers.map((t) => resolvePreset(catalogue, t, rx, opts));
      const prices = results.map((r) => tierPrice(catalogue, r, opts));
      const totals = prices.filter(Boolean).map((p) => p.total);
      return { ...g, results, prices, from: totals.length ? Math.min(...totals) : null };
    });
    const live = (g) => g.results.some(offers);
    return [...all.filter(live), ...all.filter((g) => !live(g))];
  }, [catalogue, rx, orderId, chosen, contactRx, claimed]);
  const anyMfOnly = groups.some((g) => g.tiers.some(isProgressiveOnly));
  // The preset already on the order opens by itself; otherwise every tile is closed.
  const [openId, setOpenId] = useState(() => groups.find((g) => g.tiers.some((t) => applied.has(presetKey(t))))?.id ?? null);
  const panel = useRef(null);
  const grid = useRef(null);
  useEffect(() => {
    // the opened tile goes to the top when its tiers would run off the screen
    const p = panel.current;
    if (!openId || !p) return;
    if (p.getBoundingClientRect().bottom <= window.innerHeight - 24) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    grid.current?.querySelector('.preset-tile.open')?.scrollIntoView?.({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
  }, [openId]);

  const finish = async (result, f = frame) => {
    if (result) await applyPreset(result, f);
    else if (f !== null) await setOrderFrame(f);
    onClose();
    if (toQuote) { await toQuote(); return; }
    toast(result ? tr('{name} on the order', { name: tierName(result.tier) }) : tr('Frame on the order'));
  };
  const pick = (result) => {
    if (result.care) { finish(result); return; }
    const brands = result.brands ?? [];
    const theirs = chosen && brands.map(brandKey).includes(brandKey(chosen.brand || ''));
    if (brands.length && !theirs) { setWaiting(result); setStep('brand'); return; }
    finish(result);
  };
  const frameText = (f) => (f ? `${f.brand || f.description}${f.placeholder ? ` · ${f.priceSource === 'from' ? tr('from {price}', { price: money(f.priceCents) }) : money(f.priceCents)}` : ''}` : tr('No frame'));

  const steps = toQuote ? [{ id: 'frame', label: 'Frame' }, { id: 'lens', label: 'Lenses' }] : [];
  const at = step === 'frame' ? 0 : 1;
  const title = step === 'brand' ? tr('Choose the brand') : toQuote ? tr('Add an option') : tr('Lifestyle presets');

  // the open preset's tiers go right after the row its tile is on
  const openAt = groups.findIndex((g) => g.id === openId);
  const after = openAt < 0 ? -1 : Math.min(openAt | 1, groups.length - 1);
  const opened = openAt >= 0 ? groups[openAt] : null;

  return html`<${Sheet} title=${title} onClose=${onClose} full>
    <div class="stack">
      ${steps.length > 0 && step !== 'brand' && html`<ol class="steps-bar" style=${{ '--n': steps.length, '--i': at }}>
        ${steps.map((s, i) => html`<li class=${i <= at ? 'on' : ''}><button type="button" onClick=${() => setStep(s.id)}>${tr(s.label)}</button></li>`)}
      </ol>`}

      ${step === 'frame' && html`
        <div class="list">
          ${draftFrame && html`<${Row} icon="glasses" title=${tr('Keep {frame}', { frame: frameText(draftFrame) })} detail=${tr('The frame on the order')} chev onClick=${() => { setFrame(null); setStep('lens'); }} />`}
          <${Row} icon="x" title=${tr('No frame')} detail=${tr('Lenses and extras only')} chev onClick=${() => { setFrame(false); setStep('lens'); }} />
        </div>
        <${FramePicker} start="brand" onPick=${(line) => { setFrame(line); setStep('lens'); }} />`}

      ${step === 'lens' && html`
        ${toQuote && html`<div class="list"><${Row} icon="glasses" title=${frameText(chosen)} detail=${chosen?.placeholder ? (chosen.setId ? tr('Any frame of the set') : tr('Quoted by brand')) : chosen ? tr('The frame for this option') : tr('This option has no frame')}
          end=${html`<button type="button" class="textbtn" onClick=${() => setStep('frame')}>${tr('Change')}</button>`} /></div>`}
        <p class="para pad">${basis(rx, anyMfOnly, chosen)}</p>
        ${toQuote && hasPair && html`<div class="list"><${Row} icon="lens" title=${tr('Keep the lenses on the order')} detail=${tr('Add this frame with what the order has')} chev onClick=${() => finish(null)} /></div>`}
        ${groups.length === 0 && html`<div class="pad"><${Flag}>${tr('No presets in the catalogue yet. An admin adds them under Me → Catalogue data → Lifestyle presets.')}<//></div>`}
        ${groups.length > 0 && html`<div class="preset-grid pad" ref=${grid}>
          ${groups.map((g, i) => html`
            <${PresetTile} key=${g.id} g=${g} open=${g.id === openId} applied=${g.tiers.some((t) => applied.has(presetKey(t)))}
              onToggle=${() => setOpenId(g.id === openId ? null : g.id)} />
            ${i === after && opened && html`<div class="preset-tiers" id="preset-tiers" key=${'tiers-' + opened.id} ref=${panel} role="region" aria-label=${`${opened.name} tiers`}>
              <div class="list flush">${opened.results.map((r, j) => html`<${TierRow} key=${presetKey(r.tier)} result=${r} price=${opened.prices[j]}
                applied=${applied.has(presetKey(r.tier))} onPick=${pick} />`)}</div>
            </div>`}`)}
        </div>`}
        <p class="note pad">${tr('A preset sets the lenses and adds Plus Protection and accessories; another preset swaps them. Lite and Essential add only free gifts. No cleaning solution goes with Crizal, Transitions or Polarex, and Polarex never takes Crizal.')}</p>`}

      ${step === 'brand' && waiting && html`
        <p class="para pad">${tr('{a} goes with a renowned frame. Choose the brand — in a set it takes the set’s price, outside one its lowest catalogue price.', { a: tierName(waiting.tier) })}</p>
        <${FramePicker} only=${waiting.brands} onPick=${(line) => finish(waiting, line)} />
        <div class="pad"><button type="button" class="btn quiet" onClick=${() => { setWaiting(null); setStep('lens'); }}>${tr('Back to the presets')}</button></div>`}
    </div>
  <//>`;
}

// ---------------------------------------------------------------------------
// The editor

const FIELDS = [
  { key: 'presetId', label: 'Preset id', required: true, placeholder: 'e.g. digital', group: 'Preset' },
  { key: 'preset', label: 'Preset name', required: true, placeholder: 'e.g. Digital', group: 'Preset' },
  { key: 'blurb', label: 'Preset line', placeholder: 'Who it is for — one line, it goes on the tile', group: 'Preset' },
  { key: 'tier', label: 'Tier', required: true, placeholder: 'Lite, Essential, Plus, Pro or Ultra', group: 'Tier',
    hint: TIERS.map((t) => `${t.name} — ${t.rule}`).join(' · ') + '. On the order the preset and the tier read as one name: Digital Pro.' },
  { key: 'tierBlurb', label: 'Tier line', placeholder: 'What it leads with', group: 'Tier' },
  { key: 'sv', label: 'Single vision', placeholder: 'SV|*POLY|ND|*BLANCO|BLC|ARC', caps: true, group: 'Lens',
    hint: 'family|material|design|filter|colour|coating, as in the set rows: codes, several with commas, *GROUP for a promo group, ! for anything but, * for anything; several matches separated by ;. Of the matches, the one the client pays least for with the frame on the order is taken — in a set, its row of the set’s table — and a strong prescription takes a high-index match when there is one. Polarex with Crizal is never taken. Blank with a progressive below: progressive only, offered when the prescription has an ADD. Both blank: a contact lens preset (see Contact lens).' },
  { key: 'mf', label: 'Progressive', placeholder: 'PR|*POLY|VC,VM|*BLANCO|BLC|CPU', caps: true, group: 'Lens', hint: 'Used when the prescription has an ADD. Blank: single vision for everyone.' },
  { key: 'cl', label: 'Contact lens', placeholder: '5200|HM,MT|*', caps: true, group: 'Lens',
    hint: 'Only with both lenses above blank. material|product|colour codes, as in the contact lens list: the cheapest after the campaign’s discount goes on for both eyes, a box each, its fitting started from the prescription — a multifocal one needs an ADD. Blank: a care preset, which adds only its accessories and leaves the lenses on the order alone.' },
  { key: 'extras', label: 'Extras', placeholder: 'e.g. 600500800203', group: 'Adds', hint: 'Extra codes, separated by commas — Plus Protection is one.' },
  { key: 'items', label: 'Accessories', type: 'textarea', placeholder: 'Pouch: 64000384/64000385/64000386; Cleaning solution*: 61004172', group: 'Adds',
    hint: 'Label: barcodes, separated by ;. Each order takes one of the codes on hand at the first one’s price — colours and models vary from order to order, the price does not; with none on hand, the first in the price list. A * after the label marks a cleaning solution, which is never added to Crizal, Transitions or Polarex.' },
  { key: 'brands', label: 'Frame brands', type: 'textarea', placeholder: 'e.g. Versace, Carolina Herrera, Michael Kors', group: 'Frame',
    hint: 'Separated by commas. When set, choosing this tier asks for a frame of one of these brands (unless the option already has one). Blank: any frame.' },
];

export function PresetsAdminScreen() {
  const { bundle } = useWorking();
  const [open, setOpen] = useState(null);
  const tiers = bundle?.presets ?? [];
  const groups = [];
  for (const t of tiers) {
    let g = groups.find((x) => x.id === t.presetId);
    if (!g) { g = { id: t.presetId, name: t.preset, tiers: [] }; groups.push(g); }
    g.tiers.push(t);
  }
  const blank = { presetId: '', preset: '', blurb: '', tier: '', tierBlurb: '', sv: '', mf: '', cl: '', extras: '', items: '', brands: '' };
  const asForm = (t) => ({ ...t, cl: t.cl ?? '', extras: (t.extras ?? []).join(', '), items: itemsText(t.items), brands: (t.brands ?? []).join(', ') });
  return html`
    <${Bar} backTo="#/me/data" title=${tr('Lifestyle presets')} trail=${html`<button class="bar-btn round" aria-label=${tr('Add')} onClick=${() => setOpen({ t: blank })}><${Icon} name="plus" /></button>`} />
    <${Screen}>
      <div class="stack">
        <p class="para pad">${tr('Each preset has five tiers, from the lowest price up: Lite and Essential add only the lens and free gifts (a $0.01 cloth, a kids’ strap); Plus, Pro and Ultra add Plus Protection and one or two paid accessories. A tier names its lens for single vision and for progressives, the extras and the accessories — and, for Luxury, the frame brands it goes with. A contact lens tier names a contact lens, or none at all for solution and case only.')}</p>
        ${groups.map((g) => html`<section class="section">
          <div class="section-head"><div class="eyebrow">${g.name}</div></div>
          <div class="list">${g.tiers.map((t) => html`<${Row} title=${t.tier} detail=${t.sv || t.mf || t.cl || tr('Accessories only')} mono sub=${[t.items?.length ? t.items.map((i) => i.label + (i.solution ? '*' : '')).join(' · ') : null, t.brands?.length ? `${t.brands.length} frame brands` : null].filter(Boolean).join(' · ') || null}
            chev onClick=${() => setOpen({ t: asForm(t), key: presetKey(t) })} />`)}</div>
        </section>`)}
      </div>
    <//>
    ${open && html`<${FormSheet} title=${open.key ? `${open.t.preset} · ${open.t.tier}` : tr('New tier')} initial=${open.t} onClose=${() => setOpen(null)}
      fields=${FIELDS}
      onSave=${(x) => {
        const brands = String(x.brands ?? '').split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean);
        const t = {
          presetId: x.presetId.trim().toLowerCase().replace(/\s+/g, '-'), preset: x.preset.trim(), blurb: x.blurb.trim(),
          tier: x.tier.trim(), tierBlurb: x.tierBlurb.trim(), sv: x.sv.trim().toUpperCase(), mf: x.mf.trim().toUpperCase(),
          ...(String(x.cl ?? '').trim() ? { cl: String(x.cl).trim().toUpperCase() } : {}),
          extras: x.extras.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean), items: parseItems(x.items),
          ...(brands.length ? { brands } : {}),
        };
        const key = presetKey(t);
        if (key !== open.key && tiers.some((y) => presetKey(y) === key)) return tr('{preset} already has a tier called {tier}.', { preset: t.preset, tier: t.tier });
        edit((b) => upsertPreset(b, t, open.key)); toast(tr('Saved to the working copy'));
      }}
      onDelete=${open.key ? () => { edit((b) => deletePreset(b, open.key)); toast(tr('Removed')); } : null} />`}`;
}
