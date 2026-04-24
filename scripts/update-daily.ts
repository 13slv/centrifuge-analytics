/**
 * Incremental daily update: re-runs discovery + backfill.
 *
 * Backfill is cheap (V3 API is free; Tinlake archive reads are small) so this
 * script just replays the full generator rather than appending. If run time
 * becomes a concern we can add delta logic that only fetches snapshots newer
 * than the last entry in dataset.json.
 */
import "dotenv/config";
import { config } from "dotenv";
import { execSync } from "node:child_process";

config({ path: ".env.local", override: true });

try {
  execSync("tsx scripts/discover-pools.ts", { stdio: "inherit" });
  execSync("tsx scripts/backfill.ts", { stdio: "inherit" });
  execSync("tsx scripts/flows.ts", { stdio: "inherit" });
  execSync("tsx scripts/holders.ts", { stdio: "inherit" });
  execSync("tsx scripts/benchmarks.ts", { stdio: "inherit" });
  execSync("tsx scripts/rwa-tvl.ts", { stdio: "inherit" });
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}
