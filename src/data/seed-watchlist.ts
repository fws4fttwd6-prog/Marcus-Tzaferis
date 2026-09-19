/**
 * The starting watchlist.
 *
 * `targetLandedCad` is the price *delivered to Toronto* at which each bottle
 * stops being a purchase and starts being a decision already made. They are
 * pitched roughly 12-18% under what the wine normally lands at here, which is
 * about the discount a genuinely good offer represents — deep enough to be
 * worth acting on, shallow enough to fire more than once a decade.
 *
 * They are opinions, not facts. Edit them. Every one is adjustable from the
 * watchlist tab, and a watch with no target still alerts on grade and on a
 * price drop.
 */

import type { DrinkingIntent } from "../domain/types.js";
import type { Grade } from "../domain/watchlist-types.js";

export interface SeedWatch {
  query: string;
  label: string;
  producer: string;
  country: string;
  appellation: string;
  targetLandedCad: number;
  /** Why that number, so it can be argued with rather than just trusted. */
  targetNote: string;
  tags: string[];
  intent?: DrinkingIntent;
  minGrade?: Grade;
  quantity?: number;
  notes?: string;
}

export const SEED_WATCHLIST: SeedWatch[] = [
  // ──────────────────────── Bolgheri and the Super Tuscans ────────────────
  {
    query: "Tenuta Guado al Tasso Bolgheri Superiore",
    label: "Guado al Tasso",
    producer: "Tenuta Guado al Tasso (Antinori)",
    country: "Italy",
    appellation: "Bolgheri Superiore DOC",
    targetLandedCad: 130,
    targetNote: "Usually lands around $150-165. Under $130 is a real discount.",
    tags: ["Bolgheri", "Super Tuscan"],
    notes: "Antinori's Bolgheri flagship. 2019 and 2021 are the vintages to want.",
  },
  {
    query: "Tenuta San Guido Sassicaia Bolgheri",
    label: "Sassicaia",
    producer: "Tenuta San Guido",
    country: "Italy",
    appellation: "Bolgheri Sassicaia DOC",
    targetLandedCad: 325,
    targetNote: "Lands around $370-400 for a recent vintage; under $325 is rare.",
    tags: ["Bolgheri", "Super Tuscan", "benchmark"],
    intent: "cellar",
    notes: "The wine that invented the category, and the only single-estate DOC in Italy.",
  },
  {
    query: "Antinori Solaia Toscana",
    label: "Solaia",
    producer: "Marchesi Antinori",
    country: "Italy",
    appellation: "Toscana IGT",
    targetLandedCad: 340,
    targetNote: "Lands around $390-430. Under $340 usually means an older vintage.",
    tags: ["Super Tuscan", "benchmark"],
    intent: "cellar",
    notes:
      "Cabernet-dominant, from the Tignanello estate in the Chianti Classico hills rather than the coast — so it drinks tighter and younger than Bolgheri.",
  },
  {
    query: "Ornellaia Bolgheri Superiore",
    label: "Ornellaia",
    producer: "Tenuta dell'Ornellaia",
    country: "Italy",
    appellation: "Bolgheri Superiore DOC",
    targetLandedCad: 260,
    targetNote: "Lands around $300-320. Under $260 is worth acting on.",
    tags: ["Bolgheri", "Super Tuscan", "benchmark"],
    intent: "cellar",
  },
  {
    query: "Masseto Toscana Merlot",
    label: "Masseto",
    producer: "Masseto (Ornellaia estate)",
    country: "Italy",
    appellation: "Toscana IGT",
    targetLandedCad: 1100,
    targetNote: "Rarely lands under $1,300. A target this low is a standing long shot.",
    tags: ["Bolgheri", "Super Tuscan", "trophy"],
    intent: "cellar",
    quantity: 1,
    notes: "Pure Merlot off the blue clay above Ornellaia. Buy the vintage, not the label.",
  },
  {
    query: "Antinori Tignanello Toscana",
    label: "Tignanello",
    producer: "Marchesi Antinori",
    country: "Italy",
    appellation: "Toscana IGT",
    targetLandedCad: 125,
    targetNote: "Lands around $145-160. Under $125 is a good buy.",
    tags: ["Super Tuscan"],
    notes: "The original Sangiovese-led Super Tuscan; ages far longer than people expect.",
  },
  {
    query: "Le Macchiole Paleo Rosso Bolgheri",
    label: "Le Macchiole Paleo Rosso",
    producer: "Le Macchiole",
    country: "Italy",
    appellation: "Bolgheri DOC",
    targetLandedCad: 150,
    targetNote: "Lands around $175-190. Under $150 is the moment.",
    tags: ["Bolgheri", "Super Tuscan"],
    intent: "cellar",
    notes: "One of the very few serious 100% Cabernet Franc wines in Italy.",
  },
  {
    query: "Grattamacco Bolgheri Superiore",
    label: "Grattamacco",
    producer: "Grattamacco (ColleMassari)",
    country: "Italy",
    appellation: "Bolgheri Superiore DOC",
    targetLandedCad: 100,
    targetNote: "Lands around $115-130 — the value pick of the serious Bolgheri estates.",
    tags: ["Bolgheri", "Super Tuscan", "value"],
  },
  {
    query: "Tua Rita Redigaffi Toscana",
    label: "Tua Rita Redigaffi",
    producer: "Tua Rita",
    country: "Italy",
    appellation: "Toscana IGT",
    targetLandedCad: 250,
    targetNote: "Lands around $290-320. Under $250 is worth a case.",
    tags: ["Super Tuscan"],
    intent: "cellar",
  },
  {
    query: "Ca' Marcanda Magari Gaja Bolgheri",
    label: "Ca' Marcanda Magari",
    producer: "Ca' Marcanda (Gaja)",
    country: "Italy",
    appellation: "Toscana IGT",
    targetLandedCad: 50,
    targetNote: "Lands around $60-70. Gaja quality at a weeknight price under $50.",
    tags: ["Bolgheri", "value"],
    notes: "The entry into Gaja's Bolgheri estate, and the one that over-delivers.",
  },

  // ─────────────────────────────── Bordeaux ────────────────────────────────
  {
    query: "Chateau Leoville Barton Saint-Julien",
    label: "Léoville Barton",
    producer: "Château Léoville Barton",
    country: "France",
    appellation: "Saint-Julien AOC (2ème Cru Classé)",
    targetLandedCad: 135,
    targetNote: "Lands around $155-175. The classicist's second growth and chronically fair.",
    tags: ["Bordeaux", "Left Bank", "value"],
    intent: "cellar",
    notes: "Traditional, ages for decades, and never priced like the neighbours.",
  },
  {
    query: "Chateau Grand-Puy-Lacoste Pauillac",
    label: "Grand-Puy-Lacoste",
    producer: "Château Grand-Puy-Lacoste",
    country: "France",
    appellation: "Pauillac AOC (5ème Cru Classé)",
    targetLandedCad: 125,
    targetNote: "Lands around $145-165. Under $125 is the buy.",
    tags: ["Bordeaux", "Left Bank", "value"],
    intent: "cellar",
    notes: "The best value in Pauillac for thirty years running.",
  },
  {
    query: "Chateau Sociando-Mallet Haut-Medoc",
    label: "Sociando-Mallet",
    producer: "Château Sociando-Mallet",
    country: "France",
    appellation: "Haut-Médoc AOC",
    targetLandedCad: 60,
    targetNote: "Lands around $70-85. Classed-growth wine without the classification.",
    tags: ["Bordeaux", "Left Bank", "value"],
    intent: "cellar",
    notes: "Unclassified, and routinely outperforms wines at three times the price.",
  },
  {
    query: "Chateau Pontet-Canet Pauillac",
    label: "Pontet-Canet",
    producer: "Château Pontet-Canet",
    country: "France",
    appellation: "Pauillac AOC (5ème Cru Classé)",
    targetLandedCad: 165,
    targetNote: "Lands around $195-220. Under $165 is worth moving on.",
    tags: ["Bordeaux", "Left Bank"],
    intent: "cellar",
    notes: "Biodynamic since 2004 and the most distinctive wine in Pauillac.",
  },
  {
    query: "Chateau Lynch-Bages Pauillac",
    label: "Lynch-Bages",
    producer: "Château Lynch-Bages",
    country: "France",
    appellation: "Pauillac AOC (5ème Cru Classé)",
    targetLandedCad: 210,
    targetNote: "Lands around $245-270.",
    tags: ["Bordeaux", "Left Bank"],
    intent: "cellar",
  },
  {
    query: "Chateau Montrose Saint-Estephe",
    label: "Montrose",
    producer: "Château Montrose",
    country: "France",
    appellation: "Saint-Estèphe AOC (2ème Cru Classé)",
    targetLandedCad: 230,
    targetNote: "Lands around $270-300. A wine that repays twenty years of patience.",
    tags: ["Bordeaux", "Left Bank"],
    intent: "cellar",
  },
  {
    query: "Chateau Palmer Margaux",
    label: "Palmer",
    producer: "Château Palmer",
    country: "France",
    appellation: "Margaux AOC (3ème Cru Classé)",
    targetLandedCad: 420,
    targetNote: "Lands around $490-540. Under $420 is unusual.",
    tags: ["Bordeaux", "Left Bank", "benchmark"],
    intent: "cellar",
    quantity: 3,
  },
  {
    query: "Chateau Canon Saint-Emilion",
    label: "Canon",
    producer: "Château Canon",
    country: "France",
    appellation: "Saint-Émilion Grand Cru AOC (1er Grand Cru Classé B)",
    targetLandedCad: 210,
    targetNote: "Lands around $240-270. Transformed since 2011 and still catching up on price.",
    tags: ["Bordeaux", "Right Bank"],
    intent: "cellar",
  },
  {
    query: "Chateau La Conseillante Pomerol",
    label: "La Conseillante",
    producer: "Château La Conseillante",
    country: "France",
    appellation: "Pomerol AOC",
    targetLandedCad: 320,
    targetNote: "Lands around $370-410. The most perfumed wine in Pomerol.",
    tags: ["Bordeaux", "Right Bank"],
    intent: "cellar",
    quantity: 3,
  },

  // ───────────────────────────────── Spain ────────────────────────────────
  {
    query: "Vega Sicilia Unico Ribera del Duero",
    label: "Vega Sicilia Único",
    producer: "Bodegas Vega Sicilia",
    country: "Spain",
    appellation: "Ribera del Duero DO",
    targetLandedCad: 600,
    targetNote: "Lands around $680-760. Released at ten years old, so every bottle is ready.",
    tags: ["Spain", "Ribera", "benchmark"],
    intent: "either",
    quantity: 3,
    notes:
      "Held a decade at the bodega before release, so the vintage chart matters less here than anywhere else on this list.",
  },
  {
    query: "Vega Sicilia Valbuena 5 Ribera del Duero",
    label: "Vega Sicilia Valbuena 5º",
    producer: "Bodegas Vega Sicilia",
    country: "Spain",
    appellation: "Ribera del Duero DO",
    targetLandedCad: 210,
    targetNote: "Lands around $245-275 — the affordable way into the house.",
    tags: ["Spain", "Ribera"],
    intent: "cellar",
  },
  {
    query: "Alion Ribera del Duero Vega Sicilia",
    label: "Alión",
    producer: "Bodegas y Viñedos Alión (Vega Sicilia)",
    country: "Spain",
    appellation: "Ribera del Duero DO",
    targetLandedCad: 100,
    targetNote: "Lands around $115-135. The modern-styled Vega Sicilia estate.",
    tags: ["Spain", "Ribera", "value"],
  },
];
