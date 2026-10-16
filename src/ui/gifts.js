// Brand gifts: when a brand gives something away with its frames (Converse,
// Carrera, Tommy, Nautica this campaign). Kept as promotions of kind `gift` —
// Catalogue data → Promotions — and shown wherever that brand's frame is: in the
// frame lists, on the frame, on the order, and in their own list on Me.

import { html } from './html.js';
import { useApp } from './hooks.js';
import { Bar, Screen, Section, Empty, Flag, fmtDate } from './kit.js';
import { Icon } from './icons.js';
import { giftsFor, giftItems, giftBrands, liveGifts } from '../core/promotions.js';
import { extraLine } from '../core/orders.js';
import { addLine, toast } from '../state/app.js';
import { brandKey } from '../core/util.js';

/** The small gift beside a frame or a brand in a list. */
export function GiftBadge({ brand }) {
  const gifts = useApp((s) => giftsFor(s.catalogue, brand));
  return gifts.length ? html`<span class="gift-badge" title="Gift with this brand’s frames"><${Icon} name="gift" />Gift</span>` : null;
}

const itemLine = (i) => (i.stock == null ? i.description : `${i.description} · ${i.stock} on hand`);

/** On a frame: what the brand gives with it. */
export function GiftPanel({ brand }) {
  const catalogue = useApp((s) => s.catalogue);
  const gifts = giftsFor(catalogue, brand);
  if (!gifts.length) return null;
  return html`${gifts.map((g) => html`<${Flag} icon="gift" key=${g.id}>
    <strong style="font-weight:500">${brand} gives a gift with this frame.</strong>
    ${g.description ? ` ${g.description}` : ''}
    ${giftItems(catalogue, g).length > 0 && html`<div class="gift-items">${giftItems(catalogue, g).map((i) => html`<div>${itemLine(i)}</div>`)}</div>`}
    ${g.validTo && html`<div class="gift-until">Until ${fmtDate(g.validTo)}</div>`}
  <//>`)}`;
}

/** On the order: the gift each frame's brand gives, and one tap to put it on the ticket. */
export function OrderGifts({ order }) {
  const catalogue = useApp((s) => s.catalogue);
  const brands = [...new Map(order.lines.filter((l) => l.kind === 'frame' && l.brand).map((l) => [brandKey(l.brand), l.brand])).values()];
  const have = new Set(order.lines.filter((l) => l.kind === 'extra').map((l) => l.code));
  const found = brands.flatMap((brand) => giftsFor(catalogue, brand).map((g) => ({ brand, g, items: giftItems(catalogue, g) })));
  if (!found.length) return null;
  const add = async (i) => { await addLine(extraLine(i.sku, i.description, 1, i.stock)); toast('Gift on the order'); };
  return html`${found.map(({ brand, g, items }) => html`<div class="pad" key=${g.id + brand}><${Flag} icon="gift">
    <strong style="font-weight:500">${brand} gives a gift with the frame.</strong>${g.description ? ` ${g.description}` : ''}
    ${items.length > 0 && html`<div class="gift-items">${items.map((i) => (have.has(i.sku)
      ? html`<div>${i.description} · on the order</div>`
      : html`<div><button type="button" class="link" onClick=${() => add(i)}>Add ${i.description}</button>${i.stock != null ? ` · ${i.stock} on hand` : ''}</div>`))}</div>`}
  <//></div>`)}`;
}

/** Me → Brand gifts. */
export function GiftsScreen() {
  const catalogue = useApp((s) => s.catalogue);
  const gifts = liveGifts(catalogue);
  return html`
    <${Bar} backTo="#/me" title="Brand gifts" />
    <${Screen}>
      <div class="stack">
        ${gifts.length === 0 ? html`<div class="pad"><${Empty} title="No brand gifts today">When a brand gives something away with its frames, an admin adds it under Catalogue data → Promotions, as a gift.<//></div>`
          : html`<${Section} title="With their frames">${gifts.map((g) => html`<div class="row" style="align-items:flex-start" key=${g.id}>
            <span class="ico"><${Icon} name="gift" /></span>
            <span class="main">
              <span class="t">${giftBrands(g).join(', ') || g.name}</span>
              ${g.description && html`<span class="d">${g.description}</span>`}
              ${giftItems(catalogue, g).map((i) => html`<span class="d">${itemLine(i)}</span>`)}
              <span class="s">${g.validFrom ? fmtDate(g.validFrom) : ''} – ${g.validTo ? fmtDate(g.validTo) : ''}</span>
            </span>
          </div>`)}<//>`}
        <p class="note pad">The frame’s screen, the frame lists and the order show the gift too. On the order, one tap puts the gift item on the ticket.</p>
      </div>
    <//>`;
}
