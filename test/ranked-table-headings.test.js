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

const CENSUS_HEADER = "Census data";
const PROXY_HEADER = "Proxies";

assert.strictEqual(en.ranked_h, "Founding population, census first");
assert.ok(en.ranked_desc.indexOf("dash") !== -1);
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

const censusHtml = rank.sectionRowMarkup("census", en.group_census);
const proxyHtml = rank.sectionRowMarkup("proxy", en.group_proxy);
assert.ok(censusHtml.includes(CENSUS_HEADER));
assert.ok(proxyHtml.includes(PROXY_HEADER));
assert.ok(censusHtml.includes('class="dv-rank-section"'));
assert.ok(proxyHtml.includes('class="dv-rank-section is-proxy"'));
assert.ok(censusHtml.includes('colspan="7"'));
assert.ok(proxyHtml.includes('colspan="7"'));
assert.ok(!censusHtml.includes("data-id"));
assert.ok(!/concept break/i.test(censusHtml + proxyHtml));
assert.ok(rank.sectionRowMarkup("census", 'A & B <C> "D"').includes("A &amp; B &lt;C&gt; &quot;D&quot;"));
assert.deepStrictEqual(rank.COLUMN_KEYS, [
  "col_country",
  "col_first_year",
  "col_first_count",
  "col_first_share",
  "col_latest_year",
  "col_latest_count",
  "col_rel_change"
]);
assert.strictEqual(en.col_first_year, "First year");
assert.strictEqual(en.col_first_count, "First-year founding population");
assert.strictEqual(en.col_first_share, "First-year founding share");
assert.strictEqual(en.col_latest_year, "Latest year");
assert.strictEqual(en.col_latest_count, "Latest founding population");
assert.strictEqual(en.col_rel_change, "Change in founding share");
assert.ok(!/concept break/i.test(en.pre1950_break));
assert.ok(!/concept break/i.test(en.pre1950_break_un));
assert.ok(!/concept break/i.test(en.pre1950_tooltip));
assert.ok(en.pre1950_break.startsWith("Early figure:"));
assert.strictEqual(rank.storedCount(null), null);
assert.strictEqual(rank.storedCount(""), null);
assert.strictEqual(rank.storedCount(44338092), 44338092);

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
  if (r.type === "header") return rank.sectionRowMarkup(r.kind, en[r.key]);
  return `<tr class="dv-rank-row" data-id="${r.country.id}"></tr>`;
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
assert.ok(page.includes('t("ranked_h")'));
assert.ok(page.includes("Rank.sectionRowMarkup"));
assert.ok(page.includes("Rank.countryRowMarkup"));
assert.ok(page.includes("Rank.columnHeadMarkup"));
assert.ok(page.includes("ethnic_european_count"));
assert.ok(!page.includes(CENSUS_HEADER), "header text comes from i18n");
assert.ok(!page.includes(PROXY_HEADER), "header text comes from i18n");
assert.ok(!page.includes('"ZAF"') && !page.includes('"KAZ"'), "headers are not anchored to country ids");

const filterFn = page.slice(page.indexOf("function filteredCountries"), page.indexOf("function rankSpec"));
assert.ok(filterFn.includes("Rank.sortGrouped"));
assert.ok(!filterFn.includes("withGroupHeaders"));
assert.ok(!filterFn.includes("sectionRowMarkup"));

const renderFn = page.slice(page.indexOf("function renderBars"), page.indexOf("function highlightBar"));
assert.ok(!renderFn.includes("flag_concept"), "ranked table does not render the concept-break label");
assert.ok(!/concept break/i.test(renderFn));
assert.ok(css.includes('colspan="7"') || renderFn.includes("sectionRowMarkup"));
assert.ok(/\.dv-rank-label\s*\{[^}]*white-space:\s*normal/.test(css));
const preTag = htmlPage.indexOf('src="pre1950-baselines.js"');
const rankTag = htmlPage.indexOf('src="demographics-rank.js"');
const pageTag = htmlPage.indexOf('src="demographics.js"');
assert.ok(preTag > 0 && rankTag > preTag && pageTag > rankTag);

function rowMarkup(id) {
  const c = countries.find(row => row.id === id);
  const resolved = pre1950.resolve(preBy[c.iso3] || preBy[c.id], c, origin, scale);
  const shown = displayValue(c);
  const spec = {
    id: c.id,
    name: c.name,
    color: "#e74c3c",
    pre: resolved && resolved.use ? resolved : null,
    preCount: resolved && resolved.use ? (preBy[c.iso3] || {}).ethnic_european_count : null,
    latestCount: null
  };
  if (!spec.pre && shown.kind === "census" && c.census) {
    spec.census = {
      first_year: c.census.first_year,
      latest_year: c.census.latest_year,
      first_share: c.census.first_share_in_founding_pool,
      latest_share: c.census.latest_share_in_founding_pool,
      change: shown.value
    };
  }
  if (!spec.pre && shown.kind === "proxy") {
    spec.proxy = {
      firstShare: 100 - Number(c.cross_pool_fb_pct_1990),
      latestShare: 100 - Number(c.cross_pool_fb_pct_2020),
      change: shown.value
    };
  }
  return rank.countryRowMarkup(spec, {
    year: v => String(v),
    count: v => String(v),
    share: v => String(v),
    change: v => String(v),
    changeProxy: v => String(v)
  });
}

["GBR", "ITA"].forEach(id => {
  const c = countries.find(row => row.id === id);
  const markup = rowMarkup(id);
  const label = markup.slice(markup.indexOf('class="dv-rank-label"'), markup.indexOf("</span>", markup.indexOf('class="dv-rank-label"')));
  assert.ok(label.includes(c.name), id + " name is present in full");
  assert.ok(!label.includes(c.name.slice(0, 1) + "</span>") || label.includes(c.name));
  assert.strictEqual((markup.match(new RegExp(c.name, "g")) || []).length >= 1, true);
  assert.ok(!/concept break/i.test(markup), id + " row has no concept-break label");
  assert.ok(!markup.includes("flag_concept"));
  assert.ok(!markup.includes("dv-small-flag") || !/concept/i.test(markup));
  const end = rank.rankedEndpoint({
    pre: pre1950.resolve(preBy[id], c, origin, scale),
    preCount: preBy[id].ethnic_european_count,
    latestCount: null
  });
  assert.strictEqual(end.kind, "census");
  assert.strictEqual(end.firstCount, preBy[id].ethnic_european_count);
  assert.strictEqual(end.latestCount, null);
  assert.ok(markup.includes(String(preBy[id].ethnic_european_count)));
  assert.ok(markup.includes("\u2014"));
});

const missingLatest = [];
const missingFirst = [];
const hasFirst = [];
countries.forEach(c => {
  const resolved = pre1950.resolve(preBy[c.iso3] || preBy[c.id], c, origin, scale);
  const end = rank.rankedEndpoint({
    pre: resolved && resolved.use ? resolved : null,
    preCount: resolved && resolved.use ? (preBy[c.iso3] || {}).ethnic_european_count : null,
    latestCount: null,
    census: !resolved.use && kindOf(c) === "census" ? { change: 0 } : null,
    proxy: !resolved.use && kindOf(c) === "proxy" ? { change: 0, firstShare: 1, latestShare: 1 } : null
  });
  if (end.latestCount == null) missingLatest.push(c.id);
  if (end.firstCount == null) missingFirst.push(c.id);
  else hasFirst.push(c.id);
});
assert.deepStrictEqual(hasFirst.sort(), ["DEU", "ESP", "FRA", "GBR", "IRL", "ITA", "NZL"]);
assert.strictEqual(missingLatest.length, countries.length);
assert.ok(missingFirst.includes("CAN"));
assert.ok(missingFirst.includes("AUS"));
assert.ok(!hasFirst.includes("AUS"));

console.log("ranked-table-headings.test.js: ok");
console.log("first-year count present: " + hasFirst.join(", "));
console.log("no first-year count: " + missingFirst.length + " countries");
console.log("no latest-year count: " + missingLatest.length + " countries");
console.log("census block " + censusIds[0] + " .. " + censusIds[censusIds.length - 1] + " (" + censusIds.length + ")");
console.log("UN block " + proxyIds[0] + " .. " + proxyIds[proxyIds.length - 1] + " (" + proxyIds.length + ")");
