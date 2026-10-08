// Lifestyle presets on the order: one tap for the lens, Plus Protection and
// the accessories that suit how the client lives. And their editor, for the
// admin, under Catalogue data.

import { html, useState, useMemo } from './html.js';
import { useApp } from './hooks.js';
import { Sheet, Row, Bar, Screen, Flag } from './kit.js';
import { Icon } from './icons.js';
import { money } from '../core/money.js';
import { presetGroups, resolvePreset, presetKey, itemsText, parseItems } from '../core/presets.js';
import { needsAddition, rxIsBlank, strongestSphere } from '../core/crm.js';
import { HIGH_RX_SPHERE } from '../config.js';
import { applyPreset, setOrderFrame, clientById, toast } from '../state/app.js';
import { FramePicker } from './framepick.js';
import { isPair } from '../core/orders.js';
import { brandKey } from '../core/util.js';
import { FormSheet } from './data/form.js';
import { useWorking } from './data/home.js';
import { edit } from '../state/working.js';
import { upsertPreset, deletePreset } from '../core/edits.js';

/** What the prescription decides before any preset is chosen, said once. */
function rxBasis(rx) {
  if (!rx || rxIsBlank(rx)) return 'No prescription on the order, so these are single vision. Add the Rx first for progressives.';
  const bits = [needsAddition(rx) ? 'Progressive, from the ADD on the prescription' : 'Single vision, from the prescription'];
  if (strongestSphere(rx) > HIGH_RX_SPHERE) bits.push('high-index where the preset has it');
  return bits.join('; ') + '.';
}

function TierRow({ result, onPick }) {
  const { tier, lens } = result;
  if (!lens) return html`<${Row} title=${tier.tier} detail=${result.why} off />`;
  const adds = [...result.extras.map((e) => (e.percent ? 'Plus Protection' : e.description)), ...result.items.map((i) => i.label)];
  const notes = [...result.notes, ...result.skipped.map((s) => `No ${s.label.toLowerCase()} — ${s.why}`)];
  return html`<${Row} title=${tier.tier} detail=${lens.displayName}
    sub=${html`${tier.tierBlurb && html`<span class="preset-line">${tier.tierBlurb}</span>`}
      ${adds.length > 0 && html`<span class="preset-adds">${adds.map((a) => html`<span class="chip">${a}</span>`)}</span>`}
      ${notes.length > 0 && html`<span class="preset-note">${notes.join(' · ')}</span>`}`}
    end=${money(lens.priceCents)} chev onClick=${() => onPick(result)} />`;
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
  const draftFrame = useApp((s) => s.draft.lines.find((l) => l.kind === 'frame') ?? null);
  const hasPair = useApp((s) => s.draft.lines.some((l) => isPair(l)));
  const groups = useMemo(() => presetGroups(catalogue).map((g) => ({ ...g, results: g.tiers.map((t) => resolvePreset(catalogue, t, rx)) })), [catalogue, rx]);
  const [step, setStep] = useState(toQuote ? 'frame' : 'lens');
  const [frame, setFrame] = useState(null); // null: keep the order's · false: none · a line: this one
  const [waiting, setWaiting] = useState(null); // a tier waiting for its brand
  const chosen = frame === null ? draftFrame : frame || null;

  const finish = async (result, f = frame) => {
    if (result) await applyPreset(result, f);
    else if (f !== null) await setOrderFrame(f);
    onClose();
    if (toQuote) { await toQuote(); return; }
    toast(result ? `${result.tier.preset} · ${result.tier.tier} on the order` : 'Frame on the order');
  };
  const pick = (result) => {
    const brands = result.brands ?? [];
    const theirs = chosen && brands.map(brandKey).includes(brandKey(chosen.brand || ''));
    if (brands.length && !theirs) { setWaiting(result); setStep('brand'); return; }
    finish(result);
  };
  const frameText = (f) => (f ? `${f.brand || f.description}${f.placeholder ? ` · ${f.priceSource === 'from' ? 'from ' : ''}${money(f.priceCents)}` : ''}` : 'No frame');

  const steps = toQuote ? [{ id: 'frame', label: 'Frame' }, { id: 'lens', label: 'Lenses' }] : [];
  const at = step === 'frame' ? 0 : 1;
  const title = step === 'brand' ? 'Choose the brand' : toQuote ? 'Add an option' : 'Lifestyle presets';

  return html`<${Sheet} title=${title} onClose=${onClose} full>
    <div class="stack">
      ${steps.length > 0 && step !== 'brand' && html`<ol class="steps-bar" style=${{ '--n': steps.length, '--i': at }}>
        ${steps.map((s, i) => html`<li class=${i <= at ? 'on' : ''}><button type="button" onClick=${() => setStep(s.id)}>${s.label}</button></li>`)}
      </ol>`}

      ${step === 'frame' && html`
        <div class="list">
          ${draftFrame && html`<${Row} icon="glasses" title=${`Keep ${frameText(draftFrame)}`} detail="The frame on the order" chev onClick=${() => { setFrame(null); setStep('lens'); }} />`}
          <${Row} icon="x" title="No frame" detail="Lenses and extras only" chev onClick=${() => { setFrame(false); setStep('lens'); }} />
        </div>
        <${FramePicker} start="brand" onPick=${(line) => { setFrame(line); setStep('lens'); }} />`}

      ${step === 'lens' && html`
        ${toQuote && html`<div class="list"><${Row} icon="glasses" title=${frameText(chosen)} detail=${chosen?.placeholder ? (chosen.setId ? 'Any frame of the set' : 'Quoted by brand') : chosen ? 'The frame for this option' : 'This option has no frame'}
          end=${html`<button type="button" class="textbtn" onClick=${() => setStep('frame')}>Change</button>`} /></div>`}
        <p class="para pad">${rxBasis(rx)} A preset sets the lenses and adds Plus Protection and accessories; another preset swaps them. No cleaning solution goes with Crizal, Transitions or Polarex.</p>
        ${toQuote && hasPair && html`<div class="list"><${Row} icon="lens" title="Keep the lenses on the order" detail="Add this frame with what the order has" chev onClick=${() => finish(null)} /></div>`}
        ${groups.length === 0 && html`<div class="pad"><${Flag}>No presets in the catalogue yet. An admin adds them under Me → Catalogue data → Lifestyle presets.<//></div>`}
        ${groups.map((g) => html`<section class="section" key=${g.id}>
          <div class="preset-head"><div class="n">${g.name}</div>${g.blurb && html`<div class="b">${g.blurb}</div>`}</div>
          <div class="list">${g.results.map((r) => html`<${TierRow} key=${presetKey(r.tier)} result=${r} onPick=${pick} />`)}</div>
        </section>`)}`}

      ${step === 'brand' && waiting && html`
        <p class="para pad">${waiting.tier.preset} · ${waiting.tier.tier} goes with a renowned frame. Choose the brand — in a set it takes the set’s price, outside one its lowest catalogue price.</p>
        <${FramePicker} only=${waiting.brands} onPick=${(line) => finish(waiting, line)} />
        <div class="pad"><button type="button" class="btn quiet" onClick=${() => { setWaiting(null); setStep('lens'); }}>Back to the presets</button></div>`}
    </div>
  <//>`;
}

// ---------------------------------------------------------------------------
// The editor

const FIELDS = [
  { key: 'presetId', label: 'Preset id', required: true, placeholder: 'e.g. digital', group: 'Preset' },
  { key: 'preset', label: 'Preset name', required: true, placeholder: 'e.g. Digital nomad', group: 'Preset' },
  { key: 'blurb', label: 'Preset line', placeholder: 'Who it is for', group: 'Preset' },
  { key: 'tier', label: 'Tier', required: true, placeholder: 'e.g. Accessible', group: 'Tier' },
  { key: 'tierBlurb', label: 'Tier line', placeholder: 'What it leads with', group: 'Tier' },
  { key: 'sv', label: 'Single vision', placeholder: 'SV|*POLY|ND|*BLANCO|BLC|ARC', caps: true, group: 'Lens',
    hint: 'family|material|design|filter|colour|coating, as in the set rows: codes, several with commas, *GROUP for a promo group, ! for anything but, * for anything. The cheapest match is taken; a strong prescription takes a high-index match when there is one.' },
  { key: 'mf', label: 'Progressive', placeholder: 'PR|*POLY|VC,VM|*BLANCO|BLC|CPU', caps: true, group: 'Lens', hint: 'Used when the prescription has an ADD. Blank: single vision for everyone.' },
  { key: 'extras', label: 'Extras', placeholder: 'e.g. 600500800203', group: 'Adds', hint: 'Extra codes, separated by commas — Plus Protection is one.' },
  { key: 'items', label: 'Accessories', type: 'textarea', placeholder: 'Pouch: 61004120/61004121; Cleaning solution*: 61004172', group: 'Adds',
    hint: 'Label: stock codes in order of preference (the first in stock is added), separated by ;. A * after the label marks a cleaning solution, which is never added to Crizal, Transitions or Polarex.' },
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
  const blank = { presetId: '', preset: '', blurb: '', tier: '', tierBlurb: '', sv: '', mf: '', extras: '', items: '', brands: '' };
  const asForm = (t) => ({ ...t, extras: (t.extras ?? []).join(', '), items: itemsText(t.items), brands: (t.brands ?? []).join(', ') });
  return html`
    <${Bar} backTo="#/me/data" title="Lifestyle presets" trail=${html`<button class="bar-btn round" aria-label="Add" onClick=${() => setOpen({ t: blank })}><${Icon} name="plus" /></button>`} />
    <${Screen}>
      <div class="stack">
        <p class="para pad">Each preset has tiers — an accessible price, the better value. A tier names its lens for single vision and for progressives, the extras (Plus Protection) and the accessories it adds — and, for Luxury, the frame brands it goes with.</p>
        ${groups.map((g) => html`<section class="section">
          <div class="section-head"><div class="eyebrow">${g.name}</div></div>
          <div class="list">${g.tiers.map((t) => html`<${Row} title=${t.tier} detail=${t.sv || t.mf} mono sub=${[t.items?.length ? t.items.map((i) => i.label + (i.solution ? '*' : '')).join(' · ') : null, t.brands?.length ? `${t.brands.length} frame brands` : null].filter(Boolean).join(' · ') || null}
            chev onClick=${() => setOpen({ t: asForm(t), key: presetKey(t) })} />`)}</div>
        </section>`)}
      </div>
    <//>
    ${open && html`<${FormSheet} title=${open.key ? `${open.t.preset} · ${open.t.tier}` : 'New tier'} initial=${open.t} onClose=${() => setOpen(null)}
      fields=${FIELDS}
      onSave=${(x) => {
        const brands = String(x.brands ?? '').split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean);
        const t = {
          presetId: x.presetId.trim().toLowerCase().replace(/\s+/g, '-'), preset: x.preset.trim(), blurb: x.blurb.trim(),
          tier: x.tier.trim(), tierBlurb: x.tierBlurb.trim(), sv: x.sv.trim().toUpperCase(), mf: x.mf.trim().toUpperCase(),
          extras: x.extras.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean), items: parseItems(x.items),
          ...(brands.length ? { brands } : {}),
        };
        const key = presetKey(t);
        if (key !== open.key && tiers.some((y) => presetKey(y) === key)) return `${t.preset} already has a tier called ${t.tier}.`;
        edit((b) => upsertPreset(b, t, open.key)); toast('Saved to the working copy');
      }}
      onDelete=${open.key ? () => { edit((b) => deletePreset(b, open.key)); toast('Removed'); } : null} />`}`;
}
