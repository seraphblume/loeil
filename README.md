# L’Œil

Lens and frame quoting for the counter, as a web app that installs on any phone.
A GinAile product.

**Live:** https://seraphblume.github.io/loeil/

It narrows the lens catalogue one decision at a time with a count on every
option, prices frames from the catalogue by barcode, builds the order with the
codes the register needs, says which promotions apply, keeps client records with
their glasses and contact lens prescriptions, and prints the register's ticket.

On a phone it has a floating tab bar and one screen at a time. On an iPad or a
computer (768 px and wider) it has a sidebar, and Clients and Orders open as a
list beside the record; in iPad portrait the sidebar folds to a rail of icons.

## Install on a phone

Open the link, then **Add to Home Screen** (Safari: Share → Add to Home Screen;
Chrome: menu → Install app). Installed, it opens full screen, works offline, and
the browser will not clear its storage. Enter the store passcode once, pick who is
using the phone, and it is ready.

## Where the data lives

| What | Where | Who can read it |
|---|---|---|
| Prices, lenses, frames, stock, promotions, staff, the branch on the ticket | `data/catalogue.enc.json`, encrypted (AES-256-GCM, key from the store passcode via PBKDF2) | Anyone with the passcode |
| Unpublished edits | The admin’s phone (the working copy) | The admin |
| Client records and orders | That phone only (IndexedDB) | Nobody else — no sync, no account |
| GitHub token for publishing | The admin’s phone only | The admin |

**L’Œil owns its data.** No spreadsheet and no Google service is needed to run it
or to change it. The published file is the source of truth, and every publish is
a commit, so the full history is in this repository’s log. The repository and the
site hold only code and the encrypted file; `.gitignore` refuses `*.xlsx`.

Back up client records from **Me → Export backup**. **Me → Restore or import**
takes a backup from this app or the earlier iPhone and Android apps, or the
**Alpha workbook**: its CRM table comes in on the phone — each client with their
latest glasses and contact lens prescriptions, and every ticket as a sale in their
history (Sell ID, shipment, deal, seller, amount). A client is the same name with
the same phone (a phone is not a person: families share one). Someone already on
the phone keeps what is there; a newer prescription or a missing phone is filled
in, and importing the same workbook again adds only what is new. The workbook is
read in the browser and never leaves the phone.

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
| Start a new campaign of sets | Sets → **New campaign dates**; then each set's price, brands and row prices |
| Change which lenses a row of the sets' table covers | Sets → Lens rows |
| Discounts that apply on their own (30% on contacts…) | Sets → Campaign discounts |
| Rotate promotions | Promotions → **New campaign dates**, or edit one; lens lines are built from pickers |
| Add or switch off a seller | Staff |
| Price an add-on as a share of the glasses (Plus Protection: 10) | Extras → Percent |

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
| Needs AOB | A lens with this design, type or coating asks for the AOB of each eye on the order (Eyezen Start `ES`, progressives `PR`, Crizal Prevencia `CPU`). |

A code with no entry still sells; it shows the POS wording and the gate lists it.

## Orders

Spectacle lenses go on an order as the pair, at the catalogue's pair price; the
register still takes the lens code ×2, one per eye. Contact lenses go on one eye
at a time (OD or OS), priced per box. Any frame or lens line can take a 40% or 50%
discount (`LINE_DISCOUNTS` in `src/config.js`). An add-on with a percentage is
priced from the frame and spectacle lenses on the order after their discounts —
Plus Protection on a $6,439 frame comes to $643.90, as the register prints it.

## Prescriptions

Entered the register's way: each eye in its own panel, every value a slider with
its figure beside it to type, inside the POS's limits — SPH −25 to +10, CYL −8 to
0, AXIS 0–180, PD (per eye) 20–40, ADD 0 to +4 — and **Add prisms** for a prism
and its base per eye. A sphere typed without a sign keeps the one shown (± flips
it); a cylinder is always minus. A binocular PD on file splits into halves the
moment one eye's PD is set.

A client has a glasses prescription and, if they wear them, a contact lens one
(brand, replacement, SPH CYL AXIS per eye, ADD); a contact lens line suggests its
power from it. The order carries the prescription the job is made to (it starts
as the client's and can be saved back to them), and, when its lenses need it, the
**AOB** of each eye (15–30 mm) — measured for the job, so it stays on the order.

## Checkout and the receipt

**Checkout** on the order prints it: the paper feeds out of the printer (with a
printer sound, if he turns it on — off by default). Both copies — register and
customer — print as the register's own ticket: the branch at the top (name,
address, phone — **Me → Catalogue data → Store**, encrypted with the catalogue),
employee, client and discount numbers; the material lines with quantity, price,
net and total (a pair of lenses is a line per eye at half the pair, its coating a
line of two, included); the time, the amount and the amount in words; the
prescription (SPH CYL AXIS, ADD and AOB when the job has them, PD per eye — the
monocular figure, or half the binocular one, marked); and the store's foot.

Below the register copy, what the POS asks for in its order, every value a tap to
copy: 1 frame SKU, 2 lens and coating codes (a coating sold under a newer code
prints as that code — `printAs` in the names list, so CZS prints as CZN), 3 set or
discount numbers, 4 extras, 5 the prescription.

**Share image** sends the receipt as a picture (the phone's share sheet, or a
download); **Copy all** puts everything on the clipboard as text. A saved order
keeps its prices and the prescription it was made for, and reprints from
Orders → the order → Print the receipt.

## Sets

A set is the campaign's price for an ophthalmic frame of its brands with single
vision lenses (Set $1,999, ID Maestro 19990). Better lenses add a fixed amount
from the set's table, so Transitions with Crizal on a Xikú frame is
$1,999 + $5,099 = $7,098 — and Plus Protection, if added, is 10% of that.

Scan the frame and the order does the rest: the frame's brand picks the set, the
lens walked in the cascade finds its row of the table on its own (or he picks
it), and the ID Maestro goes in the codes. A catalogue frame is matched on its
brand exactly; a frame known only from stock on the brand its description
starts with. Each row's match (`family|material|design|filter|colour|coating`)
lives in the data, as does every price, so a new campaign is a data edit.

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
