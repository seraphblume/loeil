// The quote: up to three options for one client, side by side on one ticket
// that goes to the customer as a picture once he taps Print. An option is
// built in Add an option — the frame, then a preset or a lens he walks to by
// hand — without touching the order in progress, or it is that order as it
// stood when he tapped Add to quote.

import { html, useState, useMemo } from './html.js';
import { useApp } from './hooks.js';
import { Bar, Screen, LargeTitle, Section, Row, Empty, Secondary, Dock, Confirm } from './kit.js';
import { Icon } from './icons.js';
import { money } from '../core/money.js';
import { buildQuote, quoteText, QUOTE_OPTIONS } from '../core/quote.js';
import { orderTitle, composition } from '../core/orders.js';
import { quoteBlocks } from './receipt-layout.js';
import { usePrinter, PrinterRig, PrintOrShare, shareBlocks } from './receipt.js';
import { ClientPickerSheet } from './order.js';
import { buzz } from './printsound.js';
import {
  addToQuote, addOptionToQuote, removeQuoteOption, clearQuote, setQuoteClient, clientById, staffMember, toast, getState, setDraftClient,
} from '../state/app.js';
import { PresetSheet } from './presets.js';
import { go } from './router.js';
import { tr, trn } from '../i18n.js';

/** A preset's name says more than the lens's: `First Glasses Essential`. */
const optionTitle = (order) => order.lines.find((l) => l.presetName)?.presetName ?? orderTitle(order);

const added = (r) => {
  if (r.error) { toast(r.error); return false; }
  buzz(10);
  toast(tr('Option {n} of {max} on the quote', { n: r.n, max: QUOTE_OPTIONS }));
  return true;
};

/** The order in progress, as it is, onto the quote. */
export async function addOrderToQuote() { return added(await addToQuote()); }

/** An option built in Add an option (`{ lines, claimed }`) onto the quote. */
export async function addBuiltOption(built) { return added(await addOptionToQuote(built)); }

export function QuoteScreen() {
  const quote = useApp((s) => s.quote);
  const catalogue = useApp((s) => s.catalogue);
  // Until the first option fixes it, the quote is for whoever the order is for.
  const client = useApp((s) => clientById(s.quote.clientId ?? s.draft.clientId, s));
  const seller = useApp((s) => staffMember(s));
  const draftLines = useApp((s) => s.draft.lines.length);
  const hasFrame = useApp((s) => s.draft.lines.some((l) => l.kind === 'frame'));
  const forSomeoneElse = useApp((s) => Boolean(s.quote.clientId && s.draft.clientId && s.draft.lines.length && s.draft.clientId !== s.quote.clientId));
  const [sheet, setSheet] = useState(null);
  const [sharing, setSharing] = useState(false);
  const q = useMemo(() => buildQuote({ quote, catalogue, client, seller }), [quote, catalogue, client, seller]);
  const blocks = useMemo(() => quoteBlocks(q), [q]);
  const printer = usePrinter(`${quote.options.map((o) => o.id).join()}|${quote.clientId ?? ''}`);
  const n = quote.options.length;
  const has = n > 0;

  const toOrder = async () => {
    const s = getState();
    if (s.quote.clientId && !s.draft.lines.length && s.draft.clientId !== s.quote.clientId) await setDraftClient(s.quote.clientId);
    go('#/find/order');
  };
  const share = async () => {
    setSharing(true);
    await shareBlocks(blocks, `loeil-quote-${q.number}.png`, `Quote ${q.number}`);
    setSharing(false);
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(quoteText(q)); toast(tr('Quote copied as text')); buzz(8); } catch { toast(tr('Copying is not allowed here')); }
  };

  return html`
    <${Bar} title=${tr('Quote')} large trail=${has ? html`<button class="bar-btn" onClick=${() => setSheet('clear')}>${tr('Clear')}</button>` : null} />
    <${Screen} class=${has ? 'has-dock' : ''}>
      <div class="stack">
        <${LargeTitle} detail=${tr('Up to three options, side by side, for one client')}>${tr('Quote')}<//>
        <${Section} title=${tr('For')}>
          <${Row} icon="person" title=${client ? client.name : tr('No client yet')} detail=${client ? (client.phone || tr('On the quote by name')) : tr('Choose who the quote is for')} chev onClick=${() => setSheet('client')} />
        <//>
        <${Section} title=${tr('Options · {n} of {max}', { n, max: QUOTE_OPTIONS })}
          footer=${n < QUOTE_OPTIONS ? (forSomeoneElse ? tr('The order in progress is another client’s, so it cannot go on this quote as it is. Options built here leave it alone.')
            : tr('Each option keeps the prices it was added at. A frame quoted by brand is priced from the set, or from the brand’s lowest catalogue price.')) : null}>
          ${quote.options.map((o, i) => html`<${Row} key=${o.id} title=${`${i + 1} · ${optionTitle(o.order)}`} detail=${composition(o.order)} one
            end=${html`<span class="num">${money(q.options[i]?.total ?? 0)}</span>
              <button type="button" class="icon-btn" aria-label=${tr('Remove option {n}', { n: i + 1 })} onClick=${() => removeQuoteOption(o.id)}><${Icon} name="x" size=${15} /></button>`} />`)}
          ${n < QUOTE_OPTIONS && html`
            <${Row} icon="spark" title=${tr('Add an option')} detail=${tr('A frame, then a preset or the lens you choose')} chev onClick=${() => setSheet('preset')} />
            ${draftLines > 0 && !forSomeoneElse && html`<${Row} icon="plus" title=${tr('Add the order as it is')} detail=${trn(draftLines, '1 line on the order', '{n} lines on the order')} onClick=${addOrderToQuote} />`}
            <${Row} icon="glasses" title=${draftLines ? tr('Change the order') : tr('Build an option on the order')} detail=${hasFrame ? tr('Frame, lenses and extras, then Add to quote') : tr('Scan the frame, choose the lenses, then Add to quote')} chev onClick=${toOrder} />`}
        <//>
        ${has ? html`<div class="pad stack tight receipt-stage">
            <${PrinterRig} printer=${printer} blocks=${blocks} label=${tr('QUOTE')}
              status=${{ ready: tr('Quote ready to print'), printing: tr('Printing the quote'), done: tr('Quote ready'), detail: trn(n, 'Quote {number} · 1 option', 'Quote {number} · {n} options', { number: q.number }) }} />
            ${!q.store?.quoteFooter && html`<p class="note">${tr('The quote’s foot is not set yet — an admin adds it under Me → Catalogue data → Store.')}</p>`}
          </div>`
          : html`<div class="pad"><${Empty} title=${tr('No quote yet')}>${tr('Choose the client, then add up to three options: a preset, a lens you choose, or the order as you built it. They print side by side on one ticket when you tap Print, and go as a picture.')}<//></div>`}
      </div>
    <//>
    ${has && html`<${Dock}>
      <${Secondary} icon="copy" onClick=${copy}>${tr('Copy text')}<//>
      <${PrintOrShare} printer=${printer} sharing=${sharing} onShare=${share} />
    <//>`}
    ${sheet === 'preset' && html`<${PresetSheet} toQuote=${addBuiltOption} onClose=${() => setSheet(null)} />`}
    ${sheet === 'client' && html`<${ClientPickerSheet} title=${tr('Who is the quote for?')} onClose=${() => setSheet(null)} onPick=${(c) => { setQuoteClient(c.id); setSheet(null); }} />`}
    ${sheet === 'clear' && html`<${Confirm} title=${tr('Clear the quote?')} message=${tr('Every option on it is removed. The order in progress is not touched.')} action=${tr('Clear quote')}
      onConfirm=${() => { clearQuote(); toast(tr('Quote cleared')); }} onClose=${() => setSheet(null)} />`}`;
}
