import { useState, useEffect, useRef } from './html.js';
import { getState, subscribe } from '../state/app.js';

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
