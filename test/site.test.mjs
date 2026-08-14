import assert from "node:assert/strict";
import { access, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const data = JSON.parse(await readFile(path.join(root, "data.json"), "utf8"));
const sites = [...data.sites].sort((a, b) => Number(a.rank) - Number(b.rank));
const expectedPages = Math.ceil(sites.length / 50);
const origin = "https://zhongzhuanzhan.github.io";
const topics = [
  { slug: "gpt-zhongzhuanzhan", label: "GPT 中转站", terms: ["gpt", "openai", "chatgpt"] },
  { slug: "claude-zhongzhuanzhan", label: "Claude 中转站", terms: ["claude", "anthropic"] },
  { slug: "codex-zhongzhuanzhan", label: "Codex 中转站", terms: ["codex"] },
  { slug: "gemini-zhongzhuanzhan", label: "Gemini 中转站", terms: ["gemini"] },
  { slug: "glm-zhongzhuanzhan", label: "GLM 中转站", terms: ["glm", "智谱"] },
  { slug: "qwen-zhongzhuanzhan", label: "Qwen 中转站", terms: ["qwen", "通义", "千问"] },
  { slug: "kimi-zhongzhuanzhan", label: "Kimi 中转站", terms: ["kimi", "moonshot", "月之暗面"] },
];

async function pageHtml(page) {
  const file = page === 1 ? path.join(root, "index.html") : path.join(root, "page", String(page), "index.html");
  return readFile(file, "utf8");
}

async function topicHtml(slug) {
  return readFile(path.join(root, slug, "index.html"), "utf8");
}

function topicMatches(site, topic) {
  const searchable = [site.name, site.description, ...(Array.isArray(site.models) ? site.models : [])].join(" ").toLowerCase();
  return topic.terms.some((term) => searchable.includes(term.toLowerCase()));
}

function pageUrl(page) {
  return page === 1 ? `${origin}/` : `${origin}/page/${page}/`;
}

function pageSites(page) {
  return sites.slice((page - 1) * 50, page * 50);
}

function extractJsonLd(html) {
  const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(match, "JSON-LD should exist");
  return JSON.parse(match[1]);
}

function graphType(html, type) {
  return extractJsonLd(html)["@graph"].find((item) => item["@type"] === type);
}

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function zhNumber(value) {
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 1 }).format(value);
}

function uptime(value) {
  return `${zhNumber(value)}%`;
}

function latency(value) {
  return value >= 1000 ? `${zhNumber(value / 1000)} 秒` : `${Math.round(value)} 毫秒`;
}

function expectedObjectiveSummary(site) {
  const parts = [`综合排名第 ${Number(site.rank)}`];
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(site.establishedDate || ""))) parts.push(`成立日期 ${site.establishedDate}`);
  if (finite(site.uptime) !== null) parts.push(`在线率 ${uptime(Number(site.uptime))}`);
  if (finite(site.latencyMs) !== null) parts.push(`平均延迟 ${latency(Number(site.latencyMs))}`);
  const models = Array.isArray(site.models) ? site.models.filter(Boolean) : [];
  const modelCount = Math.max(0, Math.round(finite(site.modelCount) ?? models.length));
  parts.push(`收录模型 ${modelCount} 个`);
  if (finite(site.userRating) !== null && Number(site.ratingCount) > 0) {
    parts.push(`用户评分 ${zhNumber(Number(site.userRating))}/5（${Math.round(Number(site.ratingCount))} 条评价）`);
  }
  if (typeof site.supportsRefund === "boolean") parts.push(`退款政策：${site.supportsRefund ? "支持" : "不支持"}`);
  if (typeof site.supportsInvoice === "boolean") parts.push(`发票政策：${site.supportsInvoice ? "支持" : "不支持"}`);
  return `${parts.join("；")}。`;
}

test("build generates the expected static pages", async () => {
  const directories = (await readdir(path.join(root, "page"), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && /^\d+$/.test(entry.name));
  assert.equal(directories.length, expectedPages - 1);
  await access(path.join(root, "page", String(expectedPages), "index.html"));
  for (const topic of topics) await access(path.join(root, topic.slug, "index.html"));
});

test("model topic pages have unique metadata, content and structured data", async () => {
  const titles = new Set();
  const descriptions = new Set();
  const canonicals = new Set();
  const homepage = await pageHtml(1);
  for (const topic of topics) {
    const html = await topicHtml(topic.slug);
    const canonical = `${origin}/${topic.slug}/`;
    const matches = sites.filter((site) => topicMatches(site, topic));
    const title = html.match(/<title>([^<]+)<\/title>/)?.[1];
    const description = html.match(/<meta name="description" content="([^"]+)"/)?.[1];
    assert.ok(title && description);
    assert.ok(html.includes(`<link rel="canonical" href="${canonical}"`));
    assert.ok(html.includes(`<h1>${topic.label}`));
    assert.ok(html.includes('class="topic-overview"'));
    assert.ok(html.includes('class="topic-focus-grid"'));
    assert.ok(homepage.includes(`href="/${topic.slug}/"`));
    assert.equal((html.match(/<h1(?:\s|>)/g) || []).length, 1);
    const cards = (html.match(/<article class="station-card"/g) || []).length;
    assert.equal(cards, Math.min(matches.length, 50));
    assert.ok(cards > 0);
    const json = extractJsonLd(html);
    const itemList = json["@graph"].find((entry) => entry["@type"] === "ItemList");
    const faq = json["@graph"].find((entry) => entry["@type"] === "FAQPage");
    const breadcrumb = json["@graph"].find((entry) => entry["@type"] === "BreadcrumbList");
    assert.equal(itemList.numberOfItems, matches.length);
    assert.equal(itemList.itemListElement.length, cards);
    assert.equal(faq.mainEntity.length, 4);
    assert.equal(breadcrumb.itemListElement.length, 2);
    assert.equal(breadcrumb.itemListElement.at(-1).item, canonical);
    titles.add(title); descriptions.add(description); canonicals.add(canonical);
  }
  assert.equal(titles.size, topics.length);
  assert.equal(descriptions.size, topics.length);
  assert.equal(canonicals.size, topics.length);
});

test("every page contains no more than 50 unique station cards", async () => {
  const ranks = [];
  for (let page = 1; page <= expectedPages; page += 1) {
    const html = await pageHtml(page);
    const pageRanks = [...html.matchAll(/<article class="station-card" id="rank-(\d+)"/g)].map((match) => Number(match[1]));
    assert.ok(pageRanks.length > 0 && pageRanks.length <= 50, `page ${page} card count`);
    ranks.push(...pageRanks);
  }
  assert.equal(ranks.length, sites.length);
  assert.equal(new Set(ranks).size, sites.length);
  assert.deepEqual(ranks, sites.map((site) => Number(site.rank)));
});

test("each page shows independently computed statistics with sample sizes", async () => {
  const analyses = new Set();
  for (let page = 1; page <= expectedPages; page += 1) {
    const current = pageSites(page);
    const html = await pageHtml(page);
    const block = html.match(/<section class="page-analysis"[\s\S]*?<\/section>/)?.[0];
    assert.ok(block, `page ${page} analysis`);
    const total = current.length;
    const uptimes = current.map((site) => finite(site.uptime)).filter((value) => value !== null);
    const latencies = current.map((site) => finite(site.latencyMs)).filter((value) => value !== null);
    const ratings = current
      .filter((site) => Number(site.ratingCount) > 0)
      .map((site) => finite(site.userRating)).filter((value) => value !== null);
    const medianUptime = median(uptimes);
    const medianLatency = median(latencies);
    assert.ok(block.includes(`样本 ${uptimes.length}/${total}`));
    assert.ok(block.includes(`样本 ${latencies.length}/${total}`));
    assert.ok(block.includes(`样本 ${ratings.length}/${total}`));
    assert.ok(block.includes(medianUptime === null ? "暂无可计算值" : uptime(medianUptime)));
    assert.ok(block.includes(medianLatency === null ? "暂无可计算值" : latency(medianLatency)));
    analyses.add(block.replace(/<[^>]+>/g, " "));
  }
  assert.equal(analyses.size, expectedPages, "page analyses should be unique");
});

test("metadata, ItemList and objective summaries are page specific", async () => {
  for (let page = 1; page <= expectedPages; page += 1) {
    const current = pageSites(page);
    const html = await pageHtml(page);
    const canonical = pageUrl(page);
    assert.ok(html.includes(`<link rel="canonical" href="${canonical}"`));
    const itemList = graphType(html, "ItemList");
    assert.equal(itemList.numberOfItems, sites.length);
    assert.equal(itemList.itemListElement.length, current.length);
    itemList.itemListElement.forEach((entry, index) => {
      const source = current[index];
      assert.equal(entry["@type"], "ListItem");
      assert.equal(entry.position, Number(source.rank));
      assert.equal(entry.item["@type"], "Service");
      assert.equal(entry.item.name, source.name);
      assert.equal(entry.item.url, source.url.endsWith("/") ? source.url : `${source.url}/`);
      assert.equal(entry.item.description, expectedObjectiveSummary(source));
      if (source.description) assert.notEqual(entry.item.description, source.description);
    });
  }
});

test("head pagination relationships are correct", async () => {
  for (let page = 1; page <= expectedPages; page += 1) {
    const html = await pageHtml(page);
    const prev = [...html.matchAll(/<link rel="prev" href="([^"]+)"/g)].map((match) => match[1]);
    const next = [...html.matchAll(/<link rel="next" href="([^"]+)"/g)].map((match) => match[1]);
    assert.deepEqual(prev, page > 1 ? [pageUrl(page - 1)] : []);
    assert.deepEqual(next, page < expectedPages ? [pageUrl(page + 1)] : []);
    assert.doesNotMatch(html, /\/page\/1\//);
  }
});

test("visible and structured breadcrumbs match each canonical", async () => {
  for (let page = 1; page <= expectedPages; page += 1) {
    const html = await pageHtml(page);
    const visible = html.match(/<nav class="breadcrumbs" aria-label="面包屑">([\s\S]*?)<\/nav>/)?.[1];
    assert.ok(visible);
    assert.ok(visible.includes("中转站推荐榜"));
    assert.ok(visible.includes('aria-current="page"'));
    if (page > 1) assert.ok(visible.includes(`第 ${page} 页`));
    const breadcrumb = graphType(html, "BreadcrumbList");
    assert.equal(breadcrumb.itemListElement.length, page === 1 ? 1 : 2);
    assert.deepEqual(breadcrumb.itemListElement.map((item) => item.position), page === 1 ? [1] : [1, 2]);
    assert.equal(breadcrumb.itemListElement.at(-1).item, pageUrl(page));
    const collection = graphType(html, "CollectionPage");
    assert.equal(collection.breadcrumb["@id"], `${pageUrl(page)}#breadcrumb`);
  }
});

test("titles, descriptions, canonicals and primary headings are unique", async () => {
  const titles = new Set();
  const descriptions = new Set();
  const canonicals = new Set();
  for (let page = 1; page <= expectedPages; page += 1) {
    const html = await pageHtml(page);
    const title = html.match(/<title>([^<]+)<\/title>/)?.[1];
    const description = html.match(/<meta name="description" content="([^"]+)"/)?.[1];
    const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
    assert.ok(title && description && canonical);
    assert.equal((html.match(/<h1(?:\s|>)/g) || []).length, 1);
    assert.ok(html.match(/<h1[^>]*>[\s\S]*?<\/h1>/)?.[0].replace(/<[^>]+>/g, "").trim());
    titles.add(title); descriptions.add(description); canonicals.add(canonical);
  }
  assert.equal(titles.size, expectedPages);
  assert.equal(descriptions.size, expectedPages);
  assert.equal(canonicals.size, expectedPages);
});

test("full descriptions are static and external links go to hvoy pages", async () => {
  const firstWithDescription = sites.find((site) => site.description);
  const owningPage = Math.ceil(Number(firstWithDescription.rank) / 50);
  const html = await pageHtml(owningPage);
  const escapedOpening = firstWithDescription.description.slice(0, 25)
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  assert.ok(html.includes(escapedOpening));
  assert.ok(html.includes('<details class="site-intro">'));
  for (const match of html.matchAll(/class="detail-link" href="([^"]+)"[^>]*rel="([^"]+)"[^>]*referrerpolicy="([^"]+)"/g)) {
    assert.match(match[1], /^https:\/\/(?:www\.)?(?:hvoy\.ai|hvoyai\.com)\/sites\//);
    assert.equal(match[2], "nofollow noopener");
    assert.equal(match[3], "origin");
  }
  assert.doesNotMatch(html, /rel="[^"]*noreferrer/);
  assert.doesNotMatch(html, /href="(?:\.\.\/)*sites\//);
});

test("generated pages stay minified and use a valid minified stylesheet", async () => {
  const sourceCss = await readFile(path.join(root, "assets", "styles.css"), "utf8");
  const minifiedCss = await readFile(path.join(root, "assets", "styles.min.css"), "utf8");
  assert.ok(minifiedCss.length < sourceCss.length);
  assert.ok(minifiedCss.includes("@media (max-width:680px)"));
  assert.ok(minifiedCss.includes(".page-analysis"));
  assert.doesNotMatch(minifiedCss, /\/\*/);
  assert.doesNotMatch(minifiedCss, /\n\s*\n/);
  for (let page = 1; page <= expectedPages; page += 1) {
    const html = await pageHtml(page);
    assert.ok(html.includes("assets/styles.min.css"));
    assert.doesNotMatch(html, /\n\s*\n/);
    assert.doesNotThrow(() => extractJsonLd(html));
  }
  for (const topic of topics) {
    const html = await topicHtml(topic.slug);
    assert.ok(html.includes("assets/styles.min.css"));
    assert.doesNotMatch(html, /\n\s*\n/);
    assert.doesNotThrow(() => extractJsonLd(html));
  }
  assert.ok((await stat(path.join(root, "assets", "styles.min.css"))).size > 0);
});

test("visible generated pages do not explain internal data provenance", async () => {
  const forbidden = /ownVerify|awesome-ai-api|raw\.githubusercontent|数据来源于|数据来自于/i;
  for (let page = 1; page <= expectedPages; page += 1) {
    assert.doesNotMatch(await pageHtml(page), forbidden);
  }
  for (const topic of topics) assert.doesNotMatch(await topicHtml(topic.slug), forbidden);
});

test("homepage includes detailed selection, pricing and FAQ guidance", async () => {
  const html = await pageHtml(1);
  assert.ok(html.includes('id="pricing"'));
  assert.ok(html.includes("官方标价折算用量 × 平台币换算系数 × 用户倍率"));
  assert.ok(html.includes("5 × 1 × 0.1 = 0.5 元"));
  assert.ok(html.includes("5 × 7 × 0.1 = 3.5 元"));
  assert.ok(html.includes("官方按量 API 或合规代理"));
  assert.ok(html.includes("订阅账号池"));
  assert.ok(html.includes("第三方产品适配"));
  assert.equal((html.match(/<details class="faq-item">/g) || []).length, 12);
  const faq = graphType(html, "FAQPage");
  assert.equal(faq.mainEntity.length, 12);
  faq.mainEntity.forEach((entry) => {
    assert.equal(entry["@type"], "Question");
    assert.ok(entry.name.length > 5);
    assert.equal(entry.acceptedAnswer["@type"], "Answer");
    assert.ok(entry.acceptedAnswer.text.length > 80);
  });
});

test("sitemap, robots, resources and 404 remain coherent", async () => {
  const sitemap = await readFile(path.join(root, "sitemap.xml"), "utf8");
  const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  const canonicals = [];
  for (let page = 1; page <= expectedPages; page += 1) {
    const html = await pageHtml(page);
    canonicals.push(html.match(/<link rel="canonical" href="([^"]+)"/)?.[1]);
    await access(page === 1 ? path.join(root, "index.html") : path.join(root, "page", String(page), "index.html"));
  }
  for (const topic of topics) {
    const html = await topicHtml(topic.slug);
    canonicals.push(html.match(/<link rel="canonical" href="([^"]+)"/)?.[1]);
    await access(path.join(root, topic.slug, "index.html"));
  }
  assert.deepEqual(locations, canonicals);
  assert.ok(locations.every((url) => !url.includes("/sites/") && !url.includes("/page/1/")));
  const robots = await readFile(path.join(root, "robots.txt"), "utf8");
  assert.ok(robots.includes(`${origin}/sitemap.xml`));
  const notFound = await readFile(path.join(root, "404.html"), "utf8");
  assert.match(notFound, /name="robots" content="noindex, follow"/);
  assert.ok(notFound.includes("/assets/styles.min.css"));
  await access(path.join(root, "assets", "favicon.svg"));
  await access(path.join(root, "assets", "og-image.svg"));
});
