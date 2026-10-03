// The order and the ticket are the same screen. He builds it in front of the
// customer and reads it out at the billing desk, so there is nothing to switch
// between. The codes are the headline because the codes are the output.

import { html, useState } from './html.js';
import { useApp } from './hooks.js';
import {
  Bar, Screen, Eyebrow, Panel, Figure, Anchor, Secondary, Row, List, Section, Sheet, Empty, Seg,
  SearchField, Confirm, useCopy, KV,
} from './kit.js';
import { Icon } from './icons.js';
import { go } from './router.js';
import { PromotionsSection } from './cascade.js';
import { money } from '../core/money.js';
import {
  lineCode, lineText, lineQuantity, lineTotal, orderTotal, unpriced, extraLine, lensesOf, STATUSES, ticketText,
} from '../core/orders.js';
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
  const all = order.lines.map((l) => `${lineCode(l)}  x${lineQuantity(l)}`).join('\n');
  return html`<div class="gap-s">
    <div style="display:flex;justify-content:space-between;align-items:center">
      <${Eyebrow}>${order.lines.length === 1 ? 'Code' : 'Codes'}<//>
      <button class="icon-btn" aria-label="Copy all codes" onClick=${() => copy(all, 'all')}><${Icon} name=${copied === 'all' ? 'check' : 'copy'} /></button>
    </div>
    ${order.lines.map((l) => html`<div class="code-line"><span class="code sel">${lineCode(l)}</span><span class="qty">×${lineQuantity(l)}</span></div>`)}
  </div>`;
}

export function LinesPanel({ order, editable }) {
  return html`<section class="gap-s">
    <${Eyebrow}>Lines<//>
    <${Panel} tight>
      ${order.lines.map((l) => html`<div class="kv lined" style="align-items:flex-start">
        <span style="min-width:0;flex:1">
          <div style="font-size:14px;color:var(--platinum);overflow-wrap:anywhere">${lineText(l)}</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <span class="mono tiny muted">${lineCode(l)}</span>
            ${l.kind === 'frame' && l.priceSource === 'tag' && html`<span class="tiny muted">price typed from tag</span>`}
            ${l.stock != null && html`<span class=${'tiny ' + (l.stock === 0 ? '' : 'muted')}>${stockLabel(l.stock).toLowerCase()}</span>`}
          </div>
        </span>
        <span style="text-align:right;flex:none">
          <div class="num" style=${{ fontSize: lineTotal(l) == null ? '12px' : '14px', color: lineTotal(l) == null ? 'var(--silver)' : 'var(--platinum)' }}>${lineTotal(l) == null ? 'At register' : money(lineTotal(l))}</div>
          ${editable && l.kind !== 'frame'
            ? html`<div style="display:flex;gap:2px;justify-content:flex-end;align-items:center">
                <button class="icon-btn" aria-label="One fewer" onClick=${() => (l.quantity > 1 ? updateLine(l.id, { quantity: l.quantity - 1 }) : removeLine(l.id))}>−</button>
                <span class="tiny muted num">×${lineQuantity(l)}</span>
                <button class="icon-btn" aria-label="One more" onClick=${() => updateLine(l.id, { quantity: l.quantity + 1 })}>+</button>
              </div>`
            : html`<div class="tiny muted">×${lineQuantity(l)}</div>`}
        </span>
        ${editable && html`<button class="icon-btn" aria-label="Remove line" onClick=${() => removeLine(l.id)}><${Icon} name="minus" /></button>`}
      </div>`)}
    <//>
  </section>`;
}

export function TotalBlock({ order }) {
  const rest = unpriced(order);
  return html`<div class="gap-m">
    <${Figure} value=${money(orderTotal(order))} caption="Total" size=${40} />
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
  const draft = useApp((s) => s.draft);
  const client = useApp((s) => clientById(s.draft.clientId, s));
  const [sheet, setSheet] = useState(null);

  return html`
    <${Bar} backTo="#/find" title="Order" trail=${draft.lines.length ? html`<button class="bar-btn" onClick=${() => setSheet('clear')}>Clear</button>` : null} />
    <${Screen}>
      <div class="stack">
        <${List}>
          <${Row} icon="person" title=${client ? client.name : 'No client yet'} detail=${client ? 'This order is for them' : 'Choose who this order is for'} chev onClick=${() => setSheet('client')} />
        <//>

        ${draft.lines.length === 0
          ? html`<div class="pad"><${Empty} title="Nothing on this order yet">Scan a frame, walk a lens, or add a case. Lines collect here and the codes stay at the top where the register needs them.<//></div>`
          : html`<div class="pad stack">
              <${CodesBlock} order=${draft} />
              <${LinesPanel} order=${draft} editable />
              <${TotalBlock} order=${draft} />
              <${OrderPromotions} order=${draft} />
            </div>`}

        <${Section} title="Add">
          <${Row} icon="lens" title="Lens" onClick=${() => setSheet('lens')} />
          <${Row} icon="barcode" title="Scan a frame or stock item" onClick=${() => go('#/find/scan')} />
          <${Row} icon="glasses" title="Browse frames" onClick=${() => go('#/find/frames')} />
          <${Row} icon="box" title="Case, solution or extra" onClick=${() => setSheet('extra')} />
        <//>

        ${draft.lines.length > 0 && html`<div class="pad gap-m">
          <${Secondary} icon="share" onClick=${() => shareText(ticketText(draft, client?.name), 'Order')}>Share ticket<//>
          <${Anchor} icon="check" onClick=${() => setSheet('save')}>Save to client<//>
        </div>`}
      </div>
    <//>
    ${sheet === 'clear' && html`<${Confirm} title="Clear this order?" message="Every line on the order in progress will be removed. Saved orders are not affected." action="Clear order"
      onConfirm=${() => { clearDraft(); toast('Order cleared'); }} onClose=${() => setSheet(null)} />`}
    ${sheet === 'client' && html`<${ClientPickerSheet} title="Who is this for?" onClose=${() => setSheet(null)} onPick=${(c) => { setDraftClient(c.id); setSheet(null); }} />`}
    ${sheet === 'lens' && html`<${LensFamilySheet} onClose=${() => setSheet(null)} />`}
    ${sheet === 'extra' && html`<${AddExtraSheet} onClose=${() => setSheet(null)} />`}
    ${sheet === 'save' && html`<${SaveSheet} onClose=${() => setSheet(null)} />`}`;
}

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
        ${catalogue.extras.filter((e) => !t || fold(e.description).includes(t)).map((e) => html`<${Row} title=${e.description} detail=${e.id} mono onClick=${() => add(extraLine(e.id, e.description, 1, null))} />`)}
      <//>
      <p class="note pad">None of these carry a price. They reach the ticket as a code and a quantity, and the register prices them.</p>
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
  const draft = useApp((s) => s.draft);
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
