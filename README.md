# L’Œil

Lens and frame quoting for the counter, as a web app that installs on any phone.
A GinAile product.

**Live:** https://seraphblume.github.io/loeil/

It narrows the lens catalogue one decision at a time with a count on every
option, prices frames from the catalogue by barcode, builds the order with the
codes the register needs, says which promotions apply, keeps client records with
their glasses and contact lens prescriptions, and prints the register's ticket.

On a phone it has a floating tab bar and one screen at a time. On an iPad or a
computer (768 px and wider) the sections sit in a pill of icons at the top centre,
with the order in progress beside it, and Clients and Orders open as a list beside
the record. **Find** is a dashboard: the order in progress and what it still needs
before checkout (or the day's sales), shortcuts, the lens and frame catalogues as
tiles, and the latest orders — beside them on an iPad.

It is drawn in six colours — ink #111111, graphite #333333, stone #777777, sand
#BEB8AD, linen #E6E1D7, paper #F6F4EE — as paper by day and ink by night,
following the device's appearance. The icon is the eye in ink on paper with a
sand iris (the browser tab's icon turns to paper on ink at night).

**Valeria Luxe** is the showcase client: made up, on every phone and for every
seller, with single vision glasses (−1.75/−2.25 with the PD per eye), Biofinity
Toric contact lenses (monthly), a Tokyo mobile and a loeil.com address. She is put back as she is each time the app
opens, cannot be deleted, is never due a visit, stays out of backups, and orders
made for her are left out of the sales figures.

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
| Client records, orders, Delivery and Follow Up | That phone only (IndexedDB) | Nobody else — no sync, no account |
| GitHub token for publishing | The admin’s phone only | The admin |

**L’Œil owns its data.** No spreadsheet and no Google service is needed to run it
or to change it. The published file is the source of truth, and every publish is
a commit, so the full history is in this repository’s log. The repository and the
site hold only code and the encrypted file; `.gitignore` refuses `*.xlsx`.

Back up client records from **Me → Export backup** (Delivery and Follow Up go
with them). **Me → Restore or import** takes a backup from this app or the earlier
iPhone and Android apps, or the **Alpha workbook**:

- **Its CRM** comes in on the admin's phone only — it is his client list. Each
  client arrives with their Customer ID, birthdate, quality (Easygoing, Regular,
  Demanding, Difficult) and their spectacle, lecture and contact lens
  prescriptions, and each ticket of theirs on the **All** tab that this phone's
  seller sold becomes a sale in their history (Sell ID, shipment, deal, amount).
  The earlier CRM, a row per ticket, still reads too. A client is the same name
  with the same Customer ID or the same phone (a phone is not a person: families
  share one), or the same name when only one client on the phone has it. **Alpha is
  the source of record:** someone already on the phone takes its phone, email,
  Customer ID, birthdate, quality and prescriptions — a prescription it replaces
  goes into their history, so nothing is lost — and keeps what Alpha has no column
  for (notes, favourite, orders). Clients Alpha does not list stay as they are,
  and importing the same workbook again adds only what is new.
- **Its Control** comes in on every phone, that seller's rows only — see
  [Delivery and Follow Up](#delivery-and-follow-up).

The workbook is read in the browser and never leaves the phone.

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

Each lens row names its attributes by code (`4300 — Polylite`, `CZN (Crizal Natural Look)`).
The names list says, per code, what the app does with it:

| Field | Does |
|---|---|
| kind + code | The key: `treatment` + `CZN`. Never change a code lenses use. |
| English name | What the app shows. Blank → the POS wording. |
| Blurb | One line to say to the customer. |
| Rank | Option order. For coatings it is the **upgrade ladder**: a lens offers every coating ranked above its own, with the price difference. |
| Promo group | The family the promo table speaks in: materials → `POLY`/`CR39`/`HI`, filters → `BLANCO`/`FOTO`/`TRANS`/`POLAR`, coatings → `CRIZAL` (matches `*CRIZAL` lines). |
| Same as | Old and new codes for one product. |
| High Rx | Materials suggested when the sphere is beyond ±10. |
| Needs AOB | A lens with this design, type or coating asks for the AOB of each eye on the order (Eyezen Start `ES` and Kids `EK`, Stellest `SL`, progressives `PR`, Crizal Prevencia `CPU` and Kids `CZK`). |

A code with no entry still sells; it shows the POS wording and the gate lists it.

## Orders

Spectacle lenses go on an order as the pair, at the catalogue's pair price; the
register still takes the lens code ×2, one per eye. Contact lenses go on one eye
at a time (OD or OS), priced per box. Any frame or lens line can take a 40% or 50%
discount (`LINE_DISCOUNTS` in `src/config.js`). An add-on with a percentage is
priced from the frame and spectacle lenses on the order at their **list prices,
before any discount** (the register's *precio de lista*; a set's price is its list
price) — **Plus Protection** on a $6,439 frame comes to $643.90 whatever discount
the frame then takes.

Cases, cloths, solutions and gifts take their price from the **accessory price
list** (Catalogue data → Accessory prices, or the `accessories` tab of the Backend
workbook: product code, true SKU, description, price, collection). A gift is $0.01,
as the register charges it. An item not on the list goes to the ticket as a code
and a quantity, and the register prices it.

## Delivery and Follow Up

Alpha's **Control** sheet, on the phone: **Orders → Delivery** and **Orders →
Follow Up**. Rows come only from importing the Alpha workbook (a checkout here never
adds one), and each phone keeps its own seller's — the seller of each Sell ID on
the All tab (Follow Up falls back to its Vendor column through Config's short
names). An import puts the workbook's rows back as they are: its Status, Promised,
Delivered and Pending win over anything changed on the phone since.

A row opens as its own screen on a phone, and beside the list on an iPad or a
computer, the way an order does (`#/orders/delivery/<Sell ID>`, `#/orders/followup/<Sell ID>`).

- **Delivery** lists open orders by status (Delayed, In Production, Sent to Store,
  Ready for Pickup — oldest first), then the delivered ones, newest first. A row
  shows its promised date, the days left (or how many late), and what is pending.
  Its screen changes Status, Promised, Delivered and Pending with the sheet's own
  rules: turning **Delivered** stamps today's date, leaving it clears the date, a
  typed delivered date makes the row Delivered, and the first promised date is kept
  as the **first promise**. An open order's Delivered cell in Alpha (a live
  `=TODAY()`) is read as not delivered.
- **WhatsApp** sends what Alpha's would: Ready for Pickup sends the ready message,
  Delivered the review request, a Promised date that no longer matches the first
  promise the new-date message; anything else just opens the chat. The wording
  comes from Config's Delivery messages with each import. The phone is the CRM's,
  or else a client on this phone by the same name.
- **Follow Up** lists each eye exam whose Sell ID never carried a sale — to follow
  up, then those with a **preset** (Progressive, First glasses, Digital nomad, All
  round, Kids, Driver, Outdoors & sun, Luxury, Best Vision — Alpha's dropdown).
  With a preset, WhatsApp sends that preset's message from Config's **Follow Up
  messages**, the client's first name, the campaign's promotions and their end date
  filled in (the message can be read before it goes); without one it just opens the
  chat. The preset and Customer ID can be changed here; an earlier workbook's Plan
  ID reads as the preset. Alpha rebuilds the list for the vendor on Control (or
  All): rebuild it for All before importing on the sellers' phones.

## Brand gifts

When a brand gives something away with its frames — Converse, Carrera, Tommy,
Nautica and Guess (a bag) now, while stock lasts — it is a promotion of kind **gift** (Catalogue data →
Promotions): `brand_in` names the brands, and `gift: 61004341/61004340` the items to
hand over, from the accessory list's Brand Gift collection. A gift whose item is
not in the stock report or the price list yet (Tommy, Nautica, Guess) shows without
its item until the barcode is added. A gift shows beside
the brand's frames in every list, on the frame, and on an order carrying one, with
a tap to put the gift item on the ticket; **Me → Brand gifts** lists them all.
A gift has no end date unless it is given one: it runs while the stock lasts, and
each gift item shows how many are on hand. Gifts stay out of Live promotions, and
never change a price.

## Discounts

A line takes one discount, never two. In order:

1. **A set** prices its frame and lenses (below).
2. **Discounts that apply on their own**, while their dates run: 30% on HydraGlyde
   contacts (9335), 20% on sunglasses sold as they are (9261), **30% off the lenses
   when the client brings their own frame** (9027: a pair with no frame on the order),
   and **prescription Polarex in a sunglass frame bought here** (8922, *Polariza tu
   Solar*). 8922 reprices the single vision polycarbonate Polarex lens itself, as the
   register does, and the frame keeps its own price: $2,099.02 with anti-scratch,
   $3,999 anti-reflective, $3,599 anti-reflective HD, $6,149 Crizal, $2,649 mirror. Any
   other Polarex lens (a progressive) shows “price to confirm” until its row has a
   price (choose No discount on the line to quote it at its own price).
3. **Discounts the client claims**: **Sam's Club members** (461) show their card
   and the seller switches it on, under the client on the order. It takes 20% off
   every line nothing above covers — frames, lenses, contacts, accessories and
   Plus Protection (after it is worked out on the list prices) — but not a $0.01
   gift.

The seller's own 40% or 50% on a line replaces all of these. Every discount is data
(Catalogue data → Sets → Discounts): a percentage, or a table of lens prices (one
`match = price` per line, `= ?` for a price not known yet; the first match wins),
what it applies to, what the client shows, and its dates — both blank for a
standing one, which a new campaign's dates leave alone.

## Alliances

Insurers and employers whose members get glasses as a benefit — Seguros Centauro
(and Centauro-MetLife), Dentegra (its own plans, Mapfre and Quálitas), Dentalia-Mapfre,
CFE. Ask from the first contact: **Alliance or insurance** on the order picks the
alliance and the plan, and the order prices itself.

- **Package or own choice.** A plan's package (a frame up to an amount with the plan's
  lenses, or its contact lenses) is covered: the client pays the copay and any
  surcharge the package names (a 2nd series). Anything else is **Own choice**: every
  line at the plan's percentage off its list price (15%, under the plan's convenio),
  the coverage paid towards the frame and lenses, the client pays the copay and the
  rest. A package the order does not fit — a frame above its limit, a piece missing —
  is priced as Own choice and says why.
- **Promotions.** Centauro, Centauro-MetLife and Dentegra do not combine: under them
  the order goes without sets, campaign discounts, Sam's Club or the seller's own line
  discount. Dentalia-Mapfre and CFE combine: the sets and discounts price the order
  first and the coverage pays towards it.
- **CFE.** The voucher's lens is chosen from CFE's price table and prices the pair; the
  frame is part of the voucher; another lens takes 15% off (6513). The amount the
  voucher authorizes is typed on the alliance (default $4,300).
- **What the client pays** is the order's headline under an alliance (the dock, the
  receipt, the quote); the total stays the sale — products, copay and surcharges.
- **The register.** The package or outside-the-plan convenio goes with the set and
  discount numbers; the authorization and policy number are listed to copy. Dentalia-
  Mapfre is two orders: the copay's SKU in order 1, the plan's convenio and its copay
  adjustment (AJ) in order 2.
- **Paperwork.** What to collect, what is signed and what goes to Billing are ticked on
  the order. The order also says when an authorization is missing, and when the same
  alliance already paid for the client in the last 12 months (one per policy year).

Alliances are catalogue data, encrypted with the rest (Catalogue data → Alliances): each
alliance's paperwork and whether it combines, and per plan the coverage, copay,
packages (`convenio | glasses or contacts | frame up to | covers | price | surcharges`),
the percentage and convenio outside the plan, for other contact lenses and for
sunglasses, and CFE's lens prices. Workbooks do not carry them. The source is the
Devlyn circulares, kept privately beside the backend files, never in this repository.

## Lifestyle presets

**Lifestyle preset** at the top of the order's Add list puts a whole lens on the
order in one tap — single vision, or progressive when the prescription has an ADD;
high-index when the sphere is strong and the tier has one — with Plus Protection
and the accessories that go with it. The quote's **Add an option** opens the same
presets after the frame.

The presets are **tiles**, two to a row: First Glasses, Digital, Everyday, Kids,
Driver, Outdoor, Luxury, Clarity, Contacts and Progressive, each with its line and
the lowest price it comes to **for this prescription and this frame**. Tapping a
tile opens its tiers right below it (tapping it again closes it); the preset
already on the order opens by itself, its tier marked *On the order*. A preset with
nothing for this prescription (Progressive, for single vision) goes greyed to the end.

Every preset has the same five tiers, from the lowest price up:

| Tier | Paid accessories | Plus Protection | Lens |
|---|---|---|---|
| **Lite** | — (gifts only) | — | low-tier: CR-39, the plainest coating |
| **Essential** | — (gifts only) | — | polycarbonate, the lens the sets price (anti-reflective is included in most) |
| **Plus** | 1 | ✓ | mid-tier: HD anti-reflective, blue light, extended-design progressives |
| **Pro** | 1 | ✓ | Essilor: Crizal, Eyezen, Varilux Comfort, Transitions |
| **Ultra** | 1–2 | ✓ | Essilor's best: Crizal Prevencia or Natural Look, Varilux Physio or Xdesign, Stellest |

Every tier also takes the free gifts — a gift microfibre cloth ($0.01; Ultra and Luxury have the Toalla Maravillosa instead), and for Kids a strap — so Lite and Essential are never empty-handed.

On the order, the quote and the toast a tier reads as one name: **Digital Pro**,
**Kids Lite**. Contacts has three: **Lite** (Devlyn Multiplus 120 ml and a lens
case), **Plus** (ReNu Advanced 355 ml and the case) and **Pro**, which puts
**multifocal contact lenses** on the order — a box for each eye, the cheapest after
the campaign's discount (HydraGlyde Multifocal while its 30% runs), its fitting (SE,
ADD) started from the prescription — with the ReNu and the case. It needs an ADD;
without a prescription the fitting is added on the order.

**Each tier is priced the way the order will price it, with the frame in hand**:
the frame, the lens, Plus Protection and the accessories. Of the lenses a tier
names, it takes the one the client pays least for: in a set frame, the set's row
(a lens the set's table does not name would take the frame out of its set — the
tier says so), in a sunglasses frame the prescription sun price, otherwise the
price list. So Plus takes HD anti-reflective with a blue-light filter in a set,
where the set includes it, and Everyday Plus takes Transitions where a set makes it
cheaper than a photochromic. With no frame the prices are for the client's own frame.

**Every order gets its own accessories.** An accessory lists its alternatives —
the six Estuche Nube colours, both kids' cases and keychains — and each order takes
one of those on hand at the first one's price, weighted by stock so the shelves
empty evenly. The price never moves; the colour does, and the same order always
shows the same one.

**Polarex (Xperio) cannot take Crizal.** The price list carries a few Polarex rows
with Crizal Natural Look, and the prescription sun offer prices one; the lab does
not make them. The catalogue holds them back: greyed on the lens steps with
*Polarex can't take Crizal*, never an upgrade, never on a preset, and an order
that carries one (saved before, or found by search) is flagged with a Remove.
HD anti-reflective is the best coating Polarex takes. Validation notes the rows and
the offer's price row, and warns about a preset that could only land on one.

**Cleaning solutions damage Crizal (any of them), Transitions and Polarex**, and void
their warranty. A preset never adds one to those lenses, whatever its data says,
and an order that ends up with both is flagged — it stays only if the customer
insists. The **Saco Maravilloso** pouch carries a solution of its own, so it counts
as one, and so does anything antiempañante (alcohol-based); the Estuche Nube is only
a pouch and the Toalla Maravillosa only a polishing cloth. Contact lens solutions (ReNu, Multiplus)
never touch spectacle lenses and are not.

Presets are catalogue data (**Catalogue data → Lifestyle presets**, or the
`presets` tab of the workbook): a row per tier with its single vision and
progressive lens written like a set row (`SV|*POLY|ES|*BLANCO|*|CPU`; several
separated by `;`), or — with both blank — a contact lens (`contact_lens`,
`material|product|colour`: `5200|HM,MT|*`) or nothing at all for a care tier; the
extra codes; and the accessories as `Pouch: 64000384/64000385/64000386; Cleaning solution*: 61004172`
— the alternatives an order picks from (with none on hand, the first in the price list), a `*` marking a
cleaning solution. A tier can also name its **frame brands** (comma-separated):
choosing it then asks for a frame of one of them, unless the option already has one.
**Luxury** is built that way, with Versace, Carolina Herrera, Michael Kors, Emporio
Armani, Tous, Prada, Gucci, Tom Ford and the rest of its list.

**Progressive** is listed first and has no single vision lens, so it is progressive
only. With no prescription yet it is priced as a progressive; for a prescription
with no ADD it is shown greyed out at the end.

The Follow Up's preset list comes from Alpha (Config, the Follow Up messages), so
it keeps Alpha's names until those are renamed there too.

## Maker badges

A name in the vocabulary can carry a **maker** (the `maker` column, or **Maker
badge** under Catalogue data → Names and coatings). It shows as a small badge
beside the name: on the lens steps, on the lens and its upgrades, and on the
preset tiers. Varilux, Eyezen, Stellest, Crizal, Transitions and Polarex carry
`Essilor`, which shows as Essilor's own logo (the eye beside the wordmark) in the
brand's blue, lifted a little in dark mode so it still reads. Any other maker is
typeset. The logo lives in `src/ui/logos.js`; another maker's logo goes there too.

## The quote

The **Quote** tab is the register's presupuesto: up to three options side by side
for one client, sent as a picture. Build the order and tap **Add to quote**; change
the lens (a preset is the quick way) or the frame and add it again. Each option is
a snapshot that keeps its prices. The ticket greets the client, gives the branch,
the employee and the quote number, then for each option the frame (by brand), the
lenses, the treatments, the extras, the subtotal, the saving, the total and how long
the prices hold (the end of the option's set or campaign); its foot is the store's
**Quote footer**.

**Add an option** builds one in two steps. First the frame: keep the one on the
order, no frame, or quote it as

- **Frame** — one from the catalogue, at its price (or its set's);
- **Brand** — before the client has chosen the model. A brand in a live set is
  quoted at the set's price; one outside a set *from* its lowest catalogue price,
  and the option's total reads “from $…”;
- **Set** — any frame of the set, at the set's price; the ticket adds a Set row with
  its name (the ID Maestro stays on the order screen, off the tickets).

Then the lenses: a lifestyle preset, or the lenses already on the order. A frame
quoted by brand or set is a placeholder — the order flags it, and the real frame is
scanned before checkout. **Frame brand or set** on the order's Add list does the same
outside the quote.

## Prescriptions

Entered the register's way: each eye in its own panel, every value a slider with
its figure beside it to type, inside the POS's limits — SPH −25 to +10, CYL −8 to
0, AXIS 0–180, PD (per eye) 20–40, ADD 0 to +4 — and **Add prisms** for a prism
and its base per eye. A sphere typed without a sign keeps the one shown (± flips
it); a cylinder is always minus. A binocular PD on file splits into halves the
moment one eye's PD is set.

A client has a glasses prescription and, when they have them, a **lecture** one
for near work (no ADD; its PD is the near PD) and a contact lens one (brand,
replacement, SPH CYL AXIS per eye, ADD); a contact lens line suggests its power
from it. **A prescription is its issue date**: saving one with another date puts
the one it replaces into the client's **prescription history** (one per kind per
date), while saving with the same date is a correction and leaves nothing behind.
An entry in the history can be put back on file or removed. The client also keeps
a Customer ID, a birthdate (their age beside it) and a quality. The order carries the prescription the job is made to (it starts
as the client's and can be saved back to them), and, when its lenses need it, the
**AOB** of each eye (15–30 mm) — measured for the job, so it stays on the order.

Some contact lenses are **fitted**, not just powered — the vocabulary marks their
material's *Fitting* — and adding one asks, per eye, for what the register asks:

- **Gas permeable** (GP, scleral): **SPH** (−30 to +30), **K1** and **K2** (the
  keratometries, 35–52 D), **RC** (the lens's base curve, 6.50–9.50 mm) and **DIA**
  (its diameter, 8–24 mm) — filled in from the client's GP record and saved back to it.
- **Multifocal**: only **SE** (the spherical equivalent: sphere plus half the
  cylinder) and **ADD** — filled in from the contact lens prescription, else the
  glasses one.

Both eyes go on at once. The figures travel on the line, the ticket and the receipt
(`OD · SE −2.25 · ADD +2.00`); **Fitting** on the line edits them, and the order
flags a fitted lens without them.

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
prints as that code — `printAs` in the names list), 3 set or
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
it), and the order shows the ID Maestro for the register (the quote and the
receipt name the set only). A catalogue frame is matched on its
brand exactly; a frame known only from stock on the brand its description
starts with. Each row's match (`family|material|design|filter|colour|coating`)
lives in the data, as does every price, so a new campaign is a data edit.

**A lens the set's table doesn't name takes the frame out of the set**: no plan at
all — the frame at its full tag price and the lens at its own catalogue price, with
no ID Maestro on the ticket (a high-index lens on a Set $4,999 frame, say). For a
lens the register does price on a row (a tint), **Price in the set** on the lens
picks the row by hand and puts both back in the set.

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
  alliances.js        insurers and employers: coverage, copay, packages, paperwork
  orders.js crm.js rxticket.js backup.js
  alpha.js control.js the Alpha workbook: its CRM, and Control (Delivery, Follow Up)
src/state/            storage, sync, the working copy, updates
src/ui/               screens; src/ui/data/ is the catalogue editor
tools/                publish from a computer; deploy stamping
```

Settings → Pages → Source must be **GitHub Actions**.
