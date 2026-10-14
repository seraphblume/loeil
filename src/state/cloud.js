// Google Drive backup, on the admin's phone: settings, Back up, the schedule,
// and restoring from Drive.
//
// Opt-in and quiet. Nothing is sent until a Google link is set; with the
// schedule left on "Only when I tap Back up", nothing is sent until he taps it.
// A failure never interrupts a sale: it is noted on the Backup screen and a
// schedule tries again later. The settings live on this phone only.

import * as db from './db.js';
import { getState, setState, staffMember, backupData, restoreBackup } from './app.js';
import { seal, open } from '../core/crypto.js';
import { exportBackup, readBackup } from '../core/backup.js';
import { callScript, isDue, canRetry, backupMeta, fingerprint, parseLink, CloudError } from '../core/cloud.js';
import { CLOUD } from '../config.js';

const KEY = 'cloud';
const DEFAULTS = { link: null, frequency: 'manual', lastAt: null, lastBackup: null, lastHash: null, lastAttemptAt: null, lastError: null };

const settings = () => ({ ...DEFAULTS, ...(getState().cloud ?? {}) });

async function save(patch) {
  const next = { ...settings(), ...patch };
  setState({ cloud: next });
  const { busy, ...kept } = next;      // busy is this session's, never stored
  await db.set(KEY, kept);
}

export async function loadCloud() {
  const stored = await db.get(KEY);
  setState({ cloud: { ...DEFAULTS, ...(stored ?? {}), busy: null } });
}

/** Sync shows only on the admin's phone (or on a phone with no roster yet). */
export function isAdminPhone(s = getState()) {
  return !s.catalogue.staff.length || staffMember(s)?.role === 'admin';
}

function deviceName(s = getState()) {
  const ua = globalThis.navigator?.userAgent ?? '';
  const kind = /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) ? 'iPad'
    : /iPhone/.test(ua) ? 'iPhone' : /Android/.test(ua) ? 'Android' : /Macintosh/.test(ua) ? 'Mac' : 'Browser';
  const who = staffMember(s)?.name?.split(' ')[0];
  return who ? `${who}’s ${kind}` : kind;
}

export async function setLink(url, key) {
  const link = parseLink(url, key);
  if (!link) throw new CloudError('not-script', 'That is not an Apps Script web app link with its key. It ends in /exec, then # and the key.');
  const info = await callScript(link, 'ping');
  // A new place means nothing is known about what it holds.
  await save({ link, lastAt: null, lastHash: null, lastBackup: info.latest ?? null, lastError: null, lastAttemptAt: null });
  return info;
}

export async function clearLink() {
  await save({ link: null, lastAt: null, lastHash: null, lastBackup: null, lastError: null, lastAttemptAt: null });
}

export async function setFrequency(frequency) {
  await save({ frequency });
  if (frequency !== 'manual') autoBackup();
}

/**
 * Back up now. Returns 'saved' or 'unchanged'. When the records are what Drive
 * already holds, nothing is uploaded — the newest copy is simply confirmed.
 */
export async function backupNow() {
  const s = getState();
  const cfg = settings();
  if (!cfg.link) throw new CloudError('no-link');
  if (!s.passcode) throw new CloudError('no-passcode');
  if (cfg.busy) return 'busy';
  await save({ busy: 'backup', lastAttemptAt: new Date().toISOString() });
  try {
    const data = backupData();
    const hash = await fingerprint(data);
    if (hash === cfg.lastHash) {
      const info = await callScript(cfg.link, 'ping');
      if (info.latest?.hash === hash) {
        await save({ busy: null, lastAt: new Date().toISOString(), lastBackup: info.latest, lastError: null });
        return 'unchanged';
      }
    }
    const envelope = await seal(exportBackup(data), s.passcode);
    const meta = { ...backupMeta(data, deviceName(s)), hash };
    const res = await callScript(cfg.link, 'put', { envelope, meta });
    await save({ busy: null, lastAt: new Date().toISOString(), lastHash: hash, lastBackup: res.saved, lastError: null });
    return res.unchanged ? 'unchanged' : 'saved';
  } catch (e) {
    await save({ busy: null, lastError: e.message });
    throw e;
  }
}

/** The schedule: called on launch, on coming back to the app, on reconnecting, and every few minutes. */
export async function autoBackup(now = new Date()) {
  const s = getState();
  const cfg = settings();
  if (!s.booted || !s.passcode || !cfg.link || cfg.busy || !isAdminPhone(s)) return null;
  if (!isDue(cfg.frequency, cfg.lastAt, now)) return null;
  if (cfg.lastError && !canRetry(cfg.lastAttemptAt, now)) return null;
  try { return await backupNow(); } catch { return null; }   // noted on the Backup screen
}

export async function listBackups() {
  const cfg = settings();
  await save({ busy: 'list' });
  try {
    const res = await callScript(cfg.link, 'list');
    await save({ busy: null });
    return res.backups ?? [];
  } catch (e) {
    await save({ busy: null });
    throw e;
  }
}

/**
 * One backup from Drive, opened and read — ready for the same Merge / Replace
 * sheet as a file. Throws WrongPasscode when it was sealed with another passcode;
 * the screen then asks for that one.
 */
export async function fetchBackup(id, passcode = getState().passcode) {
  const cfg = settings();
  await save({ busy: 'restore' });
  try {
    const res = await callScript(cfg.link, 'get', { id });
    const backup = await open(res.envelope, passcode);
    await save({ busy: null });
    return { ...readBackup(backup), source: 'drive', savedAt: res.meta?.savedAt ?? null, device: res.meta?.device ?? null };
  } catch (e) {
    await save({ busy: null });
    throw e;
  }
}

/** Restoring from Drive, then making that the known state so the schedule does not upload it straight back. */
export async function restoreFromDrive(parsed, mode) {
  const added = await restoreBackup(parsed, mode);
  if (mode === 'replace') await save({ lastHash: null });
  return added;
}

let started = false;
export function startCloudSchedule() {
  if (started) return;
  started = true;
  loadCloud().then(() => setTimeout(() => autoBackup(), 6000));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') autoBackup(); });
  window.addEventListener('online', () => autoBackup());
  setInterval(() => { if (document.visibilityState !== 'hidden') autoBackup(); }, CLOUD.CHECK_EVERY_MIN * 60e3);
}
