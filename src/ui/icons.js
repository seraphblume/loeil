// Line icons, drawn at 24 units with a light 1.5 stroke to sit beside Inter Light.

import { html } from './html.js';

const P = {
  search: html`<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>`,
  people: html`<circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5"/><circle cx="16.8" cy="9.2" r="2.6"/><path d="M15.6 14.1c2.4.1 4.2 1.7 4.8 4.4"/>`,
  doc: html`<path d="M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-10A.5.5 0 0 1 7 20z"/><path d="M14 3.5V8h4"/><path d="M9.5 12.5h5M9.5 15.5h5"/>`,
  person: html`<circle cx="12" cy="8.5" r="3.6"/><path d="M5 20c.8-3.8 3.6-6 7-6s6.2 2.2 7 6"/>`,
  barcode: html`<path d="M4 7V5.5A1.5 1.5 0 0 1 5.5 4H7M17 4h1.5A1.5 1.5 0 0 1 20 5.5V7M20 17v1.5a1.5 1.5 0 0 1-1.5 1.5H17M7 20H5.5A1.5 1.5 0 0 1 4 18.5V17"/><path d="M8 8v8M10.5 8v8M13 8v8M15 8v8M16.8 8v8"/>`,
  plus: html`<path d="M12 5v14M5 12h14"/>`,
  minus: html`<circle cx="12" cy="12" r="8"/><path d="M8.5 12h7"/>`,
  chevR: html`<path d="m9.5 6 6 6-6 6"/>`,
  chevL: html`<path d="m14.5 6-6 6 6 6"/>`,
  x: html`<path d="m6.5 6.5 11 11M17.5 6.5l-11 11"/>`,
  xcircle: html`<circle cx="12" cy="12" r="8"/><path d="m9.5 9.5 5 5M14.5 9.5l-5 5"/>`,
  star: html`<path d="m12 4.5 2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L4.8 9.8l5-.7z"/>`,
  starFill: html`<path fill="currentColor" d="m12 4.5 2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L4.8 9.8l5-.7z"/>`,
  trash: html`<path d="M5 7h14M10 7V5h4v2M7 7l.8 12h8.4L17 7"/>`,
  share: html`<path d="M12 15V4M8.5 7.5 12 4l3.5 3.5"/><path d="M7 11H6v9h12v-9h-1"/>`,
  camera: html`<path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2.2l1.4-2h5.8l1.4 2h2.2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z"/><circle cx="12" cy="13" r="3.4"/>`,
  warning: html`<path d="M12 4.5 20.5 19h-17z"/><path d="M12 10v4M12 16.6v.2"/>`,
  clock: html`<circle cx="12" cy="12" r="8"/><path d="M12 7.5V12l3 2"/>`,
  check: html`<path d="m5.5 12.5 4 4 9-9"/>`,
  undo: html`<path d="M9 7 5 11l4 4"/><path d="M5 11h9a5 5 0 0 1 0 10h-2"/>`,
  filter: html`<path d="M4.5 7h15M7.5 12h9M10.5 17h3"/>`,
  box: html`<path d="M4 8 12 4l8 4v8l-8 4-8-4z"/><path d="m4 8 8 4 8-4M12 12v8"/>`,
  lens: html`<circle cx="12" cy="12" r="7.5" stroke-dasharray="2.4 2.4"/>`,
  sv: html`<circle cx="12" cy="12" r="7.5"/>`,
  mf: html`<circle cx="12" cy="12" r="7.5"/><path d="M4.6 13.5h14.8" /><path fill="currentColor" stroke="none" d="M4.65 13.5h14.7a7.5 7.5 0 0 1-14.7 0z" opacity=".35"/>`,
  cl: html`<path d="M12 4.5c2.8 3.6 5.5 7 5.5 10a5.5 5.5 0 0 1-11 0c0-3 2.7-6.4 5.5-10z"/>`,
  glasses: html`<circle cx="7" cy="14" r="3.5"/><circle cx="17" cy="14" r="3.5"/><path d="M10.5 14c.9-.7 2.1-.7 3 0M3.5 14 5 8.5h2M20.5 14 19 8.5h-2"/>`,
  refresh: html`<path d="M19 12a7 7 0 1 1-2.1-5"/><path d="M19 4.5V8h-3.5"/>`,
  download: html`<path d="M12 4v11M8 11.5l4 4 4-4"/><path d="M5 19.5h14"/>`,
  upload: html`<path d="M12 16V5M8 8.5l4-4 4 4"/><path d="M5 19.5h14"/>`,
  lock: html`<rect x="5.5" y="10.5" width="13" height="9.5" rx="1.5"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>`,
  copy: html`<rect x="8" y="8" width="11" height="12" rx="1.5"/><path d="M5 15.5V5.5A1.5 1.5 0 0 1 6.5 4H15"/>`,
  edit: html`<path d="m15 5.5 3.5 3.5L9 18.5H5.5V15z"/>`,
  text: html`<path d="M5 7h14M5 12h14M5 17h9"/>`,
  arrowUp: html`<path d="M12 19V6M7 11l5-5 5 5"/>`,
  cloud: html`<path d="M7 18.5a4 4 0 0 1-.6-8 5.5 5.5 0 0 1 10.6-1.3A4.5 4.5 0 0 1 17 18.5z"/>`,
};

export function Icon({ name, size }) {
  const s = size ? { width: size + 'px', height: size + 'px' } : undefined;
  return html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style=${s}>${P[name] ?? null}</svg>`;
}
