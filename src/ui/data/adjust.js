// Many prices at once: every Crizal Prevencia lens up $200, every Ray-Ban frame
// up 5%. Previewed before anything changes, and applied to the working copy.

import { html, useState, useMemo } from '../html.js';
import { Bar, Screen, Seg, Eyebrow, Anchor, Panel, KV, Flag } from '../kit.js';
import { useWorking } from './home.js';
import { edit } from '../../state/working.js';
import { toast } from '../../state/app.js';
import { go } from '../router.js';
import { adjustPrices, fieldValues } from '../../core/edits.js';
import { money } from '../../core/money.js';
import { tr, trn } from '../../i18n.js';

const LENS_FILTERS = [['treatment', 'Coating', 'treatment'], ['material', 'Material', 'material'], ['category', 'Filter', 'category'], ['design', 'Design', 'design']];
const FRAME_FILTERS = [['brand', 'Brand'], ['category', 'Category'], ['material', 'Material'], ['frameType', 'Frame type']];


export function AdjustScreen() {
  const { cat, bundle } = useWorking();
  const [target, setTarget] = useState('lenses');
  const [family, setFamily] = useState('all');
  const [filter, setFilter] = useState({});
  const [mode, setMode] = useState('add');
  const [amount, setAmount] = useState('');
  const [rounding, setRounding] = useState('peso');

  const lists = family === 'all' ? ['single', 'multifocal'] : family === 'CL' ? ['contact'] : [family === 'SV' ? 'single' : 'multifocal'];
  const n = Number(String(amount).replace(mode === 'percent' ? /[^\d.-]/g : /[^\d.]/g, ''));
  const rule = { mode: mode === 'sub' ? 'add' : mode, amount: mode === 'sub' ? -n : n, rounding };
  const ready = amount !== '' && Number.isFinite(n) && (mode !== 'percent' || n !== 0);

  const preview = useMemo(() => (ready ? adjustPrices(bundle, { target, lists, filter, rule }) : null), [bundle, target, family, JSON.stringify(filter), mode, amount, rounding]);

  const lensOptions = (field, kind) => {
    const by = new Map();
    for (const l of lists) for (const v of fieldValues(bundle, l, field)) if (!by.has(v.code)) by.set(v.code, cat.meta(kind, v.code)?.english || v.pos);
    return [...by.entries()];
  };
  const frameOptions = (field) => [...new Set(bundle.frames.map((f) => f[field]).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b)));

  const apply = () => {
    edit(() => preview.bundle);
    toast(trn(preview.changes.length, '1 price changed in the working copy', '{n} prices changed in the working copy'));
    go('#/me/data', { replace: true });
  };

  return html`
    <${Bar} backTo="#/me/data" title=${tr('Adjust prices')} />
    <${Screen}>
      <div class="stack pad">
        <${Seg} label=${tr('What')} value=${target} onChange=${(v) => { setTarget(v); setFilter({}); }} options=${[{ value: 'lenses', label: tr('Lenses') }, { value: 'frames', label: tr('Frames') }]} />

        <div class="form-group">
          <${Eyebrow}>${tr('Which ones')}<//>
          ${target === 'lenses' && html`<label class="form-row"><span class="k">${tr('Family')}</span>
            <select value=${family} onChange=${(e) => { setFamily(e.currentTarget.value); setFilter({}); }}>
              <option value="all">${tr('Spectacle lenses')}</option><option value="SV">${tr('Single vision')}</option><option value="MF">${tr('Multifocal')}</option><option value="CL">${tr('Contact lenses')}</option>
            </select></label>`}
          ${target === 'lenses' && family !== 'CL' && LENS_FILTERS.map(([f, label, kind]) => html`<label class="form-row"><span class="k">${tr(label)}</span>
            <select value=${filter[f] ?? ''} onChange=${(e) => setFilter({ ...filter, [f]: e.currentTarget.value })}>
              <option value="">${tr('Any')}</option>${lensOptions(f, kind).map(([code, name]) => html`<option value=${code}>${name} (${code})</option>`)}
            </select></label>`)}
          ${target === 'lenses' && family === 'CL' && html`<label class="form-row"><span class="k">${tr('Correction')}</span>
            <select value=${filter.material ?? ''} onChange=${(e) => setFilter({ ...filter, material: e.currentTarget.value })}>
              <option value="">${tr('Any')}</option>${lensOptions('material', 'contact_material').map(([code, name]) => html`<option value=${code}>${name} (${code})</option>`)}
            </select></label>`}
          ${target === 'frames' && FRAME_FILTERS.map(([f, label]) => html`<label class="form-row"><span class="k">${tr(label)}</span>
            <select value=${filter[f] ?? ''} onChange=${(e) => setFilter({ ...filter, [f]: e.currentTarget.value })}>
              <option value="">${tr('Any')}</option>${frameOptions(f).map((v) => html`<option value=${v}>${v}</option>`)}
            </select></label>`)}
        </div>

        <div class="gap-s">
          <${Eyebrow}>${tr('The change')}<//>
          <${Seg} label=${tr('Change')} value=${mode} onChange=${setMode} options=${[{ value: 'add', label: '+ $' }, { value: 'sub', label: '− $' }, { value: 'percent', label: '%' }, { value: 'set', label: tr('Set to') }]} />
          <label class="field"><span class="unit">${mode === 'percent' ? '%' : '$'}</span>
            <input inputmode="decimal" placeholder=${mode === 'percent' ? 'e.g. 5 or -3' : 'e.g. 200'} value=${amount} onInput=${(e) => setAmount(e.currentTarget.value)} /></label>
          ${mode === 'percent' && html`<p class="note">${tr('A minus sign lowers prices: −3 takes 3% off.')}</p>`}
          <${Eyebrow}>${tr('Rounding')}<//>
          <${Seg} label=${tr('Rounding')} value=${rounding} onChange=${setRounding} options=${[{ value: 'none', label: tr('Exact') }, { value: 'peso', label: tr('Whole peso') }, { value: 'nine', label: tr('Ends in 9') }]} />
        </div>

        ${preview && html`<section class="gap-s">
          <${Eyebrow}>${trn(preview.changes.length, 'Preview · 1 price', 'Preview · {n} prices')}<//>
          ${preview.changes.length === 0 ? html`<p class="para">${tr('Nothing matches, or nothing would change.')}</p>` : html`<${Panel} tight>
            ${preview.changes.slice(0, 25).map((c) => html`<div class="kv lined"><span class="k" style="font-size:12px">${c.label}</span><span class="v num" style="white-space:nowrap">${money(c.from)} → ${money(c.to)}</span></div>`)}
            ${preview.changes.length > 25 && html`<div class="kv lined"><span class="k">${tr('and {a} more', { a: preview.changes.length - 25 })}</span></div>`}
          <//>`}
        </section>`}
        ${preview?.changes.some((c) => c.to <= 0) && html`<${Flag}>${tr('Some prices would reach zero. The gate will refuse to publish them.')}<//>`}
        <${Anchor} disabled=${!preview || !preview.changes.length} onClick=${apply}>${tr('Apply to the working copy')}<//>
      </div>
    <//>`;
}

export { KV };
