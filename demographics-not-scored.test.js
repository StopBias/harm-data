// The not-scored list is grey on the map and absent from the ranked table.
// Run: node demographics-not-scored.test.js
"use strict";

var assert = require("assert");
var fs = require("fs");
var path = require("path");
var scale = require("./demographics-scale.js");
var api = require("./demographics-not-scored.js");

var root = __dirname;
var demo = JSON.parse(fs.readFileSync(path.join(root, "data/demographics.json"), "utf8"));
var list = JSON.parse(fs.readFileSync(path.join(root, "data/demographics/not_scored.json"), "utf8"));
var page = fs.readFileSync(path.join(root, "demographics.js"), "utf8");
var html = fs.readFileSync(path.join(root, "index.html"), "utf8");
var byIso = {};
demo.countries.forEach(function (c) { if (c.iso3) byIso[c.iso3] = c; });

var NAMED = ["QAT", "ABW", "BHR", "ARE", "OMN", "NIU", "PLW", "KWT", "MTQ", "SUR", "GUY", "TTO", "MEX", "BOL", "GRL", "SPM"];
var STAY = ["FLK", "FRO", "IMN", "AND", "LIE", "MCO", "SMR"];
var NO_SCORE = "#b9bfc4";

function shown(c) {
  if (c.score_kind === "census" && c.census) {
    return {
      kind: "census",
      value: scale.relativeChange(c.census.latest_share_in_founding_pool, c.census.first_share_in_founding_pool, 1),
      digits: 1
    };
  }
  var first = 100 - Number(c.cross_pool_fb_pct_1990);
  var latest = 100 - Number(c.cross_pool_fb_pct_2020);
  return { kind: "proxy", value: scale.relativeChange(latest, first, 2), digits: 2 };
}

function scoredColor(c) {
  var row = shown(c);
  if (row.value == null) return null;
  var band = scale.bandForChange(row.value, row.digits);
  return band ? band.color : null;
}

assert.strictEqual(api.NO_SCORE, NO_SCORE);
assert.strictEqual(list.no_score_color, NO_SCORE);
assert.strictEqual(demo.scale.no_score_color, NO_SCORE);
assert.strictEqual(list.population.field, "pop_2024");
assert.strictEqual(list.population.year, 2024);
assert.strictEqual(list.population.threshold, 100000);
assert.strictEqual(list.population.comparison, "strictly_below");
assert.ok(list.population.source.indexOf("World Population Prospects 2024") !== -1);

assert.deepStrictEqual(list.named.map(function (a) { return a.iso3; }), NAMED);
assert.deepStrictEqual(list.stay_scored.map(function (a) { return a.iso3; }), STAY);

// The explicit list is the population rule plus the named set, nothing else.
var expected = {};
NAMED.forEach(function (iso) { expected[iso] = true; });
demo.countries.forEach(function (c) {
  if (!c.iso3) return;
  var under = c.pop_2024 < list.population.threshold;
  assert.strictEqual(!!c.small_population, under, c.iso3 + " small_population");
  if (under && STAY.indexOf(c.iso3) === -1) expected[c.iso3] = true;
});
STAY.forEach(function (iso) { delete expected[iso]; });
var expectedIsos = Object.keys(expected).sort();
var listedIsos = list.areas.map(function (a) { return a.iso3; });
assert.deepStrictEqual(listedIsos.slice().sort(), expectedIsos);
assert.deepStrictEqual(listedIsos, expectedIsos.slice(), "areas are stored in ISO3 order");

var held = api.open(list);
var all = demo.views[0].groups.find(function (g) { return g.id === "all"; });
assert.ok(all && all.members.length === demo.countries.length);
var members = all.members.map(function (id) {
  return demo.countries.find(function (c) { return c.id === id || c.iso3 === id; });
});
var ranked = held.ranked(members);
var rankedIsos = {};
ranked.forEach(function (c) { rankedIsos[c.iso3 || c.id] = true; });

list.areas.forEach(function (area) {
  var c = byIso[area.iso3];
  assert.ok(c, area.iso3 + " row remains in demographics.json");
  assert.strictEqual(area.pop_2024, c.pop_2024, area.iso3 + " population");
  assert.strictEqual(area.name, c.name, area.iso3 + " name");
  assert.ok(area.popup.indexOf("Not scored") === 0, area.iso3 + " popup heading");
  assert.ok(area.popup.indexOf(area.reason) !== -1, area.iso3 + " popup reason");
  assert.strictEqual(held.popupText(c), area.popup);
  assert.strictEqual(held.isNotScored(area.iso3), true);
  var before = scoredColor(c);
  assert.ok(before && before !== NO_SCORE, area.iso3 + " had a score colour");
  var fill = held.mapColor(c, true, before, { noScore: NO_SCORE, outOfGroup: "#eceeef" });
  assert.strictEqual(fill, NO_SCORE, area.iso3 + " map fill");
  assert.strictEqual(rankedIsos[area.iso3], undefined, area.iso3 + " ranked table");
});

STAY.forEach(function (iso) {
  var c = byIso[iso];
  assert.ok(c, iso);
  assert.ok(c.pop_2024 < 100000, iso + " is under 100,000");
  assert.strictEqual(held.isNotScored(c), false, iso + " stays scored");
  assert.strictEqual(held.popupText(c), null, iso + " has no not-scored popup");
  var color = scoredColor(c);
  assert.ok(color && color !== NO_SCORE, iso + " score colour");
  assert.strictEqual(held.mapColor(c, true, color, { noScore: NO_SCORE }), color, iso + " map fill");
  assert.strictEqual(rankedIsos[iso], true, iso + " ranked table");
});

// Mexico and Bolivia keep their census rows. The tab does not score them.
["MEX", "BOL"].forEach(function (iso) {
  var c = byIso[iso];
  assert.strictEqual(c.availability, "census", iso);
  assert.strictEqual(c.score_kind, "census", iso);
  assert.ok(c.census && c.census.rows, iso + " census rows");
  assert.ok(c.census.change_outside_founding_pool != null, iso + " stored change");
  assert.ok(c.census.first_share_in_founding_pool != null, iso + " first share");
  assert.ok(c.census.latest_share_in_founding_pool != null, iso + " latest share");
});
assert.strictEqual(byIso.MEX.score, 1.4);
assert.strictEqual(byIso.BOL.score, 23.3);

var counts = held.roster(demo.countries);
assert.strictEqual(counts.stored.census, 30);
assert.strictEqual(counts.stored.census_limited, 5);
assert.strictEqual(counts.stored.estimate, 196);
assert.strictEqual(counts.stored.none, 0);
assert.strictEqual(demo.counts.stored.census, counts.stored.census);
assert.strictEqual(demo.counts.stored.census_limited, counts.stored.census_limited);
assert.strictEqual(demo.counts.stored.estimate, counts.stored.estimate);
assert.strictEqual(demo.counts.stored.none, counts.stored.none);
assert.strictEqual(demo.counts.countries, 231);
assert.strictEqual(demo.counts.census, counts.scored.census);
assert.strictEqual(demo.counts.census_limited, counts.scored.census_limited);
assert.strictEqual(demo.counts.estimate, counts.scored.estimate);
assert.strictEqual(demo.counts.none, counts.scored.none);
assert.strictEqual(demo.counts.not_scored, counts.scored.not_scored);
assert.strictEqual(demo.counts.scored, counts.scored.scored);
assert.strictEqual(demo.counts.census + demo.counts.census_limited + demo.counts.estimate + demo.counts.none, demo.counts.scored);
assert.strictEqual(demo.counts.scored + demo.counts.not_scored, demo.counts.countries);

assert.ok(page.indexOf("notScored.mapColor") !== -1, "map fill uses the list");
assert.ok(page.indexOf("notScored.ranked") !== -1, "ranked table uses the list");
assert.ok(page.indexOf("notScored.popupText") !== -1, "popup uses the list");
assert.ok(page.indexOf("data/demographics/not_scored.json") !== -1, "page loads the list");
assert.ok(html.indexOf('src="demographics-not-scored.js"') !== -1, "script tag");
assert.ok(html.indexOf("demographics-not-scored.js") < html.indexOf('src="demographics.js"'), "script order");

// The page must not reimplement the cutoff beside the list.
assert.strictEqual(page.indexOf("pop_2024"), -1, "page does not test population itself");
assert.strictEqual(page.indexOf("100000"), -1, "page does not test the cutoff itself");

console.log("not-scored list: " + list.areas.length + " areas grey, " + STAY.length + " small areas stay scored");
