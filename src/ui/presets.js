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
import { applyPreset, clientById, toast } from '../state/app.js';
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
 * `toQuote`: the chosen preset goes onto the order and the order straight onto
 * the quote as the next option — the quick way to build a quote.
 */
export function PresetSheet({ onClose, toQuote }) {
  const catalogue = useApp((s) => s.catalogue);
  const rx = useApp((s) => s.draftRx ?? clientById(s.draft.clientId, s)?.prescription ?? null);
  const groups = useMemo(() => presetGroups(catalogue).map((g) => ({ ...g, results: g.tiers.map((t) => resolvePreset(catalogue, t, rx)) })), [catalogue, rx]);
  const pick = async (result) => {
    await applyPreset(result);
    if (toQuote) { onClose(); await toQuote(); return; }
    toast(`${result.tier.preset} · ${result.tier.tier} on the order`);
    onClose();
  };
  return html`<${Sheet} title=${toQuote ? 'Add an option' : 'Lifestyle presets'} onClose=${onClose} full>
    <div class="stack">
      <p class="para pad">${rxBasis(rx)} A preset replaces the lenses on the order and adds Plus Protection and accessories; another preset swaps them. No cleaning solution goes with Crizal, Transitions or Polarex.</p>
      ${groups.length === 0 && html`<div class="pad"><${Flag}>No presets in the catalogue yet. An admin adds them under Me → Catalogue data → Lifestyle presets.<//></div>`}
      ${groups.map((g) => html`<section class="section" key=${g.id}>
        <div class="preset-head"><div class="n">${g.name}</div>${g.blurb && html`<div class="b">${g.blurb}</div>`}</div>
        <div class="list">${g.results.map((r) => html`<${TierRow} key=${presetKey(r.tier)} result=${r} onPick=${pick} />`)}</div>
      </section>`)}
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
  const blank = { presetId: '', preset: '', blurb: '', tier: '', tierBlurb: '', sv: '', mf: '', extras: '', items: '' };
  const asForm = (t) => ({ ...t, extras: (t.extras ?? []).join(', '), items: itemsText(t.items) });
  return html`
    <${Bar} backTo="#/me/data" title="Lifestyle presets" trail=${html`<button class="bar-btn round" aria-label="Add" onClick=${() => setOpen({ t: blank })}><${Icon} name="plus" /></button>`} />
    <${Screen}>
      <div class="stack">
        <p class="para pad">Each preset has tiers — an accessible price, the better value. A tier names its lens for single vision and for progressives, the extras (Plus Protection) and the accessories it adds.</p>
        ${groups.map((g) => html`<section class="section">
          <div class="section-head"><div class="eyebrow">${g.name}</div></div>
          <div class="list">${g.tiers.map((t) => html`<${Row} title=${t.tier} detail=${t.sv || t.mf} mono sub=${t.items?.length ? t.items.map((i) => i.label + (i.solution ? '*' : '')).join(' · ') : null}
            chev onClick=${() => setOpen({ t: asForm(t), key: presetKey(t) })} />`)}</div>
        </section>`)}
      </div>
    <//>
    ${open && html`<${FormSheet} title=${open.key ? `${open.t.preset} · ${open.t.tier}` : 'New tier'} initial=${open.t} onClose=${() => setOpen(null)}
      fields=${FIELDS}
      onSave=${(x) => {
        const t = {
          presetId: x.presetId.trim().toLowerCase().replace(/\s+/g, '-'), preset: x.preset.trim(), blurb: x.blurb.trim(),
          tier: x.tier.trim(), tierBlurb: x.tierBlurb.trim(), sv: x.sv.trim().toUpperCase(), mf: x.mf.trim().toUpperCase(),
          extras: x.extras.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean), items: parseItems(x.items),
        };
        const key = presetKey(t);
        if (key !== open.key && tiers.some((y) => presetKey(y) === key)) return `${t.preset} already has a tier called ${t.tier}.`;
        edit((b) => upsertPreset(b, t, open.key)); toast('Saved to the working copy');
      }}
      onDelete=${open.key ? () => { edit((b) => deletePreset(b, open.key)); toast('Removed'); } : null} />`}`;
}
