import { html, render } from './ui/html.js';
import { App } from './ui/shell.js';
import { boot, getState } from './state/app.js';
import { registerServiceWorker } from './state/update.js';
import { prefetchScanner } from './ui/camera.js';
import { loadWorking } from './state/working.js';

render(html`<${App} />`, document.getElementById('app'));

boot().then(() => {
  loadWorking();
  // Warm the barcode reader once the app is idle, so the first scan works offline.
  if (getState().passcode) setTimeout(prefetchScanner, 4000);
});

registerServiceWorker();
