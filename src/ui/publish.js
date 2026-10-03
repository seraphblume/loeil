// Publish: the admin's way to get new workbooks onto every phone.
//
//   1. Pick LOEIL_Backend.xlsx and Catalogue.xlsx (from Files, Drive, anywhere).
//   2. The same gate as the workbook's _validation tab runs here; any error
//      stops the publish.
//   3. The bundle is encrypted with the store passcode on this phone.
//   4. Only the encrypted file is committed to GitHub. Pages redeploys, and
//      every phone picks it up on its next launch.
//
// The GitHub token is stored on this phone only and never leaves it except to
// talk to api.github.com.

import { html, useState, useEffect, useRef } from './html.js';
import { useApp } from './hooks.js';
import { Bar, Screen, ScreenTitle, Eyebrow, Panel, KV, Anchor, Secondary, Flag, Toggle } from './kit.js';
import { Icon } from './icons.js';
import { ingest, tablesFromWorkbook } from '../core/ingest.js';
import { seal, toBase64 } from '../core/crypto.js';
import { adopt, getPublishSettings, setPublishSettings, toast, getState } from '../state/app.js';
import { DEFAULT_REPO, DATA_PATH } from '../config.js';

const XLSX_SRC = new URL('../vendor/xlsx.mini.min.js', import.meta.url).href;

function loadXLSX() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = XLSX_SRC;
    s.onload = () => resolve(window.XLSX);
    s.onerror = () => reject(new Error('Could not load the spreadsheet reader.'));
    document.head.appendChild(s);
  });
}

function inferRepo() {
  const host = location.hostname;
  if (host.endsWith('.github.io')) {
    const owner = host.split('.')[0];
    const repo = location.pathname.split('/').filter(Boolean)[0] || `${owner}.github.io`;
    return { owner, repo, branch: 'main' };
  }
  return { ...DEFAULT_REPO };
}

const api = (s, path) => `https://api.github.com/repos/${encodeURIComponent(s.owner)}/${encodeURIComponent(s.repo)}${path}`;
const headers = (token) => ({ Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' });

async function commitFile(s, path, text, message) {
  const url = api(s, `/contents/${path}`);
  let sha;
  const r = await fetch(`${url}?ref=${encodeURIComponent(s.branch)}`, { headers: headers(s.token), cache: 'no-store' });
  if (r.ok) sha = (await r.json()).sha;
  else if (r.status === 401) throw new Error('GitHub refused the token. Check it has not expired.');
  else if (r.status !== 404) throw new Error(`GitHub answered ${r.status} when reading the current file.`);
  const body = { message, branch: s.branch, content: toBase64(new TextEncoder().encode(text)), ...(sha ? { sha } : {}) };
  const w = await fetch(url, { method: 'PUT', headers: { ...headers(s.token), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!w.ok) {
    const detail = await w.json().catch(() => ({}));
    if (w.status === 403 || w.status === 404) throw new Error('The token cannot write to this repository. Give it Contents: Read and write on ' + `${s.owner}/${s.repo}.`);
    throw new Error(detail.message || `GitHub answered ${w.status}.`);
  }
  return (await w.json()).commit?.html_url;
}

export function PublishScreen() {
  const current = useApp((s) => s.passcode);
  const empty = useApp((s) => s.catalogue.isEmpty);
  const [files, setFiles] = useState([]);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);
  const [newPass, setNewPass] = useState(!current);
  const [pass1, setPass1] = useState('');
  const [pass2, setPass2] = useState('');
  const [gh, setGh] = useState({ ...inferRepo(), token: '' });
  const [showToken, setShowToken] = useState(false);
  const fileRef = useRef();

  useEffect(() => { getPublishSettings().then((v) => { if (v) setGh((g) => ({ ...g, ...v })); }); }, []);
  const saveGh = (patch) => { const next = { ...gh, ...patch }; setGh(next); setPublishSettings(next); };

  const passcode = newPass ? pass1 : current;
  const passOk = newPass ? pass1.length >= 6 && pass1 === pass2 : Boolean(current);

  const check = async (picked) => {
    setBusy('Reading the workbooks…'); setError(null); setResult(null); setDone(null);
    try {
      const XLSX = await loadXLSX();
      const workbooks = [];
      for (const f of picked) {
        const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' });
        workbooks.push({ name: f.name, sheets: tablesFromWorkbook(XLSX, wb) });
      }
      setResult(ingest(workbooks));
    } catch (e) {
      setError(e.message || 'Those files could not be read as workbooks.');
    } finally {
      setBusy(null);
    }
  };

  const onPick = (e) => {
    const picked = [...(e.currentTarget.files ?? [])];
    e.currentTarget.value = '';
    if (!picked.length) return;
    const merged = [...files.filter((f) => !picked.some((p) => p.name === f.name)), ...picked].slice(-2);
    setFiles(merged);
    check(merged);
  };

  const sealIt = async () => {
    setBusy('Encrypting…');
    const envelope = await seal(result.bundle, passcode);
    return JSON.stringify(envelope);
  };

  const publish = async () => {
    setError(null);
    try {
      const text = await sealIt();
      setBusy('Uploading to GitHub…');
      const url = await commitFile(gh, DATA_PATH, text, `Publish catalogue ${result.bundle.dataVersion}`);
      await adopt(result.bundle, { passcode });
      setDone({ url, version: result.bundle.dataVersion, changedPass: newPass && Boolean(current) });
      toast('Published');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  const download = async () => {
    setError(null);
    try {
      const text = await sealIt();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      a.download = 'catalogue.enc.json';
      document.body.appendChild(a); a.click(); a.remove();
      await adopt(result.bundle, { passcode });
      toast('Encrypted file saved');
    } catch (e) { setError(e.message); } finally { setBusy(null); }
  };

  const r = result?.report;
  const canPublish = r?.ok && passOk && gh.token && gh.owner && gh.repo && !busy;

  return html`
    <${Bar} backTo=${empty ? '#/find' : '#/me'} title="Publish data" />
    <${Screen} noTabs=${empty}>
      <div class="stack pad">
        <${ScreenTitle} eyebrow="Admin" title="Send new workbooks to every phone" />
        <p class="para">Edit prices, coatings, stock or promotions in the workbooks, then publish them here. The app checks them, encrypts them with the store passcode and commits only the encrypted file to GitHub. Phones update on their next launch.</p>

        <section class="gap-s">
          <${Eyebrow}>1 · Workbooks<//>
          ${files.length > 0 && html`<${Panel}>${files.map((f) => html`<${KV} k=${f.name} v=${(f.size / 1024).toFixed(0) + ' KB'} />`)}<//>`}
          <input ref=${fileRef} type="file" multiple accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" style="display:none" onChange=${onPick} />
          <${Secondary} icon="upload" onClick=${() => fileRef.current.click()}>${files.length ? 'Pick again' : 'Pick LOEIL_Backend.xlsx and Catalogue.xlsx'}<//>
          <p class="note">Pick both at once, or one after the other. From Google Sheets, download each as Microsoft Excel (.xlsx) first.</p>
        </section>

        ${r && html`<section class="gap-s">
          <${Eyebrow}>The gate<//>
          <${Panel}>
            <${KV} k="Safe to publish?" v=${r.ok ? 'Yes' : `No — ${r.errors.length} to fix`} em />
            ${Object.entries(r.counts).map(([k, v]) => html`<${KV} k=${k} v=${v.toLocaleString('en')} />`)}
          <//>
          ${['errors', 'warnings', 'notes'].map((kind) => r[kind].length > 0 && html`<div class="gap-s">
            <div class="label">${{ errors: 'Fix before publishing', warnings: 'Worth a look', notes: 'For the record' }[kind]}</div>
            <${Panel} tight>${r[kind].slice(0, 60).map((i) => html`<div class="gate-item"><span class="sh">${i.sheet}</span><span class=${kind === 'errors' ? '' : 'silver'}>${i.message}</span></div>`)}
              ${r[kind].length > 60 && html`<div class="gate-item"><span class="sh"></span><span class="muted">and ${r[kind].length - 60} more</span></div>`}<//>
          </div>`)}
        </section>`}

        <section class="gap-s">
          <${Eyebrow}>2 · Store passcode<//>
          ${current && html`<div class="row" style="padding:0">
            <span class="main"><span class="t" style="font-size:14px">Use a new passcode</span><span class="d">${newPass ? 'Every phone will need the new one' : 'Publishing with the passcode this phone already uses'}</span></span>
            <${Toggle} label="Use a new passcode" on=${newPass} onChange=${setNewPass} />
          </div>`}
          ${newPass && html`
            <label class="field"><${Icon} name="lock" /><input type="password" autocomplete="new-password" placeholder="New passcode (6+ characters)" value=${pass1} onInput=${(e) => setPass1(e.currentTarget.value)} /></label>
            <label class="field"><${Icon} name="lock" /><input type="password" autocomplete="new-password" placeholder="Same again" value=${pass2} onInput=${(e) => setPass2(e.currentTarget.value)} /></label>
            ${pass2 && pass1 !== pass2 && html`<p class="note">The two do not match.</p>`}`}
        </section>

        <section class="gap-s">
          <${Eyebrow}>3 · GitHub<//>
          <div class="form-group">
            <label class="form-row"><span class="k">Owner</span><input value=${gh.owner} autocapitalize="off" onInput=${(e) => saveGh({ owner: e.currentTarget.value.trim() })} /></label>
            <label class="form-row"><span class="k">Repository</span><input value=${gh.repo} autocapitalize="off" onInput=${(e) => saveGh({ repo: e.currentTarget.value.trim() })} /></label>
            <label class="form-row"><span class="k">Branch</span><input value=${gh.branch} autocapitalize="off" onInput=${(e) => saveGh({ branch: e.currentTarget.value.trim() })} /></label>
            <label class="form-row"><span class="k">Token</span><input type=${showToken ? 'text' : 'password'} autocomplete="off" autocapitalize="off" placeholder="github_pat_…" value=${gh.token} onInput=${(e) => saveGh({ token: e.currentTarget.value.trim() })} />
              <button type="button" class="textbtn small" onClick=${() => setShowToken(!showToken)}>${showToken ? 'Hide' : 'Show'}</button></label>
          </div>
          <p class="note">Kept on this phone only. Create a fine-grained token at github.com → Settings → Developer settings → Fine-grained tokens, limited to ${gh.owner}/${gh.repo} with <strong>Contents: Read and write</strong> and nothing else.</p>
        </section>

        ${error && html`<${Flag}>${error}<//>`}
        ${busy && html`<p class="para">${busy}</p>`}
        ${done && html`<${Flag} icon="check">
          Published ${done.version}. GitHub Pages redeploys in about a minute; phones pick it up on their next launch.
          ${done.changedPass ? ' Tell the team the new passcode — their phones will ask for it.' : ''}
          ${done.url && html` <a class="link" href=${done.url} target="_blank" rel="noopener">See the commit</a>`}
        <//>`}

        <${Anchor} icon="cloud" disabled=${!canPublish} onClick=${publish}>Publish<//>
        <${Secondary} icon="download" disabled=${!(r?.ok && passOk) || Boolean(busy)} onClick=${download}>Save the encrypted file instead<//>
        <p class="note">Saving the file is for publishing by hand: commit it to the repository as ${DATA_PATH}.</p>
      </div>
    <//>`;
}
