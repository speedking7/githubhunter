#!/usr/bin/env node

import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ISSUES_DIR = resolve(__dirname, "../data/issues");
const OUT_PATH = resolve(__dirname, "../data/search-index.json");

async function main() {
  let files = [];
  try { files = await readdir(ISSUES_DIR); } catch { files = []; }
  const jsonFiles = files.filter((f) => f.endsWith(".json"));
  const index = [];
  for (const file of jsonFiles.sort()) {
    let data;
    try { data = JSON.parse(await readFile(resolve(ISSUES_DIR, file), "utf8")); }
    catch { continue; }
    const date = data.meta?.date || file.replace(/\.json$/, "");
    for (const p of data.products || []) {
      index.push({
        repo: p.repo,
        description: p.description,
        descriptionZh: p.descriptionZh,
        tags: p.tags || [],
        date,
        url: p.url,
      });
    }
  }
  await writeFile(OUT_PATH, `${JSON.stringify(index, null, 2)}\n`, "utf8");
  console.log(`Wrote ${index.length} search entries across ${jsonFiles.length} issues to ${OUT_PATH}`);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((e) => { console.error(e.message); process.exitCode = 1; });
}
