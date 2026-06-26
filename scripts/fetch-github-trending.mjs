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
