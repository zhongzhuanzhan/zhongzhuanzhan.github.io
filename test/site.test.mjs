import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const data = JSON.parse(await readFile(path.join(root, "data.json"), "utf8"));
const expectedPages = Math.ceil(data.sites.length / 50);

async function pageHtml(page) {
  const file = page === 1 ? path.join(root, "index.html") : path.join(root, "page", String(page), "index.html");
  return readFile(file, "utf8");
}

function extractJsonLd(html) {
  const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(match, "JSON-LD should exist");
  return JSON.parse(match[1]);
}

test("build generates the expected static pages", async () => {
  const directories = (await readdir(path.join(root, "page"), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && /^\d+$/.test(entry.name));
  assert.equal(directories.length, expectedPages - 1);
  await readFile(path.join(root, "page", String(expectedPages), "index.html"), "utf8");
});

test("every page contains no more than 50 unique station cards", async () => {
  const ranks = [];
  for (let page = 1; page <= expectedPages; page += 1) {
    const html = await pageHtml(page);
    const pageRanks = [...html.matchAll(/<article class="station-card" id="rank-(\d+)"/g)].map((match) => Number(match[1]));
    assert.ok(pageRanks.length > 0 && pageRanks.length <= 50, `page ${page} card count`);
    ranks.push(...pageRanks);
  }
  assert.equal(ranks.length, data.sites.length);
  assert.equal(new Set(ranks).size, data.sites.length);
  assert.deepEqual(ranks, data.sites.map((site) => Number(site.rank)));
});

test("page metadata and JSON-LD are page specific", async () => {
  for (let page = 1; page <= expectedPages; page += 1) {
    const html = await pageHtml(page);
    const canonical = page === 1
      ? "https://zhongzhuanzhan.github.io/"
      : `https://zhongzhuanzhan.github.io/page/${page}/`;
    assert.match(html, new RegExp(`<link rel="canonical" href="${canonical.replaceAll("/", "\\/")}"`));
    const jsonLd = extractJsonLd(html);
    const itemList = jsonLd["@graph"].find((item) => item["@type"] === "ItemList");
    const expectedCount = Math.min(50, data.sites.length - (page - 1) * 50);
    assert.equal(itemList.itemListElement.length, expectedCount);
  }
});

test("full descriptions are static and external links go to hvoy pages", async () => {
  const firstWithDescription = data.sites.find((site) => site.description);
  const owningPage = Math.ceil(Number(firstWithDescription.rank) / 50);
  const html = await pageHtml(owningPage);
  const escapedOpening = firstWithDescription.description.slice(0, 25)
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  assert.ok(html.includes(escapedOpening));
  assert.ok(html.includes("<details class=\"site-intro\">"));
  for (const match of html.matchAll(/class="detail-link" href="([^"]+)"/g)) {
    assert.match(match[1], /^https:\/\/www\.hvoy\.ai\/sites\//);
  }
  assert.doesNotMatch(html, /href="(?:\.\.\/)*sites\//);
});

test("visible generated pages do not explain internal data provenance", async () => {
  const forbidden = /ownVerify|awesome-ai-api|raw\.githubusercontent|数据来源于|数据来自于/i;
  for (let page = 1; page <= expectedPages; page += 1) {
    assert.doesNotMatch(await pageHtml(page), forbidden);
  }
});

test("sitemap includes only the home page and actual pagination", async () => {
  const sitemap = await readFile(path.join(root, "sitemap.xml"), "utf8");
  const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  assert.equal(locations.length, expectedPages);
  assert.equal(locations[0], "https://zhongzhuanzhan.github.io/");
  assert.equal(locations.at(-1), `https://zhongzhuanzhan.github.io/page/${expectedPages}/`);
  assert.ok(locations.every((url) => !url.includes("/sites/")));
});
