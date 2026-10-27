// An alliance on the order: the insurer or employer that pays part of it.
// The seller picks the alliance and plan, then the plan's package or Own
// choice, types the authorization, and ticks the paperwork as it is collected
// and signed. The order prices itself from that (core/alliances.js).

import { html, useState } from './html.js';
import { useApp } from './hooks.js';
import { Sheet, Section, Row, Panel, KV, Eyebrow, Anchor, Secondary, Quiet, Toggle, Empty } from './kit.js';
import { Icon } from './icons.js';
import { money } from '../core/money.js';
import { OPTION_KINDS, OWN, newSelection, findPlan, activePlans, checklist, openChecks } from '../core/alliances.js';
import { setDraftAlliance, patchDraftAlliance, setDraftAllianceCheck, toast } from '../state/app.js';
import { tr } from '../i18n.js';

const covers = (p) => [
  tr('Covers {amount}', { amount: money(p.benefit) }),
  p.contactLensBenefit != null && p.contactLensBenefit !== p.benefit ? tr('contacts {amount}', { amount: money(p.contactLensBenefit) }) : null,
  p.copay ? tr('copay {amount}', { amount: money(p.copay) }) : tr('no copay'),
].filter(Boolean).join(' · ');

/** How the order is priced under the alliance, in a few words: `Package 17899`, `Own choice`, `Voucher lens 6500`. */
export function pricedAs(ally) {
  if (!ally) return '';
  if (ally.option) return tr('Package {code}', { code: ally.option.convenio });
  if (ally.lens) return tr('Voucher lens {code}', { code: ally.lens.convenio });
  return tr('Own choice');
}

/** The order's row for its alliance: none yet, or which one and how it is priced. */
export function AllianceRow({ order, p, onOpen }) {
  const catalogue = useApp((s) => s.catalogue);
  if (!catalogue.alliances.length && !order.alliance) return null;
  const ally = order.ally;
  if (!ally) {
    return html`<${Row} icon="shield" title=${tr('Alliance or insurance')} detail=${order.alliance ? 'No longer in the catalogue — choose it again' : catalogue.alliances.map((a) => a.name.split(' (')[0]).join(', ')} chev onClick=${onOpen} />`;
  }
  const missingAuth = !ally.authorization && ally.vale == null;
  return html`<${Row} icon="shield" title=${ally.name} detail=${`${ally.plan} · ${pricedAs(ally)}`}
    sub=${p.alliance ? tr('Client pays {pays} · {payer} covers {covered}', { pays: money(p.alliance.clientPays), payer: ally.name.split(' (')[0], covered: money(p.alliance.covered) }) : null}
    end=${missingAuth ? html`<span class="badge warn">${tr('Auth')}</span>` : null} chev onClick=${onOpen} />`;
}

export function AllianceSheet({ onClose }) {
  const catalogue = useApp((s) => s.catalogue);
  const sel = useApp((s) => s.draft.alliance);
  const [picking, setPicking] = useState(!sel);
  const hit = findPlan(catalogue, sel);
  if (picking || !hit) {
    return html`<${PlanPicker} current=${sel} onClose=${onClose} onPick=${async (a, p) => {
      const same = sel?.allianceId === a.id;
      // Another plan of the same alliance keeps what was typed and ticked.
      await setDraftAlliance({ ...newSelection(a.id, p.id), ...(same ? { authorization: sel.authorization, policy: sel.policy, checks: sel.checks } : {}) });
      setPicking(false);
    }} />`;
  }
  return html`<${PlanSheet} alliance=${hit.alliance} plan=${hit.plan} sel=${sel} onClose=${onClose} onChange=${() => setPicking(true)} />`;
}

function PlanPicker({ current, onPick, onClose }) {
  const catalogue = useApp((s) => s.catalogue);
  return html`<${Sheet} title=${tr('Alliance or insurance')} onClose=${onClose} full>
    <div class="stack tight">
      <p class="para pad">${tr('Ask from the first contact whether the client has an insurance policy or a company benefit. The plan is confirmed when you authorize it.')}</p>
      ${catalogue.alliances.map((a) => html`<${Section} key=${a.id} title=${a.name} footer=${a.combines ? tr('Combines with sets and promotions.') : tr('Does not combine with sets or promotions.')}>
        ${activePlans(a).map((p) => html`<${Row} key=${p.id} title=${p.name} detail=${covers(p)}
          end=${current?.allianceId === a.id && current?.planId === p.id ? html`<${Icon} name="check" />` : null} chev onClick=${() => onPick(a, p)} />`)}
      <//>`)}
      ${!catalogue.alliances.length && html`<div class="pad"><${Empty} title=${tr('No alliances')}>${tr('An admin adds them under Me → Catalogue data → Alliances.')}<//></div>`}
    </div>
  <//>`;
}

function PlanSheet({ alliance, plan: p, sel, onClose, onChange }) {
  const option = p.options.find((o) => o.convenio === sel.option) ?? null;
  const voucher = p.lenses?.length > 0;
  const pick = (patch) => patchDraftAlliance(patch);
  const remove = async () => { await setDraftAlliance(null); toast(tr('{name} removed from the order', { name: alliance.name })); onClose(); };
  const ownDetail = !p.outside?.percent
    ? tr('Anything on the order; the coverage pays towards it.')
    : p.outside.minimumList
      ? tr('Anything else at {n}% off list ({code}) when it comes to {min} or more at list price; the coverage pays towards it.', { n: p.outside.percent, code: p.outside.convenio, min: money(p.outside.minimumList) })
      : tr('Anything else at {n}% off list ({code}); the coverage pays towards it.', { n: p.outside.percent, code: p.outside.convenio });
  return html`<${Sheet} title=${alliance.name} onClose=${onClose} full right=${html`<button class="bar-btn strong" onClick=${onClose}>${tr('Done')}</button>`}>
    <div class="stack tight">
      <div class="pad">
        <${Panel}>
          <${KV} k=${tr('Plan')} v=${p.name} />
          <${KV} k=${tr('Covers')} v=${money(p.benefit)} em />
          ${p.contactLensBenefit != null && p.contactLensBenefit !== p.benefit && html`<${KV} k=${tr('Contact lenses')} v=${money(p.contactLensBenefit)} />`}
          <${KV} k=${tr('Copay')} v=${p.copay ? money(p.copay) : tr('None')} />
          <${KV} k=${tr('Sets and promotions')} v=${alliance.combines ? tr('Combine') : tr('Not with this plan')} />
        <//>
      </div>

      ${voucher ? html`<${Section} title=${tr('The lens on the voucher')} footer=${`At the CFE price. Another lens: ${p.outside.percent}% off list (${p.outside.convenio}); the voucher still pays towards the glasses.`}>
          ${p.lenses.map((l) => html`<${Row} key=${l.convenio} title=${l.lens} detail=${`${l.series ? tr('{s} series', { s: l.series }) + ' · ' : ''}${l.convenio}`}
            end=${html`${money(l.price)}${sel.cfeLens === l.convenio ? html` <${Icon} name="check" />` : ''}`} onClick=${() => pick({ cfeLens: l.convenio })} />`)}
          <${Row} title=${tr('Another lens')} detail=${tr('{n}% off list', { n: p.outside.percent }) + ' · ' + p.outside.convenio} end=${!sel.cfeLens ? html`<${Icon} name="check" />` : null} onClick=${() => pick({ cfeLens: null })} />
        <//>`
        : p.options.length > 0 && html`<${Section} title=${tr('How it is priced')}>
          ${p.options.map((o) => html`<${Row} key=${o.convenio} title=${`${tr('{kind} package', { kind: tr(OPTION_KINDS[o.kind] ?? o.kind) })} · ${o.convenio}`} detail=${o.covers}
            sub=${o.price != null ? tr('Package price {amount}', { amount: money(o.price) }) : o.frameUpTo ? tr('Frame up to {amount}', { amount: money(o.frameUpTo) }) : null}
            end=${sel.option === o.convenio ? html`<${Icon} name="check" />` : null} onClick=${() => pick({ option: o.convenio, extras: [] })} />`)}
          <${Row} title=${tr('Own choice')} detail=${ownDetail} end=${sel.option === OWN ? html`<${Icon} name="check" />` : null} onClick=${() => pick({ option: OWN, extras: [] })} />
        <//>`}
      ${!voucher && !p.options.length && html`<p class="para pad">${ownDetail}</p>`}

      ${option?.extras?.length > 0 && html`<${Section} title=${tr('Added to the package')} footer=${tr('The client pays these on top of the copay.')}>
        ${option.extras.map((x) => html`<${Row} key=${x.label} title=${x.label} detail=${`+${money(x.amount)}`}
          end=${html`<${Toggle} on=${(sel.extras ?? []).includes(x.label)} label=${x.label}
            onChange=${(on) => pick({ extras: on ? [...(sel.extras ?? []), x.label] : (sel.extras ?? []).filter((y) => y !== x.label) })} />`} />`)}
      <//>`}

      <div class="pad gap-s">
        <${Eyebrow}>${voucher ? tr('The voucher') : tr('Authorization')}<//>
        <div class="form-group">
          ${voucher && html`<label class="form-row"><span class="k">${tr('Amount authorized')}</span><span class="muted">$</span>
            <input type="text" inputmode="decimal" placeholder=${String((p.benefit ?? 0) / 100)} value=${sel.vale == null ? '' : String(sel.vale / 100)}
              onInput=${(e) => { const v = e.currentTarget.value.replace(/[^\d.]/g, ''); pick({ vale: v === '' ? null : Math.round(Number(v) * 100) }); }} /></label>`}
          <label class="form-row"><span class="k">${voucher ? tr('Voucher no.') : tr('Authorization no.')}</span>
            <input type="text" inputmode="numeric" autocomplete="off" spellcheck=${false} value=${sel.authorization ?? ''} onInput=${(e) => pick({ authorization: e.currentTarget.value })} /></label>
          <label class="form-row"><span class="k">${voucher ? tr('Worker no. (RPE)') : tr('Policy no.')}</span>
            <input type="text" autocomplete="off" spellcheck=${false} value=${sel.policy ?? ''} onInput=${(e) => pick({ policy: e.currentTarget.value })} /></label>
        </div>
      </div>

      ${(alliance.authorize?.length > 0 || alliance.providerKeys) && html`<div class="pad gap-s">
        <${Eyebrow}>${tr('How to authorize')}<//>
        <div class="ally-text">${(alliance.authorize ?? []).map((t) => html`<p>${t}</p>`)}</div>
        ${alliance.providerKeys && html`<${Panel}>${Object.entries(alliance.providerKeys).map(([k, v]) => html`<${KV} k=${k} v=${v} mono />`)}<//>`}
      </div>`}

      ${alliance.atRegister?.length > 0 && html`<div class="pad gap-s">
        <${Eyebrow}>${tr('At the register')}<//>
        <div class="ally-text">${alliance.atRegister.map((t) => html`<p>${t}</p>`)}</div>
      </div>`}

      ${(p.notes?.length > 0 || alliance.rules?.length > 0 || p.replacements?.length > 0 || alliance.cashDiscount) && html`<div class="pad gap-s">
        <${Eyebrow}>${tr('Good to know')}<//>
        <div class="ally-text">
          ${(alliance.rules ?? []).map((t) => html`<p>${t}</p>`)}
          ${(p.notes ?? []).map((t) => html`<p>${t}</p>`)}
          ${(p.replacements ?? []).map((r) => html`<p>${tr('Replacement: {a}% off{b} ({c}).', { a: r.percent, b: r.on ? ` — ${r.on}` : '', c: r.convenio })}</p>`)}
          ${(p.addOns ?? []).map((x) => html`<p>${tr('{a}{b}: {c} for members ({d}).', { a: x.item, b: x.sku ? ` ${x.sku}` : '', c: money(x.price), d: x.convenio })}</p>`)}
          ${alliance.cashDiscount && html`<p>${tr('No vision cover: {a}% off paying cash ({b}).', { a: alliance.cashDiscount.percent, b: alliance.cashDiscount.convenio })}</p>`}
          ${(alliance.perks ?? []).map((t) => html`<p>${t}</p>`)}
        </div>
      </div>`}

      <div class="pad stack tight">
        <${Anchor} onClick=${onClose}>${tr('Done')}<//>
        <${Secondary} onClick=${onChange}>${tr('Choose another plan')}<//>
        <${Quiet} danger onClick=${remove}>${tr('Remove the alliance')}<//>
      </div>
    </div>
  <//>`;
}

function Check({ text, on, onToggle, editable }) {
  const inner = html`<span class="tick">${on ? html`<${Icon} name="check" size=${13} />` : null}</span><span class="main"><span class="t">${text}</span></span>`;
  return editable
    ? html`<button type="button" class=${'row ally-check' + (on ? ' done' : '')} aria-pressed=${on ? 'true' : 'false'} onClick=${() => onToggle(!on)}>${inner}</button>`
    : html`<div class=${'row ally-check' + (on ? ' done' : '')}>${inner}</div>`;
}

const GROUP_TITLE = { collect: 'Collect', signatures: 'Signatures', send: 'Send after the sale' };

/** The alliance's paperwork, ticked as it is collected and signed. */
export function AlliancePaperwork({ order, editable = false }) {
  const catalogue = useApp((s) => s.catalogue);
  const hit = findPlan(catalogue, order.alliance);
  if (!hit) return null;
  const checks = order.alliance.checks ?? {};
  const open = openChecks(hit.alliance, order.alliance).length;
  return html`<div class="gap-m">
    <div class="pad"><${Eyebrow}>${tr('{name} paperwork', { name: hit.alliance.name })} · ${open ? tr('{n} to go', { n: open }) : tr('ready')}<//></div>
    ${checklist(hit.alliance).map((g) => html`<${Section} key=${g.key} title=${tr(GROUP_TITLE[g.key] ?? g.title)}>
      ${g.items.map((i) => html`<${Check} key=${i.id} text=${i.text} on=${Boolean(checks[i.id])} editable=${editable} onToggle=${(on) => setDraftAllianceCheck(i.id, on)} />`)}
    <//>`)}
  </div>`;
}

/** What the payer covers and what the client pays, for the order's totals. */
export function AllianceTotals({ order, p }) {
  const a = p.alliance;
  if (!a) return null;
  const extras = order.ally?.extras ?? [];
  return html`<${Panel}>
    ${p.off > 0 && html`<${KV} k=${tr('Before discounts')} v=${money(p.list)} />`}
    ${p.off > 0 && html`<${KV} k=${order.ally?.option ? 'Discounts and package' : 'Discounts'} v=${'−' + money(p.off)} />`}
    <${KV} k=${tr('Products')} v=${money(a.products)} />
    ${a.copay > 0 && html`<${KV} k=${tr('Copay')} v=${money(a.copay)} />`}
    ${extras.map((x) => html`<${KV} k=${x.label} v=${'+' + money(x.amount)} />`)}
    <${KV} k=${tr('{payer} covers', { payer: a.payer.split(' (')[0] })} v=${'−' + money(a.covered)} />
    <${KV} k=${tr('Client pays')} v=${money(a.clientPays)} em />
  <//>`;
}
