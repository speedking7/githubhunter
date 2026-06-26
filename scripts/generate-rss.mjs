#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = resolve(__dirname, "../data/products.json");
const ISSUES_PATH = resolve(__dirname, "../data/issues.json");
const OUT_PATH = resolve(__dirname, "../feed.xml");
const SITE_URL = "https://githubhunter.example";

function escapeXml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function readJson(path) {
  return readFile(path, "utf8").then((raw) => JSON.parse(raw)).catch(() => null);
}

async function main() {
  const data = await readJson(DATA_PATH);
  if (!data?.products?.length) {
    console.warn("No products to build RSS from.");
    return;
  }
  const issues = await readJson(ISSUES_PATH);
  const issuesList = Array.isArray(issues?.issues) ? issues.issues : [];
  const buildDate = data.meta?.lastUpdated || new Date().toISOString();

  const items = data.products.map((p) => `    <item>
      <title>${escapeXml(p.repo)}</title>
      <link>${escapeXml(p.url)}</link>
      <guid>${escapeXml(p.url)}</guid>
      <pubDate>${new Date(buildDate).toUTCString()}</pubDate>
      <description>${escapeXml(p.descriptionZh || p.description || "")}</description>
      <category>${escapeXml((p.tags || []).join(", "))}</category>
    </item>`).join("\n");

  const archiveItems = issuesList.map((i) => {
    const link = `${SITE_URL}/${i.url.replace(/^\.\//, "")}`;
    return `    <item>
      <title>${escapeXml(i.title)}</title>
      <link>${escapeXml(link)}</link>
      <guid>${escapeXml(link)}</guid>
      <pubDate>${new Date(i.lastUpdated || buildDate).toUTCString()}</pubDate>
      <description>${escapeXml(i.title)}</description>
    </item>`;
  }).join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>GitHub 热门日报</title>
    <link>${SITE_URL}</link>
    <description>每天一份 GitHub Trending 中文精选</description>
    <language>zh-CN</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items}
${archiveItems}
  </channel>
</rss>
`;
  await writeFile(OUT_PATH, xml, "utf8");
  console.log(`Wrote ${data.products.length + issuesList.length} RSS items to ${OUT_PATH}`);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((e) => { console.error(e.message); process.exitCode = 1; });
}
