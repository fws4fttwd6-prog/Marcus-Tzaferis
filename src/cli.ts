#!/usr/bin/env node
import "dotenv/config";
import { parseArgs } from "node:util";
import { isDemoMode } from "./claude/client.js";
import { REGIONS } from "./data/regions.js";
import { MATURITY_LABEL, vintageAdvice } from "./domain/vintage.js";
import { discoverWines } from "./discover.js";
import {
  acknowledgeAlerts,
  addWatch,
  listAlerts,
  listWatches,
  removeWatch,
  restoreSeeds,
  storePath,
} from "./store.js";
import { checkWatch, checkWatchlist, isDue } from "./watchlist.js";
import { searchWine } from "./search.js";

const HELP = `
Krasi Crazy — wine priced the way it arrives in Toronto.

  npm run cli -- search "Guado al Tasso" [options]
  npm run cli -- discover [options]
  npm run cli -- vintages <region-key>
  npm run cli -- regions

  npm run cli -- watch list
  npm run cli -- watch add "Chateau Figeac" --target 240
  npm run cli -- watch check [--all] [--id <id>]
  npm run cli -- watch alerts [--ack]
  npm run cli -- watch remove <id>
  npm run cli -- watch restore

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
    ? "—".padStart(9)
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
      target: { type: "string" },
      id: { type: "string" },
      all: { type: "boolean" },
      ack: { type: "boolean" },
      limit: { type: "string" },
      json: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
  });

  const command = positionals[0];
  if (values.help || !command) {
    console.log(HELP);
    return;
  }

  // Only the commands that actually reach the web care about a missing key.
  const searches =
    command === "search" ||
    command === "discover" ||
    (command === "watch" && positionals[1] === "check");
  if (isDemoMode() && searches) {
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

    case "watch": {
      const sub = positionals[1] ?? "list";

      if (sub === "list") {
        const watches = await listWatches();
        if (values.json) { console.log(JSON.stringify(watches, null, 2)); return; }
        console.log(`\n  ${watches.length} wines watched — ${storePath()}\n`);
        console.log(
          `  ${pad("ID", 14)}${pad("WINE", 30)}${"TARGET".padStart(9)} ${"BEST".padStart(9)}  STATUS`,
        );
        for (const w of watches) {
          const best = w.latest?.bestLandedCad ?? null;
          const target = w.rule.targetLandedCad;
          const status = !w.enabled
            ? "paused"
            : best !== null && target && best <= target
              ? "AT TARGET"
              : isDue(w)
                ? "due"
                : w.lastCheckedAt
                  ? `checked ${w.lastCheckedAt.slice(0, 10)}`
                  : "never checked";
          console.log(
            `  ${pad(w.id, 14)}${pad(w.label, 30)}${cad(target)} ${cad(best)}  ${status}`,
          );
        }
        console.log("");
        return;
      }

      if (sub === "add") {
        const query = positionals.slice(2).join(" ");
        if (!query) {
          console.error('Which wine? e.g. npm run cli -- watch add "Chateau Figeac" --target 240');
          process.exitCode = 1;
          return;
        }
        const watch = await addWatch({
          query,
          rule: { targetLandedCad: values.target ? Number(values.target) : null },
        });
        console.log(`\n  Watching ${watch.label}  (${watch.id})\n`);
        return;
      }

      if (sub === "remove") {
        const id = positionals[2] ?? values.id;
        if (!id) { console.error("Which watch? Pass an id from `watch list`."); process.exitCode = 1; return; }
        console.log(await removeWatch(id) ? `\n  Removed ${id}\n` : `\n  No watch with id ${id}\n`);
        return;
      }

      if (sub === "restore") {
        console.log(`\n  Restored ${await restoreSeeds()} seed wines.\n`);
        return;
      }

      if (sub === "alerts") {
        if (values.ack) {
          console.log(`\n  Marked ${await acknowledgeAlerts("all")} alerts read.\n`);
          return;
        }
        const alerts = await listAlerts({ unacknowledgedOnly: true });
        if (values.json) { console.log(JSON.stringify(alerts, null, 2)); return; }
        if (!alerts.length) { console.log("\n  No unread alerts.\n"); return; }
        console.log(`\n  ${alerts.length} unread alert${alerts.length === 1 ? "" : "s"}\n`);
        for (const a of alerts) {
          console.log(`  ${a.watchLabel}  —  ${a.kind}`);
          console.log(`    ${wrap(a.message, 72, "    ")}`);
          if (a.url) console.log(`    ${a.url}`);
          console.log("");
        }
        return;
      }

      if (sub === "check") {
        if (isDemoMode()) {
          console.error("  Checking with no API key would only record sample data. Set ANTHROPIC_API_KEY first.\n");
          process.exitCode = 1;
          return;
        }
        const ids = values.id ? [values.id] : undefined;
        const { checked, alerts, skipped } = await checkWatchlist({
          ids,
          force: Boolean(values.all) || Boolean(values.id),
          limit: values.limit ? Number(values.limit) : undefined,
          onProgress: (done, total, label) => {
            if (label !== "done") process.stderr.write(`  [${done + 1}/${total}] ${label}…\n`);
          },
        });
        console.log(`\n  Checked ${checked.length}${skipped ? `, skipped ${skipped} not yet due` : ""}.`);
        const failed = checked.filter((c) => !c.ok);
        for (const f of failed) console.log(`  ! ${f.label}: ${f.error}`);
        if (!alerts.length) { console.log("  No alerts.\n"); return; }
        console.log(`\n  ${alerts.length} alert${alerts.length === 1 ? "" : "s"}:\n`);
        for (const a of alerts) {
          console.log(`  ${a.watchLabel}  —  ${a.kind}`);
          console.log(`    ${wrap(a.message, 72, "    ")}\n`);
        }
        return;
      }

      console.error(`Unknown watch command "${sub}".`);
      process.exitCode = 1;
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
