// Alpha's figures on the Me tab: the store against its goals this month, then
// the seller's month (or cycle) and what it pays. They are the workbook's own
// numbers from the last import — before IVA, the way Alpha keeps them.

import { html, useState } from './html.js';
import { useApp } from './hooks.js';
import { Panel, KV, Eyebrow, Seg } from './kit.js';
import { money } from '../core/money.js';
import { currentMonth, paidAt } from '../core/stats.js';
import { tr, pct, num, dateFmt } from '../i18n.js';

const monthName = (start) => dateFmt({ month: 'long', year: 'numeric' }).format(new Date(start + 'T12:00'));
const cash = (c) => money(c, { cents: true });
const day = (iso) => dateFmt({ day: 'numeric', month: 'short' }).format(new Date(iso));

function Goal({ label, goal, share, perDay, note }) {
  if (goal == null) return null;
  const p = Math.max(0, Math.min(1, share ?? 0));
  return html`<div class="goal">
    <div class="goal-k"><span>${label}</span><span class="goal-v">${pct(share ?? 0)}</span></div>
    <div class="goal-bar" style=${{ '--p': p }} role="img" aria-label=${tr('{share} of {goal}', { share: pct(share ?? 0), goal: money(goal) })}><i></i></div>
    <div class="goal-d"><span>${tr('Goal {goal}', { goal: money(goal) })}</span>${perDay != null && perDay > 0 && html`<span>${tr('{amount} a day to go', { amount: money(perDay) })}</span>`}</div>
    ${note && html`<div class="goal-d">${note}</div>`}
  </div>`;
}

function StoreCard({ stats }) {
  const m = currentMonth(stats.store);
  if (!m) return null;
  const soft = stats.rates?.[1];
  return html`<div class="pad gap-s">
    <${Eyebrow}>${tr('Store · {month}', { month: monthName(m.start) })}<//>
    <${Panel}>
      <${KV} k=${tr('Proceeds')} v=${money(m.proceeds)} em />
      <${Goal} label=${tr('Main goal')} goal=${m.main} share=${m.mainShare} perDay=${m.daysLeft ? m.mainPerDay : null} />
      <${Goal} label=${tr('Soft goal')} goal=${m.soft} share=${m.softShare} perDay=${m.daysLeft ? m.softPerDay : null}
        note=${soft ? tr('Commission rises to {rate} at the Soft goal', { rate: pct(soft) }) : null} />
      ${typeof m.daysLeft === 'number' && html`<${KV} k=${tr('Days left, today included')} v=${num(m.daysLeft)} />`}
    <//>
  </div>`;
}

function MyMonth({ m }) {
  return html`<${Panel}>
    <${KV} k=${tr('Sales')} v=${num(m.sales)} />
    <${KV} k=${tr('Proceeds')} v=${money(m.proceeds)} em />
    <${KV} k=${tr('Average sale')} v=${money(m.avgSale)} />
    <${KV} k=${tr('Eye exams')} v=${num(m.exams)} />
    <${KV} k=${tr('Closure')} v=${pct(m.closure)} />
    <${KV} k=${tr('Branded')} v=${pct(m.branded)} />
    <${KV} k=${tr('Plus Protection')} v=${pct(m.pp)} />
    <${KV} k=${tr('Full tickets')} v=${`${num(m.fullTickets)} · ${pct(m.fullShare)}`} />
  <//>`;
}

function MyPay({ m, cycle }) {
  if (!m.pay?.length) return null;
  // A month shows the tier the store reached first; the cycle mixes tiers, so both side by side.
  const paid = cycle ? null : paidAt(m);
  const lines = paid ? [paid, ...m.pay.filter((p) => p !== paid)] : m.pay;
  return html`<${Panel}>
    ${!cycle && html`<${KV} k=${tr('Tier this month')} v=${m.tier != null ? pct(m.tier) : '—'} em />`}
    ${lines.map((p, i) => html`
      <${KV} k=${tr('Commission at {rate}', { rate: pct(p.rate) })} v=${cash(p.comm)} lined=${i > 0} />
      <${KV} k=${tr('Yield at {rate}', { rate: pct(p.rate) })} v=${cash(p.yield)} em=${i === 0 && Boolean(paid)} />`)}
  <//>`;
}

export function AlphaFigures() {
  const stats = useApp((s) => s.stats);
  const [span, setSpan] = useState('month');
  if (!stats) return null;
  const month = currentMonth(stats.months);
  const mine = span === 'cycle' ? stats.cycle : month;
  return html`
    <${StoreCard} stats=${stats} />
    ${(month || stats.cycle) && html`<div class="pad gap-s">
      <${Seg} small label=${tr('Period')} value=${span} onChange=${setSpan}
        options=${[{ value: 'month', label: month ? monthName(month.start) : tr('This month') }, { value: 'cycle', label: tr('Cycle to date') }]} />
      ${mine && html`
        <${Eyebrow}>${span === 'cycle' ? tr('My cycle') : tr('My month')}<//>
        <${MyMonth} m=${mine} />
        <${Eyebrow}>${tr('My pay')}<//>
        <${MyPay} m=${mine} cycle=${span === 'cycle'} />`}
      <p class="note">${tr('From Alpha, imported {date}. Amounts before IVA; yield is the base salary plus the commission, as History has it.', { date: day(stats.importedAt) })}</p>
    </div>`}`;
}
