// L'Œil — every tunable in one place.
//
// Nothing about the catalogue lives here. Prices, treatments, English names,
// upgrade order and promo families all come from the Backend workbook (see
// `vocabulary` in the README). This file holds only the rules of the app itself.

export const APP_NAME = 'L’Œil';

/** Bump when a published data file needs a newer app to read it. The envelope
 *  carries `minAppBuild`; an older app keeps its cache and says so. */
export const APP_BUILD = 1;

/** The encrypted catalogue, relative to the site root. */
export const DATA_PATH = 'data/catalogue.enc.json';

/** Network budget for the launch check. The app is usable before it resolves. */
export const FETCH_TIMEOUT_MS = 8000;

/** Key stretching for the store passcode. ~0.2–0.5 s on a phone, once per publish. */
export const PBKDF2_ITERATIONS = 250000;

/** Where the admin publishes to. Inferred from the Pages URL when possible. */
export const DEFAULT_REPO = { owner: 'seraphblume', repo: 'loeil', branch: 'main' };

/** The publish gate: prices outside these bounds stop a publish (pesos). */
export const PRICE_BOUNDS = {
  SV: [500, 30000],
  MF: [500, 30000],
  CL: [100, 30000],
  FRAME: [50, 200000],
};

/** Staff employee numbers are this many digits. */
export const EMPLOYEE_NUMBER_DIGITS = 5;
/** Barcodes (true SKUs) are this many digits. */
export const TRUE_SKU_DIGITS = 8;

/** Prescriptions run this long from the issue date. */
export const RX_VALID_MONTHS = 12;
/** Warn this many months before an Rx expires. */
export const RX_WARN_MONTHS = 3;
/** Beyond this absolute sphere, standard materials will not fill. */
export const HIGH_RX_SPHERE = 10;
/** A client is due this long after their last sale… */
export const RECALL_MONTHS = 12;
/** …and shows on the recall list this many days ahead. */
export const RECALL_WINDOW_DAYS = 30;

/** Discounts a seller can put on a priced line of an order, in percent. */
export const LINE_DISCOUNTS = [40, 50];

/** Contribution grid on the Me tab. */
export const GRID_WEEKS = 26;

