/* Cellar Scout — front end. No framework; the shapes coming back from the API
   are simple enough that plain DOM building stays the clearest thing to read. */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const cad = (n) =>
  n === null || n === undefined || !Number.isFinite(n)
    ? "—"
    : new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(n);

const money = (n, currency) =>
  n === null || n === undefined || !Number.isFinite(n)
    ? "—"
    : new Intl.NumberFormat("en-CA", {
        style: "currency",
        currency: currency || "CAD",
        currencyDisplay: "narrowSymbol",
      }).format(n);

const el = (tag, props = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") node.className = v;
    else if (k === "html") node.innerHTML = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2).toLowerCase(), v);
    else node.setAttribute(k, v === true ? "" : String(v));
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
};

async function api(path, body) {
  const res = await fetch(path, {
    method: body ? "POST" : "GET",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({ error: "The server sent something unreadable." }));
  if (!res.ok) throw new Error(data.detail ? `${data.error} (${data.detail})` : data.error || res.statusText);
  return data;
}

/* ── Chrome ─────────────────────────────────────────────────────────────── */

function initTheme() {
  try {
    const saved = localStorage.getItem("cellar-scout-theme");
    if (saved) document.documentElement.dataset.theme = saved;
  } catch { /* private mode; the media query default is fine */ }

  $("#theme-toggle").addEventListener("click", () => {
    const now = document.documentElement.dataset.theme;
    const dark = now ? now === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    const next = dark ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("cellar-scout-theme", next); } catch { /* ignore */ }
  });
}

function initTabs() {
  $$(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      $$(".tab").forEach((t) => {
        t.classList.toggle("is-active", t === tab);
        t.setAttribute("aria-selected", String(t === tab));
      });
      $$(".panel").forEach((p) => p.classList.toggle("is-active", p.id === `panel-${tab.dataset.tab}`));
      if (tab.dataset.tab === "vintages") loadVintages();
      if (tab.dataset.tab === "costs") loadRateCard();
    });
  });
}

function setStatus(node, state, message) {
  if (!state) { node.hidden = true; node.className = "status"; node.innerHTML = ""; return; }
  node.hidden = false;
  node.className = `status ${state}`;
  node.innerHTML = "";
  if (state === "working") node.append(el("div", { class: "spinner" }));
  node.append(el("span", {}, message));
}

/* ── Shared renderers ───────────────────────────────────────────────────── */

function renderWarnings(meta) {
  if (!meta?.warnings?.length) return null;
  return el("div", {}, meta.warnings.map((w) => el("div", { class: "notice notice-warn" }, w)));
}

function renderSources(sources) {
  if (!sources?.length) return null;
  return el(
    "details",
    { class: "sources" },
    el("summary", {}, `Sources consulted (${sources.length})`),
    el(
      "ol",
      {},
      sources.map((s) =>
        el("li", {}, el("a", { href: s.url, target: "_blank", rel: "noopener noreferrer" }, s.title || s.url)),
      ),
    ),
  );
}

function gradeBlock(deal) {
  return el(
    "div",
    { class: `grade grade-${deal.grade}` },
    el("b", {}, deal.grade),
    el("span", {}, `${deal.score}/100`),
  );
}

function breakdown(landed, curve) {
  const rows = landed.lines.map((line) =>
    el(
      "tr",
      {},
      el("td", {}, line.label, line.detail ? el("small", { class: "detail" }, line.detail) : null),
      el("td", {}, cad(line.amountCad)),
    ),
  );
  rows.push(
    el(
      "tr",
      { class: "total" },
      el("td", {}, `Total for ${landed.quantity} bottle${landed.quantity === 1 ? "" : "s"}`),
      el("td", {}, cad(landed.totalCad)),
    ),
  );

  return el(
    "details",
    { class: "breakdown" },
    el("summary", {}, `Landed cost breakdown — ${landed.zoneLabel}, ±${landed.uncertaintyPct}%`),
    el("table", { class: "lines" }, el("tbody", {}, rows)),
    curve?.length
      ? el(
          "div",
          { class: "curve" },
          el("span", { class: "price-label", style: "align-self:center" }, "Per bottle if you buy"),
          curve.map((c) => el("div", { class: "curve-item" }, `${c.quantity}: `, el("b", {}, cad(c.perBottleCad)))),
        )
      : null,
    landed.caveats?.length
      ? el("ul", { class: "caveats" }, landed.caveats.map((c) => el("li", {}, c)))
      : null,
  );
}

/* ── Search ─────────────────────────────────────────────────────────────── */

function renderListing(listing) {
  const v = listing.vintageAssessment;
  const where = [listing.vendorCity, listing.vendorRegion, listing.vendorCountry]
    .filter(Boolean)
    .join(", ");

  const title = listing.productUrl
    ? el("a", { href: listing.productUrl, target: "_blank", rel: "noopener noreferrer" }, listing.vendorName)
    : listing.vendorName;

  return el(
    "article",
    { class: "card" },
    el(
      "div",
      { class: "listing" },
      gradeBlock(listing.deal),
      el(
        "div",
        {},
        el("h4", {}, listing.vintage ? `${listing.vintage} — ` : "Non-vintage — ", title),
        el(
          "p",
          { class: "vendor" },
          where || "location unknown",
          listing.bottleMl !== 750 ? ` · ${listing.bottleMl}ml` : "",
          listing.quantityAvailable ? ` · ${listing.quantityAvailable} available` : "",
          listing.inStock === false ? " · out of stock" : "",
        ),
        v?.score
          ? el(
              "div",
              { class: "chips" },
              el("span", { class: "chip" }, `Vintage ${v.score}/100`),
              listing.criticScore
                ? el("span", { class: "chip" }, `${listing.criticScore} pts${listing.criticSource ? ` · ${listing.criticSource}` : ""}`)
                : null,
              v.window ? el("span", { class: "chip" }, `Drink ${v.window.peakFrom}–${v.window.peakTo}`) : null,
            )
          : null,
        el("p", { class: "verdict" }, listing.deal.verdict),
        listing.deal.reasons.length
          ? el("ul", { class: "reasons" }, listing.deal.reasons.map((r) => el("li", {}, r)))
          : null,
        listing.deal.warnings.length
          ? el("ul", { class: "warnings" }, listing.deal.warnings.map((w) => el("li", {}, w)))
          : null,
      ),
      el(
        "div",
        { class: "price-col" },
        el(
          "span",
          { class: "price-label" },
          listing.bottleMl === 750 ? "Landed in Toronto" : "Landed, per 750ml",
        ),
        el("span", { class: "price-landed" }, cad(listing.landedPer750Cad)),
        el(
          "div",
          { class: "price-shelf" },
          `${money(listing.price, listing.currency)} at the merchant`,
          listing.currency !== "CAD" ? el("br") : null,
          listing.currency !== "CAD" ? `≈ ${cad(listing.priceCad)}` : null,
          listing.bottleMl !== 750
            ? el("div", { class: "muted", style: "font-size:.76rem;margin-top:4px" },
                `for the ${listing.bottleMl}ml bottle — ${cad(listing.landedPerBottleCad)} landed`)
            : null,
        ),
      ),
    ),
    breakdown(listing.landed, listing.landedCurve),
  );
}

function renderVintageAdvice(advice) {
  if (!advice) return null;
  const col = (title, items, extra) =>
    items.length
      ? el(
          "div",
          { class: "advice-col" },
          el("h4", {}, title),
          el(
            "ul",
            {},
            items.map((v) =>
              el(
                "li",
                {},
                el("span", { class: "yr" }, `${v.year}`),
                ` · ${v.score}`,
                v.note ? el("span", { class: "note" }, v.note) : extra ? el("span", { class: "note" }, extra(v)) : null,
              ),
            ),
          ),
        )
      : null;

  return el(
    "section",
    { class: "card" },
    el("h3", {}, `Vintage guidance — ${advice.regionLabel}`),
    el("p", { class: "muted", style: "margin:6px 0 0;font-size:.9rem" }, advice.summary),
    el(
      "div",
      { class: "advice-cols" },
      col("Ready now", advice.drinkNow),
      col("Worth cellaring", advice.cellar, (v) => `Peaks around ${v.window?.peakFrom ?? "—"}`),
      col("Overlooked", advice.sleepers, (v) => `${v.attentionDiscount} points below its neighbour, and priced accordingly`),
      col("Approach with care", advice.avoid, () => "Buy only from producers you trust"),
    ),
  );
}

function renderSearch(data) {
  const out = el("div", {});
  const id = data.identity;

  out.append(renderWarnings(data.meta) ?? "");

  out.append(
    el(
      "section",
      { class: "card identity" },
      el("h2", {}, id.fullName || data.query),
      el(
        "p",
        { class: "sub" },
        [id.appellation, id.country].filter(Boolean).join(" · "),
        id.confidence !== "high" ? ` · identification confidence: ${id.confidence}` : "",
      ),
      id.correctedFrom
        ? el("p", { class: "sub" }, `You typed "${id.correctedFrom}" — searched for ${id.fullName}.`)
        : null,
      id.notes ? el("p", { class: "notes" }, id.notes) : null,
      el(
        "div",
        { class: "chips" },
        id.grapes.map((g) => el("span", { class: "chip" }, g)),
        id.typicalPriceCad ? el("span", { class: "chip" }, `Typical shelf price ${cad(id.typicalPriceCad)}`) : null,
        data.priceReference.benchmarkCad
          ? el("span", { class: "chip" }, `Benchmark landed ${cad(data.priceReference.benchmarkCad)}`)
          : null,
      ),
    ),
  );

  if (data.recommendation) {
    out.append(
      el(
        "div",
        { class: "recommendation" },
        el("h3", {}, "The scout's read"),
        el("p", {}, data.recommendation),
      ),
    );
  }

  out.append(
    el(
      "div",
      { class: "section-head" },
      el("h3", {}, `${data.listings.length} listing${data.listings.length === 1 ? "" : "s"}, best value first`),
      el(
        "span",
        { class: "meta" },
        `Landed prices assume ${data.options.quantity} bottle${data.options.quantity === 1 ? "" : "s"} per order · rates ${data.meta.fxSource} ${data.meta.fxAsOf}`,
      ),
    ),
  );

  if (!data.listings.length) {
    out.append(el("div", { class: "card empty" }, "Nothing matched. Try widening the options, or allowing out-of-stock listings."));
  } else {
    data.listings.forEach((l) => out.append(renderListing(l)));
  }

  const advice = renderVintageAdvice(data.vintageAdvice);
  if (advice) {
    out.append(el("div", { class: "section-head" }, el("h3", {}, "Which year to buy")));
    out.append(advice);
  }

  out.append(renderSources(data.sources) ?? "");
  return out;
}

function initSearch() {
  const form = $("#search-form");
  const status = $("#search-status");
  const results = $("#search-results");

  $$("[data-example]").forEach((b) =>
    b.addEventListener("click", () => {
      $("#q").value = b.dataset.example;
      form.requestSubmit();
    }),
  );

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const query = $("#q").value.trim();
    if (!query) return;

    const button = $("button.primary", form);
    button.disabled = true;
    results.innerHTML = "";
    setStatus(status, "working", `Searching merchants for “${query}” and pricing them to Toronto. This takes a minute or two.`);

    try {
      const data = await api("/api/search", {
        query,
        quantity: Number($("#opt-quantity").value) || 6,
        intent: $("#opt-intent").value,
        maxPriceCad: Number($("#opt-max").value) || null,
        vintage: Number($("#opt-vintage").value) || null,
        includeOutOfStock: $("#opt-oos").checked,
        temperatureControlled: $("#opt-temp").checked,
      });
      setStatus(status, null);
      results.replaceChildren(renderSearch(data));
      results.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (err) {
      setStatus(status, "error", err.message);
    } finally {
      button.disabled = false;
    }
  });
}

/* ── Discover ───────────────────────────────────────────────────────────── */

function renderPick(pick) {
  return el(
    "article",
    { class: "card pick" },
    pick.deal ? el("div", { style: "float:right;width:60px;margin-left:12px" }, gradeBlock(pick.deal)) : null,
    el("h4", {}, [pick.vintage, pick.wineName].filter(Boolean).join(" ")),
    el("p", { class: "prod" }, pick.producer, pick.appellation ? ` · ${pick.appellation}` : "", ` · ${pick.country}`),
    el(
      "div",
      { class: "chips" },
      pick.vintageScore ? el("span", { class: "chip" }, `Vintage ${pick.vintageScore}/100`) : null,
      pick.criticScore ? el("span", { class: "chip" }, `${pick.criticScore} pts`) : null,
      pick.maturity ? el("span", { class: "chip" }, pick.maturity) : null,
      pick.grapes.slice(0, 2).map((g) => el("span", { class: "chip" }, g)),
    ),
    el("p", { class: "rationale" }, pick.rationale),
    el(
      "div",
      { class: "pick-foot" },
      el(
        "div",
        {},
        el("span", { class: "price-label" }, "Landed in Toronto "),
        el("span", { class: "pick-price" }, cad(pick.estimatedLandedCad)),
        pick.price ? el("div", { class: "muted", style: "font-size:.8rem" }, `${money(pick.price, pick.currency)} at ${pick.vendorName || "the merchant"}`) : null,
      ),
      pick.productUrl
        ? el("a", { href: pick.productUrl, target: "_blank", rel: "noopener noreferrer" }, "View listing →")
        : null,
    ),
  );
}

function initDiscover() {
  const form = $("#discover-form");
  const status = $("#discover-status");
  const results = $("#discover-results");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const button = $("button.primary", form);
    button.disabled = true;
    results.innerHTML = "";
    setStatus(status, "working", "Sweeping merchants across France, Italy and Spain. This takes a couple of minutes.");

    try {
      const data = await api("/api/discover", {
        countries: $$("input[name=country]:checked", form).map((i) => i.value),
        minPriceCad: Number($("#disc-min").value) || 30,
        maxPriceCad: Number($("#disc-max").value) || 120,
        style: $("#disc-style").value,
        count: Number($("#disc-count").value) || 8,
        focus: $("#disc-focus").value.trim() || null,
      });
      setStatus(status, null);

      const out = el("div", {});
      out.append(renderWarnings(data.meta) ?? "");
      if (data.brief) out.append(el("div", { class: "recommendation" }, el("h3", {}, "This sweep"), el("p", {}, data.brief)));
      out.append(el("div", { class: "picks" }, data.picks.map(renderPick)));
      out.append(renderSources(data.sources) ?? "");
      results.replaceChildren(out);
    } catch (err) {
      setStatus(status, "error", err.message);
    } finally {
      button.disabled = false;
    }
  });
}

/* ── Vintage chart ──────────────────────────────────────────────────────── */

let regionsLoaded = false;

async function loadVintages() {
  const select = $("#region-select");
  if (!regionsLoaded) {
    const { regions } = await api("/api/regions");
    const byCountry = {};
    for (const r of regions) (byCountry[r.country] ??= []).push(r);
    for (const [country, list] of Object.entries(byCountry)) {
      const group = el("optgroup", { label: country });
      list.forEach((r) => group.append(el("option", { value: r.key }, r.label)));
      select.append(group);
    }
    select.value = "bolgheri";
    select.addEventListener("change", () => showVintages(select.value));
    regionsLoaded = true;
  }
  showVintages(select.value);
}

function qualityClass(score) {
  if (score >= 95) return "q-legend";
  if (score >= 91) return "q-great";
  if (score >= 88) return "q-good";
  if (score >= 84) return "q-ok";
  return "q-poor";
}

const MATURITY_TEXT = {
  "too-young": "too young",
  approaching: "almost ready",
  "in-window": "drinkable",
  "at-peak": "at peak",
  mature: "mature",
  fading: "past peak",
};

async function showVintages(key) {
  const out = $("#vintage-results");
  out.innerHTML = "";
  try {
    const data = await api(`/api/vintages/${encodeURIComponent(key)}`);
    out.append(
      el(
        "section",
        { class: "card" },
        el("h3", {}, data.regionLabel),
        // The summary is carried by the guidance card below, so it is not
        // repeated here.
        el(
          "div",
          { class: "vintage-grid" },
          data.all.map((v) =>
            el(
              "div",
              { class: `vy ${qualityClass(v.score ?? 0)}`, title: v.note || "" },
              el("b", {}, v.year),
              el("span", { class: "sc" }, `${v.score}`),
              el("span", { class: "mt" }, MATURITY_TEXT[v.maturity] ?? ""),
            ),
          ),
        ),
      ),
    );
    out.append(renderVintageAdvice(data));
  } catch (err) {
    out.append(el("div", { class: "status error" }, err.message));
  }
}

/* ── Landed cost calculator ─────────────────────────────────────────────── */

let rateCardLoaded = false;

async function loadRateCard() {
  if (rateCardLoaded) return;
  rateCardLoaded = true;

  const data = await api("/api/rates");
  const zoneSelect = $("#cost-zone");
  data.zones.forEach((z) => zoneSelect.append(el("option", { value: z.zone }, z.label)));
  zoneSelect.value = "italy";

  const rows = Object.entries(data.rateCard).map(([k, v]) =>
    el(
      "tr",
      {},
      el("th", { scope: "row" }, humanise(k), data.provenance[k] ? el("small", { class: "detail muted", style: "display:block;font-weight:400;text-transform:none;letter-spacing:0" }, data.provenance[k]) : null),
      el("td", {}, typeof v === "number" && v < 1 && k !== "exciseCadPerLitre" ? `${(v * 100).toFixed(2)}%` : String(v)),
    ),
  );

  $("#rate-card").replaceChildren(
    el(
      "details",
      { class: "card", style: "margin-top:20px" },
      el("summary", {}, "The rate card these numbers come from"),
      el("p", { class: "muted", style: "font-size:.85rem" }, `Exchange rates: ${data.fx.source}, dated ${data.fx.asOf}.`),
      el("table", { class: "rate-table" }, el("tbody", {}, rows)),
    ),
  );
}

function humanise(key) {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .replace(/ Cad/g, " (CAD)")
    .replace(/Lcbo/g, "LCBO")
    .replace(/Hst/g, "HST")
    .replace(/Mfn/g, "MFN");
}

function initCosts() {
  $("#cost-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const out = $("#cost-results");
    try {
      const data = await api("/api/landed-cost", {
        price: Number($("#cost-price").value),
        currency: $("#cost-currency").value,
        zone: $("#cost-zone").value,
        quantity: Number($("#cost-qty").value) || 6,
        bottleMl: Number($("#cost-ml").value) || 750,
        temperatureControlled: $("#cost-temp").checked,
      });
      out.replaceChildren(
        el(
          "section",
          { class: "card", style: "margin-top:18px" },
          el(
            "div",
            { class: "section-head", style: "margin-top:0" },
            el("h3", {}, `${cad(data.landed.perBottleCad)} per bottle, landed`),
            el("span", { class: "meta" }, `${cad(data.landed.totalCad)} for ${data.landed.quantity} · ±${data.landed.uncertaintyPct}% · ${data.landed.transitDays[0]}–${data.landed.transitDays[1]} days`),
          ),
          breakdown(data.landed, data.curve),
        ),
      );
    } catch (err) {
      out.replaceChildren(el("div", { class: "status error" }, err.message));
    }
  });
}

/* ── Boot ───────────────────────────────────────────────────────────────── */

async function boot() {
  initTheme();
  initTabs();
  initSearch();
  initDiscover();
  initCosts();

  try {
    const health = await api("/api/health");
    const badge = $("#mode-badge");
    if (health.demo) {
      badge.className = "badge badge-demo";
      badge.textContent = "sample data";
      badge.title = "No ANTHROPIC_API_KEY is set, so results come from bundled fixtures.";
    } else {
      badge.className = "badge badge-live";
      badge.textContent = "live search";
      badge.title = `Searching the web via ${health.model}`;
    }
  } catch {
    $("#mode-badge").textContent = "offline";
  }
}

boot();
