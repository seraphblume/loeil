// Choosing the frame for a quote: one in the catalogue, just a brand, or a
// set. A brand in a set is quoted at the set's price; a brand outside one
// (Versace, Carolina Herrera) from its lowest catalogue price.

import { html, useState, useMemo } from './html.js';
import { useApp, useDebounced } from './hooks.js';
import { Sheet, Seg, SearchField, Row } from './kit.js';
import { money } from '../core/money.js';
import { brandOptions, brandFrame, setFrame } from '../core/quote.js';
import { frameLine } from '../core/orders.js';
import { liveSets } from '../core/sets.js';
import { fold, brandKey } from '../core/util.js';
import { stockLabel } from '../core/catalogue.js';

const MODES = [{ value: 'frame', label: 'Frame' }, { value: 'brand', label: 'Brand' }, { value: 'set', label: 'Set' }];

/**
 * The picker itself, for a sheet or a step of one. `onPick(line)` receives a
 * ready frame line. `only` limits the brands (a preset's renowned brands).
 */
export function FramePicker({ onPick, start = 'brand', only = null, modes = MODES }) {
  const catalogue = useApp((s) => s.catalogue);
  const [mode, setMode] = useState(only ? 'brand' : start);
  const [term, setTerm] = useState('');
  const t = useDebounced(term, 90);
  const brands = useMemo(() => {
    const all = brandOptions(catalogue);
    if (!only) return all;
    const keys = only.map(brandKey);
    return all.filter((b) => keys.includes(b.key)).sort((a, b) => keys.indexOf(a.key) - keys.indexOf(b.key));
  }, [catalogue, only]);
  const frames = useMemo(() => (mode === 'frame' && t.trim() ? catalogue.searchFrames(t, { limit: 40 }).items : []), [catalogue, t, mode]);
  const sets = useMemo(() => liveSets(catalogue), [catalogue]);
  const f = fold(t).trim();

  return html`<div class="stack tight">
    ${!only && html`<div class="pad"><${Seg} label="Quote the frame by" value=${mode} onChange=${(m) => { setMode(m); setTerm(''); }} options=${modes} /></div>`}
    ${mode !== 'set' && html`<div class="pad"><${SearchField} value=${term} onInput=${setTerm} placeholder=${mode === 'frame' ? 'Brand, model or barcode' : 'Brand'} /></div>`}
    ${mode === 'frame' && html`<div class="list">
      ${!t.trim() ? html`<div class="row"><span class="main"><span class="d">Search the catalogue by brand, model or the barcode on the tag.</span></span></div>`
        : frames.length === 0 ? html`<div class="row"><span class="main"><span class="d">No frame matches.</span></span></div>`
          : frames.map((fr) => html`<${Row} key=${fr.sku} title=${fr.description} detail=${`${fr.sku} · ${stockLabel(fr.stock).toLowerCase()}`} one
              end=${money(fr.price)} onClick=${() => onPick(frameLine(fr, fr.price, 'catalogue'))} />`)}
    </div>`}
    ${mode === 'brand' && html`<div class="list">
      ${brands.filter((b) => !f || fold(b.brand).includes(f)).map((b) => html`<${Row} key=${b.key} title=${b.brand}
        detail=${b.set ? `${b.set.name} · ID Maestro ${b.set.id}` : `From ${money(b.from)} · not in a set`}
        sub=${[b.tier && `${b.tier} tier`, b.count ? `${b.count} in the catalogue` : null, b.stock ? `${b.stock} on hand` : null].filter(Boolean).join(' · ') || null}
        end=${money(b.set ? b.set.price : b.from)} onClick=${() => onPick(brandFrame(b))} />`)}
    </div>`}
    ${mode === 'set' && html`<div class="list">
      ${sets.map((s) => html`<${Row} key=${s.id} title=${s.name} detail=${`ID Maestro ${s.id}`} sub=${s.brands}
        end=${money(s.price)} onClick=${() => onPick(setFrame(s))} />`)}
    </div>`}
    <p class="note pad">${mode === 'set' ? 'Any frame of the set, at the set’s price with single vision lenses; the frame is scanned at the sale.'
      : mode === 'brand' ? 'A brand in a set is quoted at the set’s price. Outside a set, from its lowest catalogue price — the frame is chosen and scanned at the sale.'
        : 'The exact frame, at its catalogue price — or its set’s, when its brand is in one.'}</p>
  </div>`;
}

export function FramePickSheet({ onClose, onPick, start, only, title = 'Frame' }) {
  return html`<${Sheet} title=${title} onClose=${onClose} full>
    <${FramePicker} start=${start} only=${only} onPick=${(line) => { onPick(line); onClose(); }} />
  <//>`;
}
