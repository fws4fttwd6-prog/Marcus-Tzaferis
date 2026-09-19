/**
 * Vintage quality by region and year, 0-100.
 *
 * These are editorial consensus scores distilled from the major published
 * vintage charts (Wine Spectator, Decanter, Vinous, Jancis Robinson, and the
 * consorzio charts for the Italian DOCGs). They are a starting point, not
 * gospel: producer matters more than vintage in every one of these regions,
 * and a great grower in an 88-point year beats a lazy one in a 97-point year.
 *
 * Scale, roughly:
 *   96-100  legendary — buy on sight, will outlive you
 *   93-95   excellent — classic, ages long
 *   90-92   very good — reliable, often the value sweet spot
 *   86-89   good      — drink earlier, buy on discount
 *   80-85   modest    — producer-dependent, drink now
 *   <80     difficult — only the very best estates made good wine
 *
 * Maintained by hand: edit a number here and every rating in the app moves
 * with it. Run `npm test` after editing to catch typos and gaps.
 */

export type YearScores = Record<number, number>;

export const VINTAGE_CHART: Record<string, YearScores> = {
  "bordeaux-left": {
    1995: 90, 1996: 93, 1997: 84, 1998: 88, 1999: 87, 2000: 96, 2001: 89,
    2002: 88, 2003: 90, 2004: 89, 2005: 98, 2006: 90, 2007: 85, 2008: 91,
    2009: 98, 2010: 98, 2011: 88, 2012: 89, 2013: 81, 2014: 91, 2015: 94,
    2016: 97, 2017: 89, 2018: 95, 2019: 95, 2020: 94, 2021: 88, 2022: 97,
    2023: 93, 2024: 88,
  },
  "bordeaux-right": {
    1995: 91, 1996: 88, 1997: 85, 1998: 95, 1999: 88, 2000: 96, 2001: 91,
    2002: 86, 2003: 88, 2004: 88, 2005: 97, 2006: 89, 2007: 86, 2008: 91,
    2009: 97, 2010: 96, 2011: 87, 2012: 91, 2013: 80, 2014: 90, 2015: 96,
    2016: 96, 2017: 88, 2018: 95, 2019: 95, 2020: 95, 2021: 87, 2022: 96,
    2023: 92, 2024: 87,
  },
  sauternes: {
    1995: 90, 1996: 91, 1997: 95, 1998: 88, 1999: 88, 2000: 84, 2001: 99,
    2002: 91, 2003: 95, 2004: 88, 2005: 95, 2006: 91, 2007: 96, 2008: 91,
    2009: 96, 2010: 97, 2011: 96, 2012: 86, 2013: 88, 2014: 92, 2015: 93,
    2016: 92, 2017: 93, 2018: 92, 2019: 94, 2020: 92, 2021: 90, 2022: 94,
    2023: 92, 2024: 88,
  },
  "burgundy-red": {
    1995: 90, 1996: 92, 1997: 87, 1998: 86, 1999: 95, 2000: 85, 2001: 87,
    2002: 93, 2003: 87, 2004: 84, 2005: 98, 2006: 89, 2007: 87, 2008: 90,
    2009: 94, 2010: 95, 2011: 88, 2012: 92, 2013: 89, 2014: 91, 2015: 96,
    2016: 93, 2017: 91, 2018: 93, 2019: 96, 2020: 95, 2021: 89, 2022: 95,
    2023: 91, 2024: 87,
  },
  "burgundy-white": {
    1995: 91, 1996: 93, 1997: 88, 1998: 86, 1999: 90, 2000: 89, 2001: 87,
    2002: 94, 2003: 84, 2004: 89, 2005: 92, 2006: 90, 2007: 92, 2008: 92,
    2009: 91, 2010: 95, 2011: 88, 2012: 93, 2013: 91, 2014: 96, 2015: 92,
    2016: 92, 2017: 94, 2018: 91, 2019: 94, 2020: 94, 2021: 92, 2022: 94,
    2023: 91, 2024: 89,
  },
  beaujolais: {
    2000: 87, 2001: 85, 2002: 88, 2003: 88, 2004: 85, 2005: 94, 2006: 87,
    2007: 88, 2008: 87, 2009: 95, 2010: 93, 2011: 90, 2012: 88, 2013: 87,
    2014: 91, 2015: 95, 2016: 89, 2017: 91, 2018: 92, 2019: 94, 2020: 92,
    2021: 85, 2022: 93, 2023: 90, 2024: 86,
  },
  "rhone-north": {
    1995: 89, 1996: 87, 1997: 89, 1998: 92, 1999: 96, 2000: 88, 2001: 89,
    2002: 78, 2003: 93, 2004: 88, 2005: 95, 2006: 91, 2007: 89, 2008: 84,
    2009: 95, 2010: 97, 2011: 89, 2012: 92, 2013: 89, 2014: 88, 2015: 97,
    2016: 94, 2017: 93, 2018: 93, 2019: 96, 2020: 93, 2021: 89, 2022: 94,
    2023: 92, 2024: 88,
  },
  "rhone-south": {
    1995: 90, 1996: 83, 1997: 84, 1998: 95, 1999: 88, 2000: 93, 2001: 95,
    2002: 70, 2003: 89, 2004: 89, 2005: 94, 2006: 91, 2007: 97, 2008: 83,
    2009: 93, 2010: 98, 2011: 88, 2012: 92, 2013: 87, 2014: 88, 2015: 95,
    2016: 98, 2017: 94, 2018: 92, 2019: 95, 2020: 93, 2021: 90, 2022: 93,
    2023: 91, 2024: 87,
  },
  champagne: {
    1995: 92, 1996: 96, 1997: 89, 1998: 91, 1999: 88, 2000: 90, 2001: 82,
    2002: 96, 2003: 87, 2004: 93, 2005: 88, 2006: 92, 2007: 90, 2008: 97,
    2009: 90, 2010: 86, 2011: 85, 2012: 96, 2013: 93, 2014: 91, 2015: 92,
    2016: 91, 2017: 87, 2018: 93, 2019: 94, 2020: 93, 2021: 83, 2022: 95,
    2023: 90, 2024: 86,
  },
  "loire-red": {
    1995: 88, 1996: 89, 1997: 90, 1998: 85, 1999: 85, 2000: 87, 2001: 85,
    2002: 90, 2003: 89, 2004: 84, 2005: 95, 2006: 87, 2007: 84, 2008: 87,
    2009: 93, 2010: 92, 2011: 88, 2012: 88, 2013: 84, 2014: 92, 2015: 95,
    2016: 90, 2017: 91, 2018: 93, 2019: 93, 2020: 92, 2021: 85, 2022: 93,
    2023: 90, 2024: 86,
  },
  "loire-white": {
    1995: 90, 1996: 93, 1997: 92, 1998: 86, 1999: 85, 2000: 87, 2001: 88,
    2002: 92, 2003: 88, 2004: 87, 2005: 95, 2006: 88, 2007: 89, 2008: 90,
    2009: 93, 2010: 93, 2011: 88, 2012: 89, 2013: 87, 2014: 93, 2015: 93,
    2016: 89, 2017: 92, 2018: 93, 2019: 93, 2020: 92, 2021: 88, 2022: 93,
    2023: 91, 2024: 88,
  },
  alsace: {
    1995: 89, 1996: 90, 1997: 91, 1998: 88, 1999: 86, 2000: 90, 2001: 92,
    2002: 90, 2003: 86, 2004: 88, 2005: 92, 2006: 86, 2007: 93, 2008: 93,
    2009: 91, 2010: 93, 2011: 90, 2012: 91, 2013: 89, 2014: 89, 2015: 94,
    2016: 92, 2017: 93, 2018: 92, 2019: 93, 2020: 92, 2021: 88, 2022: 92,
    2023: 90, 2024: 87,
  },
  bandol: {
    2000: 90, 2001: 91, 2002: 84, 2003: 88, 2004: 89, 2005: 92, 2006: 90,
    2007: 92, 2008: 87, 2009: 92, 2010: 93, 2011: 89, 2012: 90, 2013: 88,
    2014: 89, 2015: 93, 2016: 93, 2017: 92, 2018: 92, 2019: 94, 2020: 92,
    2021: 88, 2022: 92, 2023: 90, 2024: 87,
  },
  languedoc: {
    2000: 89, 2001: 90, 2002: 80, 2003: 87, 2004: 88, 2005: 92, 2006: 90,
    2007: 91, 2008: 87, 2009: 92, 2010: 92, 2011: 89, 2012: 90, 2013: 88,
    2014: 89, 2015: 93, 2016: 93, 2017: 92, 2018: 91, 2019: 93, 2020: 92,
    2021: 88, 2022: 92, 2023: 90, 2024: 87,
  },

  piedmont: {
    1995: 88, 1996: 96, 1997: 94, 1998: 92, 1999: 95, 2000: 92, 2001: 96,
    2002: 70, 2003: 87, 2004: 95, 2005: 89, 2006: 95, 2007: 91, 2008: 93,
    2009: 89, 2010: 97, 2011: 90, 2012: 91, 2013: 95, 2014: 86, 2015: 93,
    2016: 99, 2017: 88, 2018: 90, 2019: 95, 2020: 93, 2021: 95, 2022: 92,
    2023: 91, 2024: 89,
  },
  "piedmont-barbera": {
    2000: 90, 2001: 92, 2002: 74, 2003: 86, 2004: 92, 2005: 88, 2006: 93,
    2007: 91, 2008: 91, 2009: 89, 2010: 93, 2011: 90, 2012: 90, 2013: 92,
    2014: 85, 2015: 93, 2016: 95, 2017: 88, 2018: 90, 2019: 93, 2020: 92,
    2021: 93, 2022: 91, 2023: 90, 2024: 88,
  },
  chianti: {
    1995: 90, 1996: 86, 1997: 94, 1998: 88, 1999: 92, 2000: 88, 2001: 92,
    2002: 76, 2003: 87, 2004: 92, 2005: 86, 2006: 94, 2007: 92, 2008: 89,
    2009: 88, 2010: 93, 2011: 89, 2012: 90, 2013: 90, 2014: 82, 2015: 95,
    2016: 97, 2017: 88, 2018: 89, 2019: 95, 2020: 92, 2021: 93, 2022: 90,
    2023: 89, 2024: 88,
  },
  brunello: {
    1995: 91, 1996: 84, 1997: 95, 1998: 88, 1999: 93, 2000: 86, 2001: 93,
    2002: 70, 2003: 86, 2004: 94, 2005: 85, 2006: 96, 2007: 92, 2008: 89,
    2009: 88, 2010: 97, 2011: 90, 2012: 92, 2013: 93, 2014: 80, 2015: 96,
    2016: 97, 2017: 88, 2018: 89, 2019: 96, 2020: 93, 2021: 94, 2022: 90,
    2023: 89, 2024: 88,
  },
  bolgheri: {
    1995: 92, 1996: 88, 1997: 95, 1998: 93, 1999: 93, 2000: 90, 2001: 94,
    2002: 78, 2003: 89, 2004: 95, 2005: 88, 2006: 96, 2007: 93, 2008: 92,
    2009: 91, 2010: 95, 2011: 91, 2012: 92, 2013: 93, 2014: 84, 2015: 97,
    2016: 97, 2017: 89, 2018: 91, 2019: 96, 2020: 93, 2021: 95, 2022: 91,
    2023: 90, 2024: 89,
  },
  amarone: {
    1995: 90, 1996: 86, 1997: 95, 1998: 90, 1999: 90, 2000: 89, 2001: 91,
    2002: 78, 2003: 88, 2004: 92, 2005: 85, 2006: 93, 2007: 91, 2008: 89,
    2009: 88, 2010: 91, 2011: 93, 2012: 91, 2013: 90, 2014: 80, 2015: 95,
    2016: 94, 2017: 89, 2018: 90, 2019: 93, 2020: 92, 2021: 93, 2022: 90,
    2023: 89, 2024: 88,
  },
  etna: {
    2000: 87, 2001: 89, 2002: 84, 2003: 86, 2004: 90, 2005: 89, 2006: 90,
    2007: 91, 2008: 90, 2009: 88, 2010: 93, 2011: 92, 2012: 91, 2013: 92,
    2014: 88, 2015: 92, 2016: 94, 2017: 87, 2018: 91, 2019: 93, 2020: 92,
    2021: 93, 2022: 91, 2023: 90, 2024: 89,
  },
  campania: {
    2000: 89, 2001: 93, 2002: 80, 2003: 87, 2004: 93, 2005: 87, 2006: 92,
    2007: 91, 2008: 92, 2009: 88, 2010: 93, 2011: 91, 2012: 91, 2013: 93,
    2014: 85, 2015: 93, 2016: 94, 2017: 89, 2018: 90, 2019: 94, 2020: 92,
    2021: 93, 2022: 90, 2023: 89, 2024: 88,
  },
  "northeast-white": {
    2000: 88, 2001: 90, 2002: 85, 2003: 85, 2004: 90, 2005: 88, 2006: 91,
    2007: 91, 2008: 90, 2009: 89, 2010: 92, 2011: 90, 2012: 91, 2013: 92,
    2014: 87, 2015: 92, 2016: 93, 2017: 89, 2018: 91, 2019: 93, 2020: 92,
    2021: 93, 2022: 91, 2023: 90, 2024: 89,
  },

  rioja: {
    1995: 94, 1996: 90, 1997: 82, 1998: 88, 1999: 87, 2000: 85, 2001: 96,
    2002: 78, 2003: 86, 2004: 95, 2005: 96, 2006: 88, 2007: 85, 2008: 88,
    2009: 92, 2010: 96, 2011: 93, 2012: 89, 2013: 80, 2014: 91, 2015: 93,
    2016: 93, 2017: 86, 2018: 89, 2019: 94, 2020: 91, 2021: 93, 2022: 90,
    2023: 89, 2024: 87,
  },
  ribera: {
    1995: 93, 1996: 91, 1997: 82, 1998: 90, 1999: 88, 2000: 84, 2001: 95,
    2002: 80, 2003: 86, 2004: 96, 2005: 93, 2006: 88, 2007: 85, 2008: 88,
    2009: 91, 2010: 95, 2011: 94, 2012: 91, 2013: 82, 2014: 92, 2015: 94,
    2016: 93, 2017: 87, 2018: 90, 2019: 95, 2020: 91, 2021: 93, 2022: 90,
    2023: 89, 2024: 87,
  },
  priorat: {
    1995: 90, 1996: 88, 1997: 85, 1998: 92, 1999: 90, 2000: 88, 2001: 93,
    2002: 84, 2003: 87, 2004: 94, 2005: 93, 2006: 90, 2007: 89, 2008: 89,
    2009: 92, 2010: 94, 2011: 93, 2012: 90, 2013: 87, 2014: 90, 2015: 94,
    2016: 95, 2017: 89, 2018: 91, 2019: 94, 2020: 92, 2021: 93, 2022: 90,
    2023: 89, 2024: 87,
  },
  toro: {
    2001: 93, 2002: 82, 2003: 86, 2004: 94, 2005: 93, 2006: 88, 2007: 85,
    2008: 89, 2009: 91, 2010: 94, 2011: 93, 2012: 90, 2013: 82, 2014: 91,
    2015: 93, 2016: 93, 2017: 87, 2018: 90, 2019: 94, 2020: 91, 2021: 92,
    2022: 90, 2023: 89, 2024: 87,
  },
  bierzo: {
    2004: 91, 2005: 92, 2006: 89, 2007: 87, 2008: 89, 2009: 91, 2010: 93,
    2011: 92, 2012: 90, 2013: 86, 2014: 90, 2015: 92, 2016: 92, 2017: 88,
    2018: 91, 2019: 93, 2020: 91, 2021: 92, 2022: 90, 2023: 89, 2024: 88,
  },
  "rias-baixas": {
    2014: 90, 2015: 92, 2016: 91, 2017: 90, 2018: 92, 2019: 93, 2020: 92,
    2021: 93, 2022: 91, 2023: 92, 2024: 90,
  },
};

/** Short prose for the standout years, surfaced in the UI. */
export const VINTAGE_NOTES: Record<string, Record<number, string>> = {
  "bordeaux-left": {
    2005: "Perfectly balanced classic; still climbing after two decades.",
    2010: "Powerful and structured — the longest-lived of the modern greats.",
    2014: "Overlooked between 2010 and 2015; classic proportions at soft money.",
    2016: "Tannin without weight. The reference modern Left Bank vintage.",
    2019: "Excellent quality that got priced below 2018 and 2020 — the value year.",
    2022: "Improbably fresh for a hot year; already legendary.",
  },
  "bordeaux-right": {
    1998: "The Right Bank's coming-of-age vintage; Pomerol especially.",
    2015: "Merlot's year — opulent, generous, drinking beautifully now.",
    2019: "Quality of 2018 without the price. Best current buy on the Right Bank.",
  },
  "burgundy-red": {
    2005: "The benchmark; still a decade from full maturity.",
    2010: "Classicist's vintage — pure, fine-boned, now entering its window.",
    2017: "Charming and underpriced; drink while the greats sleep.",
    2019: "Ripe and concentrated but fresh; a modern great.",
  },
  "burgundy-white": {
    2014: "The reference white Burgundy vintage of the decade — tense, precise.",
    2017: "Generous and open; excellent value against 2014 and 2019.",
  },
  piedmont: {
    1996: "Austere and monumental; only now fully resolved.",
    2001: "The classicist's modern benchmark.",
    2004: "Perfumed and perfectly balanced; drinking gloriously.",
    2010: "Structured, cool, long-lived — the vintage of its decade.",
    2013: "Traditional in shape, undervalued beside 2010 and 2016.",
    2016: "Near-perfect growing season. Generational Barolo.",
    2019: "Excellent and classically proportioned, quietly priced.",
    2021: "Superb, fresh, and still arriving — buy on release.",
  },
  brunello: {
    2010: "Textbook Brunello; buy any producer you trust.",
    2016: "Complete vintage — power and lift together.",
    2019: "Excellent and priced below 2016; current best buy.",
  },
  bolgheri: {
    2015: "Ripe, plush and complete; very approachable now.",
    2016: "The finest recent vintage — structure for 20+ years.",
    2019: "Cool, fresh and classically proportioned; the value pick.",
    2021: "Outstanding and still building a reputation.",
  },
  chianti: {
    2016: "The vintage of the modern era for Sangiovese.",
    2019: "Fresh, structured and cheap relative to 2016.",
    2021: "Excellent; the Gran Selezione wines are serious.",
  },
  "rhone-north": {
    2010: "Monumental Syrah — decades ahead of it.",
    2015: "Dense and dramatic; needs time.",
    2019: "Great concentration with freshness intact.",
  },
  "rhone-south": {
    2010: "The finest Châteauneuf vintage in a generation.",
    2016: "Ripe, seamless and enormous; a modern legend.",
    2019: "Excellent and much cheaper than 2016.",
  },
  rioja: {
    2001: "The classic modern Rioja vintage.",
    2010: "Superb across the board; Gran Reservas now arriving.",
    2019: "Excellent; Rioja remains the best value in fine wine.",
  },
  ribera: {
    2004: "Legendary; still the reference.",
    2019: "Outstanding and fairly priced.",
  },
  champagne: {
    2002: "Rich and complete; the vintage of its decade.",
    2008: "Bracing acidity, extraordinary length — a landmark.",
    2012: "Generous and structured; the modern benchmark.",
  },
  priorat: {
    2016: "The best recent Priorat — fresher than the old blockbusters.",
  },
};

export const CHART_YEARS = (() => {
  let min = Infinity;
  let max = -Infinity;
  for (const years of Object.values(VINTAGE_CHART)) {
    for (const y of Object.keys(years)) {
      const n = Number(y);
      if (n < min) min = n;
      if (n > max) max = n;
    }
  }
  return { min, max };
})();
