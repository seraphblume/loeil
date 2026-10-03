// First run: the store passcode, then who is holding the phone.

import { html, useState } from './html.js';
import { useApp } from './hooks.js';
import { Wordmark, Anchor, Row, List, Empty, Eyebrow, Sheet } from './kit.js';
import { Icon } from './icons.js';
import { unlock, setIdentity, toast } from '../state/app.js';
import { WrongPasscode } from '../core/crypto.js';
import { go } from './router.js';

export function PasscodeForm({ onDone, cta = 'Unlock' }) {
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const submit = async (e) => {
    e.preventDefault();
    if (!pass.trim()) return;
    setBusy(true); setError(null);
    try {
      await unlock(pass);
      onDone?.();
    } catch (err) {
      setError(err instanceof WrongPasscode ? 'That passcode does not open this catalogue. Check it with your admin.' : err.message);
    } finally {
      setBusy(false);
    }
  };
  return html`<form class="stack tight" onSubmit=${submit}>
    <label class="field big">
      <${Icon} name="lock" />
      <input type="password" autocomplete="current-password" placeholder="Store passcode" value=${pass}
        onInput=${(e) => setPass(e.currentTarget.value)} aria-label="Store passcode" />
    </label>
    ${error && html`<p class="para" role="alert">${error}</p>`}
    <${Anchor} type="submit" disabled=${busy || !pass.trim()}>${busy ? 'Opening…' : cta}<//>
  </form>`;
}

export function UnlockScreen() {
  return html`<main class="unlock">
    <div class="gap-m">
      <${Wordmark} size=${46} />
      <h1 style="margin:0;font-size:22px;font-weight:500">Enter the store passcode</h1>
      <p class="para">The catalogue — prices, frames, stock and promotions — is encrypted. The passcode opens it once on this phone; after that it works offline and updates on its own.</p>
    </div>
    <${PasscodeForm} />
    <p class="note">Client records never leave this phone. Ask your admin for the passcode.
      <br /><a class="link" href="#/me/publish" onClick=${(e) => { e.preventDefault(); go('#/me/publish'); }}>Set up as admin</a></p>
  </main>`;
}

export function StaffList({ onPick }) {
  const staff = useApp((s) => s.catalogue.staff.filter((m) => m.active));
  const current = useApp((s) => s.identity);
  if (!staff.length) return html`<div class="pad"><${Empty} title="No roster yet">The staff list arrives with the catalogue.<//></div>`;
  return html`<${List}>${staff.map((m) => html`
    <${Row} title=${m.name} detail=${`${m.employeeNumber} · ${m.role[0]?.toUpperCase() + m.role.slice(1)}`}
      end=${m.employeeNumber === current ? html`<${Icon} name="check" />` : null}
      onClick=${() => onPick(m)} />`)}<//>`;
}

export function WhoAreYouScreen() {
  return html`<main class="unlock" style="justify-content:flex-start;padding-top:calc(70px + var(--top))">
    <div class="gap-m">
      <${Wordmark} size=${30} />
      <h1 style="margin:0;font-size:22px;font-weight:500">Who are you?</h1>
      <p class="para">Your employee number goes on every ticket and into the register, so this is a tap rather than something to type. It stays on this phone.</p>
    </div>
    <div style="margin:0 calc(-1 * var(--gutter))"><${StaffList} onPick=${(m) => { setIdentity(m.employeeNumber); toast(`Hello, ${m.shortName || m.name}`); }} /></div>
  </main>`;
}

export function StaffSheet({ onClose }) {
  return html`<${Sheet} title="Who is using this phone" onClose=${onClose}>
    <div class="stack tight">
      <p class="para pad">Whoever is chosen here is the seller on every ticket from now on. Orders already saved keep the number they were saved with.</p>
      <${StaffList} onPick=${(m) => { setIdentity(m.employeeNumber); onClose(); }} />
    </div>
  <//>`;
}

export function NewPasscodeSheet({ onClose }) {
  return html`<${Sheet} title="New passcode" onClose=${onClose}>
    <div class="pad stack tight">
      <${Eyebrow}>The passcode changed<//>
      <p class="para">Enter the new store passcode to receive catalogue updates. Everything already on this phone keeps working meanwhile.</p>
      <${PasscodeForm} cta="Use this passcode" onDone=${() => { onClose(); toast('Catalogue updated'); }} />
    </div>
  <//>`;
}
