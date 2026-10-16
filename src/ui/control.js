// Control on the phone: Delivery — the orders on their way to the client — and
// Follow Up — the visits that ended without a sale. Both come in from Alpha's
// Control sheet (Me → Restore or import), this seller's rows only, and each
// import puts the workbook's back. Status, Promised, Delivered and Pending (and
// a follow-up's Customer ID and preset) can be changed here in between.
//
// A row opens as its own screen on a phone, and beside the list on an iPad or
// a computer — the way an order does.

import { html, useState } from './html.js';
import { useApp } from './hooks.js';
import { Bar, Screen, ScreenTitle, Section, Row, Empty, Panel, KV, Secondary, Quiet, fmtDate, fmtDayMonth, daysAgo } from './kit.js';
import { go } from './router.js';
import { money } from '../core/money.js';
import {
  DELIVERY_STATUSES, DELIVERED, daysLeft, isOpen, deliveryWhatsApp, followUpWhatsApp, rowsFor,
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

const deliveryHref = (saleId) => '#/orders/delivery/' + encodeURIComponent(saleId);
const followUpHref = (saleId) => '#/orders/followup/' + encodeURIComponent(saleId);

/** `2 d left`, `Today`, `3 d late` — and once delivered, how early or late it went out. */
function when(row) {
  const n = daysLeft(row);
  if (n == null || (!isOpen(row) && !row.delivered)) return null;
  if (isOpen(row)) return { text: n > 0 ? `${n} d left` : n === 0 ? 'Today' : `${-n} d late`, late: n < 0 };
  return { text: n > 0 ? `${n} d early` : n === 0 ? 'On time' : `${-n} d late`, late: false };
}

function DeliveryRow({ row, on }) {
  const w = when(row);
  const date = isOpen(row) ? row.promised && `Promised ${fmtDayMonth(row.promised)}` : row.delivered && `Delivered ${fmtDayMonth(row.delivered)}`;
  return html`<${Row} to=${deliveryHref(row.saleId)} on=${on} title=${row.customer || row.saleId} one
    detail=${[row.shipmentId, date].filter(Boolean).join(' · ')}
    sub=${row.pendingCents ? `Pending ${money(row.pendingCents)}` : null}
    end=${w && (w.late ? html`<span class="pill alert">${w.text}</span>` : w.text)} />`;
}

export function DeliveryView({ selected }) {
  const rows = useRows('deliveries');
  const imported = useApp((s) => Boolean(s.control.importedAt));
  const [all, setAll] = useState(false);
  if (!rows.length) return html`<${Nothing} imported=${imported} what="deliveries" />`;
  const openRows = rows.filter(isOpen);
  const other = openRows.filter((r) => !SECTIONS.includes(r.status));
  const done = rows.filter((r) => !isOpen(r)).sort(byDelivered);
  // The one open beside the list stays in view even when it is past the first few delivered.
  const shown = all ? done : done.filter((r, i) => i < SHOWN || r.saleId === selected);
  const row = (r) => html`<${DeliveryRow} key=${r.saleId} row=${r} on=${r.saleId === selected} />`;
  return html`
    ${SECTIONS.map((status) => {
      const list = openRows.filter((r) => r.status === status).sort(byIssued);
      return list.length > 0 && html`<${Section} title=${`${status} · ${list.length}`}>${list.map(row)}<//>`;
    })}
    ${other.length > 0 && html`<${Section} title=${`No status · ${other.length}`}>${other.sort(byIssued).map(row)}<//>`}
    ${done.length > 0 && html`<${Section} title=${`Delivered · ${done.length}`}>
      ${shown.map(row)}
      ${shown.length < done.length && html`<${Row} onClick=${() => setAll(true)} title=${`Show all ${done.length}`} />`}
    <//>`}
    <${Imported} />`;
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

function ClientLink({ client }) {
  return client && html`<${Secondary} icon="person" onClick=${() => go('#/clients/' + client.id)}>${client.name.split(' ')[0]}’s record<//>`;
}

/** The screen a row opens: its own on a phone, the record beside the list on a wide screen. */
function RowScreen({ embedded, back, title, eyebrow, missing, children }) {
  return html`
    <${Bar} backTo=${embedded ? null : back} title=${title} large />
    <${Screen}>
      ${missing ? html`<div class="pad"><${Empty} title="Not on this phone">${missing}<//></div>`
        : html`<div class="stack pad"><${ScreenTitle} eyebrow=${eyebrow} title=${title} />${children}</div>`}
    <//>`;
}

export function DeliveryScreen({ saleId, embedded }) {
  const row = useApp((s) => s.control.deliveries.find((r) => r.saleId === saleId));
  const messages = useApp((s) => s.control.messages);
  const clients = useApp((s) => s.clients);
  const [pending, setPending] = useState(null); // the figure while it is being typed
  const back = '#/orders?view=delivery';
  if (!row) return html`<${RowScreen} embedded=${embedded} back=${back} title="Delivery" missing="This delivery is not on this phone — the last import from Alpha did not bring it." />`;
  const client = clientNamed(clients, row.customer);
  const phone = row.phone || client?.phone || '';
  const { kind, link } = deliveryWhatsApp(row, phone, messages);
  const set = (patch) => updateDelivery(row.saleId, patch);
  const commitPending = () => { if (pending !== null) { set({ pendingCents: toCents(pending) || null }); setPending(null); } };
  const tel = phone.replace(/\D/g, '');
  return html`<${RowScreen} embedded=${embedded} back=${back} title=${row.customer || row.saleId} eyebrow=${row.status || 'Delivery'}>
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
    <${ClientLink} client=${client} />
    <p class="note">Delivered is stamped with today’s date when the status turns Delivered, and a Promised date that no longer matches the first promise sends the new-date message.</p>
  <//>`;
}

// ---------------------------------------------------------------------------
// Follow Up

/** The presets a follow-up can take: the workbook's messages, else L'Œil's presets by name. */
function usePresetNames() {
  const fu = useApp((s) => s.control.followUpMessages);
  const catalogue = useApp((s) => s.catalogue);
  if (fu?.presets?.length) return fu.presets.map((p) => p.name);
  return [...new Set((catalogue.presets ?? []).map((t) => t.preset))];
}

export function FollowUpView({ selected }) {
  const rows = useRows('followUps');
  const imported = useApp((s) => Boolean(s.control.importedAt));
  const vendorFilter = useApp((s) => s.control.vendorFilter);
  if (!rows.length) {
    return html`<${Nothing} imported=${imported} what="follow-ups" />
      ${imported && vendorFilter && vendorFilter !== 'All' && html`<p class="note pad">Alpha’s Follow Up was last rebuilt for ${vendorFilter} only. Set Control ▸ Vendor to All, rebuild it from the Alpha menu, and import again.</p>`}`;
  }
  const byVisit = (a, b) => (b.visitedOn ?? '').localeCompare(a.visitedOn ?? '');
  const todo = rows.filter((r) => !r.preset).sort(byVisit);
  const profiled = rows.filter((r) => r.preset).sort(byVisit);
  const row = (r) => html`<${Row} key=${r.saleId} to=${followUpHref(r.saleId)} on=${r.saleId === selected} title=${r.customer || r.saleId} one
    detail=${[r.visitedOn && `Visited ${fmtDayMonth(r.visitedOn)}`, r.customerId].filter(Boolean).join(' · ')}
    end=${r.preset ? html`<span class="pill">${r.preset}</span>` : null} />`;
  return html`
    ${todo.length > 0 && html`<${Section} title=${`To follow up · ${todo.length}`}>${todo.map(row)}<//>`}
    ${profiled.length > 0 && html`<${Section} title=${`With a preset · ${profiled.length}`}>${profiled.map(row)}<//>`}
    <p class="note pad">Each eye exam whose Sell ID never carried a sale. Pick the client’s preset and WhatsApp sends that preset’s message.</p>
    <${Imported} />`;
}

export function FollowUpScreen({ saleId, embedded }) {
  const row = useApp((s) => s.control.followUps.find((r) => r.saleId === saleId));
  const fu = useApp((s) => s.control.followUpMessages);
  const clients = useApp((s) => s.clients);
  const names = usePresetNames();
  const [draft, setDraft] = useState(null); // the Customer ID while it is being typed
  const back = '#/orders?view=followup';
  if (!row) return html`<${RowScreen} embedded=${embedded} back=${back} title="Follow Up" missing="This follow-up is not on this phone — the last import from Alpha did not bring it." />`;
  const client = clientNamed(clients, row.customer);
  const phone = row.phone || client?.phone || '';
  const tel = phone.replace(/\D/g, '');
  const { message, link } = followUpWhatsApp(row, phone, fu);
  const commitId = () => { if (draft !== null) { updateFollowUp(row.saleId, { customerId: draft.trim() }); setDraft(null); } };
  return html`<${RowScreen} embedded=${embedded} back=${back} title=${row.customer || row.saleId} eyebrow=${row.preset || 'Follow Up'}>
    <div class="group">
      <label class="cell"><span class="k">Preset</span>
        <select value=${row.preset ?? ''} onChange=${(e) => updateFollowUp(row.saleId, { preset: e.currentTarget.value })}>
          <option value="">—</option>
          ${row.preset && !names.includes(row.preset) && html`<option value=${row.preset}>${row.preset}</option>`}
          ${names.map((n) => html`<option value=${n}>${n}</option>`)}
        </select>
      </label>
      <label class="cell"><span class="k">Customer ID</span>
        <input inputmode="numeric" autocomplete="off" enterkeyhint="done" placeholder="—" value=${draft ?? row.customerId ?? ''}
          onInput=${(e) => setDraft(e.currentTarget.value.replace(/\D/g, ''))} onBlur=${commitId}
          onKeyDown=${(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }} />
      </label>
    </div>
    <${WhatsApp} link=${link} label=${message ? `Send the ${row.preset} message` : 'Open the chat'} />
    ${message && html`<details class="msg-preview"><summary>The message</summary><p>${message}</p></details>`}
    ${row.preset && !message && html`<p class="note">${fu ? `Alpha has no message for ${row.preset}, so WhatsApp just opens the chat.` : 'The Follow Up messages come with the next import from Alpha; until then WhatsApp just opens the chat.'}</p>`}
    <${Panel}>
      <${KV} k="Visited" v=${fmtDate(row.visitedOn)} />
      <${KV} k="Sell ID" v=${row.saleId} mono />
      ${row.sellerName && html`<${KV} k="Seller" v=${row.sellerName} />`}
      <${KV} k="Phone" v=${tel ? html`<a href=${'tel:' + tel}>${phone}</a>` : '—'} />
    <//>
    <${ClientLink} client=${client} />
    ${fu?.until && html`<p class="note">Promotions in the messages run until ${fmtDate(fu.until)}, as Alpha’s Config has them.</p>`}
  <//>`;
}
