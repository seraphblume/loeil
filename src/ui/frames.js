// Frames — the catalogue workbook is the source of truth: identity, price,
// brand, category, material and size. The inventory tab only adds how many are
// on the shelf. A frame in stock but missing from the catalogue still sells,
// with its price typed off the tag.

import { html, useState, useMemo } from './html.js';
import { useApp, useDebounced } from './hooks.js';
import {
  Bar, Screen, ScreenTitle, SearchField, Row, List, Eyebrow, Panel, KV, Figure, Flag, Anchor, Sheet, Toggle,
  Empty, Secondary,
} from './kit.js';
import { go, href } from './router.js';
import { money } from '../core/money.js';
import { stockLabel, STOCK_KIND_LABEL } from '../core/catalogue.js';
import { frameLine, extraLine } from '../core/orders.js';
import { addLine, toast } from '../state/app.js';
import { livePromotions } from '../core/promotions.js';
import { brandKey, fmtExpiry } from './format.js';

const FILTERS = [
  { key: 'brand', label: 'Brand' },
  { key: 'category', label: 'Category' },
  { key: 'material', label: 'Material' },
  { key: 'frameType', label: 'Frame type' },
  { key: 'size', label: 'Size', num: true },
];

export function FramesScreen({ query }) {
  const catalogue = useApp((s) => s.catalogue);
  const term = query.get('q') ?? '';
  const t = useDebounced(term, 90);
  const [limit, setLimit] = useState(60);
  const [picking, setPicking] = useState(null);
  const filters = {};
  for (const f of FILTERS) { const v = query.get(f.key); if (v) filters[f.key] = f.num ? Number(v) : v; }
  if (query.get('stock') === '1') filters.inStock = true;

  const set = (patch) => {
    const next = { q: term, ...Object.fromEntries(FILTERS.map((f) => [f.key, query.get(f.key)])), stock: query.get('stock'), ...patch };
    go(href(['find', 'frames'], next), { replace: true });
  };

  const result = useMemo(() => catalogue.searchFrames(t, { limit: 0, filters }), [catalogue, t, query.toString()]);

  /** Values for one filter, counted against every other filter already set. */
  const valuesFor = (key) => {
    const others = { ...filters }; delete others[key];
    const base = catalogue.searchFrames(t, { limit: 0, filters: others }).items;
    const counts = new Map();
    for (const f of base) { const v = f[key]; if (v === null || v === undefined || v === '') continue; counts.set(v, (counts.get(v) ?? 0) + 1); }
    return [...counts.entries()].sort((a, b) => (typeof a[0] === 'number' ? a[0] - b[0] : String(a[0]).localeCompare(String(b[0]))));
  };

  return html`
    <${Bar} backTo="#/find" title="Frames" />
    <${Screen}>
      <div class="stack tight">
        <div class="pad"><${SearchField} value=${term} onInput=${(v) => set({ q: v })} placeholder="Brand, model, colour or barcode" /></div>
        <${List}>
          ${FILTERS.map((f) => html`<${Row} title=${html`<span class="silver" style="font-size:14px">${f.label}</span>`}
            end=${html`<span style=${{ color: filters[f.key] != null ? 'var(--platinum)' : 'var(--pewter)' }}>${filters[f.key] ?? 'Any'}</span>`} chev onClick=${() => setPicking(f)} />`)}
          <div class="row"><span class="main"><span class="silver" style="font-size:14px">In stock only</span></span>
            <${Toggle} label="In stock only" on=${Boolean(filters.inStock)} onChange=${(v) => set({ stock: v ? '1' : null })} /></div>
        <//>
        <div class="pad" style="display:flex;justify-content:space-between;align-items:baseline">
          <${Eyebrow}>${result.total === 1 ? '1 frame' : `${result.total.toLocaleString('en')} frames`}<//>
          ${Object.keys(filters).length > 0 && html`<button class="textbtn small" onClick=${() => go(href(['find', 'frames'], { q: term }), { replace: true })}>Clear filters</button>`}
        </div>
        ${result.total === 0 ? html`<div class="pad"><${Empty} title="No frames match">Loosen a filter, or search by the eight barcode digits.<//></div>` : html`
        <${List}>
          ${result.items.slice(0, limit).map((f) => html`<${Row} to=${'#/find/frame/' + f.sku} title=${f.description} one
            detail=${[f.sku, f.category, f.size ? `${f.size} mm` : null, f.stock != null ? stockLabel(f.stock) : null].filter(Boolean).join(' · ')}
            end=${money(f.price)} />`)}
        <//>
        ${result.total > limit && html`<div class="pad"><${Secondary} onClick=${() => setLimit(limit + 100)}>Show more (${(result.total - limit).toLocaleString('en')} left)<//></div>`}`}
      </div>
    <//>
    ${picking && html`<${Sheet} title=${picking.label} onClose=${() => setPicking(null)}>
      <${List}>
        <${Row} title="Any" onClick=${() => { set({ [picking.key]: null }); setPicking(null); }} />
        ${valuesFor(picking.key).map(([v, n]) => html`<${Row} title=${picking.num ? `${v} mm` : v} count=${n}
          onClick=${() => { set({ [picking.key]: String(v) }); setPicking(null); }} />`)}
      <//>
    <//>`}`;
}

export function FrameScreen({ sku }) {
  const catalogue = useApp((s) => s.catalogue);
  const frame = catalogue.framesBySku.get(sku);
  if (!frame) {
    if (catalogue.inventoryBySku.has(sku)) return html`<${StockScreen} sku=${sku} />`;
    return html`<${Bar} backTo="#/find" title="Frame" /><${Screen}><div class="pad"><${Empty} title="Not in the catalogue">Barcode ${sku} is not in the frame catalogue or the stock list.<//></div><//>`;
  }
  const promos = livePromotions(catalogue).filter((p) => brandKey(p.conditions).includes(brandKey(frame.brand)));
  const add = async () => {
    await addLine(frameLine(frame, frame.price, 'catalogue'));
    toast('Frame added to the order');
    go('#/find/order');
  };
  return html`
    <${Bar} backTo="#/find/frames" title="Frame" />
    <${Screen}>
      <div class="stack pad">
        <${ScreenTitle} eyebrow=${frame.brand} title=${frame.description} />
        ${frame.stock === 0 && html`<${Flag}>None on hand. The stock list is a snapshot — confirm on the shelf.<//>`}
        <${Figure} value=${money(frame.price)} caption="Tag price" size=${38} />
        <${Panel}>
          <${KV} k="Barcode" v=${frame.sku} mono />
          ${frame.product && html`<${KV} k="Product code" v=${frame.product} mono />`}
          <${KV} k="Brand" v=${frame.brand} />
          ${frame.tier && html`<${KV} k="Tier" v=${frame.tier.label} />`}
          ${frame.category && html`<${KV} k="Category" v=${frame.category} />`}
          ${frame.frameType && html`<${KV} k="Frame type" v=${frame.frameType} />`}
          ${frame.material && html`<${KV} k="Material" v=${frame.material} />`}
          ${frame.size && html`<${KV} k="Eye size" v=${`${frame.size} mm`} />`}
          <${KV} k="Stock" v=${stockLabel(frame.stock)} em=${frame.stock === 0} />
          ${frame.classification && html`<${KV} k="Class" v=${frame.classification} />`}
        <//>
        ${promos.length > 0 && html`<section class="gap-s">
          <${Eyebrow}>Promotions naming this brand<//>
          <${Panel} tight>${promos.map((p) => html`<div class="kv lined" style="display:block">
            <div style="display:flex;justify-content:space-between;gap:10px"><span>${p.name}</span><span class="mono sel">${p.id}</span></div>
            <div class="note">${p.conditions}</div></div>`)}<//>
          <p class="note">Read the condition: some promotions exclude the brands they name.</p>
        </section>`}
        <${Anchor} icon="plus" onClick=${add}>Add to order<//>
      </div>
    <//>`;
}

/** A stock item: a case, solution, accessory, boxed contact lens — or a frame the catalogue lacks. */
export function StockScreen({ sku }) {
  const catalogue = useApp((s) => s.catalogue);
  const item = catalogue.inventoryBySku.get(sku);
  const [typed, setTyped] = useState('');
  if (!item) return html`<${Bar} backTo="#/find" title="Stock" /><${Screen}><div class="pad"><${Empty} title="Not in the stock list">Barcode ${sku} is not in the inventory.<//></div><//>`;
  const isFrame = item.kind === 'frame';
  const pesos = Number(typed.replace(/[^\d]/g, ''));
  const price = pesos >= 50 && pesos <= 200000 ? pesos * 100 : null;
  const add = async () => {
    if (isFrame) await addLine(frameLine({ sku: item.sku, product: item.vendorSku, description: item.description, stock: item.stock }, price, 'tag'));
    else await addLine(extraLine(item.sku, item.description, 1, item.stock));
    toast('Added to the order');
    go('#/find/order');
  };
  return html`
    <${Bar} backTo="#/find" title="Stock" />
    <${Screen}>
      <div class="stack pad">
        <${ScreenTitle} eyebrow=${STOCK_KIND_LABEL[item.kind]} title=${item.description} />
        ${item.stock === 0 && html`<${Flag}>None on hand. The stock list is a snapshot — confirm on the shelf.<//>`}
        <${Panel}>
          <${KV} k="Barcode" v=${item.sku} mono />
          <${KV} k="Vendor SKU" v=${item.vendorSku} mono />
          <${KV} k="Stock" v=${stockLabel(item.stock)} em=${item.stock === 0} />
          ${item.classification && item.classification !== 'N/A' && html`<${KV} k="Class" v=${item.classification} />`}
          ${item.expires && html`<${KV} k="Expiry" v=${fmtExpiry(item.expires)} />`}
        <//>
        ${item.batches > 1 && html`<p class="note">${item.batches} batches, earliest expiry shown.</p>`}
        ${isFrame ? html`<section class="gap-s">
          <${Eyebrow}>Price from the tag<//>
          <label class="field"><span class="unit">$</span>
            <input inputmode="numeric" placeholder="Read it off the tag" value=${typed} onInput=${(e) => setTyped(e.currentTarget.value)} /></label>
          <p class="note">This frame is in stock but not in the catalogue, so its price is not known. Add it to Catalogue.xlsx and it will be next time.</p>
        </section>` : html`<p class="para">Priced at the register. It goes on the ticket as a code and a quantity.</p>`}
        <${Anchor} icon="plus" disabled=${isFrame && !price} onClick=${add}>Add to order<//>
      </div>
    <//>`;
}
