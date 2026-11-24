"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const api = require("../demographics-supplements.js");

const root = path.join(__dirname, "..");
const read = rel => JSON.parse(fs.readFileSync(path.join(root, rel), "utf8"));

const origin = read("data/demographics/origin_series_FR_DE_ES.json");
const baseline = read("data/demographics/baseline_1960_1979.json");
const demo = read("data/demographics.json");
const en = read("i18n/en.json");
const copy = en.demographics;

function country(id) {
  return demo.countries.find(c => c.id === id);
}

function row(iso) {
  return baseline.rows.find(r => r.iso3 === iso);
}

function bandId(score) {
  const bands = demo.scale.bands;
  for (let i = 0; i < bands.length; i++) {
    const b = bands[i];
    if (score >= b.from && (score < b.to || (i === bands.length - 1 && score <= b.to))) return b.id;
  }
  return null;
}

assert.strictEqual(origin.version, "1.14.0");
assert.strictEqual(origin.created, "2026-11-24");
assert.strictEqual(baseline.version, "1.15.0");
assert.strictEqual(baseline.created, "2026-11-24");
assert.ok(origin.countries.FRA.sources[0].url.startsWith("https://www.insee.fr/"));
assert.ok(baseline.rows[0].sources[0].url.startsWith("https://"));

// Existing scores and colours are untouched.
assert.strictEqual(country("CAN").score, 27.8);
assert.strictEqual(country("USA").score, 25.4);
assert.strictEqual(country("FRA").score, 2.272);
assert.strictEqual(country("DEU").score, 3.259);
assert.strictEqual(country("ESP").score, 7.708);
assert.strictEqual(country("NZL").score, 13.4);
assert.strictEqual(demo.scale.bands[4].color, "#e74c3c");
assert.strictEqual(demo.scale.bands[0].color, "#1e8449");
assert.strictEqual(bandId(27.8), "red");
assert.strictEqual(bandId(25.4), "red");
assert.strictEqual(bandId(-11), "dark_green");
assert.strictEqual(bandId(-0.3), "light_green");
assert.strictEqual(api.colourScore(false, row("USA")).useExisting, true);

const hidden = ["GTM", "KEN", "VNM", "ZWE", "GUY", "BOL"];
const hiddenInFile = baseline.rows.filter(api.isNotVerified).map(r => r.iso3);
assert.deepStrictEqual(hiddenInFile.sort(), hidden.slice().sort());
hidden.forEach(iso => {
  assert.strictEqual(api.isPublishableBaseline(row(iso)), false);
  assert.strictEqual(api.displayChange(row(iso)), null);
  assert.strictEqual(api.colourScore(true, row(iso)).useExisting, false);
  assert.strictEqual(api.colourScore(true, row(iso)).value, null);
});

// Live sign: founding-share change, a fall is negative. The file already stores that.
const usa = api.displayChange(row("USA"));
assert.strictEqual(usa.indicative, false);
assert.strictEqual(usa.value, -25.4);
assert.strictEqual(api.colourScore(true, row("USA")).value, -25.4);

const nz = api.displayChange(row("NZL"));
assert.strictEqual(nz.indicative, true);
assert.strictEqual(nz.value, -24);
assert.strictEqual(row("NZL").change_pp_baseline_to_latest, null);
assert.ok(api.baselineBadges(row("NZL")).includes("definition_break"));

const uk = api.displayChange(row("GBR"));
assert.strictEqual(uk.indicative, true);
assert.strictEqual(uk.value, -15.4);
assert.ok(api.baselineBadges(row("GBR")).includes("estimate"));

assert.ok(api.baselineBadges(row("MEX")).includes("weak_proxy"));
assert.ok(api.baselineBadges(row("PER")).includes("weak_proxy"));
assert.ok(api.baselineBadges(row("RUS")).includes("demoscope"));
assert.ok(api.baselineBadges(row("ARM")).includes("demoscope"));
assert.strictEqual(api.classificationPending("ARM"), true);
assert.strictEqual(api.classificationPending("GEO"), true);
assert.strictEqual(api.classificationPending("RUS"), false);
assert.strictEqual(api.displayChange(row("ARM")).value, null);
assert.strictEqual(api.displayChange(row("GEO")).value, null);
assert.strictEqual(api.isPublishableBaseline(row("FRA")), false);

const ukr = api.displayChange(row("UKR"));
assert.strictEqual(ukr.indicative, false);
assert.ok(Math.abs(ukr.value - 0.19) < 1e-9);

// France, Germany, Spain series.
const fra = api.originModel(origin.countries.FRA);
assert.deepStrictEqual(fra.tracks[0].points.map(p => [p.year, p.value]), [[2011, 89.5], [2021, 86.47]]);
assert.strictEqual(fra.tracks[0].change, -3.03);
assert.strictEqual(fra.detached.length, 0);
assert.strictEqual(fra.generations, "two");

const deu = api.originModel(origin.countries.DEU);
assert.deepStrictEqual(deu.tracks[0].points.map(p => [p.year, p.value, p.provisional]), [
  [2023, 88.88, false],
  [2024, 88.29, false],
  [2025, 87.99, true]
]);
assert.deepStrictEqual(deu.detached.map(p => [p.year, p.value]), [[2021, 89.71]]);
assert.strictEqual(deu.tracks[0].change, -0.89);
assert.strictEqual(deu.sensitivity[2021], 89.99);
assert.strictEqual(deu.sensitivity[2023], 89.16);
assert.strictEqual(deu.sensitivity[2024], 88.6);
assert.strictEqual(deu.sensitivity[2025], 88.3);
const deuPairs = api.connectedPairs(deu);
assert.ok(deuPairs.every(pair => pair[2] === "census2022"));
assert.ok(!deuPairs.some(pair => pair[0] === 2021 || pair[1] === 2021));

const esp = api.originModel(origin.countries.ESP);
assert.strictEqual(esp.generations, "first");
assert.strictEqual(esp.tracks[0].points[0].year, 1998);
assert.strictEqual(esp.tracks[0].points[0].value, 98.47);
assert.strictEqual(esp.tracks[1].points[esp.tracks[1].points.length - 1].year, 2026);
assert.strictEqual(esp.tracks[1].points[esp.tracks[1].points.length - 1].value, 84.63);
assert.ok(esp.tracks[0].change < 0);
assert.ok(esp.tracks[1].change < 0);
const espPairs = api.connectedPairs(esp);
assert.ok(espPairs.some(pair => pair[2] === "padron"));
assert.ok(espPairs.some(pair => pair[2] === "table68525"));
assert.ok(!espPairs.some(pair => pair[2] === "padron" && (pair[0] >= 2023 || pair[1] >= 2023)));
assert.ok(esp.sources.some(s => s.url.indexOf("ine.es") !== -1));

const svg = api.originChartSvg(deu);
assert.ok(svg.includes('data-years="2023,2024,2025"'));
assert.ok(!svg.includes('data-years="2021'));
assert.ok(svg.includes('data-connect="0"'));
assert.ok(svg.includes("Census 2011 frame, not comparable"));
assert.ok(svg.includes("provisional"));
assert.ok(svg.includes("89.71"));
assert.ok(svg.includes("87.99"));

const fraSvg = api.originChartSvg(fra);
assert.ok(fraSvg.includes("89.50"));
assert.ok(fraSvg.includes("86.47"));

assert.strictEqual(
  api.groupWording("Jewish origin is inside StatCan's European total"),
  "ethnic Jewish origin is inside StatCan's ethnic European total"
);
assert.strictEqual(
  api.groupWording("Jews, Tajiks, Azerbaijanis"),
  "ethnic Jewish people, Tajiks, Azerbaijanis"
);
assert.strictEqual(api.groupWording("non-European"), "non-European");
assert.strictEqual(api.groupWording("ethnic European"), "ethnic European");
assert.strictEqual(api.groupWording("Europe"), "Europe");

[
  "origin_gen_fra",
  "origin_gen_deu",
  "origin_gen_esp",
  "origin_detached",
  "origin_deu_sensitivity",
  "baseline_toggle",
  "baseline_none",
  "baseline_indicative",
  "baseline_pending",
  "baseline_pending_short",
  "badge_definition_break",
  "badge_estimate",
  "badge_weak",
  "badge_demoscope"
].forEach(key => assert.strictEqual(typeof copy[key], "string", key));

assert.strictEqual(copy.origin_detached, "Census 2011 frame, not comparable");
assert.strictEqual(copy.baseline_none, "no 1960–79 census baseline");
assert.strictEqual(copy.baseline_indicative, "indicative");
assert.ok(copy.baseline_pending.indexOf("Classification pending") === 0);
assert.ok(copy.baseline_pending.indexOf("ethnic European") !== -1);
assert.ok(copy.origin_gen_esp.indexOf("misses the second generation") !== -1);
assert.ok(copy.origin_deu_sensitivity.indexOf("North America") !== -1);
assert.ok(copy.origin_gen_fra.indexOf("ethnic European") === -1 || copy.origin_gen_deu.indexOf("ethnic European") !== -1);
assert.ok(!/anti-white| anti white/i.test(JSON.stringify(copy)));
assert.ok(copy.baseline_scale_note.indexOf("negative figure means the founding share fell") !== -1);
assert.ok(copy.origin_change.indexOf("negative figure means that share fell") !== -1);

const scale = require("../demographics-scale.js");
assert.strictEqual(scale.bandIdForChange(-27.8, 1), "dark");
assert.strictEqual(scale.bandIdForChange(-25.4, 1), "dark");
assert.strictEqual(scale.bandIdForChange(-24, 1), "dark");
assert.strictEqual(scale.bandIdForChange(-15, 1), "medium");
assert.strictEqual(scale.bandIdForChange(-5, 1), "light");
assert.strictEqual(scale.bandIdForChange(-4.9, 1), "light");
assert.strictEqual(scale.bandIdForChange(-1, 1), "little");
assert.strictEqual(scale.bandIdForChange(0.2, 1), "little");

const can = country("CAN");
assert.strictEqual(can.score, 27.8);
assert.strictEqual(
  Math.round((can.census.latest_share_in_founding_pool - can.census.first_share_in_founding_pool) * 10) / 10,
  -27.8
);

// Every publishable row can be scored without throwing, and hidden rows never are.
baseline.rows.forEach(r => {
  if (api.isNotVerified(r)) return;
  const change = api.displayChange(r);
  if (api.isPublishableBaseline(r)) {
    assert.ok(change);
    if (change.value != null) assert.ok(Number.isFinite(change.value));
    api.baselineBadges(r).forEach(badge => {
      assert.ok(["definition_break", "estimate", "weak_proxy", "demoscope"].includes(badge));
    });
  } else {
    assert.strictEqual(change, null);
  }
});

console.log("demographics supplement checks passed");
