// The app's words in four languages. English is the source: every string in
// the code is written in English and passed through `tr`, which looks it up in
// the chosen language and falls back to the English when a translation is
// missing — so a new screen is never blank, only English until translated.
//
//   tr('Sold today')                      a plain label
//   tr('{n} on the quote', { n: 3 })      values go in by name
//   trn(n, '1 order', '{n} orders')       one / many; Japanese and Korean have one form
//   tr('price::From')                     a context before :: tells apart one English word
//                                         with two meanings; English shows what follows it
//
// Tickets, quotes and WhatsApp messages are what the client receives; they
// stay in the store's own wording and never go through here.

import { ES } from './i18n/es.js';
import { JA } from './i18n/ja.js';
import { KO } from './i18n/ko.js';

export const LANGS = [
  { id: 'en', label: 'EN', name: 'English', locale: 'en-GB' },
  { id: 'es', label: 'ES', name: 'Español', locale: 'es-MX' },
  { id: 'ja', label: 'JP', name: '日本語', locale: 'ja-JP' },
  { id: 'ko', label: 'KR', name: '한국어', locale: 'ko-KR' },
];

const DICTS = { es: ES, ja: JA, ko: KO };
let lang = 'en';

export const currentLang = () => lang;
export const locale = () => (LANGS.find((l) => l.id === lang) ?? LANGS[0]).locale;

/** Switch the words. The caller re-renders (state/app.js does, through the store). */
export function setLanguage(id) {
  lang = LANGS.some((l) => l.id === id) ? id : 'en';
  try { document.documentElement.lang = lang; } catch { /* no document in tests */ }
}

const missing = new Set();
const fill = (s, vars) => (vars ? s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m)) : s);

export function tr(s, vars) {
  if (s == null || s === '') return s;
  const d = DICTS[lang];
  const cut = s.indexOf('::');
  let out = cut > 0 ? s.slice(cut + 2) : s;
  if (d) {
    if (d[s] != null) out = d[s];
    else if (!missing.has(s)) { missing.add(s); if (typeof window !== 'undefined') (window.__i18nMissing ??= []).push(s); }
  }
  return fill(out, vars);
}

/** One or many. Spanish follows English; Japanese and Korean use the `many` form's translation for both. */
export function trn(n, one, many, vars = {}) {
  return tr(n === 1 ? one : many, { n, ...vars });
}

/** Dates and numbers in the language's own way. Money stays in pesos, es-MX, everywhere. */
export const dateFmt = (opts) => new Intl.DateTimeFormat(locale(), opts);
export const num = (n, opts) => (n == null ? '—' : Number(n).toLocaleString(locale(), opts));
export const pct = (x, digits = 1) => (x == null ? '—' : (x * 100).toLocaleString(locale(), { minimumFractionDigits: digits, maximumFractionDigits: digits }) + '%');
