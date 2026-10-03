// The admin's working copy — where catalogue edits live until they are published.
//
// It starts as an exact copy of the published catalogue and is saved on this
// phone after every edit, so closing the app loses nothing. Phones keep selling
// from the published catalogue the whole time; nothing changes for anyone until
// Publish. Publishing checks GitHub first and refuses to overwrite a catalogue
// someone else published after this copy was started.

import * as db from './db.js';
import { getState, setState, adopt } from './app.js';
import { Catalogue } from '../core/catalogue.js';
import { validateBundle } from '../core/validate.js';
import { diffBundles, changeCount } from '../core/diff.js';
import { stamp, emptyBundle } from '../core/ingest.js';
import { seal, open, toBase64, fromBase64 } from '../core/crypto.js';
import { DATA_PATH } from '../config.js';

let saveTimer = null;
let catalogueCache = { bundle: null, catalogue: null };

export async function loadWorking() {
  const w = await db.get('working');
  if (w?.bundle) setState({ working: w });
}

/** The working copy, starting one from the published catalogue if needed. */
export function working() {
  const s = getState();
  if (s.working) return s.working;
  const base = s.catalogue.bundle ?? emptyBundle();
  const w = { baseVersion: base.dataVersion ?? '', startedAt: new Date().toISOString(), bundle: structuredClone(base) };
  setState({ working: w });
  persist(w);
  return w;
}

function persist(w) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => db.set('working', w), 250);
}

/** Apply one edit: `fn(bundle) → bundle`. */
export function edit(fn) {
  const w = working();
  const next = { ...w, bundle: fn(w.bundle), editedAt: new Date().toISOString() };
  setState({ working: next });
  persist(next);
  return next.bundle;
}

export async function discardWorking() {
  clearTimeout(saveTimer);
  setState({ working: null });
  await db.del('working');
}

/** A Catalogue over the working copy, rebuilt only when it changes. */
export function workingCatalogue(w = getState().working) {
  const bundle = w?.bundle ?? getState().catalogue.bundle;
  if (catalogueCache.bundle !== bundle) catalogueCache = { bundle, catalogue: new Catalogue(bundle) };
  return catalogueCache.catalogue;
}

/** What differs from the published catalogue, and what the gate says about it. */
export function review(w = getState().working) {
  const published = getState().catalogue.bundle ?? emptyBundle();
  if (!w) return { diff: [], count: 0, report: null };
  const diff = diffBundles(published, w.bundle);
  return { diff, count: changeCount(diff), report: validateBundle(w.bundle) };
}

// ---------------------------------------------------------------------------
// Publishing

const api = (s, path) => `https://api.github.com/repos/${encodeURIComponent(s.owner)}/${encodeURIComponent(s.repo)}${path}`;
const headers = (token) => ({ Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' });

export class Conflict extends Error {
  constructor(remoteVersion) {
    super(`Someone published version ${remoteVersion} after this working copy was started. Publishing now would overwrite it.`);
    this.name = 'Conflict';
    this.remoteVersion = remoteVersion;
  }
}

/** The file on GitHub right now: its sha and the data version it carries. */
async function remoteFile(gh) {
  const r = await fetch(`${api(gh, `/contents/${DATA_PATH}`)}?ref=${encodeURIComponent(gh.branch)}`, { headers: headers(gh.token), cache: 'no-store' });
  if (r.status === 404) return { sha: null, version: null };
  if (r.status === 401) throw new Error('GitHub refused the token. Check it has not expired.');
  if (!r.ok) throw new Error(`GitHub answered ${r.status} when reading the published file.`);
  const j = await r.json();
  let version = null;
  try { if (j.content) version = JSON.parse(new TextDecoder().decode(fromBase64(j.content.replace(/\n/g, '')))).dataVersion ?? null; } catch { /* unreadable: treat as unknown */ }
  return { sha: j.sha, version };
}

/**
 * Stamp, check, encrypt, commit. Returns `{ url, bundle }`.
 * `force` publishes over a newer remote version (after the admin has seen why).
 */
export async function publishWorking({ passcode, gh, force = false, onStep = () => {} }) {
  const w = getState().working;
  if (!w) throw new Error('There is nothing to publish.');
  const report = validateBundle(w.bundle);
  if (!report.ok) throw new Error('The gate found errors. Fix them before publishing.');

  onStep('Checking GitHub…');
  const remote = await remoteFile(gh);
  if (!force && remote.version && remote.version !== w.baseVersion) throw new Conflict(remote.version);

  onStep('Encrypting…');
  const bundle = stamp(w.bundle);
  const text = JSON.stringify(await seal(bundle, passcode));

  onStep('Uploading…');
  const body = { message: `Publish catalogue ${bundle.dataVersion}`, branch: gh.branch, content: toBase64(new TextEncoder().encode(text)), ...(remote.sha ? { sha: remote.sha } : {}) };
  const res = await fetch(api(gh, `/contents/${DATA_PATH}`), { method: 'PUT', headers: { ...headers(gh.token), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    if (res.status === 409) throw new Error('The published file changed while uploading. Try again.');
    if (res.status === 403 || res.status === 404) throw new Error(`The token cannot write to ${gh.owner}/${gh.repo}. Give it Contents: Read and write.`);
    throw new Error(detail.message || `GitHub answered ${res.status}.`);
  }
  const url = (await res.json()).commit?.html_url;
  await adopt(bundle, { passcode });
  await discardWorking();
  return { url, bundle };
}

/** The encrypted file, for publishing by hand. Also adopts it on this phone. */
export async function sealWorking(passcode) {
  const w = getState().working;
  const bundle = stamp(w.bundle);
  const text = JSON.stringify(await seal(bundle, passcode));
  await adopt(bundle, { passcode });
  await discardWorking();
  return text;
}

/**
 * Start again from whatever is published right now — another device's work.
 * Read through the GitHub API when a token is set (it is current the moment a
 * publish lands; the Pages copy can lag a minute behind).
 */
export async function loadLatestPublished(passcode, gh) {
  let envelope;
  if (gh?.token) {
    const r = await fetch(`${api(gh, `/contents/${DATA_PATH}`)}?ref=${encodeURIComponent(gh.branch)}`, { headers: { ...headers(gh.token), Accept: 'application/vnd.github.raw+json' }, cache: 'no-store' });
    if (!r.ok) throw new Error(`GitHub answered ${r.status} when reading the published file.`);
    envelope = await r.json();
  } else {
    const res = await fetch(DATA_PATH, { cache: 'no-cache' });
    if (!res.ok) throw new Error('Could not fetch the published catalogue.');
    envelope = await res.json();
  }
  const bundle = await open(envelope, passcode);
  await adopt(bundle);
  await discardWorking();
  return bundle;
}
