// A thermal printer, synthesised: filtered noise for the head, a low motor
// note for the feed, both stepping in time with the paper. Off unless he turns
// it on — a shop floor is not the place for surprise sounds — and the choice is
// remembered on this phone. A buzz in the hand on phones that can.

let ctx = null;
const KEY = 'loeilPrintSound';

export function soundOn() {
  try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
}
export function setSoundOn(on) {
  try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* storage blocked */ }
}

/** Plays for `ms`, stepping `steps` times. Returns a stop function. */
export function playPrinter(ms, steps) {
  try {
    ctx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    const t0 = ctx.currentTime + 0.02;
    const dur = ms / 1000;
    const len = Math.ceil(ctx.sampleRate * (dur + 0.1));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass'; band.frequency.value = 2600; band.Q.value = 0.8;
    const head = ctx.createGain();
    head.gain.value = 0;
    const motor = ctx.createOscillator();
    motor.type = 'triangle'; motor.frequency.value = 170;
    const drive = ctx.createGain();
    drive.gain.value = 0;
    const seg = dur / steps;
    for (let i = 0; i < steps; i++) {
      const s = t0 + i * seg;
      head.gain.setTargetAtTime(0.05, s, 0.004);
      head.gain.setTargetAtTime(0.006, s + seg * 0.72, 0.006);
      drive.gain.setTargetAtTime(0.03, s, 0.004);
      drive.gain.setTargetAtTime(0, s + seg * 0.72, 0.006);
    }
    head.gain.setTargetAtTime(0, t0 + dur, 0.01);
    noise.connect(band).connect(head).connect(ctx.destination);
    motor.connect(drive).connect(ctx.destination);
    noise.start(t0); motor.start(t0);
    noise.stop(t0 + dur + 0.08); motor.stop(t0 + dur + 0.08);
    return () => { try { noise.stop(); motor.stop(); } catch { /* already stopped */ } };
  } catch {
    return null;
  }
}

/** The paper tearing off: one short burst. */
export function playTear() {
  try {
    if (!ctx) return;
    const t0 = ctx.currentTime + 0.01;
    const len = Math.ceil(ctx.sampleRate * 0.12);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 1800;
    const g = ctx.createGain(); g.gain.value = 0.07;
    src.connect(hp).connect(g).connect(ctx.destination);
    src.start(t0);
  } catch { /* no audio */ }
}

export function buzz(pattern) {
  try { navigator.vibrate?.(pattern); } catch { /* not supported */ }
}
