// Clients: device-local records with their prescriptions.
//
//   swipe left  — delete, confirmed first and named honestly, because it
//                 cascades to orders and there is no undo.
//   swipe right — favourite, sorted to the top.

import { html, useState, useRef } from './html.js';
import { useApp } from './hooks.js';
import {
  Bar, Screen, ScreenTitle, LargeTitle, SearchField, Section, Eyebrow, Empty, Anchor, Secondary, Sheet, Dock,
  Confirm, fmtDate, fmtDayMonth,
} from './kit.js';
import { Icon } from './icons.js';
import { go, linkProps } from './router.js';
import {
  newClient, initials, eyeText, rxIsBlank, warningIcon, dueForRecall, guidance, recallDate, contactIsBlank,
} from '../core/crm.js';
import { fold } from '../core/util.js';
import {
  upsertClient, deleteClient, toggleFavourite, clientById, setDraftClient, getState, toast, clearDraft,
} from '../state/app.js';
import { OrderRow } from './orders.js';
import { RxCard, ContactRxCard, ClientRxSheet } from './rx.js';

export function ClientsScreen({ selected }) {
  const clients = useApp((s) => s.clients);
  const orders = useApp((s) => s.orders);
  const [term, setTerm] = useState('');
  const [adding, setAdding] = useState(false);
  const [pending, setPending] = useState(null);

  const due = term ? [] : dueForRecall(clients, orders);
  const dueIds = new Set(due.map((d) => d.client.id));
  const t = fold(term);
  const digits = term.replace(/\D/g, '');
  const results = clients.filter((c) => !dueIds.has(c.id) && (!term || fold(c.name).includes(t) || (digits && c.phone.replace(/\D/g, '').includes(digits))));
  const ordersFor = (id) => orders.filter((o) => o.clientId === id).length;

  return html`
    <${Bar} title="Clients" large trail=${html`<button class="bar-btn round" aria-label="New client" onClick=${() => setAdding(true)}><${Icon} name="plus" /></button>`} />
    <${Screen}>
      <div class="stack">
        <${LargeTitle} detail=${clients.length ? `${clients.length} on this device` : null}>Clients<//>
        <div class="pad"><${SearchField} value=${term} onInput=${setTerm} placeholder="Name or phone" /></div>
        ${due.length > 0 && html`<${Section} title="Due for a visit">
          ${due.map(({ client, due: when }) => html`<${ClientRow} client=${client} on=${client.id === selected} note=${when <= new Date() ? 'Overdue' : 'Due ' + fmtDayMonth(when)} onDelete=${setPending} />`)}
        <//>`}
        ${clients.length === 0
          ? html`<div class="pad"><${Empty} title="Add your first client">Save a prescription once and the finder already knows which lenses fit — and a sale becomes their history rather than a note.<//></div>`
          : results.length === 0 && due.length === 0
            ? html`<p class="para pad">Nobody by that name.</p>`
            : results.length > 0 && html`<${Section} title=${term ? 'Results' : 'All'}>
                ${results.map((c) => html`<${ClientRow} client=${c} on=${c.id === selected} onDelete=${setPending} />`)}
              <//>`}
        ${clients.length > 0 && html`<p class="note pad">Swipe right to favourite, left to delete.</p>`}
      </div>
    <//>
    ${adding && html`<${ClientEditorSheet} client=${newClient('')} onClose=${() => setAdding(false)} onSaved=${(c) => go('#/clients/' + c.id)} />`}
    ${pending && html`<${Confirm} title=${`Delete ${pending.name}?`}
      message=${`${rxIsBlank(pending.prescription) ? '' : 'Their prescription and '}${ordersFor(pending.id) === 1 ? '1 order' : ordersFor(pending.id) + ' orders'} will be removed. This cannot be undone.`}
      onConfirm=${() => { deleteClient(pending.id); toast('Client deleted'); }} onClose=${() => setPending(null)} />`}`;
}

function ClientRow({ client, note, onDelete, on }) {
  const icon = warningIcon(client.prescription);
  const row = html`<a class=${'row' + (on ? ' on' : '')} ...${linkProps('#/clients/' + client.id)} aria-current=${on ? 'true' : null}>
    <span class="avatar">${initials(client.name) || '·'}</span>
    <span class="main">
      <span class="t one">${client.name}${client.isFavourite && html` <span class="inline-ico"><${Icon} name="starFill" /></span>`}</span>
      <span class="d one num">${note ?? (rxIsBlank(client.prescription) ? 'No Rx' : eyeText(client.prescription.od))}</span>
    </span>
    ${icon && html`<span class="end"><${Icon} name=${icon} size=${13} /></span>`}
  </a>`;
  return html`<${SwipeRow} favourite=${client.isFavourite} onFavourite=${() => toggleFavourite(client.id)} onDelete=${() => onDelete(client)}>${row}<//>`;
}

/** Touch swipe with a press-and-release threshold; the row link still works on a tap. */
function SwipeRow({ children, onFavourite, onDelete, favourite }) {
  const [dx, setDx] = useState(0);
  const [anim, setAnim] = useState(false);
  const start = useRef(null);
  const moved = useRef(false);
  const down = (e) => { start.current = { x: e.clientX, y: e.clientY, id: e.pointerId }; moved.current = false; setAnim(false); };
  const move = (e) => {
    if (!start.current) return;
    const x = e.clientX - start.current.x;
    const y = e.clientY - start.current.y;
    if (!moved.current && Math.abs(x) > 10 && Math.abs(x) > Math.abs(y) * 1.4) { moved.current = true; e.currentTarget.setPointerCapture?.(e.pointerId); }
    if (moved.current) setDx(Math.max(-140, Math.min(140, x)));
  };
  const up = () => {
    if (!start.current) return;
    start.current = null;
    setAnim(true);
    if (dx > 90) onFavourite();
    else if (dx < -90) onDelete();
    setDx(0);
  };
  const clickCapture = (e) => { if (moved.current) { e.preventDefault(); e.stopPropagation(); moved.current = false; } };
  return html`<div class="swipe">
    <div class="under" aria-hidden=${dx === 0}>
      ${dx > 0 && html`<button class="fav" tabindex="-1"><${Icon} name=${favourite ? 'star' : 'starFill'} />${favourite ? 'Unfavourite' : 'Favourite'}</button>`}
      ${dx < 0 && html`<button class="del" tabindex="-1"><${Icon} name="trash" />Delete</button>`}
    </div>
    <div class=${'over' + (anim ? ' anim' : '')} style=${{ transform: `translateX(${dx}px)` }}
      onPointerDown=${down} onPointerMove=${move} onPointerUp=${up} onPointerCancel=${up} onClickCapture=${clickCapture}>${children}</div>
  </div>`;
}

export function ClientScreen({ id, embedded }) {
  const client = useApp((s) => clientById(id, s));
  const orders = useApp((s) => s.orders);
  const catalogue = useApp((s) => s.catalogue);
  const [sheet, setSheet] = useState(null);
  if (!client) return html`<${Bar} backTo="#/clients" title="Client" /><${Screen}><div class="pad"><${Empty} title="Not found">This client is not on this phone.<//></div><//>`;

  const mine = orders.filter((o) => o.clientId === client.id);
  const g = guidance(client.prescription, catalogue);
  const due = recallDate(client, orders);
  const tel = client.phone.replace(/[^\d+]/g, '');

  const startOrder = () => {
    const { draft } = getState();
    if (draft.lines.length && draft.clientId && draft.clientId !== client.id) { setSheet('replace'); return; }
    setDraftClient(client.id);
    go('#/find/order');
  };

  return html`
    <${Bar} backTo=${embedded ? null : '#/clients'} title=${client.name} large
      trail=${html`<button class="bar-btn" onClick=${() => setSheet('edit')}>Edit</button>`} />
    <${Screen} class="has-dock">
      <div class="stack pad">
        <${ScreenTitle} title=${client.name} detail=${due ? (due <= new Date() ? 'Overdue for a visit' : 'Next visit ' + fmtDate(due)) : null} />
        <div class="group">
          <div class="cell"><span class="k">Phone</span><span class="v">${client.phone ? html`<a href=${'tel:' + tel}>${client.phone}</a>` : '—'}</span></div>
          ${client.email && html`<div class="cell"><span class="k">Email</span><span class="v"><a href=${'mailto:' + client.email}>${client.email}</a></span></div>`}
          ${client.notes && html`<div class="cell"><span class="k">Notes</span><span class="v">${client.notes}</span></div>`}
        </div>
        <${RxCard} rx=${client.prescription} onEdit=${() => setSheet('rx')} />
        ${g.reasons.length > 0 && html`<div class="gap-s">${g.reasons.map((r) => html`<div class="silver small">${r}</div>`)}</div>`}
        ${contactIsBlank(client.contactRx)
          ? html`<${Secondary} icon="cl" onClick=${() => setSheet('cl')}>Add a contact lens prescription<//>`
          : html`<${ContactRxCard} cl=${client.contactRx} onEdit=${() => setSheet('cl')} />`}
        <section class="gap-s">
          <${Eyebrow}>Orders and history<//>
          ${mine.length === 0 ? html`<p class="para muted">Nothing yet.</p>` : html`<div class="group flush-rows">${mine.map((o) => html`<${OrderRow} order=${o} byTitle />`)}</div>`}
        </section>
      </div>
    <//>
    <${Dock}><${Anchor} icon="plus" onClick=${startOrder}>Start an order<//><//>
    ${sheet === 'edit' && html`<${ClientEditorSheet} client=${client} onClose=${() => setSheet(null)} />`}
    ${sheet === 'rx' && html`<${ClientRxSheet} client=${client} kind="glasses" onClose=${() => setSheet(null)} />`}
    ${sheet === 'cl' && html`<${ClientRxSheet} client=${client} kind="contact" onClose=${() => setSheet(null)} />`}
    ${sheet === 'replace' && html`<${Confirm} title="Replace the order in progress?" message="The order being built belongs to another client. Starting one here clears it — save it first if you need it."
      action="Clear it and start" onConfirm=${async () => { await clearDraft(); await setDraftClient(client.id); go('#/find/order'); }} onClose=${() => setSheet(null)} />`}`;
}

// ---------------------------------------------------------------------------
// Editor: who they are. The prescriptions have their own editors, a tap on
// each card away.

export function ClientEditorSheet({ client, onClose, onSaved }) {
  const [c, setC] = useState(() => JSON.parse(JSON.stringify(client)));
  const set = (k) => (v) => setC((x) => ({ ...x, [k]: v }));
  const valid = c.name.trim().length > 0;
  const save = async () => {
    const saved = { ...c, name: c.name.trim() };
    await upsertClient(saved);
    onClose();
    onSaved?.(saved);
  };
  return html`<${Sheet} title=${client.name ? 'Edit' : 'New client'} onClose=${onClose}
    right=${html`<button class="bar-btn strong" disabled=${!valid} onClick=${save}>${client.name ? 'Done' : 'Add'}</button>`}>
    <form class="pad form" onSubmit=${(e) => { e.preventDefault(); if (valid) save(); }}>
      <div class="group">
        <label class="cell"><span class="k">Name</span><input value=${c.name} autocomplete="off" autocapitalize="words" placeholder="Required" onInput=${(e) => set('name')(e.currentTarget.value)} /></label>
        <label class="cell"><span class="k">Phone</span><input type="tel" inputmode="tel" value=${c.phone} placeholder="—" onInput=${(e) => set('phone')(e.currentTarget.value)} /></label>
        <label class="cell"><span class="k">Email</span><input type="email" inputmode="email" autocapitalize="off" value=${c.email} placeholder="—" onInput=${(e) => set('email')(e.currentTarget.value)} /></label>
      </div>
      <div class="gap-s">
        <${Eyebrow}>Notes<//>
        <div class="group"><textarea class="cell-text" rows="3" value=${c.notes} onInput=${(e) => set('notes')(e.currentTarget.value)}></textarea></div>
      </div>
      ${!client.name && html`<p class="note">The prescription goes in next, on their page — tap Glasses.</p>`}
      <${Anchor} type="submit" disabled=${!valid}>${client.name ? 'Save' : 'Add client'}<//>
    </form>
  <//>`;
}
