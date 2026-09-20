/* Krasi Crazy — front end. No framework; the shapes coming back from the API
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

async function api(path, body, method) {
  const verb = method ?? (body ? "POST" : "GET");
  const sendsBody = body !== null && body !== undefined && verb !== "GET";
  const res = await fetch(path, {
    method: verb,
    headers: sendsBody ? { "content-type": "application/json" } : undefined,
    body: sendsBody ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({ error: "The server sent something unreadable." }));
  if (!res.ok) throw new Error(data.detail ? `${data.error} (${data.detail})` : data.error || res.statusText);
  return data;
}


/**
 * Long jobs.
 *
 * A live search runs for minutes, far longer than a browser will hold a
 * request open, so the server hands back a job and we poll it. `start`
 * returns either a finished result (a cache hit) or a job to follow.
 */
async function runLongJob(startPath, body, pollPath, onTick) {
  const started = await api(startPath, body);
  if (!started.job) return started; // cached — already done

  let jobId = started.job.id;
  const begun = Date.now();

  for (;;) {
    await new Promise((r) => setTimeout(r, 2000));
    let poll;
    try {
      poll = await api(`${pollPath}/${jobId}`);
    } catch (err) {
      // A restarted server forgets its jobs; say so plainly.
      throw new Error("Lost track of that search — the app may have restarted. Try again.");
    }
    const job = poll.job;
    const secs = Math.floor((Date.now() - begun) / 1000);
    onTick?.(secs);

    if (job.status === "done") {
      if (!job.result) throw new Error("The search finished but returned nothing.");
      return job.result;
    }
    if (job.status === "error") throw new Error(job.error || "The search failed.");
    if (job.status === "cancelled") throw new Error("That search was cancelled.");
  }
}

function elapsedLabel(secs) {
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}m ${String(secs % 60).padStart(2, "0")}s`;
}

/* ── Chrome ─────────────────────────────────────────────────────────────── */

function initTheme() {
  try {
    const saved = localStorage.getItem("krasi-crazy-theme");
    if (saved) document.documentElement.dataset.theme = saved;
  } catch { /* private mode; the media query default is fine */ }

  $("#theme-toggle").addEventListener("click", () => {
    const now = document.documentElement.dataset.theme;
    const dark = now ? now === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    const next = dark ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("krasi-crazy-theme", next); } catch { /* ignore */ }
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
      if (tab.dataset.tab === "watchlist") loadWatchlist();
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
      // A target 15% under the benchmark is about what a genuinely good offer
      // looks like; it is editable on the watchlist afterwards.
      el(
        "div",
        { style: "margin-top:14px" },
        el(
          "button",
          {
            class: "secondary",
            type: "button",
            onClick: (e) =>
              watchThisWine(
                id,
                data.priceReference.benchmarkCad
                  ? Math.round((data.priceReference.benchmarkCad * 0.85) / 5) * 5
                  : null,
                e.currentTarget,
              ),
          },
          watchState.watches.some(
            (w) => w.query.toLowerCase() === (id.fullName || id.query).toLowerCase(),
          )
            ? "On your watchlist ✓"
            : "Watch this wine",
        ),
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
      const data = await runLongJob(
        "/api/search",
        {
          query,
          quantity: Number($("#opt-quantity").value) || 6,
          intent: $("#opt-intent").value,
          maxPriceCad: Number($("#opt-max").value) || null,
          vintage: Number($("#opt-vintage").value) || null,
          includeOutOfStock: $("#opt-oos").checked,
          temperatureControlled: $("#opt-temp").checked,
        },
        "/api/search",
        (secs) =>
          setStatus(
            status,
            "working",
            `Searching merchants for “${query}” and pricing them to Toronto — ${elapsedLabel(secs)} so far. This usually takes three to five minutes.`,
          ),
      );
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
      const data = await runLongJob(
        "/api/discover",
        {
          countries: $$("input[name=country]:checked", form).map((i) => i.value),
          minPriceCad: Number($("#disc-min").value) || 30,
          maxPriceCad: Number($("#disc-max").value) || 120,
          style: $("#disc-style").value,
          count: Number($("#disc-count").value) || 8,
          focus: $("#disc-focus").value.trim() || null,
        },
        "/api/discover",
        (secs) =>
          setStatus(
            status,
            "working",
            `Sweeping merchants across France, Italy and Spain — ${elapsedLabel(secs)} so far. This usually takes a few minutes.`,
          ),
      );
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


/* ── Watchlist ──────────────────────────────────────────────────────────── */

const ALERT_LABEL = {
  "target-hit": "Target price hit",
  "price-drop": "Price drop",
  "great-deal": "Strong deal",
  "new-vintage": "New vintage",
  "back-in-stock": "Back in stock",
};

let watchState = { watches: [], alerts: [], unacknowledged: 0, dueCount: 0 };
let pollTimer = null;

/** A tiny inline chart of what this wine has cost over time. */
function sparkline(history) {
  const points = history.map((h) => h.bestLandedCad).filter((n) => typeof n === "number");
  if (points.length < 2) return null;

  const w = 120, h = 30, pad = 2;
  const min = Math.min(...points), max = Math.max(...points);
  const span = max - min || 1;
  const step = (w - pad * 2) / (points.length - 1);
  const coords = points.map((v, i) => [
    pad + i * step,
    pad + (h - pad * 2) * (1 - (v - min) / span),
  ]);
  const d = coords.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const last = coords[coords.length - 1];
  const falling = points[points.length - 1] < points[0];

  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  svg.setAttribute("class", "spark");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label",
    `Best landed price over ${points.length} checks, from ${cad(points[0])} to ${cad(points[points.length - 1])}`);

  const path = document.createElementNS(ns, "path");
  path.setAttribute("d", d);
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", falling ? "var(--green)" : "var(--ink-3)");
  path.setAttribute("stroke-width", "1.5");
  path.setAttribute("stroke-linejoin", "round");
  path.setAttribute("stroke-linecap", "round");
  svg.append(path);

  const dot = document.createElementNS(ns, "circle");
  dot.setAttribute("cx", last[0]); dot.setAttribute("cy", last[1]); dot.setAttribute("r", "2.5");
  dot.setAttribute("fill", falling ? "var(--green)" : "var(--ink-3)");
  svg.append(dot);
  return svg;
}

function renderAlerts() {
  const area = $("#alerts-area");
  const live = watchState.alerts.filter((a) => !a.acknowledged);
  const badge = $("#alert-count");
  badge.hidden = live.length === 0;
  badge.textContent = String(live.length);

  if (!live.length) { area.replaceChildren(); return; }

  area.replaceChildren(
    el(
      "section",
      { class: "card alerts" },
      el(
        "div",
        { class: "section-head", style: "margin-top:0" },
        el("h3", {}, `${live.length} alert${live.length === 1 ? "" : "s"}`),
        el("button", { class: "link-btn", onClick: () => ackAlerts("all") }, "Mark all read"),
      ),
      el(
        "ul",
        { class: "alert-list" },
        live.map((a) =>
          el(
            "li",
            { class: `alert alert-${a.kind}` },
            el(
              "div",
              {},
              el("span", { class: "alert-kind" }, ALERT_LABEL[a.kind] ?? a.kind),
              el("strong", { class: "alert-wine" }, a.watchLabel),
              el("p", { class: "alert-msg" }, a.message),
              el(
                "p",
                { class: "alert-meta" },
                new Date(a.createdAt).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" }),
                a.url ? " · " : "",
                a.url ? el("a", { href: a.url, target: "_blank", rel: "noopener noreferrer" }, "open listing") : null,
              ),
            ),
            el("button", { class: "link-btn", onClick: () => ackAlerts([a.id]) }, "Dismiss"),
          ),
        ),
      ),
    ),
  );
}

async function ackAlerts(ids) {
  await api("/api/alerts/ack", { ids });
  await loadWatchlist();
}

function renderWatch(w) {
  const latest = w.latest;
  const target = w.rule.targetLandedCad;
  const best = latest?.bestLandedCad ?? null;

  let distance = null;
  if (best !== null && target) {
    const pct = ((best - target) / target) * 100;
    distance =
      pct <= 0
        ? el("span", { class: "dist hit" }, `${Math.abs(pct).toFixed(0)}% under target`)
        : el("span", { class: "dist" }, `${pct.toFixed(0)}% over target`);
  }

  const due = w.enabled && (!w.lastCheckedAt ||
    (Date.now() - Date.parse(w.lastCheckedAt)) / 3600000 >= w.checkEveryHours);

  return el(
    "article",
    { class: `card watch${w.enabled ? "" : " is-off"}` },
    el(
      "div",
      { class: "watch-head" },
      el(
        "div",
        { class: "watch-id" },
        el("h4", {}, w.label),
        el("p", { class: "vendor" },
          [w.appellation, w.country].filter(Boolean).join(" · ") || w.query),
        el(
          "div",
          { class: "chips" },
          w.tags.map((t) => el("span", { class: "chip" }, t)),
          w.vintage ? el("span", { class: "chip" }, `${w.vintage} only`) : null,
          !w.enabled ? el("span", { class: "chip" }, "paused") : null,
          due ? el("span", { class: "chip chip-due" }, "due") : null,
        ),
      ),
      el(
        "div",
        { class: "watch-price" },
        latest?.bestGrade ? el("span", { class: `pill grade-${latest.bestGrade}` }, latest.bestGrade) : null,
        el("span", { class: "price-label" }, "Best landed"),
        el("span", { class: "price-landed" }, cad(best)),
        distance,
        sparkline(w.history ?? []),
      ),
    ),
    latest?.bestVendor
      ? el("p", { class: "watch-line" },
          `${latest.bestVintage ?? "NV"} at ${latest.bestVendor}`,
          latest.bestVendorCountry ? ` (${latest.bestVendorCountry})` : "",
          ` · ${latest.listingCount} listing${latest.listingCount === 1 ? "" : "s"}`,
          latest.bestUrl ? " · " : "",
          latest.bestUrl
            ? el("a", { href: latest.bestUrl, target: "_blank", rel: "noopener noreferrer" }, "open")
            : null)
      : el("p", { class: "watch-line muted" },
          w.lastCheckedAt ? "Nothing found at the last check." : "Not checked yet."),
    w.notes ? el("p", { class: "watch-note" }, w.notes) : null,
    w.lastError ? el("p", { class: "watch-line", style: "color:var(--red)" }, `Last check failed: ${w.lastError}`) : null,
    el(
      "div",
      { class: "watch-foot" },
      el("label", { class: "inline-field" }, "Target $",
        el("input", {
          type: "number", min: "0", step: "5", value: target ?? "",
          placeholder: "none",
          onChange: (e) => patchWatch(w.id, { targetLandedCad: e.target.value === "" ? null : Number(e.target.value) }),
        })),
      el("label", { class: "inline-field" }, "Every",
        el("input", {
          type: "number", min: "1", max: "720", value: w.checkEveryHours,
          onChange: (e) => patchWatch(w.id, { checkEveryHours: Number(e.target.value) }),
        }), "h"),
      el("span", { class: "meta" },
        w.lastCheckedAt
          ? `checked ${new Date(w.lastCheckedAt).toLocaleDateString("en-CA", { month: "short", day: "numeric" })}`
          : "never checked"),
      el("span", { class: "spacer" }),
      el("button", { class: "link-btn", onClick: () => checkOne(w.id, w.label) }, "Check now"),
      el("button", { class: "link-btn", onClick: () => patchWatch(w.id, { enabled: !w.enabled }) },
        w.enabled ? "Pause" : "Resume"),
      el("button", { class: "link-btn danger", onClick: () => removeWatch(w.id, w.label) }, "Remove"),
    ),
  );
}

function renderWatchlist() {
  renderAlerts();
  const list = $("#watch-list");
  if (!watchState.watches.length) {
    list.replaceChildren(
      el("div", { class: "card empty" },
        "Your watchlist is empty. ",
        el("button", { class: "link-btn", onClick: restoreSeeds }, "Load the starter list")),
    );
    return;
  }

  // Closest to its target first — that is the order you'd read it in.
  const sorted = [...watchState.watches].sort((a, b) => {
    const rank = (w) => {
      const best = w.latest?.bestLandedCad;
      const target = w.rule.targetLandedCad;
      if (best == null) return Number.POSITIVE_INFINITY;
      if (!target) return (best / 1000) + 500;
      return (best - target) / target;
    };
    return rank(a) - rank(b);
  });

  list.replaceChildren(
    el("div", { class: "section-head" },
      el("h3", {}, `${watchState.watches.length} wines watched`),
      el("span", { class: "meta" },
        `${watchState.dueCount} due for a check · sorted by how close each is to its target`)),
    ...sorted.map(renderWatch),
  );
}

async function loadWatchlist() {
  watchState = await api("/api/watchlist");
  renderWatchlist();
  if (watchState.running) pollJob(watchState.running.id);
}

async function patchWatch(id, patch) {
  await api(`/api/watchlist/${id}`, patch, "PATCH");
  await loadWatchlist();
}

async function removeWatch(id, label) {
  if (!confirm(`Stop watching ${label}?`)) return;
  await api(`/api/watchlist/${id}`, null, "DELETE");
  await loadWatchlist();
}

async function restoreSeeds() {
  await api("/api/watchlist/restore-seeds", {});
  await loadWatchlist();
}

async function checkOne(id, label) {
  const status = $("#watch-status");
  setStatus(status, "working", `Checking ${label} — one live search, about a minute.`);
  try {
    const outcome = await api(`/api/watchlist/${id}/check`, {});
    setStatus(status, null);
    await loadWatchlist();
    if (!outcome.ok) setStatus(status, "error", `${label}: ${outcome.error}`);
  } catch (err) {
    setStatus(status, "error", err.message);
  }
}

async function startCheckAll(force) {
  const status = $("#watch-status");
  const due = force ? watchState.watches.filter((w) => w.enabled).length : watchState.dueCount;
  if (!due) { setStatus(status, "error", "Nothing is due. Use “Force check” to run them anyway."); return; }
  if (!confirm(`This runs ${due} live web searches, which takes a while and costs API credits. Go ahead?`)) return;

  try {
    const { job } = await api("/api/watchlist/check", { force });
    pollJob(job.id);
  } catch (err) {
    setStatus(status, "error", err.message);
  }
}

function pollJob(jobId) {
  clearInterval(pollTimer);
  const progress = $("#check-progress");
  const status = $("#watch-status");

  const tick = async () => {
    try {
      const { job } = await api(`/api/watchlist/check/${jobId}`);
      if (job.status === "running") {
        progress.textContent = `Checking ${job.done + 1} of ${job.total}${job.current ? ` — ${job.current}` : ""}…`;
        setStatus(status, "working", "Running through the watchlist. You can leave this tab open.");
        return;
      }
      clearInterval(pollTimer);
      progress.textContent = "";
      setStatus(status, null);
      if (job.status === "error") setStatus(status, "error", job.error);
      await loadWatchlist();
    } catch {
      clearInterval(pollTimer);
      progress.textContent = "";
    }
  };
  tick();
  pollTimer = setInterval(tick, 3000);
}

function initWatchlist() {
  $("#check-all").addEventListener("click", () => startCheckAll(false));
  $("#check-all-force").addEventListener("click", () => startCheckAll(true));

  const form = $("#watch-add");
  $("#watch-add-toggle").addEventListener("click", () => {
    form.hidden = !form.hidden;
    if (!form.hidden) $("#wa-query").focus();
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await api("/api/watchlist", {
        query: $("#wa-query").value.trim(),
        label: $("#wa-label").value.trim() || undefined,
        targetLandedCad: Number($("#wa-target").value) || null,
        vintage: Number($("#wa-vintage").value) || null,
        quantity: Number($("#wa-quantity").value) || 6,
        intent: $("#wa-intent").value,
        checkEveryHours: Number($("#wa-every").value) || 24,
        notes: $("#wa-notes").value.trim() || null,
      });
      form.reset();
      form.hidden = true;
      await loadWatchlist();
    } catch (err) {
      setStatus($("#watch-status"), "error", err.message);
    }
  });
}

/** Offered on every search result, so a wine can be watched without retyping it. */
async function watchThisWine(identity, suggestedTarget, button) {
  button.disabled = true;
  button.textContent = "Adding…";
  try {
    await api("/api/watchlist", {
      query: identity.fullName || identity.query,
      label: identity.wineName || identity.fullName,
      producer: identity.producer,
      country: identity.country,
      appellation: identity.appellation,
      targetLandedCad: suggestedTarget,
    });
    button.textContent = "On your watchlist ✓";
    await loadWatchlist();
  } catch (err) {
    button.disabled = false;
    button.textContent = "Watch this wine";
    setStatus($("#search-status"), "error", err.message);
  }
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
  initWatchlist();
  initDiscover();
  initCosts();

  // Pull the watchlist once at boot so the alert badge is correct before the
  // tab is ever opened.
  loadWatchlist().catch(() => {});

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
