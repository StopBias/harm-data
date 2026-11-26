"use strict";

// Fold-in of Adi v1.13.0 census series. Run: node test/adi_v113_census.test.js
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const scale = require("../demographics-scale.js");

const root = path.join(__dirname, "..");
const demo = JSON.parse(fs.readFileSync(path.join(root, "data/demographics.json"), "utf8"));
const byId = Object.fromEntries(demo.countries.map(c => [c.iso3, c]));

function display(c) {
  if (c.score_kind === "census" && c.census) {
    return scale.relativeChange(
      c.census.latest_share_in_founding_pool,
      c.census.first_share_in_founding_pool,
      1
    );
  }
  const first = 100 - Number(c.cross_pool_fb_pct_1990);
  const latest = 100 - Number(c.cross_pool_fb_pct_2020);
  return scale.relativeChange(latest, first, 2);
}

assert.strictEqual(demo.adi_dataset, "v1.13.0");
assert.strictEqual(demo.counts.countries, 231);
assert.strictEqual(demo.counts.stored.census, 30);
assert.strictEqual(demo.counts.stored.census_limited, 5);
assert.strictEqual(demo.counts.stored.estimate, 196);
assert.strictEqual(demo.counts.census, 25);
assert.strictEqual(demo.counts.census_limited, 5);
assert.strictEqual(demo.counts.estimate, 164);
assert.strictEqual(demo.counts.not_scored, 37);
assert.strictEqual(demo.counts.scored, 194);
assert.strictEqual(demo.countries.filter(c => c.availability === "census").length, 30);
assert.strictEqual(demo.countries.length, 231);

// Existing headline figures are unchanged.
assert.strictEqual(byId.CAN.score, 27.8);
assert.strictEqual(byId.USA.score, 25.4);
assert.strictEqual(byId.CAN.census.first_year, 1971);
assert.strictEqual(byId.CAN.census.first_share_in_founding_pool, 96.3);
assert.strictEqual(byId.CAN.census.latest_share_in_founding_pool, 68.5);

// South Africa stays on the live ethnic European series (PR #51), not Adi's SSA majority.
assert.strictEqual(byId.ZAF.score_kind, "census");
assert.strictEqual(byId.ZAF.census.founding_pool, "EUR");
assert.strictEqual(byId.ZAF.primary_pool, "EUR");
assert.strictEqual(byId.ZAF.census.first_year, 1946);
assert.strictEqual(byId.ZAF.census.latest_year, 2022);
assert.strictEqual(byId.ZAF.census.first_share_in_founding_pool, 20.8);
assert.strictEqual(byId.ZAF.census.latest_share_in_founding_pool, 7.3);
assert.strictEqual(byId.ZAF.score, 13.5);

// Turkey stays locked to the Middle East.
assert.strictEqual(byId.TUR.primary_pool, "MENA");

// Five new census scores, actual years, Adi's published figures.
const scored = {
  RUS: { first: 2002, latest: 2021, firstShare: 83.7, latestShare: 81.8, pp: 1.9, d: 1.9, pool: "EUR", shown: -2.3, band: "light" },
  LTU: { first: 2001, latest: 2021, firstShare: 98.4, latestShare: 97.6, pp: 0.8, d: 0.8, pool: "EUR", shown: -0.8, band: "little" },
  UKR: { first: 1989, latest: 2001, firstShare: 98.2, latestShare: 97.8, pp: 0.4, d: 1.1, pool: "EUR", shown: -0.4, band: "little" },
  KEN: { first: 2009, latest: 2019, firstShare: 98.0, latestShare: 99.13, pp: -1.1, d: 1.1, pool: "SSA", shown: 1.2, band: "little" },
  LKA: { first: 1971, latest: 2012, firstShare: 99.18, latestShare: 99.5, pp: -0.3, d: 0.3, pool: "SAS", shown: 0.3, band: "little" }
};
for (const [iso, exp] of Object.entries(scored)) {
  const c = byId[iso];
  assert.strictEqual(c.availability, "census", iso);
  assert.strictEqual(c.score_kind, "census", iso);
  assert.strictEqual(c.score, exp.pp, iso);
  assert.strictEqual(c.census.founding_pool, exp.pool, iso);
  assert.strictEqual(c.census.first_year, exp.first, iso);
  assert.strictEqual(c.census.latest_year, exp.latest, iso);
  assert.strictEqual(c.census.first_share_in_founding_pool, exp.firstShare, iso);
  assert.strictEqual(c.census.latest_share_in_founding_pool, exp.latestShare, iso);
  assert.strictEqual(c.census.census_D_first_latest, exp.d, iso);
  assert.ok(c.census.rows[String(exp.first)], iso + " first-year row");
  assert.ok(c.census.rows[String(exp.latest)], iso + " latest-year row");
  assert.strictEqual(display(c), exp.shown, iso + " displayed change");
  assert.strictEqual(scale.bandIdForChange(display(c), 1), exp.band, iso + " band");
}

assert.strictEqual(byId.RUS.census.concept_break, true);
assert.strictEqual(byId.LTU.census.concept_break, true);
assert.ok(byId.UKR.census.notes.includes("No census since 2001"));
assert.ok(byId.LKA.census.notes.includes("18 of 25 districts"));

// Limited series: official data stored, UN proxy remains the score.
for (const iso of ["PER", "IDN", "ZWE", "AUS", "ISR"]) {
  const c = byId[iso];
  assert.strictEqual(c.availability, "census_limited", iso);
  assert.strictEqual(c.score_kind, "estimate", iso);
  assert.ok(c.census, iso);
}
assert.strictEqual(byId.PER.census.weak_proxy, true);
assert.strictEqual(byId.PER.census.first_year, 1993);
assert.strictEqual(byId.PER.census.latest_year, 2017);
assert.strictEqual(byId.PER.census.first_share_in_founding_pool, 19.54);
assert.strictEqual(byId.PER.census.latest_share_in_founding_pool, 16.33);
assert.strictEqual(byId.PER.census.change_outside_founding_pool, 3.2);
assert.strictEqual(byId.PER.score, 0.161); // UN D, not the 3.2 proxy change
assert.strictEqual(byId.IDN.census.latest_year, 2010);
assert.strictEqual(byId.IDN.census.latest_share_in_founding_pool, 97.6);
assert.strictEqual(byId.IDN.census.first_share_in_founding_pool, null);
assert.strictEqual(byId.IDN.census.change_outside_founding_pool, null);
assert.strictEqual(byId.ZWE.census.latest_year, 2022);
assert.strictEqual(byId.ZWE.census.latest_share_in_founding_pool, 99.6);
assert.strictEqual(byId.ZWE.census.change_outside_founding_pool, null);

// Source-line upgrades; figures unchanged.
assert.strictEqual(byId.BOL.score, 23.3);
assert.ok(byId.BOL.census.source.includes("AUTOIDENTIFICACIÓN.xlsx"));
assert.ok(!/press reports/i.test(byId.BOL.census.notes));
assert.strictEqual(byId.KGZ.score, -26.5);
assert.ok(byId.KGZ.census.source.includes("Book II"));
assert.ok(byId.KGZ.census.notes.includes("5,379,020"));
assert.strictEqual(byId.VNM.score, -0.6);
assert.ok(byId.VNM.census.notes.includes("749,466"));

// Nepal / Laos mapping left as-is (provisional).
assert.strictEqual(byId.NPL.primary_pool, "SAS");
assert.ok(byId.NPL.straddles.includes("EAS"));
assert.strictEqual(byId.LAO.primary_pool, "SEA");

// v1.14.0 / v1.15.0 supplements stay in place; this PR does not re-add a toggle.
assert.ok(fs.existsSync(path.join(root, "data/demographics/origin_series_FR_DE_ES.json")));
assert.ok(fs.existsSync(path.join(root, "data/demographics/baseline_1960_1979.json")));
const js = fs.readFileSync(path.join(root, "demographics.js"), "utf8");
// The 1960-79 view may still be in main; this PR must not add new toggle wiring.
assert.ok(!js.includes("re-add"));

// Italy is not recoded here.
assert.strictEqual(byId.ITA.score_kind, "estimate");
assert.ok(!byId.ITA.census);

console.log("adi_v113_census.test.js: ok");
