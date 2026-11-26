"use strict";

// Run: node test/baseline_pre1950.test.js
// Data-only check for the pre-1950 baselines. Does not load map or scoring code.

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const readJson = rel => JSON.parse(fs.readFileSync(path.join(root, rel), "utf8"));

const data = readJson("data/demographics/baseline_pre1950.json");
const demo = readJson("data/demographics.json");
const csv = fs.readFileSync(path.join(root, "data/demographics/baseline_pre1950.csv"), "utf8");

assert.strictEqual(data.file, "baseline_pre1950.json");
assert.strictEqual(data.version, "1.16.0");
assert.strictEqual(data.created, "2026-11-26");
assert.ok(data.version_type.includes("data and documentation only"));
assert.ok(data.rule.includes("not wired to the map"));
assert.strictEqual(data.rows.length, 8);

const byIso = Object.fromEntries(data.rows.map(r => [r.iso3, r]));
const expectedVerified = {
  DEU: { year: 1933, count: 65207383, total: 65219324, share: 99.98, concept: "nationality residual" },
  FRA: { year: 1931, count: 41037900, total: 41229000, share: 99.54, concept: "nationality residual" },
  ESP: { year: 1930, count: 23550700, total: 23563867, share: 99.94, concept: "nationality residual" },
  GBR: { year: 1931, count: 44338092, total: 44795357, share: 98.98, concept: "birthplace residual" },
  IRL: { year: 1936, count: 2953322, total: 2968420, share: 99.49, concept: "birthplace residual" },
  AUS: { year: 1911, count: 4402662, total: 4455005, share: 98.83, concept: "race" },
  NZL: { year: 1936, count: 1484508, total: 1573810, share: 94.33, concept: "race" },
  ITA: { year: 1936, count: 42435744, total: 42444588, share: 99.98, concept: "nationality residual" }
};

assert.deepStrictEqual(
  data.rows.map(r => r.iso3).sort(),
  Object.keys(expectedVerified).sort()
);

function roundShare(count, total) {
  return Math.round((count / total) * 10000) / 100;
}

for (const [iso, exp] of Object.entries(expectedVerified)) {
  const r = byIso[iso];
  assert.ok(r, iso);
  assert.strictEqual(r.baseline_year, exp.year, iso + " year");
  assert.strictEqual(r.ethnic_european_count, exp.count, iso + " count");
  assert.strictEqual(r.total, exp.total, iso + " total");
  assert.strictEqual(r.founding_share_pct, exp.share, iso + " share");
  assert.strictEqual(r.concept, exp.concept, iso + " concept");
  assert.strictEqual(roundShare(r.ethnic_european_count, r.total), exp.share, iso + " rounded share");
  assert.ok(!/NOT VERIFIED/i.test(r.verification), iso + " should be verified");
  const liveSources = (r.sources || []).filter(s => s.url);
  assert.ok(liveSources.length >= 1, iso + " needs a source URL");
  liveSources.forEach(s => assert.ok(s.url.startsWith("https://"), iso + " " + s.url));
  assert.ok(Array.isArray(r.flags) && r.flags.length > 0, iso + " flags");
  assert.ok(csv.includes("," + iso + ","), iso + " in csv");
}

const ita = byIso.ITA;
assert.ok(ita);
assert.strictEqual(ita.counts.foreign_nationals_total, 108597);
assert.strictEqual(ita.counts.foreign_european_states, 99753);
assert.strictEqual(ita.counts.foreign_american, 6773);
assert.strictEqual(ita.counts.foreign_asian, 1574);
assert.strictEqual(ita.counts.foreign_african, 369);
assert.strictEqual(ita.counts.foreign_oceanian, 128);
assert.strictEqual(ita.counts.non_european_citizenship_sum_subtracted, 8844);
assert.strictEqual(ita.counts.europe_country_columns_above_printed_total, 90);
assert.strictEqual(ita.ethnic_european_count, ita.total - ita.counts.non_european_citizenship_sum_subtracted);
assert.ok(ita.sources.some(s => s.url === "https://ebiblio.istat.it/digibib/Censimenti%20popolazione/censpop1936/IST0005813vol3RegnoParte2_Tavole/IST0005813_vol3_Regno_Parte_2_Tavole+OCR_ottimizzato.pdf"));
assert.ok(ita.flags.some(f => /no birthplace or ethnicity question/i.test(f)));
assert.ok(ita.flags.some(f => /naturalised Italians/i.test(f)));
assert.ok(ita.flags.some(f => /printed Europe total/i.test(f)));
assert.ok(!ita.official_denominators_not_used_for_share);
assert.ok(!ita.excluded_unofficial_figures);
const blob = JSON.stringify(ita);
assert.ok(!blob.includes("108000") && !blob.includes("108,000"));
assert.ok(!/NOT VERIFIED/i.test(blob));
assert.ok(csv.includes("Italy,ITA,"));
const itaCsv = csv.split(/\n/).find(l => l.includes(",ITA,"));
assert.ok(itaCsv);
assert.ok(itaCsv.includes(",nationality residual,42435744,42444588,99.98,"));
assert.ok(!/NOT VERIFIED/.test(itaCsv));
assert.ok(!itaCsv.includes(",unverified,"));

// Existing scores and colours are untouched by this data file.
function country(id) {
  return demo.countries.find(c => c.id === id);
}
assert.strictEqual(country("CAN").score, 27.8);
assert.strictEqual(country("USA").score, 25.4);
assert.strictEqual(country("FRA").score, 2.324);
assert.strictEqual(country("DEU").score, 3.259);
assert.strictEqual(country("ESP").score, 7.745);
assert.strictEqual(country("NZL").score, 13.4);
assert.strictEqual(demo.scale.bands[4].color, "#e74c3c");
assert.strictEqual(demo.scale.bands[0].color, "#1e8449");

// CSV header and eight data rows.
const csvLines = csv.trim().split(/\n/);
assert.ok(csvLines[0].startsWith("order,country,iso3,"));
assert.strictEqual(csvLines.length, 9);

console.log("pre-1950 baseline checks passed");
