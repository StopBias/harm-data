"use strict";

// Group headers on the Demographics ranked list.
// Run: node test/ranked-table-headings.test.js

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const rank = require("../demographics-rank.js");
const scale = require("../demographics-scale.js");
const pre1950 = require("../pre1950-baselines.js");

const root = path.join(__dirname, "..");
const read = rel => JSON.parse(fs.readFileSync(path.join(root, rel), "utf8"));
const en = read("i18n/en.json").demographics;
const demo = read("data/demographics.json");
const origin = read("data/demographics/origin_series_FR_DE_ES.json");
const preBy = pre1950.indexRows(read("data/demographics/baseline_pre1950.json"));

const CENSUS_HEADER = "Verified census baselines: hard counts from national census records";
const PROXY_HEADER = "Modeled estimates: UN interpolated share where a direct census baseline isn't in hand";

assert.strictEqual(en.group_census, CENSUS_HEADER);
assert.strictEqual(en.group_proxy, PROXY_HEADER);
assert.strictEqual(rank.HEADER_KEYS.census, "group_census");
assert.strictEqual(rank.HEADER_KEYS.proxy, "group_proxy");

// Same split as rankedKind. A pre-1950 baseline the map uses, or a census
// score, is the census block. Anything else that still shows a figure is
// the UN block, including census-limited rows that display the UN figure.
function preUsed(c) {
  if (!c) return null;
  const resolved = pre1950.resolve(preBy[c.iso3] || preBy[c.id], c, origin, scale);
  return resolved && resolved.use ? resolved : null;
}

function displayValue(c) {
  const pre = preUsed(c);
  if (pre) return { kind: "census", value: pre.change, pre: pre };
  if (c && c.score_kind === "census" && c.census) {
    const census = scale.relativeChange(
      c.census.latest_share_in_founding_pool,
      c.census.first_share_in_founding_pool,
      1
    );
    if (census != null) return { kind: "census", value: census, pre: null };
  }
  if (!c || c.cross_pool_fb_pct_1990 == null || c.cross_pool_fb_pct_1990 === "") return { kind: "none", value: null, pre: null };
  if (c.cross_pool_fb_pct_2020 == null || c.cross_pool_fb_pct_2020 === "") return { kind: "none", value: null, pre: null };
  const proxy = scale.relativeChange(
    100 - Number(c.cross_pool_fb_pct_2020),
    100 - Number(c.cross_pool_fb_pct_1990),
    2
  );
  if (proxy == null) return { kind: "none", value: null, pre: null };
  return { kind: "proxy", value: proxy, pre: null };
}

function kindOf(c) {
  return displayValue(c).kind;
}

function compareHigh(a, b) {
  const sa = displayValue(a).value;
  const sb = displayValue(b).value;
  if (sa == null && sb == null) return String(a.name).localeCompare(String(b.name));
  if (sa == null) return 1;
  if (sb == null) return -1;
  return sa - sb || String(a.name).localeCompare(String(b.name));
}

// Scores that would interleave census and UN rows if sorted only by value.
const mixed = [
  { id: "QAT", name: "Qatar", kind: "proxy", value: -40 },
  { id: "CAN", name: "Canada", kind: "census", value: -10 },
  { id: "AUS", name: "Australia", kind: "proxy", value: -5, limited: true },
  { id: "ZAF", name: "South Africa", kind: "census", value: -50 },
  { id: "XXX", name: "Nowhere", kind: "none", value: null }
];
function mixedKind(c) { return c.kind; }
function mixedCompare(a, b) {
  if (a.value == null && b.value == null) return a.name.localeCompare(b.name);
  if (a.value == null) return 1;
  if (b.value == null) return -1;
  return a.value - b.value || a.name.localeCompare(b.name);
}

let sawHeader = false;
const sortedMixed = rank.sortGrouped(mixed, mixedKind, (a, b) => {
  if (!a.id || !b.id || a.type === "header" || b.type === "header") sawHeader = true;
  return mixedCompare(a, b);
});
assert.strictEqual(sawHeader, false, "sort compares countries only");
assert.deepStrictEqual(sortedMixed.map(c => c.id), ["ZAF", "CAN", "QAT", "AUS", "XXX"]);

const mixedRows = rank.withGroupHeaders(sortedMixed, mixedKind);
assert.deepStrictEqual(mixedRows.map(r => r.type === "header" ? "h:" + r.key : r.country.id), [
  "h:group_census", "ZAF", "CAN", "h:group_proxy", "QAT", "AUS", "XXX"
]);
assert.ok(mixedRows.filter(r => r.type === "header").every(r => r.country == null));

// Name order stays inside each block. A proxy name that sorts first
// still waits until the census block is finished.
const byName = rank.sortGrouped(mixed, mixedKind, (a, b) => a.name.localeCompare(b.name));
assert.deepStrictEqual(byName.map(c => c.id), ["CAN", "ZAF", "AUS", "QAT", "XXX"]);

// A filter that leaves only the census-limited UN row keeps the UN header
// and drops the census header. The header itself is not a filter hit.
const limitedOnly = mixed.filter(c => c.limited);
const limitedRows = rank.withGroupHeaders(rank.sortGrouped(limitedOnly, mixedKind, mixedCompare), mixedKind);
assert.deepStrictEqual(limitedRows.map(r => r.type === "header" ? "h:" + r.kind : r.country.id), ["h:proxy", "AUS"]);

const censusHtml = rank.groupHeaderMarkup("census", en.group_census);
const proxyHtml = rank.groupHeaderMarkup("proxy", en.group_proxy);
assert.ok(censusHtml.includes(CENSUS_HEADER));
assert.ok(proxyHtml.includes(PROXY_HEADER));
assert.ok(censusHtml.includes('class="dv-group-head"'));
assert.ok(proxyHtml.includes('class="dv-group-head is-proxy"'));
assert.ok(censusHtml.includes('class="dv-group-label"'));
assert.ok(!censusHtml.includes("data-id"));
assert.ok(!censusHtml.includes("dv-bar-btn"));
assert.ok(!proxyHtml.includes("data-id"));
assert.ok(rank.groupHeaderMarkup("census", 'A & B <C> "D"').includes("A &amp; B &lt;C&gt; &quot;D&quot;"));

const countries = demo.countries.slice();
const sorted = rank.sortGrouped(countries, kindOf, compareHigh);
const rows = rank.withGroupHeaders(sorted, kindOf);
const headers = rows.filter(r => r.type === "header");
assert.deepStrictEqual(headers.map(h => h.key), ["group_census", "group_proxy"]);

let open = null;
rows.forEach(r => {
  if (r.type === "header") {
    assert.notStrictEqual(open, r.kind, "one header per kind");
    open = r.kind;
    return;
  }
  if (r.kind === "census" || r.kind === "proxy") assert.strictEqual(open, r.kind);
});

const ids = rows.filter(r => r.type === "row").map(r => r.country.id);
const censusIds = rows.filter(r => r.type === "row" && r.kind === "census").map(r => r.country.id);
const proxyIds = rows.filter(r => r.type === "row" && r.kind === "proxy").map(r => r.country.id);
assert.ok(censusIds.length > 0 && proxyIds.length > 0);
assert.deepStrictEqual(ids.slice(0, censusIds.length), censusIds);
assert.deepStrictEqual(ids.slice(censusIds.length, censusIds.length + proxyIds.length), proxyIds);

function nonDecreasing(list) {
  for (let i = 1; i < list.length; i++) {
    const prev = displayValue(list[i - 1]).value;
    const cur = displayValue(list[i]).value;
    assert.ok(prev <= cur, list[i - 1].id + " then " + list[i].id);
  }
}
nonDecreasing(censusIds.map(id => countries.find(c => c.id === id)));
nonDecreasing(proxyIds.map(id => countries.find(c => c.id === id)));

["AUS", "ISR"].forEach(id => {
  const c = countries.find(row => row.id === id);
  assert.strictEqual(c.availability, "census_limited", id);
  assert.strictEqual(kindOf(c), "proxy", id + " displays the UN figure");
  assert.ok(proxyIds.includes(id), id + " stays in the UN block");
});

["DEU", "FRA", "ESP", "ITA", "GBR", "IRL", "NZL"].forEach(id => {
  const c = countries.find(row => row.id === id);
  const shown = displayValue(c);
  assert.ok(shown.pre && shown.pre.use, id + " uses a pre-1950 census baseline");
  assert.strictEqual(shown.kind, "census", id);
  assert.ok(censusIds.includes(id), id + " sits under the census heading");
});
const italy = displayValue(countries.find(row => row.id === "ITA"));
assert.strictEqual(italy.pre.first_year, 1936);
assert.strictEqual(italy.pre.latest_year, 2020);
assert.strictEqual(italy.value, -4.5);
const australia = pre1950.resolve(preBy.AUS, countries.find(row => row.id === "AUS"), origin, scale);
assert.strictEqual(australia.use, false);

const html = rows.map(r => {
  if (r.type === "header") return rank.groupHeaderMarkup(r.kind, en[r.key]);
  return `<li class="dv-bar-item" data-id="${r.country.id}"></li>`;
}).join("");
const firstCensus = censusIds[0];
const firstProxy = proxyIds[0];
assert.ok(html.includes(CENSUS_HEADER));
assert.ok(html.includes(PROXY_HEADER));
assert.ok(html.indexOf(CENSUS_HEADER) < html.indexOf('data-id="' + firstCensus + '"'));
assert.ok(html.indexOf(PROXY_HEADER) < html.indexOf('data-id="' + firstProxy + '"'));
assert.ok(html.indexOf(CENSUS_HEADER) < html.indexOf(PROXY_HEADER));
assert.ok(html.indexOf('data-id="' + censusIds[censusIds.length - 1] + '"') < html.indexOf(PROXY_HEADER));

const page = fs.readFileSync(path.join(root, "demographics.js"), "utf8");
const css = fs.readFileSync(path.join(root, "demographics.css"), "utf8");
const htmlPage = fs.readFileSync(path.join(root, "index.html"), "utf8");
assert.ok(page.includes("function rankedKind"));
assert.ok(page.includes('if (pre1950Used(c) || isCensusScore(c)) return "census"'));
assert.ok(page.includes('if (displayValue(c) != null) return "proxy"'));
assert.ok(page.includes("Rank.sortGrouped"));
assert.ok(page.includes("Rank.withGroupHeaders"));
assert.ok(page.includes("Rank.groupHeaderMarkup"));
assert.ok(!page.includes(CENSUS_HEADER), "header text comes from i18n");
assert.ok(!page.includes(PROXY_HEADER), "header text comes from i18n");
assert.ok(!page.includes('"ZAF"') && !page.includes('"KAZ"'), "headers are not anchored to country ids");

const filterFn = page.slice(page.indexOf("function filteredCountries"), page.indexOf("function barHead"));
assert.ok(filterFn.includes("Rank.sortGrouped"));
assert.ok(!filterFn.includes("withGroupHeaders"));
assert.ok(!filterFn.includes("groupHeaderMarkup"));

assert.ok(/\.dv-group-head \.dv-group-label\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/.test(css));
const preTag = htmlPage.indexOf('src="pre1950-baselines.js"');
const rankTag = htmlPage.indexOf('src="demographics-rank.js"');
const pageTag = htmlPage.indexOf('src="demographics.js"');
assert.ok(preTag > 0 && rankTag > preTag && pageTag > rankTag);

console.log("ranked-table-headings.test.js: ok");
console.log("census block " + censusIds[0] + " .. " + censusIds[censusIds.length - 1] + " (" + censusIds.length + ")");
console.log("UN block " + proxyIds[0] + " .. " + proxyIds[proxyIds.length - 1] + " (" + proxyIds.length + ")");
