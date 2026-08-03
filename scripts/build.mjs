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
  {
    question: "AI 中转站到底中转了什么？",
    answer: [
      "中转站通常不训练模型，而是位于客户端和模型服务之间，负责 API Key 鉴权、余额结算、限流、渠道调度、日志以及接口格式转换。用户把请求发给中转站后，后台选择一条可用上游，再把模型结果返回。",
      "因此一次调用可能经过站点和它接入的二级渠道。链路越长，稳定性、隐私和故障定位越依赖运营方。",
    ],
  },
  {
    question: "中转站与官方 API 有什么区别？",
    answer: [
      "官方 API 的请求和账单直接进入模型厂商；中转站则多了一层第三方网关，通常更容易使用人民币付款，也能用一个密钥接入多个厂商。",
      "代价是模型来源、参数支持、日志保留、服务连续性和余额安全不再只由模型厂商决定。商业或敏感任务应优先选择能说明数据处理方式和上游类型的服务。",
    ],
  },
  {
    question: "0.1 倍率是否等于官方价格的一折？",
    answer: [
      "不一定。实际扣款通常约等于官方标价折算用量 × 平台币换算系数 × 用户或分组倍率，还可能分别计算输入、输出、缓存写入、缓存命中、图片等项目。",
      "如果 1 美元标价额度记作 1 元余额，5 美元用量按 0.1 倍扣 0.5 元；如果 1 美元额度要用 7 元人民币购买，同样 0.1 倍会扣 3.5 元。比较价格必须同时看充值换算和完整账单。",
    ],
  },
  {
    question: "面板里的“美元额度”是真美元吗？",
    answer: [
      "不一定。很多面板中的美元符号只是按照官方 API 标价记录的计费单位，不代表平台持有等额官方余额，也不代表可以提现。",
      "尤其是订阅池渠道，站点可能把订阅实际跑出的请求换算成“如果走官方 API 值多少美元”，再按倍率扣除站内余额。充值前应先确认 1 元人民币能买多少单位以及余额的退款规则。",
    ],
  },
  {
    question: "为什么有些中转站能做到很低倍率？",
    answer: [
      "批量采购、区域价格、公开促销、较高资源利用率和订阅池都可能降低成本，低价本身不能直接证明有问题。",
      "但长期远低于正常成本且不说明来源时，应把短期优惠、账号池波动、第三方产品适配甚至来源异常纳入风险判断。价格模型算不通，通常意味着稳定性、数据或余额风险被转移给了用户。",
    ],
  },
  {
    question: "官方 API、订阅池和第三方适配渠道怎么区分？",
    answer: [
      "只看前端面板无法可靠判断。可以查看站点是否明确标注渠道类型，并测试上下文上限、缓存、工具调用、图片输入、流式输出和参数兼容性。",
      "订阅池更容易在额度耗尽或切换账号时波动；第三方适配可能带有额外系统提示、上下文压缩或功能缺失。即使使用同一套开源面板，不同站点的上游和调度质量也可能完全不同。",
    ],
  },
  {
    question: "怎么判断模型是否被替换或“降智”？",
    answer: [
      "不要依赖模型自报身份，因为回答可能只是复述系统上下文。更可靠的方法是准备固定测试集，长期比较代码能力、上下文上限、工具调用、结构化输出、视觉能力和响应特征。",
      "如果复杂任务持续明显偏离官方表现，应保留请求 ID 和账单记录，换时间、换通道复测，再向站点确认是否存在模型映射、参数改写或上下文压缩。",
    ],
  },
  {
    question: "为什么网页和 ping 很快，模型回复仍然很慢？",
    answer: [
      "域名可能使用 CDN，ping 到的是离你较近的边缘节点，并不是中转程序或模型上游。完整延迟还包括网关处理、排队、上游网络、模型推理和流式传输。",
      "应分别记录首字时间、完整响应时间、失败率和晚高峰波动，而不是只看网页打开速度或一次 ping。",
    ],
  },
  {
    question: "使用中转站时如何保护隐私？",
    answer: [
      "默认按“站点可能接触请求和响应内容”来评估风险。不要提交账号密码、私钥、客户资料、未公开代码和其他不必要的敏感数据；可先脱敏，并为不同项目使用独立 Key 和额度上限。",
      "企业场景还应核对日志保留、数据用途、删除机制、运营主体和合同责任。无法确认链路时，敏感业务更适合官方 API 或可审计的合规服务。",
    ],
  },
  {
    question: "选择中转站最有效的测试方法是什么？",
    answer: [
      "先确定必需模型、协议和预算，再以最低金额充值。使用自己的真实任务，在白天和晚高峰各连续测试，核对成功率、首字延迟、长上下文、缓存、工具调用和单次账单。",
      "不要只问一句“你好”。短对话无法暴露账号池切换、上下文截断、缓存失效和复杂参数不兼容等问题。",
    ],
  },
  {
    question: "为什么不建议一次充值很多？",
    answer: [
      "中转服务会受到上游政策、账号风控、线路、经营状况和价格调整影响，站内余额通常也不具备与银行存款相同的保障。",
      "更稳妥的做法是按近期用量充值，为关键业务准备不同上游的备用接口，并提前确认退款、迁移和故障公告规则。",
    ],
  },
  {
    question: "榜单排名靠前就一定适合我吗？",
    answer: [
      "不一定。榜单用于缩小范围，不能替代具体场景验收。编程工具更关注长任务、缓存和工具调用；图片、音视频或长文档任务还要测试文件限制、多模态能力和超时策略。",
      "先写清自己的硬性需求和不能接受的风险，再结合榜单指标选择候选站点，最后用同一组真实任务横向比较。",
    ],
  },
];

const TOPICS = [
  {
    slug: "gpt-zhongzhuanzhan",
    label: "GPT 中转站",
    short: "GPT / OpenAI",
    terms: ["gpt", "openai", "chatgpt"],
    intro: "GPT 中转站通常提供 OpenAI 兼容接口，适合对话、代码、结构化输出、工具调用和多模态任务。除了模型名称，还要核对 Responses API、Chat Completions、上下文长度、缓存和具体版本映射。",
    focus: ["确认 GPT 具体版本与上下文长度", "测试 Responses API 和工具调用", "验证图片、文件与结构化输出", "分别复算输入、输出和缓存费用"],
  },
  {
    slug: "claude-zhongzhuanzhan",
    label: "Claude 中转站",
    short: "Claude / Anthropic",
    terms: ["claude", "anthropic"],
    intro: "Claude 中转站常用于长文本、代码和 Agent 任务。选择时应确认 Anthropic 原生协议或兼容层差异，并重点测试 Prompt Caching、工具调用、长输出稳定性以及 Sonnet、Opus 等版本映射。",
    focus: ["核对 Claude 版本和模型映射", "测试长输出与工具调用断流", "检查缓存写入和读取明细", "确认 Anthropic 原生协议兼容性"],
  },
  {
    slug: "codex-zhongzhuanzhan",
    label: "Codex 中转站",
    short: "Codex",
    terms: ["codex"],
    intro: "Codex 中转站面向代码生成、仓库分析和编程 Agent。普通聊天可用不代表长任务稳定，应使用真实代码仓库测试工具调用、上下文缓存、并发、错误恢复以及 Codex 客户端所需的接口能力。",
    focus: ["验证 Codex 客户端接入方式", "用多文件任务测试完整成功率", "检查长上下文、缓存和并发", "准备可快速切换的备用接口"],
  },
  {
    slug: "gemini-zhongzhuanzhan",
    label: "Gemini 中转站",
    short: "Gemini / Google",
    terms: ["gemini"],
    intro: "Gemini 中转站常用于多模态、长上下文、代码和文档处理。需要区分 Gemini 原生接口与 OpenAI 兼容接口，并分别测试图片、文件、工具调用、安全过滤和具体模型版本。",
    focus: ["确认原生 Gemini 或兼容协议", "测试图片、文件和多模态输入", "核对安全过滤与错误返回", "检查模型版本和上下文限制"],
  },
  {
    slug: "glm-zhongzhuanzhan",
    label: "GLM 中转站",
    short: "GLM / 智谱",
    terms: ["glm", "智谱"],
    intro: "GLM 中转站主要提供智谱 GLM 系列模型的统一 API 接入。应确认具体型号、工具调用、结构化输出、视觉能力和上下文限制，并检查兼容接口是否完整保留智谱原生能力。",
    focus: ["核对 GLM 具体型号", "测试工具调用、JSON 和视觉能力", "确认上下文、并发与限流", "检查原生能力在兼容层的差异"],
  },
  {
    slug: "qwen-zhongzhuanzhan",
    label: "Qwen 中转站",
    short: "Qwen / 通义千问",
    terms: ["qwen", "通义", "千问"],
    intro: "Qwen 中转站覆盖通义千问文本、代码和多模态模型。选择时要区分不同尺寸与用途，确认上下文、视觉或音频能力、工具调用、兼容协议和实际调用价格。",
    focus: ["区分 Qwen 不同尺寸和用途", "测试文本、代码与多模态能力", "确认原生协议和兼容层差异", "核对上下文、限流和调用价格"],
  },
  {
    slug: "kimi-zhongzhuanzhan",
    label: "Kimi 中转站",
    short: "Kimi / 月之暗面",
    terms: ["kimi", "moonshot", "月之暗面"],
    intro: "Kimi 中转站常用于中文长文本、文件处理和对话场景。应核对 Moonshot 或 Kimi 具体模型、上下文长度、文件能力、工具调用和费用，避免直接用网页会员体验推断 API 能力。",
    focus: ["确认 Kimi 与 Moonshot 模型映射", "测试中文长文本和文件处理", "检查上下文长度与超限行为", "区分网页会员能力和 API 计费"],
  },
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
                  <h2 id="station-${site.rank}"><a href="${url}" target="_blank" rel="nofollow noopener" referrerpolicy="origin">${escapeHtml(site.name)}</a></h2>
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
                <a class="detail-link" href="${url}" target="_blank" rel="nofollow noopener" referrerpolicy="origin" aria-label="查看 ${escapeHtml(site.name)} 的更多信息">查看站点信息 <span aria-hidden="true">↗</span></a>
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

function topicMatches(site, topic) {
  const searchable = [site.name, site.description, ...site.models].join(" ").toLowerCase();
  return topic.terms.some((term) => searchable.includes(term.toLowerCase()));
}

function topicFaq(topic) {
  return [
    [`${topic.label}应该怎么选择？`, `先确认候选站明确支持所需模型和接口，再用自己的真实任务测试流式输出、工具调用、上下文、成功率和账单。重点完成：${topic.focus.join("；")}。不要只依据首页价格或一次短对话决定长期使用。`],
    [`${topic.label}的价格应该怎样比较？`, "统一换算人民币充值比例、输入价格、输出价格、缓存读写、模型倍率和用户分组倍率，再复算一条实际请求。面板显示为美元不代表等同官方美元，低倍率也不代表所有模型和渠道采用相同价格。"],
    [`${topic.label}适合直接用于生产环境吗？`, "个人学习和能够随时迁移的任务可以先小额测试。生产环境还要评估数据隐私、运营主体、日志政策、限流、故障公告和备用供应商；涉及敏感数据或强 SLA 时，应优先考虑官方 API 或可签约的企业服务。"],
    [`如何验证 ${topic.label} 宣传的模型和能力？`, `使用固定测试集核对模型标识、上下文、流式响应、工具调用和账单模型名，并完成专项验证：${topic.focus.join("；")}。模型自报身份不能作为证据，关键能力缺失或账单无法复算时应暂停继续充值。`],
  ];
}

function topicStats(sites) {
  const stats = pageStats(sites);
  const modelCounts = sites.map((site) => site.modelCount).filter((value) => value > 0);
  return { ...stats, modelCount: { value: median(modelCounts), sample: modelCounts.length } };
}

function renderTopicDirectory(allSites, currentSlug = "") {
  const cards = TOPICS.map((topic) => {
    const matches = allSites.filter((site) => topicMatches(site, topic));
    const link = currentSlug === topic.slug
      ? `<span class="topic-directory__current" aria-current="page">当前专题</span>`
      : `<a href="/${topic.slug}/">查看 ${escapeHtml(topic.label)} →</a>`;
    return `          <article><span>${escapeHtml(topic.short)}</span><h3>${escapeHtml(topic.label)}</h3><p>${escapeHtml(topic.intro)}</p><div><strong>${matches.length}</strong><small>家相关站点</small>${link}</div></article>`;
  }).join("\n");
  return `      <section class="topic-directory" id="topics" aria-labelledby="topics-title">
        <div class="topic-directory__head"><div><p class="section-kicker">模型专题</p><h2 id="topics-title">按模型查找中转站</h2></div><p>先选择需要的模型，再比较运行表现、价格和服务政策；充值前请进入站点核对并小额测试。</p></div>
        <div class="topic-directory__grid">
${cards}
        </div>
      </section>`;
}

function renderTopicStructuredData({ topic, canonical, title, description, sites, totalMatches, updatedDate }) {
  const faq = topicFaq(topic);
  const graph = [{
    "@type": "WebSite", "@id": `${ORIGIN}/#website`, url: `${ORIGIN}/`, name: "中转站推荐榜", inLanguage: "zh-CN",
  }, {
    "@type": "CollectionPage", "@id": `${canonical}#webpage`, url: canonical, name: title, description,
    dateModified: updatedDate, inLanguage: "zh-CN", isPartOf: { "@id": `${ORIGIN}/#website` },
    breadcrumb: { "@id": `${canonical}#breadcrumb` }, mainEntity: { "@id": `${canonical}#ranking` },
  }, {
    "@type": "BreadcrumbList", "@id": `${canonical}#breadcrumb`, itemListElement: [
      { "@type": "ListItem", position: 1, name: "中转站推荐榜", item: `${ORIGIN}/` },
      { "@type": "ListItem", position: 2, name: topic.label, item: canonical },
    ],
  }, {
    "@type": "ItemList", "@id": `${canonical}#ranking`, name: `${topic.label}候选列表`, numberOfItems: totalMatches,
    itemListOrder: "https://schema.org/ItemListOrderAscending",
    itemListElement: sites.map((site, index) => ({
      "@type": "ListItem", position: index + 1,
      item: { "@type": "Service", name: site.name, url: site.url, description: objectiveSiteSummary(site) },
    })),
  }, {
    "@type": "FAQPage", "@id": `${canonical}#faq`, mainEntity: faq.map(([question, answer]) => ({
      "@type": "Question", name: question, acceptedAnswer: { "@type": "Answer", text: answer },
    })),
  }];
  return JSON.stringify({ "@context": "https://schema.org", "@graph": graph }).replaceAll("<", "\\u003c");
}

function renderTopicPage({ topic, sites, allMatches, allSites, updatedDate }) {
  const canonical = `${ORIGIN}/${topic.slug}/`;
  const title = `${topic.label}推荐｜${allMatches.length} 家 AI API 中转站对比`;
  const description = `${topic.label}专题收录 ${allMatches.length} 家公开资料相关的 AI API 中转站，对比在线率、延迟、模型数量和服务信息，并提供接入验证、计费与安全选择指南。`;
  const stats = topicStats(allMatches);
  const faq = topicFaq(topic);
  const jsonLd = renderTopicStructuredData({ topic, canonical, title, description, sites, totalMatches: allMatches.length, updatedDate });
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
    <link rel="icon" href="../assets/favicon.svg" type="image/svg+xml" />
    <link rel="stylesheet" href="../assets/styles.min.css" />
    <script type="application/ld+json">${jsonLd}</script>
  </head>
  <body>
    <a class="skip-link" href="#main">跳到主要内容</a>
    <header class="topbar">
      <a class="wordmark" href="../" aria-label="中转站推荐榜首页"><span>中转站</span><strong>推荐榜</strong></a>
      <nav aria-label="主要导航"><a href="../#ranking">推荐榜</a><a href="../#topics">模型专题</a><a href="../#guide">怎么选</a><a href="../#faq">常见问题</a></nav>
    </header>
    <main id="main">
      <nav class="breadcrumbs" aria-label="面包屑"><a href="../">中转站推荐榜</a><span aria-hidden="true">/</span><span aria-current="page">${escapeHtml(topic.label)}</span></nav>
      <section class="hero topic-hero">
        <div class="hero__copy"><p class="eyebrow">MODEL DIRECTORY · ${updatedDate.replaceAll("-", ".")}</p><h1>${escapeHtml(topic.label)}<br /><em>推荐与对比</em></h1><p class="hero-copy">${escapeHtml(topic.intro)}</p><div class="hero-actions"><a href="#topic-ranking">查看候选站</a><a href="#topic-guide">阅读专项指南</a></div></div>
        <aside class="hero__panel" aria-label="专题概览"><p>相关站点</p><strong>${allMatches.length}</strong><span>家 ${escapeHtml(topic.label)}</span><dl><div><dt>本页展示</dt><dd>${sites.length} 家</dd></div><div><dt>在线率样本</dt><dd>${stats.uptime.sample}/${stats.total}</dd></div><div><dt>更新时间</dt><dd>${updatedDate}</dd></div></dl></aside>
      </section>

      <section class="topic-overview" aria-labelledby="topic-overview-title">
        <div><p class="section-kicker">专题数据</p><h2 id="topic-overview-title">候选站概览</h2><p>模型与价格可能变化，请在充值前核对当前列表，并用自己的任务完成测试。</p></div>
        <dl class="topic-stat-grid"><div><dt>相关站点</dt><dd>${stats.total} 家</dd><small>展示前 ${sites.length} 家</small></div><div><dt>在线率中位数</dt><dd>${formatStat(stats.uptime.value, formatUptime)}</dd><small>样本 ${stats.uptime.sample}/${stats.total}</small></div><div><dt>延迟中位数</dt><dd>${formatStat(stats.latency.value, formatLatency)}</dd><small>样本 ${stats.latency.sample}/${stats.total}</small></div><div><dt>模型数量中位数</dt><dd>${formatStat(stats.modelCount.value, (value) => `${number.format(value)} 个`)}</dd><small>样本 ${stats.modelCount.sample}/${stats.total}</small></div></dl>
      </section>

      ${renderTopicDirectory(allSites, topic.slug)}

      <section class="topic-guide" id="topic-guide" aria-labelledby="topic-guide-title"><div><p class="section-kicker">专项验收</p><h2 id="topic-guide-title">选择 ${escapeHtml(topic.label)} 要检查什么</h2><p>${escapeHtml(topic.intro)} 建议使用固定测试集保存请求时间、模型名、错误码、Token 和扣费，以便对不同站点做可复现比较。</p></div><div class="topic-focus-grid">${topic.focus.map((item, index) => `<article><span>0${index + 1}</span><h3>${escapeHtml(item)}</h3><p>不要只查看模型名称；应在自己的客户端完成真实请求，并核对响应能力与请求级账单。</p></article>`).join("")}</div></section>

      <section class="ranking topic-ranking" id="topic-ranking" aria-labelledby="topic-ranking-title"><div class="ranking-head"><div><p>MODEL RANKING / ${escapeHtml(topic.short)}</p><h2 id="topic-ranking-title">${escapeHtml(topic.label)}候选站</h2></div><p>展示前 ${sites.length} 家，共匹配 ${allMatches.length} 家</p></div><p class="ranking-note">候选站按综合榜单顺序展示。公开资料提及相关模型不代表当前通道始终可用，请点击站点信息核对最新模型列表、价格和限制。</p><div class="station-list">\n${sites.map(renderSite).join("\n")}\n        </div></section>

      <section class="faq-section topic-faq" id="faq" aria-labelledby="topic-faq-title"><div class="section-kicker">专题常见问题</div><h2 id="topic-faq-title">${escapeHtml(topic.label)}常见问题</h2><div class="faq-list">${faq.map(([question, answer]) => `<details class="faq-item"><summary>${escapeHtml(question)}</summary><div class="faq-answer"><p>${escapeHtml(answer)}</p></div></details>`).join("")}</div></section>
    </main>
    <footer class="footer"><a class="wordmark" href="../"><span>中转站</span><strong>推荐榜</strong></a><p>公开信息用于初筛，使用 ${escapeHtml(topic.label)} 前请自行小额测试。</p><a href="#main">返回顶部 ↑</a></footer>
  </body>
</html>`;
}

function homeGuide() {
  const faq = FAQ.map(({ question, answer }) => `            <details class="faq-item">
              <summary>${escapeHtml(question)}</summary>
              <div class="faq-answer">${answer.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("")}</div>
            </details>`).join("\n");
  return `      <section class="decision-guide" id="guide" aria-labelledby="guide-title">
        <div class="section-kicker">选择方法</div>
        <h2 id="guide-title">选择中转站，不要只比较倍率</h2>
        <p class="section-lead">中转站是一层位于客户端和模型服务之间的网关。真正影响长期体验的，是上游来源是否说明、价格能否复算、高峰期是否稳定、模型能力是否完整，以及发生故障后有没有清楚的处理入口。</p>
        <div class="guide-grid">
          <article><span>01</span><h3>先写清自己的硬需求</h3><p>列出必需模型、接口协议、上下文长度、工具调用、多模态、并发和预算。用于个人聊天、编程代理和企业生产的标准不同，先设门槛才能排除不合适的站点。</p></article>
          <article><span>02</span><h3>询问并验证上游类型</h3><p>确认是官方按量 API、合规代理、订阅账号池还是第三方产品适配。站点不一定公开具体供应商，但至少应说明渠道性质、能力限制和故障时的切换策略。</p></article>
          <article><span>03</span><h3>把倍率换算成人民币</h3><p>同时核对充值汇率、模型价格、用户分组、输入输出和缓存计费。只看“0.1 倍”没有可比性；用一条已知 Token 的请求复算，才能知道真实成本。</p></article>
          <article><span>04</span><h3>用真实任务测稳定性</h3><p>不要只发一句短对话。用平时的代码仓库、长文档或工具调用连续测试，在白天和晚高峰分别记录成功率、首字等待、完整耗时与重试次数。</p></article>
          <article><span>05</span><h3>核对模型与接口能力</h3><p>检查版本、上下文、流式输出、图片输入、结构化输出和工具调用。名称相同不代表通道能力相同，模型自报身份也不能代替固定测试集。</p></article>
          <article><span>06</span><h3>检查运营、隐私与售后</h3><p>查看运营时间、公告、客服、日志与数据说明、退款和开票规则。重要业务应设置独立 Key 与额度上限，并准备不同上游的备用接口。</p></article>
        </div>
        <aside class="warning-box"><strong>先小额，再加量</strong><p>中转服务可能调价、更换上游或停止运营。第一次只充最低金额，完成多时段测试和账单复算后再增加用量；关键业务保留备用接口，不向不了解的链路提交敏感数据。</p></aside>
      </section>

      <section class="cost-section" id="pricing" aria-labelledby="pricing-title">
        <div class="cost-intro">
          <div class="section-kicker">价格与倍率</div>
          <h2 id="pricing-title">先把“0.1 倍”翻译成实际人民币</h2>
          <p>倍率只是价格公式中的一项。平台还可能把官方美元标价换算成自己的记账单位，并对输入、输出、缓存、图片或不同用户分组分别定价。</p>
        </div>
        <div class="formula-card" aria-label="中转站实际扣款估算公式">
          <span>实际扣款约等于</span>
          <code>官方标价折算用量 × 平台币换算系数 × 用户倍率</code>
          <small>最终以站内模型单价、缓存规则和调用账单为准。</small>
        </div>
        <div class="example-grid">
          <article><span>示例 A</span><h3>1 美元额度 = 1 元余额</h3><p>一次请求按官方标价折算为 5 美元，用户倍率 0.1：</p><code>5 × 1 × 0.1 = 0.5 元</code></article>
          <article><span>示例 B</span><h3>1 美元额度 = 7 元人民币</h3><p>同样是 5 美元用量和 0.1 倍率，充值换算不同：</p><code>5 × 7 × 0.1 = 3.5 元</code></article>
        </div>
        <p class="cost-note"><strong>比较时至少记录：</strong>1 元人民币能买多少平台额度、输入与输出单价、缓存写入与命中价格、模型倍率、用户分组倍率，以及一次真实请求的 Token 与最终扣款。面板中的“美元”可能只是官方标价等值单位，并不等于可提现的美元或官方账户余额。</p>
      </section>

      <section class="channel-section" aria-labelledby="channel-title">
        <div class="section-kicker">上游类型</div>
        <h2 id="channel-title">同一个接口页面，背后可能是不同生意</h2>
        <p class="channel-lead">New API、Sub2API 或自研面板只是管理工具，不能直接证明渠道质量。真正需要判断的是请求最终走向哪里，以及这种上游的限制会不会影响你的任务。</p>
        <div class="channel-grid">
          <article><h3>官方按量 API 或合规代理</h3><p>通常按 Token 产生真实成本，模型参数和功能更接近官方。重点核对代理层是否改写参数、如何处理日志，以及故障赔付和合同主体。</p><strong>更适合：</strong><span>稳定生产、敏感或可审计业务</span></article>
          <article><h3>订阅账号池</h3><p>把订阅产品的可用量集中调度，再按官方 API 标价折算为站内额度。成本可能较低，但会受周限额、账号风控、排队和账号切换影响。</p><strong>重点测试：</strong><span>高峰期、长任务、缓存连续性与限流</span></article>
          <article><h3>第三方产品适配</h3><p>将 IDE、代码工具或其他产品的接口转换成通用 API。可能附带额外系统提示、上下文压缩或功能限制，产品升级后也可能突然失效。</p><strong>重点测试：</strong><span>工具调用、参数兼容与输出一致性</span></article>
        </div>
        <aside class="risk-note"><strong>极低价格需要多做一步成本核验。</strong><p>公开促销、批量采购和高利用率可以合理降价；如果价格长期低到难以覆盖正常成本，且渠道性质、账单和限制都说不清，就应降低预存金额并避免传输敏感数据。不要仅凭低价直接下结论，也不要替无法解释的价格模型承担风险。</p></aside>
      </section>

      <section class="test-section" id="checklist" aria-labelledby="test-title">
        <div>
          <div class="section-kicker">接入前测试</div>
          <h2 id="test-title">用同一套任务完成基础验收</h2>
          <p class="test-lead">最好为候选站点准备相同的提示词、代码任务和长上下文样本，在不同时段重复测试并保存账单。这样比较的是通道，而不是一次偶然输出。</p>
        </div>
        <ol class="test-list">
          <li><strong>最低金额充值</strong><span>核对人民币到账额度、平台币含义和退款条件。</span></li>
          <li><strong>调用核心模型</strong><span>验证版本、上下文、流式输出、图片和工具调用。</span></li>
          <li><strong>复算一条账单</strong><span>检查输入、输出、缓存、倍率和最终人民币成本。</span></li>
          <li><strong>跑长上下文任务</strong><span>观察是否截断、压缩上下文，以及缓存能否持续命中。</span></li>
          <li><strong>连续请求二十次</strong><span>记录成功率、首字延迟、完整耗时与重试次数。</span></li>
          <li><strong>晚高峰再次测试</strong><span>账号池拥挤和线路容量问题往往此时更明显。</span></li>
          <li><strong>验证故障处理</strong><span>确认公告、客服、请求 ID、退款和余额迁移入口。</span></li>
          <li><strong>设置密钥限额</strong><span>按项目隔离 Key，限制模型和额度，降低泄露风险。</span></li>
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
    ...(page === 1 ? { hasPart: TOPICS.map((topic) => ({ "@id": `${ORIGIN}/${topic.slug}/#webpage` })) } : {}),
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
      mainEntity: FAQ.map(({ question, answer }) => ({
        "@type": "Question",
        name: question,
        acceptedAnswer: { "@type": "Answer", text: answer.join("\n\n") },
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
      <nav aria-label="主要导航"><a href="${root}/#ranking">推荐榜</a><a href="${root}/#topics">模型专题</a><a href="${root}/#guide">怎么选</a><a href="${root}/#faq">常见问题</a></nav>
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

${page === 1 ? `${renderTopicDirectory(allSites)}\n\n${homeGuide()}` : `      <section class="page-continue"><p>已经看完第 ${page} 页？</p><h2>回到选择指南，建立自己的测试标准</h2><a href="${root}/#guide">阅读中转站选择方法 →</a></section>`}
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
  const urls = [
    ...Array.from({ length: totalPages }, (_, index) => `${ORIGIN}${pagePath(index + 1)}`),
    ...TOPICS.map((topic) => `${ORIGIN}/${topic.slug}/`),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((url, index) => `  <url>
    <loc>${url}</loc>
    <lastmod>${updatedDate}</lastmod>
    <changefreq>daily</changefreq>
    <priority>${index === 0 ? "1.0" : index < totalPages ? "0.8" : "0.9"}</priority>
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
  const topicPages = TOPICS.map((topic) => {
    const matches = sites.filter((site) => topicMatches(site, topic));
    return { topic, matches, html: renderTopicPage({ topic, sites: matches.slice(0, PAGE_SIZE), allMatches: matches, allSites: sites, updatedDate }) };
  });
  await cleanOldPages(totalPages);
  await atomicWrite(MINIFIED_STYLES_PATH, minifyCss(await readFile(STYLES_PATH, "utf8")));

  for (let page = 1; page <= totalPages; page += 1) {
    const pageSites = sites.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    const target = page === 1 ? path.join(ROOT, "index.html") : path.join(PAGE_ROOT, String(page), "index.html");
    await atomicWrite(target, minifyHtml(renderPage({ page, totalPages, sites: pageSites, allSites: sites, updatedDate })));
  }
  for (const { topic, html } of topicPages) {
    await atomicWrite(path.join(ROOT, topic.slug, "index.html"), minifyHtml(html));
  }
  await atomicWrite(path.join(ROOT, "sitemap.xml"), renderSitemap(totalPages, updatedDate));
  process.stdout.write(`已生成 ${totalPages} 个分页、${topicPages.length} 个模型专题，共 ${sites.length} 个站点；数据日期 ${updatedDate}\n`);
}

await build();
