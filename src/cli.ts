#!/usr/bin/env node
import "dotenv/config";
import { parseArgs } from "node:util";
import { isDemoMode } from "./claude/client.js";
import { REGIONS } from "./data/regions.js";
import { MATURITY_LABEL, vintageAdvice } from "./domain/vintage.js";
import { discoverWines } from "./discover.js";
import { searchWine } from "./search.js";

const HELP = `
Cellar Scout — wine priced the way it arrives in Toronto.

  npm run cli -- search "Guado al Tasso" [options]
  npm run cli -- discover [options]
  npm run cli -- vintages <region-key>
  npm run cli -- regions

Search options
  --quantity <n>     bottles per order (default 6) — freight is shared, so this matters
  --intent <s>       drink-now | cellar | either  (default either)
  --vintage <year>   restrict to one vintage
  --max <cad>        ceiling per bottle landed
  --include-oos      include out-of-stock listings
  --json             print raw JSON instead of a table

Discover options
  --count <n>        how many picks (default 8)
  --min <cad>        budget floor landed (default 30)
  --max <cad>        budget ceiling landed (default 120)
  --focus <text>     e.g. "Nebbiolo under $70"
  --json
`;

const cad = (n: number | null | undefined) =>
  n === null || n === undefined || !Number.isFinite(n)
    ? "     —"
    : `$${n.toFixed(2)}`.padStart(9);

function pad(s: string, n: number): string {
  const t = s.length > n ? `${s.slice(0, n - 1)}…` : s;
  return t.padEnd(n);
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      quantity: { type: "string" },
      intent: { type: "string" },
      vintage: { type: "string" },
      max: { type: "string" },
      min: { type: "string" },
      count: { type: "string" },
      focus: { type: "string" },
      "include-oos": { type: "boolean" },
      json: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
  });

  const command = positionals[0];
  if (values.help || !command) {
    console.log(HELP);
    return;
  }

  if (isDemoMode() && command !== "vintages" && command !== "regions") {
    console.error("! No ANTHROPIC_API_KEY set — showing bundled sample data.\n");
  }

  switch (command) {
    case "search": {
      const query = positionals.slice(1).join(" ");
      if (!query) {
        console.error("Which wine? e.g. npm run cli -- search \"Barolo Monprivato\"");
        process.exitCode = 1;
        return;
      }
      const result = await searchWine(query, {
        quantity: Number(values.quantity) || 6,
        intent: (values.intent as "drink-now" | "cellar" | "either") ?? "either",
        vintage: values.vintage ? Number(values.vintage) : null,
        maxPriceCad: values.max ? Number(values.max) : null,
        includeOutOfStock: Boolean(values["include-oos"]),
      });

      if (values.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      const id = result.identity;
      console.log(`\n  ${id.fullName}`);
      console.log(`  ${[id.appellation, id.country].filter(Boolean).join(" · ")}`);
      if (id.correctedFrom) console.log(`  (you typed "${id.correctedFrom}")`);
      if (id.notes) console.log(`\n  ${wrap(id.notes, 76, "  ")}`);

      console.log(`\n  ${result.listings.length} listings, best value first — landed in Toronto on a ${result.options.quantity}-bottle order\n`);
      console.log(
        `  ${pad("", 4)}${pad("VINTAGE", 9)}${pad("MERCHANT", 29)}${pad("FROM", 16)}${"SHELF*".padStart(9)} ${"LANDED*".padStart(9)}`,
      );
      for (const l of result.listings) {
        // Both money columns are per-750ml so a magnum lines up with the rest.
        const shelfPer750 = l.priceCad * (750 / l.bottleMl);
        const name = l.bottleMl === 750 ? l.vendorName : `${l.vendorName} (${l.bottleMl}ml)`;
        console.log(
          `  ${pad(l.deal.grade, 4)}${pad(String(l.vintage ?? "NV"), 9)}${pad(name, 29)}${pad(l.vendorCountry ?? "?", 16)}${cad(shelfPer750)} ${cad(l.landedPer750Cad)}`,
        );
      }

      console.log(`\n  * per 750ml equivalent, so other formats compare fairly`);
      console.log(`\n  ${wrap(result.recommendation, 76, "  ")}`);

      const advice = result.vintageAdvice;
      if (advice) {
        console.log(`\n  Vintages — ${advice.regionLabel}`);
        console.log(`  ${wrap(advice.summary, 76, "  ")}`);
      }

      for (const w of result.meta.warnings) console.log(`\n  ! ${wrap(w, 74, "    ")}`);
      console.log("");
      return;
    }

    case "discover": {
      const result = await discoverWines({
        count: Number(values.count) || 8,
        minPriceCad: Number(values.min) || 30,
        maxPriceCad: Number(values.max) || 120,
        focus: values.focus ?? null,
      });
      if (values.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      console.log(`\n  ${wrap(result.brief, 76, "  ")}\n`);
      for (const p of result.picks) {
        console.log(`  ${p.deal?.grade ?? "—"}  ${[p.vintage, p.producer, p.wineName].filter(Boolean).join(" ")}`);
        console.log(`      ${[p.appellation, p.country].filter(Boolean).join(" · ")} — ${cad(p.estimatedLandedCad).trim()} landed`);
        console.log(`      ${wrap(p.rationale, 70, "      ")}\n`);
      }
      return;
    }

    case "vintages": {
      const key = positionals[1];
      const advice = key ? vintageAdvice(key) : null;
      if (!advice) {
        console.error(`Unknown region. Run \`npm run cli -- regions\` for the list.`);
        process.exitCode = 1;
        return;
      }
      if (values.json) {
        console.log(JSON.stringify(advice, null, 2));
        return;
      }
      console.log(`\n  ${advice.regionLabel}\n`);
      for (const v of advice.all) {
        const bar = "█".repeat(Math.max(0, Math.round(((v.score ?? 0) - 75) / 2)));
        console.log(
          `  ${v.year}  ${String(v.score).padStart(3)}  ${pad(v.maturity ? MATURITY_LABEL[v.maturity] : "", 26)}${bar}`,
        );
      }
      console.log(`\n  ${wrap(advice.summary, 76, "  ")}`);
      if (advice.sleepers.length) {
        console.log(`\n  Overlooked: ${advice.sleepers.map((s) => s.year).join(", ")}`);
      }
      console.log("");
      return;
    }

    case "regions": {
      let country = "";
      for (const r of REGIONS) {
        if (r.country !== country) {
          country = r.country;
          console.log(`\n  ${country}`);
        }
        console.log(`    ${pad(r.key, 22)}${r.label}`);
      }
      console.log("");
      return;
    }

    default:
      console.error(`Unknown command "${command}".`);
      console.log(HELP);
      process.exitCode = 1;
  }
}

function wrap(text: string, width: number, indent: string): string {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    if (line.length + w.length + 1 > width) {
      lines.push(line);
      line = w;
    } else {
      line = line ? `${line} ${w}` : w;
    }
  }
  if (line) lines.push(line);
  return lines.join(`\n${indent}`);
}

main().catch((err) => {
  console.error(`\n  ${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
});
