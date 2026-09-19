/**
 * Region reference data: how each appellation ages, and what its bottles
 * typically cost. Used to turn a raw vendor price into a value judgement.
 */

export type Country = "France" | "Italy" | "Spain" | "Other";

export interface RegionProfile {
  /** Stable key used by the vintage chart and by wine records. */
  key: string;
  label: string;
  country: Country;
  /** Broader grouping shown in the UI filters. */
  area: string;
  /** Dominant colour/style, used for sanity checks and discovery filters. */
  style: "red" | "white" | "sparkling" | "sweet" | "rose";
  /**
   * Ageing curve for a reference vintage scoring 90, in years after the
   * harvest: [starts drinking, enters peak, past it].
   * Scaled by vintage score in `drinkingWindow()`.
   */
  hold: [early: number, peak: number, end: number];
  /**
   * Typical retail band in CAD for a 750ml bottle at this appellation,
   * [entry, mid, benchmark]. Anchors the price-vs-peers signal so a $40
   * Chianti and a $400 Barolo are judged on their own terms.
   */
  priceBandCad: [entry: number, mid: number, benchmark: number];
  aka?: string[];
}

export const REGIONS: RegionProfile[] = [
  // ---------------------------------------------------------------- France
  {
    key: "bordeaux-left",
    label: "Bordeaux — Left Bank",
    country: "France",
    area: "Bordeaux",
    style: "red",
    hold: [5, 10, 30],
    priceBandCad: [35, 90, 400],
    aka: ["medoc", "margaux", "pauillac", "saint-julien", "st-estephe", "pessac-leognan", "haut-medoc", "graves"],
  },
  {
    key: "bordeaux-right",
    label: "Bordeaux — Right Bank",
    country: "France",
    area: "Bordeaux",
    style: "red",
    hold: [4, 8, 25],
    priceBandCad: [35, 90, 450],
    aka: ["pomerol", "saint-emilion", "st-emilion", "fronsac", "castillon", "lalande-de-pomerol"],
  },
  {
    key: "sauternes",
    label: "Sauternes & Barsac",
    country: "France",
    area: "Bordeaux",
    style: "sweet",
    hold: [3, 10, 40],
    priceBandCad: [40, 90, 350],
    aka: ["barsac", "sauternes-barsac"],
  },
  {
    key: "burgundy-red",
    label: "Burgundy — Red",
    country: "France",
    area: "Burgundy",
    style: "red",
    hold: [4, 8, 22],
    priceBandCad: [45, 130, 600],
    aka: ["cote-de-nuits", "cote-de-beaune-rouge", "gevrey-chambertin", "vosne-romanee", "nuits-saint-georges", "pommard", "volnay", "morey-saint-denis", "chambolle-musigny"],
  },
  {
    key: "burgundy-white",
    label: "Burgundy — White",
    country: "France",
    area: "Burgundy",
    style: "white",
    hold: [3, 6, 15],
    priceBandCad: [40, 110, 500],
    aka: ["chablis", "meursault", "puligny-montrachet", "chassagne-montrachet", "saint-aubin", "macon", "pouilly-fuisse"],
  },
  {
    key: "beaujolais",
    label: "Beaujolais Crus",
    country: "France",
    area: "Burgundy",
    style: "red",
    hold: [1, 3, 10],
    priceBandCad: [22, 38, 90],
    aka: ["morgon", "fleurie", "moulin-a-vent", "brouilly", "julienas", "cote-de-brouilly", "saint-amour", "chenas", "chiroubles", "regnie"],
  },
  {
    key: "rhone-north",
    label: "Northern Rhône",
    country: "France",
    area: "Rhône",
    style: "red",
    hold: [4, 9, 25],
    priceBandCad: [40, 110, 500],
    aka: ["hermitage", "cote-rotie", "cornas", "crozes-hermitage", "saint-joseph", "condrieu"],
  },
  {
    key: "rhone-south",
    label: "Southern Rhône",
    country: "France",
    area: "Rhône",
    style: "red",
    hold: [3, 7, 20],
    priceBandCad: [25, 65, 250],
    aka: ["chateauneuf-du-pape", "gigondas", "vacqueyras", "rasteau", "cotes-du-rhone", "lirac", "vinsobres", "cairanne"],
  },
  {
    key: "champagne",
    label: "Champagne (vintage)",
    country: "France",
    area: "Champagne",
    style: "sparkling",
    hold: [5, 10, 25],
    priceBandCad: [70, 130, 500],
    aka: ["champagne-millesime", "blanc-de-blancs", "blanc-de-noirs"],
  },
  {
    key: "loire-red",
    label: "Loire — Red",
    country: "France",
    area: "Loire",
    style: "red",
    hold: [2, 5, 15],
    priceBandCad: [22, 42, 120],
    aka: ["chinon", "bourgueil", "saumur-champigny", "saint-nicolas-de-bourgueil", "anjou-rouge"],
  },
  {
    key: "loire-white",
    label: "Loire — White",
    country: "France",
    area: "Loire",
    style: "white",
    hold: [2, 5, 18],
    priceBandCad: [22, 45, 150],
    aka: ["sancerre", "pouilly-fume", "vouvray", "savennieres", "muscadet", "montlouis", "quincy", "menetou-salon"],
  },
  {
    key: "alsace",
    label: "Alsace",
    country: "France",
    area: "Alsace",
    style: "white",
    hold: [2, 5, 18],
    priceBandCad: [25, 50, 180],
    aka: ["riesling-alsace", "grand-cru-alsace", "gewurztraminer", "pinot-gris-alsace"],
  },
  {
    key: "bandol",
    label: "Bandol & Provence",
    country: "France",
    area: "Provence",
    style: "red",
    hold: [4, 8, 22],
    priceBandCad: [30, 60, 160],
    aka: ["provence", "bandol-rouge", "palette", "cassis"],
  },
  {
    key: "languedoc",
    label: "Languedoc-Roussillon",
    country: "France",
    area: "Languedoc",
    style: "red",
    hold: [2, 5, 14],
    priceBandCad: [18, 38, 120],
    aka: ["corbieres", "faugeres", "minervois", "pic-saint-loup", "collioure", "maury", "fitou", "saint-chinian"],
  },

  // ----------------------------------------------------------------- Italy
  {
    key: "piedmont",
    label: "Piedmont — Barolo & Barbaresco",
    country: "Italy",
    area: "Piedmont",
    style: "red",
    hold: [4, 10, 30],
    priceBandCad: [45, 110, 500],
    aka: ["barolo", "barbaresco", "nebbiolo-langhe", "roero", "langhe"],
  },
  {
    key: "piedmont-barbera",
    label: "Piedmont — Barbera & Dolcetto",
    country: "Italy",
    area: "Piedmont",
    style: "red",
    hold: [1, 4, 12],
    priceBandCad: [20, 38, 90],
    aka: ["barbera-d-asti", "barbera-d-alba", "dolcetto", "gattinara", "ghemme"],
  },
  {
    key: "chianti",
    label: "Chianti Classico",
    country: "Italy",
    area: "Tuscany",
    style: "red",
    hold: [3, 6, 18],
    priceBandCad: [25, 50, 150],
    aka: ["chianti", "chianti-classico-riserva", "gran-selezione", "rufina"],
  },
  {
    key: "brunello",
    label: "Brunello di Montalcino",
    country: "Italy",
    area: "Tuscany",
    style: "red",
    hold: [5, 10, 28],
    priceBandCad: [55, 110, 400],
    aka: ["montalcino", "rosso-di-montalcino", "vino-nobile", "montepulciano-tuscany"],
  },
  {
    key: "bolgheri",
    label: "Bolgheri & Super Tuscans",
    country: "Italy",
    area: "Tuscany",
    style: "red",
    hold: [4, 9, 25],
    priceBandCad: [45, 110, 500],
    aka: ["maremma", "super-tuscan", "toscana-igt", "sassicaia", "ornellaia", "guado-al-tasso"],
  },
  {
    key: "amarone",
    label: "Valpolicella & Amarone",
    country: "Italy",
    area: "Veneto",
    style: "red",
    hold: [4, 9, 25],
    priceBandCad: [35, 75, 260],
    aka: ["valpolicella", "ripasso", "recioto", "veneto"],
  },
  {
    key: "etna",
    label: "Etna & Sicily",
    country: "Italy",
    area: "Sicily",
    style: "red",
    hold: [3, 6, 18],
    priceBandCad: [28, 55, 160],
    aka: ["sicilia", "nerello-mascalese", "cerasuolo-di-vittoria", "frappato", "nero-d-avola"],
  },
  {
    key: "campania",
    label: "Campania — Taurasi & Fiano",
    country: "Italy",
    area: "Campania",
    style: "red",
    hold: [4, 8, 22],
    priceBandCad: [28, 55, 150],
    aka: ["taurasi", "aglianico", "fiano-di-avellino", "greco-di-tufo", "irpinia", "vulture"],
  },
  {
    key: "northeast-white",
    label: "Friuli & Alto Adige — White",
    country: "Italy",
    area: "Northeast Italy",
    style: "white",
    hold: [1, 3, 10],
    priceBandCad: [25, 45, 130],
    aka: ["friuli", "collio", "alto-adige", "trentino", "soave", "ribolla-gialla"],
  },

  // ----------------------------------------------------------------- Spain
  {
    key: "rioja",
    label: "Rioja",
    country: "Spain",
    area: "Rioja",
    style: "red",
    hold: [4, 9, 25],
    priceBandCad: [22, 55, 300],
    aka: ["rioja-alta", "rioja-alavesa", "rioja-gran-reserva", "rioja-reserva"],
  },
  {
    key: "ribera",
    label: "Ribera del Duero",
    country: "Spain",
    area: "Castilla y León",
    style: "red",
    hold: [4, 9, 25],
    priceBandCad: [28, 65, 400],
    aka: ["ribera", "tempranillo-ribera", "tinto-fino"],
  },
  {
    key: "priorat",
    label: "Priorat & Montsant",
    country: "Spain",
    area: "Catalonia",
    style: "red",
    hold: [4, 8, 22],
    priceBandCad: [32, 70, 350],
    aka: ["montsant", "carinena-priorat", "llicorella"],
  },
  {
    key: "toro",
    label: "Toro",
    country: "Spain",
    area: "Castilla y León",
    style: "red",
    hold: [3, 7, 20],
    priceBandCad: [22, 48, 200],
    aka: ["tinta-de-toro"],
  },
  {
    key: "bierzo",
    label: "Bierzo",
    country: "Spain",
    area: "Castilla y León",
    style: "red",
    hold: [3, 6, 18],
    priceBandCad: [24, 48, 180],
    aka: ["mencia", "ribeira-sacra", "valdeorras-red"],
  },
  {
    key: "rias-baixas",
    label: "Rías Baixas & Galicia — White",
    country: "Spain",
    area: "Galicia",
    style: "white",
    hold: [0, 2, 6],
    priceBandCad: [20, 35, 90],
    aka: ["albarino", "godello", "valdeorras", "ribeiro"],
  },
];

export const REGION_BY_KEY = new Map(REGIONS.map((r) => [r.key, r]));

/** Normalise free text (an appellation, a grape, a label fragment) to a region key. */
export function resolveRegionKey(text: string | null | undefined): string | null {
  if (!text) return null;
  const needle = slug(text);
  if (REGION_BY_KEY.has(needle)) return needle;

  // Longest alias first so "chianti-classico-riserva" beats "chianti".
  const candidates: Array<{ key: string; token: string }> = [];
  for (const r of REGIONS) {
    candidates.push({ key: r.key, token: r.key });
    for (const a of r.aka ?? []) candidates.push({ key: r.key, token: slug(a) });
  }
  candidates.sort((a, b) => b.token.length - a.token.length);
  for (const c of candidates) {
    if (needle.includes(c.token)) return c.key;
  }
  return null;
}

export function slug(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
