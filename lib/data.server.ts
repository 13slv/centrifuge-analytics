import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Dataset } from "./types";

export async function getDataset(): Promise<Dataset> {
  const path = join(process.cwd(), "public", "data", "dataset.json");
  const raw = await readFile(path, "utf-8");
  return JSON.parse(raw) as Dataset;
}
