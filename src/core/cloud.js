// Google Drive backup: the rules, with no browser and no network in them.
//
// The phone talks to a small Apps Script web app the admin deploys under his own
// Google account (tools/LOeilSync.gs). Everything that leaves the phone is
// sealed first with the store passcode — the same AES-256-GCM envelope as the
// catalogue — so Drive holds ciphertext and the script never sees a client.
//
// WHEN: a web app cannot wake itself, so a schedule is a promise kept the next
// time L'Œil is open. "Daily" is due once the most recent 3:00 a.m. has passed
// since the last backup; "every 2 hours" once two hours have. Manual is the
// default: nothing leaves the phone until he taps Back up.

import { CLOUD } from '../config.js';

export const FREQUENCIES = [
  { id: 'manual', label: 'Only when I tap Back up' },
  { id: 'daily', label: `Daily at ${CLOUD.DAILY_HOUR}:00 a.m.` },
  { id: '2h', label: `Every ${CLOUD.EVERY_HOURS} hours` },
];

export const frequencyLabel = (id) => FREQUENCIES.find((f) => f.id === id)?.label ?? FREQUENCIES[0].label;

/** The most recent daily mark (today's 3:00 a.m., or yesterday's before it). */
export function lastDailyMark(now, hour = CLOUD.DAILY_HOUR) {
  const mark = new Date(now);
  mark.setHours(hour, 0, 0, 0);
  if (mark > now) mark.setDate(mark.getDate() - 1);
  return mark;
}

/** Is a scheduled backup owed? `lastAt` is the last time the Drive copy was known current. */
export function isDue(frequency, lastAt, now = new Date()) {
  if (frequency !== 'daily' && frequency !== '2h') return false;
  if (!lastAt) return true;
  const last = new Date(lastAt);
  if (Number.isNaN(last.getTime())) return true;
  if (frequency === 'daily') return last < lastDailyMark(now);
  return now - last >= CLOUD.EVERY_HOURS * 3600e3;
}

/** When the next scheduled backup becomes due, for the screen to say. */
export function nextDue(frequency, lastAt, now = new Date()) {
  if (frequency !== 'daily' && frequency !== '2h') return null;
  if (isDue(frequency, lastAt, now)) return now;
  if (frequency === 'daily') {
    const next = lastDailyMark(now);
    next.setDate(next.getDate() + 1);
    return next;
  }
  return new Date(new Date(lastAt).getTime() + CLOUD.EVERY_HOURS * 3600e3);
}

/** After a failed attempt, wait this long before a schedule tries again on its own. */
export function canRetry(lastAttemptAt, now = new Date()) {
  return !lastAttemptAt || now - new Date(lastAttemptAt) >= CLOUD.RETRY_MINUTES * 60e3;
}

/**
 * The link the script prints: the web app URL with the key after a `#`.
 * Accepts the two pasted together or apart. Returns null for anything that is
 * not a deployed Apps Script web app.
 */
export function parseLink(url, key = '') {
  const raw = String(url ?? '').trim();
  const [base, hashKey = ''] = raw.split('#');
  const k = (String(key ?? '').trim() || hashKey.trim());
  let u;
  try { u = new URL(base); } catch { return null; }
  const ok = u.protocol === 'https:'
    && (u.hostname === 'script.google.com' || u.hostname === 'script.googleusercontent.com')
    && /\/exec$/.test(u.pathname);
  if (!ok || k.length < 16) return null;
  return { url: u.origin + u.pathname, key: k };
}

/** What a backup holds, readable without the passcode (the script stores it beside the file). */
export function backupMeta({ clients, orders }, device) {
  return { clients: clients.length, orders: orders.length, device: device ?? null, savedAt: new Date().toISOString() };
}

/** A stable fingerprint of the records, so an unchanged phone is not backed up again. */
export async function fingerprint({ clients, orders }) {
  const bytes = new TextEncoder().encode(JSON.stringify({ clients, orders }));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export class CloudError extends Error {
  constructor(code, message) { super(message ?? CLOUD_ERRORS[code] ?? code); this.name = 'CloudError'; this.code = code; }
}

export const CLOUD_ERRORS = {
  'bad-key': 'Google turned the key down. Copy the link from the script again.',
  'not-found': 'That backup is no longer in Drive.',
  'no-backup': 'There is no backup in Drive yet.',
  offline: 'Offline — the backup waits for a connection.',
  timeout: 'Google took too long to answer. It will try again.',
  'not-script': 'That address did not answer as the L’Œil backup script. Check that it is deployed as a web app that anyone can reach.',
  'no-link': 'Add the Google link first.',
  'no-passcode': 'This phone has no store passcode yet.',
};

/**
 * One request to the script. `fetchImpl` is injected so the rules can be tested.
 * Apps Script answers a POST with a redirect to googleusercontent.com; a
 * text/plain body keeps the request simple, so no CORS preflight is needed.
 */
export async function callScript(link, op, body = {}, { fetchImpl = globalThis.fetch, timeoutMs = CLOUD.TIMEOUT_MS } = {}) {
  if (!link) throw new CloudError('no-link');
  if (globalThis.navigator && navigator.onLine === false) throw new CloudError('offline');
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
  let res;
  try {
    res = await fetchImpl(link.url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ ...body, op, key: link.key, app: 'loeil', v: 1 }),
      redirect: 'follow',
      signal: ctrl?.signal,
    });
  } catch (e) {
    throw new CloudError(e?.name === 'AbortError' ? 'timeout' : 'offline');
  } finally {
    if (timer) clearTimeout(timer);
  }
  let data;
  try { data = await res.json(); } catch { throw new CloudError('not-script'); }
  if (!data || data.app !== 'loeil-sync') throw new CloudError('not-script');
  if (!data.ok) throw new CloudError(data.error ?? 'not-script', CLOUD_ERRORS[data.error] ?? data.message ?? undefined);
  return data;
}
