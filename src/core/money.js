// Prices are Mexican pesos, held as integer centavos everywhere.
// `es-MX` renders `$4,670`; an English locale would render `MX$4,670`, which
// is not what the register or the customer sees.

// Whole pesos print without decimals; an amount with centavos prints them, as
// the register does ($643.90), so a discount or a percentage never rounds away.

const whole = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});
const exact = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** `{ cents: true }` always prints the centavos, the way a ticket does ($2,319.50, $8,594.00). */
export function money(cents, { cents: always = false } = {}) {
  if (cents === null || cents === undefined || Number.isNaN(cents)) return '—';
  const c = Math.round(cents);
  return (c % 100 === 0 && !always ? whole : exact).format(c / 100);
}

/** `+$450` for a difference. */
export function moneyDelta(cents) {
  if (!cents) return money(0);
  return (cents > 0 ? '+' : '−') + money(Math.abs(cents));
}
