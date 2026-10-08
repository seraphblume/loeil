// The shell: four tabs, the gates in front of them, and the router between.
//
// ADAPTIVE: a phone gets the floating tab bar and one screen at a time. An iPad
// or a computer (768 px and wider) gets a sidebar, and Clients and Orders open
// as a list beside the record — the way Mail and Notes do it.

import { html, useState, useEffect } from './html.js';
import { useApp, useResolvedDraft } from './hooks.js';
import { staffMember } from '../state/app.js';
import { money } from '../core/money.js';
import { orderTotal, composition } from '../core/orders.js';
import { useRoute, tabHref, linkProps } from './router.js';
import { Icon } from './icons.js';
import { Wordmark } from './kit.js';
import { UnlockScreen, WhoAreYouScreen } from './unlock.js';
import { FindHome } from './find.js';
import { CascadeScreen, LensScreen } from './cascade.js';
import { FramesScreen, FrameScreen, StockScreen } from './frames.js';
import { ScanScreen } from './scan.js';
import { SetsScreen, SetScreen } from './sets.js';
import { CheckoutScreen, SavedReceiptScreen } from './receipt.js';
import { SetsAdminScreen, SetAdminScreen, SetLensesScreen, DiscountsScreen } from './data/sets.js';
import { OrderScreen } from './order.js';
import { QuoteScreen } from './quote.js';
import { PresetsAdminScreen } from './presets.js';
import { ClientsScreen, ClientScreen } from './clients.js';
import { OrdersScreen, SavedOrderScreen } from './orders.js';
import { MeScreen, PromotionsScreen } from './me.js';
import { PublishScreen } from './publish.js';
import { DataHome } from './data/home.js';
import { LensPricesScreen, AddCoatingScreen } from './data/lenses.js';
import { AdjustScreen } from './data/adjust.js';
import { VocabScreen, FramesAdminScreen, BrandsScreen, StockAdminScreen, ExtrasScreen, StaffAdminScreen, StoreAdminScreen } from './data/records.js';
import { PromosScreen, PromoScreen } from './data/promos.js';

const TAB_ITEMS = [
  { id: 'find', label: 'Find', icon: 'search' },
  { id: 'quote', label: 'Quote', icon: 'tag' },
  { id: 'clients', label: 'Clients', icon: 'people' },
  { id: 'orders', label: 'Orders', icon: 'doc' },
  { id: 'me', label: 'Me', icon: 'person' },
];

function TabBar({ route }) {
  const draftLines = useApp((s) => s.draft.lines.length);
  const quoted = useApp((s) => s.quote.options.length);
  const i = TAB_ITEMS.findIndex((t) => t.id === route.tab);
  return html`<nav class="tabbar" aria-label="Sections" style=${{ '--i': i, '--n': TAB_ITEMS.length }}>
    <i class="tab-pill" aria-hidden="true"></i>
    ${TAB_ITEMS.map((t) => html`<a ...${linkProps(tabHref(t.id, route))} class=${route.tab === t.id ? 'on' : ''} aria-current=${route.tab === t.id ? 'page' : null}>
      <${Icon} name=${t.icon} />${t.label}
      ${t.id === 'find' && draftLines > 0 && route.parts[1] !== 'order' && html`<i class="dot" aria-label="Order in progress"></i>`}
      ${t.id === 'quote' && quoted > 0 && route.tab !== 'quote' && html`<i class="dot" aria-label="Quote in progress"></i>`}
    </a>`)}
  </nav>`;
}

/** The iPad and computer navigation: the sections, the order in progress, who is selling. */
function Sidebar({ route }) {
  const draft = useResolvedDraft();
  const seller = useApp((s) => staffMember(s));
  const clients = useApp((s) => s.clients.length);
  const open = useApp((s) => s.orders.filter((o) => o.status === 'draft' || o.status === 'presented').length);
  const quoted = useApp((s) => s.quote.options.length);
  const counts = { clients, orders: open || null, quote: quoted || null };
  const onOrder = route.parts[0] === 'find' && (route.parts[1] === 'order' || route.parts[1] === 'checkout');
  return html`<nav class="sidebar" aria-label="Sections">
    <div class="side-head"><${Wordmark} size=${30} /></div>
    <div class="side-list">
      ${TAB_ITEMS.map((t) => html`<a ...${linkProps(tabHref(t.id, route))} class=${'side-item' + (route.tab === t.id && !onOrder ? ' on' : '')} aria-current=${route.tab === t.id ? 'page' : null}>
        <${Icon} name=${t.icon} /><span>${t.label}</span>${counts[t.id] ? html`<span class="n">${counts[t.id]}</span>` : null}
      </a>`)}
    </div>
    ${draft.lines.length > 0 && html`<a ...${linkProps('#/find/order')} class=${'side-order' + (onOrder ? ' on' : '')}>
      <span class="k">Order in progress</span>
      <span class="v">${money(orderTotal(draft))}</span>
      <span class="d">${composition(draft)}</span>
    </a>`}
    <div class="side-foot">${seller ? html`<span>${seller.name}</span><span class="muted">${seller.employeeNumber}</span>` : null}</div>
  </nav>`;
}

/** 768 px and wider: sidebar and side-by-side panes. */
export function useWide() {
  const q = '(min-width: 768px)';
  const [wide, setWide] = useState(() => Boolean(window.matchMedia?.(q).matches));
  useEffect(() => {
    const m = window.matchMedia?.(q);
    if (!m) return undefined;
    const on = () => setWide(m.matches);
    m.addEventListener?.('change', on);
    return () => m.removeEventListener?.('change', on);
  }, []);
  return wide;
}

/** Clients and Orders as list + record on a wide screen; everything else in one pane. */
function Panes({ route }) {
  const [tab, a, b] = route.parts;
  if (tab === 'clients') {
    return html`<div class="pane list-pane"><${ClientsScreen} selected=${a} /></div>
      <div class="pane detail-pane">${a ? html`<${ClientScreen} id=${a} embedded key=${a} />` : html`<${Placeholder} icon="people" text="Choose a client" />`}</div>`;
  }
  if (tab === 'orders') {
    return html`<div class="pane list-pane"><${OrdersScreen} selected=${a} /></div>
      <div class="pane detail-pane">${!a ? html`<${Placeholder} icon="doc" text="Choose an order" />`
        : b === 'receipt' ? html`<${SavedReceiptScreen} id=${a} key=${a + 'r'} />` : html`<${SavedOrderScreen} id=${a} embedded key=${a} />`}</div>`;
  }
  return html`<div class="pane main-pane">${screenFor(route)}</div>`;
}

const Placeholder = ({ icon, text }) => html`<div class="placeholder"><${Icon} name=${icon} size=${44} /><span>${text}</span></div>`;

/** One toast at a time: it rises in, and fades down on its way out. */
function Toast() {
  const message = useApp((s) => s.toast);
  const [shown, setShown] = useState(message);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    if (message) { setShown(message); setLeaving(false); return undefined; }
    if (!shown) return undefined;
    setLeaving(true);
    const t = setTimeout(() => { setShown(null); setLeaving(false); }, 170);
    return () => clearTimeout(t);
  }, [message]);
  return shown ? html`<div class=${'toast' + (leaving ? ' out' : '')} key=${shown} role="status">${shown}</div>` : null;
}

function screenFor(route) {
  const [tab, a, b] = route.parts;
  if (tab === 'find') {
    if (a === 'browse' && b) return html`<${CascadeScreen} family=${b} query=${route.query} />`;
    if (a === 'lens' && b) return html`<${LensScreen} rowId=${b} />`;
    if (a === 'frames') return html`<${FramesScreen} query=${route.query} />`;
    if (a === 'frame' && b) return html`<${FrameScreen} sku=${b} />`;
    if (a === 'stock' && b) return html`<${StockScreen} sku=${b} />`;
    if (a === 'scan') return html`<${ScanScreen} />`;
    if (a === 'sets') return b ? html`<${SetScreen} id=${decodeURIComponent(b)} />` : html`<${SetsScreen} />`;
    if (a === 'order') return html`<${OrderScreen} />`;
    if (a === 'checkout') return html`<${CheckoutScreen} />`;
    return html`<${FindHome} query=${route.query} />`;
  }
  if (tab === 'quote') return html`<${QuoteScreen} />`;
  if (tab === 'clients') return a ? html`<${ClientScreen} id=${a} />` : html`<${ClientsScreen} />`;
  if (tab === 'orders') {
    if (a && b === 'receipt') return html`<${SavedReceiptScreen} id=${a} />`;
    return a ? html`<${SavedOrderScreen} id=${a} />` : html`<${OrdersScreen} />`;
  }
  if (tab === 'me') {
    if (a === 'publish') return html`<${PublishScreen} />`;
    if (a === 'data') {
      if (b === 'lenses') return html`<${LensPricesScreen} family=${route.parts[3] ?? 'SV'} />`;
      if (b === 'coating') return html`<${AddCoatingScreen} />`;
      if (b === 'adjust') return html`<${AdjustScreen} />`;
      if (b === 'vocab') return html`<${VocabScreen} query=${route.query} />`;
      if (b === 'frames') return html`<${FramesAdminScreen} query=${route.query} />`;
      if (b === 'brands') return html`<${BrandsScreen} />`;
      if (b === 'stock') return html`<${StockAdminScreen} />`;
      if (b === 'extras') return html`<${ExtrasScreen} />`;
      if (b === 'staff') return html`<${StaffAdminScreen} />`;
      if (b === 'store') return html`<${StoreAdminScreen} />`;
      if (b === 'presets') return html`<${PresetsAdminScreen} />`;
      if (b === 'promos') return route.parts[3] ? html`<${PromoScreen} id=${route.parts[3]} />` : html`<${PromosScreen} />`;
      if (b === 'sets') return route.parts[3] ? html`<${SetAdminScreen} id=${decodeURIComponent(route.parts[3])} />` : html`<${SetsAdminScreen} />`;
      if (b === 'setlenses') return html`<${SetLensesScreen} />`;
      if (b === 'discounts') return html`<${DiscountsScreen} />`;
      return html`<${DataHome} />`;
    }
    if (a === 'promotions') return html`<${PromotionsScreen} />`;
    return html`<${MeScreen} />`;
  }
  return html`<${FindHome} query=${route.query} />`;
}

export function App() {
  const route = useRoute();
  const booted = useApp((s) => s.booted);
  const catalogue = useApp((s) => s.catalogue);
  const identity = useApp((s) => s.identity);
  const wide = useWide();

  if (!booted) {
    return html`<div class="unlock center"><${Wordmark} size=${44} /></div>`;
  }

  // Publishing the very first catalogue must be reachable before there is one.
  const isPublish = route.parts[0] === 'me' && route.parts[1] === 'publish';
  if (catalogue.isEmpty && !isPublish) return html`<${UnlockScreen} />`;
  if (!isPublish && !identity && catalogue.staff.some((m) => m.active)) return html`<${WhoAreYouScreen} />`;

  if (wide) {
    return html`<div class="shell">
      <${Sidebar} route=${route} />
      <div class="panes">${catalogue.isEmpty ? html`<div class="pane main-pane">${screenFor(route)}</div>` : html`<${Panes} route=${route} />`}</div>
    </div>
    <${Toast} />`;
  }
  return html`
    ${screenFor(route)}
    ${!isPublish || !catalogue.isEmpty ? html`<${TabBar} route=${route} />` : null}
    <${Toast} />`;
}
