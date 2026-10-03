// Home, ordered by how often each thing is reached for during a sale:
// 1. Scan — the frame or box is in his hand, and a barcode is the fastest,
//    least error-prone identity in the app.
// 2. Search — lens, client, frame or stock item, one field.
// 3. In progress — the order being built, drafts, clients due a visit.
// 4. Browse — the three lens cascades and the frame catalogue.

import { html, useMemo } from './html.js';
import { useApp, useDebounced } from './hooks.js';
import { Bar, Screen, Wordmark, SearchField, Section, Row, Empty, Anchor, Eyebrow } from './kit.js';
import { go, href } from './router.js';
import { FAMILIES, searchLenses } from '../core/lens.js';
import { STOCK_KIND_LABEL, stockLabel } from '../core/catalogue.js';
import { money } from '../core/money.js';
import { orderTotal, composition, orderTitle } from '../core/orders.js';
import { dueForRecall, warningIcon, eyeText, rxIsBlank } from '../core/crm.js';
import { fold } from '../core/util.js';
import { Icon } from './icons.js';
import { fmtDayMonth } from './kit.js';

export function FindHome({ query }) {
  const term = query.get('q') ?? '';
  const setTerm = (v) => go(href(['find'], { q: v }), { replace: true });
  return html`
    <${Bar} titleNode=${html`<${Wordmark} size=${20} />`} />
    <${Screen}>
      <div class="stack">
        <div class="pad"><${SearchField} value=${term} onInput=${setTerm} placeholder="Lens, client, frame or barcode" /></div>
        ${term.trim() ? html`<${Results} term=${term} />` : html`<${Home} />`}
      </div>
    <//>`;
}

function Home() {
  const draft = useApp((s) => s.draft);
  const orders = useApp((s) => s.orders);
  const clients = useApp((s) => s.clients);
  const catalogue = useApp((s) => s.catalogue);
  const drafts = orders.filter((o) => o.status === 'draft').slice(0, 3);
  const due = dueForRecall(clients, orders).slice(0, 3);
  const nameOf = (id) => clients.find((c) => c.id === id)?.name;

  return html`
    <div class="pad gap-s">
      <${Anchor} icon="barcode" onClick=${() => go('#/find/scan')}>Scan barcode<//>
    </div>

    ${draft.lines.length > 0 && html`<${Section} title="Order in progress">
      <${Row} to="#/find/order" title=${nameOf(draft.clientId) ?? orderTitle(draft)} detail=${composition(draft)} end=${money(orderTotal(draft))} chev />
    <//>`}

    ${drafts.length || due.length ? html`<${Section} title="In progress">
      ${drafts.map((o) => html`<${Row} to=${'#/orders/' + o.id} title=${nameOf(o.clientId) ?? o.clientNameAtSale ?? orderTitle(o)}
        detail=${'Draft · ' + composition(o)} end=${orderTotal(o) ? money(orderTotal(o)) : null} one />`)}
      ${due.map(({ client, due: when }) => html`<${Row} to=${'#/clients/' + client.id} title=${client.name}
        badge=${warningIcon(client.prescription) && html`<${Icon} name=${warningIcon(client.prescription)} />`}
        detail=${when <= new Date() ? 'Overdue for a visit' : 'Due ' + fmtDayMonth(when)} />`)}
    <//>` : html`<div class="pad gap-m">
      <${Eyebrow}>In progress<//>
      <${Empty} title="Nothing open">Orders you save and clients due for a visit collect here, so a half-finished sale is one tap from where you left it.<//>
    </div>`}

    <${Section} title="Browse">
      ${FAMILIES.map((f) => html`<${Row} to=${'#/find/browse/' + f.id} icon=${f.icon} title=${f.label} detail=${f.blurb} count=${catalogue.rows(f.id).length} />`)}
      <${Row} to="#/find/frames" icon="glasses" title="Frames" detail=${`${new Set(catalogue.frames.map((f) => f.brand)).size} brands, from the catalogue`} count=${catalogue.frames.length} />
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
      ${frameHits.items.map((f) => html`<${Row} to=${'#/find/frame/' + f.sku} title=${f.description} detail=${`${f.sku} · ${stockLabel(f.stock)}`} end=${money(f.price)} one mono />`)}
    <//>`}
    ${stockHits.length > 0 && html`<${Section} title="In stock">
      ${stockHits.map((i) => html`<${Row} to=${'#/find/stock/' + i.sku} title=${i.description} detail=${`${i.sku} · ${stockLabel(i.stock)}`} end=${STOCK_KIND_LABEL[i.kind]} one mono />`)}
    <//>`}
    ${lensHits.length > 0 && html`<${Section} title="Lenses">
      ${lensHits.map((l) => html`<${Row} to=${'#/find/lens/' + encodeURIComponent(l.rowId)} title=${l.displayName}
        detail=${l.posCode || l.attributes.map((a) => a.code).join(' ')} end=${money(l.priceCents)} one mono off=${!l.available} />`)}
    <//>`}`;
}
