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
  // Retry-with-backoff — FRED occasionally 5xx's or times out on CI IPs.
  let lastErr: unknown;
  for (const timeout of [15_000, 30_000, 60_000]) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(timeout),
        headers: { "User-Agent": "centrifuge-analytics/1.0" },
      });
      if (!res.ok) throw new Error(`FRED ${seriesId}: HTTP ${res.status}`);
      const text = await res.text();
      const lines = text.trim().split("\n").slice(1);
      const out: { date: string; value: number }[] = [];
      for (const line of lines) {
        const [date, val] = line.split(",");
        if (!date || val === "." || val === "") continue;
        out.push({ date, value: Number(val) / 100 });
      }
      return out;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

async function main() {
  console.log("Fetching benchmarks (FRED)...");

  // Load current dataset — we'll keep existing benchmark data as fallback
  const current = JSON.parse(await readFile(DATASET_PATH, "utf-8")) as Record<string, unknown>;
  const existing =
    (current.benchmarks as {
      ust_3m?: { date: string; value: number }[];
      aaa_corp?: { date: string; value: number }[];
    } | undefined) ?? {};

  let ust3m = existing.ust_3m ?? [];
  let daaa = existing.aaa_corp ?? [];
  const warnings: string[] = [];

  try {
    ust3m = await fredCsv("DGS3MO");
    console.log(`  3M T-Bill: ${ust3m.length} daily points`);
  } catch (e) {
    const msg = (e as Error).message;
    warnings.push(`3M T-Bill fetch failed — keeping previous ${existing.ust_3m?.length ?? 0} points. (${msg})`);
    console.warn(`  3M T-Bill: ${warnings[warnings.length - 1]}`);
  }
  try {
    daaa = await fredCsv("DAAA");
    console.log(`  AAA bond:  ${daaa.length} daily points`);
  } catch (e) {
    const msg = (e as Error).message;
    warnings.push(`AAA bond fetch failed — keeping previous ${existing.aaa_corp?.length ?? 0} points. (${msg})`);
    console.warn(`  AAA bond:  ${warnings[warnings.length - 1]}`);
  }

  current.benchmarks = { ust_3m: ust3m, aaa_corp: daaa };
  current.generatedAt = new Date().toISOString();
  await writeFile(DATASET_PATH, JSON.stringify(current));
  console.log(`\nWrote benchmarks → dataset.json${warnings.length > 0 ? ` (${warnings.length} warning(s))` : ""}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
