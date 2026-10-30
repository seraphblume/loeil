// Sets, the editor's side: each set (ID Maestro, price, dates, brands) and its
// price for every row of the table; the rows themselves and which lenses each
// covers; and the campaign discounts that apply on their own. A new campaign
// is usually new dates on everything, and a few prices.

import { html, useState } from '../html.js';
import { Bar, Screen, Section, List, Row, Panel, KV, Secondary, Anchor, Quiet, Confirm, Sheet, Empty, Eyebrow, fmtDate } from '../kit.js';
import { Icon } from '../icons.js';
import { FormSheet } from './form.js';
import { useWorking } from './home.js';
import { edit } from '../../state/working.js';
import { toast } from '../../state/app.js';
import { go } from '../router.js';
import { money } from '../../core/money.js';
import { resolve } from '../../core/lens.js';
import {
  upsertSet, deleteSet, setSetPrice, upsertSetLens, deleteSetLens, upsertDiscount, deleteDiscount, setCampaignDates,
} from '../../core/edits.js';
import {
  SET_GROUPS, APPLIES_TO, setStatus, rowPriceText, matchCount, parsePriceTable, priceTableText, frameSkusText, parseFrameSkusText, frameSkusSummary,
} from '../../core/sets.js';
import { tr, trn } from '../../i18n.js';

const saved = (m = 'Saved to the working copy') => toast(tr(m));

const setFields = [
  { key: 'id', label: 'ID Maestro', required: true, inputmode: 'numeric' },
  { key: 'name', label: 'Name', required: true, placeholder: 'Set $1,999' },
  { key: 'price', label: 'Price', type: 'money', required: true },
  { key: 'validFrom', label: 'From', type: 'date' },
  { key: 'validTo', label: 'To', type: 'date' },
  { key: 'brands', label: 'Brands', type: 'textarea', hint: 'Separated by commas, as the table prints them. Two names for one brand go with a slash — CK / Calvin Klein — so a frame is found whichever the catalogue or the stock description uses.' },
  { key: 'notes', label: 'Notes', type: 'textarea' },
];

export function SetsAdminScreen() {
  const { bundle } = useWorking();
  const sets = bundle.sets ?? [];
  const [adding, setAdding] = useState(false);
  const [dating, setDating] = useState(false);
  return html`
    <${Bar} backTo="#/me/data" title=${tr('Sets')} trail=${html`<button class="bar-btn" aria-label=${tr('Add')} onClick=${() => setAdding(true)}><${Icon} name="plus" /></button>`} />
    <${Screen}>
      <div class="stack">
        <div class="pad gap-s">
          <${Secondary} icon="clock" disabled=${!sets.length} onClick=${() => setDating(true)}>${tr('New campaign dates')}<//>
          <p class="note">${tr('Sets the new dates on every set and campaign discount at once. Prices that change go in each set.')}</p>
        </div>
        ${sets.length ? html`<${Section} title=${tr('Sets')}>
          ${[...sets].sort((a, b) => a.price - b.price).map((s) => html`<${Row} to=${'#/me/data/sets/' + encodeURIComponent(s.id)} title=${s.name}
            detail=${`${s.id} · ${fmtDate(s.validFrom)} – ${fmtDate(s.validTo)}`} sub=${setStatus(s) === 'Live' ? null : tr(setStatus(s))} end=${money(s.price)} off=${setStatus(s) === 'Ended'} chev />`)}
        <//>` : html`<div class="pad"><${Empty} title=${tr('No sets')}>${tr('Add one with +, or import a workbook with a sets tab.')}<//></div>`}
        <${Section} title=${tr('Shared by every set')}>
          <${Row} to="#/me/data/setlenses" icon="lens" title=${tr('Lens rows')} detail=${tr('The table\'s rows, and which lenses each one covers')} count=${(bundle.setLenses ?? []).length} chev />
          <${Row} to="#/me/data/discounts" icon="doc" title=${tr('Discounts')} detail=${tr('30% on contacts, own frame, prescription sun, Sam’s Club…')} count=${(bundle.discounts ?? []).length} chev />
        <//>
      </div>
    <//>
    ${adding && html`<${FormSheet} title=${tr('New set')} fields=${setFields} onClose=${() => setAdding(false)}
      onSave=${(x) => { if (sets.some((s) => s.id === x.id)) return tr('ID Maestro {id} is already a set.', { id: x.id }); edit((b) => upsertSet(b, x)); saved('Set added'); }} />`}
    ${dating && html`<${CampaignDatesSheet} onClose=${() => setDating(false)} />`}`;
}

function CampaignDatesSheet({ onClose }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  return html`<${Sheet} title=${tr('New campaign dates')} onClose=${onClose}>
    <div class="pad stack tight">
      <div class="form-group">
        <label class="form-row"><span class="k">${tr('From')}</span><input type="date" value=${from} onInput=${(e) => setFrom(e.currentTarget.value)} /></label>
        <label class="form-row"><span class="k">${tr('To')}</span><input type="date" value=${to} onInput=${(e) => setTo(e.currentTarget.value)} /></label>
      </div>
      <${Anchor} disabled=${!from || !to || to < from} onClick=${() => { edit((b) => setCampaignDates(b, from, to)); saved('Every set and discount moved to the new dates'); onClose(); }}>${tr('Set the dates')}<//>
    </div>
  <//>`;
}

export function SetAdminScreen({ id }) {
  const { bundle } = useWorking();
  const set = (bundle.sets ?? []).find((s) => s.id === id);
  const [editing, setEditing] = useState(false);
  const [pricing, setPricing] = useState(null);
  const [confirm, setConfirm] = useState(false);
  if (!set) return html`<${Bar} backTo="#/me/data/sets" title=${tr('Set')} /><${Screen}><div class="pad"><${Empty} title=${tr('Not found')}>${tr('It may have been renamed or removed.')}<//></div><//>`;
  const rows = bundle.setLenses ?? [];
  const priceOf = (lensId) => (bundle.setPrices ?? []).find((p) => p.setId === set.id && p.lensId === lensId) ?? null;
  const groups = [...new Set(rows.map((r) => r.group))];
  return html`
    <${Bar} backTo="#/me/data/sets" title=${set.id} trail=${html`<button class="bar-btn" onClick=${() => setEditing(true)}>${tr('Edit')}</button>`} />
    <${Screen}>
      <div class="stack">
        <div class="pad stack tight">
          <div class="screen-title"><div class="eyebrow">${setStatus(set)}</div><h1>${set.name}</h1></div>
          <${Panel}>
            <${KV} k=${tr('ID Maestro')} v=${set.id} mono />
            <${KV} k=${tr('Price')} v=${money(set.price)} em />
            <${KV} k=${tr('Dates')} v=${`${fmtDate(set.validFrom)} – ${fmtDate(set.validTo)}`} />
            <${KV} k=${tr('Brands')} v=${set.brands || '—'} />
            ${set.notes && html`<${KV} k=${tr('Notes')} v=${set.notes} />`}
          <//>
        </div>
        ${groups.map((g) => html`<${Section} title=${g}>
          ${rows.filter((r) => r.group === g).map((r) => {
            const p = priceOf(r.id);
            return html`<${Row} title=${r.name} end=${p ? rowPriceText(p, money) : tr('Not in this set')} off=${!p} onClick=${() => setPricing(r)} />`;
          })}
        <//>`)}
        ${!rows.length && html`<p class="note pad">${tr('No lens rows yet. Add them under Lens rows; each set then gives each row its price.')}</p>`}
        <div class="pad"><${Quiet} danger onClick=${() => setConfirm(true)}>${tr('Delete set')}<//></div>
      </div>
    <//>
    ${editing && html`<${FormSheet} title=${tr('Set')} initial=${set} fields=${setFields} onClose=${() => setEditing(false)}
      onSave=${(x) => {
        if (x.id !== set.id && (bundle.sets ?? []).some((s) => s.id === x.id)) return tr('ID Maestro {id} is already a set.', { id: x.id });
        edit((b) => upsertSet(b, { ...set, ...x }, set.id)); saved();
        if (x.id !== set.id) go('#/me/data/sets/' + encodeURIComponent(x.id), { replace: true });
      }} />`}
    ${pricing && html`<${SetPriceSheet} set=${set} row=${pricing} entry=${priceOf(pricing.id)} onClose=${() => setPricing(null)} />`}
    ${confirm && html`<${Confirm} title=${tr('Delete this set?')} message=${`${set.name} and its prices are removed from the working copy.`}
      onConfirm=${() => { edit((b) => deleteSet(b, set.id)); toast(tr('Set removed')); go('#/me/data/sets', { replace: true }); }} onClose=${() => setConfirm(false)} />`}`;
}

function SetPriceSheet({ set, row, entry, onClose }) {
  return html`<${FormSheet} title=${row.name} initial=${{ price: entry?.price ?? null, special: Boolean(entry?.special) }} onClose=${onClose}
    intro=${`${set.name} · ${row.group}. ${tr('Blank takes the row out of this set; 0 means included.')}`}
    fields=${[
      { key: 'price', label: 'Price', type: 'money', placeholder: 'Not in this set' },
      { key: 'special', label: 'Special price', type: 'toggle', hint: 'Printed as “Precio especial” on the table.' },
    ]}
    onSave=${(x) => { edit((b) => setSetPrice(b, set.id, row.id, x.price == null ? null : { price: x.price, special: x.special })); saved(); }} />`;
}

export function SetLensesScreen() {
  const { cat, bundle } = useWorking();
  const rows = bundle.setLenses ?? [];
  const [open, setOpen] = useState(null);
  const groups = [...new Set([...SET_GROUPS, ...rows.map((r) => r.group)])].filter((g) => rows.some((r) => r.group === g));
  const count = (match) => matchCount(cat, match, (r) => resolve(cat, r));
  return html`
    <${Bar} backTo="#/me/data/sets" title=${tr('Lens rows')} trail=${html`<button class="bar-btn" aria-label=${tr('Add')} onClick=${() => setOpen({ d: { id: '', group: SET_GROUPS[0], name: '', match: '' } })}><${Icon} name="plus" /></button>`} />
    <${Screen}>
      <div class="stack">
        <p class="para pad">${tr('The rows of the sets’ table. Each one says which catalogue lenses it covers, so a lens on an order finds its row on its own; a row with no match is picked by hand.')}</p>
        ${groups.map((g) => html`<${Section} title=${g}>
          ${rows.filter((r) => r.group === g).map((r) => {
            const n = count(r.match);
            return html`<${Row} title=${r.name} detail=${r.match || tr('Chosen by hand')} mono sub=${r.match ? trn(n, '1 lens in the catalogue', '{n} lenses in the catalogue') : null} onClick=${() => setOpen({ d: r, id: r.id })} />`;
          })}
        <//>`)}
      </div>
    <//>
    ${open && html`<${FormSheet} title=${open.id ? tr('Lens row') : tr('New lens row')} initial=${open.d} onClose=${() => setOpen(null)}
      fields=${[
        { key: 'id', label: 'Id', required: true, placeholder: 'sv-trans-crizal' },
        { key: 'group', label: 'Group', required: true, suggest: SET_GROUPS },
        { key: 'name', label: 'Name', required: true },
        { key: 'match', label: 'Match', type: 'textarea', hint: 'family|material|design|filter|colour|coating. SV or a lens type (PR, FT); codes from the vocabulary, several with commas; *GROUP for a promo group (*POLY, *TRANS, *CRIZAL); ! for “anything but”; * for anything. Several matches separate with ; — e.g. SV|*POLY,*CR39|!ES,EK,SL|*TRANS|*|CZN,CPU' },
      ]}
      onSave=${(x) => {
        if (x.id !== open.id && rows.some((r) => r.id === x.id)) return tr('Row id {id} is already used.', { id: x.id });
        edit((b) => upsertSetLens(b, x, open.id)); saved();
      }}
      onDelete=${open.id ? () => { edit((b) => deleteSetLens(b, open.id)); saved('Row removed from every set'); } : null}
      deleteMessage=${tr('The row and its price in every set are removed from the working copy.')} />`}`;
}

export function DiscountsScreen() {
  const { bundle } = useWorking();
  const list = bundle.discounts ?? [];
  const [open, setOpen] = useState(null);
  const lowest = (d) => Math.min(...(d.prices ?? []).filter((r) => r.price != null).map((r) => r.price));
  const amount = (d) => (d.prices?.length ? tr('from {price}', { price: money(lowest(d)) }) : d.percent > 0 ? `${d.percent}%` : '—');
  const when = (d) => (d.validFrom || d.validTo ? `${fmtDate(d.validFrom)} – ${fmtDate(d.validTo)}` : tr('Standing'));
  return html`
    <${Bar} backTo="#/me/data/sets" title=${tr('Discounts')} trail=${html`<button class="bar-btn" aria-label=${tr('Add')} onClick=${() => setOpen({ d: { id: '', name: '', percent: null, appliesTo: 'contacts' } })}><${Icon} name="plus" /></button>`} />
    <${Screen}>
      <div class="stack">
        <p class="para pad">${tr('Applied by the order on its own while their dates run — a percentage, or a table of lens prices. One that names what the client shows (a membership card) waits for the seller to switch it on. A line takes one discount, never two, and the seller can still change it on the line.')}</p>
        ${list.length ? html`<${List}>${list.map((d) => html`<${Row} title=${d.name} detail=${`${d.id} · ${tr(APPLIES_TO[d.appliesTo] ?? d.appliesTo)} · ${when(d)}`}
          sub=${[d.requires && tr('Shows: {what}', { what: d.requires }), d.prices?.length && (d.prices.some((r) => r.price == null) ? tr('{n} lens prices, some to confirm', { n: d.prices.length }) : tr('{n} lens prices', { n: d.prices.length })),
            d.frameSkus ? trn(Object.keys(d.frameSkus).length, '1 participating frame ({split})', '{n} participating frames ({split})', { split: frameSkusSummary(d.frameSkus) })
              : d.framePicks?.length && tr('Participating frames: {list}', { list: d.framePicks.map((x) => `${x}%`).join(' / ') }),
            d.only && tr('Only {a}', { a: d.only }), d.except && tr('Not {a}', { a: d.except })].filter(Boolean).join(' · ') || null}
          end=${amount(d)} off=${setStatus(d) === 'Ended'} onClick=${() => setOpen({ d, id: d.id })} />`)}<//>` : html`<div class="pad"><${Empty} title=${tr('None')}>${tr('Add one with +.')}<//></div>`}
      </div>
    <//>
    ${open && html`<${FormSheet} title=${open.id ? tr('Discount') : tr('New discount')} initial=${{ ...open.d, pricesText: priceTableText(open.d.prices), framePicksText: (open.d.framePicks ?? []).join(', '), frameSkusText: frameSkusText(open.d.frameSkus) }} onClose=${() => setOpen(null)}
      fields=${[
        { key: 'id', label: 'Promotion no.', required: true, inputmode: 'numeric', group: 'Discount' },
        { key: 'name', label: 'Name', required: true, placeholder: '30% off contact lenses', group: 'Discount' },
        { key: 'appliesTo', label: 'Applies to', type: 'select', options: Object.entries(APPLIES_TO).map(([value, label]) => ({ value, label })), group: 'Discount' },
        { key: 'percent', label: 'Percent', type: 'number', group: 'How much', hint: 'Or lens prices below instead.' },
        { key: 'pricesText', label: 'Lens prices', type: 'textarea', group: 'How much', placeholder: 'SV|*POLY|*|*POLAR|PLG,PLV,PLC|ARC = 3999',
          hint: 'One lens per line: family|material|design|filter|colour|coating, as in the set rows, then = the pair’s price. “= ?” for a lens the offer covers at a price not known yet. The first line that matches wins, and the price replaces the lens’s own, as the register prints it.' },
        { key: 'frameSkusText', label: 'Participating frame SKUs', type: 'textarea', rows: 6, placeholder: '20105189 = 50', group: 'How much',
          hint: 'One frame per line: its 8-digit SKU = its percentage, as the POS’s report of participating frames gives them. Importing that report (Catalogue data → Import a report or workbook) fills this in. A listed frame outside a set takes it on its own; one in a set keeps the set unless the seller takes it out for this. A frame not on the list takes nothing. Blank: no list.' },
        { key: 'framePicksText', label: 'Sticker percentages', placeholder: '30, 50', group: 'How much',
          hint: 'Only without a list of SKUs. Percentages separated by commas, as the stickers on the frames say. On a frame, the seller picks the one its sticker shows, and the frame leaves its set. Blank: none.' },
        { key: 'requires', label: 'The client shows', placeholder: 'e.g. Sam’s Club membership card', group: 'Who', hint: 'Set: the seller switches it on for the order. Blank: it applies on its own.' },
        { key: 'only', label: 'Only', type: 'textarea', group: 'Who', hint: 'Leave blank for all. Otherwise the brands (frames) or products (contact lenses) it is limited to, separated by commas.' },
        { key: 'except', label: 'Except', type: 'textarea', group: 'Who', hint: 'Brands or products it never applies to, separated by commas.' },
        { key: 'validFrom', label: 'From', type: 'date', group: 'When', hint: 'Both blank: standing, and a new campaign’s dates leave it alone.' },
        { key: 'validTo', label: 'To', type: 'date', group: 'When' },
      ]}
      onSave=${(x) => {
        if (x.id !== open.id && list.some((d) => d.id === x.id)) return tr('Promotion {id} is already listed.', { id: x.id });
        const d = { id: String(x.id).trim(), name: String(x.name).trim(), percent: x.percent ?? 0, appliesTo: x.appliesTo,
          only: String(x.only ?? '').trim(), except: String(x.except ?? '').trim(), validFrom: x.validFrom || '', validTo: x.validTo || '' };
        const prices = parsePriceTable(x.pricesText);
        if (prices.length) d.prices = prices;
        const picks = String(x.framePicksText ?? '').split(/[,\s/]+/).map((v) => Number(v.replace('%', ''))).filter((v) => v > 0 && v <= 100);
        if (picks.length) d.framePicks = [...new Set(picks)].sort((a, b) => a - b);
        const skus = parseFrameSkusText(x.frameSkusText);
        const unreadable = String(x.frameSkusText ?? '').split(/[\n;]+/).filter((l) => l.trim() && !Object.keys(parseFrameSkusText(l)).length);
        if (unreadable.length) return tr('Every participating frame needs its 8-digit SKU and a percentage: 20105189 = 50.');
        if (Object.keys(skus).length) d.frameSkus = skus;
        if (String(x.requires ?? '').trim()) d.requires = String(x.requires).trim();
        if (!prices.length && !picks.length && !d.frameSkus && !(d.percent > 0 && d.percent <= 100)) return tr('Give a percentage (more than 0, at most 100), lens prices or frame percentages.');
        edit((b) => upsertDiscount(b, d, open.id)); saved();
      }}
      onDelete=${open.id ? () => { edit((b) => deleteDiscount(b, open.id)); saved('Removed'); } : null} />`}`;
}

export { Eyebrow };
