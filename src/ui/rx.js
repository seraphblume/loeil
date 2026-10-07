// Prescriptions in and out.
//
// THE ENTRY IS THE REGISTER'S: each eye in its own panel, every value a slider
// with its figure beside it to type, and the same limits the POS takes — so
// what is typed here goes into the register without a second thought.
// Typing is the fast way in; the slider is there to see the value and to nudge.

import { html, useState, useRef, useEffect } from './html.js';
import { Eyebrow, Toggle, Seg, Sheet, Anchor, Quiet, fmtDate } from './kit.js';
import { Icon } from './icons.js';
import { useApp, useResolvedDraft } from './hooks.js';
import {
  RX_LIMITS, PRISM_BASES, snap, monoPd, hasPrism, blankRx, blankEye, blankContactRx, rxIsBlank, contactIsBlank,
  validity, VALIDITY_LABEL, warningIcon, expiresOn, issuedDate, needsAddition, pd,
} from '../core/crm.js';
import { aobLenses, lineText } from '../core/orders.js';
import { isoDay } from '../core/util.js';
import { setDraftRx, setDraftAob, upsertClient, clientById, toast } from '../state/app.js';

// ---------------------------------------------------------------------------
// Figures

const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

/** How each kind of value is written: the way an optometrist writes it. */
export const FORMAT = {
  sphere: (v) => (Number(v) === 0 ? '0.00' : (v > 0 ? '+' : '−') + Math.abs(v).toFixed(2)),
  cylinder: (v) => (Number(v) === 0 ? '0.00' : '−' + Math.abs(v).toFixed(2)),
  axis: (v) => String(Math.round(v)),
  pd: (v) => Number(v).toFixed(1),
  addition: (v) => (Number(v) === 0 ? '0.00' : '+' + Math.abs(v).toFixed(2)),
  prism: (v) => Number(v).toFixed(2),
  aob: (v) => String(Math.round(v)),
};

/** What he typed → the value. A sphere typed without a sign keeps the sign shown. */
function parse(kind, text, current) {
  const t = String(text).trim().replace(',', '.').replace('−', '-');
  if (t === '') return kind === 'pd' || kind === 'aob' ? null : 0;
  const n = Number(t);
  if (!Number.isFinite(n)) return current;
  let v = n;
  if (kind === 'sphere' && !/^[+-]/.test(t)) v = (Number(current) > 0 ? 1 : -1) * Math.abs(n);
  if (kind === 'cylinder') v = -Math.abs(n);
  if (kind === 'addition' || kind === 'prism') v = Math.abs(n);
  return snap(v, RX_LIMITS[kind]);
}

// ---------------------------------------------------------------------------
// One value: label, slider, figure.

export function RxSlider({ kind, label, value, onChange, eye, unit }) {
  const L = RX_LIMITS[kind];
  const empty = value === null || value === undefined;
  const v = empty ? L.min : Number(value);
  const [text, setText] = useState(null); // non-null while he is typing
  const shown = text ?? (empty ? '' : FORMAT[kind](v));
  const frac = (x) => (Math.min(L.max, Math.max(L.min, x)) - L.min) / (L.max - L.min);
  // The fill runs from zero when zero is on the scale (sphere, cylinder, axis), else from the start.
  const origin = L.min < 0 && L.max >= 0 ? 0 : L.min;
  const a = Math.min(frac(origin), frac(v));
  const b = Math.max(frac(origin), frac(v));
  const commit = () => { if (text !== null) { onChange(parse(kind, text, value)); setText(null); } };
  const flip = () => onChange(snap(-Number(value || 0), L));
  const id = `${eye}-${kind}`;
  return html`<div class=${'rxs' + (empty ? ' empty' : '')}>
    <label class="rxs-k" for=${id}>${label}</label>
    <div class="rxs-track">
      <input type="range" min=${L.min} max=${L.max} step=${L.step} value=${v}
        aria-label=${`${eye === 'od' ? 'Right' : 'Left'} eye ${label}`}
        style=${{ '--a': a, '--b': b }}
        onInput=${(e) => onChange(snap(e.currentTarget.value, L))} />
      <div class="rxs-scale" aria-hidden="true">
        ${(L.ticks ?? [L.min, origin !== L.min ? origin : null, L.max].filter((x) => x !== null)).map((t) => html`<span style=${{ left: `calc(var(--thumb) / 2 + (100% - var(--thumb)) * ${frac(t)})` }}>${t > 0 && L.min < 0 ? '+' + t : t}</span>`)}
      </div>
    </div>
    <div class="rxs-v">
      <input id=${id} class="rxs-in" inputmode="decimal" enterkeyhint="done" autocomplete="off" value=${shown} placeholder="—"
        onFocus=${(e) => { setText(shown); requestAnimationFrame(() => e.currentTarget?.select?.()); }}
        onInput=${(e) => setText(e.currentTarget.value)}
        onBlur=${commit}
        onKeyDown=${(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }} />
      ${unit && html`<span class="rxs-unit">${unit}</span>`}
      ${kind === 'sphere' && html`<button type="button" class="rxs-sign" aria-label=${`Flip the sign of the ${eye === 'od' ? 'right' : 'left'} sphere`} onClick=${flip}>±</button>`}
    </div>
  </div>`;
}

// ---------------------------------------------------------------------------
// The glasses prescription

const SIDE = { od: { title: 'Right eye', short: 'OD' }, os: { title: 'Left eye', short: 'OS' } };

function EyePanel({ side, rx, onEye, onPd, prisms, addition }) {
  const eye = rx[side] ?? blankEye();
  const set = (k) => (v) => onEye(side, { ...eye, [k]: v });
  const prism = eye.prism ?? { amount: 0, base: 'in' };
  return html`<section class="rx-eye">
    <header><span>${SIDE[side].title}</span><b>${SIDE[side].short}</b></header>
    <div class="rx-eye-body">
      <${RxSlider} kind="sphere" label="SPH" eye=${side} value=${eye.sphere} onChange=${set('sphere')} />
      <${RxSlider} kind="cylinder" label="CYL" eye=${side} value=${eye.cylinder} onChange=${set('cylinder')} />
      <${RxSlider} kind="axis" label="AXIS" eye=${side} value=${eye.axis} onChange=${set('axis')} unit="°" />
      ${addition && html`<${RxSlider} kind="addition" label="ADD" eye=${side} value=${eye.addition} onChange=${set('addition')} />`}
      <${RxSlider} kind="pd" label="PD" eye=${side} value=${monoPd(rx, side)} onChange=${(v) => onPd(side, v)} unit="mm" />
      ${prisms && html`
        <${RxSlider} kind="prism" label="PRISM" eye=${side} value=${prism.amount} unit="Δ"
          onChange=${(v) => onEye(side, { ...eye, prism: { ...prism, amount: v } })} />
        <div class="rxs rxs-base"><span class="rxs-k">BASE</span>
          <${Seg} small label=${`${SIDE[side].title} prism base`} value=${prism.base} options=${PRISM_BASES}
            onChange=${(base) => onEye(side, { ...eye, prism: { ...prism, base } })} />
        </div>`}
    </div>
  </section>`;
}

/**
 * Both eyes, the prism switch, and (when asked) the issue date.
 * `addition` false leaves ADD out (contact lenses carry one figure for both).
 */
export function RxEntry({ rx, onChange, dated, addition = true }) {
  const [prisms, setPrisms] = useState(() => hasPrism(rx));
  const onEye = (side, eye) => onChange({ ...rx, [side]: eye });
  // DNP is per eye. A binocular PD on file splits into halves the moment one eye is set.
  const onPd = (side, v) => {
    const other = side === 'od' ? 'os' : 'od';
    onChange({
      ...rx, pdFarMM: null,
      [side]: { ...rx[side], pdFar: v },
      [other]: { ...rx[other], pdFar: rx[other]?.pdFar ?? monoPd(rx, other) },
    });
  };
  const togglePrisms = (on) => {
    setPrisms(on);
    if (!on) onChange({ ...rx, od: { ...rx.od, prism: null }, os: { ...rx.os, prism: null } });
  };
  const exp = expiresOn(rx);
  return html`<div class="rx-entry">
    <div class="group">
      ${dated && html`<label class="cell">
        <span class="k">Issued</span>
        <input type="date" value=${rx.issuedOn ?? ''} max=${isoDay(new Date())} onInput=${(e) => onChange({ ...rx, issuedOn: e.currentTarget.value || null })} />
      </label>
      <div class="cell"><span class="k">Expires</span><span class="v muted">${exp ? fmtDate(exp) : 'Set the issue date'}</span></div>`}
      <div class="cell"><span class="k">Add prisms</span><${Toggle} on=${prisms} onChange=${togglePrisms} label="Add prisms" /></div>
    </div>
    <div class="rx-eyes">
      <${EyePanel} side="od" rx=${rx} onEye=${onEye} onPd=${onPd} prisms=${prisms} addition=${addition} />
      <${EyePanel} side="os" rx=${rx} onEye=${onEye} onPd=${onPd} prisms=${prisms} addition=${addition} />
    </div>
    <p class="note pad-in">Type a value or slide to it. A sphere typed without a sign keeps the one shown — ± flips it. Cylinder is always minus.</p>
  </div>`;
}

// ---------------------------------------------------------------------------
// Contact lenses

const MODALITIES = [{ value: 'Daily', label: 'Daily' }, { value: 'Monthly', label: 'Monthly' }, { value: 'Annual', label: 'Annual' }];

export function ContactRxEntry({ cl, onChange, brands = [] }) {
  const set = (side, k) => (v) => onChange({ ...cl, [side]: { ...cl[side], [k]: v } });
  return html`<div class="rx-entry">
    <div class="group">
      <label class="cell"><span class="k">Brand</span>
        <input list="cl-brands" value=${cl.brand} placeholder="e.g. Air Optix" autocomplete="off" onInput=${(e) => onChange({ ...cl, brand: e.currentTarget.value })} />
      </label>
      <datalist id="cl-brands">${brands.map((b) => html`<option value=${b} />`)}</datalist>
      <div class="cell"><span class="k">Replaced</span>
        <${Seg} small label="Modality" value=${cl.modality} options=${MODALITIES} onChange=${(m) => onChange({ ...cl, modality: m })} />
      </div>
      <label class="cell"><span class="k">Issued</span>
        <input type="date" value=${cl.issuedOn ?? ''} max=${isoDay(new Date())} onInput=${(e) => onChange({ ...cl, issuedOn: e.currentTarget.value || null })} />
      </label>
    </div>
    <div class="rx-eyes">
      ${['od', 'os'].map((side) => html`<section class="rx-eye" key=${side}>
        <header><span>${SIDE[side].title}</span><b>${SIDE[side].short}</b></header>
        <div class="rx-eye-body">
          <${RxSlider} kind="sphere" label="SPH" eye=${'cl-' + side} value=${cl[side].sphere} onChange=${set(side, 'sphere')} />
          <${RxSlider} kind="cylinder" label="CYL" eye=${'cl-' + side} value=${cl[side].cylinder} onChange=${set(side, 'cylinder')} />
          <${RxSlider} kind="axis" label="AXIS" eye=${'cl-' + side} value=${cl[side].axis} onChange=${set(side, 'axis')} unit="°" />
        </div>
      </section>`)}
    </div>
    <div class="group">
      <div class="cell cell-slider"><${RxSlider} kind="addition" label="ADD" eye="cl" value=${cl.addition} onChange=${(v) => onChange({ ...cl, addition: v })} /></div>
    </div>
  </div>`;
}

// ---------------------------------------------------------------------------
// Reading one: a small table, the way the form and the register write it.

function RxTable({ cols, rows }) {
  return html`<table class="rx-table">
    <thead><tr><th></th>${cols.map((c) => html`<th>${c}</th>`)}</tr></thead>
    <tbody>${rows.map((r) => html`<tr><th>${r[0]}</th>${r.slice(1).map((v) => html`<td class=${v === '—' ? 'nil' : ''}>${v}</td>`)}</tr>`)}</tbody>
  </table>`;
}

export function RxCard({ rx, onEdit, title = 'Glasses' }) {
  const v = validity(rx);
  const icon = warningIcon(rx);
  const exp = expiresOn(rx);
  const issued = issuedDate(rx);
  const add = needsAddition(rx);
  const prism = hasPrism(rx);
  const near = pd(rx, true);
  const cols = ['SPH', 'CYL', 'AXIS', ...(add ? ['ADD'] : []), 'PD'];
  const row = (side) => {
    const e = rx[side];
    const dnp = monoPd(rx, side);
    return [SIDE[side].short, FORMAT.sphere(Number(e.sphere)), Number(e.cylinder) ? FORMAT.cylinder(Number(e.cylinder)) : '—',
      Number(e.cylinder) ? FORMAT.axis(Number(e.axis)) + '°' : '—', ...(add ? [Number(e.addition) ? FORMAT.addition(Number(e.addition)) : '—'] : []),
      dnp ? FORMAT.pd(dnp) : '—'];
  };
  return html`<section class="gap-s">
    <div class="group-head"><${Eyebrow}>${title}<//>
      ${v !== 'unknown' && !rxIsBlank(rx) && html`<span class=${'pill' + (v === 'valid' ? '' : ' alert')}>${icon && html`<${Icon} name=${icon} />`}${VALIDITY_LABEL[v]}</span>`}
    </div>
    <button type="button" class="group rx-card" onClick=${onEdit} disabled=${!onEdit}>
      ${rxIsBlank(rx) ? html`<div class="cell"><span class="muted">No prescription on file</span>${onEdit && html`<span class="chev"><${Icon} name="chevR" /></span>`}</div>` : html`
        <div class="rx-card-in">
          <${RxTable} cols=${cols} rows=${[row('od'), row('os')]} />
          ${prism && html`<div class="rx-foot">${['od', 'os'].filter((s) => rx[s].prism?.amount).map((s) => `${SIDE[s].short} prism ${FORMAT.prism(rx[s].prism.amount)}Δ base ${rx[s].prism.base}`).join(' · ')}</div>`}
          <div class="rx-foot">
            ${[issued && `Issued ${fmtDate(issued)}`, exp && `Expires ${fmtDate(exp)}`, rx.pdFarMM && `PD ${FORMAT.pd(rx.pdFarMM)} mm`, near && `Near ${FORMAT.pd(near)} mm`].filter(Boolean).join(' · ')}
          </div>
        </div>`}
    </button>
  </section>`;
}

export function ContactRxCard({ cl, onEdit }) {
  if (contactIsBlank(cl)) return null;
  const row = (side) => [SIDE[side].short, FORMAT.sphere(Number(cl[side].sphere)),
    Number(cl[side].cylinder) ? FORMAT.cylinder(Number(cl[side].cylinder)) : '—', Number(cl[side].cylinder) ? FORMAT.axis(Number(cl[side].axis)) + '°' : '—'];
  return html`<section class="gap-s">
    <div class="group-head"><${Eyebrow}>Contact lenses<//></div>
    <button type="button" class="group rx-card" onClick=${onEdit} disabled=${!onEdit}>
      <div class="rx-card-in">
        ${(cl.brand || cl.modality) && html`<div class="rx-brand">${cl.brand || 'Brand not set'}${cl.modality && html`<span class="muted"> · ${cl.modality}</span>`}</div>`}
        <${RxTable} cols=${['SPH', 'CYL', 'AXIS']} rows=${[row('od'), row('os')]} />
        <div class="rx-foot">${[Number(cl.addition) ? `ADD ${FORMAT.addition(Number(cl.addition))}` : null, cl.issuedOn && `Issued ${fmtDate(cl.issuedOn)}`].filter(Boolean).join(' · ')}</div>
      </div>
    </button>
  </section>`;
}

/** One line for a row: `OD −2.25 −1.00 × 175 · OS −2.75`. */
export function rxSummary(rx) {
  if (!rx || rxIsBlank(rx)) return null;
  const eye = (e) => [FORMAT.sphere(Number(e.sphere)), Number(e.cylinder) ? `${FORMAT.cylinder(Number(e.cylinder))} × ${Math.round(e.axis)}°` : null].filter(Boolean).join(' ');
  return `OD ${eye(rx.od)} · OS ${eye(rx.os)}`;
}

// ---------------------------------------------------------------------------
// On the order: the prescription the job is made to, then the measurements its
// lenses ask for — the register's own two steps.

const copy = (x) => JSON.parse(JSON.stringify(x));

export function OrderRxSheet({ onClose, start = 'rx' }) {
  const order = useResolvedDraft();
  const catalogue = useApp((s) => s.catalogue);
  const client = useApp((s) => clientById(s.draft.clientId, s));
  const draftRx = useApp((s) => s.draftRx);
  const [rx, setRx] = useState(() => {
    const r = copy(draftRx ?? client?.prescription ?? blankRx());
    if (!r.issuedOn && rxIsBlank(r)) r.issuedOn = isoDay(new Date());
    return r;
  });
  const lenses = aobLenses(order, catalogue);
  const measures = lenses.length > 0;
  const [step, setStep] = useState(measures ? start : 'rx');
  const [aob, setAob] = useState(() => ({ od: order.aob?.od ?? RX_LIMITS.aob.min, os: order.aob?.os ?? RX_LIMITS.aob.min }));
  const [toClient, setToClient] = useState(Boolean(client));
  const body = useRef();
  useEffect(() => { body.current?.closest('.sheet-body')?.scrollTo({ top: 0 }); }, [step]);

  const finish = async () => {
    await setDraftRx(rx);
    if (toClient && client) await upsertClient({ ...client, prescription: rx });
    if (measures) await setDraftAob(aob);
    toast(measures ? 'Prescription and AOB on the order' : 'Prescription on the order');
    onClose();
  };
  const steps = [{ id: 'rx', label: 'Prescription' }, ...(measures ? [{ id: 'aob', label: 'Measurements' }] : [])];
  const at = steps.findIndex((s) => s.id === step);

  return html`<${Sheet} title="Prescription" onClose=${onClose} full>
    <div class="stack tight" ref=${body}>
      ${steps.length > 1 && html`<ol class="steps-bar" style=${{ '--n': steps.length, '--i': at }}>
        ${steps.map((s, i) => html`<li class=${i <= at ? 'on' : ''}><button type="button" onClick=${() => setStep(s.id)}>${s.label}</button></li>`)}
      </ol>`}
      ${step === 'rx' ? html`
        <div class="pad"><${RxEntry} rx=${rx} onChange=${setRx} dated /></div>
        ${client && html`<div class="pad"><div class="group">
          <div class="cell"><span class="k">Save to ${client.name.split(' ')[0]}’s record</span><${Toggle} on=${toClient} onChange=${setToClient} label="Save to the client" /></div>
        </div></div>`}
      ` : html`
        <div class="pad stack tight rx-entry">
          <p class="para">The lenses on this order ask for the AOB of each eye.</p>
          <div class="group">${lenses.map((l) => html`<div class="cell"><span class="t">${lineText(l)}</span></div>`)}</div>
          <div class="rx-eyes">
            ${['od', 'os'].map((side) => html`<section class="rx-eye" key=${side}>
              <header><span>${SIDE[side].title}</span><b>${SIDE[side].short}</b></header>
              <div class="rx-eye-body"><${RxSlider} kind="aob" label="AOB" eye=${side} value=${aob[side]} onChange=${(v) => setAob({ ...aob, [side]: v })} unit="mm" /></div>
            </section>`)}
          </div>
        </div>`}
      <div class="pad confirm-foot">
        <p class="note">${step === 'rx' ? 'Is the prescription correct?' : 'Are the measurements correct?'}</p>
        ${step === 'rx' && measures
          ? html`<${Anchor} onClick=${() => setStep('aob')}>Yes, on to the measurements<//>`
          : html`<${Anchor} onClick=${finish}>${step === 'rx' ? 'Yes, use this prescription' : 'Yes, finish'}<//>`}
        ${step === 'aob' && html`<${Quiet} onClick=${() => setStep('rx')}>Edit the prescription<//>`}
      </div>
    </div>
  <//>`;
}

/** The editor for a client's record: glasses, and contact lenses when he adds them. */
export function ClientRxSheet({ client, kind = 'glasses', onClose }) {
  const catalogue = useApp((s) => s.catalogue);
  const [rx, setRx] = useState(() => copy(client.prescription ?? blankRx()));
  const [cl, setCl] = useState(() => copy(client.contactRx ?? blankContactRx()));
  const brands = [...new Set(catalogue.contact.map((r) => r.product?.label).filter(Boolean))];
  const save = async () => {
    await upsertClient(kind === 'glasses' ? { ...client, prescription: rx } : { ...client, contactRx: contactIsBlank(cl) ? null : cl });
    toast('Prescription saved');
    onClose();
  };
  return html`<${Sheet} title=${kind === 'glasses' ? 'Glasses' : 'Contact lenses'} onClose=${onClose} full
    right=${html`<button class="bar-btn strong" onClick=${save}>Save</button>`}>
    <div class="pad stack tight">
      ${kind === 'glasses' ? html`<${RxEntry} rx=${rx} onChange=${setRx} dated />` : html`<${ContactRxEntry} cl=${cl} onChange=${setCl} brands=${brands} />`}
      <${Anchor} onClick=${save}>Save<//>
    </div>
  <//>`;
}

