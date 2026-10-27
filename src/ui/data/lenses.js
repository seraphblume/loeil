// Lens prices: one row per sellable combination, exactly as the POS prices it.
// Edit a price, mark a row unavailable, add a combination, or add a whole new
// coating across many lenses in one go.

import { html, useState, useMemo } from '../html.js';
import { Bar, Screen, SearchField, List, Row, Sheet, Eyebrow, Anchor, Quiet, Confirm, Toggle, Seg, Panel, KV, Empty, Flag } from '../kit.js';
import { Icon } from '../icons.js';
import { useWorking } from './home.js';
import { edit } from '../../state/working.js';
import { toast } from '../../state/app.js';
import { go } from '../router.js';
import { LENS_FIELDS, LIST_OF, lensKey } from '../../core/validate.js';
import { setLensRow, addLensRow, deleteLensRow, fieldValues, composeRaw, lensBases, addCoating, upsertVocab } from '../../core/edits.js';
import { resolve } from '../../core/lens.js';
import { money } from '../../core/money.js';
import { fold, parseCodeLabel } from '../../core/util.js';
import { tr, trn } from '../../i18n.js';

const FIELD_LABEL = { category: 'Filter', material: 'Material', type: 'Lens type', design: 'Design', colour: 'Colour', treatment: 'Coating', product: 'Product' };
const FAMILY_TITLE = { SV: 'Single vision prices', MF: 'Multifocal prices', CL: 'Contact lens prices' };

export function LensPricesScreen({ family }) {
  const list = LIST_OF[family];
  const { cat, bundle } = useWorking();
  const [term, setTerm] = useState('');
  const [open, setOpen] = useState(null); // { index } or { index: null, seed }
  const filterField = family === 'CL' ? 'material' : 'treatment';
  const [only, setOnly] = useState('');

  const rows = cat.rows(family);
  const choices = useMemo(() => fieldValues(bundle, list, filterField), [bundle, list]);
  const shown = rows.filter((r) => {
    if (only && r[filterField].code !== only) return false;
    if (!term) return true;
    const hay = fold(Object.values(r).filter((v) => v && typeof v === 'object' && 'code' in v).flatMap((v) => [v.code, v.label, v.pos]).join(' '));
    return fold(term).split(/\s+/).filter(Boolean).every((t) => hay.includes(t));
  });

  return html`
    <${Bar} backTo="#/me/data" title=${tr(FAMILY_TITLE[family])} trail=${html`<button class="bar-btn" aria-label=${tr('Add a row')} onClick=${() => setOpen({ index: null, seed: shown[0] ? bundle.lenses[list][shown[0].index] : null })}><${Icon} name="plus" /></button>`} />
    <${Screen}>
      <div class="stack tight">
        <div class="pad"><${SearchField} value=${term} onInput=${setTerm} placeholder=${tr('Code or name: 4300 transitions crizal')} /></div>
        <div class="pad" style="display:flex;gap:6px;overflow-x:auto;scrollbar-width:none">
          <${Chip} on=${!only} onClick=${() => setOnly('')}>${tr('All')}<//>
          ${choices.map((c) => html`<${Chip} on=${only === c.code} onClick=${() => setOnly(only === c.code ? '' : c.code)}>${cat.meta(family === 'CL' ? 'contact_material' : 'treatment', c.code)?.english || c.pos}<//>`)}
        </div>
        <div class="pad"><${Eyebrow}>${shown.length === rows.length ? `${rows.length} rows` : `${shown.length} of ${rows.length} rows`}<//></div>
        ${shown.length === 0 ? html`<div class="pad"><${Empty} title=${tr('No rows match')}>${tr('Clear the search or the filter.')}<//></div>` : html`
        <${List}>${shown.map((r) => {
          const l = resolve(cat, r);
          return html`<${Row} title=${l.displayName || '—'} one detail=${[r.category?.label, l.posCode || l.attributes.map((a) => a.code).join(' ')].filter(Boolean).join(' · ')}
            sub=${r.available ? null : tr('Unavailable')} off=${!r.available} end=${money(r.price)} onClick=${() => setOpen({ index: r.index })} />`;
        })}<//>`}
      </div>
    <//>
    ${open && html`<${LensRowSheet} list=${list} index=${open.index} seed=${open.seed} onClose=${() => setOpen(null)} />`}`;
}

export function Chip({ on, onClick, children }) {
  return html`<button type="button" onClick=${onClick} style=${{
    flex: 'none', padding: '6px 12px', borderRadius: '999px', fontSize: '13px', whiteSpace: 'nowrap',
    background: on ? 'var(--fill-2)' : 'var(--fill)', color: on ? 'var(--platinum)' : 'var(--silver)',
    boxShadow: 'inset 0 0 0 1px var(--sep)',
  }}>${children}</button>`;
}

/** Pick an existing value for a column, or type a new code and its POS label. */
function CodePicker({ list, field, value, onChange, bundle }) {
  const values = fieldValues(bundle, list, field);
  const known = values.some((v) => v.raw === value);
  const [fresh, setFresh] = useState(!known && Boolean(value));
  const parsed = parseCodeLabel(value);
  const [code, setCode] = useState(known ? '' : parsed.code);
  const [label, setLabel] = useState(known ? '' : parsed.pos);
  const commit = (c, l) => { setCode(c); setLabel(l); onChange(composeRaw(bundle, list, field, c, l)); };
  return html`<div class="form-group">
    <${Eyebrow}>${tr(FIELD_LABEL[field])}<//>
    <label class="form-row"><span class="k">${tr('Value')}</span>
      <select value=${fresh ? '__new' : value}
        onChange=${(e) => { const v = e.currentTarget.value; if (v === '__new') { setFresh(true); commit('', ''); } else { setFresh(false); onChange(v); } }}>
        ${!value && !fresh && html`<option value="">${tr('Choose…')}</option>`}
        ${values.map((v) => html`<option value=${v.raw}>${v.raw}</option>`)}
        <option value="__new">${tr('New code…')}</option>
      </select>
    </label>
    ${fresh && html`
      <label class="form-row"><span class="k">${tr('Code')}</span><input autocapitalize="characters" placeholder=${tr('e.g. CZR')} value=${code} onInput=${(e) => commit(e.currentTarget.value, label)} /></label>
      <label class="form-row"><span class="k">${tr('POS label')}</span><input placeholder=${tr('as the POS prints it')} value=${label} onInput=${(e) => commit(code, e.currentTarget.value)} /></label>`}
  </div>`;
}

function LensRowSheet({ list, index, seed, onClose }) {
  const { bundle } = useWorking();
  const original = index != null ? bundle.lenses[list][index] : null;
  const fields = LENS_FIELDS[list].map(([f]) => f);
  const [row, setRow] = useState(() => ({ ...(original ?? seed ?? Object.fromEntries(fields.map((f) => [f, '']))), ...(original ? {} : { available: true }) }));
  const [priceText, setPriceText] = useState(row.price != null ? String(row.price / 100) : '');
  const [error, setError] = useState(null);
  const [confirm, setConfirm] = useState(false);

  const build = () => {
    const pesos = Number(priceText.replace(/[^\d.]/g, ''));
    const next = { ...row, price: priceText.trim() === '' ? null : Math.round(pesos * 100) };
    for (const f of fields) if (!parseCodeLabel(next[f]).code) return { problem: tr('{field} is missing.', { field: tr(FIELD_LABEL[f]) }) };
    const key = lensKey(list, next);
    const clash = bundle.lenses[list].findIndex((r, i) => i !== index && lensKey(list, r) === key);
    return { next, clash, key };
  };

  const save = (asNew) => {
    const { problem, next, clash, key } = build();
    if (problem) { setError(problem); return; }
    if (clash >= 0 && (asNew || index == null || clash !== index)) { setError(tr('{key} already exists. Edit that row instead.', { key })); return; }
    edit((b) => (index != null && !asNew ? setLensRow(b, list, index, next) : addLensRow(b, list, next)));
    toast(index != null && !asNew ? tr('Saved to the working copy') : tr('Row added to the working copy'));
    onClose();
  };

  if (confirm) return html`<${Confirm} title=${tr('Delete this row?')} message=${tr('The lens disappears from the finder once you publish. To keep it visible but unsellable, mark it unavailable instead.')}
    onConfirm=${() => { edit((b) => deleteLensRow(b, list, index)); toast(tr('Row deleted')); }} onClose=${onClose} />`;

  return html`<${Sheet} title=${original ? 'Edit lens' : 'New lens'} onClose=${onClose} full right=${html`<button class="bar-btn" style="font-weight:500" onClick=${() => save(false)}>${tr('Save')}</button>`}>
    <div class="pad form">
      ${fields.map((f) => html`<${CodePicker} key=${f} list=${list} field=${f} value=${row[f]} bundle=${bundle} onChange=${(v) => setRow((x) => ({ ...x, [f]: v }))} />`)}
      <div class="form-group">
        <${Eyebrow}>${tr('Price')}<//>
        <label class="form-row"><span class="k">${list === 'contact' ? tr('Per box') : tr('Per pair')}</span><span class="muted">$</span>
          <input inputmode="decimal" placeholder="0" value=${priceText} onInput=${(e) => setPriceText(e.currentTarget.value)} /></label>
        <div class="form-row"><span class="k">${tr('Available')}</span><${Toggle} label=${tr('Available')} on=${row.available} onChange=${(v) => setRow((x) => ({ ...x, available: v }))} /></div>
      </div>
      <p class="note">${tr('Unavailable keeps the lens visible and greyed — for something on the printed table the register refuses.')}</p>
      ${error && html`<p class="para" role="alert">${error}</p>`}
      <${Anchor} onClick=${() => save(false)}>${original ? tr('Save') : tr('Add lens')}<//>
      ${original && html`<${Quiet} onClick=${() => save(true)}>${tr('Save as a new row')}<//>`}
      ${original && html`<${Quiet} danger onClick=${() => setConfirm(true)}>${tr('Delete row')}<//>`}
    </div>
  <//>`;
}

// ---------------------------------------------------------------------------
// A new coating across many lenses.

export function AddCoatingScreen() {
  const { cat, bundle } = useWorking();
  const [family, setFamily] = useState('SV');
  const list = LIST_OF[family];
  const treatments = useMemo(() => {
    const used = fieldValues(bundle, 'single', 'treatment').concat(fieldValues(bundle, 'multifocal', 'treatment'));
    const by = new Map(used.map((v) => [v.code, v]));
    for (const v of bundle.vocabulary.filter((x) => x.kind === 'treatment')) if (!by.has(v.code)) by.set(v.code, { code: v.code, pos: v.english, raw: '' });
    return [...by.values()].filter((v) => v.code !== 'N/A');
  }, [bundle]);

  const [coating, setCoating] = useState('__new');
  const [code, setCode] = useState('');
  const [posLabel, setPosLabel] = useState('');
  const [english, setEnglish] = useState('');
  const [rank, setRank] = useState('');
  const [group, setGroup] = useState('');
  const [ref, setRef] = useState('');
  const [delta, setDelta] = useState('0');
  const [picked, setPicked] = useState(null); // Map key → price text
  const [error, setError] = useState(null);

  const newCode = coating === '__new';
  const theCode = newCode ? code.trim().toUpperCase() : coating;
  const bases = useMemo(() => lensBases(bundle, list), [bundle, list]);
  const candidates = bases.filter((b) => theCode && !b.coatings.has(theCode) && (!ref || b.coatings.has(ref)));
  const priceFor = (b) => {
    const r = ref ? b.coatings.get(ref) : null;
    const d = Math.round(Number(String(delta).replace(/[^\d.-]/g, '')) * 100) || 0;
    return r ? r.price + d : d;
  };
  const sel = picked ?? new Map(candidates.map((b) => [b.key, String(priceFor(b) / 100)]));

  const toggle = (b) => {
    const m = new Map(sel);
    if (m.has(b.key)) m.delete(b.key); else m.set(b.key, String(priceFor(b) / 100));
    setPicked(m);
  };
  const reprice = () => setPicked(new Map([...sel.keys()].map((k) => [k, String(priceFor(bases.find((b) => b.key === k)) / 100)])));

  const apply = () => {
    if (!theCode) { setError(tr('Choose a coating, or type the new code.')); return; }
    if (newCode && !posLabel.trim()) { setError(tr('Type the POS label for the new coating.')); return; }
    const entries = [...sel.entries()].map(([k, t]) => ({ base: bases.find((b) => b.key === k).base, price: Math.round(Number(t.replace(/[^\d.]/g, '')) * 100) }));
    if (!entries.length) { setError(tr('Pick at least one lens.')); return; }
    if (entries.some((e) => !e.price)) { setError(tr('Every picked lens needs a price.')); return; }
    const raw = newCode ? composeRaw(bundle, list, 'treatment', theCode, posLabel) : treatments.find((t) => t.code === theCode)?.raw || composeRaw(bundle, list, 'treatment', theCode, cat.meta('treatment', theCode)?.english ?? theCode);
    edit((b) => {
      let n = addCoating(b, list, raw, entries);
      if (!n.vocabulary.some((v) => v.kind === 'treatment' && v.code === theCode)) {
        n = upsertVocab(n, { kind: 'treatment', code: theCode, english: english.trim() || posLabel.trim(), blurb: '', rank: rank === '' ? null : Number(rank), group: group.trim().toUpperCase(), sameAs: '', highRx: false });
      }
      return n;
    });
    toast(trn(entries.length, '1 lens now offers {code}', '{n} lenses now offer {code}', { code: theCode }));
    go('#/me/data', { replace: true });
  };

  return html`
    <${Bar} backTo="#/me/data" title=${tr('Add a coating')} />
    <${Screen}>
      <div class="stack pad">
        <p class="para">${tr('For a new treatment, or an existing one reaching more lenses. Every lens you pick gets one new row at the price you set; nothing else changes.')}</p>
        <${Seg} label=${tr('Family')} value=${family} onChange=${(v) => { setFamily(v); setPicked(null); }} options=${[{ value: 'SV', label: tr('Single vision') }, { value: 'MF', label: tr('Multifocal') }]} />

        <div class="form-group">
          <${Eyebrow}>${tr('The coating')}<//>
          <label class="form-row"><span class="k">${tr('Coating')}</span>
            <select value=${coating} onChange=${(e) => { setCoating(e.currentTarget.value); setPicked(null); }}>
              <option value="__new">${tr('A new coating…')}</option>
              ${treatments.map((t) => html`<option value=${t.code}>${t.code} — ${cat.meta('treatment', t.code)?.english || t.pos}</option>`)}
            </select></label>
          ${newCode && html`
            <label class="form-row"><span class="k">${tr('Code')}</span><input autocapitalize="characters" placeholder=${tr('e.g. CZR')} value=${code} onInput=${(e) => { setCode(e.currentTarget.value); setPicked(null); }} /></label>
            <label class="form-row"><span class="k">${tr('POS label')}</span><input placeholder=${tr('as the POS prints it')} value=${posLabel} onInput=${(e) => setPosLabel(e.currentTarget.value)} /></label>
            <label class="form-row"><span class="k">${tr('English name')}</span><input placeholder=${tr('what the app shows')} value=${english} onInput=${(e) => setEnglish(e.currentTarget.value)} /></label>
            <label class="form-row"><span class="k">${tr('Ladder rank')}</span><input inputmode="decimal" placeholder=${tr('blank = not a rung')} value=${rank} onInput=${(e) => setRank(e.currentTarget.value)} /></label>
            <label class="form-row"><span class="k">${tr('Promo group')}</span><input autocapitalize="characters" placeholder=${tr('e.g. CRIZAL')} value=${group} onInput=${(e) => setGroup(e.currentTarget.value)} /></label>`}
        </div>

        <div class="form-group">
          <${Eyebrow}>${tr('Starting prices')}<//>
          <label class="form-row"><span class="k">${tr('Based on')}</span>
            <select value=${ref} onChange=${(e) => { setRef(e.currentTarget.value); setPicked(null); }}>
              <option value="">${tr('Any lens, fixed price')}</option>
              ${treatments.filter((t) => t.code !== theCode).map((t) => html`<option value=${t.code}>${tr('Lenses with {a} ({b})', { a: t.code, b: cat.meta('treatment', t.code)?.english || t.pos })}</option>`)}
            </select></label>
          <label class="form-row"><span class="k">${ref ? tr('{ref} price plus', { ref }) : tr('Price')}</span><span class="muted">$</span>
            <input inputmode="decimal" value=${delta} onInput=${(e) => setDelta(e.currentTarget.value)} onBlur=${reprice} /></label>
        </div>

        <div class="gap-s">
          <div style="display:flex;justify-content:space-between;align-items:baseline">
            <${Eyebrow}>${tr('Lenses · {a} of {b}', { a: sel.size, b: candidates.length })}<//>
            <span><button class="textbtn small" onClick=${() => setPicked(new Map(candidates.map((b) => [b.key, String(priceFor(b) / 100)])))}>${tr('All')}</button>
              <button class="textbtn small" style="margin-left:10px" onClick=${() => setPicked(new Map())}>${tr('None')}</button></span>
          </div>
          ${!theCode ? html`<p class="note">${tr('Type the code first.')}</p>` : candidates.length === 0 ? html`<p class="note">${ref ? tr('Every lens with {ref} already offers {code}.', { ref, code: theCode }) : tr('Every lens already offers {code}.', { code: theCode })}</p>` : html`
          <div style="margin:0 calc(-1 * var(--gutter))"><${List}>${candidates.map((b) => {
            const on = sel.has(b.key);
            const label = Object.entries(b.base).map(([f, raw]) => {
              const { code: c } = parseCodeLabel(raw);
              const kind = { category: 'category', material: 'material', type: 'lens_type', design: 'design', colour: 'colour' }[f];
              return f === 'category' ? null : (cat.meta(kind, c)?.english || parseCodeLabel(raw).pos);
            }).filter(Boolean).join(' · ');
            return html`<div class="row">
              <button type="button" class="icon-btn" aria-pressed=${on} aria-label=${tr('Include')} onClick=${() => toggle(b)} style=${{ color: on ? 'var(--platinum)' : 'var(--pewter)' }}><${Icon} name=${on ? 'check' : 'plus'} /></button>
              <span class="main"><span class="t" style="font-size:14px">${label}</span><span class="d">${b.key.split('|').filter((x) => x !== 'N/A').join(' · ')}</span></span>
              ${on && html`<label class="field" style="width:104px;min-height:36px;padding:0 9px"><span class="unit">$</span>
                <input inputmode="decimal" style="padding:6px 0;font-size:15px" value=${sel.get(b.key)} onInput=${(e) => { const m = new Map(sel); m.set(b.key, e.currentTarget.value); setPicked(m); }} /></label>`}
            </div>`;
          })}<//></div>`}
        </div>
        ${error && html`<${Flag}>${error}<//>`}
        <${Anchor} icon="plus" disabled=${!theCode || !sel.size} onClick=${apply}>${trn(sel.size, 'Add {code} to 1 lens', 'Add {code} to {n} lenses', { code: theCode || tr('coating') })}<//>
      </div>
    <//>`;
}

export { Panel, KV };
