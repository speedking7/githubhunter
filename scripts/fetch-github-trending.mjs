#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const TRENDING_URL = "https://github.com/trending?since=daily";
const ISSUE_TIMEZONE = "UTC";
const DEFAULT_LIMIT = 50;
export const TAG_KEYWORDS = {
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
    "1) 翻译成自然、克制、准确的简体中文，保留仓库名、技术名词、专有名词，不加主观评价。",
    `2) 从受控词表里挑 1-3 个最贴合的项目类型标签。词表：${ALLOWED_TAGS.join(" / ")}。`,
    '只输出 JSON，格式 {"descriptionZh":"...","tags":["..."]}，不要任何额外文字。',
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

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUT = resolve(__dirname, "../data/products.json");
const DEFAULT_ISSUES_DIR = resolve(__dirname, "../data/issues");
const DEFAULT_ISSUES_INDEX = resolve(__dirname, "../data/issues.json");

export function parseArgs(argv) {
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
