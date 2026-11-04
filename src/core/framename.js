// A frame by its model, the way it is read off the temple: the catalogue's
// description is the POS's — `CALVIN KLEIN CK22102 002 NEGRO-GRIS`, brand,
// model, colour code, sometimes the size, then the colour names in Spanish —
// and the short form keeps the model and its colour code: `CK22102 002`.
// The brand goes beside it in its own spelling (`Calvin Klein CK22102 002`).

const fold = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/**
 * The Spanish colour words the POS ends a description with (NEGRO-GRIS,
 * CRISTAL, ORO MATE, AZUL ANTIGUO/VIEJO…). A brand's own colour code in English
 * (BLACK, GUN, HAVANA) is part of the model and stays.
 */
const COLOURS = new Set([
  'AMARILLO', 'ANTIGUO', 'AZUL', 'BEIGE', 'BLANCO', 'BRILLANTE', 'BRONCE', 'CAF', 'CAFE', 'CAREY', 'CLARO', 'COBRE', 'CRISTAL', 'CROMO', 'DEMI', 'DORADO',
  'ESPEJO', 'FUCSIA', 'GRIS', 'GUNMETAL', 'HOLOGRAFICO', 'LILA', 'MADERA', 'MARRON', 'MATE', 'MET', 'METALICO', 'MORADO',
  'MULTICOLOR', 'NARANJA', 'NEGRO', 'NUDE', 'OBS', 'OLIVO', 'ORO', 'OSC', 'OSCURO', 'PLATA', 'ROJO', 'ROSA', 'SALMON', 'SC',
  'OPACO', 'TORNASOL', 'TRANSPAREN', 'TRANSPARENT', 'TRANSPARENTE', 'TURQUESA', 'VERDE', 'VIEJO', 'VINO',
]);
const colourish = (t) => { const parts = String(t).split(/[-/]/).map(fold).filter(Boolean); return parts.length > 0 && parts.every((p) => COLOURS.has(p)); };

/** `{ model: 'CK22102 002', colour: 'NEGRO-GRIS' }` — or the description whole when it does not read that way. */
export function frameParts({ description = '', brand = '', size = null } = {}) {
  const toks = String(description).trim().split(/\s+/).filter(Boolean);
  if (!toks.length) return { model: '', colour: '' };
  const words = String(brand).split(/[\s\-]+/).map(fold).filter(Boolean);
  const whole = fold(brand);
  // The brand's words, in any spelling: RAY BAN for Ray-Ban, MONT BLANC for Montblanc, E ARMANI, BOSS twice.
  let i = 0;
  let acc = '';
  while (whole && i < toks.length - 1) {
    const t = fold(toks[i]);
    if (!t) { i++; continue; }
    const fits = words.includes(t) || whole.startsWith(acc + t) || (t.length === 1 && words.some((w) => w.startsWith(t)));
    if (!fits) break;
    acc += t;
    i++;
  }
  const rest = toks.slice(i);
  const colour = [];
  while (rest.length > 1 && (colourish(rest[rest.length - 1]) || (size && rest[rest.length - 1] === String(size)))) {
    const t = rest.pop();
    if (colourish(t)) colour.unshift(t);
  }
  return { model: rest.join(' '), colour: colour.join(' ') };
}

/** `CK22102 002`. Placeholders and the client's own frame keep their words. */
export function frameModel(f) {
  if (!f || f.placeholder || f.own) return f?.description ?? '';
  return frameParts(f).model || f.description || '';
}

/** `Calvin Klein CK22102 002` — the brand in its own spelling, then the model. */
export function frameName(f) {
  if (!f || f.placeholder || f.own) return f?.description ?? '';
  const model = frameModel(f);
  return f.brand && fold(model).indexOf(fold(f.brand)) !== 0 ? `${f.brand} ${model}` : model;
}
