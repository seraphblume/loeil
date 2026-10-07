// The amount in words, as a ticket writes it under the figure:
// `** EIGHT THOUSAND FIVE HUNDRED NINETY-FOUR PESOS 00/100 **`.

const ONES = ['', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN', 'ELEVEN', 'TWELVE',
  'THIRTEEN', 'FOURTEEN', 'FIFTEEN', 'SIXTEEN', 'SEVENTEEN', 'EIGHTEEN', 'NINETEEN'];
const TENS = ['', '', 'TWENTY', 'THIRTY', 'FORTY', 'FIFTY', 'SIXTY', 'SEVENTY', 'EIGHTY', 'NINETY'];
const SCALES = [[1e9, 'BILLION'], [1e6, 'MILLION'], [1e3, 'THOUSAND']];

function under1000(n) {
  const out = [];
  if (n >= 100) { out.push(ONES[Math.floor(n / 100)], 'HUNDRED'); n %= 100; }
  if (n >= 20) { out.push(TENS[Math.floor(n / 10)] + (n % 10 ? '-' + ONES[n % 10] : '')); } else if (n > 0) out.push(ONES[n]);
  return out.join(' ');
}

/** A whole number in English words, capitals. */
export function numberWords(n) {
  n = Math.floor(Math.abs(Number(n) || 0));
  if (n === 0) return 'ZERO';
  const out = [];
  for (const [size, name] of SCALES) {
    if (n >= size) { out.push(under1000(Math.floor(n / size)), name); n %= size; }
  }
  if (n) out.push(under1000(n));
  return out.join(' ');
}

/** Centavos → `EIGHT THOUSAND … PESOS 00/100`. */
export function amountWords(cents) {
  const c = Math.round(Math.abs(Number(cents) || 0));
  const pesos = Math.floor(c / 100);
  const rest = String(c % 100).padStart(2, '0');
  return `${numberWords(pesos)} ${pesos === 1 ? 'PESO' : 'PESOS'} ${rest}/100`;
}
