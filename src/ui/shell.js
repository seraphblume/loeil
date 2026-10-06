// The shell: four tabs, the gates in front of them, and the router between.

import { html, useState, useEffect } from './html.js';
import { useApp } from './hooks.js';
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
import { ClientsScreen, ClientScreen } from './clients.js';
import { OrdersScreen, SavedOrderScreen } from './orders.js';
import { MeScreen, PromotionsScreen } from './me.js';
import { PublishScreen } from './publish.js';
import { DataHome } from './data/home.js';
import { LensPricesScreen, AddCoatingScreen } from './data/lenses.js';
import { AdjustScreen } from './data/adjust.js';
import { VocabScreen, FramesAdminScreen, BrandsScreen, StockAdminScreen, ExtrasScreen, StaffAdminScreen } from './data/records.js';
import { PromosScreen, PromoScreen } from './data/promos.js';

const TAB_ITEMS = [
  { id: 'find', label: 'Find', icon: 'search' },
  { id: 'clients', label: 'Clients', icon: 'people' },
  { id: 'orders', label: 'Orders', icon: 'doc' },
  { id: 'me', label: 'Me', icon: 'person' },
];

function TabBar({ route }) {
  const draftLines = useApp((s) => s.draft.lines.length);
  return html`<nav class="tabbar" aria-label="Sections">
    ${TAB_ITEMS.map((t) => html`<a ...${linkProps(tabHref(t.id, route))} class=${route.tab === t.id ? 'on' : ''} aria-current=${route.tab === t.id ? 'page' : null}>
      <${Icon} name=${t.icon} />${t.label}
      ${t.id === 'find' && draftLines > 0 && route.parts[1] !== 'order' && html`<i class="dot" aria-label="Order in progress"></i>`}
    </a>`)}
  </nav>`;
}

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

  if (!booted) {
    return html`<div class="unlock center"><${Wordmark} size=${44} /></div>`;
  }

  // Publishing the very first catalogue must be reachable before there is one.
  const isPublish = route.parts[0] === 'me' && route.parts[1] === 'publish';
  if (catalogue.isEmpty && !isPublish) return html`<${UnlockScreen} />`;
  if (!isPublish && !identity && catalogue.staff.some((m) => m.active)) return html`<${WhoAreYouScreen} />`;

  return html`
    ${screenFor(route)}
    ${!isPublish || !catalogue.isEmpty ? html`<${TabBar} route=${route} />` : null}
    <${Toast} />`;
}
