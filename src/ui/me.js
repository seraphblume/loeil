// Me: what he sold, who is waiting, the catalogue's state, and the way out of
// the phone. The grid is 26 weeks of sales in four opacity steps of platinum —
// there is no green in this palette.

import { html, useState, useRef } from './html.js';
import { useApp } from './hooks.js';
import {
  Bar, Screen, Figure, Eyebrow, Panel, KV, Section, Row, List, Secondary, Sheet, Anchor, Quiet, Confirm, Flag,
  daysAgo, fmtDayMonth, fmtDate,
} from './kit.js';
import { Icon } from './icons.js';
import { StaffSheet, NewPasscodeSheet } from './unlock.js';
import { money } from '../core/money.js';
import { orderTotal } from '../core/orders.js';
import { dueForRecall, warningIcon } from '../core/crm.js';
import { livePromotions, unmatchableLines, conditionsOf, isLive } from '../core/promotions.js';
import { addDays, startOfDay } from '../core/util.js';
import { GRID_WEEKS, APP_BUILD } from '../config.js';
import {
  refresh, staffMember, backupJSON, previewBackup, restoreBackup, toast, lockDevice,
} from '../state/app.js';
import { go } from './router.js';
import { applyUpdate } from '../state/update.js';

const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

function Grid({ orders }) {
  const today = startOfDay(new Date());
  const span = GRID_WEEKS * 7;
  const first = addDays(today, -(span - 1));
  const aligned = addDays(first, -first.getDay());
  const counts = new Map();
  for (const o of orders) {
    if (o.status !== 'sold') continue;
    const k = startOfDay(new Date(o.closedOn ?? o.createdOn)).getTime();
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const days = [];
  for (let d = aligned; d <= today; d = addDays(d, 1)) days.push(d);
  const op = (n) => (n === 0 ? 0.1 : n === 1 ? 0.35 : n === 2 ? 0.62 : 1);
  const scroller = useRef();
  return html`<div class="gap-s">
    <${Eyebrow}>Last ${GRID_WEEKS} weeks<//>
    <div class="grid-wrap" ref=${(el) => { if (el && !scroller.current) { scroller.current = el; el.scrollLeft = el.scrollWidth; } }}
      role="img" aria-label=${`Sales over the last ${GRID_WEEKS} weeks`}>
      <div class="cgrid">${days.map((d) => { const n = counts.get(d.getTime()) ?? 0; return html`<i style=${{ opacity: op(n) }} title=${`${fmtDayMonth(d)}: ${n} sold`}></i>`; })}</div>
    </div>
  </div>`;
}

export function MeScreen() {
  const s = useApp();
  const { orders, clients, catalogue, sync } = s;
  const [sheet, setSheet] = useState(null);
  const [restore, setRestore] = useState(null);
  const fileRef = useRef();
  const me = staffMember(s);
  const weekAgo = addDays(new Date(), -7);
  const sold = orders.filter((o) => o.status === 'sold');
  const soldWeek = sold.filter((o) => new Date(o.closedOn ?? o.createdOn) >= weekAgo).length;
  const due = dueForRecall(clients, orders);
  const orphans = unmatchableLines(catalogue).length;
  const isAdmin = !catalogue.staff.length || me?.role === 'admin';

  const exportFile = async () => {
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
  };

  const pickBackup = async (e) => {
    const f = e.currentTarget.files?.[0];
    e.currentTarget.value = '';
    if (!f) return;
    try { setRestore(previewBackup(await f.text())); } catch (err) { toast(err.message); }
  };

  const syncLine = {
    checking: 'Checking…', upToDate: 'Up to date', updated: 'Updated just now', offline: 'Offline — using the copy on this phone',
    appTooOld: 'Update waiting', corrupt: 'Last download discarded', passcode: 'Needs the new passcode', missing: 'Nothing published yet', idle: '—',
  }[sync.status];

  return html`
    <${Bar} title="Me" />
    <${Screen}>
      <div class="stack loose">
        ${s.update && html`<div class="pad gap-s"><${Flag} icon="arrowUp">A new version of L\u2019\u0152il is ready. It switches over on the next launch, or now.<//>
          <${Secondary} icon="refresh" onClick=${applyUpdate}>Update now<//></div>`}
        <div class="pad"><${Figure} value=${String(soldWeek)} caption="sold this week" size=${48} /></div>
        <div class="pad"><${Grid} orders=${orders} /></div>

        <div class="pad gap-s">
          <${Eyebrow}>Overall<//>
          <${Panel}>
            <${KV} k="Clients" v=${clients.length} />
            <${KV} k="Orders open" v=${orders.filter((o) => o.status === 'draft' || o.status === 'presented').length} />
            <${KV} k="Sold, all time" v=${sold.length} />
            <${KV} k="Revenue, all time" v=${money(sold.reduce((t, o) => t + orderTotal(o), 0))} em />
          <//>
        </div>

        <${Section} title="Due for a visit">
          ${due.length === 0 ? html`<div class="row"><span class="muted small">Nobody is due in the next month.</span></div>`
            : due.slice(0, 5).map(({ client, due: when }) => html`<${Row} to=${'#/clients/' + client.id} title=${client.name}
              badge=${warningIcon(client.prescription) && html`<${Icon} name=${warningIcon(client.prescription)} />`}
              end=${when <= new Date() ? 'Overdue' : fmtDayMonth(when)} />`)}
          ${due.length > 5 && html`<div class="row"><span class="muted small">and ${due.length - 5} more</span></div>`}
        <//>

        <${Section} title="Seller">
          <${Row} title=${me?.name ?? 'Not set'} detail=${s.identity ? `${s.identity} · on every ticket` : 'Choose who is using this phone'} chev onClick=${() => setSheet('staff')} />
        <//>

        <div class="pad gap-s">
          <${Eyebrow}>Catalogue<//>
          <${Panel}>
            <${KV} k="Published" v=${daysAgo(catalogue.generatedAt)} />
            <${KV} k="Version" v=${catalogue.dataVersion || '—'} mono />
            <${KV} k="Lenses" v=${catalogue.lensCount} />
            <${KV} k="Frames" v=${catalogue.frames.length.toLocaleString('en')} />
            <${KV} k="Stock items" v=${catalogue.inventory.length} />
            <${KV} k="Status" v=${syncLine} />
          <//>
          ${sync.note && html`<p class="para">${sync.note}</p>`}
          ${sync.status === 'passcode' && html`<${Secondary} icon="lock" onClick=${() => setSheet('passcode')}>Enter the new passcode<//>`}
          <${Secondary} icon="refresh" disabled=${sync.status === 'checking'} onClick=${refresh}>${sync.status === 'checking' ? 'Checking…' : 'Check for an update'}<//>
          ${orphans > 0 && html`<p class="note">${orphans} promo lines name a lens code the catalogue does not have, so they can never match. Worth a look at the promo sheet.</p>`}
        </div>

        <${Section} title="Promotions">
          <${Row} to="#/me/promotions" title="Live promotions" count=${livePromotions(catalogue).length} chev />
        <//>

        <div class="pad gap-s">
          <${Eyebrow}>Backup<//>
          <p class="para">Client records live only on this phone. There is no sync and no account, so export regularly — a lost phone or a cleared browser is otherwise the end of them.</p>
          <${Secondary} icon="download" onClick=${exportFile}>Export backup<//>
          <${Secondary} icon="upload" onClick=${() => fileRef.current.click()}>Restore from a backup<//>
          <input ref=${fileRef} type="file" accept="application/json,.json" style="display:none" onChange=${pickBackup} />
          <p class="note">Backups from the iPhone and Android apps restore here too.</p>
        </div>

        ${!isStandalone() && html`<div class="pad"><${Flag} icon="download">
          <strong style="font-weight:500">Add L’Œil to your Home Screen.</strong>
          ${isIOS() ? ' In Safari, tap Share, then Add to Home Screen.' : ' In Chrome, open the menu and choose Install app.'}
          It opens full screen, works offline, and keeps your client records safe from the browser’s storage clean-up.
        <//></div>`}

        ${isAdmin && html`<${Section} title="Admin">
          <${Row} to="#/me/publish" icon="cloud" title="Publish data" detail="Send new workbooks to every phone" chev />
        <//>`}

        <div class="pad gap-s">
          <${Quiet} onClick=${() => setSheet('lock')}>Lock this phone<//>
          <p class="note center" style="font-family:var(--serif);font-size:14px;margin-top:8px">« Une voix venue d’ailleurs »</p>
          <p class="note center">Build ${APP_BUILD}</p>
        </div>
      </div>
    <//>
    ${sheet === 'staff' && html`<${StaffSheet} onClose=${() => setSheet(null)} />`}
    ${sheet === 'passcode' && html`<${NewPasscodeSheet} onClose=${() => setSheet(null)} />`}
    ${sheet === 'lock' && html`<${Confirm} title="Lock this phone?" message="The catalogue and passcode are removed from this phone; it will ask for the passcode again. Clients and orders stay." action="Lock"
      onConfirm=${lockDevice} onClose=${() => setSheet(null)} />`}
    ${restore && html`<${RestoreSheet} parsed=${restore} onClose=${() => setRestore(null)} />`}`;
}

function RestoreSheet({ parsed, onClose }) {
  const [confirm, setConfirm] = useState(false);
  const run = async (mode) => {
    const added = await restoreBackup(parsed, mode);
    toast(mode === 'replace' ? 'Backup restored' : `Added ${added.clients} clients and ${added.orders} orders`);
    onClose();
  };
  if (confirm) return html`<${Confirm} title="Replace everything?" message="Every client and order on this phone is replaced by the backup. Export first if you are not sure." action="Replace" onConfirm=${() => run('replace')} onClose=${onClose} />`;
  return html`<${Sheet} title="Restore" onClose=${onClose}>
    <div class="pad stack tight">
      <${Panel}>
        <${KV} k="From" v=${parsed.source === 'web' ? 'This app' : `The ${parsed.source} app`} />
        <${KV} k="Clients" v=${parsed.clients.length} />
        <${KV} k="Orders" v=${parsed.orders.length} />
      <//>
      <p class="para">Merging adds what this phone does not have and leaves everything already here untouched.</p>
      <${Anchor} onClick=${() => run('merge')}>Merge into this phone<//>
      <${Quiet} danger onClick=${() => setConfirm(true)}>Replace everything instead<//>
    </div>
  <//>`;
}

export function PromotionsScreen() {
  const catalogue = useApp((s) => s.catalogue);
  const all = catalogue.promotions;
  const live = all.filter((p) => isLive(p));
  const ended = all.length - live.length;
  const groups = new Map();
  for (const p of live) { const k = p.category || 'Other'; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p); }
  return html`
    <${Bar} backTo="#/me" title="Promotions" />
    <${Screen}>
      <div class="stack">
        ${live.length === 0 && html`<p class="para pad">No promotions are live today.${ended ? ` ${ended} in the catalogue have ended — publish the new campaign to refresh them.` : ''}</p>`}
        ${[...groups.entries()].map(([cat, list]) => html`<${Section} title=${cat}>
          ${list.map((p) => html`<div class="row" style="align-items:flex-start">
            <span class="main">
              <span class="t">${p.name}</span>
              ${p.description && html`<span class="d">${p.description}</span>`}
              ${conditionsOf(p).map((c) => html`<span class="d mono">${c}</span>`)}
              ${p.notes && html`<span class="d">${p.notes}</span>`}
              <span class="d">${p.validFrom ? fmtDate(p.validFrom) : ''} – ${p.validTo ? fmtDate(p.validTo) : ''}</span>
            </span>
            <span class="end mono sel" style="font-size:15px;color:var(--platinum)">${p.id}</span>
          </div>`)}
        <//>`)}
      </div>
    <//>`;
}
