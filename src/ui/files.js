// Backups as files: export one, restore one, or bring in the Alpha workbook's CRM.
//
// On a seller's phone this is the backup. On the admin's phone, Google Drive is
// the backup and these stay as the offline fallback (Me → Backup → Files).
// The same Restore sheet takes a backup from a file or from Drive.

import { html, useState, useRef } from './html.js';
import { Sheet, Panel, KV, Anchor, Secondary, Quiet, Confirm, List, Row } from './kit.js';
import { backupJSON, previewBackup, restoreBackup, previewAlpha, importAlpha, toast } from '../state/app.js';
import { loadXLSX } from './data/io.js';
import { plural } from '../core/util.js';

export const BACKUP_ACCEPT = 'application/json,.json,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Hand the backup to the share sheet, or download it. */
export async function exportFile() {
  const stamp = new Date().toISOString().slice(0, 10);
  const name = `loeil-backup-${stamp}.json`;
  const blob = new Blob([backupJSON()], { type: 'application/json' });
  const file = new File([blob], name, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'L’Œil backup' }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/** A picked file → what restoring it would do (a backup, or the Alpha workbook). */
export async function readPicked(f) {
  if (/\.xlsx$/i.test(f.name) || f.type.includes('spreadsheet')) return previewAlpha(await crmRows(f));
  return previewBackup(await f.text());
}

/** The hidden file input and what it does when a file is chosen. */
export function useFilePicker(setRestore) {
  const ref = useRef();
  const onChange = async (e) => {
    const f = e.currentTarget.files?.[0];
    e.currentTarget.value = '';
    if (!f) return;
    try { setRestore(await readPicked(f)); } catch (err) { toast(err.message); }
  };
  const input = html`<input ref=${ref} type="file" accept=${BACKUP_ACCEPT} style="display:none" onChange=${onChange} />`;
  return [input, () => ref.current?.click()];
}

/** The CRM tab of the Alpha workbook, as rows of cells. */
async function crmRows(file) {
  const XLSX = await loadXLSX();
  const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array' });
  const read = (n) => XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: null });
  const name = wb.SheetNames.find((n) => n.trim().toUpperCase() === 'CRM')
    ?? wb.SheetNames.find((n) => read(n).slice(0, 12).some((r) => String(r?.[0] ?? '').trim().toLowerCase() === 'sell id'));
  if (!name) throw new Error('This workbook has no CRM table — the sheet with a Sell ID column.');
  return read(name);
}

function AlphaSheet({ parsed, onClose }) {
  const { counts, alpha } = parsed;
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    const done = await importAlpha(alpha);
    toast(done.clients || done.orders ? `Added ${plural(done.clients, 'client', 'clients')} and ${plural(done.orders, 'past sale', 'past sales')}` : 'Nothing new to add');
    onClose();
  };
  const nothing = !counts.clients && !counts.orders && !counts.updated;
  return html`<${Sheet} title="Import from Alpha" onClose=${onClose}>
    <div class="pad stack tight">
      <${Panel}>
        <${KV} k="People" v=${alpha.people.length} />
        <${KV} k="New clients" v=${counts.clients} />
        ${counts.matched > 0 && html`<${KV} k="Already here" v=${counts.updated ? `${counts.matched} · ${counts.updated} brought up to date` : counts.matched} />`}
        <${KV} k="Past sales" v=${counts.already ? `${counts.orders} new · ${counts.already} already here` : counts.orders} />
      <//>
      <p class="para">Each client comes with their glasses and contact lens prescriptions, and every ticket becomes a sale in their history. Repeat visits are one client: the same name with the same phone.</p>
      <p class="note">Someone already on this phone keeps what is here; only a newer prescription or a missing phone number is filled in. Importing the same workbook again adds only what is new.</p>
      ${nothing ? html`<${Quiet} onClick=${onClose}>Nothing new — close<//>`
        : html`<${Anchor} disabled=${busy} onClick=${run}>${busy ? 'Adding…' : 'Add to this phone'}<//>`}
    </div>
  <//>`;
}

const whenSaved = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const fromLabel = (p) => (p.source === 'drive' ? 'Google Drive' : p.source === 'web' ? 'This app' : `The ${p.source} app`);

export function RestoreSheet({ parsed, onClose }) {
  const [confirm, setConfirm] = useState(false);
  if (parsed.source === 'Alpha') return html`<${AlphaSheet} parsed=${parsed} onClose=${onClose} />`;
  const run = async (mode) => {
    const added = await restoreBackup(parsed, mode);
    toast(mode === 'replace' ? 'Backup restored' : `Added ${plural(added.clients, 'client', 'clients')} and ${plural(added.orders, 'order', 'orders')}`);
    onClose();
  };
  if (confirm) return html`<${Confirm} title="Replace everything?" message="Every client and order on this phone is replaced by the backup. Back up or export first if you are not sure." action="Replace" onConfirm=${() => run('replace')} onClose=${onClose} />`;
  return html`<${Sheet} title="Restore" onClose=${onClose}>
    <div class="pad stack tight">
      <${Panel}>
        <${KV} k="From" v=${fromLabel(parsed)} />
        ${parsed.savedAt && html`<${KV} k="Backed up" v=${whenSaved.format(new Date(parsed.savedAt))} />`}
        ${parsed.device && html`<${KV} k="On" v=${parsed.device} />`}
        <${KV} k="Clients" v=${parsed.clients.length} />
        <${KV} k="Orders" v=${parsed.orders.length} />
      <//>
      <p class="para">Merging adds what this phone does not have and leaves everything already here untouched.</p>
      <${Anchor} onClick=${() => run('merge')}>Merge into this phone<//>
      <${Quiet} danger onClick=${() => setConfirm(true)}>Replace everything instead<//>
    </div>
  <//>`;
}

/** Me → Backup → Files, on the admin's phone. */
export function FilesSheet({ onClose, onPicked }) {
  const [input, pick] = useFilePicker((parsed) => { onClose(); onPicked(parsed); });
  return html`<${Sheet} title="Files" onClose=${onClose}>
    <div class="stack tight">
      <p class="para pad">For when there is no connection, or to bring in a backup from the earlier iPhone and Android apps or the Alpha workbook’s CRM.</p>
      <${List}>
        <${Row} icon="download" title="Export a backup file" detail="Share it, or save it to Files" onClick=${() => { exportFile(); }} />
        <${Row} icon="upload" title="Restore from a file or the Alpha workbook" detail="A .json backup, or Alpha’s CRM tab" onClick=${pick} />
      <//>
      ${input}
    </div>
  <//>`;
}
