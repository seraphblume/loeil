// The keyed lists of the data editor: names and coatings (vocabulary), frames,
// brand tiers, stock, extras and staff. Each is a searchable list and one form.

import { html, useState, useRef } from '../html.js';
import { Bar, Screen, SearchField, List, Row, Eyebrow, Empty, Secondary, Panel, KV, Flag } from '../kit.js';
import { Icon } from '../icons.js';
import { Chip } from './lenses.js';
import { FormSheet } from './form.js';
import { useWorking } from './home.js';
import { edit } from '../../state/working.js';
import { toast } from '../../state/app.js';
import { go } from '../router.js';
import { VOCAB_KINDS } from '../../core/validate.js';
import {
  upsertVocab, deleteVocab, upsertFrame, deleteFrame, setTier, upsertStock, deleteStock, replaceStock,
  upsertExtra, deleteExtra, upsertStaff, deleteStaff, framesFromCode, brandFromDescription,
} from '../../core/edits.js';
import { money } from '../../core/money.js';
import { fold, brandKey, parseCodeLabel } from '../../core/util.js';
import { stockLabel, STOCK_KIND_LABEL } from '../../core/catalogue.js';
import { stockKind } from '../../core/stock.js';
import { readStockPdf } from './io.js';
import { collapseStock } from '../../core/stockreport.js';

const KIND_LABEL = {
  category: 'Filters', material: 'Materials', lens_type: 'Lens types', design: 'Designs', colour: 'Colours', treatment: 'Coatings',
  contact_material: 'Contact: correction', contact_product: 'Contact: products', contact_colour: 'Contact: colours', tier: 'Frame tiers',
};
const saved = (msg = 'Saved to the working copy') => toast(msg);

// ---------------------------------------------------------------------------
// Vocabulary

export function VocabScreen({ query }) {
  const { bundle } = useWorking();
  const kind = query.get('kind') || 'treatment';
  const [term, setTerm] = useState('');
  const [open, setOpen] = useState(null);
  const usage = new Map();
  const count = (k, raw) => { const c = parseCodeLabel(raw).code; usage.set(`${k}|${c}`, (usage.get(`${k}|${c}`) ?? 0) + 1); };
  for (const r of bundle.lenses.single) { count('category', r.category); count('material', r.material); count('design', r.design); count('colour', r.colour); count('treatment', r.treatment); }
  for (const r of bundle.lenses.multifocal) { count('category', r.category); count('material', r.material); count('lens_type', r.type); count('design', r.design); count('colour', r.colour); count('treatment', r.treatment); }
  for (const r of bundle.lenses.contact) { count('contact_material', r.material); count('contact_product', r.product); count('contact_colour', r.colour); }
  const entries = bundle.vocabulary.filter((v) => v.kind === kind && (!term || fold(`${v.code} ${v.english} ${v.blurb}`).includes(fold(term))))
    .sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999) || a.code.localeCompare(b.code));
  const missing = [...usage.keys()].filter((k) => k.startsWith(kind + '|') && !bundle.vocabulary.some((v) => `${v.kind}|${v.code}` === k)).map((k) => k.split('|')[1]);
  const setKind = (k) => go(`#/me/data/vocab?kind=${k}`, { replace: true });

  return html`
    <${Bar} backTo="#/me/data" title="Names and coatings" trail=${html`<button class="bar-btn" aria-label="Add" onClick=${() => setOpen({ v: { kind, code: '', english: '', blurb: '', rank: null, group: '', sameAs: '', highRx: false } })}><${Icon} name="plus" /></button>`} />
    <${Screen}>
      <div class="stack tight">
        <div class="pad" style="display:flex;gap:6px;overflow-x:auto;scrollbar-width:none">
          ${VOCAB_KINDS.map((k) => html`<${Chip} on=${k === kind} onClick=${() => setKind(k)}>${KIND_LABEL[k]}<//>`)}
        </div>
        <div class="pad"><${SearchField} value=${term} onInput=${setTerm} placeholder="Code or name" /></div>
        ${kind === 'treatment' && html`<p class="note pad">Rank is the upgrade ladder: a lens offers every coating ranked above its own. Promo group CRIZAL makes a coating match *CRIZAL promo lines.</p>`}
        ${missing.length > 0 && html`<div class="pad"><${Flag}>Used by lenses but not named here: ${missing.join(', ')}. They show in the POS wording until added.<//></div>`}
        <${List}>${entries.map((v) => html`<${Row} title=${v.english || v.code} detail=${[v.code, v.blurb].filter(Boolean).join(' · ')}
          sub=${[v.rank != null ? `rank ${v.rank}` : null, v.group ? `group ${v.group}` : null, v.sameAs ? `same as ${v.sameAs}` : null, v.highRx ? 'high Rx' : null].filter(Boolean).join(' · ') || null}
          count=${usage.get(`${kind}|${v.code}`) ?? 0} onClick=${() => setOpen({ v, key: `${v.kind}|${v.code}` })} />`)}<//>
        ${!entries.length && html`<div class="pad"><${Empty} title="Nothing here">Add one with +.<//></div>`}
      </div>
    <//>
    ${open && html`<${FormSheet} title=${open.key ? `${open.v.code}` : 'New entry'} initial=${open.v} onClose=${() => setOpen(null)}
      fields=${[
        { key: 'kind', label: 'Kind', type: 'select', options: VOCAB_KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] })) },
        { key: 'code', label: 'Code', required: true, caps: true, hint: 'Exactly as the POS uses it. Never change a code that lenses use.' },
        { key: 'english', label: 'English name' },
        { key: 'blurb', label: 'Blurb', type: 'textarea' },
        { key: 'rank', label: 'Rank', type: 'number', placeholder: 'blank = none' },
        { key: 'group', label: 'Promo group', caps: true, placeholder: 'e.g. CRIZAL, POLY, TRANS' },
        { key: 'sameAs', label: 'Same as', caps: true, placeholder: 'old/new code' },
        { key: 'highRx', label: 'High Rx', type: 'toggle' },
      ]}
      onSave=${(x) => {
        const v = { ...x, code: x.code.trim(), group: (x.group || '').toUpperCase(), sameAs: (x.sameAs || '').toUpperCase() };
        const key = `${v.kind}|${v.code}`;
        if (key !== open.key && bundle.vocabulary.some((y) => `${y.kind}|${y.code}` === key)) return `${v.code} is already listed.`;
        edit((b) => upsertVocab(b, v, open.key)); saved();
      }}
      onDelete=${open.key ? () => { edit((b) => deleteVocab(b, open.key)); saved('Removed'); } : null}
      deleteMessage="Lenses keep their code; they show the POS wording until it is named again." />`}`;
}

// ---------------------------------------------------------------------------
// Frames

export function FramesAdminScreen({ query }) {
  const { cat, bundle } = useWorking();
  const [term, setTerm] = useState(query.get('q') ?? '');
  const [open, setOpen] = useState(null);
  const [limit, setLimit] = useState(60);
  const res = cat.searchFrames(term, { limit: 0 });
  const brands = [...new Set(bundle.frames.map((f) => f.brand).filter(Boolean))].sort();

  return html`
    <${Bar} backTo="#/me/data" title="Frames" trail=${html`<button class="bar-btn" aria-label="Add a frame" onClick=${() => setOpen({ f: { sku: '', product: '', description: '', price: null, brand: '', category: '', frameType: '', material: '', size: null } })}><${Icon} name="plus" /></button>`} />
    <${Screen}>
      <div class="stack tight">
        <div class="pad"><${SearchField} value=${term} onInput=${setTerm} placeholder="Brand, model or barcode" /></div>
        <div class="pad"><${Eyebrow}>${res.total.toLocaleString('en')} frames<//></div>
        <${List}>${res.items.slice(0, limit).map((f) => html`<${Row} title=${f.description} one detail=${`${f.sku} · ${f.brand}${f.size ? ` · ${f.size} mm` : ''}`} end=${money(f.price)}
          onClick=${() => setOpen({ f: bundle.frames.find((x) => x.sku === f.sku), sku: f.sku })} />`)}<//>
        ${res.total > limit && html`<div class="pad"><${Secondary} onClick=${() => setLimit(limit + 120)}>Show more<//></div>`}
      </div>
    <//>
    ${open && html`<${FrameSheet} open=${open} brands=${brands} bundle=${bundle} onClose=${() => setOpen(null)} />`}`;
}

function FrameSheet({ open, brands, bundle, onClose }) {
  const isNew = !open.sku;
  return html`<${FormSheet} title=${isNew ? 'New frame' : 'Frame'} initial=${open.f} onClose=${onClose}
    intro=${isNew ? 'Type the product code first: category, material and eye size are read from it where they can be. Brand comes from the description.' : null}
    fields=${[
      { key: 'sku', label: 'Barcode', required: true, inputmode: 'numeric', placeholder: '8 digits', group: 'Identity' },
      { key: 'product', label: 'Product code', caps: true, group: 'Identity' },
      { key: 'description', label: 'Description', required: true, caps: true, group: 'Identity' },
      { key: 'price', label: 'Price', type: 'money', required: true, group: 'Price' },
      { key: 'brand', label: 'Brand', suggest: brands, group: 'Details' },
      { key: 'category', label: 'Category', type: 'select', options: ['', 'Ophthalmic', 'Sunglasses', 'Both'].map((v) => ({ value: v, label: v || '—' })), group: 'Details' },
      { key: 'frameType', label: 'Frame type', type: 'select', options: ['', 'Full Rim', 'Semi-Rimless', 'Rimless', 'Nylor', 'Three-Piece'].map((v) => ({ value: v, label: v || '—' })), group: 'Details' },
      { key: 'material', label: 'Material', type: 'select', options: ['', 'Acetate', 'Metal', 'Injected', 'Mixed', 'Titanium', 'TR90', 'CTX', 'Wood'].map((v) => ({ value: v, label: v || '—' })), group: 'Details' },
      { key: 'size', label: 'Eye size', type: 'number', placeholder: 'mm', group: 'Details' },
    ]}
    onSave=${(x) => {
      const sku = String(x.sku).replace(/\D/g, '');
      if (sku.length !== 8) return 'The barcode is 8 digits.';
      if (sku !== open.sku && bundle.frames.some((f) => f.sku === sku)) return `Barcode ${sku} is already another frame.`;
      const guess = framesFromCode(x.product);
      const f = {
        sku, product: x.product.toUpperCase(), description: x.description.toUpperCase(), price: x.price,
        brand: x.brand || brandFromDescription(x.description, brands),
        category: x.category || (isNew ? guess.category ?? '' : ''), frameType: x.frameType,
        material: x.material || (isNew ? guess.material ?? '' : ''), size: x.size ?? (isNew ? guess.size ?? null : null),
      };
      edit((b) => upsertFrame(b, f, open.sku)); saved(isNew ? 'Frame added to the working copy' : undefined);
    }}
    onDelete=${isNew ? null : () => { edit((b) => deleteFrame(b, open.sku)); saved('Frame removed'); }} />`;
}

// ---------------------------------------------------------------------------
// Brand tiers

export function BrandsScreen() {
  const { cat, bundle } = useWorking();
  const [open, setOpen] = useState(null);
  const counts = new Map();
  for (const f of bundle.frames) counts.set(f.brand, (counts.get(f.brand) ?? 0) + 1);
  const brands = [...counts.keys()].filter(Boolean).sort((a, b) => a.localeCompare(b));
  const tierOf = (br) => bundle.frameBrands.find((x) => brandKey(x.brand) === brandKey(br))?.tier ?? '';
  const tiers = bundle.vocabulary.filter((v) => v.kind === 'tier').sort((a, b) => (a.rank ?? 9) - (b.rank ?? 9));
  const options = [{ value: '', label: 'No tier' }, ...tiers.map((t) => ({ value: `${t.code} (${t.english} Tier)`, label: `${t.code} — ${t.english}` }))];
  return html`
    <${Bar} backTo="#/me/data" title="Brand tiers" />
    <${Screen}>
      <div class="stack tight">
        <p class="para pad">Tiers come from the brand list and matter for frame choice. A brand with no tier still sells.</p>
        <${List}>${brands.map((br) => html`<${Row} title=${br} detail=${`${counts.get(br)} frames`} end=${cat.tierFor(br)?.label ?? html`<span class="muted">No tier</span>`} onClick=${() => setOpen(br)} />`)}<//>
      </div>
    <//>
    ${open && html`<${FormSheet} title=${open} initial=${{ tier: tierOf(open) }} onClose=${() => setOpen(null)}
      fields=${[{ key: 'tier', label: 'Tier', type: 'select', options }]}
      onSave=${(x) => { edit((b) => setTier(b, open, x.tier)); saved(); }} />`}`;
}

// ---------------------------------------------------------------------------
// Stock

export function StockAdminScreen() {
  const { bundle } = useWorking();
  const [term, setTerm] = useState('');
  const [open, setOpen] = useState(null);
  const [busy, setBusy] = useState(null);
  const [report, setReport] = useState(null);
  const fileRef = useRef();
  const t = fold(term);
  const items = bundle.inventory.filter((i) => !t || fold(i.description).includes(t) || i.sku.includes(term) || i.vendorSku.includes(term));
  const units = bundle.inventory.reduce((n, i) => n + (Number(i.stock) || 0), 0);

  const pick = async (e) => {
    const f = e.currentTarget.files?.[0];
    e.currentTarget.value = '';
    if (!f) return;
    setBusy('Reading the report…'); setReport(null);
    try {
      const r = await readStockPdf(f);
      if (!r.rows.length) throw new Error('No stock rows were found. Is this the stock report (Reporte Existencias)?');
      if (r.total != null && r.total !== r.rows.length) throw new Error(`The report says ${r.total} rows but ${r.rows.length} were read. Nothing was replaced.`);
      const before = new Map(bundle.inventory.map((i) => [i.sku, i]));
      const added = r.inventory.filter((i) => !before.has(i.sku)).length;
      const gone = bundle.inventory.filter((i) => !r.inventory.some((x) => x.sku === i.sku)).length;
      const moved = r.inventory.filter((i) => before.has(i.sku) && before.get(i.sku).stock !== i.stock).length;
      setReport({ ...r, added, gone, moved, file: f.name });
    } catch (err) { setReport({ error: err.message }); } finally { setBusy(null); }
  };

  const apply = () => {
    edit((b) => replaceStock(b, report.inventory, { generated: report.generated, branch: report.branch, rows: report.rows.length, file: report.file }));
    toast(`Stock replaced: ${report.inventory.length} items`);
    setReport(null);
  };

  return html`
    <${Bar} backTo="#/me/data" title="Stock" trail=${html`<button class="bar-btn" aria-label="Add an item" onClick=${() => setOpen({ i: { sku: '', vendorSku: '', description: '', classification: '', stock: 0, expires: '', batches: 1 } })}><${Icon} name="plus" /></button>`} />
    <${Screen}>
      <div class="stack tight">
        <div class="pad gap-s">
          <${Panel}>
            <${KV} k="Items" v=${bundle.inventory.length} />
            <${KV} k="Units on hand" v=${units} />
            <${KV} k="Report" v=${bundle.stockReport?.generated ?? 'not recorded'} />
          <//>
          <input ref=${fileRef} type="file" accept=".pdf,application/pdf" style="display:none" onChange=${pick} />
          <${Secondary} icon="upload" onClick=${() => fileRef.current.click()}>Import the stock report (PDF)<//>
          <p class="note">Print the POS “Reporte Existencias” to PDF and pick it here. Batches of one barcode are added together and the earliest expiry kept.</p>
          ${busy && html`<p class="note">${busy}</p>`}
          ${report?.error && html`<${Flag}>${report.error}<//>`}
          ${report && !report.error && html`<${Panel}>
            <${KV} k="Report" v=${`${report.generated ?? '?'} · ${report.branch}`} />
            <${KV} k="Read" v=${`${report.rows.length} batches → ${report.inventory.length} items`} />
            <${KV} k="New" v=${report.added} /><${KV} k="No longer listed" v=${report.gone} /><${KV} k="Count changed" v=${report.moved} />
            <div style="margin-top:10px"><button class="btn anchor" onClick=${apply}>Replace stock in the working copy</button></div>
          <//>`}
        </div>
        <div class="pad"><${SearchField} value=${term} onInput=${setTerm} placeholder="Description or barcode" /></div>
        <${List}>${items.slice(0, 150).map((i) => html`<${Row} title=${i.description} one detail=${`${i.sku} · ${STOCK_KIND_LABEL[stockKind(i)]}`} end=${stockLabel(Number(i.stock))}
          onClick=${() => setOpen({ i, sku: i.sku })} />`)}<//>
        ${items.length > 150 && html`<p class="note pad">Showing 150 of ${items.length}. Search to narrow.</p>`}
      </div>
    <//>
    ${open && html`<${FormSheet} title=${open.sku ? 'Stock item' : 'New stock item'} initial=${open.i} onClose=${() => setOpen(null)}
      fields=${[
        { key: 'sku', label: 'Barcode', required: true, inputmode: 'numeric' },
        { key: 'vendorSku', label: 'Vendor SKU', caps: true },
        { key: 'description', label: 'Description', required: true, caps: true },
        { key: 'classification', label: 'Class' },
        { key: 'stock', label: 'On hand', type: 'number', required: true },
        { key: 'expires', label: 'Expires', type: 'date' },
      ]}
      onSave=${(x) => {
        const sku = String(x.sku).replace(/\D/g, '');
        if (sku.length !== 8) return 'The barcode is 8 digits.';
        if (sku !== open.sku && bundle.inventory.some((i) => i.sku === sku)) return `Barcode ${sku} is already listed.`;
        edit((b) => upsertStock(b, { ...open.i, ...x, sku, stock: Math.max(0, Math.round(x.stock ?? 0)) }, open.sku)); saved();
      }}
      onDelete=${open.sku ? () => { edit((b) => deleteStock(b, open.sku)); saved('Removed from stock'); } : null} />`}`;
}

// ---------------------------------------------------------------------------
// Extras and staff

export function ExtrasScreen() {
  const { bundle } = useWorking();
  const [open, setOpen] = useState(null);
  return html`
    <${Bar} backTo="#/me/data" title="Extras" trail=${html`<button class="bar-btn" aria-label="Add" onClick=${() => setOpen({ e: { id: '', description: '' } })}><${Icon} name="plus" /></button>`} />
    <${Screen}>
      <div class="stack tight">
        <p class="para pad">Add-ons offered on every order. One with a percentage, like Plus Protection, is priced as that share of the frame and spectacle lenses on the order, after discounts. The rest carry no price — the register prices them.</p>
        <${List}>${bundle.extras.map((e) => html`<${Row} title=${e.description} detail=${e.id} mono end=${e.percent ? `${e.percent}%` : null} onClick=${() => setOpen({ e, id: e.id })} />`)}<//>
      </div>
    <//>
    ${open && html`<${FormSheet} title=${open.id ? 'Extra' : 'New extra'} initial=${open.e} onClose=${() => setOpen(null)}
      fields=${[
        { key: 'id', label: 'Code', required: true, inputmode: 'numeric' },
        { key: 'description', label: 'Description', required: true },
        { key: 'percent', label: 'Percent', type: 'number', placeholder: 'No price', hint: 'Leave blank for an add-on the register prices. A number prices it as that share of the frame and spectacle lenses on the order, after discounts — 10 for Plus Protection.' },
      ]}
      onSave=${(x) => {
        if (x.id !== open.id && bundle.extras.some((e) => e.id === x.id)) return `${x.id} is already listed.`;
        if (x.percent != null && !(x.percent > 0 && x.percent <= 100)) return 'The percentage must be more than 0 and at most 100.';
        const { percent, ...rest } = x;
        edit((b) => upsertExtra(b, percent ? { ...rest, percent } : rest, open.id)); saved();
      }}
      onDelete=${open.id ? () => { edit((b) => deleteExtra(b, open.id)); saved('Removed'); } : null} />`}`;
}

export function StaffAdminScreen() {
  const { bundle } = useWorking();
  const [open, setOpen] = useState(null);
  return html`
    <${Bar} backTo="#/me/data" title="Staff" trail=${html`<button class="bar-btn" aria-label="Add" onClick=${() => setOpen({ s: { employeeNumber: '', name: '', shortName: '', role: 'seller', active: true } })}><${Icon} name="plus" /></button>`} />
    <${Screen}>
      <div class="stack tight">
        <p class="para pad">Who can be chosen as the seller on a phone. When someone leaves, switch them off rather than deleting — past orders carry their number.</p>
        <${List}>${bundle.staff.map((s) => html`<${Row} title=${s.name} detail=${`${s.employeeNumber} · ${s.role}`} off=${!s.active} sub=${s.active ? null : 'Inactive'} onClick=${() => setOpen({ s, n: s.employeeNumber })} />`)}<//>
      </div>
    <//>
    ${open && html`<${FormSheet} title=${open.n ? open.s.name : 'New person'} initial=${open.s} onClose=${() => setOpen(null)}
      fields=${[
        { key: 'employeeNumber', label: 'Employee no.', required: true, inputmode: 'numeric' },
        { key: 'name', label: 'Name', required: true },
        { key: 'shortName', label: 'Short name' },
        { key: 'role', label: 'Role', type: 'select', options: [{ value: 'seller', label: 'Seller' }, { value: 'admin', label: 'Admin' }] },
        { key: 'active', label: 'Active', type: 'toggle' },
      ]}
      onSave=${(x) => { if (x.employeeNumber !== open.n && bundle.staff.some((s) => s.employeeNumber === x.employeeNumber)) return `${x.employeeNumber} is already listed.`; edit((b) => upsertStaff(b, x, open.n)); saved(); }}
      onDelete=${open.n ? () => { edit((b) => deleteStaff(b, open.n)); saved('Removed'); } : null}
      deleteMessage="Past orders keep the number. To stop someone being chosen, switching them off is usually better." />`}`;
}

export { collapseStock, Empty };
