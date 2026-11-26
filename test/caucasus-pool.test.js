"use strict";

// Caucasus founding pool (CAU). Run: node test/caucasus-pool.test.js
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const scale = require("../demographics-scale.js");

const root = path.join(__dirname, "..");
const read = rel => JSON.parse(fs.readFileSync(path.join(root, rel), "utf8"));

const demo = read("data/demographics.json");
const groups = read("data/demographics/caucasus_ethnic_groups.json");
const en = read("i18n/en.json");
const byId = Object.fromEntries(demo.countries.map(c => [c.iso3, c]));

function display(c) {
  if (c.score_kind === "census" && c.census
      && c.census.first_share_in_founding_pool != null
      && c.census.latest_share_in_founding_pool != null) {
    const v = scale.relativeChange(c.census.latest_share_in_founding_pool, c.census.first_share_in_founding_pool, 1);
    return { v, band: scale.bandIdForChange(v, 1), kind: "census" };
  }
  if (c.cross_pool_fb_pct_1990 == null || c.cross_pool_fb_pct_1990 === "") return { v: null, band: null, kind: c.score_kind };
  if (c.cross_pool_fb_pct_2020 == null || c.cross_pool_fb_pct_2020 === "") return { v: null, band: null, kind: c.score_kind };
  const v = scale.relativeChange(100 - Number(c.cross_pool_fb_pct_2020), 100 - Number(c.cross_pool_fb_pct_1990), 2);
  return { v, band: scale.bandIdForChange(v, 2), kind: "estimate" };
}

const poolIds = demo.pools.map(p => p.id);
assert.deepStrictEqual(poolIds, ["EUR", "MENA", "SAS", "EAS", "SEA", "SSA", "PAC", "AMI", "NAI", "CAU"]);
assert.strictEqual(demo.pools.find(p => p.id === "CAU").label, "Caucasus");
assert.strictEqual(en.demographics.pool_CAU, "Caucasus");

assert.strictEqual(byId.ARM.primary_pool, "CAU");
assert.strictEqual(byId.GEO.primary_pool, "CAU");
assert.strictEqual(byId.AZE.primary_pool, "MENA");
assert.strictEqual(byId.ARM.straddles, null);
assert.strictEqual(byId.GEO.straddles, null);
assert.strictEqual(byId.RUS.primary_pool, "EUR");
assert.ok(!/no separate Caucasus pool/i.test(byId.ARM.mapping_note));
assert.ok(!/no separate Caucasus pool/i.test(byId.GEO.mapping_note));
assert.ok(/not part of the Caucasus pool/.test(byId.AZE.mapping_note));

const founding = demo.views.find(v => v.id === "founding");
const filterIds = founding.groups.map(g => g.id);
assert.deepStrictEqual(filterIds, ["all", "EUR", "MENA", "SAS", "EAS", "SEA", "SSA", "anglosphere"]);
const eur = founding.groups.find(g => g.id === "EUR");
assert.ok(!eur.members.includes("ARM"));
assert.ok(!eur.members.includes("GEO"));
assert.ok(eur.members.includes("RUS"));
const all = founding.groups.find(g => g.id === "all");
assert.ok(all.members.includes("ARM"));
assert.ok(all.members.includes("GEO"));
assert.ok(all.members.includes("AZE"));

const cauCodes = groups.groups.filter(g => g.pool === "CAU").map(g => g.code);
assert.deepStrictEqual(cauCodes, [
  "GEO", "ARM", "CHE", "ING", "AVR", "DAR", "LEZ", "LAK", "TAB",
  "AGU", "RUT", "TSA", "KAB", "ADY", "CHR", "ABA", "BAL", "KRC",
  "OSS", "NOG", "KUM", "SHP", "ABK", "UDI"
]);
const judged = groups.groups.filter(g => g.judgement).map(g => g.code);
assert.deepStrictEqual(judged, ["OSS", "NOG", "KUM", "SHP", "ABK", "UDI"]);
assert.strictEqual(groups.not_cau.find(g => g.code === "AZE").pool, "MENA");
assert.strictEqual(groups.not_cau.find(g => g.code === "TAT").pool, "MENA");
assert.strictEqual(groups.origin_pool.ARM, "CAU");
assert.strictEqual(groups.origin_pool.GEO, "CAU");
assert.strictEqual(groups.origin_pool.AZE, "MENA");
assert.strictEqual(groups.origin_pool.recast_cross_pool_shares, false);
assert.strictEqual(groups.country_primary_pool.AZE, "MENA");

// Russia headline series: Caucasus peoples were unmapped, not inside ethnic European.
const rus = byId.RUS;
assert.strictEqual(rus.census.founding_pool, "EUR");
assert.strictEqual(rus.census.rows["2002"].EUR, 83.7);
assert.strictEqual(rus.census.rows["2010"].EUR, 83.0);
assert.strictEqual(rus.census.rows["2021"].EUR, 81.8);
assert.ok(/not inside EUR/.test(rus.census.notes));
assert.ok(/Azerbaijanis stay out of CAU/.test(rus.census.notes));
assert.ok(!rus.census.rows["2002"].CAU);

// Displayed scores are the figures already stored. No share was invented.
const shown = {
  RUS: { v: -2.3, band: "light" },
  GEO: { v: 0.62, band: "little" },
  ARM: { v: 2.19, band: "growing" },
  AZE: { v: 3.16, band: "growing" },
  FRA: { v: -2.29, band: "light" },
  USA: { v: -30.5, band: "dark" },
  LBN: { v: -0.16, band: "little" },
  UKR: { v: -0.4, band: "little" },
  EST: { v: -1.8, band: "little" }
};
for (const [iso, exp] of Object.entries(shown)) {
  const d = display(byId[iso]);
  assert.strictEqual(d.v, exp.v, iso);
  assert.strictEqual(d.band, exp.band, iso);
}
assert.strictEqual(byId.RUS.score, 1.9);
assert.strictEqual(byId.GEO.score, 0.626);
assert.strictEqual(byId.ARM.score, 2.17);
assert.strictEqual(byId.GEO.cross_pool_fb_pct_1990, 0.884);
assert.strictEqual(byId.GEO.cross_pool_fb_pct_2020, 0.265);
assert.strictEqual(byId.ARM.cross_pool_fb_pct_1990, 5.889);
assert.strictEqual(byId.ARM.cross_pool_fb_pct_2020, 3.825);

const readme = fs.readFileSync(path.join(root, "data/demographics/README.md"), "utf8");
assert.ok(!/no Turkic, Central Asian or Caucasus pool/.test(readme));
assert.ok(/There is a Caucasus pool/.test(readme));
assert.ok(/does not list CAU/.test(readme));

console.log("caucasus-pool.test.js: ok");
