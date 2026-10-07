import { useState, useEffect, useRef, useMemo, useReducer } from './html.js';
import { getState, subscribe } from '../state/app.js';
import { resolveOrder } from '../core/sets.js';

/**
 * The selected slice of app state, read fresh on every render — so a screen
 * whose props change (another client's id) never shows the last one's data —
 * and a re-render whenever the store changes that slice.
 */
export function useApp(select = (s) => s) {
  const [, rerender] = useReducer((n) => n + 1, 0);
  const sel = useRef(select);
  sel.current = select;
  const value = select(getState());
  const last = useRef(value);
  last.current = value;
  useEffect(() => subscribe((s) => {
    if (!Object.is(sel.current(s), last.current)) rerender();
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
