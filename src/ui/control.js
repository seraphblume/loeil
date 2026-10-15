// Control on the phone: Delivery — the orders on their way to the client — and
// Follow Up — the visits that ended without a sale. Both come in from Alpha's
// Control sheet (Me → Restore or import), this seller's rows only, and each
// import puts the workbook's back. Status, Promised, Delivered and Pending (and
// a follow-up's Customer ID and Plan ID) can be changed here in between.

import { html, useState } from './html.js';
import { useApp } from './hooks.js';
import { Section, Row, Empty, Panel, KV, Sheet, Secondary, Quiet, fmtDate, fmtDayMonth, daysAgo } from './kit.js';
import { Icon } from './icons.js';
import { go } from './router.js';
import { money } from '../core/money.js';
import {
  DELIVERY_STATUSES, DELIVERED, daysLeft, isOpen, deliveryWhatsApp, whatsappLink, rowsFor,
} from '../core/control.js';
import { nameKey } from '../core/alpha.js';
import { toCents, isoDay } from '../core/util.js';
import { updateDelivery, updateFollowUp, isAdminPhone } from '../state/app.js';

/** The client on this phone by that name, when there is exactly one. */
function clientNamed(clients, name) {
  const k = nameKey(name);
  const found = clients.filter((c) => nameKey(c.name) === k);
  return found.length === 1 ? found[0] : null;
}

/** This seller's rows of one list, as the phone has them. */
function useRows(list) {
  const rows = useApp((s) => s.control[list]);
  const seller = useApp((s) => s.identity);
  const admin = useApp((s) => isAdminPhone(s));
  return rowsFor(rows, seller, admin);
}

function Nothing({ imported, what }) {
  return html`<div class="pad">${imported
    ? html`<${Empty} title=${`No ${what} for you`}>The last import from Alpha had none of yours. Import the workbook again when there are.<//>`
    : html`<${Empty} title="Nothing from Alpha yet">Import the Alpha workbook from Me → Restore or import. Your rows on its Control sheet come in here, and each import brings the workbook’s back.<//>`}</div>`;
}

function Imported() {
  const at = useApp((s) => s.control.importedAt);
  return at ? html`<p class="note pad">From Alpha, imported ${daysAgo(at)}. What you change here stays on this phone until the next import, which brings the workbook’s.</p>` : null;
}

// ---------------------------------------------------------------------------
// Delivery

/** Open first — the ones that need something, oldest at the top — then delivered, newest first. */
const SECTIONS = ['Delayed', 'In Production', 'Sent to Store', 'Ready for Pickup'];
const byIssued = (a, b) => (a.issuedOn ?? '').localeCompare(b.issuedOn ?? '');
const byDelivered = (a, b) => (b.delivered ?? b.issuedOn ?? '').localeCompare(a.delivered ?? a.issuedOn ?? '');
const SHOWN = 8;

/** `2 d left`, `Today`, `3 d late` — and once delivered, how early or late it went out. */
function when(row) {
  const n = daysLeft(row);
  if (n == null || (!isOpen(row) && !row.delivered)) return null;
  if (isOpen(row)) return { text: n > 0 ? `${n} d left` : n === 0 ? 'Today' : `${-n} d late`, late: n < 0 };
  return { text: n > 0 ? `${n} d early` : n === 0 ? 'On time' : `${-n} d late`, late: false };
}

function DeliveryRow({ row, onOpen }) {
  const w = when(row);
  const date = isOpen(row) ? row.promised && `Promised ${fmtDayMonth(row.promised)}` : row.delivered && `Delivered ${fmtDayMonth(row.delivered)}`;
  return html`<${Row} onClick=${() => onOpen(row.saleId)} title=${row.customer || row.saleId} one
    detail=${[row.shipmentId, date].filter(Boolean).join(' · ')}
    sub=${row.pendingCents ? `Pending ${money(row.pendingCents)}` : null}
    end=${w && (w.late ? html`<span class="pill alert">${w.text}</span>` : w.text)} />`;
}

export function DeliveryView() {
  const rows = useRows('deliveries');
  const imported = useApp((s) => Boolean(s.control.importedAt));
  const [open, setOpen] = useState(null);
  const [all, setAll] = useState(false);
  if (!rows.length) return html`<${Nothing} imported=${imported} what="deliveries" />`;
  const openRows = rows.filter(isOpen);
  const other = openRows.filter((r) => !SECTIONS.includes(r.status));
  const done = rows.filter((r) => !isOpen(r)).sort(byDelivered);
  return html`
    ${SECTIONS.map((status) => {
      const list = openRows.filter((r) => r.status === status).sort(byIssued);
      return list.length > 0 && html`<${Section} title=${`${status} · ${list.length}`}>${list.map((r) => html`<${DeliveryRow} key=${r.saleId} row=${r} onOpen=${setOpen} />`)}<//>`;
    })}
    ${other.length > 0 && html`<${Section} title=${`No status · ${other.length}`}>${other.sort(byIssued).map((r) => html`<${DeliveryRow} key=${r.saleId} row=${r} onOpen=${setOpen} />`)}<//>`}
    ${done.length > 0 && html`<${Section} title=${`Delivered · ${done.length}`}>
      ${(all ? done : done.slice(0, SHOWN)).map((r) => html`<${DeliveryRow} key=${r.saleId} row=${r} onOpen=${setOpen} />`)}
      ${!all && done.length > SHOWN && html`<${Row} onClick=${() => setAll(true)} title=${`Show all ${done.length}`} />`}
    <//>`}
    <${Imported} />
    ${open && html`<${DeliverySheet} saleId=${open} onClose=${() => setOpen(null)} />`}`;
}

const SEND = {
  ready: 'Send “ready for pickup”',
  newDate: 'Send the new date',
  review: 'Ask for a review',
  null: 'Open the chat',
};

const pesos = (cents) => (cents ? (cents / 100).toFixed(2) : '');

function WhatsApp({ link, label }) {
  return link
    ? html`<a class="btn anchor" href=${link} target="_blank" rel="noopener">${label}</a>`
    : html`<p class="note">No phone for this client — not in the CRM, and nobody by this name on this phone — so there is no chat to open.</p>`;
}

function ClientLink({ client, onClose }) {
  return client && html`<${Secondary} icon="person" onClick=${() => { onClose(); go('#/clients/' + client.id); }}>${client.name.split(' ')[0]}’s record<//>`;
}

function DeliverySheet({ saleId, onClose }) {
  const row = useApp((s) => s.control.deliveries.find((r) => r.saleId === saleId));
  const messages = useApp((s) => s.control.messages);
  const clients = useApp((s) => s.clients);
  const [pending, setPending] = useState(null); // the figure while it is being typed
  if (!row) return null;
  const client = clientNamed(clients, row.customer);
  const phone = row.phone || client?.phone || '';
  const { kind, link } = deliveryWhatsApp(row, phone, messages);
  const set = (patch) => updateDelivery(row.saleId, patch);
  const commitPending = () => { if (pending !== null) { set({ pendingCents: toCents(pending) || null }); setPending(null); } };
  const tel = phone.replace(/\D/g, '');
  return html`<${Sheet} title=${row.customer || row.saleId} onClose=${onClose}>
    <div class="pad stack tight">
      <div class="group">
        <label class="cell"><span class="k">Status</span>
          <select value=${row.status} onChange=${(e) => set({ status: e.currentTarget.value })}>
            ${!DELIVERY_STATUSES.includes(row.status) && html`<option value=${row.status}>${row.status || '—'}</option>`}
            ${DELIVERY_STATUSES.map((st) => html`<option value=${st}>${st}</option>`)}
          </select>
        </label>
        <label class="cell"><span class="k">Promised</span>
          <input type="date" value=${row.promised ?? ''} onInput=${(e) => set({ promised: e.currentTarget.value || null })} />
        </label>
        <label class="cell"><span class="k">Delivered</span>
          <input type="date" value=${row.delivered ?? ''} max=${isoDay(new Date())} onInput=${(e) => set({ delivered: e.currentTarget.value || null })} />
        </label>
        <label class="cell"><span class="k">Pending</span>
          <input inputmode="decimal" enterkeyhint="done" autocomplete="off" placeholder="$0.00" value=${pending ?? (row.pendingCents ? money(row.pendingCents) : '')}
            onFocus=${() => setPending(pesos(row.pendingCents))} onInput=${(e) => setPending(e.currentTarget.value)} onBlur=${commitPending}
            onKeyDown=${(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }} />
        </label>
      </div>
      <${WhatsApp} link=${link} label=${SEND[kind]} />
      <${Panel}>
        <${KV} k=${row.status === DELIVERED ? 'Went out' : 'Days left'} v=${when(row)?.text ?? '—'} />
        <${KV} k="First promise" v=${fmtDate(row.firstPromise)} />
        <${KV} k="Shipment ID" v=${row.shipmentId ?? '—'} mono />
        <${KV} k="Sell ID" v=${row.saleId} mono />
        <${KV} k="Issued" v=${fmtDate(row.issuedOn)} />
        ${row.sellerName && html`<${KV} k="Sold by" v=${row.sellerName} />`}
        <${KV} k="Phone" v=${tel ? html`<a href=${'tel:' + tel}>${phone}</a>` : '—'} />
      <//>
      ${row.firstPromise && row.promised && row.firstPromise !== row.promised && html`<${Quiet} onClick=${() => set({ firstPromise: row.promised })}>Make ${fmtDayMonth(row.promised)} the first promise<//>`}
      <${ClientLink} client=${client} onClose=${onClose} />
      <p class="note">Delivered is stamped with today’s date when the status turns Delivered, and a Promised date that no longer matches the first promise sends the new-date message.</p>
    </div>
  <//>`;
}

// ---------------------------------------------------------------------------
// Follow Up

export function FollowUpView() {
  const rows = useRows('followUps');
  const imported = useApp((s) => Boolean(s.control.importedAt));
  const vendorFilter = useApp((s) => s.control.vendorFilter);
  const [open, setOpen] = useState(null);
  if (!rows.length) {
    return html`<${Nothing} imported=${imported} what="follow-ups" />
      ${imported && vendorFilter && vendorFilter !== 'All' && html`<p class="note pad">Alpha’s Follow Up was last rebuilt for ${vendorFilter} only. Set Control ▸ Vendor to All, rebuild it from the Alpha menu, and import again.</p>`}`;
  }
  const byVisit = (a, b) => (b.visitedOn ?? '').localeCompare(a.visitedOn ?? '');
  const todo = rows.filter((r) => !r.planId).sort(byVisit);
  const planned = rows.filter((r) => r.planId).sort(byVisit);
  const row = (r) => html`<${Row} key=${r.saleId} onClick=${() => setOpen(r.saleId)} title=${r.customer || r.saleId} one
    detail=${[r.visitedOn && `Visited ${fmtDayMonth(r.visitedOn)}`, r.customerId].filter(Boolean).join(' · ')}
    end=${r.planId ? html`<span class="pill"><${Icon} name="check" />${r.planId}</span>` : null} />`;
  return html`
    ${todo.length > 0 && html`<${Section} title=${`To follow up · ${todo.length}`}>${todo.map(row)}<//>`}
    ${planned.length > 0 && html`<${Section} title=${`With a plan · ${planned.length}`}>${planned.map(row)}<//>`}
    <p class="note pad">Each eye exam whose Sell ID never carried a sale.</p>
    <${Imported} />
    ${open && html`<${FollowUpSheet} saleId=${open} onClose=${() => setOpen(null)} />`}`;
}

function FollowUpSheet({ saleId, onClose }) {
  const row = useApp((s) => s.control.followUps.find((r) => r.saleId === saleId));
  const clients = useApp((s) => s.clients);
  const [draft, setDraft] = useState({}); // fields while they are being typed
  if (!row) return null;
  const client = clientNamed(clients, row.customer);
  const phone = row.phone || client?.phone || '';
  const tel = phone.replace(/\D/g, '');
  const field = (k, numeric) => ({
    value: draft[k] ?? row[k] ?? '',
    onInput: (e) => setDraft({ ...draft, [k]: numeric ? e.currentTarget.value.replace(/\D/g, '') : e.currentTarget.value }),
    onBlur: () => { if (draft[k] !== undefined) { updateFollowUp(row.saleId, { [k]: draft[k].trim() }); setDraft({ ...draft, [k]: undefined }); } },
    onKeyDown: (e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } },
  });
  return html`<${Sheet} title=${row.customer || row.saleId} onClose=${onClose}>
    <div class="pad stack tight">
      <div class="group">
        <label class="cell"><span class="k">Plan ID</span><input autocomplete="off" enterkeyhint="done" placeholder="—" ...${field('planId')} /></label>
        <label class="cell"><span class="k">Customer ID</span><input inputmode="numeric" autocomplete="off" enterkeyhint="done" placeholder="—" ...${field('customerId', true)} /></label>
      </div>
      <${WhatsApp} link=${whatsappLink(phone)} label="Open the chat" />
      <${Panel}>
        <${KV} k="Visited" v=${fmtDate(row.visitedOn)} />
        <${KV} k="Sell ID" v=${row.saleId} mono />
        ${row.sellerName && html`<${KV} k="Seller" v=${row.sellerName} />`}
        <${KV} k="Phone" v=${tel ? html`<a href=${'tel:' + tel}>${phone}</a>` : '—'} />
      <//>
      <${ClientLink} client=${client} onClose=${onClose} />
    </div>
  <//>`;
}
