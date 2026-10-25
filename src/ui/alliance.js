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

const covers = (p) => [
  `Covers ${money(p.benefit)}`,
  p.contactLensBenefit != null && p.contactLensBenefit !== p.benefit ? `contacts ${money(p.contactLensBenefit)}` : null,
  p.copay ? `copay ${money(p.copay)}` : 'no copay',
].filter(Boolean).join(' · ');

/** How the order is priced under the alliance, in a few words: `Package 17899`, `Own choice`, `Voucher lens 6500`. */
export function pricedAs(ally) {
  if (!ally) return '';
  if (ally.option) return `Package ${ally.option.convenio}`;
  if (ally.lens) return `Voucher lens ${ally.lens.convenio}`;
  return 'Own choice';
}

/** The order's row for its alliance: none yet, or which one and how it is priced. */
export function AllianceRow({ order, p, onOpen }) {
  const catalogue = useApp((s) => s.catalogue);
  if (!catalogue.alliances.length && !order.alliance) return null;
  const ally = order.ally;
  if (!ally) {
    return html`<${Row} icon="shield" title="Alliance or insurance" detail=${order.alliance ? 'No longer in the catalogue — choose it again' : catalogue.alliances.map((a) => a.name.split(' (')[0]).join(', ')} chev onClick=${onOpen} />`;
  }
  const missingAuth = !ally.authorization && ally.vale == null;
  return html`<${Row} icon="shield" title=${ally.name} detail=${`${ally.plan} · ${pricedAs(ally)}`}
    sub=${p.alliance ? `Client pays ${money(p.alliance.clientPays)} · ${ally.name.split(' (')[0]} covers ${money(p.alliance.covered)}` : null}
    end=${missingAuth ? html`<span class="badge warn">Auth</span>` : null} chev onClick=${onOpen} />`;
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
  return html`<${Sheet} title="Alliance or insurance" onClose=${onClose} full>
    <div class="stack tight">
      <p class="para pad">Ask from the first contact whether the client has an insurance policy or a company benefit. The plan is confirmed when you authorize it.</p>
      ${catalogue.alliances.map((a) => html`<${Section} key=${a.id} title=${a.name} footer=${a.combines ? 'Combines with sets and promotions.' : 'Does not combine with sets or promotions.'}>
        ${activePlans(a).map((p) => html`<${Row} key=${p.id} title=${p.name} detail=${covers(p)}
          end=${current?.allianceId === a.id && current?.planId === p.id ? html`<${Icon} name="check" />` : null} chev onClick=${() => onPick(a, p)} />`)}
      <//>`)}
      ${!catalogue.alliances.length && html`<div class="pad"><${Empty} title="No alliances">An admin adds them under Me → Catalogue data → Alliances.<//></div>`}
    </div>
  <//>`;
}

function PlanSheet({ alliance, plan: p, sel, onClose, onChange }) {
  const option = p.options.find((o) => o.convenio === sel.option) ?? null;
  const voucher = p.lenses?.length > 0;
  const pick = (patch) => patchDraftAlliance(patch);
  const remove = async () => { await setDraftAlliance(null); toast(`${alliance.name} removed from the order`); onClose(); };
  const ownDetail = !p.outside?.percent
    ? 'Anything on the order; the coverage pays towards it.'
    : `Anything else at ${p.outside.percent}% off list (${p.outside.convenio})${p.outside.minimumList ? ` when it comes to ${money(p.outside.minimumList)} or more at list price` : ''}; the coverage pays towards it.`;
  return html`<${Sheet} title=${alliance.name} onClose=${onClose} full right=${html`<button class="bar-btn strong" onClick=${onClose}>Done</button>`}>
    <div class="stack tight">
      <div class="pad">
        <${Panel}>
          <${KV} k="Plan" v=${p.name} />
          <${KV} k="Covers" v=${money(p.benefit)} em />
          ${p.contactLensBenefit != null && p.contactLensBenefit !== p.benefit && html`<${KV} k="Contact lenses" v=${money(p.contactLensBenefit)} />`}
          <${KV} k="Copay" v=${p.copay ? money(p.copay) : 'None'} />
          <${KV} k="Sets and promotions" v=${alliance.combines ? 'Combine' : 'Not with this plan'} />
        <//>
      </div>

      ${voucher ? html`<${Section} title="The lens on the voucher" footer=${`At the CFE price. Another lens: ${p.outside.percent}% off list (${p.outside.convenio}); the voucher still pays towards the glasses.`}>
          ${p.lenses.map((l) => html`<${Row} key=${l.convenio} title=${l.lens} detail=${`${l.series ? `${l.series} series · ` : ''}${l.convenio}`}
            end=${html`${money(l.price)}${sel.cfeLens === l.convenio ? html` <${Icon} name="check" />` : ''}`} onClick=${() => pick({ cfeLens: l.convenio })} />`)}
          <${Row} title="Another lens" detail=${`${p.outside.percent}% off list · ${p.outside.convenio}`} end=${!sel.cfeLens ? html`<${Icon} name="check" />` : null} onClick=${() => pick({ cfeLens: null })} />
        <//>`
        : p.options.length > 0 && html`<${Section} title="How it is priced">
          ${p.options.map((o) => html`<${Row} key=${o.convenio} title=${`${OPTION_KINDS[o.kind] ?? o.kind} package · ${o.convenio}`} detail=${o.covers}
            sub=${o.price != null ? `Package price ${money(o.price)}` : o.frameUpTo ? `Frame up to ${money(o.frameUpTo)}` : null}
            end=${sel.option === o.convenio ? html`<${Icon} name="check" />` : null} onClick=${() => pick({ option: o.convenio, extras: [] })} />`)}
          <${Row} title="Own choice" detail=${ownDetail} end=${sel.option === OWN ? html`<${Icon} name="check" />` : null} onClick=${() => pick({ option: OWN, extras: [] })} />
        <//>`}
      ${!voucher && !p.options.length && html`<p class="para pad">${ownDetail}</p>`}

      ${option?.extras?.length > 0 && html`<${Section} title="Added to the package" footer="The client pays these on top of the copay.">
        ${option.extras.map((x) => html`<${Row} key=${x.label} title=${x.label} detail=${`+${money(x.amount)}`}
          end=${html`<${Toggle} on=${(sel.extras ?? []).includes(x.label)} label=${x.label}
            onChange=${(on) => pick({ extras: on ? [...(sel.extras ?? []), x.label] : (sel.extras ?? []).filter((y) => y !== x.label) })} />`} />`)}
      <//>`}

      <div class="pad gap-s">
        <${Eyebrow}>${voucher ? 'The voucher' : 'Authorization'}<//>
        <div class="form-group">
          ${voucher && html`<label class="form-row"><span class="k">Amount authorized</span><span class="muted">$</span>
            <input type="text" inputmode="decimal" placeholder=${String((p.benefit ?? 0) / 100)} value=${sel.vale == null ? '' : String(sel.vale / 100)}
              onInput=${(e) => { const v = e.currentTarget.value.replace(/[^\d.]/g, ''); pick({ vale: v === '' ? null : Math.round(Number(v) * 100) }); }} /></label>`}
          <label class="form-row"><span class="k">${voucher ? 'Voucher no.' : 'Authorization no.'}</span>
            <input type="text" inputmode="numeric" autocomplete="off" spellcheck=${false} value=${sel.authorization ?? ''} onInput=${(e) => pick({ authorization: e.currentTarget.value })} /></label>
          <label class="form-row"><span class="k">${voucher ? 'Worker no. (RPE)' : 'Policy no.'}</span>
            <input type="text" autocomplete="off" spellcheck=${false} value=${sel.policy ?? ''} onInput=${(e) => pick({ policy: e.currentTarget.value })} /></label>
        </div>
      </div>

      ${(alliance.authorize?.length > 0 || alliance.providerKeys) && html`<div class="pad gap-s">
        <${Eyebrow}>How to authorize<//>
        <div class="ally-text">${(alliance.authorize ?? []).map((t) => html`<p>${t}</p>`)}</div>
        ${alliance.providerKeys && html`<${Panel}>${Object.entries(alliance.providerKeys).map(([k, v]) => html`<${KV} k=${k} v=${v} mono />`)}<//>`}
      </div>`}

      ${alliance.atRegister?.length > 0 && html`<div class="pad gap-s">
        <${Eyebrow}>At the register<//>
        <div class="ally-text">${alliance.atRegister.map((t) => html`<p>${t}</p>`)}</div>
      </div>`}

      ${(p.notes?.length > 0 || alliance.rules?.length > 0 || p.replacements?.length > 0 || alliance.cashDiscount) && html`<div class="pad gap-s">
        <${Eyebrow}>Good to know<//>
        <div class="ally-text">
          ${(alliance.rules ?? []).map((t) => html`<p>${t}</p>`)}
          ${(p.notes ?? []).map((t) => html`<p>${t}</p>`)}
          ${(p.replacements ?? []).map((r) => html`<p>Replacement: ${r.percent}% off${r.on ? ` — ${r.on}` : ''} (${r.convenio}).</p>`)}
          ${(p.addOns ?? []).map((x) => html`<p>${x.item}${x.sku ? ` ${x.sku}` : ''}: ${money(x.price)} for members (${x.convenio}).</p>`)}
          ${alliance.cashDiscount && html`<p>No vision cover: ${alliance.cashDiscount.percent}% off paying cash (${alliance.cashDiscount.convenio}).</p>`}
          ${(alliance.perks ?? []).map((t) => html`<p>${t}</p>`)}
        </div>
      </div>`}

      <div class="pad stack tight">
        <${Anchor} onClick=${onClose}>Done<//>
        <${Secondary} onClick=${onChange}>Choose another plan<//>
        <${Quiet} danger onClick=${remove}>Remove the alliance<//>
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
    <div class="pad"><${Eyebrow}>${hit.alliance.name} paperwork${open ? ` · ${open} to go` : ' · ready'}<//></div>
    ${checklist(hit.alliance).map((g) => html`<${Section} key=${g.key} title=${GROUP_TITLE[g.key] ?? g.title}>
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
    ${p.off > 0 && html`<${KV} k="Before discounts" v=${money(p.list)} />`}
    ${p.off > 0 && html`<${KV} k=${order.ally?.option ? 'Discounts and package' : 'Discounts'} v=${'−' + money(p.off)} />`}
    <${KV} k="Products" v=${money(a.products)} />
    ${a.copay > 0 && html`<${KV} k="Copay" v=${money(a.copay)} />`}
    ${extras.map((x) => html`<${KV} k=${x.label} v=${'+' + money(x.amount)} />`)}
    <${KV} k=${`${a.payer.split(' (')[0]} covers`} v=${'−' + money(a.covered)} />
    <${KV} k="Client pays" v=${money(a.clientPays)} em />
  <//>`;
}
