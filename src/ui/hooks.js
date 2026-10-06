import { useState, useEffect, useRef, useMemo } from './html.js';
import { getState, subscribe } from '../state/app.js';
import { resolveOrder } from '../core/sets.js';

/** Re-render when the selected slice of app state changes. */
export function useApp(select = (s) => s) {
  const [value, setValue] = useState(() => select(getState()));
  const sel = useRef(select);
  sel.current = select;
  useEffect(() => subscribe((s) => {
    const next = sel.current(s);
    setValue((prev) => (Object.is(prev, next) ? prev : next));
  }), []);
  return value;
}

export function useDebounced(value, ms = 120) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

/** The order in progress, read against today's campaign (sets, set rows, discounts). */
export function useResolvedDraft() {
  const draft = useApp((s) => s.draft);
  const catalogue = useApp((s) => s.catalogue);
  return useMemo(() => resolveOrder(draft, catalogue), [draft, catalogue]);
}
