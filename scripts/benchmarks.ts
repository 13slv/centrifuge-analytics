/**
 * Fetch external yield benchmarks (no API key needed):
 *  - 3-month US Treasury yield (FRED series DGS3MO) — benchmark for JTRSY
 *  - AAA corporate bond yield (FRED DAAA) — rough benchmark for JAAA
 */
import "dotenv/config";
import { writeFile, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATASET_PATH = join(__dirname, "..", "public", "data", "dataset.json");

const START_DATE = "2025-01-01";

async function fredCsv(seriesId: string): Promise<{ date: string; value: number }[]> {
  const url = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${seriesId}&cosd=${START_DATE}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`FRED ${seriesId}: HTTP ${res.status}`);
  const text = await res.text();
  const lines = text.trim().split("\n").slice(1); // skip header
  const out: { date: string; value: number }[] = [];
  for (const line of lines) {
    const [date, val] = line.split(",");
    if (!date || val === "." || val === "") continue;
    out.push({ date, value: Number(val) / 100 }); // FRED gives % points; store as fraction
  }
  return out;
}

async function main() {
  console.log("Fetching benchmarks (FRED)...");
  const [ust3m, daaa] = await Promise.all([fredCsv("DGS3MO"), fredCsv("DAAA")]);
  console.log(`  3M T-Bill: ${ust3m.length} daily points`);
  console.log(`  AAA bond:  ${daaa.length} daily points`);

  const benchmarks = {
    ust_3m: ust3m,
    aaa_corp: daaa,
  };
  const current = JSON.parse(await readFile(DATASET_PATH, "utf-8")) as Record<string, unknown>;
  current.benchmarks = benchmarks;
  current.generatedAt = new Date().toISOString();
  await writeFile(DATASET_PATH, JSON.stringify(current));
  console.log(`\nWrote benchmarks → dataset.json`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
