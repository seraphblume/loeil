// The showcase client: one made-up client on every phone and for every seller,
// to show the app with — single vision glasses with the PD, a monthly toric
// contact lens prescription, a note, and (a quirk) a Tokyo mobile and a loeil.com address. She is put back exactly as she is here each time
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
    id: SHOWCASE_ID, showcase: true, name: 'Valeria Luxe', phone: '+81 90-7895-6779', email: 'valeria.luxe@loeil.com',
    customerId: '', birthdate: '1994-05-12', quality: 'Easygoing', nearRx: null, rxHistory: [],
    prescription: {
      ...blankRx(), issuedOn,
      od: { ...blankEye(), sphere: -1.75, cylinder: -0.5, axis: 175, pdFar: 31.5 },
      os: { ...blankEye(), sphere: -2.25, cylinder: -0.75, axis: 10, pdFar: 32 },
    },
    contactRx: {
      ...blankContactRx(), issuedOn, brand: 'Biofinity Toric', modality: 'Monthly',
      od: { ...blankContactEye(), sphere: -1.5, cylinder: -0.75, axis: 180 },
      os: { ...blankContactEye(), sphere: -2.25, cylinder: -0.75, axis: 10 },
    },
    notes: 'Showcase client — on every phone, for demonstrations. Changes to her record are undone the next time the app opens.',
    isFavourite: true, createdOn: '2026-10-11T00:00:00.000Z',
  };
}

/** The clients with the showcase client put back as she should be. */
export function withShowcase(clients, now = new Date()) {
  return [...clients.filter((c) => !isShowcase(c)), showcaseClient(now)];
}
