// The campaign's sets, as the seller reads them: which brands go in which set,
// the ID Maestro the register takes, and every lens row with what it adds and
// what the glasses come to.

import { html } from './html.js';
import { useApp } from './hooks.js';
import { Bar, Screen, ScreenTitle, Section, Row, Panel, KV, Figure, Empty, Eyebrow, useCopy, fmtDate } from './kit.js';
import { Icon } from './icons.js';
import { money } from '../core/money.js';
import { setStatus, setTable, rowPriceText, liveDiscounts, APPLIES_TO } from '../core/sets.js';

const brandList = (set) => String(set.brands ?? '').split(',').map((b) => b.split('/')[0].trim()).filter(Boolean);

export function SetsScreen() {
  const catalogue = useApp((s) => s.catalogue);
  const order = { Live: 0, Upcoming: 1, Ended: 2 };
  const sets = [...catalogue.sets].sort((a, b) => order[setStatus(a)] - order[setStatus(b)] || a.price - b.price);
  const discounts = liveDiscounts(catalogue);
  return html`
    <${Bar} backTo="#/find" title="Sets" />
    <${Screen}>
      <div class="stack">
        <p class="para pad">An ophthalmic frame from a set’s brands, with single vision lenses, at the set’s price. Better lenses add their row of the table. Scan the frame and the order works it out.</p>
        ${sets.length === 0 ? html`<div class="pad"><${Empty} title="No sets">Sets arrive with the campaign’s catalogue.<//></div>` : html`
        <${Section}>
          ${sets.map((s) => html`<${Row} to=${'#/find/sets/' + encodeURIComponent(s.id)} title=${s.name} off=${setStatus(s) === 'Ended'}
            detail=${brandList(s).slice(0, 6).join(', ') + (brandList(s).length > 6 ? '…' : '')}
            sub=${setStatus(s) === 'Live' ? `ID Maestro ${s.id}` : `${setStatus(s)} · ID Maestro ${s.id}`} end=${money(s.price)} chev />`)}
        <//>`}
        ${discounts.length > 0 && html`<${Section} title="Applied on their own">
          ${discounts.map((d) => html`<div class="row"><span class="main"><span class="t">${d.name}</span><span class="d">${APPLIES_TO[d.appliesTo] ?? d.appliesTo} · until ${fmtDate(d.validTo)}</span>
            ${d.only && html`<span class="d">Only ${d.only}</span>`}${d.except && html`<span class="d">Not ${d.except}</span>`}</span>
            <span class="end mono sel" style="font-size:15px;color:var(--platinum)">${d.id}</span></div>`)}
        <//>`}
      </div>
    <//>`;
}

export function SetScreen({ id }) {
  const catalogue = useApp((s) => s.catalogue);
  const set = catalogue.setsById.get(id);
  const [copied, copy] = useCopy();
  if (!set) return html`<${Bar} backTo="#/find/sets" title="Set" /><${Screen}><div class="pad"><${Empty} title="Not in the catalogue">This set may have ended with the last campaign.<//></div><//>`;
  const rows = setTable(catalogue, set);
  const groups = [...new Set(rows.map((r) => r.def.group))];
  const status = setStatus(set);
  return html`
    <${Bar} backTo="#/find/sets" title="Set" />
    <${Screen}>
      <div class="stack">
        <div class="pad stack tight">
          <${ScreenTitle} eyebrow=${status === 'Live' ? `${fmtDate(set.validFrom)} – ${fmtDate(set.validTo)}` : status} title=${set.name} />
          <${Figure} value=${money(set.price)} caption="Frame and single vision lenses" size=${38} />
          <div class="gap-s">
            <${Eyebrow}>ID Maestro<//>
            <div style="display:flex;align-items:center;gap:6px">
              <span class="pos-code sel">${set.id}</span>
              <button class="icon-btn" aria-label="Copy the ID Maestro" onClick=${() => copy(set.id)}><${Icon} name=${copied ? 'check' : 'copy'} /></button>
            </div>
          </div>
        </div>
        ${groups.map((g) => html`<${Section} title=${g}>
          ${rows.filter((r) => r.def.group === g).map((r) => html`<div class="row">
            <span class="main"><span class="t">${r.def.name}</span>${r.entry.price ? html`<span class="d">Glasses ${money(set.price + r.entry.price)}</span>` : html`<span class="d">Glasses ${money(set.price)}</span>`}</span>
            <span class="end" style="color:var(--platinum);font-size:13px">${r.entry.price ? '+' : ''}${rowPriceText(r.entry, money)}</span>
          </div>`)}
        <//>`)}
        <div class="pad gap-s">
          <${Eyebrow}>Brands<//>
          <${Panel}><p class="para" style="margin:0">${brandList(set).join(', ')}</p><//>
          ${set.notes && html`<p class="note">${set.notes}</p>`}
          <p class="note">Plus Protection, if added, is worked out on the glasses’ price.</p>
        </div>
      </div>
    <//>`;
}
