// Home: a dashboard, ordered by how often each thing is reached for in a sale.
// 1. Search — lens, client, frame or stock item, one field; and Scan, always
//    one tap away (a tile, and the round button in the corner).
// 2. The card — the order being built and what it still needs, or the day so far.
// 3. Shortcuts and Browse — sets, promotions, the lens cascades, the frames.
// 4. Orders and clients due a visit — beside the rest on an iPad, below on a phone.

import { html, useMemo, useState } from './html.js';
import { useApp, useDebounced, useResolvedDraft } from './hooks.js';
import { Bar, Screen, Wordmark, SearchField, Section, Row, Empty, Seg } from './kit.js';
import { go, href } from './router.js';
import { FAMILIES, searchLenses } from '../core/lens.js';
import { STOCK_KIND_LABEL, stockLabel, showsStock } from '../core/catalogue.js';
import { money } from '../core/money.js';
import { orderTotal, composition, orderTitle, isPair, isPlaceholder, needsAob, aobMissing, lineFit, statusLabel } from '../core/orders.js';
import { dueForRecall, warningIcon, eyeText, rxIsBlank, fitComplete } from '../core/crm.js';
import { QUOTE_OPTIONS } from '../core/quote.js';
import { isShowcaseOrder } from '../core/showcase.js';
import { fold } from '../core/util.js';
import { Icon } from './icons.js';
import { fmtDayMonth } from './kit.js';

export function FindHome({ query }) {
  const term = query.get('q') ?? '';
  const setTerm = (v) => go(href(['find'], { q: v }), { replace: true });
  return html`
    <${Bar} titleNode=${html`<${Wordmark} size=${21} />`} large />
    <${Screen}>
      <div class="stack">
        <div class="large-head"><h1 class="large-title wordmark-title"><span class="only-phone"><${Wordmark} size=${40} /></span><span class="only-wide">Find</span></h1><div class="detail">${longToday()}</div></div>
        <div class="pad"><${SearchField} value=${term} onInput=${setTerm} placeholder="Lens, client, frame or barcode" /></div>
        ${term.trim() ? html`<${Results} term=${term} />` : html`<${Home} />`}
      </div>
    <//>
    ${!term.trim() && html`<a href="#/find/scan" class="fab" aria-label="Scan a barcode" onClick=${(e) => { e.preventDefault(); go('#/find/scan'); }}><${Icon} name="barcode" /></a>`}`;
}

const longToday = () => new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

function Home() {
  return html`<div class="dash">
    <div class="dash-main">
      <${SummaryCard} />
      <div class="tiles pad">
        <a class="tile" href="#/find/scan" onClick=${nav('#/find/scan')}><${Icon} name="barcode" /><span>Scan</span></a>
        <a class="tile" href="#/find/sets" onClick=${nav('#/find/sets')}><${Icon} name="doc" /><span>Sets</span></a>
        <a class="tile" href="#/me/promotions" onClick=${nav('#/me/promotions')}><${Icon} name="spark" /><span>Promotions</span></a>
      </div>
      <${Browse} />
    </div>
    <div class="dash-side">
      <${RecentOrders} />
      <${DueClients} />
    </div>
  </div>`;
}

const nav = (to) => (e) => { e.preventDefault(); go(to); };

/** What the order in progress still needs before checkout, in the order a sale goes. */
function readiness(draft, rx, catalogue) {
  const pairs = draft.lines.filter(isPair);
  const contacts = draft.lines.filter((l) => l.kind === 'lens' && !isPair(l));
  const frames = draft.lines.filter((l) => l.kind === 'frame');
  const steps = [{ label: 'Client', done: Boolean(draft.clientId) }];
  if (pairs.length) steps.push({ label: 'Prescription', done: Boolean(rx && !rxIsBlank(rx)) });
  if (pairs.length || frames.length) steps.push({ label: 'Frame', done: frames.length > 0 && !frames.some(isPlaceholder) });
  steps.push({ label: 'Lenses', done: pairs.length + contacts.length > 0 });
  if (needsAob(draft, catalogue)) steps.push({ label: 'AOB', done: !aobMissing(draft, catalogue) });
  const fitted = contacts.filter((l) => lineFit(l, catalogue));
  if (fitted.length) steps.push({ label: 'Fitting', done: fitted.every((l) => fitComplete(lineFit(l, catalogue), l.measures)) });
  return steps;
}

/** The card at the top: the order being built and what it still needs — or the day so far. */
function SummaryCard() {
  const draft = useResolvedDraft();
  const catalogue = useApp((s) => s.catalogue);
  const client = useApp((s) => s.clients.find((c) => c.id === s.draft.clientId) ?? null);
  const rx = useApp((s) => s.draftRx ?? s.clients.find((c) => c.id === s.draft.clientId)?.prescription ?? null);
  const quoted = useApp((s) => s.quote.options.length);
  const orders = useApp((s) => s.orders);
  if (draft.lines.length) {
    const steps = readiness(draft, rx, catalogue);
    const done = steps.filter((x) => x.done).length;
    const next = steps.find((x) => !x.done);
    return html`<a class="dash-card pad-card" href="#/find/order" onClick=${nav('#/find/order')}>
      <div class="dc-top"><span class="dc-k">Order in progress</span>
        <span class="dc-chip"><${Icon} name="person" />${client ? client.name.split(' ')[0] : 'No client'}</span></div>
      <div class="dc-amount" key=${orderTotal(draft)}>${money(orderTotal(draft))}</div>
      <div class="dc-stats">
        <div><span class="k">On the order</span><span class="v">${composition(draft)}</span></div>
        <div><span class="k">Quote</span><span class="v">${quoted} of ${QUOTE_OPTIONS} options</span></div>
      </div>
      <div class="dc-gauge">
        <div class="dc-gk"><span>${next ? `Next: ${next.label.toLowerCase()}` : 'Ready for checkout'}</span><span>${done} of ${steps.length}</span></div>
        <div class="dc-bars" style=${{ '--n': steps.length }}>${steps.map((x) => html`<i class=${x.done ? 'on' : ''} title=${x.label}></i>`)}</div>
      </div>
    </a>`;
  }
  const today = new Date();
  const real = orders.filter((o) => !isShowcaseOrder(o));
  const sold = real.filter((o) => o.status === 'sold' && o.closedOn && sameDay(new Date(o.closedOn), today));
  const open = real.filter((o) => o.status === 'draft' || o.status === 'presented').length;
  return html`<div class="dash-card pad-card">
    <div class="dc-top"><span class="dc-k">Today</span><span class="dc-chip">${new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(today)}</span></div>
    <div class="dc-amount">${money(sold.reduce((sum, o) => sum + orderTotal(o), 0))}</div>
    <div class="dc-stats">
      <div><span class="k">Sold today</span><span class="v">${sold.length === 1 ? '1 order' : `${sold.length} orders`}</span></div>
      <div><span class="k">Open</span><span class="v">${open === 1 ? '1 order' : `${open} orders`}</span></div>
    </div>
    <p class="dc-note">Scan a frame, or choose a lens below, to start an order.</p>
  </div>`;
}

/** The lens cascades and the frames, as tiles. */
function Browse() {
  const catalogue = useApp((s) => s.catalogue);
  const n = (x) => x.toLocaleString('en');
  const tiles = [
    ...FAMILIES.map((f) => ({ to: '#/find/browse/' + f.id, icon: f.icon, title: f.label, d: `${n(catalogue.rows(f.id).length)} lenses` })),
    { to: '#/find/frames', icon: 'glasses', title: 'Frames', d: `${n(catalogue.frames.length)} · ${new Set(catalogue.frames.map((f) => f.brand)).size} brands` },
  ];
  return html`<section class="section">
    <div class="section-head"><div class="eyebrow">Browse</div></div>
    <div class="cat-grid pad">${tiles.map((t) => html`<a class="cat" href=${t.to} onClick=${nav(t.to)}>
      <${Icon} name=${t.icon} /><span class="t">${t.title}</span><span class="d">${t.d}</span></a>`)}</div>
  </section>`;
}

const STATUS_ICON = { draft: 'edit', presented: 'doc', sold: 'check', lost: 'x' };
const FILTERS = [{ value: 'all', label: 'All' }, { value: 'open', label: 'Open' }, { value: 'sold', label: 'Sold' }];

/** The latest orders, like a bank's transactions: who, what, when, how much. */
function RecentOrders() {
  const orders = useApp((s) => s.orders);
  const clients = useApp((s) => s.clients);
  const [filter, setFilter] = useState('all');
  const nameOf = (o) => clients.find((c) => c.id === o.clientId)?.name ?? o.clientNameAtSale ?? orderTitle(o);
  const shown = [...orders]
    .filter((o) => filter === 'all' || (filter === 'sold' ? o.status === 'sold' : o.status === 'draft' || o.status === 'presented'))
    .sort((a, b) => String(b.closedOn ?? b.createdOn).localeCompare(String(a.closedOn ?? a.createdOn)))
    .slice(0, 6);
  return html`<section class="section">
    <div class="section-head"><div class="eyebrow">Orders</div>
      ${orders.length > 0 && html`<a class="textbtn small" href="#/orders" onClick=${nav('#/orders')}>See all</a>`}</div>
    ${orders.length > 0 && html`<div class="pad"><${Seg} small label="Show" value=${filter} onChange=${setFilter} options=${FILTERS} /></div>`}
    ${shown.length
      ? html`<div class="list round-ico">${shown.map((o) => html`<${Row} key=${o.id} to=${'#/orders/' + o.id} icon=${STATUS_ICON[o.status] ?? 'doc'} title=${nameOf(o)}
          detail=${`${statusLabel(o.status)} · ${composition(o)} · ${fmtDayMonth(o.closedOn ?? o.createdOn)}`} one end=${orderTotal(o) ? money(orderTotal(o)) : null} />`)}</div>`
      : html`<div class="pad"><div class="dash-empty">${orders.length ? 'Nothing here yet.' : 'Orders you save or sell collect here, newest first.'}</div></div>`}
  </section>`;
}

function DueClients() {
  const clients = useApp((s) => s.clients);
  const orders = useApp((s) => s.orders);
  const due = dueForRecall(clients, orders).slice(0, 4);
  if (!due.length) return null;
  return html`<${Section} title="Due for a visit">
    ${due.map(({ client, due: when }) => html`<${Row} to=${'#/clients/' + client.id} icon="person" title=${client.name}
      badge=${warningIcon(client.prescription) && html`<${Icon} name=${warningIcon(client.prescription)} />`}
      detail=${when <= new Date() ? 'Overdue for a visit' : 'Due ' + fmtDayMonth(when)} />`)}
  <//>`;
}

function Results({ term }) {
  const t = useDebounced(term, 90);
  const catalogue = useApp((s) => s.catalogue);
  const clients = useApp((s) => s.clients);

  const hits = useMemo(() => {
    const f = fold(t).trim();
    const digits = t.replace(/\D/g, '');
    const clientHits = clients.filter((c) => fold(c.name).includes(f) || (digits.length >= 3 && c.phone.replace(/\D/g, '').includes(digits))).slice(0, 5);
    const frameHits = catalogue.searchFrames(t, { limit: 8 });
    const stockHits = catalogue.searchStock(t, { limit: 8 }).filter((i) => !i.inCatalogue);
    const lensHits = searchLenses(catalogue, t, 10);
    return { clientHits, frameHits, stockHits, lensHits };
  }, [t, catalogue, clients]);

  const { clientHits, frameHits, stockHits, lensHits } = hits;
  if (!clientHits.length && !frameHits.total && !stockHits.length && !lensHits.length) {
    return html`<div class="pad"><${Empty} title="Nothing matches">Try a code (4300, TSI), a lens name, a client’s phone, a frame brand or model, or eight barcode digits.<//></div>`;
  }
  return html`
    ${clientHits.length > 0 && html`<${Section} title="Clients">
      ${clientHits.map((c) => html`<${Row} to=${'#/clients/' + c.id} title=${c.name} detail=${c.phone || (rxIsBlank(c.prescription) ? 'No Rx' : eyeText(c.prescription.od))} one />`)}
    <//>`}
    ${frameHits.total > 0 && html`<${Section} title=${frameHits.total > 8 ? `Frames · ${frameHits.total}` : 'Frames'}
        action=${frameHits.total > 8 ? html`<a class="textbtn small" href=${href(['find', 'frames'], { q: t })} onClick=${(e) => { e.preventDefault(); go(href(['find', 'frames'], { q: t })); }}>All</a>` : null}>
      ${frameHits.items.map((f) => html`<${Row} to=${'#/find/frame/' + f.sku} title=${f.description} detail=${[f.sku, f.category].filter(Boolean).join(' · ')} end=${money(f.price)} one mono />`)}
    <//>`}
    ${stockHits.length > 0 && html`<${Section} title="Accessories and stock items">
      ${stockHits.map((i) => html`<${Row} to=${'#/find/stock/' + i.sku} title=${i.description} detail=${showsStock(i.kind) ? `${i.sku} · ${stockLabel(i.stock)}` : i.sku} end=${STOCK_KIND_LABEL[i.kind]} one mono />`)}
    <//>`}
    ${lensHits.length > 0 && html`<${Section} title="Lenses">
      ${lensHits.map((l) => html`<${Row} to=${'#/find/lens/' + encodeURIComponent(l.rowId)} title=${l.displayName}
        detail=${l.posCode || l.attributes.map((a) => a.code).join(' ')} end=${money(l.priceCents)} one mono off=${!l.available} />`)}
    <//>`}`;
}
