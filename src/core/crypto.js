// The envelope: what actually sits in the public repo.
//
// The bundle is gzipped, then sealed with AES-256-GCM under a key stretched
// from the store passcode (PBKDF2-SHA-256). GCM authenticates as it decrypts,
// so a wrong passcode and a damaged download fail the same loud way — nothing
// half-decrypted ever reaches the app.
//
// Only `dataVersion`, the publish time and the minimum app build are readable
// without the passcode. Prices, stock and staff are not.
//
// Works unchanged in the browser and in Node 20+ (WebCrypto, CompressionStream).

import { PBKDF2_ITERATIONS } from '../config.js';

export const ENVELOPE_FORMAT = 'loeil-envelope';

const subtle = () => {
  const s = globalThis.crypto?.subtle;
  if (!s) throw new Error('This browser cannot decrypt (WebCrypto is unavailable). Open the app over https.');
  return s;
};

const enc = new TextEncoder();
const dec = new TextDecoder();

export class WrongPasscode extends Error {
  constructor() { super('That passcode does not open this catalogue.'); this.name = 'WrongPasscode'; }
}

async function deriveKey(passcode, salt, iterations) {
  const base = await subtle().importKey('raw', enc.encode(passcode.normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
  return subtle().deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function pipe(bytes, stream) {
  const out = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

const canGzip = () => typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';

export function toBase64(bytes) {
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  return btoa(s);
}

export function fromBase64(b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/** Bundle + passcode → envelope (a plain object, ready for JSON.stringify). */
export async function seal(bundle, passcode, { iterations = PBKDF2_ITERATIONS } = {}) {
  if (!passcode || passcode.length < 6) throw new Error('Use a passcode of at least 6 characters.');
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passcode, salt, iterations);
  let plain = enc.encode(JSON.stringify(bundle));
  const compression = canGzip() ? 'gzip' : 'none';
  if (compression === 'gzip') plain = await pipe(plain, new CompressionStream('gzip'));
  const cipher = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv }, key, plain));
  return {
    format: ENVELOPE_FORMAT,
    version: 1,
    dataVersion: bundle.dataVersion,
    publishedAt: bundle.generatedAt,
    minAppBuild: bundle.minAppBuild ?? 1,
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations, salt: toBase64(salt) },
    cipher: { name: 'AES-GCM', iv: toBase64(iv) },
    compression,
    payload: toBase64(cipher),
  };
}

/** Envelope + passcode → bundle. Throws WrongPasscode when it does not open. */
export async function open(envelope, passcode) {
  if (!envelope || envelope.format !== ENVELOPE_FORMAT) throw new Error('This is not an L’Œil data file.');
  const salt = fromBase64(envelope.kdf.salt);
  const iv = fromBase64(envelope.cipher.iv);
  const key = await deriveKey(passcode, salt, envelope.kdf.iterations);
  let plain;
  try {
    plain = new Uint8Array(await subtle().decrypt({ name: 'AES-GCM', iv }, key, fromBase64(envelope.payload)));
  } catch {
    throw new WrongPasscode();
  }
  if (envelope.compression === 'gzip') {
    if (!canGzip()) throw new Error('This browser is too old to read the catalogue. Update it and try again.');
    plain = await pipe(plain, new DecompressionStream('gzip'));
  }
  return JSON.parse(dec.decode(plain));
}
