// The branch the tickets are printed for: its name, address and phone at the
// top of the receipt, and the lines at its foot. It is the employer's data, so
// it lives in the encrypted catalogue and is edited in the app, never written
// into the code.

export const STORE_FIELDS = [
  { key: 'branchCode', label: 'Branch code' },
  { key: 'branchName', label: 'Branch name' },
  { key: 'address', label: 'Address' },
  { key: 'district', label: 'District' },
  { key: 'municipality', label: 'Municipality' },
  { key: 'city', label: 'City' },
  { key: 'state', label: 'State' },
  { key: 'zip', label: 'ZIP code' },
  { key: 'country', label: 'Country' },
  { key: 'phone', label: 'Phone' },
  { key: 'footer', label: 'Footer', type: 'textarea', hint: 'One line per line of the ticket’s foot: the note to keep it, the return policy, customer service.' },
];

export const STORE_KEYS = STORE_FIELDS.map((f) => f.key);

/** Only the known fields, trimmed; empty ones dropped. */
export function cleanStore(s) {
  if (!s) return null;
  const out = {};
  for (const k of STORE_KEYS) {
    const v = String(s[k] ?? '').replace(/\r\n/g, '\n').trim();
    if (v) out[k] = v;
  }
  return Object.keys(out).length ? out : null;
}

/** The ticket's foot, one entry per line. */
export const footerLines = (store) => String(store?.footer ?? '').split('\n').map((l) => l.trim());
