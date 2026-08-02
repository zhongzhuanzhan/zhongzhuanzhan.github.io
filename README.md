# 中转站推荐榜

面向 GitHub Pages 的原生静态 HTML 网站。构建器将排行榜快照生成为每页 50 条的可索引分页，无需前端框架或客户端渲染。

## 本地构建

```bash
npm run build
```

同步最新数据并重新生成：

```bash
npm run sync
```

运行检查：

```bash
npm test
```

## 生成内容

- `index.html`：榜单第 1 页及完整选择指南
- `page/*/index.html`：后续静态分页
- `*-zhongzhuanzhan/index.html`：GPT、Claude、Codex、Gemini、GLM、Qwen、Kimi 模型专题页
- `sitemap.xml`：构建时按实际分页更新
- `data.json`：站点数据快照

GitHub Pages 需设置为从 `main` 分支根目录发布。`.github/workflows/update-site.yml` 每天自动同步两次，并在内容变化时提交生成产物。
