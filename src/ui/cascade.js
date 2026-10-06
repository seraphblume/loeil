// One screen, one decision. Every option carries the count of rows it still
// leaves reachable, so he can see how far a choice commits him before making
// it. Options come from the catalogue, never from a fixed list — a combination
// the sheet does not have cannot be built.
//
// The choices live in the URL, so the phone's back gesture steps back one
// decision, and a reload lands exactly where he was.

import { html, useState, useRef, useMemo } from './html.js';
import { useApp } from './hooks.js';
import {
  Bar, Screen, ScreenTitle, Row, List, Eyebrow, Panel, Figure, Flag, Anchor, Sheet, Seg, Stepper, KV,
  SearchField, Empty, useCopy, Dock,
} from './kit.js';
import { Icon } from './icons.js';
import { go, href } from './router.js';
import {
  familyById, options, currentStep, chosenLabel, clearFrom, matches, resolve, rowFor, upgrades, alternatives,
} from '../core/lens.js';
import { eligibility } from '../core/promotions.js';
import { money, moneyDelta } from '../core/money.js';
import { fold, signed } from '../core/util.js';
import { guidance, rxIsBlank } from '../core/crm.js';
import { lensLine, pairLine } from '../core/orders.js';
import { liveSets, setLensFor, rowPriceText, autoDiscountFor } from '../core/sets.js';
import { addLine, toast } from '../state/app.js';

function chosenFrom(family, query) {
  const out = {};
  for (const s of familyById(family).steps) { const v = query.get(s.key); if (v != null) out[s.key] = v; }
  return out;
}

export function CascadeScreen({ family, query }) {
  const fam = familyById(family);
  const catalogue = useApp((s) => s.catalogue);
  const draftRx = useApp((s) => s.draftRx);
  const chosen = chosenFrom(family, query);
  const [filter, setFilter] = useState('');
  const lastDepth = useRef(Object.keys(chosen).length);

  if (!fam) return html`<${Bar} backTo="#/find" title="Lens" /><${Screen}><div class="pad"><${Empty} title="Unknown family" /></div><//>`;

  const step = currentStep(family, chosen);
  const depth = Object.keys(chosen).length;
  const dir = depth >= lastDepth.current ? 'step-fwd' : 'step-back';
  lastDepth.current = depth;

  if (!step) {
    const row = matches(catalogue, family, chosen)[0];
    if (!row) return html`<${Bar} backTo="#/find" title=${fam.label} /><${Screen}><div class="pad"><${Empty} title="Not in the catalogue">That combination is no longer sold. Step back and choose again.<//></div><//>`;
    return html`<${LensScreen} rowId=${row.id} backTo=${href(['find', 'browse', family], clearFrom(family, chosen, fam.steps[fam.steps.length - 1].key))} />`;
  }

  const steps = fam.steps;
  const position = steps.indexOf(step) + 1;
  const remaining = matches(catalogue, family, chosen).length;
  const all = options(catalogue, family, chosen, step.key);
  const shown = step.filter && filter ? all.filter((o) => fold(o.label + ' ' + o.code + ' ' + o.pos).includes(fold(filter))) : all;
  const rx = draftRx && !rxIsBlank(draftRx) ? guidance(draftRx, catalogue) : null;
  const isLast = position === steps.length;

  const choose = (code) => {
    setFilter('');
    go(href(['find', 'browse', family], { ...chosen, [step.key]: code }));
  };

  return html`
    <${Bar} backTo="#/find" title=${fam.label} />
    <${Screen}>
      <div class=${'stack ' + dir} key=${step.key}>
        <div class="pad gap-s">
          <${ScreenTitle} eyebrow=${`Step ${position} of ${steps.length}`} title=${step.title}
            detail=${remaining === 1 ? '1 option left' : `${remaining} options left`} />
          <div class="step-bar" aria-hidden="true"><i style=${{ width: `${((position - 1) / steps.length) * 100}%` }}></i></div>
          ${depth > 0 && html`<div class="trail-chips" aria-label="Chosen so far">
            ${steps.filter((s) => chosen[s.key] != null).map((s) => html`<button type="button" class="chip" title=${`Change ${s.title.toLowerCase()}`}
              onClick=${() => go(href(['find', 'browse', family], clearFrom(family, chosen, s.key)))}>${chosenLabel(catalogue, family, chosen, s.key)}<${Icon} name="x" /></button>`)}
          </div>`}
        </div>

        ${rx && position === 1 && rx.reasons.length > 0 && html`<div class="pad"><${Flag} icon="doc">
          <strong style="font-weight:500">From the prescription.</strong> ${rx.reasons.join(' ')}
          ${rx.family && rx.family !== family ? ' This order may need the other lens family.' : ''}
        <//></div>`}

        ${step.filter && all.length > 8 && html`<div class="pad"><${SearchField} icon="filter" value=${filter} onInput=${setFilter} placeholder="Filter" /></div>`}

        <${List}>
          ${shown.map((o) => html`<${Row} title=${o.label} detail=${[o.detail, o.blurb].filter(Boolean).join(' · ')}
            sub=${!o.available ? 'Not sold — the register refuses this one' : (rx?.highRx?.includes(o.code) && step.key === 'material' ? 'Suits this prescription' : null)}
            end=${isLast ? money(o.fromPrice) : null} count=${isLast ? null : o.count} off=${!o.available} onClick=${() => choose(o.code)} />`)}
          ${!shown.length && html`<div class="row"><span class="muted small">Nothing matches “${filter}”.</span></div>`}
        <//>

      </div>
    <//>`;
}

// ---------------------------------------------------------------------------
// The answer: the codes, the price, the upgrades, the promotions, and the way
// onto an order.

export function LensScreen({ rowId, backTo = '#/find' }) {
  const catalogue = useApp((s) => s.catalogue);
  const row = rowFor(catalogue, rowId);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [copied, copy] = useCopy();

  if (!row) return html`<${Bar} backTo=${backTo} title="Lens" /><${Screen}><div class="pad"><${Empty} title="Not in the catalogue">This lens is not in the current catalogue. It may have been removed in the last publish.<//></div><//>`;

  const lens = resolve(catalogue, row);
  const code = lens.posCode || lens.attributes.map((a) => a.code).join('  ');
  const ups = upgrades(catalogue, row.id);
  // Spectacle lenses go on as the pair; only contacts need an eye and a box count.
  const addPair = async () => {
    await addLine(pairLine(lens));
    toast('Lens added to the order');
    go('#/find/order');
  };

  return html`
    <${Bar} backTo=${backTo} title="Lens" trail=${html`<button class="bar-btn" onClick=${() => setEditing(true)}>Edit</button>`} />
    <${Screen} class="has-dock">
      <div class="stack pad">
        ${!lens.available && html`<${Flag}>This lens is on the printed table but the register will not take it. The price is here so you can explain why, but it cannot go on an order.<//>`}

        <div class="gap-s">
          <${Eyebrow}>${lens.posCode ? 'POS product code' : 'Component codes'}<//>
          <div style="display:flex;align-items:flex-start;gap:8px">
            <div class="pos-code sel" style=${lens.posCode ? '' : 'font-size:18px'}>${code}</div>
            <button class="icon-btn" aria-label="Copy code" onClick=${() => copy(code)}><${Icon} name=${copied ? 'check' : 'copy'} /></button>
          </div>
          ${!lens.posCode && html`<p class="note">No combined code has been observed for contact lenses. These are the component codes.</p>`}
          <div class="silver" style="font-size:14px">${lens.displayName}</div>
        </div>

        <${Panel}>
          ${lens.attributes.map((a) => html`<div class="attr">
            <span class="n">${a.name}</span>
            <span><div class="l">${a.label}</div>${a.pos !== a.label && html`<div class="p">${a.pos}</div>`}</span>
            <span class="c sel">${a.code !== a.label && a.code !== a.pos ? a.code : ''}</span>
          </div>`)}
        <//>

        <${Figure} value=${money(lens.priceCents)} caption=${lens.family === 'CL' ? 'Per box' : 'Per pair'} size=${38} />

        ${ups.length > 0 && html`<section class="gap-s" style="margin:0 calc(-1 * var(--gutter))">
          <div class="pad"><${Eyebrow}>Upgrades<//></div>
          <${List}>${ups.map((u) => html`<${Row} title=${u.row.treatment.label} detail=${u.row.treatment.blurb} end=${moneyDelta(u.delta)}
            onClick=${() => go(href(['find', 'lens', u.row.id]), { replace: true })} />`)}<//>
        </section>`}

        <${SetsSection} lens=${lens} />
        <${PromotionsSection} lens=${lens} />
      </div>
    <//>
    <${Dock}>
      <div class="dock-total"><span class="v">${money(lens.priceCents)}</span><span class="k">${lens.family === 'CL' ? 'Per box' : 'Per pair'}</span></div>
      <${Anchor} icon="plus" disabled=${!lens.available} onClick=${lens.family === 'CL' ? () => setAdding(true) : addPair}>Add to order<//>
    <//>
    ${editing && html`<${ConfigureSheet} row=${row} onClose=${() => setEditing(false)} />`}
    ${adding && html`<${LineEditorSheet} lens=${lens} onClose=${() => setAdding(false)} onAdded=${() => { setAdding(false); go('#/find/order'); }} />`}`;
}

/** Change one attribute at a time; only combinations the catalogue sells are offered. */
function ConfigureSheet({ row, onClose }) {
  const catalogue = useApp((s) => s.catalogue);
  const lens = resolve(catalogue, row);
  const [attr, setAttr] = useState(null);

  if (attr) {
    const alts = alternatives(catalogue, row.id, attr.key);
    return html`<${Sheet} title=${attr.name} onClose=${onClose} left=${html`<button class="bar-btn" onClick=${() => setAttr(null)}><${Icon} name="chevL" />Back</button>`}>
      <${List}>${alts.map((r) => html`<${Row} title=${r[attr.key].label} detail=${r[attr.key].code} end=${html`${money(r.price)}${r.id === row.id ? html` <${Icon} name="check" />` : ''}`}
        off=${!r.available} onClick=${() => { onClose(); go(href(['find', 'lens', r.id]), { replace: true }); }} />`)}<//>
    <//>`;
  }
  return html`<${Sheet} title="Configure" onClose=${onClose} left=${html`<span></span>`} right=${html`<button class="bar-btn" onClick=${onClose}>Done</button>`}>
    <div class="stack tight">
      <${List}>${lens.attributes.map((a) => {
        const n = alternatives(catalogue, row.id, a.key).length;
        return html`<${Row} title=${html`<span class="silver" style="font-size:14px">${a.name}</span>`} end=${html`<span style="text-align:right"><div style="color:var(--platinum);font-size:14px">${a.label}</div><div class="mono tiny muted">${a.code}</div></span>`}
          chev=${n > 1} onClick=${n > 1 ? () => setAttr(a) : null} />`;
      })}<//>
      <p class="note pad">Only combinations the catalogue actually sells are offered. An attribute with no alternative is not editable.</p>
      <div class="pad"><${Panel}><${KV} k="Price" v=${money(lens.priceCents)} em /><//></div>
    </div>
  <//>`;
}

/**
 * Eye, power and box count for one contact lens line — one eye at a time,
 * because the two eyes routinely take different powers and often different
 * products. Spectacle lenses never come here: they go on as the pair.
 */
export function LineEditorSheet({ lens, onClose, onAdded }) {
  const rx = useApp((s) => s.draftRx);
  const [eye, setEye] = useState('OD');
  const [power, setPower] = useState('');
  const [qty, setQty] = useState(1);
  const suggested = useMemo(() => {
    if (!rx || rxIsBlank(rx)) return null;
    const sphere = Number(eye === 'OS' ? rx.os.sphere : rx.od.sphere);
    return sphere ? signed(sphere) : null;
  }, [rx, eye]);

  const add = async () => {
    await addLine(lensLine(lens, eye, power.trim(), qty));
    toast(`${eye} line added`);
    onAdded?.();
  };

  return html`<${Sheet} title="Add line" onClose=${onClose}>
    <div class="pad stack tight">
      <${ScreenTitle} eyebrow="Line" title=${lens.displayName} />
      <p class="para">Contact lenses go on one line per eye. Add the right eye, then the left — they can be different products and usually are different powers.</p>
      <div class="gap-s"><${Eyebrow}>Eye<//>
        <${Seg} label="Eye" value=${eye} onChange=${setEye}
          options=${['OD', 'OS'].map((v) => ({ value: v, label: v }))} />
      </div>
      <div class="gap-s"><${Eyebrow}>Power<//>
        <label class="field">
          <input inputmode="text" autocomplete="off" placeholder=${suggested ?? 'e.g. -2.50'} value=${power} onInput=${(e) => setPower(e.currentTarget.value)} />
          ${suggested && !power && html`<button type="button" class="textbtn small" onClick=${() => setPower(suggested)}>Use ${suggested}</button>`}
        </label>
      </div>
      <div class="gap-s"><${Eyebrow}>Boxes<//>
        <${Stepper} value=${qty} min=${1} max=${48} onChange=${setQty} label="Boxes" />
        <p class="note">The catalogue price is per box. An annual supply is many boxes; a trial is one.</p>
      </div>
      <${Panel}>
        <${KV} k="Per box" v=${money(lens.priceCents)} />
        <${KV} k="Line total" v=${money(lens.priceCents * qty)} em />
      <//>
      <${Anchor} onClick=${add}>Add line<//>
    </div>
  <//>`;
}

/**
 * What this lens costs in each live set: the set's price for frame and single
 * vision lenses, plus this lens's row. Contacts: a campaign discount instead.
 */
function SetsSection({ lens }) {
  const catalogue = useApp((s) => s.catalogue);
  if (lens.family === 'CL') {
    const d = autoDiscountFor(catalogue, { kind: 'lens', lens });
    return d ? html`<${Panel}><${KV} k=${`${d.name} · ${d.id}`} v=${`${money(lens.priceCents - Math.round((lens.priceCents * d.percent) / 100))} per box`} em /><//>` : null;
  }
  const sets = liveSets(catalogue);
  if (!sets.length) return null;
  const hits = sets.map((set) => ({ set, hit: setLensFor(catalogue, set, lens) })).filter((x) => x.hit).sort((a, b) => a.set.price - b.set.price);
  return html`<section class="gap-s" style="margin:0 calc(-1 * var(--gutter))">
    <div class="pad"><${Eyebrow}>In the sets<//></div>
    ${hits.length === 0
      ? html`<p class="note pad">No set’s table names this lens. With a set frame, choose its row on the order, or price it outside the set.</p>`
      : html`<${List}>${hits.map(({ set, hit }) => html`<${Row} to=${'#/find/sets/' + encodeURIComponent(set.id)} title=${`${set.name} + ${hit.def.name}`}
          detail=${`${rowPriceText(hit.entry, money)} on top · ID Maestro ${set.id}`} end=${money(set.price + hit.entry.price)} chev />`)}<//>
        <p class="note pad">With a frame from that set’s brands. Plus Protection, if added, is worked out on these prices.</p>`}
  </section>`;
}

// ---------------------------------------------------------------------------
// Promotions: which apply, and the number he types. No discount is computed —
// the register does the arithmetic.

export function PromotionsSection({ lens }) {
  const catalogue = useApp((s) => s.catalogue);
  const r = eligibility(catalogue, lens);
  return html`<section class="gap-m">
    <${Eyebrow}>${r.packages.length ? 'Promotions that apply' : 'Promotions'}<//>
    ${r.explanation && !r.packages.length && html`<p class="para">${r.explanation}</p>`}
    ${r.packages.map((p) => html`<${PromoCard} p=${p} />`)}
    ${r.packages.length > 0 && html`<p class="note">These are the conditions to check before the number goes into the register. Brand and quantity rules need your judgement — the app does not check them.</p>`}
    ${r.counterparts.length > 0 && html`<div class="gap-m" style="border-top:1px solid var(--hair);padding-top:14px">
      <${Eyebrow}>Same coating, other code<//>
      <p class="para">${lens.attributes.find((a) => a.key === 'treatment')?.code} and ${r.counterpartCode} are one product under the old and new codes. These promotions name the other code, so they are not counted above — check which one the register wants today.</p>
      ${r.counterparts.map((p) => html`<${PromoCard} p=${p} muted />`)}
    </div>`}
  </section>`;
}

function PromoCard({ p, muted }) {
  const [copied, copy] = useCopy();
  return html`<${Panel}>
    <div class="gap-s">
      <div>
        <div style=${{ fontSize: '14px', fontWeight: 500, color: muted ? 'var(--silver)' : 'var(--platinum)' }}>${p.promo.name}</div>
        ${p.entryPriceCents != null && html`<div class="note">Package from ${money(p.entryPriceCents)}</div>`}
      </div>
      <div>
        <${Eyebrow}>Promo number<//>
        <div style="display:flex;align-items:center;gap:6px">
          <span class="mono sel" style=${{ fontSize: '22px', color: muted ? 'var(--silver)' : 'var(--platinum)' }}>${p.promo.id}</span>
          <button class="icon-btn" aria-label="Copy promo number" onClick=${() => copy(p.promo.id)}><${Icon} name=${copied ? 'check' : 'copy'} /></button>
        </div>
      </div>
      ${p.promo.description && html`<div class="silver small">${p.promo.description}</div>`}
      ${p.conditions.length > 0 && html`<div><${Eyebrow}>Conditions<//>${p.conditions.map((c) => html`<div class="silver small">${c}</div>`)}</div>`}
      ${p.promo.notes && html`<p class="note">${p.promo.notes}</p>`}
      ${p.matchedLines[0]?.lensDescription && html`<div class="mono tiny muted">${p.matchedLines[0].lensDescription}</div>`}
    </div>
  <//>`;
}
