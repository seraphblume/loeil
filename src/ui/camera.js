// The camera, and the barcode reader behind it.
//
// Android Chrome has a native BarcodeDetector. iOS Safari does not, so there the
// same API comes from a vendored ZXing WebAssembly build — loaded only when the
// scanner first opens, and served from this site so it works with no signal.

import { html, useEffect, useRef, useState } from './html.js';
import { Icon } from './icons.js';

const WANTED = ['code_128', 'ean_8', 'ean_13', 'upc_a', 'upc_e', 'code_39', 'code_93', 'itf', 'codabar'];
const VENDOR = new URL('../vendor/', import.meta.url);

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.onload = resolve; s.onerror = () => reject(new Error('Could not load the barcode reader.'));
    document.head.appendChild(s);
  });
}

let detectorPromise = null;
export function barcodeDetector() {
  detectorPromise ??= (async () => {
    if ('BarcodeDetector' in window) {
      try {
        const supported = await window.BarcodeDetector.getSupportedFormats();
        const formats = WANTED.filter((f) => supported.includes(f));
        if (formats.length) return new window.BarcodeDetector({ formats });
      } catch { /* fall through to the polyfill */ }
    }
    if (!window.BarcodeDetectionAPI) await loadScript(new URL('barcode-detector.js', VENDOR).href);
    const api = window.BarcodeDetectionAPI;
    api.setZXingModuleOverrides({
      locateFile: (path, prefix) => (path.endsWith('.wasm') ? new URL('zxing_reader.wasm', VENDOR).href : prefix + path),
    });
    return new api.BarcodeDetector({ formats: WANTED });
  })().catch((e) => { detectorPromise = null; throw e; });
  return detectorPromise;
}

/** Warm the reader in the background so the first scan is instant. */
export function prefetchScanner() {
  if ('BarcodeDetector' in window) return;
  fetch(new URL('barcode-detector.js', VENDOR)).catch(() => {});
  fetch(new URL('zxing_reader.wasm', VENDOR)).catch(() => {});
}

/**
 * A live camera that reports barcodes. `onCodes` receives every distinct value
 * seen in a frame; return true from it to stop scanning.
 */
export function BarcodeCamera({ onCodes, hint }) {
  const video = useRef();
  const [error, setError] = useState(null);
  const [torch, setTorch] = useState(null); // null = unsupported
  const stream = useRef(null);

  useEffect(() => {
    let stopped = false;
    let timer = null;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error('This browser has no camera access.'), { name: 'NotSupported' });
        const s = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        });
        if (stopped) { s.getTracks().forEach((t) => t.stop()); return; }
        stream.current = s;
        const v = video.current;
        v.srcObject = s;
        await v.play().catch(() => {});
        const track = s.getVideoTracks()[0];
        try { if (track.getCapabilities?.().torch) setTorch(false); } catch { /* no torch */ }
        const detector = await barcodeDetector();
        const tick = async () => {
          if (stopped) return;
          try {
            if (v.readyState >= 2) {
              const found = await detector.detect(v);
              const values = [...new Set(found.map((b) => b.rawValue).filter(Boolean))];
              if (values.length && onCodes(values)) { stopped = true; return; }
            }
          } catch { /* a bad frame is not an error */ }
          timer = setTimeout(tick, 140);
        };
        tick();
      } catch (e) {
        setError(e.name === 'NotAllowedError'
          ? 'Camera access was declined. Allow it for this site in the browser settings, or type the barcode below.'
          : e.name === 'NotFoundError' || e.name === 'NotSupported'
            ? 'No camera is available here. Type the barcode below instead.'
            : e.message || 'The camera could not start.');
      }
    })();
    return () => {
      stopped = true;
      clearTimeout(timer);
      stream.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const flip = async () => {
    const track = stream.current?.getVideoTracks()[0];
    if (!track) return;
    try { await track.applyConstraints({ advanced: [{ torch: !torch }] }); setTorch(!torch); } catch { /* ignore */ }
  };

  if (error) return html`<div class="panel center" style="padding:28px 18px"><div class="muted" style="margin-bottom:8px"><${Icon} name="camera" size=${26} /></div><p class="para">${error}</p></div>`;
  return html`<div class="scanner">
    <video ref=${video} playsinline muted autoplay></video>
    <div class="reticle"></div>
    ${torch !== null && html`<button class="bar-btn" style="position:absolute;top:10px;right:10px;background:var(--glass);border-radius:999px" onClick=${flip}>${torch ? 'Light off' : 'Light'}</button>`}
    ${hint && html`<div class="hint">${hint}</div>`}
  </div>`;
}
