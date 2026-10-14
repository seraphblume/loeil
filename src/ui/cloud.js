// Me → Backup, on the admin's phone: Google Drive the way WhatsApp does its chat
// backup — the last backup, one button, how often, and restoring from it.

import { html, useState, useEffect } from './html.js';
import { useApp } from './hooks.js';
import { Bar, Screen, Eyebrow, Panel, KV, Section, Row, Anchor, Secondary, Quiet, Flag, Sheet, Confirm, Empty } from './kit.js';
import { Icon } from './icons.js';
import { toast } from '../state/app.js';
import { backupNow, setFrequency, setLink, clearLink, listBackups, fetchBackup, isAdminPhone } from '../state/cloud.js';
import { FREQUENCIES, nextDue } from '../core/cloud.js';
import { WrongPasscode } from '../core/crypto.js';
import { CLOUD } from '../config.js';
import { FilesSheet, RestoreSheet } from './files.js';
import { plural } from '../core/util.js';

const SCRIPT_URL = 'https://github.com/seraphblume/loeil/blob/main/tools/LOeilSync.gs';

const stamp = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const clock = new Intl.DateTimeFormat('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
const when = (d) => (d ? stamp.format(new Date(d)) : '—');
const size = (bytes) => (bytes == null ? '—' : bytes < 1024 ? `${bytes} B` : bytes < 1048576 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1048576).toFixed(1)} MB`);
const holds = (b) => (b ? `${plural(b.clients, 'client', 'clients')} · ${plural(b.orders, 'order', 'orders')}` : '—');

export function BackupScreen() {
  const s = useApp();
  const c = s.cloud ?? { frequency: 'manual' };
  const [sheet, setSheet] = useState(null);
  const [restore, setRestore] = useState(null);

  if (!isAdminPhone(s)) {
    return html`<${Bar} backTo="#/me" title="Backup" /><${Screen}><div class="pad"><${Empty} title="Admin only">Google Drive backup is set up on the admin’s phone. Export a file from Me instead.<//></div><//>`;
  }

  const run = async () => {
    try {
      const r = await backupNow();
      toast(r === 'unchanged' ? 'Already up to date' : 'Backed up to Google Drive');
    } catch (e) { toast(e.message); }
  };
  const due = nextDue(c.frequency, c.lastAt);
  const last = c.lastBackup;

  return html`
    <${Bar} backTo="#/me" title="Backup" />
    <${Screen}>
      <div class="stack loose">
        <div class="pad gap-s">
          <${Eyebrow}>Google Drive<//>
          <p class="para">Your clients and orders, sealed with the store passcode on this phone before they leave it. Drive keeps only the encrypted file, in your own Google account.</p>
          <${Panel}>
            <${KV} k="Last backup" v=${c.lastAt ? when(c.lastAt) : c.link ? 'Not yet' : 'Off'} />
            ${last && html`<${KV} k="Holds" v=${holds(last)} />`}
            ${last && html`<${KV} k="Size" v=${size(last.bytes)} />`}
            ${last?.device && html`<${KV} k="From" v=${last.device} />`}
          <//>
          ${c.lastError && html`<${Flag}>Last try failed: ${c.lastError}<//>`}
          ${c.link ? html`<${Anchor} icon="cloud" disabled=${Boolean(c.busy)} onClick=${run}>${c.busy === 'backup' ? 'Backing up…' : 'Back up'}<//>`
            : html`<${Anchor} icon="cloud" onClick=${() => setSheet('link')}>Set up Google Drive<//>`}
        </div>

        <${Section} title="Back up automatically"
          footer=${`A web app cannot wake itself, so a schedule runs while L’Œil is open: daily, the first time it is opened after ${CLOUD.DAILY_HOUR}:00 a.m.; every ${CLOUD.EVERY_HOURS} hours, on opening once that long has passed and while it stays open. Nothing is sent when nothing changed.`}>
          ${FREQUENCIES.map((f) => html`<${Row} title=${f.label}
            detail=${f.id === c.frequency && f.id !== 'manual' && c.link && due ? (due <= new Date() ? 'Due now' : `Next after ${clock.format(due)}`) : null}
            end=${f.id === c.frequency ? html`<${Icon} name="check" />` : null}
            onClick=${() => setFrequency(f.id)} />`)}
        <//>

        <${Section} title="Restore">
          <${Row} icon="download" title="Restore from Google Drive" detail="Pick a backup, then merge it in or replace this phone’s records" chev
            off=${!c.link} onClick=${c.link ? () => setSheet('list') : () => setSheet('link')} />
          <${Row} icon="doc" title="Files" detail="Export a file, restore one, or import the Alpha workbook" chev onClick=${() => setSheet('files')} />
        <//>

        <${Section} title="Connection">
          <${Row} icon="lock" title="Google link" detail=${c.link ? 'Connected to your backup script' : 'Not set'} chev onClick=${() => setSheet('link')} />
        <//>
      </div>
    <//>
    ${sheet === 'link' && html`<${LinkSheet} current=${c.link} onClose=${() => setSheet(null)} />`}
    ${sheet === 'list' && html`<${DriveSheet} onClose=${() => setSheet(null)} onPicked=${(p) => { setSheet(null); setRestore(p); }} />`}
    ${sheet === 'files' && html`<${FilesSheet} onClose=${() => setSheet(null)} onPicked=${setRestore} />`}
    ${restore && html`<${RestoreSheet} parsed=${restore} onClose=${() => setRestore(null)} />`}`;
}

/** Paste the link the script printed. Checked against the script before it is kept. */
function LinkSheet({ current, onClose }) {
  const [url, setUrl] = useState(current ? `${current.url}#${current.key}` : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [confirm, setConfirm] = useState(false);
  const save = async () => {
    setBusy(true); setError(null);
    try {
      const info = await setLink(url);
      toast(info.count ? `Connected · ${plural(info.count, 'backup', 'backups')} in Drive` : 'Connected · no backups yet');
      onClose();
    } catch (e) { setError(e.message); setBusy(false); }
  };
  if (confirm) {
    return html`<${Confirm} title="Remove the Google link?" message="This phone stops backing up. The backups already in Drive stay there." action="Remove"
      onConfirm=${async () => { await clearLink(); toast('Google Drive backup is off'); }} onClose=${onClose} />`;
  }
  return html`<${Sheet} title="Google link" onClose=${onClose}>
    <div class="pad stack tight">
      <p class="para">Once, on a computer: open <a href=${SCRIPT_URL} target="_blank" rel="noopener">LOeilSync.gs</a>, paste it into a new project at script.google.com, run <strong>setup</strong>, then Deploy → New deployment → Web app, executed as you, for anyone. Run <strong>showLink</strong> and paste what it prints here.</p>
      <label class="field"><${Icon} name="lock" /><input type="password" autocomplete="off" autocapitalize="off" spellcheck="false"
        placeholder="https://script.google.com/macros/s/…/exec#key" value=${url} onInput=${(e) => setUrl(e.currentTarget.value.trim())} /></label>
      <p class="note">The part after # is the key that lets this phone in. It stays on this phone.</p>
      ${error && html`<${Flag}>${error}<//>`}
      <${Anchor} disabled=${busy || !url} onClick=${save}>${busy ? 'Checking…' : 'Check and save'}<//>
      ${current && html`<${Quiet} danger onClick=${() => setConfirm(true)}>Remove the link<//>`}
    </div>
  <//>`;
}

/** The backups in Drive, newest first. Tapping one opens it with the passcode. */
function DriveSheet({ onClose, onPicked }) {
  const [list, setList] = useState(null);
  const [error, setError] = useState(null);
  const [opening, setOpening] = useState(null);
  const [needPass, setNeedPass] = useState(null);
  const [pass, setPass] = useState('');

  useEffect(() => { listBackups().then(setList, (e) => setError(e.message)); }, []);

  const openOne = async (b, passcode) => {
    setOpening(b.id); setError(null);
    try {
      onPicked(await fetchBackup(b.id, passcode));
    } catch (e) {
      if (e instanceof WrongPasscode) setNeedPass(b);
      else setError(e.message);
      setOpening(null);
    }
  };

  if (needPass) {
    return html`<${Sheet} title="Earlier passcode" onClose=${onClose}>
      <div class="pad stack tight">
        <p class="para">This backup was sealed with the store passcode in use on ${when(needPass.savedAt)}. Enter that one to open it.</p>
        <label class="field"><${Icon} name="lock" /><input type="password" autocomplete="off" placeholder="Passcode" value=${pass} onInput=${(e) => setPass(e.currentTarget.value)} /></label>
        ${error && html`<${Flag}>${error}<//>`}
        <${Anchor} disabled=${!pass || Boolean(opening)} onClick=${() => openOne(needPass, pass)}>${opening ? 'Opening…' : 'Open'}<//>
      </div>
    <//>`;
  }

  return html`<${Sheet} title="Restore from Google Drive" onClose=${onClose}>
    <div class="stack tight">
      ${error && html`<div class="pad"><${Flag}>${error}<//></div>`}
      ${!list && !error && html`<p class="para pad">Asking Drive…</p>`}
      ${list && list.length === 0 && html`<div class="pad"><${Empty} title="Nothing in Drive yet">Tap Back up first.<//></div>`}
      ${list && list.length > 0 && html`<p class="para pad">Newest first. Nothing changes until you choose to merge or replace.</p>
        <div class="list">${list.map((b, i) => html`<${Row} title=${when(b.savedAt)}
          detail=${`${holds(b)}${b.device ? ' · ' + b.device : ''}`}
          end=${opening === b.id ? 'Opening…' : i === 0 ? 'Latest' : size(b.bytes)}
          onClick=${() => openOne(b)} />`)}</div>`}
    </div>
  <//>`;
}
