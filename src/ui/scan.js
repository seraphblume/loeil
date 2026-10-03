// Scan: identity comes from the barcode only, looked up in the catalogue and
// the stock list. A lookup cannot transpose a field; a miss is reported as a
// miss, never patched over with a partial record.

import { html, useState } from './html.js';
import { useApp } from './hooks.js';
import { Bar, Screen, Eyebrow, Empty, Anchor, Row, List, SearchField } from './kit.js';
import { BarcodeCamera } from './camera.js';
import { go } from './router.js';
import { stockLabel } from '../core/catalogue.js';

export function ScanScreen() {
  const catalogue = useApp((s) => s.catalogue);
  const [missed, setMissed] = useState(null);
  const [typed, setTyped] = useState('');

  const open = (raw) => {
    const hit = catalogue.lookup(raw);
    if (hit.kind === 'frame') { go('#/find/frame/' + hit.sku, { replace: true }); return true; }
    if (hit.kind === 'stock' || hit.kind === 'stockFrame') { go('#/find/stock/' + hit.sku, { replace: true }); return true; }
    return false;
  };

  const onCodes = (values) => {
    for (const v of values) if (open(v)) { navigator.vibrate?.(30); return true; }
    setMissed(catalogue.normaliseBarcode(values[0]));
    return false;
  };

  const digits = typed.replace(/\D/g, '');
  const matches = digits.length >= 4
    ? [...catalogue.frames.filter((f) => f.sku.includes(digits)).slice(0, 6).map((f) => ({ sku: f.sku, title: f.description, detail: f.sku + ' · frame', to: '#/find/frame/' + f.sku })),
       ...catalogue.inventory.filter((i) => !i.inCatalogue && i.sku.includes(digits)).slice(0, 6).map((i) => ({ sku: i.sku, title: i.description, detail: `${i.sku} · ${stockLabel(i.stock)}`, to: '#/find/stock/' + i.sku }))]
    : [];

  return html`
    <${Bar} backTo="#/find" title="Scan barcode" />
    <${Screen}>
      <div class="stack">
        <div class="pad"><${BarcodeCamera} onCodes=${onCodes} hint="Hold the barcode inside the frame" /></div>
        ${missed && html`<div class="pad gap-s">
          <${Eyebrow}>Barcode ${missed}<//>
          <${Empty} title="Not in the catalogue or stock">Nothing carries this barcode. The stock list is a snapshot and the shelf moves, so this may simply be newer than the last publish. Keep scanning, or look it up by hand.<//>
        </div>`}
        <section class="gap-s">
          <div class="pad"><${Eyebrow}>Type it instead<//></div>
          <div class="pad"><${SearchField} value=${typed} onInput=${setTyped} placeholder="Eight barcode digits" icon="barcode" /></div>
          ${digits.length === 8 && !matches.length && html`<p class="para pad">No frame or stock item has barcode ${digits}.</p>`}
          ${matches.length > 0 && html`<${List}>${matches.map((m) => html`<${Row} to=${m.to} title=${m.title} detail=${m.detail} one mono />`)}<//>`}
        </section>
      </div>
    <//>`;
}
