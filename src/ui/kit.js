// Components in the shape of iOS, in paper and ink: inset grouped lists, large
// titles that hand over to the bar as they scroll away, glass for the
// navigation layer only, one strong action per screen in the opposite tone.

import { html, render, useState, useEffect, useRef, useLayoutEffect } from './html.js';
import { Icon } from './icons.js';
import { makerLogo } from './logos.js';
import { back, linkProps } from './router.js';
import { dayToDate } from '../core/util.js';
import { tr, dateFmt } from '../i18n.js';

/**
 * The navigation bar. With `large`, the screen carries the title as a large
 * heading and the bar shows it only once that heading has scrolled under it.
 */
export function Bar({ title, titleNode, backTo, lead, trail, large }) {
  const ref = useRef();
  const [compact, setCompact] = useState(!large);
  useEffect(() => {
    if (!large || !window.IntersectionObserver) { setCompact(true); return undefined; }
    const bar = ref.current;
    const heading = bar?.parentElement?.querySelector('.large-title, .screen-title h1');
    if (!heading) { setCompact(true); return undefined; }
    const io = new IntersectionObserver(([e]) => setCompact(!e.isIntersecting), { rootMargin: `-${bar.offsetHeight}px 0px 0px 0px` });
    io.observe(heading);
    return () => io.disconnect();
  }, [large, title]);
  return html`
    <header class=${'bar' + (large ? ' large' : '') + (compact ? ' compact' : '')} ref=${ref}>
      <div class="lead">
        ${backTo ? html`<button class="bar-btn round" onClick=${() => back(backTo)} aria-label=${tr('Back')}><${Icon} name="chevL" /></button>` : lead}
      </div>
      <div class="title">${titleNode ?? title}</div>
      <div class="trail">${trail}</div>
    </header>`;
}

/** The large heading of a tab's first screen, as iOS sets it. */
export const LargeTitle = ({ children, detail }) => html`<div class="large-head"><h1 class="large-title">${children}</h1>${detail && html`<div class="detail">${detail}</div>`}</div>`;

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

/**
 * A figure whose digits roll into place, like a subscriber counter. The first
 * time the app shows one they spin up from zero, each digit a little later
 * than the one to its left; after that a change rolls each digit forward to
 * its new value. Commas, the sign and the point stay still.
 */
const DIGITS = '0123456789';
const TURNS = 6;                       // 0–9 six times over: room to roll forward
const REST = 20;                       // where a digit sits between rolls (third turn)
const STRIP = Array.from({ length: TURNS * 10 }, (_, i) => i % 10);
const stillMotion = () => Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
let rolledOnce = false;

export function Odometer({ value }) {
  const text = String(value ?? '');
  const chars = [...text];
  const rest = () => chars.map((ch) => (DIGITS.includes(ch) ? REST + Number(ch) : null));
  const first = !rolledOnce && !stillMotion();
  const [pos, setPos] = useState(() => (first ? chars.map((ch) => (DIGITS.includes(ch) ? 0 : null)) : rest()));
  const [moving, setMoving] = useState(false);
  const [entry, setEntry] = useState(first);
  const last = useRef(text);
  const timer = useRef(null);
  const digits = chars.filter((ch) => DIGITS.includes(ch)).length;

  // Once a roll ends, every digit settles back on the resting turn without moving.
  const settleAfter = (ms) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { setMoving(false); setEntry(false); setPos(rest()); }, ms + 60);
  };

  useEffect(() => {
    if (!first) { rolledOnce = true; return undefined; }
    const id = requestAnimationFrame(() => requestAnimationFrame(() => {
      setMoving(true); setPos(rest()); rolledOnce = true; settleAfter(entryMs(digits - 1));
    }));
    return () => { cancelAnimationFrame(id); clearTimeout(timer.current); };
  }, []);

  useEffect(() => {
    if (last.current === text) return;
    const before = last.current;
    last.current = text;
    if (stillMotion() || [...before].length !== chars.length) { clearTimeout(timer.current); setMoving(false); setEntry(false); setPos(rest()); return; }
    setEntry(false);
    setMoving(true);
    setPos((p) => chars.map((ch, i) => {
      if (!DIGITS.includes(ch)) return null;
      const from = p[i] ?? REST;
      return from + ((Number(ch) - (from % 10) + 10) % 10);  // always forward
    }));
    settleAfter(CHANGE_MS);
  }, [text]);

  let k = 0;
  return html`<span class="odo" role="text" aria-label=${text}>
    ${chars.map((ch, i) => {
      if (pos[i] == null || !DIGITS.includes(ch)) return html`<span class="odo-c" aria-hidden="true">${ch}</span>`;
      const ms = entry ? entryMs(k++) : CHANGE_MS;
      return html`<span class="odo-d" aria-hidden="true"><span class="odo-s"
        style=${{ transform: `translateY(calc(${-pos[i]} * var(--odo-h)))`, transition: moving ? `transform ${ms}ms cubic-bezier(.16, 1, .3, 1)` : 'none' }}>
        ${STRIP.map((d) => html`<span>${d}</span>`)}</span></span>`;
    })}
  </span>`;
}
const entryMs = (order) => 900 + order * 110;
const CHANGE_MS = 650;

export const Wordmark = ({ size = 20 }) =>
  html`<span class="wordmark" style=${{ fontSize: size + 'px' }} aria-label="L’Œil">L’Œil</span>`;

export const Panel = ({ children, tight }) => html`<div class=${tight ? 'panel tight' : 'panel'}>${children}</div>`;

export const KV = ({ k, v, mono, em, lined }) => html`
  <div class=${'kv' + (lined ? ' lined' : '')}><span class="k">${k}</span><span class=${'v' + (mono ? ' mono sel' : '') + (em ? ' em' : '')}>${v}</span></div>`;

export const List = ({ children, flush }) => html`<div class=${flush ? 'list flush' : 'list'}>${children}</div>`;

/** A full-width row: a button, a link, or static. */
export function Row({ title, detail, sub, end, count, icon, chev, off, onClick, to, one, mono, children, avatar, badge, on }) {
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
  const cls = 'row' + (off ? ' off' : '') + (on ? ' on' : '');
  if (to) return html`<a class=${cls} ...${linkProps(to)} aria-current=${on ? 'true' : null}>${inner}</a>`;
  if (onClick) return html`<button type="button" class=${cls} onClick=${onClick}>${inner}</button>`;
  return html`<div class=${cls}>${inner}</div>`;
}

export function Section({ title, children, flush, action, footer }) {
  return html`<section class="section">
    ${title && html`<div class="section-head"><${Eyebrow}>${title}<//>${action}</div>`}
    <${List} flush=${flush}>${children}<//>
    ${footer && html`<p class="section-foot">${footer}</p>`}
  </section>`;
}

/** The maker's badge beside a product name: the maker's own logo where there is one
 * (Essilor, in its blue), else the name typeset (`ESSILOR`). */
export function Maker({ name }) {
  if (!name) return null;
  const logo = makerLogo(name);
  if (!logo) return html`<span class="maker" title=${`Made by ${name}`}>${name}</span>`;
  return html`<svg class="maker-logo" viewBox=${`0 0 ${logo.w} ${logo.h}`} style=${{ '--ar': logo.w / logo.h }} role="img" aria-label=${name}>
    <title>${tr('Made by {a}', { a: name })}</title><path fill="currentColor" fill-rule="evenodd" d=${logo.d} />
  </svg>`;
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

/** The segmented control: a thumb that slides to the choice. */
export function Seg({ options, value, onChange, label, small }) {
  const i = options.findIndex((o) => o.value === value);
  return html`<div class=${'seg' + (small ? ' small' : '')} role="radiogroup" aria-label=${label} style=${{ '--n': options.length, '--i': Math.max(0, i) }}>
    ${i >= 0 && html`<i class="thumb" aria-hidden="true"></i>`}
    ${options.map((o) => html`<button type="button" role="radio" aria-checked=${o.value === value} class=${o.value === value ? 'on' : ''} onClick=${() => onChange(o.value)}>${o.label}</button>`)}
  </div>`;
}

export function Stepper({ value, min = 1, max = 99, onChange, label }) {
  return html`<div class="stepper" aria-label=${label}>
    <span class="val">${value}</span>
    <span class="ctl">
      <button type="button" aria-label=${tr('Fewer')} onClick=${() => onChange(Math.max(min, value - 1))}>−</button>
      <button type="button" aria-label=${tr('More')} onClick=${() => onChange(Math.min(max, value + 1))}>+</button>
    </span>
  </div>`;
}

export const Toggle = ({ on, onChange, label }) =>
  html`<button type="button" role="switch" aria-checked=${on} aria-label=${label} class=${'toggle' + (on ? ' on' : '')} onClick=${() => onChange(!on)}></button>`;

export function SearchField({ value, onInput, placeholder, autofocus, icon = 'search' }) {
  const ref = useRef();
  useEffect(() => { if (autofocus) ref.current?.focus(); }, []);
  return html`<label class="field search">
    <${Icon} name=${icon} />
    <input ref=${ref} type="search" enterkeyhint="search" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck=${false}
      placeholder=${placeholder} value=${value} onInput=${(e) => onInput(e.currentTarget.value)} />
    ${value && html`<button type="button" class="icon-btn" aria-label=${tr('Clear')} onClick=${() => onInput('')}><${Icon} name="xcircle" /></button>`}
  </label>`;
}

/**
 * Its children, rendered at the end of the page rather than where it stands.
 * On an iPad or a computer the list is a scrolling pane of its own, and a sheet
 * opened from it was clipped to that pane; from here it covers the whole window.
 */
function Portal({ children }) {
  const host = useRef(null);
  if (!host.current) host.current = document.createElement('div');
  useLayoutEffect(() => {
    const el = host.current;
    document.body.appendChild(el);
    return () => { render(null, el); el.remove(); };
  }, []);
  useLayoutEffect(() => { render(children, host.current); });
  return null;
}

/**
 * A bottom sheet. Escape, the scrim, or a pull down on its bar close it.
 *
 * Every way a sheet can close — Cancel, a choice made inside it, the parent
 * moving on — ends the same way: as the sheet leaves the tree, a copy of it
 * slides down and the scrim fades, so nothing ever just vanishes.
 */
export function Sheet({ title, onClose, left, right, children, full }) {
  const ref = useRef();
  const drag = useRef(null);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, []);
  useLayoutEffect(() => () => leaveGracefully(ref.current), []);

  // Pull to dismiss: follows the finger, with friction upward; a flick is enough.
  const down = (e) => {
    if (drag.current || e.button > 0) return;
    if (e.target.closest('button, a, input, select, textarea')) return;
    drag.current = { y: e.clientY, t: performance.now(), dy: 0, id: e.pointerId };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const move = (e) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    const raw = e.clientY - d.y;
    d.dy = raw < 0 ? -Math.sqrt(-raw) * 2 : raw;
    const sheet = ref.current?.firstElementChild;
    if (sheet) { sheet.style.transition = 'none'; sheet.style.transform = `translateY(${d.dy}px)`; }
  };
  const up = (e) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    drag.current = null;
    const sheet = ref.current?.firstElementChild;
    const velocity = d.dy / Math.max(1, performance.now() - d.t);
    if (d.dy > 110 || (d.dy > 12 && velocity > 0.45)) { onClose?.(); return; }
    if (sheet) { sheet.style.transition = 'transform .32s cubic-bezier(.32, .72, 0, 1)'; sheet.style.transform = ''; }
  };

  return html`<${Portal}><div class="scrim" ref=${ref} onClick=${(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
    <div class=${'sheet' + (full ? ' full' : '')} role="dialog" aria-modal="true" aria-label=${title}>
      <div class="sheet-bar" onPointerDown=${down} onPointerMove=${move} onPointerUp=${up} onPointerCancel=${up}>
        <div class="grab" aria-hidden="true"></div>
        <div class="l">${left ?? html`<button class="bar-btn round" aria-label=${tr('Close')} onClick=${onClose}><${Icon} name="x" /></button>`}</div>
        <div class="title">${title}</div>
        <div class="r">${right}</div>
      </div>
      <div class="sheet-body">${children}</div>
    </div>
  </div><//>`;
}

/** The leaving copy of a sheet: it slides from wherever it was, the scrim fades, then it is gone. */
function leaveGracefully(node) {
  if (!node || !node.isConnected || !node.animate || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const ghost = node.cloneNode(true);
  ghost.classList.add('leaving');
  ghost.setAttribute('aria-hidden', 'true');
  const sheet = ghost.firstElementChild;
  const from = node.firstElementChild?.style.transform || 'translateY(0)';
  document.body.appendChild(ghost); // the sheet's own host leaves with it
  const done = () => ghost.remove();
  ghost.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: 'ease-out', fill: 'forwards' });
  sheet?.animate([{ transform: from }, { transform: 'translateY(100%)' }], { duration: 220, easing: 'cubic-bezier(.32, .72, 0, 1)', fill: 'forwards' }).finished.then(done, done);
  setTimeout(done, 400);
}

/**
 * Actions that stay in reach: pinned above the tab bar, on the glass. The
 * screen under it gets room to scroll clear (Screen class "has-dock").
 */
export function Dock({ children }) {
  useEffect(() => {
    document.documentElement.classList.add('with-dock');
    return () => document.documentElement.classList.remove('with-dock');
  }, []);
  return html`<div class="dock"><div class="dock-in">${children}</div></div>`;
}

/** Destructive actions name their cost and ask once. */
export function Confirm({ title, message, action = tr('Delete'), onConfirm, onClose }) {
  return html`<${Sheet} title=${title} onClose=${onClose}>
    <div class="pad stack tight">
      <p class="para">${message}</p>
      <${Secondary} danger onClick=${() => { onConfirm(); onClose(); }}>${action}<//>
      <${Quiet} onClick=${onClose}>${tr('Cancel')}<//>
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
  if (!date) return tr('date unknown');
  const d = Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
  if (d < 0) return tr('just now');
  if (d === 0) return tr('today');
  if (d === 1) return tr('yesterday');
  return tr('{n} days ago', { n: d });
};

const short = { format: (d) => dateFmt({ day: 'numeric', month: 'short', year: 'numeric' }).format(d) };
const dayMonth = { format: (d) => dateFmt({ day: 'numeric', month: 'short' }).format(d) };
/** `2026-07-24` is a calendar day, not UTC midnight — never let it slip a day west. */
const asDate = (d) => (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) ? dayToDate(d) : new Date(d));
export const fmtDate = (d) => (d ? short.format(asDate(d)) : '—');
export const fmtDayMonth = (d) => (d ? dayMonth.format(asDate(d)) : '—');
