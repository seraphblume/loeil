// Clients: device-local records with their prescriptions.
//
//   swipe left  — delete, confirmed first and named honestly, because it
//                 cascades to orders and there is no undo.
//   swipe right — favourite, sorted to the top.

import { html, useState, useRef } from './html.js';
import { useApp } from './hooks.js';
import {
  Bar, Screen, ScreenTitle, SearchField, Section, Row, List, Panel, KV, Eyebrow, Empty, Anchor, Secondary, Sheet,
  Confirm, fmtDate, fmtDayMonth,
} from './kit.js';
import { Icon } from './icons.js';
import { go, linkProps } from './router.js';
import {
  newClient, initials, eyeText, rxIsBlank, warningIcon, dueForRecall, guidance, recallDate, validity, VALIDITY_LABEL,
  expiresOn, issuedDate, needsAddition, pd, SPHERE_RANGE, CYLINDER_RANGE, blankEye,
} from '../core/crm.js';
import { fold, signed } from '../core/util.js';
import {
  upsertClient, deleteClient, toggleFavourite, clientById, setDraftClient, getState, toast, clearDraft,
} from '../state/app.js';
import { OrderRow } from './orders.js';
import { RxScanSheet } from './rxscan.js';

export function ClientsScreen() {
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
    <${Bar} title="Clients" trail=${html`<button class="bar-btn" aria-label="New client" onClick=${() => setAdding(true)}><${Icon} name="plus" /></button>`} />
    <${Screen}>
      <div class="stack">
        <div class="pad"><${SearchField} value=${term} onInput=${setTerm} placeholder="Name or phone" /></div>
        ${due.length > 0 && html`<${Section} title="Due for a visit">
          ${due.map(({ client, due: when }) => html`<${ClientRow} client=${client} note=${when <= new Date() ? 'Overdue' : 'Due ' + fmtDayMonth(when)} onDelete=${setPending} />`)}
        <//>`}
        ${clients.length === 0
          ? html`<div class="pad"><${Empty} title="Add your first client">Save a prescription once and the finder already knows which lenses fit — and a sale becomes their history rather than a note.<//></div>`
          : results.length === 0 && due.length === 0
            ? html`<p class="para pad">Nobody by that name.</p>`
            : results.length > 0 && html`<${Section} title=${term ? 'Results' : 'All'}>
                ${results.map((c) => html`<${ClientRow} client=${c} onDelete=${setPending} />`)}
              <//>`}
        ${clients.length > 0 && html`<p class="note pad">Swipe right to favourite, left to delete.</p>`}
      </div>
    <//>
    ${adding && html`<${ClientEditorSheet} client=${newClient('')} onClose=${() => setAdding(false)} onSaved=${(c) => go('#/clients/' + c.id)} />`}
    ${pending && html`<${Confirm} title=${`Delete ${pending.name}?`}
      message=${`${rxIsBlank(pending.prescription) ? '' : 'Their prescription and '}${ordersFor(pending.id) === 1 ? '1 order' : ordersFor(pending.id) + ' orders'} will be removed. This cannot be undone.`}
      onConfirm=${() => { deleteClient(pending.id); toast('Client deleted'); }} onClose=${() => setPending(null)} />`}`;
}

function ClientRow({ client, note, onDelete }) {
  const icon = warningIcon(client.prescription);
  const row = html`<a class="row" ...${linkProps('#/clients/' + client.id)}>
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

export function ClientScreen({ id }) {
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
    <${Bar} backTo="#/clients" title="" trail=${html`<button class="bar-btn" onClick=${() => setSheet('edit')}>Edit</button>`} />
    <${Screen}>
      <div class="stack pad">
        <${ScreenTitle} eyebrow="Client" title=${client.name} detail=${due ? (due <= new Date() ? 'Overdue for a visit' : 'Next visit ' + fmtDate(due)) : null} />
        <${Panel}>
          <${KV} k="Phone" v=${client.phone ? html`<a href=${'tel:' + tel}>${client.phone}</a>` : '—'} />
          <${KV} k="Email" v=${client.email ? html`<a href=${'mailto:' + client.email}>${client.email}</a>` : '—'} />
          ${client.notes && html`<${KV} k="Notes" v=${client.notes} />`}
        <//>
        <${RxCard} rx=${client.prescription} />
        ${g.reasons.length > 0 && html`<div class="gap-s"><${Eyebrow}>From the prescription<//>${g.reasons.map((r) => html`<div class="silver small">${r}</div>`)}</div>`}
        <${Secondary} icon="camera" onClick=${() => setSheet('scan')}>${rxIsBlank(client.prescription) ? 'Scan prescription' : 'Scan a new one'}<//>
        <section class="gap-s">
          <${Eyebrow}>Orders and history<//>
          ${mine.length === 0 ? html`<p class="para muted">Nothing yet.</p>` : html`<div style="margin:0 calc(-1 * var(--gutter))"><${List}>${mine.map((o) => html`<${OrderRow} order=${o} byTitle />`)}<//></div>`}
        </section>
        <${Anchor} icon="plus" onClick=${startOrder}>Start an order<//>
      </div>
    <//>
    ${sheet === 'edit' && html`<${ClientEditorSheet} client=${client} onClose=${() => setSheet(null)} />`}
    ${sheet === 'scan' && html`<${RxScanSheet} onClose=${() => setSheet(null)} onAccept=${(rx) => { upsertClient({ ...client, prescription: rx }); toast('Prescription saved'); }} />`}
    ${sheet === 'replace' && html`<${Confirm} title="Replace the order in progress?" message="The order being built belongs to another client. Starting one here clears it — save it first if you need it."
      action="Clear it and start" onConfirm=${async () => { await clearDraft(); await setDraftClient(client.id); go('#/find/order'); }} onClose=${() => setSheet(null)} />`}`;
}

// ---------------------------------------------------------------------------
// The prescription card: two eyes side by side, each value placed on the range
// it could have occupied. Where the dot sits says "how strong" faster than the
// digits do.

function Track({ value, range }) {
  const [lo, hi] = range;
  const f = Math.min(1, Math.max(0, (value - lo) / (hi - lo)));
  return html`<div class="track" aria-hidden="true"><i style=${{ left: `calc(2.5px + ${f} * (100% - 5px))` }}></i></div>`;
}

function Metric({ label, od, os, range, fmt }) {
  return html`<div class="rx-metric">
    <div class="lbl">${label}</div>
    <div class="rx-cols">
      <div><div class="rx-val">${fmt(od)}</div><${Track} value=${od} range=${range} /></div>
      <div><div class="rx-val">${fmt(os)}</div><${Track} value=${os} range=${range} /></div>
    </div>
  </div>`;
}

export function RxCard({ rx }) {
  const v = validity(rx);
  const icon = warningIcon(rx);
  const exp = expiresOn(rx);
  const issued = issuedDate(rx);
  const far = pd(rx, false);
  const near = pd(rx, true);
  return html`<section class="gap-s">
    <div style="display:flex;justify-content:space-between;align-items:baseline">
      <${Eyebrow}>Prescription<//>
      ${v !== 'unknown' && html`<span class=${'pill' + (v === 'valid' ? '' : ' alert')}>${icon && html`<${Icon} name=${icon} />`}${VALIDITY_LABEL[v]}</span>`}
    </div>
    ${rxIsBlank(rx) ? html`<${Panel}><span class="muted small">No prescription on file.</span><//>` : html`<${Panel}>
      ${(issued || exp) && html`<div class="tiny muted" style="display:flex;gap:14px;padding-bottom:12px">
        ${issued && html`<span>Issued ${fmtDate(issued)}</span>`}${exp && html`<span>Expires ${fmtDate(exp)}</span>`}
      </div>`}
      <div class="rx-cols"><div class="rx-head">RIGHT (OD)</div><div class="rx-head">LEFT (OS)</div></div>
      <${Metric} label="Sphere (SPH)" od=${Number(rx.od.sphere)} os=${Number(rx.os.sphere)} range=${SPHERE_RANGE} fmt=${(x) => signed(x)} />
      <${Metric} label="Cylinder (CYL)" od=${Number(rx.od.cylinder)} os=${Number(rx.os.cylinder)} range=${CYLINDER_RANGE} fmt=${(x) => signed(x)} />
      <${Metric} label="Axis" od=${Number(rx.od.axis)} os=${Number(rx.os.axis)} range=${[1, 180]} fmt=${(x) => `${Math.round(x)}°`} />
      ${needsAddition(rx) && html`<${Metric} label="Addition" od=${Number(rx.od.addition)} os=${Number(rx.os.addition)} range=${[0, 4]} fmt=${(x) => signed(x)} />`}
      ${(far || near) && html`<div style="padding-top:12px">
        <div class="tiny muted" style="margin-bottom:6px">${rx.pdFarMM ? 'Pupillary distance — binocular' : 'Pupillary distance — summed'}</div>
        <div class="rx-cols">
          <div><div class="tiny muted">Far</div><div class="num">${far ? far.toFixed(1) + ' mm' : '—'}</div></div>
          <div><div class="tiny muted">Near</div><div class="num">${near ? near.toFixed(1) + ' mm' : '—'}</div></div>
        </div>
      </div>`}
      ${(rx.ticketNumber || rx.vertexDistanceMM) && html`<div class="tiny muted" style="padding-top:12px">
        ${[rx.ticketNumber && `Ticket ${rx.ticketNumber}`, rx.vertexDistanceMM && `VD ${rx.vertexDistanceMM} mm`, rx.workingDistanceCM && `WD ${rx.workingDistanceCM} cm`, rx.site].filter(Boolean).join(' · ')}
      </div>`}
    <//>`}
  </section>`;
}

// ---------------------------------------------------------------------------
// Editor

function NumRow({ label, value, onChange, signedValue, placeholder = '0.00', integer, unit }) {
  const initial = value === null || value === undefined || Number(value) === 0 ? ''
    : integer ? String(Math.round(value)) : unit ? String(value) : Number(value).toFixed(2);
  const [text, setText] = useState(initial);
  const commit = (t) => {
    setText(t);
    const n = Number(String(t).replace(',', '.'));
    onChange(t.trim() === '' ? (unit ? null : 0) : Number.isFinite(n) ? (integer ? Math.round(n) : n) : 0);
  };
  const flip = () => {
    const n = -(Number(text.replace(',', '.')) || 0);
    commit(n === 0 ? '' : n.toFixed(2));
  };
  return html`<label class="form-row">
    <span class="k">${label}</span>
    <input inputmode="decimal" placeholder=${placeholder} value=${text} onInput=${(e) => commit(e.currentTarget.value)} />
    ${signedValue && html`<button type="button" class="sign" aria-label=${`Flip the sign of ${label}`} onClick=${flip}>±</button>`}
    ${unit && html`<span class="tiny muted">${unit}</span>`}
  </label>`;
}

function EyeFields({ title, eye, onChange }) {
  const set = (k) => (v) => onChange({ ...eye, [k]: v });
  return html`<div class="form-group">
    <${Eyebrow}>${title}<//>
    <${NumRow} label="Sphere" value=${eye.sphere} onChange=${set('sphere')} signedValue />
    <${NumRow} label="Cylinder" value=${eye.cylinder} onChange=${set('cylinder')} signedValue />
    <${NumRow} label="Axis" value=${eye.axis} onChange=${set('axis')} integer placeholder="0" />
    <${NumRow} label="Addition" value=${eye.addition} onChange=${set('addition')} />
    <${NumRow} label="PD far" value=${eye.pdFar} onChange=${set('pdFar')} unit="mm" placeholder="—" />
    <${NumRow} label="PD near" value=${eye.pdNear} onChange=${set('pdNear')} unit="mm" placeholder="—" />
  </div>`;
}

export function ClientEditorSheet({ client, onClose, onSaved }) {
  const [c, setC] = useState(() => JSON.parse(JSON.stringify(client)));
  const set = (k) => (v) => setC((x) => ({ ...x, [k]: v }));
  const setRx = (k) => (v) => setC((x) => ({ ...x, prescription: { ...x.prescription, [k]: v } }));
  const valid = c.name.trim().length > 0;
  const save = async () => {
    const saved = { ...c, name: c.name.trim() };
    await upsertClient(saved);
    onClose();
    onSaved?.(saved);
  };
  const exp = expiresOn(c.prescription);
  return html`<${Sheet} title=${client.name ? 'Edit' : 'New client'} onClose=${onClose} full
    right=${html`<button class="bar-btn" style="font-weight:500" disabled=${!valid} onClick=${save}>Save</button>`}>
    <form class="pad form" onSubmit=${(e) => { e.preventDefault(); if (valid) save(); }}>
      <div class="form-group">
        <${Eyebrow}>Details<//>
        <label class="form-row"><span class="k">Name</span><input value=${c.name} autocomplete="off" placeholder="Required" onInput=${(e) => set('name')(e.currentTarget.value)} style="text-align:right" /></label>
        <label class="form-row"><span class="k">Phone</span><input type="tel" inputmode="tel" value=${c.phone} onInput=${(e) => set('phone')(e.currentTarget.value)} /></label>
        <label class="form-row"><span class="k">Email</span><input type="email" inputmode="email" autocapitalize="off" value=${c.email} onInput=${(e) => set('email')(e.currentTarget.value)} /></label>
      </div>
      <div class="form-group">
        <${Eyebrow}>Validity<//>
        <label class="form-row"><span class="k">Issued</span>
          <input type="date" value=${c.prescription.issuedOn ?? ''} onInput=${(e) => setRx('issuedOn')(e.currentTarget.value || null)} /></label>
        <div class="form-row"><span class="k">Expires</span><span class="silver small">${exp ? fmtDate(exp) : 'Set the issue date'}</span></div>
        <p class="note" style="padding-top:8px">A prescription runs one year from the issue date. The expiry is derived, so correcting the issue date corrects it too.</p>
      </div>
      <${EyeFields} title="Right eye (OD)" eye=${c.prescription.od ?? blankEye()} onChange=${setRx('od')} />
      <${EyeFields} title="Left eye (OS)" eye=${c.prescription.os ?? blankEye()} onChange=${setRx('os')} />
      <div class="form-group">
        <${Eyebrow}>Notes<//>
        <label class="field"><textarea rows="3" value=${c.notes} onInput=${(e) => set('notes')(e.currentTarget.value)}></textarea></label>
      </div>
      ${!client.name && html`<p class="note">Tip: scan the autorefractor ticket from the client’s page instead of typing the eyes.</p>`}
      <${Anchor} type="submit" disabled=${!valid}>Save<//>
    </form>
  <//>`;
}

