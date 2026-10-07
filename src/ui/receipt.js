// Checkout: the order prints as a receipt. The paper feeds out of the printer,
// then everything the register asks for is laid out below it to copy one
// value at a time — and the receipt itself goes out as a picture.
//
// Two copies of one order: the register copy (codes, set numbers, extras,
// prescription) and the customer's quote (names and prices).

import { html, useState, useMemo, useRef, useLayoutEffect, useEffect } from './html.js';
import { useApp, useResolvedDraft } from './hooks.js';
import { Bar, Screen, Seg, Eyebrow, Empty, Anchor, Secondary, Dock, useCopy } from './kit.js';
import { Icon } from './icons.js';
import { go } from './router.js';
import { money } from '../core/money.js';
import { buildReceipt, receiptText } from '../core/receipt.js';
import { code128Bars } from '../core/code128.js';
import { receiptBlocks } from './receipt-layout.js';
import { receiptImage, shareReceiptImage } from './receipt-image.js';
import { soundOn, setSoundOn, playPrinter, playTear, buzz } from './printsound.js';
import { clientById, staffMember, toast } from '../state/app.js';

const STEPS = 22;
const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** The feed: a short push, a short rest, again — as a thermal head steps the paper. */
function feedFrames(steps) {
  const frames = [];
  for (let i = 0; i < steps; i++) {
    const from = -100 + (100 * i) / steps;
    const to = -100 + (100 * (i + 1)) / steps;
    frames.push({ offset: i / steps, transform: `translateY(${from}%)` });
    frames.push({ offset: (i + 0.68) / steps, transform: `translateY(${to}%)` });
  }
  frames.push({ offset: 1, transform: 'translateY(0%)' });
  return frames;
}

// ---------------------------------------------------------------------------
// The paper

function Barcode({ value, caption }) {
  const { bars, width } = code128Bars(value);
  return html`<div class="rc-barcode">
    <svg viewBox=${`0 0 ${width} 40`} preserveAspectRatio="none" aria-label=${`Barcode ${value}`}>
      ${bars.map((b) => html`<rect x=${b.x} y="0" width=${b.w} height="40" />`)}
    </svg>
    <div class="rc-caption">${caption}</div>
  </div>`;
}

function Block({ b }) {
  switch (b.t) {
    case 'brand': return html`<div class="rc-brand"><div class="rc-title">${b.title}</div><div class="rc-copy">${b.copy}</div></div>`;
    case 'field': return html`<div class="rc-field"><span class="k">${b.k}:</span> <span class=${'v' + (b.strong ? ' strong' : '')}>${b.v}</span></div>`;
    case 'text': return html`<div class="rc-text">${b.text}</div>`;
    case 'gap': return html`<div class="rc-gap"></div>`;
    case 'rule': return html`<div class="rc-rule"></div>`;
    case 'items': return html`<div class="rc-items">
      <div class="rc-irow head">${b.head.map((h) => html`<span>${h}</span>`)}</div>
      ${b.rows.map((r) => html`<div class="rc-item">
        <div class="rc-irow"><span class="code">${r.code}</span><span>${r.qty}</span>${r.cells.map((c) => html`<span>${c}</span>`)}</div>
        <div class="desc">${r.desc}</div>
        ${r.note && html`<div class="note">${r.note}</div>`}
      </div>`)}
    </div>`;
    case 'amount': return html`<div class="rc-amount"><span>${b.k}:</span><b>${b.v}</b></div>`;
    case 'words': return html`<div class="rc-words">${b.text}</div>`;
    case 'rx': return html`<table class="rc-rx">
      <thead><tr><th></th>${b.cols.map((c) => html`<th>${c}</th>`)}</tr></thead>
      <tbody>${b.rows.map((r) => html`<tr><th>${r[0]}</th>${r.slice(1).map((v) => html`<td>${v}</td>`)}</tr>`)}</tbody>
    </table>`;
    case 'foot': return html`<div class="rc-foot">${b.text}</div>`;
    case 'barcode': return html`<${Barcode} value=${b.value} caption=${b.caption} />`;
    case 'thanks': return html`<div class="rc-thanks">${b.text}</div>`;
    case 'fine': return html`<div class=${'rc-fine' + (b.left ? ' left' : '')}>${b.text}</div>`;
    default: return null;
  }
}

function Paper({ blocks, paperRef, soundToggle }) {
  return html`<div class="paper-well">
    <div class="paper" ref=${paperRef}>
      ${blocks.map((b) => html`<${Block} b=${b} />`)}
      ${soundToggle}
    </div>
  </div>`;
}

// ---------------------------------------------------------------------------
// What the register asks for, one tap per value

function CopyList({ r }) {
  const [copied, copy] = useCopy();
  const take = (value, key) => { copy(value, key); buzz(8); };
  const Item = ({ i, k }) => (i.copy
    ? html`<button type="button" class=${'cl-item' + (copied === k ? ' done' : '')} onClick=${() => take(i.copy, k)}>
        <span class="main"><span class="code">${i.copy}${i.qty ? html`<span class="qty">×${i.qty}</span>` : null}</span><span class="txt">${i.text}</span></span>
        <span class="ic"><${Icon} name=${copied === k ? 'check' : 'copy'} /></span>
      </button>`
    : html`<div class="cl-item static"><span class="main"><span class="txt">${i.text}</span></span></div>`);
  return html`<section class="copylist">
    <div class="cl-intro"><${Eyebrow}>For the register<//><span class="tiny muted">Tap a value to copy it</span></div>
    ${r.groups.map((g) => html`<div class="cl-group">
      <div class="cl-head"><span class="n">${g.n}</span>${g.title}</div>
      ${g.items.length ? g.items.map((i, x) => html`<${Item} i=${i} k=${`${g.n}-${x}`} />`) : html`<div class="cl-none">Nothing on this order</div>`}
    </div>`)}
    <div class="cl-group">
      <div class="cl-head"><span class="n">5</span>Prescription</div>
      ${r.rx ? html`<div class="cl-rx" style=${{ "--cols": r.rx.cols.length }}>
        <span></span>${r.rx.cols.map(([, label]) => html`<span class="h">${label}</span>`)}
        ${['od', 'os'].filter((e) => r.rx[e]).map((e) => html`
          <span class="eye">${e.toUpperCase()}</span>
          ${r.rx.cols.map(([k]) => {
            const v = r.rx[e][k];
            const key = `rx-${e}-${k}`;
            return v ? html`<button type="button" class=${'cell' + (copied === key ? ' done' : '')} onClick=${() => take(v, key)}>${copied === key ? html`<${Icon} name="check" size=${13} />` : v}</button>` : html`<span class="cell empty">—</span>`;
          })}`)}
      </div>
      ${r.rx.split && html`<p class="note">PD per eye is half the binocular ${r.rx.binocular} mm — no monocular PD was measured.</p>`}
      ${r.rx.prisms.length > 0 && html`<p class="note">Prism ${r.rx.prisms.join(' · ')}</p>`}
      ${r.aobMissing && html`<p class="note">The AOB is not on the order yet — add it from the order’s Prescription row.</p>`}` : html`<div class="cl-none">No prescription on file. Choose the client on the order, or add their Rx.</div>`}
    </div>
  </section>`;
}

// ---------------------------------------------------------------------------
// The stage: status, printer, paper

function ReceiptStage({ order, client, rx }) {
  const catalogue = useApp((s) => s.catalogue);
  const [kind, setKind] = useState('register');
  const [run, setRun] = useState(0);
  const [phase, setPhase] = useState('printing');
  const [sound, setSound] = useState(soundOn);
  const [sharing, setSharing] = useState(false);
  const paperRef = useRef();
  const r = useMemo(() => buildReceipt({ order, catalogue, kind, client, rx }), [order, catalogue, kind, client, rx]);
  const blocks = useMemo(() => receiptBlocks(r), [r]);

  useLayoutEffect(() => {
    const el = paperRef.current;
    if (!el) return undefined;
    if (reduced() || !el.animate) { setPhase('done'); return undefined; }
    setPhase('printing');
    const duration = Math.max(1300, Math.min(2900, el.offsetHeight * 2.1));
    const anim = el.animate(feedFrames(STEPS), { duration, easing: 'linear', fill: 'backwards' });
    const stop = soundOn() ? playPrinter(duration, STEPS) : null;
    buzz(Array.from({ length: 8 }, (_, i) => (i % 2 ? 60 : 12)));
    let alive = true;
    anim.finished.then(() => {
      if (!alive) return;
      setPhase('done');
      if (soundOn()) playTear();
      buzz(18);
      el.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(5px)' }, { transform: 'translateY(0)' }], { duration: 260, easing: 'cubic-bezier(.23, 1, .32, 1)' });
    }).catch(() => {});
    return () => { alive = false; anim.cancel(); stop?.(); };
  }, [kind, run]);

  const toggleSound = () => { const next = !sound; setSound(next); setSoundOn(next); if (next) toast('Printer sound on'); };
  const share = async () => {
    setSharing(true);
    try {
      const blob = await receiptImage(blocks);
      const how = await shareReceiptImage(blob, `loeil-${r.number}-${kind}.png`, `Order #${r.number}`);
      if (how === 'downloaded') toast('Receipt image saved');
    } catch { toast('The image could not be made on this browser'); } finally { setSharing(false); }
  };
  const copyAll = async () => {
    try { await navigator.clipboard.writeText(receiptText(r)); toast('Copied — every value, as text'); buzz(8); } catch { toast('Copying is not allowed here'); }
  };

  const done = phase === 'done';
  const register = kind === 'register';
  return html`
    <div class="pad stack tight receipt-stage">
      <${Seg} label="Copy" value=${kind} onChange=${(k) => { if (k !== kind) setKind(k); }}
        options=${[{ value: 'register', label: 'Register copy' }, { value: 'customer', label: 'Customer copy' }]} />
      <div class="printer-rig">
        <div class=${'status-card' + (done ? ' done' : '')}>
          <span class="tick"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10.5" /><path d="m7.5 12.4 3 3 6-6.6" /></svg></span>
          <span class="words">
            <span class="t">${done ? (register ? 'Ready for the register' : 'Quote ready') : register ? 'Printing the register copy' : 'Printing the quote'}</span>
            <span class="s">${done ? `Receipt #${r.number} · ${money(r.totals.total)}` : 'Feeding paper…'}</span>
          </span>
          <span class="state">${done ? 'Printed' : 'Printing'}</span>
        </div>
        <div class=${'printer' + (done ? '' : ' busy')}>
          <div class="printer-top">
            <${Icon} name="printer" />
            <span class="label">L’ŒIL · ${register ? 'REGISTER' : 'QUOTE'}</span>
            <button type="button" class="feed" onClick=${() => setRun(run + 1)} aria-label="Print again"><i></i>FEED</button>
          </div>
          <div class="slot"></div>
        </div>
        <${Paper} blocks=${blocks} paperRef=${paperRef}
          soundToggle=${html`<button type="button" class="sound-toggle" aria-label=${sound ? 'Printer sound off' : 'Printer sound on'} onClick=${toggleSound}><${Icon} name=${sound ? 'sound' : 'mute'} /></button>`} />
      </div>
      ${!r.store && html`<p class="note">The branch’s name, address and the ticket’s foot are not set yet — an admin adds them under Me → Catalogue data → Store.</p>`}
      ${register && html`<div class=${'after' + (done ? ' in' : '')}><${CopyList} r=${r} /></div>`}
    </div>
    <${Dock}>
      <${Secondary} icon="copy" onClick=${copyAll}>Copy all<//>
      <${Anchor} icon="share" disabled=${sharing || !done} onClick=${share}>${sharing ? 'Making the image…' : 'Share image'}<//>
    <//>`;
}

// ---------------------------------------------------------------------------
// Screens

export function CheckoutScreen() {
  const draft = useResolvedDraft();
  const client = useApp((s) => clientById(s.draft.clientId, s));
  const rx = useApp((s) => s.draftRx);
  const seller = useApp((s) => staffMember(s));
  const order = useMemo(() => ({
    ...draft,
    sellerEmployeeNumber: draft.sellerEmployeeNumber ?? seller?.employeeNumber ?? null,
    sellerName: draft.sellerName ?? seller?.name ?? null,
  }), [draft, seller]);
  return html`
    <${Bar} backTo="#/find/order" title="Receipt" />
    <${Screen} class="has-dock">
      ${order.lines.length ? html`<${ReceiptStage} order=${order} client=${client} rx=${rx ?? client?.prescription ?? null} />`
        : html`<div class="pad"><${Empty} title="Nothing to print">Add a frame or a lens to the order first.<//></div>`}
    <//>`;
}

export function SavedReceiptScreen({ id }) {
  const order = useApp((s) => s.orders.find((o) => o.id === id));
  const client = useApp((s) => (order ? clientById(order.clientId, s) : null));
  if (!order) return html`<${Bar} backTo="#/orders" title="Receipt" /><${Screen}><div class="pad"><${Empty} title="Not found">This order is not on this phone.<//></div><//>`;
  return html`
    <${Bar} backTo=${'#/orders/' + order.id} title="Receipt" />
    <${Screen} class="has-dock">
      <${ReceiptStage} order=${order} client=${client} rx=${order.rx ?? client?.prescription ?? null} />
    <//>`;
}

export function useCheckout() {
  return () => go('#/find/checkout');
}
