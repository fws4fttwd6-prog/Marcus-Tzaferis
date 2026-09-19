# Cellar Scout

Wine priced the way it actually arrives in **Toronto, Ontario**.

You type a wine name. It searches the live web for merchants selling it, works
out what each bottle costs *delivered to Toronto* — freight, customs duty,
federal excise, the LCBO's cut and 13% HST — and ranks what it finds by how
good a deal it is, not by how cheap the shelf price looks.

It also knows its vintages. Every result is judged against a consensus vintage
chart, so it can tell you that the 2019 scores within a point of the 2016 and
sells for a third less, and that the 2014 is a year to leave alone whatever the
discount.

```
    VINTAGE  MERCHANT                     FROM               SHELF*   LANDED*
A   2020     LCBO Vintages                Canada            $149.95   $173.40
B   2021     Xtrawine                     Italy             $107.92   $211.90
B   2019     Vino.com                     Italy             $118.56   $228.68
C   2016     Millesima                    France            $170.24   $319.25
C   2015     Justerini & Brooks (1500ml)  United Kingdom    $186.90   $317.57
C   2014     Callmewine                   Italy              $94.24   $190.32
D   2019     Wine Library                 United States     $136.62   $252.18

* per 750ml equivalent, so other formats compare fairly
```

Note what that table shows: Callmewine has by far the cheapest bottle on the
shelf and it is still not the best buy, because the 2014 was a poor year in
Bolgheri. Wine Library is cheaper than Millesima and scores worse, because it
will not ship to Canada at all. **Shelf price tells you almost nothing.**

---

## Running it

```bash
npm install
cp .env.example .env     # then put your Anthropic API key in it
npm start                # http://localhost:3000
```

Without an API key it still runs, on bundled sample data, and says so in the
header. That is enough to see how it works; it is not enough to buy wine with.

There is a CLI too:

```bash
npm run cli -- search "Guado al Tasso" --quantity 6
npm run cli -- search "Barolo Monprivato" --intent cellar --max 250
npm run cli -- discover --min 40 --max 90 --focus "Nebbiolo"
npm run cli -- vintages piedmont
npm run cli -- regions
```

---

## What it does

### Find a wine

Type a name — misspelled is fine, "Guido Al Taso" finds Guado al Tasso — and it
runs a spread of searches across merchants in the producing country, in Europe,
in the US and at the LCBO. For each listing it captures the merchant's location,
the vintage, the bottle size, the price in the merchant's own currency, stock,
and anything the page says about shipping to Canada.

Then it prices every one of them into Toronto and sorts by value.

### Landed cost, line by line

This is the part that changes decisions. A €75 bottle in Italy is not a $114
bottle in Toronto — it is closer to $221, and the app shows you exactly where
the difference goes:

| | |
|---|---:|
| Wine (6 × $114.00) | $684.00 |
| Shipping to Toronto | $110.00 |
| Customs duty — zero under CETA | $0.00 |
| Federal excise duty — $0.745/L × 4.50 L | $3.35 |
| LCBO private import markup — 39.6% of duty-paid value | $315.75 |
| Levies and deposit | $2.94 |
| Private order and brokerage fees | $60.00 |
| HST (13%) | $152.89 |
| **Total for 6 bottles** | **$1,328.93** |

Freight is charged per *shipment*, so the per-bottle answer depends entirely on
how many you buy. Every result shows the curve — 1, 3, 6 and 12 bottles — because
on a Spanish order the difference between buying one and buying a dozen is over
$20 a bottle.

### Vintage advice

For each of 29 French, Italian and Spanish appellations the app carries a
vintage chart, and derives a drinking window from how that appellation ages,
stretched by how good the year was. It splits the years into:

- **Ready now** — great years you can open this evening
- **Worth cellaring** — great years that still need time
- **Overlooked** — *this is where the value is.* A strong vintage standing next
  to a hyped one gets marked down for no reason but fashion. Barolo 2015 scores
  93 and sits beside a 99-point 2016; it trades accordingly.
- **Approach with care** — years where only the best producers made good wine

### Discover

No wine in mind? It goes hunting on its own through French, Italian and Spanish
merchants for bottles trading below what their quality deserves, and explains
the specific mechanism for each one rather than calling everything "great value".

---

## How the deal score works

A score out of 100 with a letter grade, and it is a judgement about *the deal*,
not about the wine. A first-growth at its going rate scores badly; it is a fine
bottle at a fair price, which is not a discovery.

| Component | Weight | What it measures |
|---|---:|---|
| Price advantage | 38% | How far the landed cost sits below the benchmark |
| Vintage quality | 24% | The consensus score for that year in that region |
| Critic signal | 14% | The published score, where one exists |
| Readiness | 12% | Whether it suits when *you* said you'd drink it |
| Quality per dollar | 12% | Quality against the appellation's own price band |

Then penalties for out-of-stock, for merchants that won't ship to Canada, and
warnings whenever an input is soft.

Two details worth knowing:

**The benchmark is chosen, not assumed.** With three or more comparable listings
it uses their median landed price. Below that it falls back to the researched
market price grossed up for import, and failing that to the appellation's typical
range. Whichever it used is stated in the result.

**Quality per dollar is judged within the appellation.** A $35 Bierzo and a $350
Barolo can both be excellent value. Scoring them on the same absolute scale would
mean the app only ever recommended cheap wine.

Every score comes with its component breakdown and plain-English reasons, so you
can disagree with it specifically rather than in general.

---

## Accuracy, and where it will be wrong

Read this before spending real money.

- **The LCBO markup is the softest number in the calculation.** It is the largest
  single charge after the wine itself, the schedule is revised periodically, and
  everything downstream of it moves when it does. Confirm with LCBO Private
  Ordering before a large order.
- **Federal excise is indexed every 1 April.** The pinned rate goes stale once a
  year, on a known date.
- **Ontario requires alcohol imported for personal use to be consigned through
  the LCBO.** The app assumes the private-ordering route and prices it that way.
  A courier direct to your door is a different, and legally different, thing.
- **Interprovincial shipping is legally grey.** Orders from BC or Quebec
  retailers usually arrive. Some are refused at the point of sale.
- **Prices and stock go stale fast.** They are read off merchant pages at the
  moment of searching.
- **Vintage scores are editorial consensus, and producer matters more.** A fine
  grower in an 88-point year beats a lazy one in a 97-point year, every time.

Results are flagged with a confidence band — ±8% on a vendor's own shipping
quote, ±22% on an estimated import — and any result built on a stale exchange
rate says so.

---

## Editing the data

Everything judgemental lives in three files, and they are meant to be edited.

| File | What's in it |
|---|---|
| `src/data/vintage-chart.ts` | Vintage scores by region and year. Change a number and every rating moves with it. |
| `src/data/regions.ts` | How each appellation ages, and its typical price band. |
| `src/domain/landed-cost.ts` | The whole rate card — excise, duty, LCBO markup, HST, freight by zone. Each rate carries a provenance note. |

Run `npm test` after editing. The tests check that every charted region exists,
that scores are in range, that there are no gaps in a region's run of years, and
that the price bands and ageing curves are internally consistent — so a typo
fails rather than quietly skewing every rating.

---

## API

The server is also a plain JSON API.

| Endpoint | Purpose |
|---|---|
| `POST /api/search` | `{ query, quantity, intent, vintage, maxPriceCad, includeOutOfStock }` |
| `POST /api/discover` | `{ countries, minPriceCad, maxPriceCad, style, count, focus }` |
| `POST /api/landed-cost` | `{ price, currency, zone, quantity, bottleMl }` — the calculator on its own |
| `GET /api/vintages/:regionKey` | Full chart and advice for one region |
| `GET /api/regions` | Region list with price bands |
| `GET /api/rates` | The live rate card, FX table and provenance notes |
| `GET /api/health` | Whether it is running live or on sample data |

Searches are cached for 30 minutes and discoveries for an hour, so repeating a
query does not repeat the bill. Pass `refresh: true` to force a fresh search.

---

## How it's built

TypeScript throughout, Express for the server, no front-end framework.

Research runs in two passes. The first turns Claude loose on the web with the
search tool, localised to Toronto, and lets it write up what it found in prose.
The second reads that write-up back and extracts it into a strict schema. Keeping
them separate means the schema stays strict, a long search turn can be resumed
cleanly, and a malformed extraction can be retried without paying for the search
again.

Everything after that — currency conversion, landed cost, vintage assessment,
value scoring — is ordinary deterministic code with tests. The model finds
prices; it does not decide what they mean.

```
src/
  data/        vintage chart, region profiles, demo fixtures
  domain/      fx · landed-cost · vintage · value · types
  claude/      client · prompts · schemas · two-pass research
  search.ts    orchestrates a named-wine search
  discover.ts  orchestrates an open-ended hunt
  server.ts    HTTP API and static hosting
  cli.ts       terminal interface
public/        the web interface
test/          67 tests over the data and the maths
```

Configuration lives in `.env` — see `.env.example`. `CELLAR_SCOUT_MODEL` picks
the model, `CELLAR_SCOUT_DEMO=1` forces sample data, and
`CELLAR_SCOUT_FX_EUR_CAD` and friends pin an exchange rate by hand.
