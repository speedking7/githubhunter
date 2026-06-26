# GitHubHunter 设计文档

> 一个"GitHub 每日最热门项目"中文精选站，忠实复刻 `producthunter/ph-cn-picks` 的架构与模式。
> 静态站点 + Node 脚本 + GitHub Actions 定时抓取部署，无构建步骤。

## 1. 目标与定位

- **目标**：每天抓取 GitHub Trending（daily、全部语言）榜单，为每个仓库生成中文描述和"项目用途"类型标签，归档成日报并在静态站点上展示。
- **参照项目**：`C:\projects\producthunter\ph-cn-picks`（Product Hunt 中文精选站）。本项目的目录结构、脚本职责、前端骨架、CI/部署模式均与之对齐。
- **非目标**：不做 trending developers；不做 weekly/monthly（预留扩展空间，首版不实现）；不按编程语言筛选（用户明确表示不关心语言）。

## 2. 关键决策

| 决策点 | 选择 | 理由 |
|---|---|---|
| 数据来源 | 直接 `fetch` 抓 `https://github.com/trending?since=daily` HTML，容错解析 | GitHub Trending 无官方 API；此法口径与官方榜单一致、无需 token、与 ph"抓取→归档"模式契合 |
| 抓取范围 | daily + 全部语言，单页约 25 个仓库作为当日一期 | 最贴合"每天最热门项目"；抓取轻、数据干净 |
| 标签生成 | LLM 在翻译 description 的同一次调用里从受控词表挑 1-3 个类型标签；无 `OPENAI_API_KEY` 时回退关键词 `classify()` | 标签准确、复用 ph"翻译+fallback"模式、几乎不增成本 |
| 筛选维度 | 前端用 tags 做 chip（对标 ph 的 topic chip），不做语言筛选 | 用户要"项目用途"标签，不关心语言 |
| 技术栈 | 静态站（HTML/CSS/JS，无构建）+ Node ESM 脚本 + GitHub Actions + GitHub Pages | 与 ph 完全一致 |

## 3. 目录结构

```
githubhunter/
├─ index.html
├─ script.js
├─ styles.css
├─ favicon.svg
├─ data/
│  ├─ products.json            # 当前期（最新日报）
│  ├─ issues.json              # 期索引
│  ├─ issues/YYYY-MM-DD.json   # 每期归档
│  └─ search-index.json        # 跨期全局搜索索引
├─ feed.xml
├─ scripts/
│  ├─ fetch-github-trending.mjs   # 抓取 + 解析 + 翻译 + 打标签 + 归档
│  ├─ generate-rss.mjs
│  ├─ build-search-index.mjs
│  ├─ verify-schedule.mjs
│  ├─ run-daily.sh
│  └─ fixtures/
│     └─ trending-sample.html     # 解析单测用的固定 HTML 样本
├─ .github/workflows/
│  ├─ update-github-trending-daily.yml
│  └─ deploy-pages.yml
├─ .nojekyll
├─ .env.example
├─ .gitignore
├─ README.md
└─ package.json
```

## 4. 组件职责

### 4.1 `fetch-github-trending.mjs`（对标 `fetch-producthunt.mjs`）

单脚本包揽：抓取 → 解析 → 翻译+打标签 → 归档。导出关键函数便于单测。

- `fetchTrendingHtml()` — `fetch("https://github.com/trending?since=daily")`，返回 HTML 字符串。
- `parseTrending(html)` — 容错解析，返回 `[{ repo, description, language, starsToday, starsTotal, forks, url }]`。HTML 结构变了只改这一处。
- `classify(text)` — 关键词回退打标签，返回受控词表内的标签数组。
- `tagAndTranslate(repo)` — 若有 `OPENAI_API_KEY`，一次 LLM 调用同时返回 `descriptionZh + tags`；否则 `descriptionZh = "待翻译：…"`、`tags = classify(description)`。
- `mapRepo(parsed, index, date, lastUpdated)` — 组装数据模型。
- `writeIssueArchive(...)` / `updateIssuesIndex(...)` — 同 ph，写 `products.json` + 当期 issue + 更新 `issues.json`。
- `main()` — 参数解析（`--date` / `--issue-date` / `--skip-existing` 等，同 ph）、抓取、映射、归档。

**时间口径**：GitHub Trending daily 在 UTC 0 点刷新。`--date` 默认取 UTC 当天；`--issue-date` 默认同 `--date`（不再像 ph 那样跨时区取下一天，因为 GitHub 用 UTC）。

### 4.2 `generate-rss.mjs` / `build-search-index.mjs`

直接搬 ph 对应脚本，改字段名（`name→repo`、`votes→starsToday`、`buckets→tags` 等）。

### 4.3 前端 `index.html` / `script.js` / `styles.css`

搬 ph 骨架：左侧栏（简介 + 日历 + 当期卡 + 归档列表 + 外链）、主区（hero + 搜索/筛选条 + 榜单列表 + 详情面板 + 关于条）、footer、product-row template。

改动点：
- 文案：`产品灵感日报 → GitHub 热门日报`、`PH/CN → GH/CN` 等。
- 筛选 chip：`全部 / 开发框架 / AI代理 / 记忆管理 / skills / harness / … / 收藏`（对标 ph 的 topic chip）。
- 详情面板字段：`votes/comments → starsToday / starsTotal / forks / language`；外链按钮指向 `github.com/owner/name`。
- 数据源：`DATA_URL = ./data/products.json`、`ISSUES_URL = ./data/issues.json`、`SEARCH_INDEX_URL = ./data/search-index.json`（同 ph）。
- localStorage key：`gh-daily-saved`（对标 ph 的 `ph-cn-saved`）。

## 5. 数据模型

### 当前期 `products.json`
```jsonc
{
  "meta": {
    "date": "2026-06-26",
    "githubDate": "2026-06-26",
    "lastUpdated": "2026-06-26T02:07:00.000Z",
    "status": "live",                      // live | fallback
    "source": "github-trending-html",
    "timezone": "UTC",
    "issues": [{ "day": "26", "title": "GitHub 热门日报 · 25 个项目" }]
  },
  "products": [
    {
      "repo": "owner/name",
      "description": "原英文描述",
      "descriptionZh": "中文译文",
      "tags": ["开发框架", "AI代理"],
      "language": "TypeScript",
      "starsToday": 340,
      "starsTotal": 12500,
      "forks": 210,
      "url": "https://github.com/owner/name",
      "rank": 1,
      "date": "2026-06-26",
      "githubDate": "2026-06-26",
      "lastUpdated": "2026-06-26T02:07:00.000Z"
    }
  ]
}
```

### 期索引 `issues.json`
```jsonc
{
  "latest": "2026-06-26",
  "issues": [
    { "date": "2026-06-26", "day": "26", "title": "GitHub 热门日报 · 25 个项目",
      "url": "./data/issues/2026-06-26.json", "productsCount": 25,
      "lastUpdated": "...", "status": "live" }
  ]
}
```

## 6. 受控标签词表

LLM 从中挑 1-3 个；关键词回退 `classify()` 用同一份语义做包含匹配。

```
开发框架   SDK/库        AI代理       RAG
记忆管理   向量数据库    skills       harness/runtime
开发者工具 CLI           DevOps       数据库
模型/LLM   评估          可观测性     安全
可视化     UI组件        自动化       编辑器插件
学习资源   其他
```

关键词回退表（节选，完整版见实现）：
```js
const TAG_KEYWORDS = {
  "开发框架": ["framework", "sdk", "library", "boilerplate", "starter"],
  "AI代理": ["agent", "agentic", "assistant", "copilot", "mcp"],
  "记忆管理": ["memory", "long-term memory", "remember"],
  "RAG": ["rag", "retrieval", "embedding", "knowledge base"],
  "skills": ["skill", "skills"],
  "harness": ["harness", "runtime", "sandbox", "executor"],
  "向量数据库": ["vector db", "vector database", "chroma", "pinecone", "qdrant", "milvus"],
  "模型/LLM": ["llm", "model", "inference", "fine-tune", "training"],
  "开发者工具": ["cli", "devtool", "tooling"],
  "DevOps": ["deploy", "ci/cd", "kubernetes", "docker", "infra"],
  "数据库": ["database", "sql", "postgres", "redis"],
  "可观测性": ["observability", "monitoring", "logging", "trace"],
  "安全": ["security", "vulnerability", "auth"],
  "可视化": ["chart", "dashboard", "visualization", "plot"],
  "UI组件": ["component", "ui kit", "design system"],
  "自动化": ["automation", "workflow", "bot"],
  "编辑器插件": ["vscode", "neovim", "jetbrains", "extension"],
  "学习资源": ["tutorial", "learn", "course", "awesome"],
};
```

LLM 提示词约束：从受控词表键中挑 1-3 个、输出 JSON `{"descriptionZh": "...", "tags": ["..."]}`、保留专名、不加主观评价。

## 7. 数据流

```
GitHub Actions (每日 UTC 02:07 / 03:07 / 04:07 备份重试)
  → actions/checkout + setup-node 22
  → npm run check
  → npm run update:daily  (run-daily.sh)
       → fetch-github-trending.mjs --skip-existing   # 抓取+解析+翻译+打标签+归档
       → generate-rss.mjs
       → build-search-index.mjs
  → git commit data/products.json data/issues.json data/issues/ feed.xml search-index.json
  → configure-pages + upload-pages-artifact + deploy-pages
```

GitHub Trending daily 在 UTC 0 点刷新，UTC 02:07 触发即拿到当天新鲜榜（北京 10:07）。

## 8. 错误处理（对标 ph fallback 模式）

- **抓取失败 / 解析 0 条**：保留旧 `products.json`，写 `meta.status: "fallback"`，不覆盖归档（同 ph）。
- **HTML 结构变导致解析异常**：`parseTrending` 抛错并标日志；`run-daily.sh` 后续步骤退化用旧数据生成 RSS/搜索索引。解析层有单测，改版时一眼能发现。
- **LLM 翻译/打标签失败**：`descriptionZh` 回退 `待翻译：…`，`tags` 回退 `classify(description)`（同 ph 的 try/catch + warn）。
- **`--skip-existing` 命中已生成当期**：直接跳过（同 ph）。

## 9. 测试（对标 ph 的 `npm run check`）

`package.json` 的 `check` 脚本：
```json
"check": "node --check script.js && node --check scripts/fetch-github-trending.mjs && node --check scripts/generate-rss.mjs && node --check scripts/build-search-index.mjs && node --check scripts/verify-schedule.mjs && bash -n scripts/run-daily.sh && node scripts/verify-schedule.mjs && node scripts/test-parser.mjs"
```

- `node --check` 全部脚本语法检查。
- `scripts/test-parser.mjs`（新增）：用 `fixtures/trending-sample.html` 断言解析条数、首条 `repo/starsToday/starsTotal` 正确。
- `classify` 关键词回退：典型 description 断言标签。
- `verify-schedule.mjs`：时间窗/日期格式校验（搬 ph）。

## 10. 部署

- GitHub Actions 两条 workflow（对标 ph）：
  - `update-github-trending-daily.yml`：定时 + 手动，抓数据 + 提交 + 部署 Pages。
  - `deploy-pages.yml`：push 到 main 或手动触发时只部署页面。
- `Settings → Pages → Source = GitHub Actions`。
- 无需任何 Secret（trending HTML 无需 token）。`OPENAI_API_KEY` 为可选 Secret，用于翻译+打标签；不配则走关键词回退 + `待翻译`。

## 11. 与 ph 的差异速查

| 维度 | ph | githubhunter |
|---|---|---|
| 数据来源 | Product Hunt GraphQL API（需 token） | GitHub Trending HTML 抓取（无需 token） |
| 时间口径 | America/Los_Angeles，issue 取次日 | UTC，issue 同日 |
| 分类维度 | topic 桶（ai/developer/productivity/design） | 受控标签词表（开发框架/skills/记忆管理/harness…），LLM+关键词回退 |
| 筛选 chip | topic | tags |
| 详情字段 | votes / comments | starsToday / starsTotal / forks / language |
| 外链 | producthunt.com | github.com |
| 必需 Secret | `PRODUCTHUNT_TOKEN` | 无（`OPENAI_API_KEY` 可选） |

## 12. 实现顺序（供 writing-plans 细化）

1. 脚手架：`package.json`、目录、`.gitignore`、`.env.example`、`.nojekyll`、`favicon.svg`、空 `data/`。
2. `fetch-github-trending.mjs`：抓取 + `parseTrending` + `classify` + `tagAndTranslate` + 归档 + main。
3. `fixtures/trending-sample.html` + `test-parser.mjs`：解析单测。
4. `generate-rss.mjs` / `build-search-index.mjs` / `verify-schedule.mjs` / `run-daily.sh`。
5. 前端 `index.html` / `script.js` / `styles.css`：从 ph 改写。
6. GitHub Actions 两条 workflow。
7. `README.md`、`npm run check` 跑通、本地 `npm run serve` 预览。
