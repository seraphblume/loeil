// Code 128, so the frame's barcode on the receipt scans at the register.
//
// An even run of digits uses code set C (two digits per symbol: the 8-digit
// SKU is four symbols); anything else uses code set B. Each pattern is the
// widths of bar, space, bar, space, bar, space in modules; the stop adds a
// final bar.

const PATTERNS = ['212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213', '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132', '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211', '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313', '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331', '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111', '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214', '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111', '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141', '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141', '114131', '311141', '411131', '211412', '211214', '211232', '2331112'];
const START_B = 104;
const START_C = 105;
const STOP = 106;

/** The symbol values, start and checksum included, stop excluded. */
export function code128Values(text) {
  const s = String(text ?? '');
  let values;
  if (/^\d+$/.test(s) && s.length % 2 === 0 && s.length >= 2) {
    values = [START_C];
    for (let i = 0; i < s.length; i += 2) values.push(Number(s.slice(i, i + 2)));
  } else {
    values = [START_B];
    for (const ch of s) {
      const c = ch.charCodeAt(0);
      values.push(c >= 32 && c <= 127 ? c - 32 : 0);
    }
  }
  const check = values.reduce((sum, v, i) => sum + v * (i === 0 ? 1 : i), 0) % 103;
  return [...values, check];
}

/** Alternating bar/space widths in modules, quiet zones excluded. */
export function code128Widths(text) {
  return [...code128Values(text), STOP].flatMap((v) => [...PATTERNS[v]].map(Number));
}

/** `[{ x, w }]` bars in modules, and the total width in modules. */
export function code128Bars(text) {
  const widths = code128Widths(text);
  const bars = [];
  let x = 0;
  widths.forEach((w, i) => { if (i % 2 === 0) bars.push({ x, w }); x += w; });
  return { bars, width: x };
}
