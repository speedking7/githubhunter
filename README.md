# GitHub 热门日报

静态版 GitHub Trending 中文精选站。页面读取 `data/products.json`，定时任务每天抓取一次 `github.com/trending?since=daily`，自动翻译描述并按用途打项目类型标签。

## 本地预览

```bash
npm run check
npm run serve
```

打开 `http://localhost:4177/`。

> `npm run serve` 默认用 `python3 -m http.server`。若本机没有 python3，可用任意静态服务器，例如 `npx serve .` 或 `node` 起一个简易服务器。

## 每天自动更新

GitHub Trending 的 daily 榜在 UTC 0 点刷新。脚本默认抓取当天榜单，适合每天 UTC 02:00 后运行（北京时间 10:00 后）。无需任何 token。

## 推到 GitHub

本目录已经可以作为独立仓库使用。创建 GitHub 空仓库后，在本地执行：

```bash
git remote add origin https://github.com/<owner>/<repo>.git
git push -u origin main
```

然后在 GitHub 仓库里配置：

1. `Settings -> Pages -> Build and deployment -> Source` 选择 `GitHub Actions`
2. `Actions -> Update GitHub Trending Daily -> Run workflow` 手动试跑一次

试跑成功后，工作流会每天 UTC 02:07 / 03:07 / 04:07 自动抓取 Trending、更新 `data/products.json` 并部署页面。

### 可选：中文翻译 + 自动标签

抓取脚本默认用关键词规则给仓库打类型标签，描述保留为 `待翻译：…`。配置 `OPENAI_API_KEY` 后，每个仓库会在一次 LLM 调用里同时完成中文翻译和受控词表标签：

进入 `Settings -> Secrets and variables -> Actions -> New repository secret`，新增：

```text
OPENAI_API_KEY
```

可选在 `Settings -> Secrets and variables -> Actions -> Variables` 新增：

```text
OPENAI_MODEL=gpt-4o-mini
OPENAI_BASE_URL=https://api.openai.com/v1
```

DeepSeek 配置示例：

```text
OPENAI_API_KEY=你的 DeepSeek API Key
OPENAI_MODEL=deepseek-chat
OPENAI_BASE_URL=https://api.deepseek.com
```

没有配置 `OPENAI_API_KEY`，或翻译接口报错时，脚本会保留 `待翻译：…` fallback 并用关键词规则打标签。

### 本地或 VPS

```bash
cd /path/to/githubhunter
npm run update:daily
```

cron 示例（每天北京时间 10:07 运行）：

```cron
7 2 * * * cd /path/to/githubhunter && npm run update:daily
```

### GitHub Actions

`.github/workflows/update-github-trending-daily.yml` 会每天 UTC 02:07、03:07、04:07 尝试运行。当天日报已经生成后，后续备份触发会自动跳过（`--skip-existing`）。

### GitHub Pages 部署

仓库推到 GitHub 后，到 `Settings -> Pages -> Build and deployment` 里选择 `GitHub Actions`。

有两条发布路径：

- `update-github-trending-daily.yml`：每天 UTC 02:07 更新数据，并在 03:07、04:07 备用重试；同一次任务里部署页面。
- `deploy-pages.yml`：普通 push 到 `main` 或手动触发时部署页面，适合改样式、改文案后发布。

如果用 Vercel 或 Cloudflare Pages，发布根目录就是这个项目目录，不需要构建命令。

### 手动指定日期

```bash
node scripts/fetch-github-trending.mjs --date 2026-06-26 --issue-date 2026-06-26
```

`--date` 与 `--issue-date` 均按 UTC 理解（GitHub Trending 以 UTC 刷新）。不传则默认取 UTC 当天。

## 项目类型标签

标签从受控词表里取，覆盖 AI 开发工具生态：开发框架、SDK/库、AI代理、RAG、记忆管理、skills、harness、向量数据库、模型/LLM、评估、开发者工具、DevOps、数据库、可观测性、安全、可视化、UI组件、自动化、编辑器插件、学习资源、其他。配 `OPENAI_API_KEY` 时由 LLM 选 1-3 个，否则用关键词规则回退。
