// A lens chosen by hand for a quote option, inside the sheet: the family, then
// one decision at a time — the same steps as Find, gathered from the
// catalogue's own rows, so only lenses it sells can be reached. Then the lens,
// priced with the option's frame, with Plus Protection if he wants it.

import { html, useState, useMemo } from './html.js';
import { useApp } from './hooks.js';
import { ScreenTitle, Row, List, SearchField, Panel, KV, Toggle, Seg, Stepper, Anchor, Flag, Maker, Eyebrow } from './kit.js';
import { Icon } from './icons.js';
import { FAMILIES, familyById, options, currentStep, chosenLabel, clearFrom, matches, resolve, makersOf } from '../core/lens.js';
import { guidance, rxIsBlank } from '../core/crm.js';
import { pairLine, lensLine, extraLine, priceOrder } from '../core/orders.js';
import { resolveOrder } from '../core/sets.js';
import { money } from '../core/money.js';
import { fold } from '../core/util.js';
import { tr, trn } from '../i18n.js';

/** The family, then each step in turn; `onPick(lens)` once a step leaves one lens. */
export function LensPicker({ rx, onPick }) {
  const catalogue = useApp((s) => s.catalogue);
  const advice = useMemo(() => (rx && !rxIsBlank(rx) ? guidance(rx, catalogue) : null), [rx, catalogue]);
  const [family, setFamily] = useState(null);
  const [chosen, setChosen] = useState({});
  const [filter, setFilter] = useState('');

  if (!family) {
    return html`<div class="stack tight">
      ${advice?.reasons?.length > 0 && html`<div class="pad"><${Flag} icon="doc"><strong style="font-weight:500">${tr('From the prescription.')}</strong> ${advice.reasons.join(' ')}<//></div>`}
      <${List}>${FAMILIES.map((f) => html`<${Row} key=${f.id} icon=${f.icon} title=${tr(f.label)} detail=${tr(f.blurb)}
        sub=${advice?.family === f.id ? tr('Suits this prescription') : null} count=${catalogue.rows(f.id).length} chev
        onClick=${() => { setFamily(f.id); setChosen({}); setFilter(''); }} />`)}<//>
    </div>`;
  }

  const fam = familyById(family);
  const step = currentStep(family, chosen);
  const steps = fam.steps;
  const position = steps.indexOf(step) + 1;
  const isLast = position === steps.length;
  const remaining = matches(catalogue, family, chosen).length;
  const all = options(catalogue, family, chosen, step.key);
  const shown = step.filter && filter ? all.filter((o) => fold(o.label + ' ' + o.code + ' ' + o.pos).includes(fold(filter))) : all;
  const choose = (code) => {
    const next = { ...chosen, [step.key]: code };
    setFilter('');
    if (currentStep(family, next)) { setChosen(next); return; }
    const row = matches(catalogue, family, next)[0];
    if (row) onPick(resolve(catalogue, row));
  };

  return html`<div class="stack tight" key=${step.key}>
    <div class="pad gap-s">
      <${ScreenTitle} eyebrow=${tr('Step {n} of {m}', { n: position, m: steps.length })} title=${tr(step.title)} detail=${trn(remaining, '1 option left', '{n} options left')} />
      <div class="step-bar" aria-hidden="true"><i style=${{ width: `${((position - 1) / steps.length) * 100}%` }}></i></div>
      <div class="trail-chips" aria-label=${tr('Chosen so far')}>
        <button type="button" class="chip" title=${tr('Change the lens family')} onClick=${() => { setFamily(null); setChosen({}); setFilter(''); }}>${tr(fam.label)}<${Icon} name="x" /></button>
        ${steps.filter((s) => chosen[s.key] != null).map((s) => html`<button type="button" class="chip" title=${tr('Change {what}', { what: tr(s.title).toLowerCase() })}
          onClick=${() => { setChosen(clearFrom(family, chosen, s.key)); setFilter(''); }}>${chosenLabel(catalogue, family, chosen, s.key)}<${Icon} name="x" /></button>`)}
      </div>
    </div>
    ${step.filter && all.length > 8 && html`<div class="pad"><${SearchField} icon="filter" value=${filter} onInput=${setFilter} placeholder=${tr('Filter')} /></div>`}
    <${List}>
      ${shown.map((o) => html`<${Row} key=${o.code} title=${o.label} badge=${o.maker && html`<${Maker} name=${o.maker} />`} detail=${[o.detail, o.blurb].filter(Boolean).join(' · ')}
        sub=${!o.available ? (o.held ? tr(o.held) : tr('Not sold — the register refuses this one')) : (advice?.highRx?.includes(o.code) && step.key === 'material' ? tr('Suits this prescription') : null)}
        end=${isLast ? money(o.fromPrice) : null} count=${isLast ? null : o.count} off=${!o.available} onClick=${o.available ? () => choose(o.code) : null} />`)}
      ${!shown.length && html`<div class="row"><span class="muted small">${tr('Nothing matches “{a}”.', { a: filter })}</span></div>`}
    <//>
  </div>`;
}

const EYES = [{ value: 'both', label: 'Both eyes' }, { value: 'od', label: 'OD' }, { value: 'os', label: 'OS' }];

/**
 * The lens chosen, priced with the option's frame the way the order prices it
 * (a set's own lens price too), and what goes with it: Plus Protection for
 * glasses, the eyes and boxes for contacts. `onAdd(lines)` gets the option's
 * lines without the frame.
 */
export function HandPickedLens({ lens, frame, claimed, onAdd }) {
  const catalogue = useApp((s) => s.catalogue);
  const plus = catalogue.extras.find((e) => Number(e.percent) > 0) ?? null;
  const contact = lens.family === 'CL';
  const [withPlus, setWithPlus] = useState(false);
  const [eyes, setEyes] = useState('both');
  const [boxes, setBoxes] = useState(1);
  const rest = useMemo(() => [
    ...(contact ? (eyes === 'both' ? ['OD', 'OS'] : [eyes.toUpperCase()]).map((e) => lensLine(lens, e, '', boxes)) : [pairLine(lens)]),
    ...(!contact && withPlus && plus ? [extraLine(plus.id, plus.description, 1, null, plus.percent)] : []),
  ], [lens, contact, eyes, boxes, withPlus, plus]);
  const priced = useMemo(() => {
    const p = priceOrder(resolveOrder({ lines: [...(frame ? [frame] : []), ...rest], claimed }, catalogue));
    const net = (pred) => p.rows.filter((r) => pred(r.line)).reduce((t, r) => t + (r.net ?? 0), 0);
    const pair = p.rows.find((r) => r.line.kind === 'lens')?.line ?? null;
    return {
      total: p.total + p.pending.reduce((t, l) => t + (l.lens?.priceCents ?? 0), 0),
      frame: net((l) => l.kind === 'frame'), lens: net((l) => l.kind === 'lens'), plus: net((l) => l.kind === 'extra' && Number(l.percent) > 0),
      pending: p.pending.length > 0, setLens: pair?.setLens ?? null, outsideSet: pair?.outsideSet ?? null,
    };
  }, [frame, rest, claimed, catalogue]);

  return html`<div class="pad stack tight">
    <${ScreenTitle} eyebrow=${tr(familyById(lens.family)?.label ?? 'Lens')} title=${html`${lens.displayName}${makersOf(lens).map((m) => html` <${Maker} name=${m} />`)}`} />
    ${!lens.available && html`<${Flag}>${tr('This lens is on the printed table but the register will not take it. The price is here so you can explain why, but it cannot go on an order.')}<//>`}
    ${contact ? html`
      <${Seg} label=${tr('Eyes')} value=${eyes} onChange=${setEyes} options=${EYES.map((c) => ({ ...c, label: tr(c.label) }))} />
      <div class="gap-s"><${Eyebrow}>${tr('Boxes per eye')}<//>
        <${Stepper} value=${boxes} min=${1} max=${48} onChange=${setBoxes} label=${tr('Boxes per eye')} />
      </div>`
    : plus && html`<div class="group"><div class="cell"><span class="k">${plus.description}</span>
        <${Toggle} on=${withPlus} onChange=${setWithPlus} label=${plus.description} /></div></div>`}
    <${Panel}>
      ${frame && html`<${KV} k=${tr('Frame')} v=${money(priced.frame)} />`}
      <${KV} k=${contact ? tr('Contact lenses') : tr('Lenses')} v=${priced.pending ? tr('To confirm') : money(priced.lens)} />
      ${!contact && withPlus && html`<${KV} k=${plus.description} v=${money(priced.plus)} />`}
      <${KV} k=${tr('Option total')} v=${money(priced.total)} em />
    <//>
    ${priced.setLens && html`<p class="note">${`${priced.setLens.setName}: ${priced.setLens.name}${priced.setLens.price ? ` +${money(priced.setLens.price)}` : ', ' + tr('included')}`}</p>`}
    ${priced.outsideSet && html`<p class="note">${tr('Not on {set}’s table — the frame goes at its own price', { set: priced.outsideSet.setName })}</p>`}
    ${priced.pending && html`<p class="note">${tr('The lens price is still to confirm')}</p>`}
    <${Anchor} icon="plus" disabled=${!lens.available} onClick=${() => onAdd(rest)}>${tr('Add to quote')}<//>
  </div>`;
}
