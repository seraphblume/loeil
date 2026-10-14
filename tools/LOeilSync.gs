/**
 * L'Œil — Google Drive backup
 * ------------------------------------------------------------------
 * The other end of Me → Backup on the admin's phone. It keeps the phone's
 * backups in a Drive folder of yours and hands them back when asked.
 *
 * Everything it receives is already sealed on the phone with the store
 * passcode (AES-256-GCM), so the files in Drive are ciphertext and this script
 * never sees a client's name. What it can read is the label beside each file:
 * when it was made, on which phone, and how many clients and orders it holds.
 *
 * Set up once, on a computer:
 *   1. script.google.com → New project. Paste this file over Code.gs and save.
 *   2. Run setup() and approve the permissions (Drive, to keep the files).
 *   3. Deploy → New deployment → type Web app.
 *        Execute as: Me    ·    Who has access: Anyone
 *      "Anyone" is how a phone reaches it without signing in; the key below is
 *      what keeps everyone else out.
 *   4. Run showLink() and paste the line it prints into L'Œil →
 *      Me → Backup → Google link.
 *
 * To lock out a phone you no longer trust: run rotateKey(), then paste the new
 * link on the phones you keep. After editing this file, Deploy → Manage
 * deployments → edit → New version, so the link stays the same.
 */

const APP = 'loeil-sync';
const FOLDER_NAME = 'L’Œil backups';
const KEEP = 30;                        // backups kept; the oldest go to the Drive bin

/* ──────────────────────────── set-up ──────────────────────────── */

function setup() {
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('KEY')) props.setProperty('KEY', newKey_());
  const folder = folder_();
  Logger.log('Ready. Backups go to the Drive folder “' + folder.getName() + '”.');
  Logger.log('Next: Deploy → New deployment → Web app (Execute as: Me · Who has access: Anyone), then run showLink.');
}

function showLink() {
  const key = PropertiesService.getScriptProperties().getProperty('KEY');
  if (!key) throw new Error('Run setup first.');
  const url = ScriptApp.getService().getUrl();
  if (!url || !/\/exec$/.test(url)) {
    Logger.log('Not deployed as a web app yet (or only as a test). Deploy it, then run showLink again.');
    Logger.log('Or paste the Web app URL from Deploy → Manage deployments, followed by #' + key);
    return;
  }
  Logger.log('Paste this into L’Œil → Me → Backup → Google link:');
  Logger.log(url + '#' + key);
}

/** A new key: every phone needs the new link; the backups stay. */
function rotateKey() {
  PropertiesService.getScriptProperties().setProperty('KEY', newKey_());
  Logger.log('New key set. Run showLink and paste the new link on the phones you keep.');
}

function newKey_() {
  return Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').slice(0, 16);
}

function folder_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('FOLDER_ID');
  if (id) {
    try {
      const f = DriveApp.getFolderById(id);
      if (!f.isTrashed()) return f;
    } catch (e) { /* deleted: make a new one */ }
  }
  const f = DriveApp.createFolder(FOLDER_NAME);
  props.setProperty('FOLDER_ID', f.getId());
  return f;
}

/* ──────────────────────────── the web app ──────────────────────────── */

/** A GET only says the script is there. No data ever comes out of a GET. */
function doGet() {
  return out_({ ok: true });
}

function doPost(e) {
  let req;
  try {
    req = JSON.parse(e && e.postData ? e.postData.contents : '');
  } catch (err) {
    return out_({ ok: false, error: 'bad-request' });
  }
  if (!keyOk_(req && req.key)) return out_({ ok: false, error: 'bad-key' });
  try {
    switch (req.op) {
      case 'ping': {
        const all = list_();
        return out_({ ok: true, count: all.length, latest: all[0] || null });
      }
      case 'list': return out_({ ok: true, backups: list_() });
      case 'put': return out_(put_(req.envelope, req.meta || {}));
      case 'get': return out_(get_(req.id));
      default: return out_({ ok: false, error: 'bad-request' });
    }
  } catch (err) {
    return out_({ ok: false, error: 'server', message: String((err && err.message) || err) });
  }
}

function out_(obj) {
  obj.app = APP;
  obj.v = 1;
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** Compares every character, so the answer takes as long for a near miss as for nonsense. */
function keyOk_(given) {
  const key = PropertiesService.getScriptProperties().getProperty('KEY');
  if (!key || typeof given !== 'string' || given.length !== key.length) return false;
  let diff = 0;
  for (let i = 0; i < key.length; i++) diff |= key.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}

/* ──────────────────────────── the backups ──────────────────────────── */

/** Every backup in the folder, newest first, by the label each one carries. */
function list_() {
  const it = folder_().getFiles();
  const out = [];
  while (it.hasNext()) {
    const f = it.next();
    let meta = {};
    try { meta = JSON.parse(f.getDescription() || '{}'); } catch (e) { meta = {}; }
    if (meta.app !== APP) continue;                      // anything else in the folder is left alone
    out.push({
      id: f.getId(), savedAt: meta.savedAt, device: meta.device || null,
      clients: meta.clients || 0, orders: meta.orders || 0, bytes: meta.bytes || f.getSize(), hash: meta.hash || null,
    });
  }
  out.sort(function (a, b) { return a.savedAt < b.savedAt ? 1 : a.savedAt > b.savedAt ? -1 : 0; });
  return out;
}

function put_(envelope, meta) {
  if (!envelope || envelope.format !== 'loeil-envelope' || typeof envelope.payload !== 'string') {
    return { ok: false, error: 'bad-request', message: 'That is not a sealed L’Œil backup.' };
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const before = list_();
    // The same records as the newest copy: confirm it rather than keep a twin.
    if (meta.hash && before[0] && before[0].hash === meta.hash) return { ok: true, unchanged: true, saved: before[0] };

    const body = JSON.stringify(envelope);
    const savedAt = new Date().toISOString();
    const label = {
      app: APP, savedAt: savedAt, device: String(meta.device || '').slice(0, 60),
      clients: Number(meta.clients) || 0, orders: Number(meta.orders) || 0,
      hash: String(meta.hash || '').slice(0, 64), bytes: body.length,
    };
    const file = folder_().createFile('loeil-backup-' + savedAt.replace(/[:.]/g, '-') + '.json', body, 'application/json');
    file.setDescription(JSON.stringify(label));

    // Keep the newest KEEP; the rest go to the Drive bin (recoverable for 30 days).
    const all = [{ id: file.getId(), savedAt: savedAt }].concat(before);
    all.slice(KEEP).forEach(function (b) {
      try { DriveApp.getFileById(b.id).setTrashed(true); } catch (e) { /* already gone */ }
    });
    return { ok: true, saved: { id: file.getId(), savedAt: savedAt, device: label.device, clients: label.clients,
                                orders: label.orders, bytes: label.bytes, hash: label.hash } };
  } finally {
    lock.releaseLock();
  }
}

/** One backup by id (or the newest) — only ever a file from the backup folder. */
function get_(id) {
  const all = list_();
  const pick = id ? all.filter(function (b) { return b.id === id; })[0] : all[0];
  if (!pick) return { ok: false, error: id ? 'not-found' : 'no-backup' };
  const text = DriveApp.getFileById(pick.id).getBlob().getDataAsString();
  return { ok: true, envelope: JSON.parse(text), meta: pick };
}
