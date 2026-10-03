// The whole app's state, and every way it changes.
//
// THE RULE UNDERNEATH THE SYNC: every failure path keeps the last good cache.
// No signal is the normal case on a shop floor, not the exceptional one. A
// fetch that fails is a non-event — the app was fully usable before it started
// and is fully usable after it fails. Nothing about a sale waits on the network.

import * as db from './db.js';
import { Catalogue } from '../core/catalogue.js';
import { open, WrongPasscode } from '../core/crypto.js';
import { APP_BUILD, DATA_PATH, FETCH_TIMEOUT_MS } from '../config.js';
import { newOrder } from '../core/orders.js';
import { sortClients } from '../core/crm.js';
import { exportBackup, readBackup, mergeBackup } from '../core/backup.js';

// ---------------------------------------------------------------------------
// Store

let state = {
  booted: false,
  catalogue: new Catalogue(null),
  passcode: null,
  sync: { status: 'idle', note: null, checkedAt: null },
  clients: [],
  orders: [],
  identity: null,
  draft: newOrder(),
  draftRx: null,
  toast: null,
  update: false,
};

const listeners = new Set();
export const getState = () => state;
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function setState(patch) {
  state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) };
  for (const fn of listeners) fn(state);
}

let toastTimer = null;
export function toast(message) {
  clearTimeout(toastTimer);
  setState({ toast: message });
  toastTimer = setTimeout(() => setState({ toast: null }), 2600);
}

// ---------------------------------------------------------------------------
// Boot

export async function boot() {
  const [bundle, passcode, store, identity, draft] = await Promise.all([
    db.get('bundle'), db.get('passcode'), db.get('store'), db.get('identity'), db.get('draft'),
  ]);
  setState({
    booted: true,
    catalogue: new Catalogue(bundle ?? null),
    passcode: passcode ?? null,
    clients: sortClients(store?.clients ?? []),
    orders: sortOrders(store?.orders ?? []),
    identity: identity ?? null,
    draft: draft?.order ?? newOrder(),
    draftRx: draft?.rx ?? null,
  });
  db.persist();
  if (passcode) refresh();
}

// ---------------------------------------------------------------------------
// Catalogue sync

async function fetchEnvelope() {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(DATA_PATH, { cache: 'no-cache', signal: ctrl.signal });
    if (res.status === 404) return { missing: true };
    if (!res.ok) return { offline: true };
    return { envelope: await res.json() };
  } catch {
    return { offline: true };
  } finally {
    clearTimeout(timer);
  }
}

const NOTES = {
  offline: null,
  appTooOld: 'An update to the app is waiting. Close and reopen it — until then it keeps using the catalogue it has.',
  corrupt: 'A download arrived damaged and was discarded. Still on the last good copy.',
  passcode: 'The store passcode changed. Enter the new one to receive updates — the current catalogue keeps working meanwhile.',
  missing: 'Nothing has been published yet.',
};

/** Check for a newer catalogue. Safe at launch and from the Me tab. */
export async function refresh() {
  if (state.sync.status === 'checking') return;
  setState({ sync: { ...state.sync, status: 'checking' } });
  const done = (status, extra = {}) => setState({ sync: { status, note: NOTES[status] ?? null, checkedAt: new Date().toISOString(), ...extra } });

  const got = await fetchEnvelope();
  if (got.offline) return done('offline');
  if (got.missing) return done('missing');
  const env = got.envelope;
  if ((env.minAppBuild ?? 1) > APP_BUILD) return done('appTooOld');
  if (env.dataVersion && env.dataVersion === state.catalogue.dataVersion) return done('upToDate');
  if (!state.passcode) return done('passcode');
  try {
    const bundle = await open(env, state.passcode);
    await adopt(bundle);
    return done('updated', { version: bundle.dataVersion });
  } catch (e) {
    return done(e instanceof WrongPasscode ? 'passcode' : 'corrupt');
  }
}

/** First run, or a changed passcode: open the published file with this passcode. */
export async function unlock(passcode) {
  const got = await fetchEnvelope();
  if (got.offline) throw new Error('Can’t reach the catalogue right now. Connect once to unlock — after that it works offline.');
  if (got.missing) throw new Error('Nothing has been published yet. An admin publishes the first catalogue from “Set up as admin”.');
  if ((got.envelope.minAppBuild ?? 1) > APP_BUILD) throw new Error('This catalogue needs a newer app. Reload the page to update.');
  const bundle = await open(got.envelope, passcode.trim());
  await db.set('passcode', passcode.trim());
  setState({ passcode: passcode.trim() });
  await adopt(bundle);
  setState({ sync: { status: 'updated', note: null, checkedAt: new Date().toISOString(), version: bundle.dataVersion } });
  return bundle;
}

/** The one place the live catalogue changes. */
export async function adopt(bundle, { passcode } = {}) {
  const catalogue = new Catalogue(bundle);
  setState({ catalogue });
  await db.set('bundle', bundle);
  if (passcode) { await db.set('passcode', passcode); setState({ passcode }); }
}

/** Forget the catalogue and passcode on this phone (client records stay). */
export async function lockDevice() {
  await db.del('bundle');
  await db.del('passcode');
  setState({ catalogue: new Catalogue(null), passcode: null, sync: { status: 'idle', note: null, checkedAt: null } });
}

// ---------------------------------------------------------------------------
// Staff identity

export function staffMember(s = state) {
  return s.catalogue.staff.find((m) => m.employeeNumber === s.identity) ?? null;
}

export async function setIdentity(employeeNumber) {
  setState({ identity: employeeNumber });
  await db.set('identity', employeeNumber);
}

// ---------------------------------------------------------------------------
// Clients and orders

function sortOrders(list) { return [...list].sort((a, b) => b.createdOn.localeCompare(a.createdOn)); }

async function saveStore() { await db.set('store', { clients: state.clients, orders: state.orders }); }

export async function upsertClient(client) {
  const clients = state.clients.some((c) => c.id === client.id)
    ? state.clients.map((c) => (c.id === client.id ? client : c))
    : [...state.clients, client];
  setState({ clients: sortClients(clients) });
  await saveStore();
}

/** Cascades to orders, and there is no undo — the caller confirms first. */
export async function deleteClient(id) {
  setState({ clients: state.clients.filter((c) => c.id !== id), orders: state.orders.filter((o) => o.clientId !== id) });
  await saveStore();
}

export async function toggleFavourite(id) {
  const c = state.clients.find((x) => x.id === id);
  if (c) await upsertClient({ ...c, isFavourite: !c.isFavourite });
}

export const clientById = (id, s = state) => s.clients.find((c) => c.id === id) ?? null;

/**
 * The seller is stamped once, when an order first gets one. Re-saving never
 * rewrites it: an order belongs to whoever made the sale.
 */
export async function upsertOrder(order) {
  const o = { ...order };
  if ((o.status === 'sold' || o.status === 'lost') && !o.closedOn) o.closedOn = new Date().toISOString();
  if (o.status === 'draft' || o.status === 'presented') o.closedOn = null;
  const c = clientById(o.clientId);
  if (c) o.clientNameAtSale = c.name;
  const seller = staffMember();
  if (!o.sellerEmployeeNumber && seller) { o.sellerEmployeeNumber = seller.employeeNumber; o.sellerName = seller.name; }
  const orders = state.orders.some((x) => x.id === o.id) ? state.orders.map((x) => (x.id === o.id ? o : x)) : [...state.orders, o];
  setState({ orders: sortOrders(orders) });
  await saveStore();
  return o;
}

export async function deleteOrder(id) {
  setState({ orders: state.orders.filter((o) => o.id !== id) });
  await saveStore();
}

// ---------------------------------------------------------------------------
// The order in progress. Saved on every change: a phone that kills the page in
// the background must not lose a half-built sale.

async function saveDraft() { await db.set('draft', { order: state.draft, rx: state.draftRx }); }

export async function addLine(line) {
  setState({ draft: { ...state.draft, lines: [...state.draft.lines, line] } });
  await saveDraft();
}

export async function removeLine(id) {
  setState({ draft: { ...state.draft, lines: state.draft.lines.filter((l) => l.id !== id) } });
  await saveDraft();
}

export async function updateLine(id, patch) {
  setState({ draft: { ...state.draft, lines: state.draft.lines.map((l) => (l.id === id ? { ...l, ...patch } : l)) } });
  await saveDraft();
}

export async function setDraftClient(clientId) {
  const c = clientById(clientId);
  setState({ draft: { ...state.draft, clientId }, draftRx: c?.prescription ?? null });
  await saveDraft();
}

export async function clearDraft() {
  setState({ draft: newOrder(), draftRx: null });
  await saveDraft();
}

/** Save the draft as a real order under a client, then start a fresh one. */
export async function saveDraftTo(clientId, status = 'draft') {
  const saved = await upsertOrder({ ...state.draft, clientId, status });
  await clearDraft();
  return saved;
}

// ---------------------------------------------------------------------------
// Backups

export function backupJSON() {
  return JSON.stringify(exportBackup({ clients: state.clients, orders: state.orders }), null, 2);
}

export function previewBackup(text) { return readBackup(text); }

export async function restoreBackup(parsed, mode) {
  const next = mode === 'replace' ? { clients: parsed.clients, orders: parsed.orders, added: { clients: parsed.clients.length, orders: parsed.orders.length } }
    : mergeBackup({ clients: state.clients, orders: state.orders }, parsed);
  setState({ clients: sortClients(next.clients), orders: sortOrders(next.orders) });
  await saveStore();
  return next.added;
}

// ---------------------------------------------------------------------------
// Admin publishing settings, kept on this device only.

export const getPublishSettings = () => db.get('publish');
export const setPublishSettings = (v) => db.set('publish', v);
