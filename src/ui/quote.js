// The quote: up to three options for one client, side by side on one ticket
// that goes to the customer as a picture. Each option is the order in
// progress as it stood when he tapped Add to quote — he changes the lens or
// the frame and adds again.

import { html, useState, useMemo } from './html.js';
import { useApp } from './hooks.js';
import { Bar, Screen, LargeTitle, Section, Row, Empty, Anchor, Secondary, Dock, Confirm } from './kit.js';
import { Icon } from './icons.js';
import { money } from '../core/money.js';
import { buildQuote, quoteText, QUOTE_OPTIONS } from '../core/quote.js';
import { orderTitle, composition } from '../core/orders.js';
import { quoteBlocks } from './receipt-layout.js';
import { usePrinter, PrinterRig, shareBlocks } from './receipt.js';
import { ClientPickerSheet } from './order.js';
import { buzz } from './printsound.js';
import {
  addToQuote, removeQuoteOption, clearQuote, setQuoteClient, clientById, staffMember, toast, getState, setDraftClient,
} from '../state/app.js';
import { PresetSheet } from './presets.js';
import { go } from './router.js';

/** A preset's name says more than the lens's: `First glasses · Accessible`. */
const optionTitle = (order) => order.lines.find((l) => l.presetName)?.presetName ?? orderTitle(order);

export async function addOrderToQuote() {
  const r = await addToQuote();
  if (r.error) { toast(r.error); return false; }
  buzz(10);
  toast(`Option ${r.n} of ${QUOTE_OPTIONS} on the quote`);
  return true;
}

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
    try { await navigator.clipboard.writeText(quoteText(q)); toast('Quote copied as text'); buzz(8); } catch { toast('Copying is not allowed here'); }
  };

  return html`
    <${Bar} title="Quote" large trail=${has ? html`<button class="bar-btn" onClick=${() => setSheet('clear')}>Clear</button>` : null} />
    <${Screen} class=${has ? 'has-dock' : ''}>
      <div class="stack">
        <${LargeTitle} detail="Up to three options, side by side, for one client">Quote<//>
        <${Section} title="For">
          <${Row} icon="person" title=${client ? client.name : 'No client yet'} detail=${client ? (client.phone || 'On the quote by name') : 'Choose who the quote is for'} chev onClick=${() => setSheet('client')} />
        <//>
        <${Section} title=${`Options · ${n} of ${QUOTE_OPTIONS}`}
          footer=${n < QUOTE_OPTIONS ? (forSomeoneElse ? 'The order in progress belongs to another client — save or clear it first, or clear the quote.'
            : 'Each option keeps the prices it was added at. A frame quoted by brand is priced from the set, or from the brand’s lowest catalogue price.') : null}>
          ${quote.options.map((o, i) => html`<${Row} key=${o.id} title=${`${i + 1} · ${optionTitle(o.order)}`} detail=${composition(o.order)} one
            end=${html`<span class="num">${money(q.options[i]?.total ?? 0)}</span>
              <button type="button" class="icon-btn" aria-label=${`Remove option ${i + 1}`} onClick=${() => removeQuoteOption(o.id)}><${Icon} name="x" size=${15} /></button>`} />`)}
          ${n < QUOTE_OPTIONS && html`
            <${Row} icon="spark" title="Add an option" detail="A frame, a brand or a set, then a lifestyle preset" chev onClick=${() => setSheet('preset')} />
            ${draftLines > 0 && html`<${Row} icon="plus" title="Add the order as it is" detail=${`${draftLines} line${draftLines === 1 ? '' : 's'} on the order`} onClick=${addOrderToQuote} />`}
            <${Row} icon="glasses" title=${draftLines ? 'Change the order' : 'Build an option on the order'} detail=${hasFrame ? 'Frame, lenses and extras, then Add to quote' : 'Scan the frame, choose the lenses, then Add to quote'} chev onClick=${toOrder} />`}
        <//>
        ${has ? html`<div class="pad stack tight receipt-stage">
            <${PrinterRig} printer=${printer} blocks=${blocks} label="QUOTE"
              status=${{ printing: 'Printing the quote', done: 'Quote ready', detail: `Quote ${q.number} · ${n} option${n === 1 ? '' : 's'}` }} />
            ${!q.store?.quoteFooter && html`<p class="note">The quote’s foot is not set yet — an admin adds it under Me → Catalogue data → Store.</p>`}
          </div>`
          : html`<div class="pad"><${Empty} title="No quote yet">Choose the client, then add up to three options: a preset in one tap, or the order as you built it. They print side by side on one ticket, sent as a picture.<//></div>`}
      </div>
    <//>
    ${has && html`<${Dock}>
      <${Secondary} icon="copy" onClick=${copy}>Copy text<//>
      <${Anchor} icon="share" disabled=${sharing || !printer.done} onClick=${share}>${sharing ? 'Making the image…' : 'Share image'}<//>
    <//>`}
    ${sheet === 'preset' && html`<${PresetSheet} toQuote=${addOrderToQuote} onClose=${() => setSheet(null)} />`}
    ${sheet === 'client' && html`<${ClientPickerSheet} title="Who is the quote for?" onClose=${() => setSheet(null)} onPick=${(c) => { setQuoteClient(c.id); setSheet(null); }} />`}
    ${sheet === 'clear' && html`<${Confirm} title="Clear the quote?" message="Every option on it is removed. The order in progress is not touched." action="Clear quote"
      onConfirm=${() => { clearQuote(); toast('Quote cleared'); }} onClose=${() => setSheet(null)} />`}`;
}
