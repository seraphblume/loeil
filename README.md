# L’Œil

Lens and frame quoting for the counter, as a web app that installs on any phone.
A GinAile product.

**Live:** https://seraphblume.github.io/loeil/

It narrows the lens catalogue one decision at a time with a count on every
option, prices frames from the catalogue by barcode, builds the order with the
codes the register needs, says which promotions apply, keeps client records with
their prescriptions, and reads the autorefractor ticket.

## Install on a phone

Open the link, then **Add to Home Screen** (Safari: Share → Add to Home Screen;
Chrome: menu → Install app). Installed, it opens full screen, works offline, and
the browser will not clear its storage. Enter the store passcode once, pick who is
using the phone, and it is ready.

## Where the data lives

| What | Where | Who can read it |
|---|---|---|
| Prices, lenses, frames, stock, promotions, staff | `data/catalogue.enc.json`, encrypted (AES-256-GCM, key from the store passcode via PBKDF2) | Anyone with the passcode |
| Client records and orders | That phone only (IndexedDB) | Nobody else — no sync, no account |
| GitHub token for publishing | The admin’s phone only | The admin |

The workbooks themselves are **never committed**. `.gitignore` refuses `*.xlsx`.
The repository and the site hold only code and the encrypted file.

Back up client records from **Me → Export backup**. Backups from the earlier
iPhone and Android apps restore here too (**Me → Restore from a backup**).

## Changing prices, coatings, frames or promotions

1. Edit the workbooks:
   - **`LOEIL_Backend.xlsx`** — lenses and prices, stock, extras, staff,
     promotions, and the **vocabulary** tab.
   - **`Catalogue.xlsx`** — the frame catalogue, one tab per brand. It is the
     source of truth for every frame’s price, brand, category, material and size.
     The Backend’s `inventory` tab only adds how many are on the shelf.
2. On the admin phone: **Me → Publish data**, pick both files.
3. The app runs the publish gate (duplicate rows, missing prices, malformed
   barcodes, broken promo links…). Any error stops the publish.
4. It encrypts and commits `data/catalogue.enc.json`. Pages redeploys in about a
   minute; every phone updates on its next launch.

From a computer instead: `cd tools && npm install && node publish.mjs LOEIL_Backend.xlsx Catalogue.xlsx`,
then commit `data/catalogue.enc.json`.

### The vocabulary tab — nothing about the catalogue is in the code

Each lens row names its attributes by code (`4300 — Polylite`, `CZS (Crizal Sapphire)`).
The `vocabulary` tab says, per code, what the app should do with it:

| Column | Does |
|---|---|
| `kind` + `code` | The key: `treatment` + `CZS`. Never edit a code. |
| `english` | What the app shows. Blank → the POS wording. |
| `blurb` | One line to say to the customer. |
| `rank` | Option order. For coatings it is the **upgrade ladder**: a lens offers every coating ranked above its own, with the price difference. |
| `promo_group` | The family the promo table speaks in: materials → `POLY`/`CR39`/`HI`, filters → `BLANCO`/`FOTO`/`TRANS`/`POLAR`, coatings → `CRIZAL` (matches `*CRIZAL` lines). |
| `same_as` | Old and new codes for one product (`CZS` ↔ `CZN`). |
| `high_rx` | `YES` on materials suggested when the sphere is beyond ±10. |

**Adding a coating:** add its price rows to `lenses_single` / `lenses_multifocal`,
add one `vocabulary` row (kind `treatment`, code, English name, rank, promo group),
publish. It appears in the finder, on the upgrade ladder and in promo matching —
no app update. A code with no vocabulary row still sells; it just shows the POS
wording, and the gate lists it.

**Changing a price:** edit the cell, publish.

## The passcode

Set when publishing (Me → Publish data → Use a new passcode). Phones that have
the old one keep working on their copy and ask for the new one when an update
arrives. **Me → Lock this phone** removes the catalogue and passcode from a phone
without touching its clients.

## Publishing access

The admin phone needs a fine-grained GitHub token: GitHub → Settings → Developer
settings → Fine-grained tokens → only `seraphblume/loeil` → **Contents: Read and
write**, nothing else. It is stored on that phone only.

## Development

No build step: every file is what the browser runs (Preact + htm, vendored).

```sh
python3 -m http.server 8000      # then open http://localhost:8000
```

The service worker is off on `http://`; set `localStorage.loeilSW = '1'` to test
it locally. Deploys run through `.github/workflows/pages.yml`, which stamps the
service worker so each code change installs as one complete offline copy.
Publishing data does not change the stamp, so phones never re-download the app
just for new prices.

```
index.html, sw.js, manifest.webmanifest
src/config.js         every app rule in one place (validity, recall, bounds…)
src/core/             pure logic, shared with tools/publish.mjs
  ingest.js           workbooks → bundle + the publish gate
  crypto.js           the encrypted envelope
  catalogue.js        runtime catalogue, frames, stock, vocabulary
  lens.js             cascades, POS code, upgrades, search
  promotions.js       promo matching (families come from the vocabulary)
  orders.js crm.js rxticket.js backup.js
src/state/            storage, sync, app state, updates
src/ui/               screens
tools/                publish from a computer; deploy stamping
```

Settings → Pages → Source must be **GitHub Actions**.
