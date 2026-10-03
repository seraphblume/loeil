// App updates. A new release installs quietly and waits; it takes over on the
// next launch, or now if he taps "Update now" on the Me tab.

import { setState } from './app.js';

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  // On a local server the worker would cache code mid-edit; opt in with localStorage.loeilSW = '1'.
  let local = false;
  try { local = localStorage.getItem('loeilSW') === '1'; } catch { /* storage blocked */ }
  if (location.protocol !== 'https:' && !local) return;
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    if (reg.waiting && navigator.serviceWorker.controller) setState({ update: true });
    reg.addEventListener('updatefound', () => {
      const next = reg.installing;
      next?.addEventListener('statechange', () => {
        if (next.state === 'installed' && navigator.serviceWorker.controller) setState({ update: true });
      });
    });
    // Look for a new release whenever the app comes back to the foreground.
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
  }).catch(() => {});
}

export async function applyUpdate() {
  const reg = await navigator.serviceWorker?.getRegistration();
  if (!reg?.waiting) { location.reload(); return; }
  navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true });
  reg.waiting.postMessage('skip-waiting');
}
