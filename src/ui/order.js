// The order and the ticket are the same screen. He builds it in front of the
// customer and reads it out at the billing desk, so there is nothing to switch
// between. The codes are the headline because the codes are the output.

import { html, useState } from './html.js';
import { useApp, useResolvedDraft } from './hooks.js';
import {
  Bar, Screen, Eyebrow, Panel, Figure, Anchor, Secondary, Row, List, Section, Sheet, Empty, Seg,
  SearchField, Confirm, useCopy, KV, Flag, Dock, Toggle,
} from './kit.js';
import { Icon } from './icons.js';
import { go } from './router.js';
import { PromotionsSection } from './cascade.js';
import { money } from '../core/money.js';
import {
  lineCode, lineText, lineQuantity, orderTotal, priceOrder, extraLine, lensesOf, STATUSES, ticketText,
  isPair, isShare, isGlasses, discountable, needsAob, aobMissing, isPlaceholder, lineFit, clientPays,
} from '../core/orders.js';
import { OrderRxSheet, rxSummary, FitEye } from './rx.js';
import { addOrderToQuote } from './quote.js';
import { OrderGifts } from './gifts.js';
import { AllianceRow, AllianceSheet, AlliancePaperwork, AllianceTotals } from './alliance.js';
import { allianceFlags } from '../core/alliances.js';
import { PresetSheet } from './presets.js';
import { FramePickSheet } from './framepick.js';
import { solutionClash, clashParts, polarexCrizalLines, POLAREX_CRIZAL } from '../core/presets.js';
import { LINE_DISCOUNTS } from '../config.js';
import { promoNumbers, setTable, rowPriceText, claimableDiscounts, savingOf, hitText } from '../core/sets.js';
import { FAMILIES } from '../core/lens.js';
import { eligibility } from '../core/promotions.js';
import { guidance, rxIsBlank, newClient, CL_FITS, fitComplete, fitText, blankFit } from '../core/crm.js';
import { fold } from '../core/util.js';
import {
  removeLine, clearDraft, setDraftClient, saveDraftTo, addLine, toast, clientById, upsertClient, updateLine, setOrderFrame, setDraftClaim,
} from '../state/app.js';

/** The chip a line's discount shows: `−30% · 9027`, `8922 · $2,099`, `−20% · 461`. */
function discountChip(r) {
  const l = r.line;
  if (l.auto?.price != null && typeof l.discount !== 'number') return `${l.auto.id} · ${money(l.auto.price)}`;
  if (r.discount) return `−${r.discount}%${r.auto ? ` · ${l.auto.id}` : ''}`;
  return null;
}

export function CodesBlock({ order }) {
  const [copied, copy] = useCopy();
  if (!order.lines.length) return null;
  const promos = promoNumbers(order);
  const all = [...order.lines.map((l) => `${lineCode(l)}  x${lineQuantity(l)}`), ...promos.map((x) => `${x.id}  ${x.name}`)].join('\n');
  return html`<div class="gap-s">
    <div style="display:flex;justify-content:space-between;align-items:center">
      <${Eyebrow}>${order.lines.length === 1 ? 'Code' : 'Codes'}<//>
      <button class="icon-btn" aria-label="Copy all codes" onClick=${() => copy(all, 'all')}><${Icon} name=${copied === 'all' ? 'check' : 'copy'} /></button>
    </div>
    ${order.lines.map((l) => html`<div class="code-line"><span class="code sel">${lineCode(l)}</span><span class="qty">×${lineQuantity(l)}</span></div>`)}
    ${promos.length > 0 && html`<div class="gap-s" style="margin-top:6px">
      <${Eyebrow}>${promos.length === 1 ? 'Promotion number' : 'Promotion numbers'}<//>
      ${promos.map((x) => html`<div class="code-line"><span class="code sel">${x.id}</span><span class="qty" style="font-family:inherit">${x.name}</span></div>`)}
    </div>`}
  </div>`;
}

export function LinesPanel({ order, editable }) {
  const [open, setOpen] = useState(null);
  const catalogue = useApp((s) => s.catalogue);
  const p = priceOrder(order);
  // An alliance that does not combine takes the seller's own line discount off too.
  const noDiscounts = Boolean(order.ally && !order.ally.combines);
  return html`<section class="gap-s">
    <${Eyebrow}>${p.rows.length === 1 ? '1 line' : `${p.rows.length} lines`}<//>
    <${Panel} tight>
      ${p.rows.map((r) => {
        const l = r.line;
        const steps = editable && (l.kind === 'extra' ? !isShare(l) : l.kind === 'lens' && !isPair(l));
        const inSet = l.kind === 'frame' && (l.set || l.setAvailable);
        const via = l.ally?.packaged ? 'In the plan’s package'
          : l.setExcluded ? `${l.setExcluded.name} doesn’t include these lenses · ${l.placeholder ? 'from its lowest catalogue price' : 'frame at its full price'}`
          : l.outsideSet ? `Not in ${l.outsideSet.setName}’s table · its own price`
          : l.placeholder && !l.set ? 'Quoted by brand · from its lowest catalogue price'
          : l.placeholder && l.set ? `${l.set.name} · any frame of the set, with single vision lenses`
          : l.setLens?.id ? `${l.setLens.setName} · ${l.setLens.name}`
          : l.kind === 'lens' && l.auto?.price != null && typeof l.discount !== 'number' ? `${l.auto.name} · instead of ${money(l.lens.priceCents)}`
          : l.set ? `${l.set.name} · frame and single vision lenses${l.priceCents != null && l.priceCents !== l.set.price ? ` · tag ${money(l.priceCents)}` : ''}`
            : isShare(l) ? `${l.percent}% of ${money(r.base)} at list price`
              : isPair(l) ? [l.presetName, l.quantity === 2 ? 'The pair' : `${l.eye} only`].filter(Boolean).join(' · ') : null;
        return html`<div class="ol" key=${l.id}>
          <div class="what">
            <div class="name">${lineText(l)}</div>
            ${via && html`<div class="via">${via}</div>`}
            <div class="meta">
              <span class="mono">${lineCode(l) || (l.placeholder ? 'frame not chosen' : '')}</span>
              ${l.kind === 'frame' && l.priceSource === 'tag' && !l.set && html`<span class="tiny muted">from the tag</span>`}
              ${inSet && (editable
                ? html`<button type="button" class=${'chip' + (l.set ? ' on' : '')} onClick=${() => setOpen({ kind: 'set', r })}>${l.set ? `Set ${l.set.id}` : l.setExcluded ? 'Not in the set' : 'Outside the set'}</button>`
                : l.set && html`<span class="chip on">Set ${l.set.id}</span>`)}
              ${l.setLens && editable && html`<button type="button" class=${'chip' + (r.pending ? ' warn' : '')} onClick=${() => setOpen({ kind: 'row', r })}>${r.pending ? 'Choose its row' : 'Row'}</button>`}
              ${l.outsideSet && editable && html`<button type="button" class="chip" onClick=${() => setOpen({ kind: 'row', r })}>Price in the set</button>`}
              ${lineFit(l, catalogue) && (editable
                ? html`<button type="button" class=${'chip' + (fitComplete(lineFit(l, catalogue), l.measures) ? '' : ' warn')} onClick=${() => setOpen({ kind: 'fit', r })}>${fitComplete(lineFit(l, catalogue), l.measures) ? 'Fitting' : 'Add the fitting'}</button>`
                : !fitComplete(lineFit(l, catalogue), l.measures) && html`<span class="chip warn">Fitting missing</span>`)}
              ${l.auto?.pending && !l.setLens && html`<button type="button" class="chip warn" onClick=${() => editable && setOpen({ kind: 'discount', r })}>${l.auto.id} · price to confirm</button>`}
              ${l.ally?.packaged && html`<span class="chip on">Package ${l.ally.convenio}</span>`}
              ${discountable(l) && !r.pending && (editable && !noDiscounts
                ? html`<button type="button" class=${'chip' + (discountChip(r) ? ' on' : '')} onClick=${() => setOpen({ kind: 'discount', r })}>${discountChip(r) ?? 'Discount'}</button>`
                : discountChip(r) && html`<span class="chip on">${discountChip(r)}</span>`)}
              ${!discountable(l) && discountChip(r) && html`<span class="chip on">${discountChip(r)}</span>`}
              ${l.kind === 'extra' && !isShare(l) && l.priceCents === 1 && html`<span class="tiny muted">gift</span>`}
            </div>
          </div>
          <div class="money">
            ${r.off > 0 && html`<div class="was">${money(r.list)}</div>`}
            <div class=${'now' + (r.net == null ? ' soft' : '')} key=${r.net}>${r.pending ? (l.setLens ? 'Row?' : 'To confirm') : r.net == null ? 'At register' : money(r.net)}</div>
            ${steps
              ? html`<div class="steps">
                  <button class="icon-btn" aria-label="One fewer" onClick=${() => (l.quantity > 1 ? updateLine(l.id, { quantity: l.quantity - 1 }) : removeLine(l.id))}>−</button>
                  <span class="tiny muted num">×${lineQuantity(l)}</span>
                  <button class="icon-btn" aria-label="One more" onClick=${() => updateLine(l.id, { quantity: l.quantity + 1 })}>+</button>
                </div>`
              : html`<div class="qty">×${lineQuantity(l)}</div>`}
          </div>
          ${editable ? html`<button class="icon-btn rm" aria-label="Remove line" onClick=${() => { removeLine(l.id); toast('Line removed'); }}><${Icon} name="x" size=${15} /></button>` : html`<span></span>`}
        </div>`;
      })}
    <//>
    ${open?.kind === 'discount' && html`<${DiscountSheet} row=${open.r} onClose=${() => setOpen(null)} />`}
    ${open?.kind === 'set' && html`<${SetFrameSheet} line=${open.r.line} onClose=${() => setOpen(null)} />`}
    ${open?.kind === 'row' && html`<${SetRowSheet} line=${open.r.line} onClose=${() => setOpen(null)} />`}
    ${open?.kind === 'fit' && html`<${FitSheet} line=${open.r.line} fit=${lineFit(open.r.line, catalogue)} onClose=${() => setOpen(null)} />`}
  </section>`;
}

/** The campaign's discount if one applies, none, or a set percentage — each with what the line comes to. */
function DiscountSheet({ row, onClose }) {
  const l = row.line;
  const auto = l.offer ?? null; // what applies without the seller, worked out with the order
  // The line's own price: a lens an offer reprices goes back to its catalogue price without it.
  const list = l.kind === 'lens' && !l.setLens ? l.lens.priceCents : row.list ?? l.priceCents ?? 0;
  const pick = (pct) => { updateLine(l.id, { discount: pct }); onClose(); };
  const at = (pct) => money(list - Math.round((list * pct) / 100));
  const manual = typeof l.discount === 'number';
  const autoEnd = auto ? (auto.pending ? 'To confirm' : auto.price != null ? money(auto.price) : money(list - savingOf(auto, list))) : '';
  return html`<${Sheet} title="Discount" onClose=${onClose}>
    <div class="stack tight">
      <p class="para pad">${lineText(l)}</p>
      <${List}>
        ${auto && html`<${Row} title=${auto.name} detail=${`Promotion ${auto.id} · ${hitText(auto, money)}`}
          end=${html`${autoEnd}${!manual ? html` <${Icon} name="check" />` : ''}`} onClick=${() => pick(undefined)} />`}
        ${[0, ...LINE_DISCOUNTS].map((pct) => html`<${Row} title=${pct ? `${pct}% off` : 'No discount'}
          end=${html`${at(pct)}${manual && l.discount === pct ? html` <${Icon} name="check" />` : !auto && !manual && pct === 0 ? html` <${Icon} name="check" />` : ''}`} onClick=${() => pick(pct)} />`)}
      <//>
      ${auto?.pending && html`<p class="note pad">The offer covers this lens, but its price under the offer is not in the catalogue yet. Confirm it at the register, or choose No discount to quote the lens at its own price.</p>`}
      ${isGlasses(l) && html`<p class="note pad">${isPair(l) ? 'On the pair. ' : ''}Plus Protection is worked out on the list price, before the discount.</p>`}
    </div>
  <//>`;
}

/** A contact lens line's fitting, for its eye: SPH K1 K2 RC DIA, or SE ADD. */
function FitSheet({ line, fit, onClose }) {
  const side = line.eye === 'OS' ? 'os' : 'od';
  const [m, setM] = useState(() => ({ ...blankFit(fit), ...(line.measures ?? {}) }));
  const save = () => { updateLine(line.id, { measures: m, power: fitText(fit, m), fit }); toast('Fitting saved'); onClose(); };
  return html`<${Sheet} title="Fitting" onClose=${onClose}>
    <div class="pad stack tight">
      <p class="para">${line.lens.displayName}</p>
      <div class="rx-entry"><div class="rx-eyes"><${FitEye} fit=${fit} side=${side} prefix="fit" m=${m} onChange=${setM} /></div></div>
      <p class="note">${CL_FITS[fit]?.note ?? ''}</p>
      <${Anchor} disabled=${!fitComplete(fit, m)} onClick=${save}>Save the fitting<//>
    </div>
  <//>`;
}

/** A frame in a set: what the set includes, and the way out of it. */
function SetFrameSheet({ line, onClose }) {
  const catalogue = useApp((s) => s.catalogue);
  const info = line.set ?? line.setAvailable;
  const set = catalogue.setsById.get(info.id);
  const included = set ? setTable(catalogue, set).filter((r) => !r.entry.price).map((r) => r.def.name) : [];
  const toggle = (noSet) => { updateLine(line.id, { noSet }); onClose(); };
  return html`<${Sheet} title=${info.name} onClose=${onClose}>
    <div class="pad stack tight">
      <${Panel}>
        <${KV} k="ID Maestro" v=${info.id} mono />
        <${KV} k="Set price" v=${money(info.price)} em />
        ${line.priceCents != null && html`<${KV} k="Tag price" v=${money(line.priceCents)} />`}
      <//>
      <p class="para">The frame with single vision lenses${included.length ? ` — ${included.join(', ').toLowerCase()} included` : ''}. Better lenses add their row of the set’s table.</p>
      ${line.setExcluded ? html`<p class="para">The lenses on this order are not in the set’s table, so neither is the frame: it goes at its full price and the lenses at their own. For a lens the register prices on a row anyway (a tint), choose it with “Price in the set” on the lens.</p>`
        : line.set
        ? html`<${Secondary} onClick=${() => toggle(true)}>Price outside the set<//>
          <p class="note">The frame goes back to its tag price and the lenses to their catalogue price.</p>`
        : html`<${Anchor} onClick=${() => toggle(false)}>Use ${info.name}<//>`}
      ${set && html`<button class="btn quiet" onClick=${() => { onClose(); go('#/find/sets/' + encodeURIComponent(set.id)); }}>See the set’s table</button>`}
    </div>
  <//>`;
}

/** The lens's row in the set's table. Matched on its own where it can be; his choice wins. */
function SetRowSheet({ line, onClose }) {
  const catalogue = useApp((s) => s.catalogue);
  const setId = line.setLens?.setId ?? line.outsideSet?.setId;
  const set = catalogue.setsById.get(setId);
  if (!set) return null;
  const rows = setTable(catalogue, set);
  const groups = [...new Set(rows.map((r) => r.def.group))];
  const pick = (id) => { updateLine(line.id, { setLensId: id }); onClose(); };
  return html`<${Sheet} title=${`${set.name} · lens row`} onClose=${onClose} full>
    <div class="stack tight">
      <p class="para pad">${line.lens.displayName}</p>
      ${line.setLens?.id && line.setLens.auto && html`<p class="note pad">Matched on its own to “${line.setLens.name}”. Choose another row if the lens on the register is a different one.</p>`}
      ${!line.setLens?.id && html`<p class="note pad">This lens is not one the set’s table names, so the frame and lens go at their full prices. Pick a row only if the register prices this lens on one (a tint).</p>`}
      ${groups.map((g) => html`<${Section} title=${g}>
        ${rows.filter((r) => r.def.group === g).map((r) => html`<${Row} title=${r.def.name}
          end=${html`${rowPriceText(r.entry, money)}${line.setLens?.id === r.def.id ? html` <${Icon} name="check" />` : ''}`} onClick=${() => pick(r.def.id)} />`)}
      <//>`)}
      ${line.setLensId && html`<div class="pad"><button class="btn quiet" onClick=${() => pick(undefined)}>Match it on its own again</button></div>`}
    </div>
  <//>`;
}

export function TotalBlock({ order, figure = true }) {
  const p = priceOrder(order);
  const rest = p.unpriced;
  if (!figure && !p.pending.length && !p.off && !rest.length && !p.alliance) return null;
  return html`<div class="gap-m">
    ${p.pending.some((l) => l.setLens) && html`<${Flag}>${p.pending.filter((l) => l.setLens).length === 1 ? 'A lens in a set has' : 'Lenses in a set have'} no row of the set’s table yet. Choose it on the line to finish the price.<//>`}
    ${p.pending.some((l) => !l.setLens) && html`<${Flag}>${p.pending.filter((l) => !l.setLens).map((l) => `${l.auto.id} ${l.auto.name}`)[0]}: this lens’s price under the offer is not known yet. Confirm it at the register.<//>`}
    ${figure && html`<${Figure} value=${money(clientPays(p))} caption=${p.alliance ? 'Client pays' : p.pending.length ? 'Total so far' : 'Total'} size=${40} />`}
    ${p.alliance?.minimumMissing && html`<${Flag}>Below ${money(order.ally.outside.minimumList)} at list price, so the ${order.ally.outside.percent}% outside the plan does not apply yet.<//>`}
    ${p.alliance && html`<${AllianceTotals} order=${order} p=${p} />`}
    ${p.off > 0 && !p.alliance && html`<${Panel}>
      <${KV} k="Before discounts" v=${money(p.list)} />
      <${KV} k="Discounts" v=${'−' + money(p.off)} />
    <//>`}
    ${rest.length > 0 && html`<div class="gap-s">
      <${Eyebrow}>Priced at the register<//>
      ${rest.map((l) => html`<div style="display:flex;gap:8px;font-size:12px"><span class="mono muted">${lineCode(l)}</span><span class="silver" style="flex:1">${lineText(l)}</span><span class="muted num">×${lineQuantity(l)}</span></div>`)}
      <p class="note">These are not in the catalogue or the accessory price list. The register prices them, so they are not in the total above.</p>
    </div>`}
  </div>`;
}

/** Every distinct lens on the order that qualifies for something. Silent otherwise. */
export function OrderPromotions({ order }) {
  const catalogue = useApp((s) => s.catalogue);
  const seen = new Set();
  const lenses = lensesOf(order).filter((l) => (seen.has(l.rowId) ? false : seen.add(l.rowId)))
    .filter((l) => { const r = eligibility(catalogue, l); return r.packages.length || r.counterparts.length; });
  if (!lenses.length) return null;
  return html`<div class="gap-m">${lenses.map((l) => html`<div class="gap-s">
    ${lenses.length > 1 && html`<div class="small muted">${l.displayName}</div>`}
    <${PromotionsSection} lens=${l} />
  </div>`)}</div>`;
}

export async function shareText(text, title) {
  if (navigator.share) {
    try { await navigator.share({ text, title }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  try { await navigator.clipboard.writeText(text); toast('Ticket copied — paste it into WhatsApp'); } catch { toast('Could not share from this browser'); }
}

export function OrderScreen() {
  const draft = useResolvedDraft();
  const client = useApp((s) => clientById(s.draft.clientId, s));
  const [sheet, setSheet] = useState(null);
  const catalogue = useApp((s) => s.catalogue);
  const rx = useApp((s) => s.draftRx);
  const p = priceOrder(draft);
  const has = draft.lines.length > 0;
  const aob = needsAob(draft, catalogue);
  const missing = aobMissing(draft, catalogue);
  const clash = solutionClash(draft, catalogue);
  const heldPairs = polarexCrizalLines(draft, catalogue);
  const noFit = draft.lines.filter((l) => lineFit(l, catalogue) && !fitComplete(lineFit(l, catalogue), l.measures));
  // A discount the client claims (Sam's) does not combine with an alliance that does not combine.
  const claimable = draft.ally && !draft.ally.combines ? [] : claimableDiscounts(catalogue);
  const claimed = new Set(draft.claimed ?? []);
  const history = useApp((s) => s.orders);
  const allyFlags = allianceFlags(draft, catalogue, history.filter((o) => o.clientId && o.clientId === draft.clientId));

  return html`
    <${Bar} backTo="#/find" title="Order" trail=${has ? html`<button class="bar-btn" onClick=${() => setSheet('clear')}>Clear</button>` : null} />
    <${Screen} class=${has ? 'has-dock' : ''}>
      <div class="stack">
        <${List}>
          <${Row} icon="person" title=${client ? client.name : 'No client yet'} detail=${client ? 'This order is for them' : 'Choose who this order is for'} chev onClick=${() => setSheet('client')} />
          <${Row} icon="eye" title="Prescription" detail=${rxSummary(rx) ?? 'Enter the prescription for this job'} one
            end=${aob ? (missing ? html`<span class="badge warn">AOB</span>` : html`<span class="badge">AOB ${draft.aob.od} · ${draft.aob.os}</span>`) : null}
            chev onClick=${() => setSheet('rx')} />
          <${AllianceRow} order=${draft} p=${p} onOpen=${() => setSheet('alliance')} />
          ${claimable.map((d) => html`<${Row} key=${d.id} icon="tag" title=${d.name} detail=${`Shows: ${d.requires} · ${d.id}`}
            end=${html`<${Toggle} on=${claimed.has(d.id)} label=${d.name} onChange=${(on) => { setDraftClaim(d.id, on); toast(on ? `${d.name}: ${d.percent ? `${d.percent}% off` : 'on'} what no set or other discount covers` : `${d.name} off`); }} />`} />`)}
        <//>
        ${clash.length > 0 && html`<div class="pad"><div class="caution" role="alert">
          <${Icon} name="warning" />
          <div class="caution-main">
            <div class="caution-t">Voids the ${clashParts(draft, catalogue)} warranty</div>
            <div class="caution-d">Cleaning solutions damage the coating. Offer a microfibre cloth instead.</div>
            <div class="caution-items">${clash.map((l) => html`<div class="caution-item" key=${l.id}><span>${l.description}</span>
              <button type="button" class="caution-btn" onClick=${() => { removeLine(l.id); toast('Removed from the order'); }}>Remove</button></div>`)}</div>
          </div>
        </div></div>`}
        ${heldPairs.length > 0 && html`<div class="pad"><div class="caution" role="alert">
          <${Icon} name="warning" />
          <div class="caution-main">
            <div class="caution-t">${POLAREX_CRIZAL}</div>
            <div class="caution-d">The lab does not make Polarex with a Crizal coating. HD anti-reflective is the best coating Polarex takes — or Transitions, for Crizal.</div>
            <div class="caution-items">${heldPairs.map((l) => html`<div class="caution-item" key=${l.id}><span>${l.lens.displayName}</span>
              <button type="button" class="caution-btn" onClick=${() => { removeLine(l.id); toast('Removed from the order'); }}>Remove</button></div>`)}</div>
          </div>
        </div></div>`}
        ${draft.lines.some(isPlaceholder) && html`<div class="pad"><${Flag} icon="glasses">The frame is quoted ${draft.lines.find(isPlaceholder).setId ? 'by its set' : 'by brand'} — scan the frame the client chooses; it takes its place, then Checkout.<//></div>`}
        <${OrderGifts} order=${draft} />
        ${noFit.length > 0 && html`<div class="pad"><${Flag}>${noFit.length === 1 ? 'A contact lens needs its' : 'Contact lenses need their'} fitting (${[...new Set(noFit.map((l) => CL_FITS[lineFit(l, catalogue)].fields.map((f) => f.label).join(' ')))].join('; ')}). Tap “Add the fitting” on the line.<//></div>`}
        ${allyFlags.map((f) => html`<div class="pad"><${Flag} icon="shield">${f}<//></div>`)}
        ${missing && html`<div class="pad"><${Flag}>${pairCount(draft) > 1 ? 'Lenses on this order need' : 'The lens on this order needs'} the AOB of each eye. <button type="button" class="link" onClick=${() => setSheet('aob')}>Add the AOB</button><//></div>`}

        ${has
          ? html`<div class="pad stack">
              <${LinesPanel} order=${draft} editable />
              <${TotalBlock} order=${draft} figure=${false} />
              ${!(draft.ally && !draft.ally.combines) && html`<${OrderPromotions} order=${draft} />`}
            </div>
            ${draft.alliance && html`<${AlliancePaperwork} order=${draft} editable />`}`
          : html`<div class="pad"><${Empty} title="Nothing on this order yet">Scan a frame, walk a lens, or add a case. When it is ready, Checkout prints the receipt with every code the register needs.<//></div>`}

        <${Section} title="Add">
          <${Row} icon="spark" title="Lifestyle preset" detail="Lens, Plus Protection and accessories in one tap" chev onClick=${() => setSheet('preset')} />
          <${Row} icon="lens" title="Lens" chev onClick=${() => setSheet('lens')} />
          <${Row} icon="barcode" title="Scan a frame or stock item" chev onClick=${() => go('#/find/scan')} />
          <${Row} icon="glasses" title="Browse frames" chev onClick=${() => go('#/find/frames')} />
          <${Row} icon="tag" title="Frame brand or set" detail="For a quote, before the frame is chosen" chev onClick=${() => setSheet('framepick')} />
          <${Row} icon="box" title="Case, solution or extra" chev onClick=${() => setSheet('extra')} />
        <//>

        ${has && html`<div class="pad btn-row">
          <${Secondary} icon="tag" onClick=${addOrderToQuote}>Add to quote<//>
          <${Secondary} icon="check" onClick=${() => setSheet('save')}>Save to client<//>
        </div>`}
      </div>
    <//>
    ${has && html`<${Dock}>
      <div class="dock-total"><span class="v" key=${clientPays(p)}>${money(clientPays(p))}</span><span class="k">${p.alliance ? 'Client pays' : p.pending.length ? 'So far' : 'Total'}</span></div>
      ${draft.lines.some(isPlaceholder)
        ? html`<${Anchor} icon="barcode" onClick=${() => go('#/find/scan')}>Scan the frame<//>`
        : html`<${Anchor} icon="receipt" onClick=${() => go('#/find/checkout')}>Checkout<//>`}
    <//>`}
    ${sheet === 'clear' && html`<${Confirm} title="Clear this order?" message="Every line on the order in progress will be removed. Saved orders are not affected." action="Clear order"
      onConfirm=${() => { clearDraft(); toast('Order cleared'); }} onClose=${() => setSheet(null)} />`}
    ${sheet === 'client' && html`<${ClientPickerSheet} title="Who is this for?" onClose=${() => setSheet(null)} onPick=${(c) => { setDraftClient(c.id); setSheet(null); }} />`}
    ${sheet === 'lens' && html`<${LensFamilySheet} onClose=${() => setSheet(null)} />`}
    ${sheet === 'extra' && html`<${AddExtraSheet} onClose=${() => setSheet(null)} />`}
    ${sheet === 'save' && html`<${SaveSheet} onClose=${() => setSheet(null)} />`}
    ${(sheet === 'rx' || sheet === 'aob') && html`<${OrderRxSheet} start=${sheet} onClose=${() => setSheet(null)} />`}
    ${sheet === 'preset' && html`<${PresetSheet} onClose=${() => setSheet(null)} />`}
    ${sheet === 'alliance' && html`<${AllianceSheet} onClose=${() => setSheet(null)} />`}
    ${sheet === 'framepick' && html`<${FramePickSheet} title="Frame brand or set" start="brand" onClose=${() => setSheet(null)}
      onPick=${async (line) => { await setOrderFrame(line); toast(`${line.brand || line.description} on the order`); }} />`}`;
}

const pairCount = (order) => order.lines.filter((l) => isPair(l)).length;

function LensFamilySheet({ onClose }) {
  const catalogue = useApp((s) => s.catalogue);
  const rx = useApp((s) => s.draftRx);
  const g = rx && !rxIsBlank(rx) ? guidance(rx, catalogue) : null;
  return html`<${Sheet} title="Add a lens" onClose=${onClose}>
    <div class="stack tight">
      ${g?.reasons.length > 0 && html`<p class="para pad">${g.reasons.join(' ')}</p>`}
      <${List}>${FAMILIES.map((f) => html`<${Row} icon=${f.icon} title=${f.label} detail=${f.blurb}
        sub=${g?.family === f.id ? 'Suggested by the prescription' : null} count=${catalogue.rows(f.id).length}
        onClick=${() => { onClose(); go('#/find/browse/' + f.id); }} />`)}<//>
    </div>
  <//>`;
}

/** The price list's collections in the order a seller reaches for them; gifts last. */
const COLLECTION_ORDER = (c) => (/gift/i.test(c) ? 2 : /solution/i.test(c) ? 1 : 0);

/**
 * Add an extra: Plus Protection, then the accessory price list by collection,
 * each at its price. No stock counts — they drift between imports; a code the
 * list lacks is scanned instead, and the register prices it.
 */
function AddExtraSheet({ onClose }) {
  const catalogue = useApp((s) => s.catalogue);
  const [term, setTerm] = useState('');
  const t = fold(term).trim();
  const listed = new Set(catalogue.accessories.map((a) => a.sku));
  // Add-ons are what the price list cannot hold: a percentage of the glasses.
  const addons = catalogue.extras.filter((e) => e.percent || !listed.has(e.id))
    .filter((e) => !t || fold(e.description).includes(t) || e.id.includes(term.trim()));
  const items = catalogue.accessories.filter((a) => !t || fold(`${a.description} ${a.collection}`).includes(t) || a.sku.includes(term.trim()) || (a.product ?? '').includes(term.trim()));
  const groups = [...new Set(items.map((a) => a.collection || 'Other'))].sort((a, b) => COLLECTION_ORDER(a) - COLLECTION_ORDER(b));
  const add = async (line) => { await addLine(line); toast('Added to the order'); onClose(); };
  const price = (a) => (a.price <= 1 ? html`<span class="muted">Gift</span>` : money(a.price));
  return html`<${Sheet} title="Add an extra" onClose=${onClose} full>
    <div class="stack tight">
      <div class="pad"><${SearchField} value=${term} onInput=${setTerm} placeholder="Description, barcode or collection" /></div>
      ${addons.length > 0 && html`<${Section}>
        ${addons.map((e) => html`<${Row} key=${e.id} icon=${e.percent ? 'shield' : 'plus'} title=${e.description}
          detail=${e.percent ? `${e.percent}% of the frame and lenses at list price, before discounts` : e.id}
          end=${e.percent ? `${e.percent}%` : null} onClick=${() => add(extraLine(e.id, e.description, 1, null, e.percent))} />`)}
      <//>`}
      ${groups.map((g) => html`<${Section} key=${g} title=${g}>
        ${items.filter((a) => (a.collection || 'Other') === g).map((a) => html`<${Row} key=${a.sku} title=${a.description} detail=${a.sku} mono
          end=${price(a)} onClick=${() => add(extraLine(a.sku, a.description, 1, null))} />`)}
      <//>`)}
      ${!items.length && !addons.length && html`<div class="pad"><${Empty} title="Nothing matches">Try another word, or scan the item’s barcode.<//></div>`}
      <p class="note pad">Not in the list? Scan its barcode — the register prices it. A gift is $0.01.</p>
    </div>
  <//>`;
}

export function ClientPickerSheet({ title, onClose, onPick }) {
  const clients = useApp((s) => s.clients);
  const [term, setTerm] = useState('');
  const t = fold(term);
  const list = clients.filter((c) => !t || fold(c.name).includes(t) || c.phone.includes(term));
  const create = async () => {
    const c = { ...newClient(term.trim()) };
    await upsertClient(c);
    onPick(c);
  };
  return html`<${Sheet} title=${title} onClose=${onClose} full>
    <div class="stack tight">
      <div class="pad"><${SearchField} value=${term} onInput=${setTerm} placeholder="Name or phone" autofocus /></div>
      ${term.trim() && html`<${List}><${Row} icon="plus" title=${`New client “${term.trim()}”`} onClick=${create} /><//>`}
      ${!clients.length && !term && html`<div class="pad"><${Empty} title="No clients yet">Type a name above to add one now.<//></div>`}
      <${List}>${list.map((c) => html`<${Row} title=${c.name} detail=${c.phone} badge=${c.isFavourite ? html`<${Icon} name="starFill" />` : null} onClick=${() => onPick(c)} />`)}<//>
    </div>
  <//>`;
}

function SaveSheet({ onClose }) {
  const draft = useResolvedDraft();
  const client = useApp((s) => clientById(s.draft.clientId, s));
  const [status, setStatus] = useState('presented');
  const [picking, setPicking] = useState(!client);
  const save = async (c) => {
    const saved = await saveDraftTo(c.id, status);
    toast(status === 'sold' ? 'Sold — saved to their history' : 'Order saved');
    onClose();
    go('#/orders/' + saved.id, { replace: true });
  };
  if (picking) return html`<${ClientPickerSheet} title="Save to client" onClose=${onClose} onPick=${(c) => { setDraftClient(c.id); setPicking(false); }} />`;
  return html`<${Sheet} title="Save order" onClose=${onClose}>
    <div class="pad stack tight">
      <${Panel}>
        <${KV} k="Client" v=${client?.name} />
        <${KV} k="Total" v=${money(orderTotal(draft))} em />
      <//>
      <div class="gap-s"><${Eyebrow}>Status<//>
        <${Seg} label="Status" value=${status} onChange=${setStatus} options=${STATUSES.filter((s) => s.id !== 'lost').map((s) => ({ value: s.id, label: s.label }))} />
        <p class="note">Sold makes it part of their purchase history and restarts their recall clock.</p>
      </div>
      <${Anchor} onClick=${() => save(client)}>Save<//>
      <button class="btn quiet" onClick=${() => setPicking(true)}>Choose a different client</button>
    </div>
  <//>`;
}
