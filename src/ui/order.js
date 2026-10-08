// The order and the ticket are the same screen. He builds it in front of the
// customer and reads it out at the billing desk, so there is nothing to switch
// between. The codes are the headline because the codes are the output.

import { html, useState } from './html.js';
import { useApp, useResolvedDraft } from './hooks.js';
import {
  Bar, Screen, Eyebrow, Panel, Figure, Anchor, Secondary, Row, List, Section, Sheet, Empty, Seg,
  SearchField, Confirm, useCopy, KV, Flag, Dock,
} from './kit.js';
import { Icon } from './icons.js';
import { go } from './router.js';
import { PromotionsSection } from './cascade.js';
import { money } from '../core/money.js';
import {
  lineCode, lineText, lineQuantity, orderTotal, priceOrder, extraLine, lensesOf, STATUSES, ticketText,
  isPair, isShare, isGlasses, discountable, needsAob, aobMissing,
} from '../core/orders.js';
import { OrderRxSheet, rxSummary } from './rx.js';
import { addOrderToQuote } from './quote.js';
import { PresetSheet } from './presets.js';
import { solutionClash } from '../core/presets.js';
import { LINE_DISCOUNTS } from '../config.js';
import { promoNumbers, autoDiscountFor, setTable, rowPriceText } from '../core/sets.js';
import { FAMILIES } from '../core/lens.js';
import { stockLabel } from '../core/catalogue.js';
import { eligibility } from '../core/promotions.js';
import { guidance, rxIsBlank, newClient } from '../core/crm.js';
import { fold } from '../core/util.js';
import {
  removeLine, clearDraft, setDraftClient, saveDraftTo, addLine, toast, clientById, upsertClient, updateLine,
} from '../state/app.js';

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
  const p = priceOrder(order);
  return html`<section class="gap-s">
    <${Eyebrow}>${p.rows.length === 1 ? '1 line' : `${p.rows.length} lines`}<//>
    <${Panel} tight>
      ${p.rows.map((r) => {
        const l = r.line;
        const steps = editable && (l.kind === 'extra' ? !isShare(l) : l.kind === 'lens' && !isPair(l));
        const inSet = l.kind === 'frame' && (l.set || l.setAvailable);
        const via = l.setLens?.id ? `${l.setLens.setName} · ${l.setLens.name}`
          : l.set ? `${l.set.name} · frame and single vision lenses${l.priceCents != null && l.priceCents !== l.set.price ? ` · tag ${money(l.priceCents)}` : ''}`
            : isShare(l) ? `${l.percent}% of ${money(r.base)}`
              : isPair(l) ? [l.presetName, l.quantity === 2 ? 'The pair' : `${l.eye} only`].filter(Boolean).join(' · ') : null;
        return html`<div class="ol" key=${l.id}>
          <div class="what">
            <div class="name">${lineText(l)}</div>
            ${via && html`<div class="via">${via}</div>`}
            <div class="meta">
              <span class="mono">${lineCode(l)}</span>
              ${l.kind === 'frame' && l.priceSource === 'tag' && !l.set && html`<span class="tiny muted">from the tag</span>`}
              ${l.stock != null && html`<span class=${'tiny ' + (l.stock === 0 ? '' : 'muted')}>${stockLabel(l.stock).toLowerCase()}</span>`}
              ${inSet && (editable
                ? html`<button type="button" class=${'chip' + (l.set ? ' on' : '')} onClick=${() => setOpen({ kind: 'set', r })}>${l.set ? `Set ${l.set.id}` : 'Outside the set'}</button>`
                : l.set && html`<span class="chip on">Set ${l.set.id}</span>`)}
              ${l.setLens && editable && html`<button type="button" class=${'chip' + (r.pending ? ' warn' : '')} onClick=${() => setOpen({ kind: 'row', r })}>${r.pending ? 'Choose its row' : 'Row'}</button>`}
              ${discountable(l) && !r.pending && (editable
                ? html`<button type="button" class=${'chip' + (r.discount ? ' on' : '')} onClick=${() => setOpen({ kind: 'discount', r })}>${r.discount ? `−${r.discount}%${r.auto ? ` · ${l.auto.id}` : ''}` : 'Discount'}</button>`
                : r.discount > 0 && html`<span class="chip on">−${r.discount}%${r.auto ? ` · ${l.auto.id}` : ''}</span>`)}
            </div>
          </div>
          <div class="money">
            ${r.discount > 0 && html`<div class="was">${money(r.list)}</div>`}
            <div class=${'now' + (r.net == null ? ' soft' : '')} key=${r.net}>${r.pending ? 'Row?' : r.net == null ? 'At register' : money(r.net)}</div>
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
  </section>`;
}

/** The campaign's discount if one applies, none, or a set percentage — each with what the line comes to. */
function DiscountSheet({ row, onClose }) {
  const catalogue = useApp((s) => s.catalogue);
  const l = row.line;
  const auto = autoDiscountFor(catalogue, { ...l, discount: undefined });
  const pick = (pct) => { updateLine(l.id, { discount: pct }); onClose(); };
  const at = (pct) => money(row.list - Math.round((row.list * pct) / 100));
  const manual = typeof l.discount === 'number';
  return html`<${Sheet} title="Discount" onClose=${onClose}>
    <div class="stack tight">
      <p class="para pad">${lineText(l)}</p>
      <${List}>
        ${auto && html`<${Row} title=${auto.name} detail=${`Promotion ${auto.id} · applies on its own while the campaign runs`}
          end=${html`${at(auto.percent)}${!manual ? html` <${Icon} name="check" />` : ''}`} onClick=${() => pick(undefined)} />`}
        ${[0, ...LINE_DISCOUNTS].map((pct) => html`<${Row} title=${pct ? `${pct}% off` : 'No discount'}
          end=${html`${at(pct)}${manual && l.discount === pct ? html` <${Icon} name="check" />` : !auto && !manual && pct === 0 ? html` <${Icon} name="check" />` : ''}`} onClick=${() => pick(pct)} />`)}
      <//>
      ${isGlasses(l) && html`<p class="note pad">${isPair(l) ? 'On the pair. ' : ''}Plus Protection is worked out after the discount.</p>`}
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
      ${line.set
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
  const set = catalogue.setsById.get(line.setLens.setId);
  if (!set) return null;
  const rows = setTable(catalogue, set);
  const groups = [...new Set(rows.map((r) => r.def.group))];
  const pick = (id) => { updateLine(line.id, { setLensId: id }); onClose(); };
  return html`<${Sheet} title=${`${set.name} · lens row`} onClose=${onClose} full>
    <div class="stack tight">
      <p class="para pad">${line.lens.displayName}</p>
      ${line.setLens.id && line.setLens.auto && html`<p class="note pad">Matched on its own to “${line.setLens.name}”. Choose another row if the lens on the register is a different one.</p>`}
      ${!line.setLens.id && html`<p class="note pad">This lens is not one the set’s table names, so it has no row of its own. Pick the row the register will take, or price the frame outside the set.</p>`}
      ${groups.map((g) => html`<${Section} title=${g}>
        ${rows.filter((r) => r.def.group === g).map((r) => html`<${Row} title=${r.def.name}
          end=${html`${rowPriceText(r.entry, money)}${line.setLens.id === r.def.id ? html` <${Icon} name="check" />` : ''}`} onClick=${() => pick(r.def.id)} />`)}
      <//>`)}
      ${line.setLensId && html`<div class="pad"><button class="btn quiet" onClick=${() => pick(undefined)}>Match it on its own again</button></div>`}
    </div>
  <//>`;
}

export function TotalBlock({ order, figure = true }) {
  const p = priceOrder(order);
  const rest = p.unpriced;
  if (!figure && !p.pending.length && !p.off && !rest.length) return null;
  return html`<div class="gap-m">
    ${p.pending.length > 0 && html`<${Flag}>${p.pending.length === 1 ? 'A lens in a set has' : 'Lenses in a set have'} no row of the set’s table yet. Choose it on the line to finish the price.<//>`}
    ${figure && html`<${Figure} value=${money(p.total)} caption=${p.pending.length ? 'Total so far' : 'Total'} size=${40} />`}
    ${p.off > 0 && html`<${Panel}>
      <${KV} k="Before discounts" v=${money(p.list)} />
      <${KV} k="Discounts" v=${'−' + money(p.off)} />
    <//>`}
    ${rest.length > 0 && html`<div class="gap-s">
      <${Eyebrow}>Priced at the register<//>
      ${rest.map((l) => html`<div style="display:flex;gap:8px;font-size:12px"><span class="mono muted">${lineCode(l)}</span><span class="silver" style="flex:1">${lineText(l)}</span><span class="muted num">×${lineQuantity(l)}</span></div>`)}
      <p class="note">These carry no price in the catalogue. The register prices them, so they are not in the total above.</p>
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

  return html`
    <${Bar} backTo="#/find" title="Order" trail=${has ? html`<button class="bar-btn" onClick=${() => setSheet('clear')}>Clear</button>` : null} />
    <${Screen} class=${has ? 'has-dock' : ''}>
      <div class="stack">
        <${List}>
          <${Row} icon="person" title=${client ? client.name : 'No client yet'} detail=${client ? 'This order is for them' : 'Choose who this order is for'} chev onClick=${() => setSheet('client')} />
          <${Row} icon="eye" title="Prescription" detail=${rxSummary(rx) ?? 'Enter the prescription for this job'} one
            end=${aob ? (missing ? html`<span class="badge warn">AOB</span>` : html`<span class="badge">AOB ${draft.aob.od} · ${draft.aob.os}</span>`) : null}
            chev onClick=${() => setSheet('rx')} />
        <//>
        ${clash.length > 0 && html`<div class="pad"><${Flag}>${clash.map((l) => l.description).join(', ')}: cleaning solutions damage Transitions and Crizal. Offer a microfibre cloth instead.<//></div>`}
        ${missing && html`<div class="pad"><${Flag}>${pairCount(draft) > 1 ? 'Lenses on this order need' : 'The lens on this order needs'} the AOB of each eye. <button type="button" class="link" onClick=${() => setSheet('aob')}>Add the AOB</button><//></div>`}

        ${has
          ? html`<div class="pad stack">
              <${LinesPanel} order=${draft} editable />
              <${TotalBlock} order=${draft} figure=${false} />
              <${OrderPromotions} order=${draft} />
            </div>`
          : html`<div class="pad"><${Empty} title="Nothing on this order yet">Scan a frame, walk a lens, or add a case. When it is ready, Checkout prints the receipt with every code the register needs.<//></div>`}

        <${Section} title="Add">
          <${Row} icon="spark" title="Lifestyle preset" detail="Lens, Plus Protection and accessories in one tap" chev onClick=${() => setSheet('preset')} />
          <${Row} icon="lens" title="Lens" chev onClick=${() => setSheet('lens')} />
          <${Row} icon="barcode" title="Scan a frame or stock item" chev onClick=${() => go('#/find/scan')} />
          <${Row} icon="glasses" title="Browse frames" chev onClick=${() => go('#/find/frames')} />
          <${Row} icon="box" title="Case, solution or extra" chev onClick=${() => setSheet('extra')} />
        <//>

        ${has && html`<div class="pad btn-row">
          <${Secondary} icon="tag" onClick=${addOrderToQuote}>Add to quote<//>
          <${Secondary} icon="check" onClick=${() => setSheet('save')}>Save to client<//>
        </div>`}
      </div>
    <//>
    ${has && html`<${Dock}>
      <div class="dock-total"><span class="v" key=${p.total}>${money(p.total)}</span><span class="k">${p.pending.length ? 'So far' : 'Total'}</span></div>
      <${Anchor} icon="receipt" onClick=${() => go('#/find/checkout')}>Checkout<//>
    <//>`}
    ${sheet === 'clear' && html`<${Confirm} title="Clear this order?" message="Every line on the order in progress will be removed. Saved orders are not affected." action="Clear order"
      onConfirm=${() => { clearDraft(); toast('Order cleared'); }} onClose=${() => setSheet(null)} />`}
    ${sheet === 'client' && html`<${ClientPickerSheet} title="Who is this for?" onClose=${() => setSheet(null)} onPick=${(c) => { setDraftClient(c.id); setSheet(null); }} />`}
    ${sheet === 'lens' && html`<${LensFamilySheet} onClose=${() => setSheet(null)} />`}
    ${sheet === 'extra' && html`<${AddExtraSheet} onClose=${() => setSheet(null)} />`}
    ${sheet === 'save' && html`<${SaveSheet} onClose=${() => setSheet(null)} />`}
    ${(sheet === 'rx' || sheet === 'aob') && html`<${OrderRxSheet} start=${sheet} onClose=${() => setSheet(null)} />`}
    ${sheet === 'preset' && html`<${PresetSheet} onClose=${() => setSheet(null)} />`}`;
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

function AddExtraSheet({ onClose }) {
  const catalogue = useApp((s) => s.catalogue);
  const [term, setTerm] = useState('');
  const t = fold(term);
  const stock = catalogue.consumables.filter((i) => !t || fold(i.description).includes(t) || i.sku.includes(term));
  const add = async (line) => { await addLine(line); toast('Added to the order'); onClose(); };
  return html`<${Sheet} title="Add an extra" onClose=${onClose} full>
    <div class="stack tight">
      <div class="pad"><${SearchField} value=${term} onInput=${setTerm} placeholder="Description or barcode" /></div>
      <${Section} title="Add-ons">
        ${catalogue.extras.filter((e) => !t || fold(e.description).includes(t)).map((e) => html`<${Row} title=${e.description} detail=${e.id} mono
          end=${e.percent ? `${e.percent}% of the glasses` : null} onClick=${() => add(extraLine(e.id, e.description, 1, null, e.percent))} />`)}
      <//>
      <p class="note pad">${catalogue.extras.some((e) => e.percent) ? 'An add-on with a percentage is priced from the frame and spectacle lenses on the order, after their discounts. The rest' : 'These'} carry no price: they reach the ticket as a code and a quantity, and the register prices them.</p>
      <${Section} title="Cases, solutions and accessories">
        ${stock.slice(0, 80).map((i) => html`<${Row} title=${i.description} detail=${i.sku} mono end=${html`<span style=${{ color: i.stock === 0 ? 'var(--platinum)' : 'var(--pewter)' }}>${i.stock === 0 ? 'none' : i.stock}</span>`}
          onClick=${() => add(extraLine(i.sku, i.description, 1, i.stock))} />`)}
      <//>
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
