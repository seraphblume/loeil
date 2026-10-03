// GinAile components. Flat panels, hairlines, one indigo action per screen.

import { html, useState, useEffect, useRef } from './html.js';
import { Icon } from './icons.js';
import { back, linkProps } from './router.js';
import { dayToDate } from '../core/util.js';

export function Bar({ title, titleNode, backTo, backLabel = 'Back', lead, trail }) {
  return html`
    <header class="bar">
      <div class="lead">
        ${backTo ? html`<button class="bar-btn" onClick=${() => back(backTo)} aria-label="Back"><${Icon} name="chevL" /><span>${backLabel}</span></button>` : lead}
      </div>
      <div class="title">${titleNode ?? title}</div>
      <div class="trail">${trail}</div>
    </header>`;
}

export const Screen = ({ children, noTabs, class: cls = '' }) =>
  html`<main class=${'screen ' + (noTabs ? 'no-tabs ' : '') + cls}>${children}</main>`;

export const Eyebrow = ({ children, class: cls = '' }) => html`<div class=${'eyebrow ' + cls}>${children}</div>`;

export function ScreenTitle({ title, eyebrow, detail }) {
  return html`<div class="screen-title">
    ${eyebrow && html`<${Eyebrow}>${eyebrow}<//>`}
    <h1>${title}</h1>
    ${detail && html`<div class="detail">${detail}</div>`}
  </div>`;
}

/** One of the two places the serif is allowed: a single headline number. */
export const Figure = ({ value, caption, size = 40 }) => html`
  <div class="figure">
    <div class="value" style=${{ fontSize: size + 'px' }}>${value}</div>
    ${caption && html`<${Eyebrow}>${caption}<//>`}
  </div>`;

export const Wordmark = ({ size = 20 }) =>
  html`<span class="wordmark" style=${{ fontSize: size + 'px' }} aria-label="L’Œil">L’Œil</span>`;

export const Panel = ({ children, tight }) => html`<div class=${tight ? 'panel tight' : 'panel'}>${children}</div>`;

export const KV = ({ k, v, mono, em, lined }) => html`
  <div class=${'kv' + (lined ? ' lined' : '')}><span class="k">${k}</span><span class=${'v' + (mono ? ' mono sel' : '') + (em ? ' em' : '')}>${v}</span></div>`;

export const List = ({ children, flush }) => html`<div class=${flush ? 'list flush' : 'list'}>${children}</div>`;

/** A full-width row: a button, a link, or static. */
export function Row({ title, detail, sub, end, count, icon, chev, off, onClick, to, one, mono, children, avatar, badge }) {
  const inner = html`
    ${avatar}
    ${icon && html`<span class="ico"><${Icon} name=${icon} /></span>`}
    <span class="main">
      <span class=${'t' + (one ? ' one' : '')}>${title}${badge && html` <span class="inline-ico">${badge}</span>`}</span>
      ${detail && html`<span class=${'d' + (one ? ' one' : '') + (mono ? ' mono' : '')}>${detail}</span>`}
      ${sub && html`<span class="s">${sub}</span>`}
      ${children}
    </span>
    ${(end != null || count != null || chev) && html`<span class="end">
      ${end}${count != null && html`<span class="count">${count}</span>`}
      ${chev && html`<span class="chev"><${Icon} name="chevR" /></span>`}
    </span>`}`;
  const cls = 'row' + (off ? ' off' : '');
  if (to) return html`<a class=${cls} ...${linkProps(to)}>${inner}</a>`;
  if (onClick) return html`<button type="button" class=${cls} onClick=${onClick}>${inner}</button>`;
  return html`<div class=${cls}>${inner}</div>`;
}

export function Section({ title, children, flush, action }) {
  return html`<section class="gap-s">
    ${title && html`<div class=${flush ? '' : 'pad'} style="display:flex;justify-content:space-between;align-items:baseline"><${Eyebrow}>${title}<//>${action}</div>`}
    <${List} flush=${flush}>${children}<//>
  </section>`;
}

export const Flag = ({ children, icon = 'warning' }) => html`<div class="flag"><${Icon} name=${icon} /><div>${children}</div></div>`;

export const Empty = ({ title, children }) => html`<div class="empty"><h2>${title}</h2><p>${children}</p></div>`;

export const Anchor = ({ children, icon, onClick, disabled, type = 'button' }) =>
  html`<button type=${type} class="btn anchor" onClick=${onClick} disabled=${disabled}>${icon && html`<${Icon} name=${icon} />`}${children}</button>`;

export const Secondary = ({ children, icon, onClick, disabled, to, danger }) => to
  ? html`<a class="btn secondary" ...${linkProps(to)}>${icon && html`<${Icon} name=${icon} />`}${children}</a>`
  : html`<button type="button" class=${'btn secondary' + (danger ? ' danger' : '')} onClick=${onClick} disabled=${disabled}>${icon && html`<${Icon} name=${icon} />`}${children}</button>`;

export const Quiet = ({ children, icon, onClick, danger }) =>
  html`<button type="button" class=${'btn quiet' + (danger ? ' danger' : '')} onClick=${onClick}>${icon && html`<${Icon} name=${icon} />`}${children}</button>`;

export function Seg({ options, value, onChange, label }) {
  return html`<div class="seg" role="radiogroup" aria-label=${label}>
    ${options.map((o) => html`<button type="button" role="radio" aria-checked=${o.value === value} class=${o.value === value ? 'on' : ''} onClick=${() => onChange(o.value)}>${o.label}</button>`)}
  </div>`;
}

export function Stepper({ value, min = 1, max = 99, onChange, label }) {
  return html`<div class="stepper" aria-label=${label}>
    <span class="val">${value}</span>
    <span class="ctl">
      <button type="button" aria-label="Fewer" onClick=${() => onChange(Math.max(min, value - 1))}>−</button>
      <button type="button" aria-label="More" onClick=${() => onChange(Math.min(max, value + 1))}>+</button>
    </span>
  </div>`;
}

export const Toggle = ({ on, onChange, label }) =>
  html`<button type="button" role="switch" aria-checked=${on} aria-label=${label} class=${'toggle' + (on ? ' on' : '')} onClick=${() => onChange(!on)}></button>`;

export function SearchField({ value, onInput, placeholder, autofocus, icon = 'search' }) {
  const ref = useRef();
  useEffect(() => { if (autofocus) ref.current?.focus(); }, []);
  return html`<label class="field">
    <${Icon} name=${icon} />
    <input ref=${ref} type="search" enterkeyhint="search" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck=${false}
      placeholder=${placeholder} value=${value} onInput=${(e) => onInput(e.currentTarget.value)} />
    ${value && html`<button type="button" class="icon-btn" aria-label="Clear" onClick=${() => onInput('')}><${Icon} name="xcircle" /></button>`}
  </label>`;
}

/** A bottom sheet. Escape and the scrim close it. */
export function Sheet({ title, onClose, left, right, children, full }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, []);
  return html`<div class="scrim" onClick=${(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
    <div class=${'sheet' + (full ? ' full' : '')} role="dialog" aria-modal="true" aria-label=${title}>
      <div class="sheet-bar">
        <div class="l">${left ?? html`<button class="bar-btn" onClick=${onClose}>Cancel</button>`}</div>
        <div class="title">${title}</div>
        <div class="r">${right}</div>
      </div>
      <div class="sheet-body">${children}</div>
    </div>
  </div>`;
}

/** Destructive actions name their cost and ask once. */
export function Confirm({ title, message, action = 'Delete', onConfirm, onClose }) {
  return html`<${Sheet} title=${title} onClose=${onClose}>
    <div class="pad stack tight">
      <p class="para">${message}</p>
      <${Secondary} danger onClick=${() => { onConfirm(); onClose(); }}>${action}<//>
      <${Quiet} onClick=${onClose}>Cancel<//>
    </div>
  <//>`;
}

/** Copy to the clipboard, with a quiet confirmation in place. */
export function useCopy() {
  const [copied, setCopied] = useState(null);
  return [copied, async (text, id = text) => {
    try { await navigator.clipboard.writeText(text); setCopied(id); setTimeout(() => setCopied(null), 1400); } catch { /* not allowed */ }
  }];
}

export const daysAgo = (date) => {
  if (!date) return 'date unknown';
  const d = Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
  if (d < 0) return 'just now';
  if (d === 0) return 'today';
  if (d === 1) return 'yesterday';
  return `${d} days ago`;
};

const short = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const dayMonth = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
/** `2026-07-24` is a calendar day, not UTC midnight — never let it slip a day west. */
const asDate = (d) => (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? dayToDate(d) : new Date(d));
export const fmtDate = (d) => (d ? short.format(asDate(d)) : '—');
export const fmtDayMonth = (d) => (d ? dayMonth.format(asDate(d)) : '—');
