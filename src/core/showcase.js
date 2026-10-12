// The showcase client: one made-up client on every phone and for every seller,
// to show the app with — glasses with an ADD and the PD, a multifocal contact
// lens prescription, a note. She is put back exactly as she is here each time
// the app opens, cannot be deleted, is never due a visit, and the orders made
// for her are left out of the sales figures. Nothing about her is real.

import { blankRx, blankEye, blankContactRx, blankContactEye } from './crm.js';
import { isoDay, addDays } from './util.js';

export const SHOWCASE_ID = 'showcase-valeria-luxe';
export const isShowcase = (client) => client?.id === SHOWCASE_ID;
export const isShowcaseOrder = (order) => order?.clientId === SHOWCASE_ID;

/** Her record, with prescriptions issued a month before today so they always read as current. */
export function showcaseClient(now = new Date()) {
  const issuedOn = isoDay(addDays(now, -30));
  return {
    id: SHOWCASE_ID, showcase: true, name: 'Valeria Luxe', phone: '5500000000', email: 'valeria.luxe@example.com',
    prescription: {
      ...blankRx(), issuedOn,
      od: { ...blankEye(), sphere: -1.75, cylinder: -0.5, axis: 175, addition: 1.75, pdFar: 31.5 },
      os: { ...blankEye(), sphere: -2.25, cylinder: -0.75, axis: 10, addition: 1.75, pdFar: 32 },
    },
    contactRx: {
      ...blankContactRx(), issuedOn, brand: 'Air Optix Plus HydraGlyde Multifocal', modality: 'Monthly', addition: 1.75,
      od: { ...blankContactEye(), sphere: -1.5 }, os: { ...blankContactEye(), sphere: -2 },
    },
    notes: 'Showcase client — on every phone, for demonstrations. Changes to her record are undone the next time the app opens.',
    isFavourite: true, createdOn: '2026-10-11T00:00:00.000Z',
  };
}

/** The clients with the showcase client put back as she should be. */
export function withShowcase(clients, now = new Date()) {
  return [...clients.filter((c) => !isShowcase(c)), showcaseClient(now)];
}
