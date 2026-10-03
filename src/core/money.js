// Prices are Mexican pesos, held as integer centavos everywhere.
// `es-MX` renders `$4,670`; an English locale would render `MX$4,670`, which
// is not what the register or the customer sees.

const whole = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export function money(cents) {
  if (cents === null || cents === undefined || Number.isNaN(cents)) return '—';
  return whole.format(cents / 100);
}

/** `+$450` for a difference. */
export function moneyDelta(cents) {
  if (!cents) return money(0);
  return (cents > 0 ? '+' : '−') + money(Math.abs(cents));
}
