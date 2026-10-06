// Orders by status. An order marked Sold IS the purchase history — moving one
// to Sold is what makes it count on the dashboard and resets the recall clock.

import { html, useState } from './html.js';
import { useApp } from './hooks.js';
import { Bar, Screen, ScreenTitle, Section, Row, Empty, Eyebrow, Seg, Secondary, Quiet, Confirm, KV, Panel, fmtDate } from './kit.js';
import { STATUSES, statusLabel, orderTotal, composition, orderTitle } from '../core/orders.js';
import { money } from '../core/money.js';
import { upsertOrder, deleteOrder, clientById, toast } from '../state/app.js';
import { LinesPanel, TotalBlock, OrderPromotions } from './order.js';
import { go } from './router.js';

export function OrderRow({ order, byTitle }) {
  const client = useApp((s) => clientById(order.clientId, s));
  const heading = byTitle ? orderTitle(order) : client?.name || order.clientNameAtSale || orderTitle(order);
  return html`<${Row} to=${'#/orders/' + order.id} title=${heading} one
    detail=${`${byTitle ? statusLabel(order.status) + ' · ' : ''}${composition(order)} · ${fmtDate(order.createdOn)}`}
    end=${orderTotal(order) ? money(orderTotal(order)) : statusLabel(order.status)} />`;
}

export function OrdersScreen() {
  const orders = useApp((s) => s.orders);
  return html`
    <${Bar} title="Orders" />
    <${Screen}>
      <div class="stack">
        ${orders.length === 0
          ? html`<div class="pad"><${Empty} title="No orders yet">Scan a frame or walk a lens, add the lines, then save the order to a client. What you mark Sold becomes their history.<//></div>`
          : STATUSES.map((s) => {
            const group = orders.filter((o) => o.status === s.id);
            return group.length > 0 && html`<${Section} title=${`${s.label} · ${group.length}`}>${group.map((o) => html`<${OrderRow} order=${o} />`)}<//>`;
          })}
      </div>
    <//>`;
}

export function SavedOrderScreen({ id }) {
  const order = useApp((s) => s.orders.find((o) => o.id === id));
  const client = useApp((s) => (order ? clientById(order.clientId, s) : null));
  const [confirm, setConfirm] = useState(false);
  if (!order) return html`<${Bar} backTo="#/orders" title="Order" /><${Screen}><div class="pad"><${Empty} title="Not found">This order is not on this phone.<//></div><//>`;

  const setStatus = async (status) => {
    await upsertOrder({ ...order, status });
    if (status === 'sold') toast('Sold — part of their history now');
  };

  return html`
    <${Bar} backTo="#/orders" title="Order" />
    <${Screen}>
      <div class="stack pad">
        <${ScreenTitle} eyebrow=${client?.name ?? (order.clientNameAtSale || 'No client')} title=${orderTitle(order)} detail=${fmtDate(order.createdOn)} />
        <${LinesPanel} order=${order} />
        <${TotalBlock} order=${order} />
        ${(order.sellerEmployeeNumber || client) && html`<${Panel}>
          ${client && html`<${KV} k="Client" v=${html`<a href=${'#/clients/' + client.id} onClick=${(e) => { e.preventDefault(); go('#/clients/' + client.id); }}>${client.name}</a>`} />`}
          ${order.sellerEmployeeNumber && html`<${KV} k="Sold by" v=${[order.sellerEmployeeNumber, order.sellerName].filter(Boolean).join(' · ')} />`}
          ${order.closedOn && html`<${KV} k="Closed" v=${fmtDate(order.closedOn)} />`}
        <//>`}
        <${OrderPromotions} order=${order} />
        <div class="gap-s">
          <${Eyebrow}>Status<//>
          <${Seg} label="Status" value=${order.status} onChange=${setStatus} options=${STATUSES.map((s) => ({ value: s.id, label: s.label }))} />
        </div>
        <${Secondary} icon="receipt" onClick=${() => go('#/orders/' + order.id + '/receipt')}>Print the receipt<//>
        <${Quiet} danger onClick=${() => setConfirm(true)}>Delete order<//>
      </div>
    <//>
    ${confirm && html`<${Confirm} title="Delete this order?" message=${order.status === 'sold' ? 'It is a sale in this client’s history. Deleting it changes their recall date. This cannot be undone.' : 'This cannot be undone.'}
      onConfirm=${async () => { await deleteOrder(order.id); toast('Order deleted'); go('#/orders', { replace: true }); }} onClose=${() => setConfirm(false)} />`}`;
}
