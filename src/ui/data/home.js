// Catalogue data — the admin's editor. Everything the spreadsheets used to hold
// lives here now: lens prices, coatings, frames, stock, promotions, staff.
// Edits collect in a working copy on this phone; phones change only on Publish.

import { html, useState, useRef, useMemo } from '../html.js';
import { useApp } from '../hooks.js';
import { Bar, Screen, Section, Row, Panel, KV, Eyebrow, Secondary, Quiet, Confirm, Flag, Sheet, Anchor, daysAgo } from '../kit.js';
import { workingCatalogue, review, edit, discardWorking } from '../../state/working.js';
import { applyPieces } from '../../core/edits.js';
import { readFiles, exportWorkbooks } from './io.js';
import { toast } from '../../state/app.js';
import { go } from '../router.js';
import { tr, trn } from '../../i18n.js';

export function useWorking() {
  const w = useApp((s) => s.working);
  const published = useApp((s) => s.catalogue);
  const cat = w ? workingCatalogue(w) : published;
  return { w, cat, bundle: w?.bundle ?? published.bundle };
}

export function DataHome() {
  const { w, cat, bundle } = useWorking();
  const published = useApp((s) => s.catalogue);
  const r = useMemo(() => review(w), [w]);
  const [confirm, setConfirm] = useState(false);
  const [imported, setImported] = useState(null);
  const [busy, setBusy] = useState(null);
  const fileRef = useRef();

  const pick = async (e) => {
    const files = [...(e.currentTarget.files ?? [])];
    e.currentTarget.value = '';
    if (!files.length) return;
    setBusy(tr('Reading…'));
    try { setImported(await readFiles(files)); } catch (err) { toast(err.message || tr('Those files could not be read.')); } finally { setBusy(null); }
  };

  const exportAll = async () => {
    setBusy(tr('Preparing workbooks…'));
    try { await exportWorkbooks(bundle); } catch (err) { toast(err.message); } finally { setBusy(null); }
  };

  const n = (x) => x.toLocaleString('en');
  return html`
    <${Bar} backTo="#/me" title=${tr('Catalogue data')} />
    <${Screen}>
      <div class="stack">
        <div class="pad gap-s">
          ${w ? html`<${Panel}>
            <${KV} k=${tr('Working copy')} v=${r.count ? trn(r.count, '1 change', '{n} changes') : tr('No changes yet')} em />
            <${KV} k=${tr('Based on')} v=${w.baseVersion || tr('nothing published')} mono />
            ${r.report && !r.report.ok && html`<${KV} k=${tr('To fix before publishing')} v=${r.report.errors.length} em />`}
          <//>` : html`<p class="para">${tr('This is the published catalogue ({a}). Change anything and a working copy starts on this phone — nobody else sees it until you publish.', { a: published.dataVersion || tr('none yet') })}</p>`}
          ${w && html`<${Anchor} icon="cloud" onClick=${() => go('#/me/publish')}>${tr('Review and publish')}<//>`}
        </div>

        <${Section} title=${tr('Lenses')}>
          <${Row} to="#/me/data/lenses/SV" icon="sv" title=${tr('Single vision prices')} count=${n(bundle?.lenses.single.length ?? 0)} chev />
          <${Row} to="#/me/data/lenses/MF" icon="mf" title=${tr('Multifocal prices')} count=${n(bundle?.lenses.multifocal.length ?? 0)} chev />
          <${Row} to="#/me/data/lenses/CL" icon="cl" title=${tr('Contact lens prices')} count=${n(bundle?.lenses.contact.length ?? 0)} chev />
          <${Row} to="#/me/data/vocab" icon="text" title=${tr('Coatings, materials and names')} detail=${tr('English names, upgrade order, promo families')} count=${n(bundle?.vocabulary.length ?? 0)} chev />
          <${Row} to="#/me/data/coating" icon="plus" title=${tr('Add a coating to many lenses')} detail=${tr('For a new treatment: pick the lenses, set the prices')} chev />
        <//>

        <${Section} title=${tr('Frames and stock')}>
          <${Row} to="#/me/data/frames" icon="glasses" title=${tr('Frames')} detail=${tr('The frame catalogue: price, brand, size')} count=${n(bundle?.frames.length ?? 0)} chev />
          <${Row} to="#/me/data/brands" icon="star" title=${tr('Brand tiers')} count=${n(new Set((bundle?.frames ?? []).map((f) => f.brand)).size)} chev />
          <${Row} to="#/me/data/stock" icon="box" title=${tr('Stock')} detail=${bundle?.stockReport?.generated ? tr('From the report of {date}', { date: bundle.stockReport.generated }) : tr('Import the POS stock report')} count=${n(bundle?.inventory.length ?? 0)} chev />
          <${Row} to="#/me/data/accessories" icon="tag" title=${tr('Accessory prices')} detail=${tr('Cases, cloths, solutions and gifts')} count=${n(bundle?.accessories?.length ?? 0)} chev />
          <${Row} to="#/me/data/extras" icon="box" title=${tr('Extras')} count=${n(bundle?.extras.length ?? 0)} chev />
        <//>

        <${Section} title=${tr('Promotions and staff')}>
          <${Row} to="#/me/data/presets" icon="spark" title=${tr('Lifestyle presets')} detail=${tr('A lens, Plus Protection and accessories for each way of life')} count=${n(new Set((bundle?.presets ?? []).map((t) => t.presetId)).size)} chev />
          <${Row} to="#/me/data/sets" icon="doc" title=${tr('Sets')} detail=${tr('Set prices, ID Maestro, brands, lens rows, campaign discounts')} count=${n(bundle?.sets?.length ?? 0)} chev />
          <${Row} to="#/me/data/promos" icon="doc" title=${tr('Promotions')} count=${n(bundle?.promotions.length ?? 0)} chev />
          <${Row} to="#/me/data/alliances" icon="shield" title=${tr('Alliances')} detail=${tr('Insurers and employers: coverage, copays, packages, paperwork')} count=${n((bundle?.alliances ?? []).reduce((t, a) => t + a.plans.length, 0))} chev />
          <${Row} to="#/me/data/staff" icon="people" title=${tr('Staff')} count=${n(bundle?.staff.length ?? 0)} chev />
          <${Row} to="#/me/data/store" icon="store" title=${tr('Store')} detail=${bundle?.store?.branchName ?? tr('The branch on the receipt')} chev />
        <//>

        <${Section} title=${tr('Prices in bulk')}>
          <${Row} to="#/me/data/adjust" icon="refresh" title=${tr('Adjust prices')} detail=${tr('Raise or lower many prices at once, by amount or percent')} chev />
        <//>

        <div class="pad gap-s">
          <${Eyebrow}>${tr('Files')}<//>
          <p class="para">${tr('Nothing needs a spreadsheet any more. Files are only for bringing a lot in at once — the POS stock report, or a workbook edited on a computer — and for keeping an offline copy.')}</p>
          <input ref=${fileRef} type="file" multiple accept=".xlsx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" style="display:none" onChange=${pick} />
          <${Secondary} icon="upload" onClick=${() => fileRef.current.click()}>${tr('Import a stock report or workbook')}<//>
          <${Secondary} icon="download" disabled=${!bundle} onClick=${exportAll}>${tr('Export as workbooks')}<//>
          ${busy && html`<p class="note">${busy}</p>`}
        </div>

        ${w && html`<div class="pad"><${Quiet} danger onClick=${() => setConfirm(true)}>${tr('Discard the working copy')}<//></div>`}
      </div>
    <//>
    ${confirm && html`<${Confirm} title=${tr('Discard every change?')} message=${`${r.count} unpublished change${r.count === 1 ? '' : 's'} will be lost. The published catalogue is not affected.`} action=${tr('Discard')}
      onConfirm=${async () => { await discardWorking(); toast(tr('Working copy discarded')); }} onClose=${() => setConfirm(false)} />`}
    ${imported && html`<${ImportSheet} result=${imported} onClose=${() => setImported(null)} />`}`;
}

function ImportSheet({ result, onClose }) {
  const { pieces, report, summary } = result;
  const has = Object.keys(pieces).some((k) => k !== 'source');
  const apply = () => {
    edit((b) => applyPieces(b, pieces));
    toast(tr('Imported into the working copy'));
    onClose();
  };
  return html`<${Sheet} title=${tr('Import')} onClose=${onClose}>
    <div class="pad stack tight">
      ${summary.map((s) => html`<p class="para">${s}</p>`)}
      ${report.errors.map((e) => html`<${Flag}>${e.sheet}: ${e.message}<//>`)}
      ${report.warnings.length > 0 && html`<p class="note">${trn(report.warnings.length, '1 warning — you will see it on the review screen.', '{n} warnings — you will see them on the review screen.')}</p>`}
      ${has ? html`
        <p class="note">${tr('Each part replaces the same part of the working copy. Review the changes before you publish; nothing reaches a phone until then.')}</p>
        <${Anchor} onClick=${apply}>${tr('Replace in the working copy')}<//>` : html`<p class="para">${tr('Nothing usable was found in those files.')}</p>`}
    </div>
  <//>`;
}

export { daysAgo };
