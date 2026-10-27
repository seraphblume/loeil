// Me: what he sold, who is waiting, the catalogue's state, and the way out of
// the phone. The grid is 26 weeks of sales in four opacity steps of ink —
// there is no green in this palette.

import { html, useState, useRef } from './html.js';
import { useApp } from './hooks.js';
import {
  Bar, Screen, LargeTitle, Figure, Eyebrow, Panel, KV, Section, Row, List, Secondary, Sheet, Anchor, Quiet, Confirm, Flag, Seg,
  daysAgo, fmtDayMonth, fmtDate,
} from './kit.js';
import { Icon } from './icons.js';
import { StaffSheet, NewPasscodeSheet } from './unlock.js';
import { money } from '../core/money.js';
import { orderTotal } from '../core/orders.js';
import { dueForRecall, warningIcon } from '../core/crm.js';
import { livePromotions, liveGifts, unmatchableLines, conditionsOf, isLive, isGift } from '../core/promotions.js';
import { addDays, startOfDay } from '../core/util.js';
import { GRID_WEEKS, APP_BUILD } from '../config.js';
import {
  refresh, staffMember, backupJSON, previewBackup, restoreBackup, toast, lockDevice, previewAlpha, importAlpha, chooseLanguage,
} from '../state/app.js';
import { loadXLSX } from './data/io.js';
import { go } from './router.js';
import { applyUpdate } from '../state/update.js';
import { isShowcaseOrder } from '../core/showcase.js';
import { tr, trn, LANGS, num } from '../i18n.js';
import { AlphaFigures } from './figures.js';

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
    <${Eyebrow}>${tr('Last {a} weeks', { a: GRID_WEEKS })}<//>
    <div class="grid-wrap" ref=${(el) => { if (el && !scroller.current) { scroller.current = el; el.scrollLeft = el.scrollWidth; } }}
      role="img" aria-label=${tr('Sales over the last {n} weeks', { n: GRID_WEEKS })}>
      <div class="cgrid">${days.map((d) => { const n = counts.get(d.getTime()) ?? 0; return html`<i style=${{ opacity: op(n) }} title=${tr('{date}: {n} sold', { date: fmtDayMonth(d), n })}></i>`; })}</div>
    </div>
  </div>`;
}

export function MeScreen() {
  const s = useApp();
  const { clients, catalogue, sync } = s;
  const orders = s.orders.filter((o) => !isShowcaseOrder(o)); // the showcase client's orders are demonstrations, not sales
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
      try { await navigator.share({ files: [file], title: tr('L’Œil backup') }); return; } catch (e) { if (e.name === 'AbortError') return; }
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
    try {
      if (/\.xlsx$/i.test(f.name) || f.type.includes('spreadsheet')) setRestore(previewAlpha(await workbookRows(f)));
      else setRestore(previewBackup(await f.text()));
    } catch (err) { toast(err.message); }
  };

  const syncLine = {
    checking: tr('Checking…'), upToDate: tr('Up to date'), updated: tr('Updated just now'), offline: tr('Offline — using the copy on this phone'),
    appTooOld: tr('Update waiting'), corrupt: tr('Last download discarded'), passcode: tr('Needs the new passcode'), missing: tr('Nothing published yet'), idle: '—',
  }[sync.status];

  return html`
    <${Bar} title=${me?.name ?? tr('Me')} large />
    <${Screen}>
      <div class="stack loose">
        <${LargeTitle} detail=${me ? `${me.employeeNumber} · ${tr(me.role ?? 'seller')}` : null}>${me?.name?.split(' ')[0] ?? tr('Me')}<//>
        ${s.update && html`<div class="pad gap-s"><${Flag} icon="arrowUp">${tr('A new version of L’Œil is ready. It switches over on the next launch, or now.')}<//>
          <${Secondary} icon="refresh" onClick=${applyUpdate}>${tr('Update now')}<//></div>`}
        <div class="pad"><${Figure} value=${String(soldWeek)} caption=${tr('sold this week')} size=${48} /></div>
        <div class="pad"><${Grid} orders=${orders} /></div>
        <${AlphaFigures} />

        <div class="pad gap-s">
          <${Eyebrow}>${tr('Overall')}<//>
          <${Panel}>
            <${KV} k=${tr('Clients')} v=${clients.length} />
            <${KV} k=${tr('Orders open')} v=${orders.filter((o) => o.status === 'draft' || o.status === 'presented').length} />
            <${KV} k=${tr('Sold, all time')} v=${sold.length} />
            <${KV} k=${tr('Revenue, all time')} v=${money(sold.reduce((t, o) => t + orderTotal(o), 0))} em />
          <//>
        </div>

        <${Section} title=${tr('Due for a visit')}>
          ${due.length === 0 ? html`<div class="row"><span class="muted small">${tr('Nobody is due in the next month.')}</span></div>`
            : due.slice(0, 5).map(({ client, due: when }) => html`<${Row} to=${'#/clients/' + client.id} title=${client.name}
              badge=${warningIcon(client.prescription) && html`<${Icon} name=${warningIcon(client.prescription)} />`}
              end=${when <= new Date() ? tr('Overdue') : fmtDayMonth(when)} />`)}
          ${due.length > 5 && html`<div class="row"><span class="muted small">${tr('and {a} more', { a: due.length - 5 })}</span></div>`}
        <//>

        <${Section} title=${tr('Seller')}>
          <${Row} title=${me?.name ?? tr('Not set')} detail=${s.identity ? tr('{id} · on every ticket', { id: s.identity }) : tr('Choose who is using this phone')} chev onClick=${() => setSheet('staff')} />
        <//>

        <div class="pad gap-s lang-seg">
          <${Eyebrow}>${tr('Language')}<//>
          <${Seg} label=${tr('Language')} value=${s.lang} onChange=${chooseLanguage} options=${LANGS.map((l) => ({ value: l.id, label: l.label }))} />
          <p class="note">${tr('The app’s own words. Tickets, quotes and WhatsApp messages stay as they are.')}</p>
        </div>

        <div class="pad gap-s">
          <${Eyebrow}>${tr('Catalogue')}<//>
          <${Panel}>
            <${KV} k=${tr('Published')} v=${daysAgo(catalogue.generatedAt)} />
            <${KV} k=${tr('Version')} v=${catalogue.dataVersion || '—'} mono />
            <${KV} k=${tr('Lenses')} v=${catalogue.lensCount} />
            <${KV} k=${tr('Frames')} v=${num(catalogue.frames.length)} />
            <${KV} k=${tr('Stock items')} v=${catalogue.inventory.length} />
            ${catalogue.bundle?.stockReport?.generated && html`<${KV} k=${tr('Stock as of')} v=${catalogue.bundle.stockReport.generated} />`}
            <${KV} k=${tr('Status')} v=${syncLine} />
          <//>
          ${sync.note && html`<p class="para">${tr(sync.note)}</p>`}
          ${sync.status === 'passcode' && html`<${Secondary} icon="lock" onClick=${() => setSheet('passcode')}>${tr('Enter the new passcode')}<//>`}
          <${Secondary} icon="refresh" disabled=${sync.status === 'checking'} onClick=${refresh}>${sync.status === 'checking' ? tr('Checking…') : tr('Check for an update')}<//>
          ${orphans > 0 && html`<p class="note">${tr('{a} promo lines name a lens code the catalogue does not have, so they can never match. Worth a look at the promo sheet.', { a: orphans })}</p>`}
        </div>

        <${Section} title=${tr('Promotions')}>
          <${Row} to="#/me/promotions" title=${tr('Live promotions')} count=${livePromotions(catalogue).length} chev />
          <${Row} to="#/me/gifts" icon="gift" title=${tr('Brand gifts')} detail=${tr('Brands giving a gift with their frames')} count=${liveGifts(catalogue).length} chev />
        <//>

        <div class="pad gap-s">
          <${Eyebrow}>${tr('Backup')}<//>
          <p class="para">${tr('Client records live only on this phone. There is no sync and no account, so export regularly — a lost phone or a cleared browser is otherwise the end of them.')}</p>
          <${Secondary} icon="download" onClick=${exportFile}>${tr('Export backup')}<//>
          <${Secondary} icon="upload" onClick=${() => fileRef.current.click()}>${tr('Restore or import')}<//>
          <input ref=${fileRef} type="file" accept="application/json,.json,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" style="display:none" onChange=${pickBackup} />
          <p class="note">${tr('A backup from this app or the iPhone and Android apps, or the Alpha workbook — its CRM clients come in with their prescriptions and past sales (on the admin’s phone), and your rows on its Control sheet fill Orders → Delivery and Follow Up.')}</p>
        </div>

        ${!isStandalone() && html`<div class="pad"><${Flag} icon="download">
          <strong style="font-weight:500">${tr('Add L’Œil to your Home Screen.')}</strong>
          ${' '}${isIOS() ? tr('In Safari, tap Share, then Add to Home Screen.') : tr('In Chrome, open the menu and choose Install app.')}
          ${' '}${tr('It opens full screen, works offline, and keeps your client records safe from the browser’s storage clean-up.')}
        <//></div>`}

        ${isAdmin && html`<${Section} title=${tr('Admin')}>
          <${Row} to="#/me/data" icon="edit" title=${tr('Catalogue data')} detail=${s.working ? tr('Unpublished changes on this phone') : tr('Prices, coatings, frames, stock, promotions, staff')} chev />
          <${Row} to="#/me/publish" icon="cloud" title=${tr('Review and publish')} detail=${tr('Send the changes to every phone')} chev />
        <//>`}

        <div class="pad gap-s">
          <${Quiet} onClick=${() => setSheet('lock')}>${tr('Lock this phone')}<//>
          <p class="note center" style="font-family:var(--serif);font-size:14px;margin-top:8px">« Une voix venue d’ailleurs »</p>
          <p class="note center">${tr('Build {a}', { a: APP_BUILD })}</p>
        </div>
      </div>
    <//>
    ${sheet === 'staff' && html`<${StaffSheet} onClose=${() => setSheet(null)} />`}
    ${sheet === 'passcode' && html`<${NewPasscodeSheet} onClose=${() => setSheet(null)} />`}
    ${sheet === 'lock' && html`<${Confirm} title=${tr('Lock this phone?')} message=${tr('The catalogue and passcode are removed from this phone; it will ask for the passcode again. Clients and orders stay.')} action=${tr('Lock')}
      onConfirm=${lockDevice} onClose=${() => setSheet(null)} />`}
    ${restore && html`<${RestoreSheet} parsed=${restore} onClose=${() => setRestore(null)} />`}`;
}

/**
 * The Alpha workbook's sheets as rows of cells: its CRM (either shape), All
 * (the tickets), Control and Config — whichever it has.
 */
async function workbookRows(file) {
  const XLSX = await loadXLSX();
  const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array', cellFormula: true });
  const read = (n) => (n ? XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: null }) : null);
  const named = (want) => wb.SheetNames.find((n) => n.trim().toUpperCase() === want);
  const crm = named('CRM') ?? wb.SheetNames.find((n) => !['ALL', 'CONTROL'].includes(n.trim().toUpperCase())
    && read(n).slice(0, 12).some((r) => String(r?.[0] ?? '').trim().toLowerCase() === 'sell id'));
  const controlName = named('CONTROL');
  const control = read(controlName);
  if (control) {
    // An open order's Delivered cell holds a live =TODAY(), not a delivery date.
    const ws = wb.Sheets[controlName];
    control.forEach((row, r) => row?.forEach((_, c) => {
      const f = ws[XLSX.utils.encode_cell({ r, c })]?.f;
      if (f && /^\s*TODAY\(\)\s*$/i.test(f)) row[c] = null;
    }));
  }
  if (!crm && !control) throw new Error(tr('This workbook has no CRM or Control sheet.'));
  return { crm: read(crm), all: read(named('ALL')), control, config: read(named('CONFIG')), history: read(named('HISTORY')), dashboard: read(named('DASHBOARD')) };
}

function AlphaSheet({ parsed, onClose }) {
  const { counts, alpha, control, crm, stats } = parsed;
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    const done = await importAlpha(parsed);
    const said = [];
    if (alpha) said.push(done.clients || done.orders ? tr('{clients} and {sales} added', { clients: trn(done.clients, '1 client', '{n} clients'), sales: trn(done.orders, '1 past sale', '{n} past sales') }) : tr('Clients up to date'));
    if (control) said.push(tr('{deliveries} and {followUps}', { deliveries: trn(done.deliveries, '1 delivery', '{n} deliveries'), followUps: trn(done.followUps, '1 follow-up', '{n} follow-ups') }));
    if (done.stats) said.push(tr('Figures updated'));
    toast(said.join(' · '));
    onClose();
  };
  const nothing = (!counts || (!counts.clients && !counts.orders && !counts.updated)) && !control && !stats;
  const was = (n, here) => (here ? tr('{n} · replaces {here}', { n, here }) : String(n));
  return html`<${Sheet} title=${tr('Import from Alpha')} onClose=${onClose}>
    <div class="pad stack tight">
      ${alpha && html`
        <${Eyebrow}>${tr('CRM')}<//>
        <${Panel}>
          <${KV} k=${tr('People')} v=${alpha.people.length} />
          <${KV} k=${tr('New clients')} v=${counts.clients} />
          ${counts.matched > 0 && html`<${KV} k=${tr('Already here')} v=${counts.updated ? tr('{n} · {m} brought up to date', { n: counts.matched, m: counts.updated }) : counts.matched} />`}
          <${KV} k=${tr('Past sales')} v=${counts.already ? tr('{n} new · {m} already here', { n: counts.orders, m: counts.already }) : counts.orders} />
          ${counts.history > 0 && html`<${KV} k=${tr('Into their history')} v=${trn(counts.history, '1 prescription', '{n} prescriptions')} />`}
        <//>
        <p class="para">${alpha.layout === 'clients'
          ? tr('Each client comes with their Customer ID, birthdate, quality and their glasses, lecture and contact lens prescriptions, and every ticket of yours on the All tab becomes a sale in their history.')
          : tr('Each client comes with their glasses and contact lens prescriptions, and every ticket becomes a sale in their history. Repeat visits are one client: the same name with the same phone.')}</p>
        <p class="note">${tr('Alpha is the source: someone already on this phone takes its details and prescriptions, and a prescription it replaces goes into their history. Notes and favourites stay, and so does anyone Alpha does not list. Importing the same workbook again adds only what is new.')}</p>`}
      ${crm && !alpha && html`<p class="note">${tr('The CRM’s clients come in on the admin’s phone only.')}</p>`}
      ${control && html`
        <${Eyebrow}>${tr('Control')}<//>
        <${Panel}>
          <${KV} k=${tr('Delivery')} v=${was(control.deliveries.length, control.here.deliveries)} />
          <${KV} k=${tr('Follow Up')} v=${was(control.followUps.length, control.here.followUps)} />
          <${KV} k=${tr('WhatsApp messages')} v=${control.messages ? tr('From the workbook') : tr('As before')} />
        <//>
        <p class="note">${tr('Your rows only. The workbook’s replace this phone’s, so its Status, Promised, Delivered and Pending win over what was changed here.')}</p>
        ${!control.followUps.length && control.vendorFilter && control.vendorFilter !== 'All' && html`<p class="note">${tr('Follow Up was last rebuilt for {a} only — set Control ▸ Vendor to All and rebuild it to bring everyone’s.', { a: control.vendorFilter })}</p>`}`}
      ${stats && html`
        <${Eyebrow}>${tr('Figures')}<//>
        <${Panel}>
          <${KV} k=${tr('Your months')} v=${stats.months.length ? num(stats.months.filter((m) => (m.proceeds ?? 0) > 0).length) : tr('Not found for this seller')} />
          <${KV} k=${tr('Store goals')} v=${num(stats.store.filter((m) => m.main != null || m.soft != null).length)} />
        <//>
        <p class="note">${tr('Your month, your pay and the store against its goals show on the Me tab, as Alpha worked them out.')}</p>`}
      ${nothing ? html`<${Quiet} onClick=${onClose}>${tr('Nothing new — close')}<//>`
        : html`<${Anchor} disabled=${busy} onClick=${run}>${busy ? tr('Importing…') : tr('Import to this phone')}<//>`}
    </div>
  <//>`;
}

function RestoreSheet({ parsed, onClose }) {
  const [confirm, setConfirm] = useState(false);
  if (parsed.source === 'Alpha') return html`<${AlphaSheet} parsed=${parsed} onClose=${onClose} />`;
  const run = async (mode) => {
    const added = await restoreBackup(parsed, mode);
    toast(mode === 'replace' ? tr('Backup restored') : tr('Added {clients} clients and {orders} orders', { clients: added.clients, orders: added.orders }));
    onClose();
  };
  if (confirm) return html`<${Confirm} title=${tr('Replace everything?')} message=${parsed.control ? tr('Every client and order on this phone is replaced by the backup, and Delivery and Follow Up with it. Export first if you are not sure.') : tr('Every client and order on this phone is replaced by the backup. Export first if you are not sure.')} action=${tr('Replace')} onConfirm=${() => run('replace')} onClose=${onClose} />`;
  return html`<${Sheet} title=${tr('Restore')} onClose=${onClose}>
    <div class="pad stack tight">
      <${Panel}>
        <${KV} k=${tr('source::From')} v=${parsed.source === 'web' ? tr('This app') : tr('The {name} app', { name: parsed.source })} />
        <${KV} k=${tr('Clients')} v=${parsed.clients.length} />
        <${KV} k=${tr('Orders')} v=${parsed.orders.length} />
        ${parsed.control && html`<${KV} k=${tr('Delivery · Follow Up')} v=${`${parsed.control.deliveries.length} · ${parsed.control.followUps.length}`} />`}
      <//>
      <p class="para">${tr('Merging adds what this phone does not have and leaves everything already here untouched.')}</p>
      <${Anchor} onClick=${() => run('merge')}>${tr('Merge into this phone')}<//>
      <${Quiet} danger onClick=${() => setConfirm(true)}>${tr('Replace everything instead')}<//>
    </div>
  <//>`;
}

export function PromotionsScreen() {
  const catalogue = useApp((s) => s.catalogue);
  const all = catalogue.promotions.filter((p) => !isGift(p)); // the brands' gifts have their own list
  const live = all.filter((p) => isLive(p));
  const ended = all.length - live.length;
  const groups = new Map();
  for (const p of live) { const k = p.category || tr('Other'); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p); }
  return html`
    <${Bar} backTo="#/me" title=${tr('Promotions')} />
    <${Screen}>
      <div class="stack">
        ${live.length === 0 && html`<p class="para pad">${tr('No promotions are live today.')}${ended ? ' ' + tr('{n} in the catalogue have ended — publish the new campaign to refresh them.', { n: ended }) : ''}</p>`}
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
