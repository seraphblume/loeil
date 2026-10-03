// One form sheet for every record the data editor touches. Fields are declared,
// not hand-built, so a new column is one line where it is used.
//
// Field types: text, number, money (held as centavos), select, toggle, date, textarea.

import { html, useState } from '../html.js';
import { Sheet, Eyebrow, Anchor, Quiet, Confirm, Toggle } from '../kit.js';

const pesos = (cents) => (cents == null || cents === '' ? '' : String(Math.round(cents) / 100));

function initialText(f, v) {
  if (f.type === 'money') return pesos(v);
  if (f.type === 'toggle') return Boolean(v);
  return v == null ? '' : String(v);
}

function parse(f, t) {
  if (f.type === 'money') { const n = Number(String(t).replace(/[^\d.]/g, '')); return t === '' || !Number.isFinite(n) ? null : Math.round(n * 100); }
  if (f.type === 'number') { const n = Number(String(t).replace(',', '.')); return t === '' || !Number.isFinite(n) ? null : n; }
  if (f.type === 'toggle') return Boolean(t);
  return String(t).trim();
}

export function FormSheet({ title, fields, initial = {}, onSave, onDelete, deleteLabel = 'Delete', deleteMessage, onClose, saveLabel = 'Save', intro }) {
  const [vals, setVals] = useState(() => Object.fromEntries(fields.map((f) => [f.key, initialText(f, initial[f.key])])));
  const [error, setError] = useState(null);
  const [confirm, setConfirm] = useState(false);
  const set = (k, v) => setVals((x) => ({ ...x, [k]: v }));

  const save = (e) => {
    e?.preventDefault();
    const out = {};
    for (const f of fields) {
      out[f.key] = parse(f, vals[f.key]);
      if (f.required && (out[f.key] === '' || out[f.key] == null)) { setError(`${f.label} is required.`); return; }
    }
    const problem = onSave(out);
    if (typeof problem === 'string') { setError(problem); return; }
    onClose();
  };

  if (confirm) {
    return html`<${Confirm} title=${`${deleteLabel}?`} message=${deleteMessage ?? 'This is removed from the working copy. Nothing changes on any phone until you publish.'}
      action=${deleteLabel} onConfirm=${() => { onDelete(); }} onClose=${onClose} />`;
  }

  const groups = [];
  for (const f of fields) {
    const g = f.group ?? '';
    if (!groups.length || groups[groups.length - 1].name !== g) groups.push({ name: g, fields: [] });
    groups[groups.length - 1].fields.push(f);
  }

  return html`<${Sheet} title=${title} onClose=${onClose} full right=${html`<button class="bar-btn" style="font-weight:500" onClick=${save}>${saveLabel}</button>`}>
    <form class="pad form" onSubmit=${save}>
      ${intro && html`<p class="para">${intro}</p>`}
      ${groups.map((g) => html`<div class="form-group">
        ${g.name && html`<${Eyebrow}>${g.name}<//>`}
        ${g.fields.map((f) => html`<${Field} f=${f} value=${vals[f.key]} onChange=${(v) => set(f.key, v)} />`)}
      </div>`)}
      ${fields.some((f) => f.hint) && html`<div class="gap-s">${fields.filter((f) => f.hint).map((f) => html`<p class="note"><strong style="font-weight:500">${f.label}:</strong> ${f.hint}</p>`)}</div>`}
      ${error && html`<p class="para" role="alert">${error}</p>`}
      <${Anchor} type="submit">${saveLabel}<//>
      ${onDelete && html`<${Quiet} danger onClick=${() => setConfirm(true)}>${deleteLabel}<//>`}
    </form>
  <//>`;
}

function Field({ f, value, onChange }) {
  if (f.type === 'toggle') {
    return html`<div class="form-row"><span class="k">${f.label}</span><${Toggle} label=${f.label} on=${value} onChange=${onChange} /></div>`;
  }
  if (f.type === 'select') {
    const opts = f.options.some((o) => String(o.value) === String(value)) || value === '' ? f.options : [{ value, label: value }, ...f.options];
    return html`<label class="form-row"><span class="k">${f.label}</span>
      <select value=${value} onChange=${(e) => onChange(e.currentTarget.value)}>
        ${opts.map((o) => html`<option value=${o.value}>${o.label}</option>`)}
      </select></label>`;
  }
  if (f.type === 'textarea') {
    return html`<label class="field" style="margin-top:6px"><textarea rows="3" placeholder=${f.label} value=${value} onInput=${(e) => onChange(e.currentTarget.value)}></textarea></label>`;
  }
  const listId = f.suggest ? `dl-${f.key}` : null;
  return html`<label class="form-row"><span class="k">${f.label}</span>
    ${f.type === 'money' && html`<span class="muted">$</span>`}
    <input type=${f.type === 'date' ? 'date' : 'text'} list=${listId}
      inputmode=${f.type === 'money' || f.type === 'number' ? 'decimal' : f.inputmode ?? 'text'}
      autocapitalize=${f.caps ? 'characters' : 'off'} autocomplete="off" spellcheck=${false}
      placeholder=${f.placeholder ?? ''} value=${value} onInput=${(e) => onChange(e.currentTarget.value)} />
    ${listId && html`<datalist id=${listId}>${f.suggest.map((s) => html`<option value=${s} />`)}</datalist>`}
  </label>`;
}
