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
