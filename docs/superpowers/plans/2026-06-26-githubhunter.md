# GitHubHunter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a static "GitHub 每日热门项目" Chinese-curated site that mirrors `producthunter/ph-cn-picks`, scraping `github.com/trending?since=daily` daily, tagging+translating via LLM (keyword fallback), archiving per-day, and deploying via GitHub Pages.

**Architecture:** Pure static site (no build) + Node ESM scripts + GitHub Actions. `fetch-github-trending.mjs` scrapes trending HTML, parses it, calls LLM once per repo for `descriptionZh + tags` (keyword `classify()` fallback), writes `data/products.json` + per-day issue + index. Frontend ports ph's sidebar/calendar/archive/search/ranking/detail/saved UI with field/copy deltas.

**Tech Stack:** Node 22 ESM (`type: module`), vanilla HTML/CSS/JS, GitHub Actions, GitHub Pages. No dependencies. Optional `OPENAI_API_KEY` for translation+tagging.

## Global Constraints

- Node ESM, `"type": "module"` in `package.json`. No npm runtime dependencies (only `node --check`, `bash -n`, `python3 -m http.server`).
- All scripts at `scripts/*.mjs`; frontend at repo root (`index.html`, `script.js`, `styles.css`).
- Data model fields are FIXED (see spec section 5): `repo, description, descriptionZh, tags, language, starsToday, starsTotal, forks, url, rank, date, githubDate, lastUpdated`.
- Tag vocabulary is the controlled set in spec section 6 (keys of `TAG_KEYWORDS`); LLM may only emit keys from that set; unknown → `其他`.
- Timezone: UTC for both `--date` and `--issue-date` (GitHub trending refreshes at UTC 00:00). No `America/Los_Angeles` logic.
- No GitHub token required. `OPENAI_API_KEY` optional; when absent, `descriptionZh = "待翻译：" + description` and `tags = classify(description)`.
- `npm run check` must pass before any commit. Commits end with `Co-Authored-By: Claude <noreply@anthropic.com>`.
- Parser must be tested against `scripts/fixtures/trending-sample.html` (already exists, 3 articles: `simplex-chat/simplex-chat` starsToday 191 starsTotal 12029 forks 684 Haskell; `google-labs-code/design.md` starsToday 2319 starsTotal 20669 forks 1694 TypeScript; `commaai/openpilot` starsToday 67 starsTotal 61673 forks 11040 Python).

---

## File Structure

| File | Responsibility |
|---|---|
| `package.json` | scripts: `check`, `rss`, `serve`, `update:daily`; `"type":"module"` |
| `scripts/fetch-github-trending.mjs` | fetch HTML → parse → classify/tag+translate → map → archive → main |
| `scripts/fixtures/trending-sample.html` | fixed HTML for parser test (EXISTS) |
| `scripts/test-parser.mjs` | asserts `parseTrending` + `classify` against fixture |
| `scripts/generate-rss.mjs` | writes `feed.xml` from `data/products.json` + issues |
| `scripts/build-search-index.mjs` | writes `data/search-index.json` across issues |
| `scripts/verify-schedule.mjs` | date/window sanity checks (port from ph) |
| `scripts/run-daily.sh` | orchestrates fetch → rss → search-index |
| `index.html` / `script.js` / `styles.css` | frontend (port from ph with deltas) |
| `.github/workflows/update-github-trending-daily.yml` | daily cron + commit + deploy |
| `.github/workflows/deploy-pages.yml` | push-triggered pages deploy |
| `data/products.json`, `data/issues.json`, `data/issues/*.json`, `data/search-index.json` | data |
| `.gitignore`, `.env.example`, `.nojekyll`, `favicon.svg`, `README.md` | meta |

---

### Task 1: Scaffold project meta files

**Files:**
- Create: `package.json`, `.gitignore`, `.env.example`, `.nojekyll`, `favicon.svg`, `README.md`
- Create: `data/.gitkeep`

**Interfaces:**
- Produces: `package.json` with `check`/`serve`/`update:daily`/`rss` scripts used by later tasks and CI.

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "githubhunter",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "check": "node --check script.js && node --check scripts/fetch-github-trending.mjs && node --check scripts/generate-rss.mjs && node --check scripts/build-search-index.mjs && node --check scripts/verify-schedule.mjs && node --check scripts/test-parser.mjs && bash -n scripts/run-daily.sh && node scripts/verify-schedule.mjs && node scripts/test-parser.mjs",
    "rss": "node scripts/generate-rss.mjs",
    "serve": "python3 -m http.server 4177",
    "update:daily": "bash scripts/run-daily.sh"
  }
}
```

- [ ] **Step 2: Write `.gitignore`**

```
node_modules/
logs/
*.log
.env
local-server*.log
```

- [ ] **Step 3: Write `.env.example`**

```
# Optional: OpenAI-compatible key for Chinese translation + auto tagging.
# Without it, descriptions stay as "待翻译：..." and tags use keyword fallback.
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
OPENAI_BASE_URL=https://api.openai.com/v1
```

- [ ] **Step 4: Write `.nojekyll`** (empty file so GitHub Pages serves `data/` etc.)

- [ ] **Step 5: Write `favicon.svg`**

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="6" fill="#24292f"/>
  <path fill="#fff" d="M16 7a9 9 0 0 0-2.84 17.54c.45.08.61-.2.61-.43v-1.5c-2.5.54-3.03-1.2-3.03-1.2-.41-1.04-1-1.32-1-1.32-.82-.56.06-.55.06-.55.9.06 1.38.93 1.38.93.8 1.38 2.1.98 2.62.75.08-.58.31-.98.57-1.2-2-.23-4.1-1-4.1-4.45 0-.98.35-1.78.93-2.41-.1-.23-.4-1.14.09-2.38 0 0 .76-.24 2.5.92a8.6 8.6 0 0 1 4.52 0c1.74-1.16 2.5-.92 2.5-.92.49 1.24.18 2.15.09 2.38.58.63.93 1.43.93 2.41 0 3.46-2.1 4.22-4.11 4.44.32.28.6.83.6 1.67v2.48c0 .24.16.52.62.43A9 9 0 0 0 16 7Z"/>
</svg>
```

- [ ] **Step 6: Write `data/.gitkeep`** (empty) and a stub `README.md`**

```markdown
# GitHub 热门日报

每天一份 GitHub Trending 中文精选站。定时任务每天抓取 `github.com/trending?since=daily`，自动翻译描述并打项目类型标签。

## 本地预览

```bash
npm run check
npm run serve
```

打开 `http://localhost:4177/`。

## 每天自动更新

```bash
npm run update:daily
```

可选 `OPENAI_API_KEY` 用于中文翻译 + 自动标签；不配置则走关键词回退。

GitHub Actions 每天 UTC 02:07 自动抓取并部署到 Pages，无需 token。
```

- [ ] **Step 7: Commit**

```bash
git init -b main 2>/dev/null || true
git add package.json .gitignore .env.example .nojekyll favicon.svg data/.gitkeep README.md
git commit -m "chore: scaffold githubhunter project meta"
```

---

### Task 2: Parser + keyword classifier (TDD)

**Files:**
- Create: `scripts/fetch-github-trending.mjs` (only `parseTrending` + `classify` + `TAG_KEYWORDS` + helpers for now)
- Test: `scripts/test-parser.mjs`
- Fixture: `scripts/fixtures/trending-sample.html` (EXISTS — do not modify)

**Interfaces:**
- Produces:
  - `parseTrending(html: string): Array<{repo, description, language, starsToday, starsTotal, forks, url}>`
  - `classify(text: string): string[]` — subset of `TAG_KEYWORDS` keys
  - `TAG_KEYWORDS: Record<string, string[]>`

- [ ] **Step 1: Write failing test `scripts/test-parser.mjs`**

```js
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseTrending, classify, TAG_KEYWORDS } from "./fetch-github-trending.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = readFileSync(resolve(__dirname, "fixtures/trending-sample.html"), "utf8");

let failures = 0;
function assert(cond, msg) {
  if (!cond) { console.error(`FAIL: ${msg}`); failures += 1; }
}

const repos = parseTrending(fixture);
assert(repos.length === 3, `expected 3 repos, got ${repos.length}`);

const [r1, r2, r3] = repos;
assert(r1.repo === "simplex-chat/simplex-chat", `r1.repo=${r1.repo}`);
assert(r1.language === "Haskell", `r1.language=${r1.language}`);
assert(r1.starsToday === 191, `r1.starsToday=${r1.starsToday}`);
assert(r1.starsTotal === 12029, `r1.starsTotal=${r1.starsTotal}`);
assert(r1.forks === 684, `r1.forks=${r1.forks}`);
assert(r1.url === "https://github.com/simplex-chat/simplex-chat", `r1.url=${r1.url}`);
assert(r1.description.includes("SimpleX"), `r1.desc=${r1.description}`);

assert(r2.repo === "google-labs-code/design.md", `r2.repo=${r2.repo}`);
assert(r2.starsToday === 2319, `r2.starsToday=${r2.starsToday}`);
assert(r2.starsTotal === 20669, `r2.starsTotal=${r2.starsTotal}`);

assert(r3.repo === "commaai/openpilot", `r3.repo=${r3.repo}`);
assert(r3.starsTotal === 61673, `r3.starsTotal=${r3.starsTotal}`);
assert(r3.forks === 11040, `r3.forks=${r3.forks}`);

// classify: keyword fallback must hit known buckets
const tags = classify("An MCP agent runtime with long-term memory and RAG for LLM agents");
assert(tags.includes("AI代理"), `tags=${tags.join(",")}`);
assert(tags.includes("记忆管理"), `tags=${tags.join(",")}`);
assert(tags.includes("harness") || tags.includes("RAG"), `tags=${tags.join(",")}`);

// unknown text → empty (caller decides whether to add 其他)
assert(classify("zzz qqq nonsense").length === 0, "nonsense should yield no tags");

// every classify result is a key of TAG_KEYWORDS
for (const t of tags) assert(Object.prototype.hasOwnProperty.call(TAG_KEYWORDS, t), `unknown tag ${t}`);

if (failures) { console.error(`${failures} test(s) failed`); process.exit(1); }
console.log("parser tests passed");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/test-parser.mjs`
Expected: FAIL (module not found / parseTrending not exported).

- [ ] **Step 3: Implement `parseTrending`, `classify`, `TAG_KEYWORDS` in `scripts/fetch-github-trending.mjs`**

```js
#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const TRENDING_URL = "https://github.com/trending?since=daily";
const ISSUE_TIMEZONE = "UTC";
const DEFAULT_LIMIT = 50;
const TAG_KEYWORDS = {
  "开发框架": ["framework", "sdk", "library", "boilerplate", "starter", "engine"],
  "SDK/库": ["package", "client", "wrapper", "binding"],
  "AI代理": ["agent", "agentic", "assistant", "copilot", "mcp"],
  "RAG": ["rag", "retrieval", "embedding", "knowledge base"],
  "记忆管理": ["memory", "long-term memory", "remember", "mem0"],
  "skills": ["skill", "skills"],
  "harness": ["harness", "runtime", "sandbox", "executor"],
  "向量数据库": ["vector db", "vector database", "chroma", "pinecone", "qdrant", "milvus", "weaviate"],
  "模型/LLM": ["llm", "language model", "inference", "fine-tune", "training", "transformer"],
  "评估": ["benchmark", "eval", "evaluation"],
  "开发者工具": ["cli", "devtool", "tooling", "toolkit"],
  "DevOps": ["deploy", "ci/cd", "kubernetes", "docker", "infra", "terraform"],
  "数据库": ["database", "sql", "postgres", "mysql", "redis", "sqlite"],
  "可观测性": ["observability", "monitoring", "logging", "tracing", "telemetry"],
  "安全": ["security", "vulnerability", "auth", "encryption"],
  "可视化": ["chart", "dashboard", "visualization", "plot", "graph"],
  "UI组件": ["component", "ui kit", "design system", "react component"],
  "自动化": ["automation", "workflow", "bot", "pipeline"],
  "编辑器插件": ["vscode", "neovim", "jetbrains", "extension", "plugin"],
  "学习资源": ["tutorial", "learn", "course", "awesome", "guide"],
};

function toNumber(value) {
  return Number(String(value || "0").replace(/[^\d]/g, "")) || 0;
}

function stripTags(value) {
  return String(value || "").replace(/<[^>]*>/g, "").trim();
}

export function parseTrending(html) {
  const articles = [...html.matchAll(/<article class="Box-row">([\s\S]*?)<\/article>/g)];
  return articles.map((match) => {
    const block = match[1];
    const href = block.match(/<h2[\s\S]*?<a[^>]*href="([^"]+)"/)?.[1] || "";
    const repo = href.replace(/^\//, "").trim();
    const description = stripTags(block.match(/<p class="col-9[^"]*"[^>]*>([\s\S]*?)<\/p>/)?.[1] || "");
    const language = (block.match(/itemprop="programmingLanguage">([^<]+)</)?.[1] || "").trim();
    const starsToday = toNumber(block.match(/([\d,]+)\s+stars\s+(today|this week|this month)/)?.[1]);
    const nums = [...block.matchAll(/>\s*([\d,]+)\s*</g)].map((m) => toNumber(m[1]));
    const starsTotal = nums[0] || 0;
    const forks = nums[1] || 0;
    const url = repo ? `https://github.com/${repo}` : "";
    return { repo, description, language, starsToday, starsTotal, forks, url };
  }).filter((item) => item.repo);
}

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

export function classify(text) {
  const value = normalize(text);
  if (!value) return [];
  const buckets = Object.entries(TAG_KEYWORDS)
    .filter(([, keywords]) => keywords.some((k) => value.includes(k) || k.includes(value)))
    .map(([bucket]) => bucket);
  return [...new Set(buckets)];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node scripts/test-parser.mjs`
Expected: `parser tests passed`

- [ ] **Step 5: Commit**

```bash
git add scripts/fetch-github-trending.mjs scripts/test-parser.mjs scripts/fixtures/trending-sample.html
git commit -m "feat: trending HTML parser + keyword classifier with tests"
```

---

### Task 3: LLM tag+translate (with fallback)

**Files:**
- Modify: `scripts/fetch-github-trending.mjs` — add `tagAndTranslate`, `translateWithOpenAI`

**Interfaces:**
- Produces: `tagAndTranslate(parsed): Promise<{descriptionZh, tags}>` — uses LLM if `OPENAI_API_KEY` set, else keyword fallback.

- [ ] **Step 1: Append to `scripts/fetch-github-trending.mjs`**

```js
const ALLOWED_TAGS = Object.keys(TAG_KEYWORDS);

function cleanTranslation(text) {
  return String(text || "")
    .replace(/^描述[:：][^\n]*\n+/i, "")
    .replace(/^译文[:：]\s*/i, "")
    .trim();
}

async function tagAndTranslateWithOpenAI(description, repo) {
  const baseUrl = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const system = [
    "你是 GitHub 项目编辑。给定仓库描述，做两件事：",
    `1) 翻译成自然、克制、准确的简体中文，保留仓库名、技术名词、专有名词，不加主观评价。`,
    `2) 从受控词表里挑 1-3 个最贴合的项目类型标签。词表：${ALLOWED_TAGS.join(" / ")}。`,
    "只输出 JSON，格式 {\"descriptionZh\":\"...\",\"tags\":[\"...\"]}，不要任何额外文字。",
  ].join("\n");
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: `仓库：${repo}\n描述：${description}` },
      ],
    }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`OpenAI failed HTTP ${response.status}: ${JSON.stringify(data)}`);
  const raw = data?.choices?.[0]?.message?.content || "";
  let parsed;
  try { parsed = JSON.parse(raw); } catch { parsed = {}; }
  const descriptionZh = cleanTranslation(parsed.descriptionZh || "");
  let tags = Array.isArray(parsed.tags) ? parsed.tags : [];
  tags = tags.filter((t) => ALLOWED_TAGS.includes(t)).slice(0, 3);
  if (tags.length === 0) tags = classify(description);
  return { descriptionZh: descriptionZh || `待翻译：${description}`, tags };
}

export async function tagAndTranslate(parsed) {
  const description = parsed.description || parsed.repo || "";
  if (process.env.OPENAI_API_KEY) {
    try {
      return await tagAndTranslateWithOpenAI(description, parsed.repo);
    } catch (error) {
      console.warn(`[tagAndTranslate] ${parsed.repo}: ${error.message}`);
    }
  }
  return {
    descriptionZh: description ? `待翻译：${description}` : "",
    tags: classify(description),
  };
}
```

- [ ] **Step 2: Syntax check**

Run: `node --check scripts/fetch-github-trending.mjs`
Expected: no output (success)

- [ ] **Step 3: Commit**

```bash
git add scripts/fetch-github-trending.mjs
git commit -m "feat: LLM tag+translate with keyword fallback"
```

---

### Task 4: Fetch, map, archive, main

**Files:**
- Modify: `scripts/fetch-github-trending.mjs` — add fetch/archive/main + CLI

**Interfaces:**
- Produces: CLI `node scripts/fetch-github-trending.mjs [--date YYYY-MM-DD] [--issue-date YYYY-MM-DD] [--skip-existing]`; writes `data/products.json`, `data/issues/<date>.json`, updates `data/issues.json`.

- [ ] **Step 1: Append the rest of `scripts/fetch-github-trending.mjs`**

```js
const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUT = resolve(__dirname, "../data/products.json");
const DEFAULT_ISSUES_DIR = resolve(__dirname, "../data/issues");
const DEFAULT_ISSUES_INDEX = resolve(__dirname, "../data/issues.json");

function parseArgs(argv) {
  const today = new Date().toISOString().slice(0, 10);
  const args = { date: today, issueDate: today, out: DEFAULT_OUT, issuesDir: DEFAULT_ISSUES_DIR, issuesIndex: DEFAULT_ISSUES_INDEX, skipExisting: false };
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (item === "--date") args.date = argv[i + 1];
    if (item === "--issue-date") args.issueDate = argv[i + 1];
    if (item === "--out") args.out = resolve(argv[i + 1]);
    if (item === "--issues-dir") args.issuesDir = resolve(argv[i + 1]);
    if (item === "--issues-index") args.issuesIndex = resolve(argv[i + 1]);
    if (item === "--skip-existing") args.skipExisting = true;
  }
  for (const key of ["date", "issueDate"]) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(args[key])) throw new Error(`Invalid ${key}: ${args[key]}`);
  }
  return args;
}

async function fetchTrendingHtml() {
  const response = await fetch(TRENDING_URL, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; githubhunter/0.1)", Accept: "text/html" },
  });
  if (!response.ok) throw new Error(`GitHub trending fetch failed: HTTP ${response.status}`);
  return response.text();
}

async function mapRepo(parsed, index, date, lastUpdated) {
  const { descriptionZh, tags } = await tagAndTranslate(parsed);
  return {
    repo: parsed.repo,
    description: parsed.description,
    descriptionZh,
    tags: tags.length ? tags : ["其他"],
    language: parsed.language,
    starsToday: parsed.starsToday,
    starsTotal: parsed.starsTotal,
    forks: parsed.forks,
    url: parsed.url,
    rank: index + 1,
    date,
    githubDate: date,
    lastUpdated,
  };
}

async function readPreviousData(path) {
  try { return JSON.parse(await readFile(path, "utf8")); } catch { return null; }
}

async function writeData(path, data) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function createIssueEntry(data) {
  const date = data.meta?.date;
  return {
    date,
    day: String(date || "").slice(-2),
    title: `GitHub 热门日报 · ${(data.products || []).length} 个项目`,
    url: `./data/issues/${date}.json`,
    productsCount: (data.products || []).length,
    lastUpdated: data.meta?.lastUpdated || null,
    status: data.meta?.status || null,
  };
}

async function updateIssuesIndex(path, entry) {
  const previous = await readPreviousData(path);
  const issues = Array.isArray(previous?.issues) ? previous.issues : [];
  const next = [entry, ...issues.filter((i) => i.date !== entry.date)].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  await writeData(path, { latest: next[0]?.date || entry.date, issues: next });
}

async function writeIssueArchive({ out, issuesDir, issuesIndex, data }) {
  await writeData(out, data);
  await writeData(resolve(issuesDir, `${data.meta.date}.json`), data);
  await updateIssuesIndex(issuesIndex, createIssueEntry(data));
}

export async function runFetch(args) {
  const previous = await readPreviousData(args.out);
  const existing = await readPreviousData(resolve(args.issuesDir, `${args.issueDate}.json`));
  if (args.skipExisting && existing?.meta?.date === args.issueDate && existing?.meta?.status === "live") {
    console.log(`Issue ${args.issueDate} already exists. Skipping.`);
    return;
  }
  const lastUpdated = new Date().toISOString();
  let html;
  try { html = await fetchTrendingHtml(); }
  catch (error) {
    const fallback = previous || { products: [] };
    await writeIssueArchive({ out: args.out, issuesDir: args.issuesDir, issuesIndex: args.issuesIndex, data: { ...fallback, meta: { ...(fallback.meta || {}), date: args.issueDate, githubDate: args.date, lastUpdated, status: "fallback", error: error.message } } });
    console.warn(`Fetch failed, preserved previous data with fallback status: ${error.message}`);
    return;
  }
  const parsed = parseTrending(html);
  if (parsed.length === 0) {
    const fallback = previous || { products: [] };
    await writeIssueArchive({ out: args.out, issuesDir: args.issuesDir, issuesIndex: args.issuesIndex, data: { ...fallback, meta: { ...(fallback.meta || {}), date: args.issueDate, githubDate: args.date, lastUpdated, status: "fallback", error: "Parsed 0 repos; trending HTML structure may have changed." } } });
    console.warn("Parsed 0 repos. Previous data preserved with fallback status.");
    return;
  }
  const products = [];
  for (let i = 0; i < parsed.length && i < DEFAULT_LIMIT; i += 1) {
    products.push(await mapRepo(parsed[i], i, args.issueDate, lastUpdated));
  }
  const data = {
    meta: {
      date: args.issueDate,
      githubDate: args.date,
      lastUpdated,
      status: "live",
      source: "github-trending-html",
      timezone: ISSUE_TIMEZONE,
      issues: [{ day: args.issueDate.slice(-2), title: `GitHub 热门日报 · ${products.length} 个项目` }],
    },
    products,
  };
  await writeIssueArchive({ out: args.out, issuesDir: args.issuesDir, issuesIndex: args.issuesIndex, data });
  console.log(`Wrote ${products.length} repos for ${args.issueDate} to ${args.out}`);
}

function isDirectRun() {
  return process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isDirectRun()) {
  runFetch(parseArgs(process.argv.slice(2))).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
```

- [ ] **Step 2: Syntax check**

Run: `node --check scripts/fetch-github-trending.mjs`
Expected: no output.

- [ ] **Step 3: Live smoke test (no LLM key) — verify it writes real data**

Run: `node scripts/fetch-github-trending.mjs`
Expected: `Wrote <N> repos for <today> to .../data/products.json`; `data/products.json` and `data/issues/<today>.json` exist with `status: "live"` and `descriptionZh` starting with `待翻译：`.

- [ ] **Step 4: Verify skip-existing works**

Run: `node scripts/fetch-github-trending.mjs --skip-existing`
Expected: `Issue <today> already exists. Skipping.`

- [ ] **Step 5: Commit**

```bash
git add scripts/fetch-github-trending.mjs data/products.json data/issues.json data/issues/
git commit -m "feat: fetch+archive trending daily with fallback handling"
```

---

### Task 5: RSS generator

**Files:**
- Create: `scripts/generate-rss.mjs`

**Interfaces:**
- Consumes: `data/products.json`, `data/issues.json`
- Produces: `feed.xml`

- [ ] **Step 1: Write `scripts/generate-rss.mjs`**

```js
#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = resolve(__dirname, "../data/products.json");
const ISSUES_PATH = resolve(__dirname, "../data/issues.json");
const OUT_PATH = resolve(__dirname, "../feed.xml");

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
  const siteUrl = "https://githubhunter.example";
  const items = data.products.map((p) => `    <item>
      <title>${escapeXml(p.repo)}</title>
      <link>${escapeXml(p.url)}</link>
      <guid>${escapeXml(p.url)}</guid>
      <pubDate>${new Date(data.meta?.lastUpdated || Date.now()).toUTCString()}</pubDate>
      <description>${escapeXml(p.descriptionZh || p.description || "")}</description>
      <category>${escapeXml((p.tags || []).join(", "))}</category>
    </item>`).join("\n");

  const archiveItems = issuesList.map((i) => `    <item>
      <title>${escapeXml(i.title)}</title>
      <link>${siteUrl}/${i.url.replace(/^\.\//, "")}</link>
      <guid>${siteUrl}/${i.url.replace(/^\.\//, "")}</guid>
      <pubDate>${new Date(i.lastUpdated || data.meta?.lastUpdated || Date.now()).toUTCString()}</pubDate>
      <description>${escapeXml(i.title)}</description>
    </item>`).join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>GitHub 热门日报</title>
    <link>${siteUrl}</link>
    <description>每天一份 GitHub Trending 中文精选</description>
    <language>zh-CN</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items}
${archiveItems}
  </channel>
</rss>
`;
  await writeFile(OUT_PATH, xml, "utf8");
  console.log(`Wrote ${data.products.length + (issuesList.length)} RSS items to ${OUT_PATH}`);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((e) => { console.error(e.message); process.exitCode = 1; });
}
```

- [ ] **Step 2: Run it**

Run: `node scripts/generate-rss.mjs`
Expected: `Wrote <N> RSS items to .../feed.xml`; `feed.xml` is valid XML.

- [ ] **Step 3: Commit**

```bash
git add scripts/generate-rss.mjs feed.xml
git commit -m "feat: RSS feed generator"
```

---

### Task 6: Search index + schedule verify + run-daily orchestrator

**Files:**
- Create: `scripts/build-search-index.mjs`, `scripts/verify-schedule.mjs`, `scripts/run-daily.sh`

**Interfaces:**
- `build-search-index.mjs` writes `data/search-index.json` as `[{repo, description, descriptionZh, tags, date, url}]` across all `data/issues/*.json`.
- `verify-schedule.mjs` asserts date/window helpers and exits 0.

- [ ] **Step 1: Write `scripts/build-search-index.mjs`**

```js
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
  const index = [];
  for (const file of files.sort()) {
    if (!file.endsWith(".json")) continue;
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
  console.log(`Wrote ${index.length} search entries across ${files.filter(f=>f.endsWith(".json")).length} issues to ${OUT_PATH}`);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((e) => { console.error(e.message); process.exitCode = 1; });
}
```

- [ ] **Step 2: Write `scripts/verify-schedule.mjs`**

```js
#!/usr/bin/env node

import { parseArgs } from "./fetch-github-trending.mjs";

let failures = 0;
function assert(cond, msg) { if (!cond) { console.error(`FAIL: ${msg}`); failures += 1; } }

const args = parseArgs(["--date", "2026-06-26", "--issue-date", "2026-06-26"]);
assert(args.date === "2026-06-26", `date=${args.date}`);
assert(args.issueDate === "2026-06-26", `issueDate=${args.issueDate}`);
assert(args.skipExisting === false, "skipExisting default false");

try { parseArgs(["--date", "bad"]); assert(false, "bad date should throw"); }
catch { assert(true, "bad date throws"); }

if (failures) { console.error(`${failures} schedule test(s) failed`); process.exit(1); }
console.log("schedule tests passed");
```

- [ ] **Step 3: Write `scripts/run-daily.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

NODE_BIN="${NODE_BIN:-node}"
LOG_DIR="${LOG_DIR:-./logs}"
mkdir -p "$LOG_DIR"

"$NODE_BIN" scripts/fetch-github-trending.mjs --skip-existing "$@" 2>&1 | tee -a "$LOG_DIR/github-trending-daily.log"
"$NODE_BIN" scripts/generate-rss.mjs 2>&1 | tee -a "$LOG_DIR/github-trending-daily.log"
"$NODE_BIN" scripts/build-search-index.mjs 2>&1 | tee -a "$LOG_DIR/github-trending-daily.log"
```

- [ ] **Step 4: Run all three**

Run: `node scripts/build-search-index.mjs && node scripts/verify-schedule.mjs && bash -n scripts/run-daily.sh`
Expected: search-index written; `schedule tests passed`; no shell syntax errors.

- [ ] **Step 5: Commit**

```bash
git add scripts/build-search-index.mjs scripts/verify-schedule.mjs scripts/run-daily.sh data/search-index.json
git commit -m "feat: search index, schedule verify, daily orchestrator"
```

---

### Task 7: Frontend (port ph with deltas)

**Files:**
- Create: `index.html`, `script.js`, `styles.css`
- Source to port: `C:\projects\producthunter\ph-cn-picks\{index.html,script.js,styles.css}`

**Deltas from ph (apply all):**
- Copy/brand: `产品灵感日报 → GitHub 热门日报`; `PH/CN → GH/CN`; `Product Inspiration Daily → GitHub Trending Daily`; hero `Product Hunt热榜 / 寻找产品灵感 → GitHub 热榜 / 发现每日热门项目`; sidebar copy rewritten to GitHub trending framing; `PH` link icon → link to `https://github.com/trending`.
- Field renames in `script.js`: `p.name → p.repo`; `p.tagline → p.description`; `p.summaryZh` removed (use `p.descriptionZh`); `p.productHuntUrl/p.websiteUrl → p.url`; `p.votes → p.starsToday`; `p.comments → p.starsTotal`; `p.buckets → p.tags`; `p.topics → [p.language]` (display only); `ph-cn-saved → gh-daily-saved`.
- Filter chips (`#topic-filters`): replace `全部/AI/开发/效率/设计/收藏` with `全部 / 开发框架 / AI代理 / 记忆管理 / skills / harness / RAG / 开发者工具 / 模型/LLM / 收藏`. `data-topic` attr → `data-tag`. `topicLabel` map → `tagLabel` (identity, since tags are already Chinese).
- `productMatches(p)`: filter by `p.tags.includes(state.tag)` instead of `buckets`.
- Row template render: rank, repo name, descriptionZh, stars-today (`↑ N today`), stars-total, forks, language chip, tags chips. Thumbnail removed (GitHub trending has no image) — replace `<img>` cell with a rank/initial block.
- Detail panel (`#feature-detail`): show repo (link to `p.url`), descriptionZh, tags, language, starsToday/starsTotal/forks, "收藏本项" button, external link to `github.com`.
- `productId(p) = p.repo` (was name/slug).
- `phUrl`/`siteUrl` helpers → both return `p.url`.
- External links in sidebar/top: `https://www.producthunt.com/` → `https://github.com/trending`.
- `formatChineseDate`: keep but timezone `Asia/Shanghai` is fine for display; data date is UTC `YYYY-MM-DD`.
- `volumeNumber`/`Vol.` framing: keep, recompute from issue index.

- [ ] **Step 1: Copy ph's three files into githubhunter root as the starting point**

```bash
cp "C:/projects/producthunter/ph-cn-picks/index.html" "C:/projects/githubhunter/index.html"
cp "C:/projects/producthunter/ph-cn-picks/script.js" "C:/projects/githubhunter/script.js"
cp "C:/projects/producthunter/ph-cn-picks/styles.css" "C:/projects/githubhunter/styles.css"
```

- [ ] **Step 2: Apply the deltas above to `index.html`** (copy, hero, filter chips `data-tag`, link targets). Verify with `grep -n "producthunt\|Product Hunt\|ph-cn\|data-topic\|tagline" index.html` → expect only innocuous mentions or none.

- [ ] **Step 3: Apply the deltas above to `script.js`** (field renames, tag filtering, row/detail render, productId, saved key, link helpers). Verify no `p.votes`/`p.buckets`/`p.name`/`ph-cn-saved` remain: `grep -nE "p\.(votes|comments|buckets|tagline|summaryZh|name|productHuntUrl|websiteUrl)|ph-cn-saved|data-topic|topicLabel" script.js` → expect empty.

- [ ] **Step 4: `styles.css`** — leave as-is (ph's styles are generic); only remove the product-thumb `<img>` styling dependency if the row no longer renders an image (optional; CSS for a missing element is harmless, so skip unless layout breaks).

- [ ] **Step 5: Syntax check + serve preview**

Run: `node --check script.js && npm run serve` (then open `http://localhost:4177/`)
Expected: page loads, calendar shows today's issue, ranking list renders today's repos, tag filter works, detail panel populates, search works.

- [ ] **Step 6: Commit**

```bash
git add index.html script.js styles.css
git commit -m "feat: frontend ported from ph with GitHub trending deltas"
```

---

### Task 8: GitHub Actions workflows

**Files:**
- Create: `.github/workflows/update-github-trending-daily.yml`, `.github/workflows/deploy-pages.yml`

- [ ] **Step 1: Write `update-github-trending-daily.yml`**

```yaml
name: Update GitHub Trending Daily

on:
  schedule:
    - cron: "7 2 * * *"
    - cron: "7 3 * * *"
    - cron: "7 4 * * *"
  workflow_dispatch:

permissions:
  contents: write
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  update-and-deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - name: Check scripts
        run: npm run check
      - name: Fetch GitHub trending daily
        run: npm run update:daily
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          OPENAI_MODEL: ${{ vars.OPENAI_MODEL }}
          OPENAI_BASE_URL: ${{ vars.OPENAI_BASE_URL }}
      - name: Commit updated data
        run: |
          git config user.name "gh-trending-bot"
          git config user.email "gh-trending-bot@example.com"
          git add data/products.json data/issues.json data/issues feed.xml data/search-index.json
          git commit -m "Update GitHub trending daily picks" || exit 0
          git push
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: "."
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: Write `deploy-pages.yml`**

```yaml
name: Deploy Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: "."
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/
git commit -m "ci: daily update + pages deploy workflows"
```

---

### Task 9: Finalize README + full check

**Files:**
- Modify: `README.md` (expand the stub from Task 1 with full deploy instructions mirroring ph's README)

- [ ] **Step 1: Rewrite `README.md`** mirroring `ph-cn-picks/README.md` structure but for GitHub trending: local preview, `npm run update:daily`, GitHub Actions schedule (UTC 02:07/03:07/04:07 = same UTC), optional `OPENAI_API_KEY` secret, GitHub Pages source = GitHub Actions, manual `Run workflow` note, Vercel/Cloudflare note, `--date`/`--issue-date` manual override (UTC).

- [ ] **Step 2: Run full check**

Run: `npm run check`
Expected: all `node --check` pass, `bash -n` pass, `schedule tests passed`, `parser tests passed`.

- [ ] **Step 3: Local preview smoke**

Run: `npm run serve` → open `http://localhost:4177/` → confirm today's issue renders with real repos, tag filters, search, detail panel, saved.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: full README mirroring ph-cn-picks"
```

---

## Self-Review

**Spec coverage:** spec §3 directory → Tasks 1-9 cover every file. §4.1 fetch-github-trending.mjs → Tasks 2-4. §4.2 rss/search → Tasks 5-6. §4.3 frontend → Task 7. §5 data model → Task 4 (mapRepo). §6 tag vocab → Task 2 (TAG_KEYWORDS) + Task 3 (LLM). §7 data flow → Task 8 workflow + run-daily Task 6. §8 error handling → Task 4 (fetch/parse fallback, LLM fallback in Task 3). §9 testing → Tasks 2,6 + `npm run check` Task 1. §10 deploy → Task 8. §11 deltas → Task 7. All covered.

**Placeholder scan:** no TBD/TODO; every code step has real code; test assertions reference real fixture values.

**Type consistency:** `parseTrending` return fields match `mapRepo` consumers; `tagAndTranslate` returns `{descriptionZh, tags}` consumed by `mapRepo`; `parseArgs` shape used identically in `verify-schedule.mjs`. Field names (`repo`, `starsToday`, `starsTotal`, `forks`, `tags`, `descriptionZh`, `url`) consistent across data model, RSS, search-index, and frontend deltas.
