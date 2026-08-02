import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_PATH = path.join(ROOT, "data.json");
const PAGE_ROOT = path.join(ROOT, "page");
const STYLES_PATH = path.join(ROOT, "assets", "styles.css");
const MINIFIED_STYLES_PATH = path.join(ROOT, "assets", "styles.min.css");
const SOURCE_URL = process.env.DATA_SOURCE_URL
  || "https://raw.githubusercontent.com/hvoyai/awesome-ai-api/main/data.json";
const ORIGIN = "https://zhongzhuanzhan.github.io";
const PAGE_SIZE = 50;
const SHOULD_SYNC = process.argv.includes("--sync");
const number = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 1 });

const FAQ = [
  ["AI 中转站和官方 API 有什么区别？", "官方 API 的请求直接进入模型厂商，中转站则在应用和模型厂商之间提供接口转发、统一鉴权与余额结算。中转站通常更容易支付，也能用一个密钥接入多种模型，但稳定性、隐私和服务连续性还会受到第三方平台影响。"],
  ["选择 AI API 中转站先看什么？", "先看多时段可用性和延迟波动，再核对目标模型、接口协议、工具调用、流式输出和账单明细。价格不应是唯一标准；正式使用前应以真实任务小额测试，并确认客服、退款和故障通知渠道。"],
  ["为什么不建议一次充值很多？", "中转服务会受到上游线路、模型政策、经营状况和价格调整影响。余额通常不具备与银行存款相同的保障，因此更稳妥的方式是按近期用量充值，保留替代服务，并避免在请求中传输不必要的敏感信息。"],
  ["榜单排名靠前就一定适合我吗？", "不一定。综合排名无法替代具体场景测试。编程工具更关注长任务稳定性、缓存和工具调用；图片或长文档任务还要测试上传大小、超时和多模态兼容性。应先确定自己的核心模型与调用方式，再结合指标缩小范围。"],
  ["如何判断计费是否清楚？", "完成一次可复算的小额调用，检查输入、输出、缓存、模型倍率、分组倍率和最终扣费是否分别记录。只显示余额变化而缺少请求明细时，很难发现模型映射、缓存失效或异常扣费。"],
];

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeBoolean(value) {
  return value === true ? true : value === false ? false : null;
}

function normalizeDate(value) {
  const text = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return "";
  const date = new Date(`${text}T00:00:00Z`);
  return Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== text ? "" : text;
}

function normalizeSite(site, index) {
  const models = Array.isArray(site.models) ? site.models.map(String).map((item) => item.trim()).filter(Boolean) : [];
  const payments = Array.isArray(site.paymentMethods)
    ? site.paymentMethods.map(String).map((item) => item.trim()).filter(Boolean)
    : [];
  return {
    rank: Math.max(1, Math.round(finite(site.rank) || index + 1)),
    name: String(site.name || "未命名站点").trim(),
    url: safeUrl(site.url),
    description: String(site.description || "").trim(),
    establishedDate: normalizeDate(site.establishedDate),
    modelCount: Math.max(0, Math.round(finite(site.modelCount) || models.length)),
    models: [...new Set(models)],
    uptime: finite(site.uptime),
    latencyMs: finite(site.latencyMs),
    userRating: finite(site.userRating),
    ratingCount: Math.max(0, Math.round(finite(site.ratingCount) || 0)),
    paymentMethods: [...new Set(payments)],
    supportsRefund: normalizeBoolean(site.supportsRefund),
    supportsInvoice: normalizeBoolean(site.supportsInvoice),
  };
}

function validatePayload(payload) {
  if (!payload || typeof payload !== "object" || !Array.isArray(payload.sites) || !payload.sites.length) {
    throw new Error("data.json 缺少非空 sites 数组");
  }
  payload.sites.forEach((site, index) => {
    if (!site || typeof site !== "object" || !String(site.name || "").trim()) {
      throw new Error(`第 ${index + 1} 条站点缺少名称`);
    }
    if (!safeUrl(site.url)) throw new Error(`第 ${index + 1} 条站点链接无效`);
  });
}

async function atomicWrite(target, content) {
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.tmp`;
  await writeFile(temporary, content, "utf8");
  await rename(temporary, target);
}

async function syncData() {
  const response = await fetch(SOURCE_URL, {
    headers: { "user-agent": "zhongzhuanzhan-static-builder/1.0" },
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`同步失败：HTTP ${response.status}`);
  const text = await response.text();
  const incoming = JSON.parse(text);
  validatePayload(incoming);
  try {
    const current = JSON.parse(await readFile(DATA_PATH, "utf8"));
    if (current.updatedDate && incoming.updatedDate && incoming.updatedDate < current.updatedDate) {
      throw new Error(`拒绝使用旧快照：${incoming.updatedDate} < ${current.updatedDate}`);
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  await atomicWrite(DATA_PATH, `${JSON.stringify(incoming, null, 2)}\n`);
}

function formatDate(value) {
  if (!value) return "暂未收录";
  const [year, month, day] = value.split("-").map(Number);
  return `${year} 年 ${month} 月 ${day} 日`;
}

function formatUptime(value) {
  return value === null ? "暂无" : `${number.format(value)}%`;
}

function formatLatency(value) {
  if (value === null) return "暂无";
  return value >= 1000 ? `${number.format(value / 1000)} 秒` : `${Math.round(value)} 毫秒`;
}

function status(value) {
  return value === true ? "支持" : value === false ? "不支持" : "待确认";
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function pageStats(sites) {
  const uptimes = [];
  const latencies = [];
  const modelCounts = [];
  const ratings = [];
  const summary = {
    total: sites.length,
    refund: { yes: 0, known: 0 },
    invoice: { yes: 0, known: 0 },
    descriptions: 0,
    established: 0,
    modelDetails: 0,
    paymentDetails: 0,
  };

  for (const site of sites) {
    if (site.uptime !== null) uptimes.push(site.uptime);
    if (site.latencyMs !== null) latencies.push(site.latencyMs);
    if (site.modelCount !== null) modelCounts.push(site.modelCount);
    if (site.userRating !== null && site.ratingCount > 0) ratings.push(site.userRating);
    if (site.supportsRefund !== null) {
      summary.refund.known += 1;
      if (site.supportsRefund) summary.refund.yes += 1;
    }
    if (site.supportsInvoice !== null) {
      summary.invoice.known += 1;
      if (site.supportsInvoice) summary.invoice.yes += 1;
    }
    if (site.description) summary.descriptions += 1;
    if (site.establishedDate) summary.established += 1;
    if (site.models.length) summary.modelDetails += 1;
    if (site.paymentMethods.length) summary.paymentDetails += 1;
  }

  return {
    ...summary,
    uptime: { value: median(uptimes), sample: uptimes.length },
    latency: { value: median(latencies), sample: latencies.length },
    modelCount: { value: median(modelCounts), sample: modelCounts.length },
    rating: { value: median(ratings), sample: ratings.length },
  };
}

function formatStat(value, formatter) {
  return value === null ? "暂无可计算值" : formatter(value);
}

function renderPageAnalysis(stats, first, last) {
  const summary = `排名 ${first}–${last} 的 ${stats.total} 家站点中，${stats.descriptions} 家收录了简介，${stats.established} 家收录了成立日期，${stats.modelDetails} 家提供模型厂商明细，${stats.paymentDetails} 家提供支付方式信息。退款政策已知 ${stats.refund.known} 家，其中 ${stats.refund.yes} 家明确支持；发票政策已知 ${stats.invoice.known} 家，其中 ${stats.invoice.yes} 家明确支持。`;
  return `<section class="page-analysis" aria-labelledby="page-analysis-title"><div class="page-analysis__head"><div><p>PAGE DATA / ${first}–${last}</p><h3 id="page-analysis-title">本页数据概览</h3></div><p>${escapeHtml(summary)}</p></div><dl class="analysis-grid"><div><dt>在线率中位数</dt><dd>${formatStat(stats.uptime.value, formatUptime)}</dd><small>样本 ${stats.uptime.sample}/${stats.total}</small></div><div><dt>延迟中位数</dt><dd>${formatStat(stats.latency.value, formatLatency)}</dd><small>样本 ${stats.latency.sample}/${stats.total}</small></div><div><dt>模型数量中位数</dt><dd>${formatStat(stats.modelCount.value, (value) => `${number.format(value)} 个`)}</dd><small>样本 ${stats.modelCount.sample}/${stats.total}</small></div><div><dt>用户评分中位数</dt><dd>${formatStat(stats.rating.value, (value) => `${number.format(value)} / 5`)}</dd><small>样本 ${stats.rating.sample}/${stats.total}</small></div></dl></section>`;
}

function objectiveSiteSummary(site) {
  const parts = [`综合排名第 ${site.rank}`];
  if (site.establishedDate) parts.push(`成立日期 ${site.establishedDate}`);
  if (site.uptime !== null) parts.push(`在线率 ${formatUptime(site.uptime)}`);
  if (site.latencyMs !== null) parts.push(`平均延迟 ${formatLatency(site.latencyMs)}`);
  parts.push(`收录模型 ${site.modelCount} 个`);
  if (site.userRating !== null && site.ratingCount > 0) {
    parts.push(`用户评分 ${number.format(site.userRating)}/5（${site.ratingCount} 条评价）`);
  }
  if (site.supportsRefund !== null) parts.push(`退款政策：${status(site.supportsRefund)}`);
  if (site.supportsInvoice !== null) parts.push(`发票政策：${status(site.supportsInvoice)}`);
  return `${parts.join("；")}。`;
}

function descriptionSummary(text, limit = 86) {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length > limit ? `${compact.slice(0, limit).trim()}…` : compact;
}

function paragraphs(text) {
  return text
    .split(/\n\s*\n|\n+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => `                    <p>${escapeHtml(part)}</p>`)
    .join("\n");
}

function renderTags(items, empty = "暂未注明") {
  if (!items.length) return `<span class="chip chip--quiet">${empty}</span>`;
  return items.map((item) => `<span class="chip">${escapeHtml(item)}</span>`).join("");
}

function renderSite(site) {
  const url = escapeHtml(site.url);
  const rating = site.userRating === null || site.ratingCount === 0
    ? "暂无评分"
    : `${number.format(site.userRating)} / 5 · ${site.ratingCount} 条评价`;
  const fullDescription = site.description
    ? `
                <p class="site-summary">${escapeHtml(descriptionSummary(site.description))}</p>
                <details class="site-intro">
                  <summary>展开完整站点简介</summary>
                  <div class="site-intro__body">
${paragraphs(site.description)}
                  </div>
                </details>`
    : "";

  return `            <article class="station-card" id="rank-${site.rank}" aria-labelledby="station-${site.rank}">
              <div class="station-card__head">
                <span class="rank-badge"><small>排名</small>${site.rank}</span>
                <div class="station-title">
                  <h2 id="station-${site.rank}"><a href="${url}" target="_blank" rel="nofollow noopener noreferrer">${escapeHtml(site.name)}</a></h2>
                  <p>成立日期：${escapeHtml(formatDate(site.establishedDate))}</p>
                </div>
              </div>
${fullDescription}
              <dl class="metric-grid">
                <div><dt>在线率</dt><dd>${formatUptime(site.uptime)}</dd></div>
                <div><dt>平均延迟</dt><dd>${formatLatency(site.latencyMs)}</dd></div>
                <div><dt>模型数量</dt><dd>${site.modelCount} 个</dd></div>
                <div><dt>用户评价</dt><dd>${escapeHtml(rating)}</dd></div>
              </dl>
              <div class="station-meta">
                <div><h3>模型厂商</h3><div class="chip-list">${renderTags(site.models)}</div></div>
                <div><h3>支付方式</h3><div class="chip-list">${renderTags(site.paymentMethods)}</div></div>
              </div>
              <div class="station-card__foot">
                <p><span>退款：${status(site.supportsRefund)}</span><span>发票：${status(site.supportsInvoice)}</span></p>
                <a class="detail-link" href="${url}" target="_blank" rel="nofollow noopener noreferrer" aria-label="查看 ${escapeHtml(site.name)} 的更多信息">查看站点信息 <span aria-hidden="true">↗</span></a>
              </div>
            </article>`;
}

function pagePath(page) {
  return page === 1 ? "/" : `/page/${page}/`;
}

function relativeRoot(page) {
  return page === 1 ? "." : "../..";
}

function pageRelations(page, totalPages) {
  return {
    previous: page > 1 ? `${ORIGIN}${pagePath(page - 1)}` : "",
    next: page < totalPages ? `${ORIGIN}${pagePath(page + 1)}` : "",
  };
}

function renderBreadcrumbs(page, root) {
  if (page === 1) {
    return '<nav class="breadcrumbs" aria-label="面包屑"><span aria-current="page">中转站推荐榜</span></nav>';
  }
  return `<nav class="breadcrumbs" aria-label="面包屑"><a href="${root}/">中转站推荐榜</a><span aria-hidden="true">/</span><span aria-current="page">第 ${page} 页</span></nav>`;
}

function renderPagination(current, total) {
  const pages = new Set([1, total]);
  for (let page = Math.max(1, current - 2); page <= Math.min(total, current + 2); page += 1) pages.add(page);
  const sorted = [...pages].sort((a, b) => a - b);
  const links = [];
  let previous = 0;
  for (const page of sorted) {
    if (page - previous > 1) links.push('<span class="page-gap" aria-hidden="true">…</span>');
    links.push(page === current
      ? `<span class="page-number is-current" aria-current="page">${page}</span>`
      : `<a class="page-number" href="${pagePath(page)}" aria-label="前往第 ${page} 页">${page}</a>`);
    previous = page;
  }
  return `<nav class="pagination" aria-label="榜单分页">
            ${current > 1 ? `<a class="page-step" href="${pagePath(current - 1)}">← 上一页</a>` : '<span class="page-step is-disabled">← 上一页</span>'}
            <div class="page-numbers">${links.join("")}</div>
            ${current < total ? `<a class="page-step" href="${pagePath(current + 1)}">下一页 →</a>` : '<span class="page-step is-disabled">下一页 →</span>'}
          </nav>`;
}

function homeGuide() {
  const faq = FAQ.map(([question, answer]) => `            <details class="faq-item">
              <summary>${escapeHtml(question)}</summary>
              <p>${escapeHtml(answer)}</p>
            </details>`).join("\n");
  return `      <section class="decision-guide" id="guide" aria-labelledby="guide-title">
        <div class="section-kicker">选择方法</div>
        <h2 id="guide-title">挑选 AI API 中转站，先排除不确定性</h2>
        <p class="section-lead">一个适合长期使用的中转站，不只要“能调用”。真正影响体验的是高峰期是否稳定、模型是否与标注一致、账单能否复算，以及出现问题时能否找到处理入口。</p>
        <div class="guide-grid">
          <article><span>01</span><h3>用真实任务测稳定性</h3><p>不要只发一句短对话。用平时的代码仓库、长文档或工具调用连续测试，在白天和晚高峰分别记录成功率、首字等待和完整响应时间。</p></article>
          <article><span>02</span><h3>核对模型与接口能力</h3><p>确认模型版本、上下文长度、流式输出和工具调用是否可用。名称相同不代表通道能力相同，关键任务要用固定测试集横向比较。</p></article>
          <article><span>03</span><h3>把每次扣费算清楚</h3><p>查看输入、输出、缓存与分组倍率是否分开记录。长对话和编程工具会频繁复用上下文，缓存价格和命中率往往比首页折扣更影响总成本。</p></article>
          <article><span>04</span><h3>检查运营与售后信息</h3><p>关注站点运行时间、公告、客服、退款与开票规则。发生线路波动时，及时、清楚的状态通知比一句“永久稳定”更有参考价值。</p></article>
        </div>
        <aside class="warning-box"><strong>先小额，再加量</strong><p>中转服务可能调价、更换上游或停止运营。用多少充多少，为关键业务保留备用接口，不在第三方服务中提交无必要的敏感数据。</p></aside>
      </section>

      <section class="test-section" id="checklist" aria-labelledby="test-title">
        <div>
          <div class="section-kicker">接入前测试</div>
          <h2 id="test-title">十分钟完成一次基础验收</h2>
        </div>
        <ol class="test-list">
          <li><strong>最低金额充值</strong><span>核对到账额度和换算规则。</span></li>
          <li><strong>调用常用模型</strong><span>验证版本、输出质量与关键能力。</span></li>
          <li><strong>复算一条账单</strong><span>检查 Token、缓存、倍率和扣费。</span></li>
          <li><strong>连续请求二十次</strong><span>观察失败率与延迟波动。</span></li>
          <li><strong>设置密钥限额</strong><span>降低泄露后的余额风险。</span></li>
        </ol>
      </section>

      <section class="faq-section" id="faq" aria-labelledby="faq-title">
        <div class="section-kicker">常见问题</div>
        <h2 id="faq-title">关于中转站选择的常见疑问</h2>
        <div class="faq-list">
${faq}
        </div>
      </section>`;
}

function renderStructuredData({ page, canonical, title, description, sites, totalSites, updatedDate }) {
  const graph = [];
  const breadcrumbId = `${canonical}#breadcrumb`;
  const breadcrumbItems = [
    { "@type": "ListItem", position: 1, name: "中转站推荐榜", item: `${ORIGIN}/` },
  ];
  if (page > 1) {
    breadcrumbItems.push({ "@type": "ListItem", position: 2, name: `第 ${page} 页`, item: canonical });
  }
  if (page === 1) {
    graph.push({
      "@type": "WebSite",
      "@id": `${ORIGIN}/#website`,
      url: `${ORIGIN}/`,
      name: "中转站推荐榜",
      description: "AI API 中转站排名、服务指标与选择指南。",
      inLanguage: "zh-CN",
    });
  }
  graph.push({
    "@type": "CollectionPage",
    "@id": `${canonical}#webpage`,
    url: canonical,
    name: title,
    description,
    inLanguage: "zh-CN",
    dateModified: updatedDate,
    isPartOf: { "@id": `${ORIGIN}/#website` },
    breadcrumb: { "@id": breadcrumbId },
    mainEntity: { "@id": `${canonical}#ranking` },
  });
  graph.push({
    "@type": "BreadcrumbList",
    "@id": breadcrumbId,
    itemListElement: breadcrumbItems,
  });
  graph.push({
    "@type": "ItemList",
    "@id": `${canonical}#ranking`,
    name: page === 1 ? "AI API 中转站推荐榜" : `AI API 中转站推荐榜第 ${page} 页`,
    numberOfItems: totalSites,
    itemListOrder: "https://schema.org/ItemListOrderAscending",
    itemListElement: sites.map((site) => ({
      "@type": "ListItem",
      position: site.rank,
      item: {
        "@type": "Service",
        name: site.name,
        url: site.url,
        description: objectiveSiteSummary(site),
      },
    })),
  });
  if (page === 1) {
    graph.push({
      "@type": "FAQPage",
      "@id": `${ORIGIN}/#faq`,
      mainEntity: FAQ.map(([question, answer]) => ({
        "@type": "Question",
        name: question,
        acceptedAnswer: { "@type": "Answer", text: answer },
      })),
    });
  }
  return JSON.stringify({ "@context": "https://schema.org", "@graph": graph }).replaceAll("<", "\\u003c");
}

function renderPage({ page, totalPages, sites, allSites, updatedDate }) {
  const root = relativeRoot(page);
  const canonical = `${ORIGIN}${pagePath(page)}`;
  const first = (page - 1) * PAGE_SIZE + 1;
  const last = first + sites.length - 1;
  const title = page === 1
    ? `中转站推荐榜｜${allSites.length} 家 AI API 中转站排名与选择指南`
    : `AI 中转站推荐榜第 ${page} 页｜排名 ${first}–${last}`;
  const description = page === 1
    ? `中转站推荐榜收录 ${allSites.length} 家 AI API 中转站，对比在线率、响应延迟、模型覆盖、支付方式、退款与发票信息，并提供稳定性、计费和安全选择指南。`
    : `中转站推荐榜第 ${page} 页，查看排名 ${first} 至 ${last} 的 AI API 中转站简介、成立日期、在线率、延迟、模型数量、用户评分和服务信息。`;
  const stats = pageStats(sites);
  const relations = pageRelations(page, totalPages);
  const jsonLd = renderStructuredData({ page, canonical, title, description, sites, totalSites: allSites.length, updatedDate });
  const hero = page === 1
    ? `<p class="eyebrow">AI API SERVICE INDEX · ${updatedDate.replaceAll("-", ".")}</p>
          <h1>找到更适合你的<br /><em>AI API 中转站</em></h1>
          <p class="hero-copy">从运行表现、模型覆盖、用户评价和服务政策出发，先比较，再用真实任务小额验证。</p>
          <div class="hero-actions"><a href="#ranking">浏览推荐榜</a><a href="#guide">阅读选择方法</a></div>`
    : `<p class="eyebrow">RANKING PAGE ${String(page).padStart(2, "0")} · ${updatedDate.replaceAll("-", ".")}</p>
          <h1>AI 中转站推荐榜<br /><em>第 ${page} 页</em></h1>
          <p class="hero-copy">本页展示综合排名 ${first}–${last}。需要先了解选择方法？<a href="${root}/#guide">返回首页阅读完整指南</a>。</p>`;
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1" />
    <meta name="theme-color" content="#f4f0e8" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:url" content="${canonical}" />
    <meta property="og:site_name" content="中转站推荐榜" />
    <meta property="og:locale" content="zh_CN" />
    <meta property="og:image" content="${ORIGIN}/assets/og-image.svg" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${ORIGIN}/assets/og-image.svg" />
    <link rel="canonical" href="${canonical}" />
    <link rel="alternate" hreflang="zh-CN" href="${canonical}" />
    ${relations.previous ? `<link rel="prev" href="${relations.previous}" />` : ""}
    ${relations.next ? `<link rel="next" href="${relations.next}" />` : ""}
    <link rel="icon" href="${root}/assets/favicon.svg" type="image/svg+xml" />
    <link rel="stylesheet" href="${root}/assets/styles.min.css" />
    <script type="application/ld+json">${jsonLd}</script>
  </head>
  <body>
    <a class="skip-link" href="#main">跳到主要内容</a>
    <header class="topbar">
      <a class="wordmark" href="${root}/" aria-label="中转站推荐榜首页"><span>中转站</span><strong>推荐榜</strong></a>
      <nav aria-label="主要导航"><a href="${root}/#ranking">推荐榜</a><a href="${root}/#guide">怎么选</a><a href="${root}/#faq">常见问题</a></nav>
    </header>
    <main id="main">
      ${renderBreadcrumbs(page, root)}
      <section class="hero">
        <div class="hero__copy">
          ${hero}
        </div>
        <aside class="hero__panel" aria-label="榜单概览">
          <p>本期收录</p><strong>${allSites.length}</strong><span>家 AI API 中转站</span>
          <dl><div><dt>当前页</dt><dd>${page} / ${totalPages}</dd></div><div><dt>本页范围</dt><dd>${first}–${last}</dd></div><div><dt>每页数量</dt><dd>${PAGE_SIZE}</dd></div></dl>
        </aside>
      </section>

      <section class="ranking" id="ranking" aria-labelledby="ranking-title">
        <div class="ranking-head">
          <div><p>RANKING / ${String(page).padStart(2, "0")}</p><h2 id="ranking-title">中转站推荐列表</h2></div>
          <p>当前显示第 ${first}–${last} 名，共 ${allSites.length} 家</p>
        </div>
        <p class="ranking-note">指标会随线路和服务状态变化。建议结合自己的网络、模型与调用方式进行小额测试，不要仅凭单次测速或宣传价格决定长期使用。</p>
        ${renderPageAnalysis(stats, first, last)}
        <div class="station-list">
${sites.map(renderSite).join("\n")}
        </div>
        ${renderPagination(page, totalPages)}
      </section>

${page === 1 ? homeGuide() : `      <section class="page-continue"><p>已经看完第 ${page} 页？</p><h2>回到选择指南，建立自己的测试标准</h2><a href="${root}/#guide">阅读中转站选择方法 →</a></section>`}
    </main>
    <footer class="footer">
      <a class="wordmark" href="${root}/"><span>中转站</span><strong>推荐榜</strong></a>
      <p>先比较，后测试；少量充值，为关键调用保留备用方案。</p>
      <a href="#main">返回顶部 ↑</a>
    </footer>
  </body>
</html>
`;
}

function minifyHtml(html) {
  return html
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("")
    .replace(/>\s+</g, "><")
    .concat("\n");
}

function minifyCss(css) {
  const strings = [];
  const protectedCss = css.replace(/(["'])(?:\\.|(?!\1)[^\\])*\1/g, (match) => {
    const token = `___CSS_STRING_${strings.length}___`;
    strings.push(match);
    return token;
  });
  let minified = protectedCss
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ")
    .replace(/\s*([{}:;,])\s*/g, "$1")
    .replace(/;}/g, "}")
    .trim();
  strings.forEach((value, index) => {
    minified = minified.replace(`___CSS_STRING_${index}___`, value);
  });
  return `${minified}\n`;
}

function renderSitemap(totalPages, updatedDate) {
  const urls = Array.from({ length: totalPages }, (_, index) => `${ORIGIN}${pagePath(index + 1)}`);
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((url, index) => `  <url>
    <loc>${url}</loc>
    <lastmod>${updatedDate}</lastmod>
    <changefreq>daily</changefreq>
    <priority>${index === 0 ? "1.0" : "0.8"}</priority>
  </url>`).join("\n")}
</urlset>
`;
}

async function cleanOldPages(totalPages) {
  let entries = [];
  try { entries = await readdir(PAGE_ROOT, { withFileTypes: true }); } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  await Promise.all(entries
    .filter((entry) => entry.isDirectory() && /^\d+$/.test(entry.name) && Number(entry.name) > totalPages)
    .map((entry) => rm(path.join(PAGE_ROOT, entry.name), { recursive: true, force: true })));
}

async function build() {
  if (SHOULD_SYNC) await syncData();
  const payload = JSON.parse(await readFile(DATA_PATH, "utf8"));
  validatePayload(payload);
  const sites = payload.sites.map(normalizeSite).sort((a, b) => a.rank - b.rank);
  const updatedDate = normalizeDate(payload.updatedDate) || new Date().toISOString().slice(0, 10);
  const totalPages = Math.ceil(sites.length / PAGE_SIZE);
  await cleanOldPages(totalPages);
  await atomicWrite(MINIFIED_STYLES_PATH, minifyCss(await readFile(STYLES_PATH, "utf8")));

  for (let page = 1; page <= totalPages; page += 1) {
    const pageSites = sites.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    const target = page === 1 ? path.join(ROOT, "index.html") : path.join(PAGE_ROOT, String(page), "index.html");
    await atomicWrite(target, minifyHtml(renderPage({ page, totalPages, sites: pageSites, allSites: sites, updatedDate })));
  }
  await atomicWrite(path.join(ROOT, "sitemap.xml"), renderSitemap(totalPages, updatedDate));
  process.stdout.write(`已生成 ${totalPages} 个分页，共 ${sites.length} 个站点；数据日期 ${updatedDate}\n`);
}

await build();
