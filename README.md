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
| Unpublished edits | The admin’s phone (the working copy) | The admin |
| Client records and orders | That phone only (IndexedDB) | Nobody else — no sync, no account |
| GitHub token for publishing | The admin’s phone only | The admin |

**L’Œil owns its data.** No spreadsheet and no Google service is needed to run it
or to change it. The published file is the source of truth, and every publish is
a commit, so the full history is in this repository’s log. The repository and the
site hold only code and the encrypted file; `.gitignore` refuses `*.xlsx`.

Back up client records from **Me → Export backup**. Backups from the earlier
iPhone and Android apps restore here too (**Me → Restore from a backup**).

## Changing the catalogue

On the admin phone: **Me → Catalogue data**. Every edit goes into a *working
copy* saved on that phone; nobody sees it until **Review and publish**.

| To… | Go to |
|---|---|
| Change a lens price, mark a lens unavailable, add a combination | Single vision / Multifocal / Contact lens prices |
| Raise or lower many prices at once (by $, %, or set; round to the peso or to a price ending in 9) | Adjust prices — lenses by coating, material, filter or design; frames by brand, category, material |
| Bring in a new coating across many lenses | Add a coating to many lenses — pick the lenses, base the prices on an existing coating plus an amount |
| Rename a code, set the upgrade order or promo family | Coatings, materials and names |
| Add, reprice or remove a frame | Frames (category, material and eye size are read from the product code) |
| Set brand tiers | Brand tiers |
| Update stock | Stock → **Import the stock report (PDF)**: print the POS *Reporte Existencias* to PDF and pick it |
| Rotate promotions | Promotions → **New campaign dates**, or edit one; lens lines are built from pickers |
| Add or switch off a seller | Staff |

**Review and publish** lists every change against what the phones have, runs the
publish gate (duplicate rows, missing prices, malformed barcodes, broken promo
links…), encrypts, and commits `data/catalogue.enc.json`. Pages redeploys in about
a minute; every phone updates on its next launch. If another device published
after your working copy was started, it stops and asks before overwriting.

**Files are optional.** *Import a stock report or workbook* brings a lot in at
once; *Export as workbooks* gives an offline copy in the same layout, which can be
edited on a computer and imported back. From a computer without the app:
`cd tools && npm install && node publish.mjs LOEIL_Backend.xlsx Catalogue.xlsx`.

### Coatings, materials and names — nothing about the catalogue is in the code

Each lens row names its attributes by code (`4300 — Polylite`, `CZS (Crizal Sapphire)`).
The names list says, per code, what the app does with it:

| Field | Does |
|---|---|
| kind + code | The key: `treatment` + `CZS`. Never change a code lenses use. |
| English name | What the app shows. Blank → the POS wording. |
| Blurb | One line to say to the customer. |
| Rank | Option order. For coatings it is the **upgrade ladder**: a lens offers every coating ranked above its own, with the price difference. |
| Promo group | The family the promo table speaks in: materials → `POLY`/`CR39`/`HI`, filters → `BLANCO`/`FOTO`/`TRANS`/`POLAR`, coatings → `CRIZAL` (matches `*CRIZAL` lines). |
| Same as | Old and new codes for one product (`CZS` ↔ `CZN`). |
| High Rx | Materials suggested when the sphere is beyond ±10. |

A code with no entry still sells; it shows the POS wording and the gate lists it.

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
  validate.js         the publish gate
  edits.js diff.js    every catalogue edit, and what changed
  stockreport.js      the POS stock report PDF → stock
  ingest.js export.js workbooks in and out (optional)
  crypto.js           the encrypted envelope
  catalogue.js        runtime catalogue, frames, stock, vocabulary
  lens.js             cascades, POS code, upgrades, search
  promotions.js       promo matching (families come from the vocabulary)
  orders.js crm.js rxticket.js backup.js
src/state/            storage, sync, the working copy, updates
src/ui/               screens; src/ui/data/ is the catalogue editor
tools/                publish from a computer; deploy stamping
```

Settings → Pages → Source must be **GitHub Actions**.
