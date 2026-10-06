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
import { SET_GROUPS, APPLIES_TO, setStatus, rowPriceText, matchCount } from '../../core/sets.js';

const saved = (m = 'Saved to the working copy') => toast(m);

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
    <${Bar} backTo="#/me/data" title="Sets" trail=${html`<button class="bar-btn" aria-label="Add" onClick=${() => setAdding(true)}><${Icon} name="plus" /></button>`} />
    <${Screen}>
      <div class="stack">
        <div class="pad gap-s">
          <${Secondary} icon="clock" disabled=${!sets.length} onClick=${() => setDating(true)}>New campaign dates<//>
          <p class="note">Sets the new dates on every set and campaign discount at once. Prices that change go in each set.</p>
        </div>
        ${sets.length ? html`<${Section} title="Sets">
          ${[...sets].sort((a, b) => a.price - b.price).map((s) => html`<${Row} to=${'#/me/data/sets/' + encodeURIComponent(s.id)} title=${s.name}
            detail=${`${s.id} · ${fmtDate(s.validFrom)} – ${fmtDate(s.validTo)}`} sub=${setStatus(s) === 'Live' ? null : setStatus(s)} end=${money(s.price)} off=${setStatus(s) === 'Ended'} chev />`)}
        <//>` : html`<div class="pad"><${Empty} title="No sets">Add one with +, or import a workbook with a sets tab.<//></div>`}
        <${Section} title="Shared by every set">
          <${Row} to="#/me/data/setlenses" icon="lens" title="Lens rows" detail="The table's rows, and which lenses each one covers" count=${(bundle.setLenses ?? []).length} chev />
          <${Row} to="#/me/data/discounts" icon="doc" title="Campaign discounts" detail="Applied on their own: 30% on contacts…" count=${(bundle.discounts ?? []).length} chev />
        <//>
      </div>
    <//>
    ${adding && html`<${FormSheet} title="New set" fields=${setFields} onClose=${() => setAdding(false)}
      onSave=${(x) => { if (sets.some((s) => s.id === x.id)) return `ID Maestro ${x.id} is already a set.`; edit((b) => upsertSet(b, x)); saved('Set added'); }} />`}
    ${dating && html`<${CampaignDatesSheet} onClose=${() => setDating(false)} />`}`;
}

function CampaignDatesSheet({ onClose }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  return html`<${Sheet} title="New campaign dates" onClose=${onClose}>
    <div class="pad stack tight">
      <div class="form-group">
        <label class="form-row"><span class="k">From</span><input type="date" value=${from} onInput=${(e) => setFrom(e.currentTarget.value)} /></label>
        <label class="form-row"><span class="k">To</span><input type="date" value=${to} onInput=${(e) => setTo(e.currentTarget.value)} /></label>
      </div>
      <${Anchor} disabled=${!from || !to || to < from} onClick=${() => { edit((b) => setCampaignDates(b, from, to)); saved('Every set and discount moved to the new dates'); onClose(); }}>Set the dates<//>
    </div>
  <//>`;
}

export function SetAdminScreen({ id }) {
  const { bundle } = useWorking();
  const set = (bundle.sets ?? []).find((s) => s.id === id);
  const [editing, setEditing] = useState(false);
  const [pricing, setPricing] = useState(null);
  const [confirm, setConfirm] = useState(false);
  if (!set) return html`<${Bar} backTo="#/me/data/sets" title="Set" /><${Screen}><div class="pad"><${Empty} title="Not found">It may have been renamed or removed.<//></div><//>`;
  const rows = bundle.setLenses ?? [];
  const priceOf = (lensId) => (bundle.setPrices ?? []).find((p) => p.setId === set.id && p.lensId === lensId) ?? null;
  const groups = [...new Set(rows.map((r) => r.group))];
  return html`
    <${Bar} backTo="#/me/data/sets" title=${set.id} trail=${html`<button class="bar-btn" onClick=${() => setEditing(true)}>Edit</button>`} />
    <${Screen}>
      <div class="stack">
        <div class="pad stack tight">
          <div class="screen-title"><div class="eyebrow">${setStatus(set)}</div><h1>${set.name}</h1></div>
          <${Panel}>
            <${KV} k="ID Maestro" v=${set.id} mono />
            <${KV} k="Price" v=${money(set.price)} em />
            <${KV} k="Dates" v=${`${fmtDate(set.validFrom)} – ${fmtDate(set.validTo)}`} />
            <${KV} k="Brands" v=${set.brands || '—'} />
            ${set.notes && html`<${KV} k="Notes" v=${set.notes} />`}
          <//>
        </div>
        ${groups.map((g) => html`<${Section} title=${g}>
          ${rows.filter((r) => r.group === g).map((r) => {
            const p = priceOf(r.id);
            return html`<${Row} title=${r.name} end=${p ? rowPriceText(p, money) : 'Not in this set'} off=${!p} onClick=${() => setPricing(r)} />`;
          })}
        <//>`)}
        ${!rows.length && html`<p class="note pad">No lens rows yet. Add them under Lens rows; each set then gives each row its price.</p>`}
        <div class="pad"><${Quiet} danger onClick=${() => setConfirm(true)}>Delete set<//></div>
      </div>
    <//>
    ${editing && html`<${FormSheet} title="Set" initial=${set} fields=${setFields} onClose=${() => setEditing(false)}
      onSave=${(x) => {
        if (x.id !== set.id && (bundle.sets ?? []).some((s) => s.id === x.id)) return `ID Maestro ${x.id} is already a set.`;
        edit((b) => upsertSet(b, { ...set, ...x }, set.id)); saved();
        if (x.id !== set.id) go('#/me/data/sets/' + encodeURIComponent(x.id), { replace: true });
      }} />`}
    ${pricing && html`<${SetPriceSheet} set=${set} row=${pricing} entry=${priceOf(pricing.id)} onClose=${() => setPricing(null)} />`}
    ${confirm && html`<${Confirm} title="Delete this set?" message=${`${set.name} and its prices are removed from the working copy.`}
      onConfirm=${() => { edit((b) => deleteSet(b, set.id)); toast('Set removed'); go('#/me/data/sets', { replace: true }); }} onClose=${() => setConfirm(false)} />`}`;
}

function SetPriceSheet({ set, row, entry, onClose }) {
  return html`<${FormSheet} title=${row.name} initial=${{ price: entry?.price ?? null, special: Boolean(entry?.special) }} onClose=${onClose}
    intro=${`${set.name} · ${row.group}. Blank takes the row out of this set; 0 means included.`}
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
    <${Bar} backTo="#/me/data/sets" title="Lens rows" trail=${html`<button class="bar-btn" aria-label="Add" onClick=${() => setOpen({ d: { id: '', group: SET_GROUPS[0], name: '', match: '' } })}><${Icon} name="plus" /></button>`} />
    <${Screen}>
      <div class="stack">
        <p class="para pad">The rows of the sets’ table. Each one says which catalogue lenses it covers, so a lens on an order finds its row on its own; a row with no match is picked by hand.</p>
        ${groups.map((g) => html`<${Section} title=${g}>
          ${rows.filter((r) => r.group === g).map((r) => {
            const n = count(r.match);
            return html`<${Row} title=${r.name} detail=${r.match || 'Chosen by hand'} mono sub=${r.match ? `${n} lens${n === 1 ? '' : 'es'} in the catalogue` : null} onClick=${() => setOpen({ d: r, id: r.id })} />`;
          })}
        <//>`)}
      </div>
    <//>
    ${open && html`<${FormSheet} title=${open.id ? 'Lens row' : 'New lens row'} initial=${open.d} onClose=${() => setOpen(null)}
      fields=${[
        { key: 'id', label: 'Id', required: true, placeholder: 'sv-trans-crizal' },
        { key: 'group', label: 'Group', required: true, suggest: SET_GROUPS },
        { key: 'name', label: 'Name', required: true },
        { key: 'match', label: 'Match', type: 'textarea', hint: 'family|material|design|filter|colour|coating. SV or a lens type (PR, FT); codes from the vocabulary, several with commas; *GROUP for a promo group (*POLY, *TRANS, *CRIZAL); ! for “anything but”; * for anything. Several matches separate with ; — e.g. SV|*POLY,*CR39|!ES,EK,SL|*TRANS|*|CZN,CZS,CPU' },
      ]}
      onSave=${(x) => {
        if (x.id !== open.id && rows.some((r) => r.id === x.id)) return `Row id ${x.id} is already used.`;
        edit((b) => upsertSetLens(b, x, open.id)); saved();
      }}
      onDelete=${open.id ? () => { edit((b) => deleteSetLens(b, open.id)); saved('Row removed from every set'); } : null}
      deleteMessage="The row and its price in every set are removed from the working copy." />`}`;
}

export function DiscountsScreen() {
  const { bundle } = useWorking();
  const list = bundle.discounts ?? [];
  const [open, setOpen] = useState(null);
  return html`
    <${Bar} backTo="#/me/data/sets" title="Campaign discounts" trail=${html`<button class="bar-btn" aria-label="Add" onClick=${() => setOpen({ d: { id: '', name: '', percent: null, appliesTo: 'contacts' } })}><${Icon} name="plus" /></button>`} />
    <${Screen}>
      <div class="stack">
        <p class="para pad">Percentages the order applies on its own while their dates run — the seller can still change them on the line.</p>
        ${list.length ? html`<${List}>${list.map((d) => html`<${Row} title=${d.name} detail=${`${d.id} · ${APPLIES_TO[d.appliesTo] ?? d.appliesTo} · ${fmtDate(d.validFrom)} – ${fmtDate(d.validTo)}`}
          sub=${[d.only && `Only ${d.only}`, d.except && `Not ${d.except}`].filter(Boolean).join(' · ') || null}
          end=${`${d.percent}%`} off=${setStatus(d) === 'Ended'} onClick=${() => setOpen({ d, id: d.id })} />`)}<//>` : html`<div class="pad"><${Empty} title="None">Add one with +.<//></div>`}
      </div>
    <//>
    ${open && html`<${FormSheet} title=${open.id ? 'Discount' : 'New discount'} initial=${open.d} onClose=${() => setOpen(null)}
      fields=${[
        { key: 'id', label: 'Promotion no.', required: true, inputmode: 'numeric' },
        { key: 'name', label: 'Name', required: true, placeholder: '30% off contact lenses' },
        { key: 'percent', label: 'Percent', type: 'number', required: true },
        { key: 'appliesTo', label: 'Applies to', type: 'select', options: Object.entries(APPLIES_TO).map(([value, label]) => ({ value, label })) },
        { key: 'only', label: 'Only', type: 'textarea', hint: 'Leave blank for all. Otherwise the brands (frames) or products (contact lenses) it is limited to, separated by commas.' },
        { key: 'except', label: 'Except', type: 'textarea', hint: 'Brands or products it never applies to, separated by commas.' },
        { key: 'validFrom', label: 'From', type: 'date' },
        { key: 'validTo', label: 'To', type: 'date' },
      ]}
      onSave=${(x) => {
        if (x.id !== open.id && list.some((d) => d.id === x.id)) return `Promotion ${x.id} is already listed.`;
        if (!(x.percent > 0 && x.percent <= 100)) return 'The percentage must be more than 0 and at most 100.';
        edit((b) => upsertDiscount(b, x, open.id)); saved();
      }}
      onDelete=${open.id ? () => { edit((b) => deleteDiscount(b, open.id)); saved('Removed'); } : null} />`}`;
}

export { Eyebrow };
