// Aftersale: every order delivered, followed through its first year one touch
// at a time — Alpha's Aftersale sheet, on the phone.
//
//   Handover    the day it goes out: comfort checked, adjustments made (no message)
//   48 hours    adaptation, support with any discomfort, the warranties
//   15 days     catch difficulties before they become complaints
//   90 days     keep the relationship
//   6 months    preventive eye care
//   12 months   the yearly exam
//
// THE WORKBOOK IS THE SOURCE. Aftersale.gs decides which touches are due and
// logs them; the phone only shows its list, this seller's rows, and sends the
// touch's message. Done and Note can be changed here in between, and the next
// import puts the workbook's back — a touch counts once it is ticked in Alpha.

import { sheetDay, digits, dayToDate, isoDay } from './util.js';
import { firstName, whatsappLink } from './control.js';

/** The touches, in the order they come. */
export const AFTERSALE_TOUCHES = ['Handover', '48 hours', '15 days', '90 days', '6 months', '12 months'];

const lower = (v) => String(v ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
const text = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
const day = (v) => sheetDay(v) || null;
const touchName = (v) => AFTERSALE_TOUCHES.find((t) => lower(t) === lower(v)) ?? text(v);
const ticked = (v) => v === true || v === 1 || lower(v) === 'true';

/**
 * The Aftersale tab (rows as arrays) → its list, before anyone is matched to a
 * seller, and the message for each touch from the panel beside it (Touch,
 * Message). Null when the tab has no list.
 */
export function readAftersale(rows) {
  const at = (rows ?? []).findIndex((r) => Array.isArray(r) && lower(r[0]) === 'sell id');
  if (at < 0) return null;
  const head = rows[at].map(lower);
  const msg = head.indexOf('message');
  const label = msg > 0 && head[msg - 1] === 'touch' ? msg - 1 : -1;
  const end = label >= 0 ? label : head.length;
  const col = (name) => { for (let i = 0; i < end; i++) if (head[i] === name) return i; return -1; };
  const C = {
    sell: 0, customer: col('customer'), phone: col('phone'), vendor: col('vendor'), delivered: col('delivered'),
    touch: col('touch'), due: col('due'), done: col('done'), note: col('note'),
  };
  if (C.touch < 0) return null;
  const list = [];
  const messages = {};
  let panel = label >= 0;
  for (const row of rows.slice(at + 1)) {
    const saleId = text(row?.[C.sell]);
    if (saleId) {
      list.push({
        saleId,
        customer: C.customer >= 0 ? text(row[C.customer]) : '',
        phone: C.phone >= 0 ? digits(row[C.phone]) : '',
        vendor: C.vendor >= 0 ? text(row[C.vendor]) : '',
        delivered: C.delivered >= 0 ? day(row[C.delivered]) : null,
        touch: touchName(row[C.touch]),
        due: C.due >= 0 ? day(row[C.due]) : null,
        done: C.done >= 0 ? ticked(row[C.done]) : false,
        note: C.note >= 0 ? String(row[C.note] ?? '').trim() : '',
        sellerEmployeeNumber: null, sellerName: null,
      });
    }
    if (!panel) continue;
    // The panel ends where the sheet's own notes begin.
    if (lower(row?.[label]) === 'how this sheet works') { panel = false; continue; }
    const t = touchName(row?.[label]);
    const m = String(row?.[msg] ?? '').trim();
    if (m && AFTERSALE_TOUCHES.includes(t)) messages[t] = m;
  }
  return { rows: list, messages: Object.keys(messages).length ? messages : null };
}

/** Days since the touch fell due: 0 on the day, null without a due date. */
export function daysLate(row, now = isoDay(new Date())) {
  if (!row?.due) return null;
  return Math.round((dayToDate(now) - dayToDate(row.due)) / 86400000);
}

/** The touch's message with the row filled in: {name}, {customer}. */
export function fillAftersale(template, row) {
  return String(template ?? '')
    .replaceAll('{name}', firstName(row.customer))
    .replaceAll('{customer}', String(row.customer ?? '').trim());
}

/** The message the row's touch sends, or null: Handover has none, nor does a touch the workbook has no message for. */
export function aftersaleMessage(row, messages) {
  const m = row?.touch ? messages?.[row.touch] : null;
  return m ? fillAftersale(m, row) : null;
}

/** The row's WhatsApp: the touch's message (Send), else just the chat. */
export function aftersaleWhatsApp(row, phone, messages) {
  const message = aftersaleMessage(row, messages);
  return { message, link: whatsappLink(phone, message) };
}

/** A backup's Aftersale rows, made safe to keep. */
export function normalizeAftersale(rows) {
  const s = (v) => (v == null ? null : String(v));
  return (Array.isArray(rows) ? rows : []).filter((r) => r?.saleId).map((r) => ({
    saleId: String(r.saleId), customer: String(r.customer ?? ''), phone: String(r.phone ?? ''), vendor: String(r.vendor ?? ''),
    delivered: s(r.delivered), touch: String(r.touch ?? ''), due: s(r.due), done: r.done === true, note: String(r.note ?? ''),
    sellerEmployeeNumber: s(r.sellerEmployeeNumber), sellerName: s(r.sellerName),
  }));
}

/** A backup's Aftersale messages: touch → text. */
export function normalizeAftersaleMessages(m) {
  if (!m || typeof m !== 'object') return null;
  const out = {};
  for (const t of AFTERSALE_TOUCHES) if (typeof m[t] === 'string' && m[t].trim()) out[t] = m[t];
  return Object.keys(out).length ? out : null;
}
