// Alliances, the editor's side: each insurer or employer with its paperwork,
// and its plans — what each covers, the copay, the packages (one convenio
// each) and what anything outside them takes. Nothing about an alliance is in
// the code, so a renewed circular is an edit here and a publish.

import { html, useState } from '../html.js';
import { Bar, Screen, Section, Row, Panel, KV, Quiet, Confirm, Empty } from '../kit.js';
import { Icon } from '../icons.js';
import { FormSheet } from './form.js';
import { useWorking } from './home.js';
import { edit } from '../../state/working.js';
import { toast } from '../../state/app.js';
import { go } from '../router.js';
import { money } from '../../core/money.js';
import { upsertAlliance, deleteAlliance, upsertAlliancePlan, deleteAlliancePlan } from '../../core/edits.js';
import { optionsText, parseOptions, lensesText, parseLenses, linesText, parseLines } from '../../core/alliances.js';

const saved = (m = 'Saved to the working copy') => toast(m);
const LINES = 'One per line.';

const allianceFields = [
  { key: 'id', label: 'Id', required: true, placeholder: 'centauro', group: 'Alliance' },
  { key: 'name', label: 'Name', required: true, placeholder: 'Seguros Centauro', group: 'Alliance' },
  { key: 'combines', label: 'Combines with sets and promotions', type: 'toggle', group: 'Alliance', hint: 'Off: an order under this alliance is priced without sets, campaign discounts, Sam’s Club or the seller’s own line discount.' },
  { key: 'authorizeText', label: 'How to authorize', type: 'textarea', rows: 4, group: 'Paperwork', hint: LINES },
  { key: 'collectText', label: 'Collect', type: 'textarea', rows: 4, group: 'Paperwork', hint: `Ticked on the order. ${LINES}` },
  { key: 'fillIn', label: 'Fill in', type: 'textarea', rows: 2, group: 'Paperwork' },
  { key: 'signaturesText', label: 'Signatures', type: 'textarea', rows: 3, group: 'Paperwork', hint: `Ticked on the order. ${LINES}` },
  { key: 'sendText', label: 'Send', type: 'textarea', rows: 3, group: 'Paperwork', hint: `What goes to Billing after the sale. ${LINES}` },
  { key: 'atRegisterText', label: 'At the register', type: 'textarea', rows: 3, group: 'Paperwork', hint: LINES },
  { key: 'rulesText', label: 'Rules', type: 'textarea', rows: 3, group: 'Good to know', hint: LINES },
  { key: 'perksText', label: 'Perks', type: 'textarea', rows: 3, group: 'Good to know', hint: LINES },
];

const toAllianceForm = (a) => ({
  ...a, authorizeText: linesText(a.authorize), collectText: linesText(a.collect), signaturesText: linesText(a.signatures),
  sendText: linesText(a.send), atRegisterText: linesText(a.atRegister), rulesText: linesText(a.rules), perksText: linesText(a.perks),
});

const fromAllianceForm = (x) => ({
  id: String(x.id).trim(), name: String(x.name).trim(), combines: Boolean(x.combines),
  authorize: parseLines(x.authorizeText), collect: parseLines(x.collectText), fillIn: String(x.fillIn ?? '').trim() || undefined,
  signatures: parseLines(x.signaturesText), send: parseLines(x.sendText), atRegister: parseLines(x.atRegisterText),
  rules: parseLines(x.rulesText), perks: parseLines(x.perksText),
});

export function AlliancesAdminScreen() {
  const { bundle } = useWorking();
  const list = bundle.alliances ?? [];
  const [adding, setAdding] = useState(false);
  return html`
    <${Bar} backTo="#/me/data" title="Alliances" trail=${html`<button class="bar-btn" aria-label="Add" onClick=${() => setAdding(true)}><${Icon} name="plus" /></button>`} />
    <${Screen}>
      <div class="stack">
        <p class="para pad">Insurers and employers whose members get glasses as a benefit. The seller switches one on for the order; the payer covers up to the plan’s amount and the client pays the copay and the rest.</p>
        ${list.length ? html`<${Section}>
          ${list.map((a) => html`<${Row} key=${a.id} to=${'#/me/data/alliances/' + encodeURIComponent(a.id)} title=${a.name}
            detail=${`${a.plans.length} plan${a.plans.length === 1 ? '' : 's'} · ${a.combines ? 'combines with promotions' : 'no promotions'}`} chev />`)}
        <//>` : html`<div class="pad"><${Empty} title="No alliances">Add one with +.<//></div>`}
      </div>
    <//>
    ${adding && html`<${FormSheet} title="New alliance" fields=${allianceFields} onClose=${() => setAdding(false)}
      onSave=${(x) => {
        const a = fromAllianceForm(x);
        if (list.some((y) => y.id === a.id)) return `Alliance id ${a.id} is already used.`;
        edit((b) => upsertAlliance(b, { ...a, plans: [] })); saved('Alliance added');
      }} />`}`;
}

const planFields = [
  { key: 'id', label: 'Id', required: true, placeholder: 'centauro-platino-250', group: 'Plan' },
  { key: 'name', label: 'Name', required: true, group: 'Plan' },
  { key: 'active', label: 'Offered on orders', type: 'toggle', group: 'Plan' },
  { key: 'benefit', label: 'Covers', type: 'money', required: true, group: 'Amounts', hint: 'What the payer covers for glasses (a CFE voucher: its usual amount; the seller types the voucher’s own).' },
  { key: 'contactLensBenefit', label: 'Contact lenses', type: 'money', group: 'Amounts', hint: 'Only when contact lenses are covered for a different amount.' },
  { key: 'copay', label: 'Copay', type: 'money', group: 'Amounts', hint: 'IVA included, as the client pays it.' },
  { key: 'glassesOnly', label: 'Glasses only', type: 'toggle', group: 'Amounts' },
  { key: 'optionsText', label: 'Packages', type: 'textarea', rows: 5, group: 'Packages',
    placeholder: '17899 | glasses | 2500 | Frame up to $2,500 + SV polycarbonate with AR Premium HD',
    hint: 'One per line: convenio | glasses or contacts | frame up to | what it covers | fixed price | surcharges as label=amount; label=amount. Leave a part blank when the circular does not say.' },
  { key: 'outsideConvenio', label: 'Convenio', group: 'Outside the plan', inputmode: 'numeric' },
  { key: 'outsidePercent', label: 'Percent off', type: 'number', group: 'Outside the plan' },
  { key: 'minimumList', label: 'Only from', type: 'money', group: 'Outside the plan', hint: 'A minimum at list price before the percentage applies (MetLife Platino 11250: $12,900).' },
  { key: 'lensesOnly', label: 'Lenses only', type: 'toggle', group: 'Outside the plan', hint: 'On: frames take no percentage — the payer covers the frame (a CFE voucher).' },
  { key: 'contactsConvenio', label: 'Contacts convenio', group: 'Other contact lenses', inputmode: 'numeric' },
  { key: 'contactsPercent', label: 'Percent off', type: 'number', group: 'Other contact lenses' },
  { key: 'sunConvenio', label: 'Convenio', group: 'Sunglasses', inputmode: 'numeric' },
  { key: 'sunPercent', label: 'Percent off', type: 'number', group: 'Sunglasses' },
  { key: 'sunBenefit', label: 'Coverage counts', type: 'toggle', group: 'Sunglasses' },
  { key: 'lensesText', label: 'Voucher lenses', type: 'textarea', rows: 5, group: 'Voucher (CFE)', placeholder: '6500 | Ultralite single vision | 1st and 2nd | 495', hint: 'One per line: convenio | lens | series | price of the pair. Only for a voucher that names its lens.' },
  { key: 'convenio', label: 'Plan convenio', group: 'Register', hint: 'Dentalia-Mapfre: the plan’s convenio for order 2.' },
  { key: 'copaySku', label: 'Copay SKU', group: 'Register', hint: 'Dentalia-Mapfre: the copay’s SKU for order 1.' },
  { key: 'copayAdjustment', label: 'Copay adjustment', group: 'Register', hint: 'Dentalia-Mapfre: the “AJ” convenio in order 2.' },
  { key: 'replacementsText', label: 'Replacements', type: 'textarea', rows: 2, group: 'Good to know', placeholder: '6704 | 20 | Frame, second purchase', hint: 'One per line: convenio | percent | on what.' },
  { key: 'notesText', label: 'Notes', type: 'textarea', rows: 3, group: 'Good to know', hint: LINES },
];

const toPlanForm = (p) => ({
  ...p,
  active: p.active !== false,
  optionsText: optionsText(p.options), lensesText: lensesText(p.lenses), notesText: linesText(p.notes),
  outsideConvenio: p.outside?.convenio ?? '', outsidePercent: p.outside?.percent ?? null, minimumList: p.outside?.minimumList ?? null, lensesOnly: p.outside?.appliesTo === 'lenses',
  contactsConvenio: p.contacts?.convenio ?? '', contactsPercent: p.contacts?.percent ?? null,
  sunConvenio: p.sun?.convenio ?? '', sunPercent: p.sun?.percent ?? null, sunBenefit: Boolean(p.sun?.benefit),
  replacementsText: (p.replacements ?? []).map((r) => [r.convenio, r.percent, r.on].join(' | ')).join('\n'),
});

function fromPlanForm(x, old = {}) {
  const opt = (v) => (String(v ?? '').trim() || undefined);
  const p = {
    ...old,
    id: String(x.id).trim(), name: String(x.name).trim(), active: Boolean(x.active),
    benefit: x.benefit, contactLensBenefit: x.contactLensBenefit ?? null, copay: x.copay ?? 0, glassesOnly: Boolean(x.glassesOnly),
    options: parseOptions(x.optionsText), lenses: parseLenses(x.lensesText), notes: parseLines(x.notesText),
    outside: { convenio: opt(x.outsideConvenio) ?? null, percent: x.outsidePercent ?? 0, minimumList: x.minimumList ?? null, appliesTo: x.lensesOnly ? 'lenses' : 'all' },
    contacts: opt(x.contactsConvenio) || x.contactsPercent ? { convenio: opt(x.contactsConvenio) ?? null, percent: x.contactsPercent ?? 0 } : null,
    sun: { convenio: opt(x.sunConvenio) ?? null, percent: x.sunPercent ?? 0, benefit: Boolean(x.sunBenefit) },
    replacements: parseLines(x.replacementsText).map((l) => { const [convenio = '', percent = '', on = ''] = l.split('|').map((y) => y.trim()); return { convenio, percent: Number(percent) || 0, on }; }),
  };
  for (const k of ['convenio', 'copaySku', 'copayAdjustment']) { if (opt(x[k])) p[k] = opt(x[k]); else delete p[k]; }
  return p;
}

const planProblem = (p) => {
  for (const o of p.options) {
    if (!o.convenio) return 'Every package needs a convenio.';
    if (o.kind !== 'glasses' && o.kind !== 'contacts') return `Package ${o.convenio}: the second part is glasses or contacts.`;
    if (o.extras.some((e) => !(e.amount > 0))) return `Package ${o.convenio}: every surcharge needs an amount (label=amount).`;
  }
  for (const r of [p.outside, p.contacts, p.sun].filter(Boolean)) if (!(r.percent >= 0 && r.percent <= 100)) return 'A percentage is between 0 and 100.';
  if (p.lenses.some((l) => !l.convenio || !(l.price > 0))) return 'Every voucher lens needs a convenio and a price.';
  return null;
};

export function AllianceAdminScreen({ id }) {
  const { bundle } = useWorking();
  const a = (bundle.alliances ?? []).find((x) => x.id === id);
  const [editing, setEditing] = useState(false);
  const [plan, setPlan] = useState(null);
  const [confirm, setConfirm] = useState(false);
  if (!a) return html`<${Bar} backTo="#/me/data/alliances" title="Alliance" /><${Screen}><div class="pad"><${Empty} title="Not found">It may have been renamed or removed.<//></div><//>`;
  const blank = { id: '', name: '', active: true, benefit: null, contactLensBenefit: null, copay: 0, options: [], lenses: [], outside: { convenio: '', percent: 15 }, sun: { convenio: '', percent: 15, benefit: false }, notes: [] };
  return html`
    <${Bar} backTo="#/me/data/alliances" title=${a.name} trail=${html`<button class="bar-btn" onClick=${() => setEditing(true)}>Edit</button>`} />
    <${Screen}>
      <div class="stack">
        <div class="pad">
          <${Panel}>
            <${KV} k="Id" v=${a.id} mono />
            <${KV} k="Sets and promotions" v=${a.combines ? 'Combine' : 'Do not combine'} />
            <${KV} k="To collect" v=${`${(a.collect ?? []).length + (a.fillIn ? 1 : 0)} items`} />
            <${KV} k="Signatures" v=${`${(a.signatures ?? []).length}`} />
            <${KV} k="To send" v=${`${(a.send ?? []).length}`} />
          <//>
        </div>
        <${Section} title="Plans" action=${html`<button class="bar-btn" aria-label="Add a plan" onClick=${() => setPlan({ p: blank })}><${Icon} name="plus" /></button>`}>
          ${a.plans.map((p) => html`<${Row} key=${p.id} title=${p.name} off=${p.active === false}
            detail=${`Covers ${money(p.benefit)} · copay ${money(p.copay ?? 0)}${p.options?.length ? ` · ${p.options.length} package${p.options.length === 1 ? '' : 's'}` : ''}`}
            sub=${[p.active === false && 'Not offered', p.circularValidTo && `Circular printed to ${p.circularValidTo}`].filter(Boolean).join(' · ') || null}
            onClick=${() => setPlan({ p, id: p.id })} />`)}
        <//>
        ${!a.plans.length && html`<p class="note pad">No plans yet — add one with +.</p>`}
        <div class="pad"><${Quiet} danger onClick=${() => setConfirm(true)}>Delete alliance<//></div>
      </div>
    <//>
    ${editing && html`<${FormSheet} title="Alliance" initial=${toAllianceForm(a)} fields=${allianceFields} onClose=${() => setEditing(false)}
      onSave=${(x) => {
        const next = fromAllianceForm(x);
        if (next.id !== a.id && (bundle.alliances ?? []).some((y) => y.id === next.id)) return `Alliance id ${next.id} is already used.`;
        edit((b) => upsertAlliance(b, { ...a, ...next }, a.id)); saved();
        if (next.id !== a.id) go('#/me/data/alliances/' + encodeURIComponent(next.id), { replace: true });
      }} />`}
    ${plan && html`<${FormSheet} title=${plan.id ? 'Plan' : 'New plan'} initial=${toPlanForm(plan.p)} fields=${planFields} onClose=${() => setPlan(null)}
      onSave=${(x) => {
        const p = fromPlanForm(x, plan.p);
        if (p.id !== plan.id && a.plans.some((y) => y.id === p.id)) return `Plan id ${p.id} is already used.`;
        const problem = planProblem(p);
        if (problem) return problem;
        edit((b) => upsertAlliancePlan(b, a.id, p, plan.id)); saved();
      }}
      onDelete=${plan.id ? () => { edit((b) => deleteAlliancePlan(b, a.id, plan.id)); saved('Plan removed'); } : null}
      deleteMessage="The plan is removed from the working copy. Orders already saved keep the terms they were sold under." />`}
    ${confirm && html`<${Confirm} title="Delete this alliance?" message=${`${a.name} and its ${a.plans.length} plans are removed from the working copy.`}
      onConfirm=${() => { edit((b) => deleteAlliance(b, a.id)); toast('Alliance removed'); go('#/me/data/alliances', { replace: true }); }} onClose=${() => setConfirm(false)} />`}`;
}
