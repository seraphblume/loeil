// Reading the autorefractor ticket. Nothing is saved without a look.
//
// Two ways in: photograph the ticket (read on the phone, nothing uploaded), or
// paste its text — the phone's own Live Text / Google Lens copy is usually the
// cleanest read of thermal paper there is.

import { html, useState, useRef } from './html.js';
import { Sheet, Eyebrow, Anchor, Secondary, Panel, Flag } from './kit.js';
import { Icon } from './icons.js';
import { RxCard } from './clients.js';
import { parseTicket, ticketUsable, ticketWarnings, ticketToRx } from '../core/rxticket.js';
import { signed } from '../core/util.js';
import { TESSERACT_URL } from '../config.js';

/** Grey, contrast-stretched and upscaled: thermal paper reads far better this way. */
async function prepare(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(2, 2400 / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  let lo = 255; let hi = 0;
  for (let i = 0; i < d.length; i += 4) {
    const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    d[i] = g;
    if (g < lo) lo = g; if (g > hi) hi = g;
  }
  const span = Math.max(1, hi - lo);
  for (let i = 0; i < d.length; i += 4) {
    const v = Math.max(0, Math.min(255, ((d[i] - lo) / span) * 255));
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

async function recognise(file, onProgress) {
  const { default: Tesseract } = await import(TESSERACT_URL);
  const worker = await Tesseract.createWorker('eng', 1, {
    logger: (m) => { if (m.status === 'recognizing text') onProgress(m.progress); },
  });
  try {
    await worker.setParameters({ tessedit_pageseg_mode: '6', preserve_interword_spaces: '1' });
    const canvas = await prepare(file);
    const { data } = await worker.recognize(canvas);
    return data.text;
  } finally {
    await worker.terminate();
  }
}

export function RxScanSheet({ onClose, onAccept }) {
  const [mode, setMode] = useState('choose'); // choose | reading | paste | review
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const [text, setText] = useState('');
  const [ticket, setTicket] = useState(null);
  const file = useRef();

  const fromText = (t) => {
    const parsed = parseTicket(t);
    if (!ticketUsable(parsed)) {
      setError('No readings were found. Frame the whole ticket, flat and in good light — or paste its text.');
      setMode(mode === 'paste' ? 'paste' : 'choose');
      return;
    }
    setError(null);
    setTicket(parsed);
    setMode('review');
  };

  const onFile = async (e) => {
    const f = e.currentTarget.files?.[0];
    e.currentTarget.value = '';
    if (!f) return;
    setMode('reading'); setProgress(0); setError(null);
    try {
      const t = await recognise(f, setProgress);
      setText(t);
      fromText(t);
    } catch {
      setError('The ticket reader could not load. It needs a connection the first time — or paste the ticket text instead.');
      setMode('choose');
    }
  };

  const again = () => { setTicket(null); setText(''); setMode('choose'); };

  return html`<${Sheet} title="Scan prescription" onClose=${onClose} full right=${mode === 'review' ? html`<button class="bar-btn" onClick=${again}>Again</button>` : null}>
    <div class="pad stack tight">
      <input ref=${file} type="file" accept="image/*" capture="environment" style="display:none" onChange=${onFile} />
      ${error && html`<${Flag}>${error}<//>`}

      ${mode === 'choose' && html`
        <p class="para">Photograph the autorefractor ticket — the whole ticket, including the PD line. It is read on this phone; the photo is not kept or sent anywhere.</p>
        <${Anchor} icon="camera" onClick=${() => file.current.click()}>Photograph the ticket<//>
        <${Secondary} icon="text" onClick=${() => setMode('paste')}>Paste the ticket text<//>
        <p class="note">Paste works well with the camera’s own text recognition: point the camera at the ticket, tap the text button, Copy All, then paste here.</p>`}

      ${mode === 'reading' && html`<div class="gap-m" style="padding:24px 0">
        <${Eyebrow}>Reading the ticket<//>
        <div class="progress"><i style=${{ width: Math.round(progress * 100) + '%' }}></i></div>
        <p class="note">The first read downloads the text recogniser (about 5 MB); later reads are instant.</p>
      </div>`}

      ${mode === 'paste' && html`
        <label class="field"><textarea rows="12" class="mono" placeholder="Paste the ticket text here" value=${text} onInput=${(e) => setText(e.currentTarget.value)}></textarea></label>
        <${Anchor} disabled=${!text.trim()} onClick=${() => fromText(text)}>Read it<//>
        <${Secondary} onClick=${() => setMode('choose')}>Back<//>`}

      ${mode === 'review' && ticket && html`
        ${ticketWarnings(ticket).length > 0 && html`<div class="gap-s"><${Eyebrow}>Check these<//>${ticketWarnings(ticket).map((w) => html`<div class="silver small">${w}</div>`)}</div>`}
        <${RxCard} rx=${ticketToRx(ticket)} />
        <${Samples} title="Right eye — readings" eye=${ticket.right} />
        <${Samples} title="Left eye — readings" eye=${ticket.left} />
        <${Anchor} onClick=${() => { onAccept(ticketToRx(ticket)); onClose(); }}>Use this prescription<//>`}
    </div>
  <//>`;
}

function Samples({ title, eye }) {
  return html`<section class="gap-s">
    <${Eyebrow}>${title}<//>
    ${eye.samples.length === 0 ? html`<p class="note">None read.</p>` : html`<${Panel} tight>${eye.samples.map((s) => html`
      <div class="kv lined"><span class="silver num">${signed(s.sphere)} ${signed(s.cylinder)} × ${s.axis}°</span>
        <span class="num" style=${{ color: s.confidence != null && s.confidence < 7 ? 'var(--platinum)' : 'var(--pewter)', fontSize: '11px' }}>${s.confidence ?? '—'}</span></div>`)}<//>`}
  </section>`;
}
