// Review and publish: everything in the working copy that differs from what the
// phones have, the gate's verdict, and the one button that sends it out.
//
// Publishing encrypts with the store passcode on this phone and commits only
// the encrypted file to GitHub. Pages redeploys; every phone picks it up on its
// next launch. The GitHub token never leaves this phone except to talk to
// api.github.com.

import { html, useState, useEffect, useRef, useMemo } from './html.js';
import { useApp } from './hooks.js';
import { Bar, Screen, ScreenTitle, Eyebrow, Panel, KV, Anchor, Secondary, Quiet, Flag, Toggle } from './kit.js';
import { Icon } from './icons.js';
import { getPublishSettings, setPublishSettings, toast } from '../state/app.js';
import { review, publishWorking, sealWorking, loadLatestPublished, edit, Conflict } from '../state/working.js';
import { applyPieces } from '../core/edits.js';
import { readFiles } from './data/io.js';
import { DEFAULT_REPO, DATA_PATH } from '../config.js';
import { go } from './router.js';
import { tr, trn } from '../i18n.js';

function inferRepo() {
  const host = location.hostname;
  if (host.endsWith('.github.io')) {
    const owner = host.split('.')[0];
    const repo = location.pathname.split('/').filter(Boolean)[0] || `${owner}.github.io`;
    return { owner, repo, branch: 'main' };
  }
  return { ...DEFAULT_REPO };
}

function Changes({ diff }) {
  const [open, setOpen] = useState(null);
  return html`<section class="gap-s">
    <${Eyebrow}>${tr('Changes')}<//>
    <${Panel} tight>${diff.map((d) => {
      const n = d.added.length + d.removed.length + d.changed.length;
      const lines = [...d.changed.map((c) => `${c.label}: ${c.what}`), ...d.added.map((a) => tr('Added: {item}', { item: a })), ...d.removed.map((r) => tr('Removed: {item}', { item: r }))];
      return html`<div class="kv lined" style="display:block">
        <button type="button" style="display:flex;width:100%;justify-content:space-between" onClick=${() => setOpen(open === d.title ? null : d.title)}>
          <span>${d.title}</span><span class="silver num">${[d.changed.length && `${d.changed.length} changed`, d.added.length && `${d.added.length} added`, d.removed.length && `${d.removed.length} removed`].filter(Boolean).join(' · ')} ${open === d.title ? '▴' : '▾'}</span>
        </button>
        ${open === d.title && html`<div class="gap-s" style="padding-top:8px">${lines.slice(0, 40).map((l) => html`<div class="note" style="color:var(--silver)">${l}</div>`)}
          ${n > 40 && html`<div class="note">${tr('and {a} more', { a: n - 40 })}</div>`}</div>`}
      </div>`;
    })}<//>
  </section>`;
}

function Gate({ report }) {
  return html`<section class="gap-s">
    <${Eyebrow}>${tr('The gate')}<//>
    <${Panel}><${KV} k=${tr('Safe to publish?')} v=${report.ok ? tr('Yes') : tr('No — {n} to fix', { n: report.errors.length })} em /><//>
    ${['errors', 'warnings', 'notes'].map((kind) => report[kind].length > 0 && html`<div class="gap-s">
      <div class="label">${{ errors: tr('Fix before publishing'), warnings: tr('Worth a look'), notes: tr('For the record') }[kind]}</div>
      <${Panel} tight>${report[kind].slice(0, 50).map((i) => html`<div class="gate-item"><span class="sh">${i.sheet}</span><span class=${kind === 'errors' ? '' : 'silver'}>${i.message}</span></div>`)}
        ${report[kind].length > 50 && html`<div class="gate-item"><span class="sh"></span><span class="muted">${tr('and {a} more', { a: report[kind].length - 50 })}</span></div>`}<//>
    </div>`)}
  </section>`;
}

export function PublishScreen() {
  const current = useApp((s) => s.passcode);
  const empty = useApp((s) => s.catalogue.isEmpty);
  const w = useApp((s) => s.working);
  const r = useMemo(() => review(w), [w]);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [conflict, setConflict] = useState(null);
  const [done, setDone] = useState(null);
  const [newPass, setNewPass] = useState(!current);
  const [pass1, setPass1] = useState('');
  const [pass2, setPass2] = useState('');
  const [gh, setGh] = useState({ ...inferRepo(), token: '' });
  const [showToken, setShowToken] = useState(false);
  const fileRef = useRef();

  useEffect(() => { getPublishSettings().then((v) => { if (v) setGh((g) => ({ ...g, ...v })); }); }, []);
  useEffect(() => { if (!current) setNewPass(true); }, [current]);
  const saveGh = (patch) => { const next = { ...gh, ...patch }; setGh(next); setPublishSettings(next); };

  const passcode = newPass ? pass1 : current;
  const passOk = newPass ? pass1.length >= 6 && pass1 === pass2 : Boolean(current);

  const startFromFiles = async (e) => {
    const files = [...(e.currentTarget.files ?? [])];
    e.currentTarget.value = '';
    if (!files.length) return;
    setBusy(tr('Reading the files…')); setError(null);
    try {
      const { pieces, report, summary } = await readFiles(files);
      if (report.errors.length) setError(report.errors.map((x) => `${x.sheet}: ${x.message}`).join(' '));
      edit((b) => applyPieces(b, pieces));
      toast(summary.join(' · ') || tr('Imported'));
    } catch (err) { setError(err.message); } finally { setBusy(null); }
  };

  const publish = async (force = false) => {
    setError(null); setConflict(null);
    try {
      const res = await publishWorking({ passcode, gh, force, onStep: setBusy });
      setDone({ url: res.url, version: res.bundle.dataVersion, changedPass: newPass && Boolean(current) });
      setNewPass(false); setPass1(''); setPass2('');
      toast(tr('Published'));
    } catch (e) {
      if (e instanceof Conflict) setConflict(e); else setError(e.message);
    } finally { setBusy(null); }
  };

  const saveFile = async () => {
    setError(null);
    try {
      setBusy(tr('Encrypting…'));
      const text = await sealWorking(passcode);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      a.download = 'catalogue.enc.json';
      document.body.appendChild(a); a.click(); a.remove();
      toast(tr('Encrypted file saved'));
    } catch (e) { setError(e.message); } finally { setBusy(null); }
  };

  const reload = async () => {
    setError(null); setConflict(null);
    try { setBusy(tr('Loading the latest…')); await loadLatestPublished(current, gh); toast(tr('Now on the latest published catalogue')); }
    catch (e) { setError(e.message); } finally { setBusy(null); }
  };

  const canPublish = w && r.report?.ok && r.count > 0 && passOk && gh.token && gh.owner && gh.repo && !busy;

  return html`
    <${Bar} backTo=${empty ? '#/find' : '#/me/data'} title=${tr('Publish')} />
    <${Screen} noTabs=${empty}>
      <div class="stack pad">
        <${ScreenTitle} eyebrow=${tr('Admin')} title=${empty && !w ? tr('Publish the first catalogue') : tr('Review and publish')} />

        ${done && html`<${Flag} icon="check">
          ${tr('Published {version}. GitHub Pages redeploys in about a minute; phones pick it up on their next launch.', { version: done.version })}
          ${done.changedPass && ' ' + tr('Tell the team the new passcode — their phones will ask for it.')}
          ${done.url && html` <a class="link" href=${done.url} target="_blank" rel="noopener">${tr('See the commit')}</a>`}
        <//>`}

        ${!w && !done && (empty
          ? html`<p class="para">${tr('Nothing has been published yet. Bring the catalogue in from the workbooks and the stock report once — after that, everything is edited here.')}</p>
              <input ref=${fileRef} type="file" multiple accept=".xlsx,.pdf" style="display:none" onChange=${startFromFiles} />
              <${Anchor} icon="upload" onClick=${() => fileRef.current.click()}>${tr('Import workbooks or stock report')}<//>`
          : html`<p class="para">${tr('The working copy is the same as what the phones have — nothing to publish. Make changes in Catalogue data first.')}</p>
              <${Secondary} icon="edit" onClick=${() => go('#/me/data')}>${tr('Open Catalogue data')}<//>`)}

        ${w && html`
          ${r.count === 0 ? html`<p class="para">${tr('No changes yet.')}</p>` : html`<${Changes} diff=${r.diff} />`}
          ${empty && html`<input ref=${fileRef} type="file" multiple accept=".xlsx,.pdf" style="display:none" onChange=${startFromFiles} />
            <${Secondary} icon="upload" onClick=${() => fileRef.current.click()}>${tr('Import more files')}<//>`}
          ${r.report && html`<${Gate} report=${r.report} />`}

          <section class="gap-s">
            <${Eyebrow}>${tr('Store passcode')}<//>
            ${current && html`<div class="row" style="padding:0">
              <span class="main"><span class="t" style="font-size:14px">${tr('Use a new passcode')}</span><span class="d">${newPass ? tr('Every phone will need the new one') : tr('Publishing with the passcode this phone already uses')}</span></span>
              <${Toggle} label=${tr('Use a new passcode')} on=${newPass} onChange=${setNewPass} />
            </div>`}
            ${newPass && html`
              <label class="field"><${Icon} name="lock" /><input type="password" autocomplete="new-password" placeholder=${tr('New passcode (6+ characters)')} value=${pass1} onInput=${(e) => setPass1(e.currentTarget.value)} /></label>
              <label class="field"><${Icon} name="lock" /><input type="password" autocomplete="new-password" placeholder=${tr('Same again')} value=${pass2} onInput=${(e) => setPass2(e.currentTarget.value)} /></label>
              ${pass2 && pass1 !== pass2 && html`<p class="note">${tr('The two do not match.')}</p>`}`}
          </section>

          <section class="gap-s">
            <${Eyebrow}>${tr('GitHub')}<//>
            <div class="form-group">
              <label class="form-row"><span class="k">${tr('Owner')}</span><input value=${gh.owner} autocapitalize="off" onInput=${(e) => saveGh({ owner: e.currentTarget.value.trim() })} /></label>
              <label class="form-row"><span class="k">${tr('Repository')}</span><input value=${gh.repo} autocapitalize="off" onInput=${(e) => saveGh({ repo: e.currentTarget.value.trim() })} /></label>
              <label class="form-row"><span class="k">${tr('Branch')}</span><input value=${gh.branch} autocapitalize="off" onInput=${(e) => saveGh({ branch: e.currentTarget.value.trim() })} /></label>
              <label class="form-row"><span class="k">${tr('Token')}</span><input type=${showToken ? 'text' : 'password'} autocomplete="off" autocapitalize="off" placeholder=${tr('github_pat_…')} value=${gh.token} onInput=${(e) => saveGh({ token: e.currentTarget.value.trim() })} />
                <button type="button" class="textbtn small" onClick=${() => setShowToken(!showToken)}>${showToken ? tr('Hide') : tr('Show')}</button></label>
            </div>
            <p class="note">${tr('Kept on this phone only. Create a fine-grained token at github.com → Settings → Developer settings → Fine-grained tokens, limited to {a}/{b} with', { a: gh.owner, b: gh.repo })} <strong>${tr('Contents: Read and write')}</strong> ${tr('and nothing else.')}</p>
          </section>

          ${conflict && html`<div class="gap-s"><${Flag}>${conflict.message}<//>
            <${Secondary} onClick=${reload}>${tr('Discard my edits and load {a}', { a: conflict.remoteVersion })}<//>
            <${Quiet} danger onClick=${() => publish(true)}>${tr('Publish anyway, replacing {a}', { a: conflict.remoteVersion })}<//></div>`}
          ${error && html`<${Flag}>${error}<//>`}
          ${busy && html`<p class="para">${busy}</p>`}
          <${Anchor} icon="cloud" disabled=${!canPublish} onClick=${() => publish(false)}>${r.count ? trn(r.count, 'Publish 1 change', 'Publish {n} changes') : tr('Publish')}<//>
          <${Secondary} icon="download" disabled=${!(w && r.report?.ok && passOk) || Boolean(busy)} onClick=${saveFile}>${tr('Save the encrypted file instead')}<//>
          <p class="note">${tr('Saving the file is for publishing by hand: commit it to the repository as {a}.', { a: DATA_PATH })}</p>`}
      </div>
    <//>`;
}
