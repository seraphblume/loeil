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
    toast(`${preview.changes.length} price${preview.changes.length === 1 ? '' : 's'} changed in the working copy`);
    go('#/me/data', { replace: true });
  };

  return html`
    <${Bar} backTo="#/me/data" title="Adjust prices" />
    <${Screen}>
      <div class="stack pad">
        <${Seg} label="What" value=${target} onChange=${(v) => { setTarget(v); setFilter({}); }} options=${[{ value: 'lenses', label: 'Lenses' }, { value: 'frames', label: 'Frames' }]} />

        <div class="form-group">
          <${Eyebrow}>Which ones<//>
          ${target === 'lenses' && html`<label class="form-row"><span class="k">Family</span>
            <select value=${family} onChange=${(e) => { setFamily(e.currentTarget.value); setFilter({}); }}>
              <option value="all">Spectacle lenses</option><option value="SV">Single vision</option><option value="MF">Multifocal</option><option value="CL">Contact lenses</option>
            </select></label>`}
          ${target === 'lenses' && family !== 'CL' && LENS_FILTERS.map(([f, label, kind]) => html`<label class="form-row"><span class="k">${label}</span>
            <select value=${filter[f] ?? ''} onChange=${(e) => setFilter({ ...filter, [f]: e.currentTarget.value })}>
              <option value="">Any</option>${lensOptions(f, kind).map(([code, name]) => html`<option value=${code}>${name} (${code})</option>`)}
            </select></label>`)}
          ${target === 'lenses' && family === 'CL' && html`<label class="form-row"><span class="k">Correction</span>
            <select value=${filter.material ?? ''} onChange=${(e) => setFilter({ ...filter, material: e.currentTarget.value })}>
              <option value="">Any</option>${lensOptions('material', 'contact_material').map(([code, name]) => html`<option value=${code}>${name} (${code})</option>`)}
            </select></label>`}
          ${target === 'frames' && FRAME_FILTERS.map(([f, label]) => html`<label class="form-row"><span class="k">${label}</span>
            <select value=${filter[f] ?? ''} onChange=${(e) => setFilter({ ...filter, [f]: e.currentTarget.value })}>
              <option value="">Any</option>${frameOptions(f).map((v) => html`<option value=${v}>${v}</option>`)}
            </select></label>`)}
        </div>

        <div class="gap-s">
          <${Eyebrow}>The change<//>
          <${Seg} label="Change" value=${mode} onChange=${setMode} options=${[{ value: 'add', label: '+ $' }, { value: 'sub', label: '− $' }, { value: 'percent', label: '%' }, { value: 'set', label: 'Set to' }]} />
          <label class="field"><span class="unit">${mode === 'percent' ? '%' : '$'}</span>
            <input inputmode="decimal" placeholder=${mode === 'percent' ? 'e.g. 5 or -3' : 'e.g. 200'} value=${amount} onInput=${(e) => setAmount(e.currentTarget.value)} /></label>
          ${mode === 'percent' && html`<p class="note">A minus sign lowers prices: −3 takes 3% off.</p>`}
          <${Eyebrow}>Rounding<//>
          <${Seg} label="Rounding" value=${rounding} onChange=${setRounding} options=${[{ value: 'none', label: 'Exact' }, { value: 'peso', label: 'Whole peso' }, { value: 'nine', label: 'Ends in 9' }]} />
        </div>

        ${preview && html`<section class="gap-s">
          <${Eyebrow}>Preview · ${preview.changes.length} price${preview.changes.length === 1 ? '' : 's'}<//>
          ${preview.changes.length === 0 ? html`<p class="para">Nothing matches, or nothing would change.</p>` : html`<${Panel} tight>
            ${preview.changes.slice(0, 25).map((c) => html`<div class="kv lined"><span class="k" style="font-size:12px">${c.label}</span><span class="v num" style="white-space:nowrap">${money(c.from)} → ${money(c.to)}</span></div>`)}
            ${preview.changes.length > 25 && html`<div class="kv lined"><span class="k">and ${preview.changes.length - 25} more</span></div>`}
          <//>`}
        </section>`}
        ${preview?.changes.some((c) => c.to <= 0) && html`<${Flag}>Some prices would reach zero. The gate will refuse to publish them.<//>`}
        <${Anchor} disabled=${!preview || !preview.changes.length} onClick=${apply}>Apply to the working copy<//>
      </div>
    <//>`;
}

export { KV };
