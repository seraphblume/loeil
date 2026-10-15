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
import { newOrder, pairLine, extraLine, isPair } from '../core/orders.js';
import { resolveOrder } from '../core/sets.js';
import { sortClients } from '../core/crm.js';
import { withShowcase, isShowcase, SHOWCASE_ID } from '../core/showcase.js';
import { exportBackup, readBackup, mergeBackup } from '../core/backup.js';
import { readAlpha, readClients, readTickets, attachTickets, isClientLayout, mergeAlpha } from '../core/alpha.js';
import {
  blankControl, readControl, readVendors, readMessages, assignSellers, rowsFor, editDelivery, mergeControl,
} from '../core/control.js';
import { newQuote, QUOTE_OPTIONS } from '../core/quote.js';
import { uid } from '../core/util.js';

// ---------------------------------------------------------------------------
// Store

let state = {
  booted: false,
  catalogue: new Catalogue(null),
  passcode: null,
  sync: { status: 'idle', note: null, checkedAt: null },
  clients: [],
  orders: [],
  control: blankControl(),
  identity: null,
  draft: newOrder(),
  draftRx: null,
  quote: newQuote(),
  toast: null,
  update: false,
  working: null,
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
  toastTimer = setTimeout(() => setState({ toast: null }), 2100);
}

// ---------------------------------------------------------------------------
// Boot

export async function boot() {
  const [bundle, passcode, store, identity, draft, quote, control] = await Promise.all([
    db.get('bundle'), db.get('passcode'), db.get('store'), db.get('identity'), db.get('draft'), db.get('quote'), db.get('control'),
  ]);
  setState({
    booted: true,
    catalogue: new Catalogue(bundle ?? null),
    passcode: passcode ?? null,
    clients: sortClients(withShowcase(store?.clients ?? [])), // the showcase client, put back as she is
    orders: sortOrders(store?.orders ?? []),
    control: { ...blankControl(), ...(control ?? {}) },
    identity: identity ?? null,
    draft: draft?.order ?? newOrder(),
    draftRx: draft?.rx ?? null,
    quote: quote ?? newQuote(),
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
  await db.del('working');
  setState({ catalogue: new Catalogue(null), passcode: null, working: null, sync: { status: 'idle', note: null, checkedAt: null } });
}

// ---------------------------------------------------------------------------
// Staff identity

export function staffMember(s = state) {
  return s.catalogue.staff.find((m) => m.employeeNumber === s.identity) ?? null;
}

/** The admin's phone — or any phone while the catalogue names no staff. */
export const isAdminPhone = (s = state) => !s.catalogue.staff.length || staffMember(s)?.role === 'admin';

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

/** Cascades to orders, and there is no undo — the caller confirms first. The showcase client stays. */
export async function deleteClient(id) {
  if (id === SHOWCASE_ID) return false;
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
  // The frame the client chose takes the place of the one quoted by brand or set.
  const chosen = line.kind === 'frame' && !line.placeholder;
  const lines = state.draft.lines.filter((l) => !(chosen && l.kind === 'frame' && l.placeholder));
  setState({ draft: { ...state.draft, lines: [...lines, line] } });
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

/**
 * A lifestyle preset onto the order: its lens replaces the spectacle lenses
 * there, and what an earlier preset added goes, so tapping another preset
 * swaps cleanly. Frames, contact lenses and what he added by hand stay.
 */
export async function applyPreset(result, frame = null) {
  const tag = `${result.tier.presetId}|${result.tier.tier}`;
  // frame: null keeps the order's frame, false leaves none, a line takes its place.
  const keep = state.draft.lines.filter((l) => !l.preset && !isPair(l) && !(frame !== null && l.kind === 'frame'));
  if (frame) keep.unshift(frame);
  const have = new Set(keep.filter((l) => l.kind === 'extra').map((l) => l.code));
  const lines = [
    ...keep,
    { ...pairLine(result.lens), preset: tag, presetName: `${result.tier.preset} · ${result.tier.tier}` },
    ...result.extras.filter((e) => !have.has(e.id)).map((e) => ({ ...extraLine(e.id, e.description, 1, null, e.percent), preset: tag })),
    ...result.items.filter((i) => !have.has(i.sku)).map((i) => ({ ...extraLine(i.sku, i.description, 1, i.stock), preset: tag })),
  ];
  setState({ draft: { ...state.draft, lines } });
  await saveDraft();
}

/** The order's frame becomes this one — a frame in hand, a brand or a set. */
export async function setOrderFrame(line) {
  const rest = state.draft.lines.filter((l) => l.kind !== 'frame');
  setState({ draft: { ...state.draft, lines: line ? [line, ...rest] : rest } });
  await saveDraft();
}

/** The prescription this job is made to. It starts as the client's and can differ from it. */
export async function setDraftRx(rx) {
  setState({ draftRx: rx });
  await saveDraft();
}

/** A discount the client claims by showing something (a Sam's Club card), on or off for this order. */
export async function setDraftClaim(id, on) {
  const claimed = new Set(state.draft.claimed ?? []);
  if (on) claimed.add(id); else claimed.delete(id);
  setState({ draft: { ...state.draft, claimed: [...claimed] } });
  await saveDraft();
}

/** AOB per eye, in mm: measured for the job, so it lives on the order, never on the client. */
export async function setDraftAob(aob) {
  setState({ draft: { ...state.draft, aob } });
  await saveDraft();
}

export async function clearDraft() {
  setState({ draft: newOrder(), draftRx: null });
  await saveDraft();
}

/** Save the draft as a real order under a client, then start a fresh one. */
/** The order in progress, read against today's campaign: sets, set rows, discounts. */
export const resolvedDraft = (s = state) => resolveOrder(s.draft, s.catalogue);

export async function saveDraftTo(clientId, status = 'draft') {
  // A saved order keeps the set prices it was sold at, whatever the next campaign does.
  // …and the prescription it was made for, which the register copy prints.
  const rx = state.draftRx ?? clientById(clientId)?.prescription ?? null;
  const saved = await upsertOrder({ ...resolvedDraft(), clientId, status, rx });
  await clearDraft();
  return saved;
}

// ---------------------------------------------------------------------------
// The quote: up to three snapshots of the order in progress, for one client.

async function saveQuote() { await db.set('quote', state.quote); }

/** Snapshots the order in progress as the next option. Returns why it could not, if it could not. */
export async function addToQuote() {
  const q = state.quote;
  const draft = resolvedDraft();
  if (!draft.lines.length) return { error: 'The order is empty — add a frame or a lens first.' };
  if (q.options.length >= QUOTE_OPTIONS) return { error: `The quote already has ${QUOTE_OPTIONS} options. Remove one first.` };
  if (q.clientId && draft.clientId && q.clientId !== draft.clientId) {
    return { error: `This quote is for ${clientById(q.clientId)?.name ?? 'another client'}. Clear it to quote someone else.` };
  }
  const seller = staffMember();
  const order = {
    ...draft, id: uid(), status: 'presented',
    sellerEmployeeNumber: seller?.employeeNumber ?? null, sellerName: seller?.name ?? null,
  };
  const quote = { ...q, clientId: q.clientId ?? draft.clientId ?? null, options: [...q.options, { id: uid(), order, addedOn: new Date().toISOString() }] };
  setState({ quote });
  await saveQuote();
  return { n: quote.options.length };
}

export async function removeQuoteOption(id) {
  setState({ quote: { ...state.quote, options: state.quote.options.filter((o) => o.id !== id) } });
  await saveQuote();
}

/** Choosing who the quote is for also makes the order theirs, unless it is already someone else's sale. */
export async function setQuoteClient(clientId) {
  setState({ quote: { ...state.quote, clientId } });
  await saveQuote();
  const d = state.draft;
  if (!d.clientId || (!d.lines.length && d.clientId !== clientId)) await setDraftClient(clientId);
}

export async function clearQuote() {
  setState({ quote: newQuote() });
  await saveQuote();
}

// ---------------------------------------------------------------------------
// Backups

const hasControl = (c) => Boolean(c && (c.deliveries.length || c.followUps.length || c.messages));

export function backupJSON() {
  return JSON.stringify(exportBackup({
    clients: state.clients.filter((c) => !isShowcase(c)), orders: state.orders, control: hasControl(state.control) ? state.control : null,
  }), null, 2);
}

export function previewBackup(text) { return readBackup(text); }

export async function restoreBackup(parsed, mode) {
  const next = mode === 'replace' ? { clients: parsed.clients, orders: parsed.orders, added: { clients: parsed.clients.length, orders: parsed.orders.length } }
    : mergeBackup({ clients: state.clients, orders: state.orders }, parsed);
  // Control comes along when the backup has one; a backup without it leaves this phone's.
  const control = !parsed.control ? state.control
    : mode === 'replace' ? { ...blankControl(), ...parsed.control } : mergeControl(state.control, parsed.control);
  setState({ clients: sortClients(withShowcase(next.clients)), orders: sortOrders(next.orders), control });
  await saveStore();
  await saveControl();
  return next.added;
}

/**
 * The Alpha workbook (its sheets as rows: `crm`, `all`, `control`, `config`)
 * → what importing it would do, before it does anything.
 *
 * The CRM is the admin's: its clients come in on the admin's phone only, each
 * with the tickets this phone's seller sold them on the All tab. Control comes
 * in on every phone, this seller's rows only.
 */
export function previewAlpha(book) {
  const b = Array.isArray(book) ? { crm: book } : book;
  const staff = state.catalogue.staff;
  const seller = state.identity ?? null;
  const admin = isAdminPhone();
  const tickets = readTickets(b.all, staff);
  let alpha = null;
  if (b.crm) alpha = isClientLayout(b.crm) ? attachTickets(readClients(b.crm), tickets, seller) : readAlpha(b.crm, staff);
  let control = null;
  const read = b.control ? readControl(b.control) : null;
  if (read) {
    const all = assignSellers(read, tickets, readVendors(b.config, staff));
    control = {
      deliveries: rowsFor(all.deliveries, seller, admin), followUps: rowsFor(all.followUps, seller, admin),
      messages: readMessages(b.config), vendorFilter: read.vendorFilter,
      here: { deliveries: state.control.deliveries.length, followUps: state.control.followUps.length },
    };
  }
  if (!alpha && !control) throw new Error('This workbook has no CRM or Control sheet.');
  const clients = admin ? alpha : null;
  const counts = clients ? mergeAlpha({ clients: state.clients, orders: state.orders }, clients).counts : null;
  return { source: 'Alpha', alpha: clients, crm: Boolean(alpha), counts, control, admin };
}

/** Bring the workbook in: the CRM merged (admin's phone), this seller's Control replaced by the workbook's. */
export async function importAlpha(parsed) {
  const done = { clients: 0, orders: 0, updated: 0, deliveries: 0, followUps: 0 };
  if (parsed.alpha) {
    const next = mergeAlpha({ clients: state.clients, orders: state.orders }, parsed.alpha);
    setState({ clients: sortClients(withShowcase(next.clients)), orders: sortOrders(next.orders) });
    await saveStore();
    Object.assign(done, next.counts);
  }
  if (parsed.control) {
    const c = parsed.control;
    setState({
      control: {
        deliveries: c.deliveries, followUps: c.followUps, messages: c.messages ?? state.control.messages,
        vendorFilter: c.vendorFilter, importedAt: new Date().toISOString(),
      },
    });
    await saveControl();
    done.deliveries = c.deliveries.length;
    done.followUps = c.followUps.length;
  }
  return done;
}

// ---------------------------------------------------------------------------
// Control: Delivery and Follow Up. Changed on the phone; the next import
// from Alpha puts the workbook's back.

async function saveControl() { await db.set('control', state.control); }

export async function updateDelivery(saleId, patch) {
  const deliveries = state.control.deliveries.map((r) => (r.saleId === saleId ? editDelivery(r, patch) : r));
  setState({ control: { ...state.control, deliveries } });
  await saveControl();
}

export async function updateFollowUp(saleId, patch) {
  const followUps = state.control.followUps.map((r) => (r.saleId === saleId ? { ...r, ...patch } : r));
  setState({ control: { ...state.control, followUps } });
  await saveControl();
}

// ---------------------------------------------------------------------------
// Admin publishing settings, kept on this device only.

export const getPublishSettings = () => db.get('publish');
export const setPublishSettings = (v) => db.set('publish', v);
