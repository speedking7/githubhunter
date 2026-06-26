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
