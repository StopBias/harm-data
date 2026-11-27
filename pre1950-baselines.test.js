"use strict";

// Run: node pre1950-baselines.test.js
// Score preview for the stacked map PR. Does not write repo scores.

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const scale = require("./demographics-scale.js");
const api = require("./pre1950-baselines.js");
const pre = require("./data/demographics/baseline_pre1950.json");
const demo = require("./data/demographics.json");
const origin = require("./data/demographics/origin_series_FR_DE_ES.json");

const byIso = Object.fromEntries(demo.countries.map(c => [c.id, c]));
const preBy = api.indexRows(pre);
const bandName = {
  growing: "Growing",
  little: "Stable",
  light: "Declining",
  medium: "Strongly declining",
  dark: "Very strongly declining"
};

function currentDisplay(c) {
  const ce = c.census || {};
  if (c.score_kind === "census" && ce.latest_share_in_founding_pool != null && ce.first_share_in_founding_pool != null) {
    const change = scale.relativeChange(ce.latest_share_in_founding_pool, ce.first_share_in_founding_pool, 1);
    return { kind: "census", change, band: bandName[scale.bandIdForChange(change, 1)], first_year: ce.first_year, latest_year: ce.latest_year, first: ce.first_share_in_founding_pool, latest: ce.latest_share_in_founding_pool };
  }
  const first = 100 - Number(c.cross_pool_fb_pct_1990);
  const latest = 100 - Number(c.cross_pool_fb_pct_2020);
  const change = scale.relativeChange(latest, first, 2);
  return { kind: "UN proxy", change, band: bandName[scale.bandIdForChange(change, 2)], first_year: 1990, latest_year: 2020, first, latest };
}

const expectedBefore = {
  DEU: { change: -3.13, band: "Declining" },
  FRA: { change: -2.35, band: "Declining" },
  ESP: { change: -7.73, band: "Strongly declining" },
  GBR: { change: -13.2, band: "Strongly declining" },
  IRL: { change: -7.2, band: "Strongly declining" },
  NZL: { change: -16.5, band: "Very strongly declining" },
  AUS: { change: -11.81, band: "Strongly declining" },
  ITA: { change: -3.91, band: "Declining" }
};

const expectedAfter = {
  DEU: { change: -11.7, band: "Strongly declining", first_year: 1933, latest_year: 2024, first: 99.98, latest: 88.29 },
  FRA: { change: -13.1, band: "Strongly declining", first_year: 1931, latest_year: 2021, first: 99.54, latest: 86.47 },
  ESP: { change: -15.3, band: "Very strongly declining", first_year: 1930, latest_year: 2026, first: 99.94, latest: 84.63 },
  GBR: { change: -17.5, band: "Very strongly declining", first_year: 1931, latest_year: 2021, first: 98.98, latest: 81.7 },
  IRL: { change: -12.2, band: "Strongly declining", first_year: 1936, latest_year: 2022, first: 99.49, latest: 87.4 },
  NZL: { change: -28.1, band: "Very strongly declining", first_year: 1936, latest_year: 2023, first: 94.33, latest: 67.8 },
  ITA: { change: -4.5, band: "Declining", first_year: 1936, latest_year: 2020, first: 99.98, latest: 95.467 }
};

const before = {};
const after = {};
["DEU","FRA","ESP","GBR","IRL","AUS","NZL","ITA"].forEach(iso => {
  before[iso] = currentDisplay(byIso[iso]);
  after[iso] = api.resolve(preBy[iso], byIso[iso], origin, scale);
});

Object.keys(expectedBefore).forEach(iso => {
  assert.strictEqual(before[iso].change, expectedBefore[iso].change, iso + " before change");
  assert.strictEqual(before[iso].band, expectedBefore[iso].band, iso + " before band");
});

Object.keys(expectedAfter).forEach(iso => {
  const got = after[iso];
  const exp = expectedAfter[iso];
  assert.strictEqual(got.use, true, iso + " should score");
  assert.strictEqual(got.change, exp.change, iso + " change");
  assert.strictEqual(bandName[got.band_id], exp.band, iso + " band");
  assert.strictEqual(got.first_year, exp.first_year, iso + " first year");
  assert.strictEqual(got.latest_year, exp.latest_year, iso + " latest year");
  assert.strictEqual(got.first_share, exp.first, iso + " first share");
  assert.strictEqual(got.latest_share, exp.latest, iso + " latest share");
  assert.strictEqual(got.definition_break, true, iso + " break flag");
});

assert.strictEqual(after.AUS.use, false);
assert.strictEqual(after.AUS.reason, "no_comparable_official_latest_share");
assert.strictEqual(after.AUS.indicator.year, 1911);
assert.strictEqual(after.AUS.indicator.share, 98.83);
assert.strictEqual(before.AUS.change, -11.81);
assert.strictEqual(before.AUS.band, "Strongly declining");

assert.strictEqual(after.ITA.use, true);
assert.strictEqual(after.ITA.latest_source, "un_proxy");
assert.strictEqual(after.ITA.change, -4.5);
assert.strictEqual(bandName[after.ITA.band_id], "Declining");
assert.strictEqual(before.ITA.change, -3.91);
assert.strictEqual(before.ITA.band, "Declining");
assert.strictEqual(before.ITA.latest_year, 2020);
assert.strictEqual(before.ITA.latest, after.ITA.latest_share);

// Existing scores of other countries are not this module's job; a USA check
// just confirms we do not invent a pre-1950 row for them.
assert.ok(!preBy.USA);
assert.ok(!preBy.CAN);


const page = fs.readFileSync(path.join(__dirname, "demographics.js"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
assert.ok(page.includes("Pre1950Baselines"), "page calls the resolver");
assert.ok(page.includes("data/demographics/baseline_pre1950.json"), "page loads the baseline file");
assert.ok(!page.includes("pre1950View"), "no pre-1950 toggle state");
assert.ok(html.includes('src="pre1950-baselines.js"'), "page script tag");

console.log("pre-1950 map scoring preview");
["DEU","FRA","ESP","GBR","IRL","AUS","NZL","ITA"].forEach(iso => {
  const b = before[iso];
  const a = after[iso];
  const afterTxt = a.use
    ? (a.change + "% " + bandName[a.band_id] + " (" + a.first_year + " " + a.first_share + "% -> " + a.latest_year + " " + a.latest_share + "%)")
    : ("unchanged " + b.change + "% " + b.band + " (" + a.reason + ")");
  console.log(iso + " BEFORE " + b.change + "% " + b.band + " (" + b.kind + " " + b.first_year + "->" + b.latest_year + ")  AFTER " + afterTxt);
});
console.log("pre-1950 map scoring checks passed");
