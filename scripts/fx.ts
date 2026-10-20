/**
 * Fills data/fx/usd-per-eur.json with the ECB's euro reference rate in dollars for the day each costed card was made
 * (or the last working day before it), so the charts can show every amount in dollars as well as euros. A commitment
 * made in dollars and converted to euros on that day converts back to its own figure. The build reads the file and
 * never goes online; run this after adding or editing a card with a cost.
 *
 * Run: node scripts/fx.ts
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { validateContent } from "@openpromises/core";
import { findConfig, folderSource, loadConfig, readContent } from "@openpromises/files";

const ROOT = join(import.meta.dirname, "..");
export const FX_FILE = join(ROOT, "data", "fx", "usd-per-eur.json");
const SERIES = "https://data-api.ecb.europa.eu/service/data/EXR/D.USD.EUR.SP00.A";

export interface FxFile {
  source: string;
  series: string;
  /** By the day a card was made: the rate (dollars per euro) and the ECB day it was fixed. */
  rates: Record<string, { usd_per_eur: number; ecb_date: string }>;
}

export function readFx(): FxFile {
  try {
    return JSON.parse(readFileSync(FX_FILE, "utf8")) as FxFile;
  } catch {
    return { source: "ECB euro foreign exchange reference rates", series: SERIES, rates: {} };
  }
}

/** The last fixing on or before a day: the ECB publishes none on weekends and TARGET holidays. */
async function rateOn(day: string): Promise<{ usd_per_eur: number; ecb_date: string }> {
  const from = new Date(Date.parse(`${day}T00:00:00Z`) - 10 * 86_400_000).toISOString().slice(0, 10);
  const res = await fetch(`${SERIES}?startPeriod=${from}&endPeriod=${day}&format=csvdata`);
  if (!res.ok) throw new Error(`ECB answered ${res.status} for ${day}`);
  const lines = (await res.text()).trim().split("\n");
  const head = lines[0]!.split(",");
  const last = lines.at(-1)!.split(",");
  const ecb_date = last[head.indexOf("TIME_PERIOD")]!;
  const usd_per_eur = Number(last[head.indexOf("OBS_VALUE")]);
  if (!ecb_date || !Number.isFinite(usd_per_eur)) throw new Error(`No ECB rate found up to ${day}`);
  return { usd_per_eur, ecb_date };
}

async function main() {
  const { config, contentDir } = await loadConfig(findConfig(ROOT)!);
  const { cards } = validateContent(readContent(folderSource(contentDir), config).input);
  const fx = readFx();
  const costed = cards.map((v) => v.card).filter((c) => {
    const cost = c.versions.at(-1)?.parameters?.cost;
    return !!(cost && "range" in cost && cost.range);
  });
  const days = [...new Set(costed.map((c) => c.made_on))].sort();
  let added = 0;
  for (const day of days) {
    if (fx.rates[day]) continue;
    fx.rates[day] = await rateOn(day);
    added++;
  }
  fx.rates = Object.fromEntries(Object.entries(fx.rates).sort(([a], [b]) => a.localeCompare(b)));
  mkdirSync(dirname(FX_FILE), { recursive: true });
  writeFileSync(FX_FILE, JSON.stringify(fx, null, 2) + "\n");
  console.log(`${days.length} days with a costed card; ${added} rates added from the ECB into data/fx/usd-per-eur.json.`);
}

if (import.meta.url === `file://${process.argv[1]}`)
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
