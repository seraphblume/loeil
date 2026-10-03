// Hash routing: works on GitHub Pages with no server rules, survives a reload,
// and gives the phone's back gesture something real to go back to.
//
//   #/find …          the Find tab and everything reached from it
//   #/clients/<id>    #/orders/<id>    #/me …

import { useState, useEffect, useLayoutEffect } from './html.js';

export const TABS = ['find', 'clients', 'orders', 'me'];
const lastByTab = {};
const scrollByHref = new Map();
let depth = 0;

export function parseHash(hash = location.hash) {
  const raw = hash.replace(/^#\/?/, '');
  const [pathPart, queryPart = ''] = raw.split('?');
  const parts = pathPart.split('/').filter(Boolean).map((p) => { try { return decodeURIComponent(p); } catch { return p; } });
  const tab = TABS.includes(parts[0]) ? parts[0] : 'find';
  return { tab, parts: parts.length ? parts : ['find'], query: new URLSearchParams(queryPart), href: '#/' + raw };
}

export function href(parts, query) {
  const path = parts.map((p) => encodeURIComponent(p)).join('/');
  const q = query ? new URLSearchParams(Object.entries(query).filter(([, v]) => v != null && v !== '')).toString() : '';
  return '#/' + path + (q ? '?' + q : '');
}

function remember() { scrollByHref.set(parseHash().href, window.scrollY); }

export function go(target, { replace = false } = {}) {
  const url = typeof target === 'string' ? target : href(target.parts, target.query);
  remember();
  if (replace) history.replaceState(null, '', url);
  else { history.pushState(null, '', url); depth++; scrollByHref.delete(parseHash(url).href); }
  window.dispatchEvent(new CustomEvent('route'));
}

/** Back within the app, or to `fallback` when there is nowhere to go back to. */
export function back(fallback) {
  if (depth > 0) history.back();
  else go(fallback, { replace: true });
}

/** Where a tab button goes: the tab root if already there, else where you left it. */
export function tabHref(tab, current) {
  if (current.tab === tab) return '#/' + tab;
  return lastByTab[tab] ?? '#/' + tab;
}

export function useRoute() {
  const [route, setRoute] = useState(() => parseHash());
  useEffect(() => {
    const on = (e) => {
      if (e.type === 'popstate') depth = Math.max(0, depth - 1);
      const r = parseHash();
      lastByTab[r.tab] = r.href;
      setRoute(r);
    };
    const onClickLink = () => remember();
    window.addEventListener('route', on);
    window.addEventListener('popstate', on);
    window.addEventListener('hashchange', on);
    window.addEventListener('click', onClickLink, true);
    lastByTab[route.tab] = route.href;
    return () => {
      window.removeEventListener('route', on);
      window.removeEventListener('popstate', on);
      window.removeEventListener('hashchange', on);
      window.removeEventListener('click', onClickLink, true);
    };
  }, []);
  useLayoutEffect(() => {
    window.scrollTo(0, scrollByHref.get(route.href) ?? 0);
  }, [route.href]);
  return route;
}

/** Plain `<a href="#/…">` links count as forward navigation too. */
export function linkProps(target) {
  const url = typeof target === 'string' ? target : href(target.parts, target.query);
  return {
    href: url,
    onClick: (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      e.preventDefault();
      go(url);
    },
  };
}
