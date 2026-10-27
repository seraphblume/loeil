// Promotions rotate roughly every three weeks. Each one has its number, its
// conditions (shown to the seller as text, never turned into rules) and, for
// lens packages, the lines that say which lenses it covers.

import { html, useState } from '../html.js';
import { Bar, Screen, SearchField, List, Row, Eyebrow, Panel, KV, Secondary, Anchor, Quiet, Confirm, Sheet, Empty, fmtDate } from '../kit.js';
import { Icon } from '../icons.js';
import { FormSheet } from './form.js';
import { useWorking } from './home.js';
import { edit } from '../../state/working.js';
import { toast } from '../../state/app.js';
import { go } from '../router.js';
import { upsertPromo, deletePromo, setPromoDates, setLine, deleteLine } from '../../core/edits.js';
import { isLive, parseKey, ANY } from '../../core/promotions.js';
import { fold, parseCodeLabel } from '../../core/util.js';
import { tr, trn } from '../../i18n.js';

const KINDS = ['package_tier', 'set', 'percent', 'fixed_price', 'bundle', 'service', 'partner', 'gift'];
const status = (p) => {
  const today = new Date().toISOString().slice(0, 10);
  if (p.validTo && p.validTo < today) return 'Ended';
  if (p.validFrom && p.validFrom > today) return 'Upcoming';
  return 'Live';
};

const promoFields = [
  { key: 'id', label: 'Promo number', required: true, inputmode: 'numeric' },
  { key: 'name', label: 'Name', required: true },
  { key: 'kind', label: 'Kind', type: 'select', options: KINDS.map((k) => ({ value: k, label: k.replace('_', ' ') })) },
  { key: 'category', label: 'Applies to', suggest: ['Ophthalmic frame', 'Sun frame', 'Contact lens', 'Lenses', 'Solutions', 'Service', 'Partner', 'Brand gift'] },
  { key: 'validFrom', label: 'From', type: 'date' },
  { key: 'validTo', label: 'To', type: 'date' },
  { key: 'description', label: 'Description', type: 'textarea' },
  { key: 'conditions', label: 'Conditions', type: 'textarea', hint: 'Shown to the seller as written. Separate several with semicolons: package: PLUS; brand_in: Ray Ban. A package name here groups its tiers. A gift (kind gift) reads its brand_in to show beside those brands’ frames, and gift: 61004340/61004341 names the items to hand over.' },
  { key: 'notes', label: 'Notes', type: 'textarea', hint: 'A figure like “From $999” becomes the package’s entry price.' },
];

export function PromosScreen() {
  const { bundle } = useWorking();
  const [term, setTerm] = useState('');
  const [adding, setAdding] = useState(false);
  const [dating, setDating] = useState(false);
  const t = fold(term);
  const list = bundle.promotions.filter((p) => !t || fold(`${p.id} ${p.name} ${p.conditions} ${p.category}`).includes(t));
  const lines = (id) => bundle.promoLensMap.filter((l) => l.promoId === id).length;
  return html`
    <${Bar} backTo="#/me/data" title=${tr('Promotions')} trail=${html`<button class="bar-btn" aria-label=${tr('Add')} onClick=${() => setAdding(true)}><${Icon} name="plus" /></button>`} />
    <${Screen}>
      <div class="stack tight">
        <div class="pad gap-s">
          <${Secondary} icon="clock" onClick=${() => setDating(true)}>${tr('New campaign dates')}<//>
          <p class="note">${tr('For a rotation that keeps its promo numbers: set the new dates on several promotions at once.')}</p>
        </div>
        <div class="pad"><${SearchField} value=${term} onInput=${setTerm} placeholder=${tr('Number, name or condition')} /></div>
        <${List}>${list.map((p) => html`<${Row} to=${'#/me/data/promos/' + encodeURIComponent(p.id)} title=${p.name} detail=${`${p.id} · ${fmtDate(p.validFrom)} – ${fmtDate(p.validTo)}`}
          sub=${lines(p.id) ? tr('{n} lens lines', { n: lines(p.id) }) : null} end=${tr(status(p))} off=${status(p) === 'Ended'} chev />`)}<//>
        ${!list.length && html`<div class="pad"><${Empty} title=${tr('No promotions')}>${tr('Add one with +.')}<//></div>`}
      </div>
    <//>
    ${adding && html`<${FormSheet} title=${tr('New promotion')} initial=${{ kind: 'package_tier' }} fields=${promoFields} onClose=${() => setAdding(false)}
      onSave=${(x) => { if (bundle.promotions.some((p) => p.id === x.id)) return tr('Promo {id} already exists.', { id: x.id }); edit((b) => upsertPromo(b, x)); toast(tr('Promotion added')); }} />`}
    ${dating && html`<${DatesSheet} promos=${bundle.promotions} onClose=${() => setDating(false)} />`}`;
}

function DatesSheet({ promos, onClose }) {
  const latestTo = promos.map((p) => p.validTo).filter(Boolean).sort().pop() ?? '';
  const [picked, setPicked] = useState(() => new Set(promos.filter((p) => p.validTo === latestTo).map((p) => p.id)));
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const flip = (id) => { const s = new Set(picked); if (s.has(id)) s.delete(id); else s.add(id); setPicked(s); };
  const apply = () => {
    edit((b) => setPromoDates(b, [...picked], from, to));
    toast(trn(picked.size, '1 promotion moved to the new dates', '{n} promotions moved to the new dates'));
    onClose();
  };
  return html`<${Sheet} title=${tr('New campaign dates')} onClose=${onClose} full>
    <div class="pad stack tight">
      <div class="form-group">
        <label class="form-row"><span class="k">${tr('From')}</span><input type="date" value=${from} onInput=${(e) => setFrom(e.currentTarget.value)} /></label>
        <label class="form-row"><span class="k">${tr('To')}</span><input type="date" value=${to} onInput=${(e) => setTo(e.currentTarget.value)} /></label>
      </div>
      <div style="display:flex;justify-content:space-between"><${Eyebrow}>${tr('{a} chosen', { a: picked.size })}<//>
        <span><button class="textbtn small" onClick=${() => setPicked(new Set(promos.map((p) => p.id)))}>${tr('All')}</button><button class="textbtn small" style="margin-left:10px" onClick=${() => setPicked(new Set())}>${tr('None')}</button></span></div>
      <div style="margin:0 calc(-1 * var(--gutter))"><${List}>${promos.map((p) => html`<${Row} title=${p.name} detail=${`${p.id} · now ${fmtDate(p.validFrom)} – ${fmtDate(p.validTo)}`}
        end=${html`<span style=${{ color: picked.has(p.id) ? 'var(--platinum)' : 'var(--pewter)' }}><${Icon} name=${picked.has(p.id) ? 'check' : 'plus'} /></span>`} onClick=${() => flip(p.id)} />`)}<//></div>
      <${Anchor} disabled=${!from || !to || to < from || !picked.size} onClick=${apply}>${tr('Set dates on {a}', { a: picked.size })}<//>
    </div>
  <//>`;
}

export function PromoScreen({ id }) {
  const { cat, bundle } = useWorking();
  const p = bundle.promotions.find((x) => x.id === id);
  const [editing, setEditing] = useState(false);
  const [line, setLineOpen] = useState(null);
  const [confirm, setConfirm] = useState(false);
  if (!p) return html`<${Bar} backTo="#/me/data/promos" title=${tr('Promotion')} /><${Screen}><div class="pad"><${Empty} title=${tr('Not found')}>${tr('It may have been renamed or removed.')}<//></div><//>`;
  const lines = bundle.promoLensMap.map((l, i) => ({ l, i })).filter(({ l }) => l.promoId === p.id);
  const pkg = p.conditions.match(/package:\s*([^;]+)/)?.[1]?.trim() ?? '';
  return html`
    <${Bar} backTo="#/me/data/promos" title=${p.id} trail=${html`<button class="bar-btn" onClick=${() => setEditing(true)}>${tr('Edit')}</button>`} />
    <${Screen}>
      <div class="stack pad">
        <div class="screen-title"><div class="eyebrow">${status(p)} · ${p.kind.replace('_', ' ')}</div><h1>${p.name}</h1></div>
        <${Panel}>
          <${KV} k=${tr('Promo number')} v=${p.id} mono />
          <${KV} k=${tr('Dates')} v=${`${fmtDate(p.validFrom)} – ${fmtDate(p.validTo)}`} />
          ${p.category && html`<${KV} k=${tr('Applies to')} v=${p.category} />`}
          ${p.description && html`<${KV} k=${tr('Description')} v=${p.description} />`}
          ${p.conditions && html`<${KV} k=${tr('Conditions')} v=${p.conditions} />`}
          ${p.notes && html`<${KV} k=${tr('Notes')} v=${p.notes} />`}
        <//>
        <section class="gap-s" style="margin:0 calc(-1 * var(--gutter))">
          <div class="pad" style="display:flex;justify-content:space-between;align-items:baseline"><${Eyebrow}>${tr('Lens lines · {a}', { a: lines.length })}<//>
            <button class="textbtn small" onClick=${() => setLineOpen({ i: null, l: { promoId: p.id, package: pkg, matchKey: 'SV|POLY|ND|BLANCO|ARA', lensDescription: '' } })}>${tr('Add line')}</button></div>
          ${lines.length === 0 ? html`<p class="note pad">${tr('No lens lines. Only lens packages need them: a line says which lenses the promotion covers.')}</p>` : html`
          <${List}>${lines.map(({ l, i }) => html`<${Row} title=${describeKey(cat, l.matchKey)} detail=${l.lensDescription || l.matchKey} mono onClick=${() => setLineOpen({ i, l })} />`)}<//>`}
        </section>
        <${Quiet} danger onClick=${() => setConfirm(true)}>${tr('Delete promotion')}<//>
      </div>
    <//>
    ${editing && html`<${FormSheet} title=${tr('Promotion')} initial=${p} fields=${promoFields} onClose=${() => setEditing(false)}
      onSave=${(x) => {
        if (x.id !== p.id && bundle.promotions.some((y) => y.id === x.id)) return tr('Promo {id} already exists.', { id: x.id });
        edit((b) => upsertPromo(b, x, p.id)); toast(tr('Saved to the working copy'));
        if (x.id !== p.id) go('#/me/data/promos/' + encodeURIComponent(x.id), { replace: true });
      }} />`}
    ${line && html`<${LineSheet} open=${line} onClose=${() => setLineOpen(null)} />`}
    ${confirm && html`<${Confirm} title=${tr('Delete this promotion?')} message=${`Promo ${p.id} and its ${lines.length} lens lines are removed from the working copy.`}
      onConfirm=${() => { edit((b) => deletePromo(b, p.id)); toast(tr('Promotion removed')); go('#/me/data/promos', { replace: true }); }} onClose=${() => setConfirm(false)} />`}`;
}

/** `SV|POLY|ND|TRANS|*CRIZAL` in words. */
function describeKey(cat, key) {
  const k = parseKey(key);
  const name = (kind, code) => (code === ANY ? 'any' : code.startsWith('*') ? `any ${code.slice(1)}` : cat.meta(kind, code)?.english || code);
  const fam = tr({ SV: 'Single vision', PR: 'Progressive', FT: 'Flat top' }[k.family] ?? k.family);
  return [fam, k.materialFamily === ANY ? tr('any material') : k.materialFamily, name('design', k.design), k.colourFamily === ANY ? tr('any filter') : k.colourFamily, name('treatment', k.coating)].join(' · ');
}

function LineSheet({ open, onClose }) {
  const { bundle } = useWorking();
  const k = parseKey(open.l.matchKey);
  const groups = (kind) => [...new Set(bundle.vocabulary.filter((v) => v.kind === kind && v.group).map((v) => v.group))];
  const codes = (field, lists = ['single', 'multifocal']) => [...new Set(lists.flatMap((l) => bundle.lenses[l].map((r) => parseCodeLabel(r[field]).code)))].filter((c) => c && c !== 'N/A');
  const opt = (values, extra = []) => [...extra, ...values].map((v) => ({ value: v, label: v }));
  const [confirm, setConfirm] = useState(false);
  const fields = [
    { key: 'package', label: 'Package', caps: true },
    { key: 'family', label: 'Lens', type: 'select', options: [{ value: 'SV', label: 'Single vision' }, { value: 'PR', label: 'Progressive' }, { value: 'FT', label: 'Flat top' }] },
    { key: 'materialFamily', label: 'Material', type: 'select', options: opt(groups('material'), [ANY]) },
    { key: 'design', label: 'Design', type: 'select', options: opt([...codes('design'), 'N/A'], [ANY]) },
    { key: 'colourFamily', label: 'Filter', type: 'select', options: opt(groups('category'), [ANY]) },
    { key: 'coating', label: 'Coating', type: 'select', options: opt(codes('treatment'), [ANY, ...groups('treatment').map((g) => '*' + g)]) },
    { key: 'lensDescription', label: 'As printed', type: 'textarea', hint: 'The line as the promotion sheet prints it, so the number can be checked against paper.' },
  ];
  if (confirm) return html`<${Confirm} title=${tr('Remove this line?')} message=${tr('The promotion stops covering these lenses once you publish.')} onConfirm=${() => { edit((b) => deleteLine(b, open.i)); toast(tr('Line removed')); }} onClose=${onClose} />`;
  return html`<${FormSheet} title=${open.i == null ? tr('New lens line') : tr('Lens line')} initial=${{ ...k, package: open.l.package, lensDescription: open.l.lensDescription }} fields=${fields} onClose=${onClose}
    intro=${tr('Choose what the promotion’s lens line covers. Any matches everything; a group such as *CRIZAL matches every coating in that group.')}
    onSave=${(x) => {
      const line = { promoId: open.l.promoId, package: x.package.toUpperCase(), matchKey: [x.family, x.materialFamily, x.design, x.colourFamily, x.coating].join('|'), lensDescription: x.lensDescription };
      edit((b) => setLine(b, open.i, line)); toast(tr('Saved to the working copy'));
    }}
    onDelete=${open.i == null ? null : () => { edit((b) => deleteLine(b, open.i)); toast(tr('Line removed')); }} />`;
}

export { isLive };
