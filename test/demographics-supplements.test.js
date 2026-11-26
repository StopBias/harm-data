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
assert.strictEqual(country("FRA").score, 2.324);
assert.strictEqual(country("DEU").score, 3.259);
assert.strictEqual(country("ESP").score, 7.745);
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

// Live sign: relative percent change in the founding share. A fall is negative.
const usa = api.displayChange(row("USA"));
assert.strictEqual(usa.indicative, false);
assert.strictEqual(usa.value, -30.5);
assert.strictEqual(api.colourScore(true, row("USA")).value, -30.5);
assert.strictEqual(row("USA").change_pp_baseline_to_latest, -25.4);

const nz = api.displayChange(row("NZL"));
assert.strictEqual(nz.indicative, true);
assert.strictEqual(nz.value, -26.1);
assert.strictEqual(row("NZL").change_pp_baseline_to_latest, null);
assert.ok(api.baselineBadges(row("NZL")).includes("definition_break"));

const uk = api.displayChange(row("GBR"));
assert.strictEqual(uk.indicative, true);
assert.strictEqual(uk.value, -15.9);
assert.ok(api.baselineBadges(row("GBR")).includes("estimate"));

assert.ok(api.baselineBadges(row("MEX")).includes("weak_proxy"));
assert.ok(api.baselineBadges(row("PER")).includes("weak_proxy"));
assert.ok(api.baselineBadges(row("RUS")).includes("demoscope"));
assert.ok(api.baselineBadges(row("ARM")).includes("demoscope"));
assert.strictEqual(api.classificationPending("ARM"), false);
assert.strictEqual(api.classificationPending("GEO"), false);
assert.strictEqual(api.classificationPending("RUS"), false);
assert.strictEqual(row("ARM").founding_pool, "CAU");
assert.strictEqual(row("GEO").founding_pool, "CAU");
assert.strictEqual(row("ARM").baseline_founding_pct, null);
assert.strictEqual(row("GEO").baseline_founding_pct, null);
assert.strictEqual(row("ARM").alternates.former_ethnic_european_full_map_pct, 92.08);
assert.strictEqual(row("GEO").alternates.former_ethnic_european_full_map_pct, 88.29);
assert.strictEqual(row("AZE").founding_pool, "MENA");
assert.strictEqual(api.displayChange(row("ARM")), null);
assert.strictEqual(api.displayChange(row("GEO")), null);
assert.strictEqual(api.isPublishableBaseline(row("ARM")), false);
assert.strictEqual(api.isPublishableBaseline(row("GEO")), false);
assert.strictEqual(api.isPublishableBaseline(row("FRA")), false);

const ukr = api.displayChange(row("UKR"));
assert.strictEqual(ukr.indicative, false);
assert.strictEqual(ukr.value, 0.2);

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
  "origin_deu_sensitivity"
].forEach(key => assert.strictEqual(typeof copy[key], "string", key));

assert.strictEqual(copy.origin_detached, "Census 2011 frame, not comparable");
assert.ok(copy.origin_gen_esp.indexOf("misses the second generation") !== -1);
assert.ok(copy.origin_deu_sensitivity.indexOf("North America") !== -1);
assert.ok(copy.origin_gen_fra.indexOf("ethnic European") === -1 || copy.origin_gen_deu.indexOf("ethnic European") !== -1);
assert.ok(!/anti-white| anti white/i.test(JSON.stringify(copy)));
assert.ok(copy.origin_change.indexOf("negative figure means that share fell") !== -1);

assert.strictEqual(copy.view_founding, "Founding populations");
assert.strictEqual(copy.bar_h, "UN estimate, 1990-2020 (% change)");
assert.strictEqual(copy.group_anglosphere, "Anglosphere");
[
  "view_availability",
  "view_anglosphere",
  "avail_legend_h",
  "avail_scale_note",
  "baseline_toggle",
  "baseline_bar_h",
  "baseline_map_desc",
  "baseline_scale_note"
].forEach(key => assert.strictEqual(copy[key], undefined, "removed " + key));

const viewIds = demo.views.map(v => v.id);
assert.deepStrictEqual(viewIds, ["geographic", "founding"]);
const foundingView = demo.views.find(v => v.id === "founding");
assert.strictEqual(foundingView.label, "Founding populations");
assert.deepStrictEqual(foundingView.groups.map(g => g.id), ["all", "EUR", "MENA", "SAS", "EAS", "SEA", "SSA", "anglosphere"]);
const anglo = foundingView.groups.find(g => g.id === "anglosphere");
assert.deepStrictEqual(anglo.members, ["USA", "GBR", "CAN", "AUS", "NZL", "IRL"]);

const demoJs = fs.readFileSync(path.join(root, "demographics.js"), "utf8");
assert.ok(demoJs.indexOf("dv-baseline") === -1);
assert.ok(demoJs.indexOf("view_availability") === -1);
assert.ok(demoJs.indexOf("isAvailabilityView") === -1);
assert.ok(demoJs.indexOf("BASELINE_URL") === -1);
assert.ok(demoJs.indexOf("dv-dropdown-menu") !== -1);

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

const zaf = country("ZAF");
assert.strictEqual(zaf.primary_pool, "EUR");
assert.deepStrictEqual(zaf.straddles, ["SSA"]);
assert.strictEqual(zaf.score, 13.5);
assert.strictEqual(zaf.census.founding_pool, "EUR");
assert.strictEqual(zaf.census.first_year, 1946);
assert.strictEqual(zaf.census.latest_year, 2022);
assert.strictEqual(zaf.census.first_share_in_founding_pool, 20.8);
assert.strictEqual(zaf.census.latest_share_in_founding_pool, 7.3);
assert.strictEqual(zaf.census.change_outside_founding_pool, 13.5);
assert.strictEqual(zaf.score, zaf.census.change_outside_founding_pool);
const zafPp = Math.round((zaf.census.latest_share_in_founding_pool - zaf.census.first_share_in_founding_pool) * 10) / 10;
assert.strictEqual(zafPp, -13.5);
const zafShown = scale.relativeChange(zaf.census.latest_share_in_founding_pool, zaf.census.first_share_in_founding_pool, 1);
assert.strictEqual(zafShown, -64.9);
assert.strictEqual(scale.bandIdForChange(zafShown, 1), "dark");
const bel = country("BEL");
assert.strictEqual(scale.relativeChange(100 - bel.cross_pool_fb_pct_2020, 100 - bel.cross_pool_fb_pct_1990, 2), -5.14);
assert.strictEqual(scale.COLOURS.medium, "#ec7165");
assert.strictEqual(copy.band_medium, "Strongly declining");
assert.deepStrictEqual(Object.keys(zaf.census.rows), ["1946", "1951", "1960", "1970", "1996", "2001", "2011", "2022"]);
assert.deepStrictEqual(Object.keys(zaf.census.rows).map(y => zaf.census.rows[y].EUR), [20.8, 20.9, 19.3, 17.3, 11.0, 9.6, 8.9, 7.3]);
["1980", "1985", "1991", "2026"].forEach(y => assert.ok(!zaf.census.rows[y]));
const zafNotes = zaf.census.notes;
[
  "No 1945 census",
  "1946 Union census is the earliest",
  "TBVC homelands included",
  "Namibia",
  "Walvis Bay",
  "1980, 1985 and 1991",
  "sample-based",
  "2.37 million",
  "4.50 million",
  "net migration",
  "2,372,000/11,415,000",
  "4,504,252/61,988,314"
].forEach(phrase => assert.ok(zafNotes.includes(phrase), phrase));
assert.ok(zafNotes.includes("13.4") && zafNotes.includes("not used as the latest"));
assert.ok(zafNotes.includes("7.1") && zafNotes.includes("not used as the latest"));
assert.ok(zaf.mapping_note.includes("ethnic European (White)"));
assert.ok(zaf.mapping_note.includes("SSA"));
const founding = demo.views.find(v => v.id === "founding");
assert.ok(founding.groups.find(g => g.id === "EUR").members.includes("ZAF"));
assert.ok(!founding.groups.find(g => g.id === "SSA").members.includes("ZAF"));

const zafBase = row("ZAF");
assert.strictEqual(zafBase.founding_pool, "EUR");
assert.strictEqual(zafBase.baseline_year, 1960);
assert.strictEqual(zafBase.baseline_founding_pct, 19.3);
assert.strictEqual(zafBase.latest_year_core, 2022);
assert.strictEqual(zafBase.latest_founding_pct_core, 7.3);
assert.strictEqual(zafBase.change_pp_baseline_to_latest, -12.0);
assert.strictEqual(api.displayChange(zafBase).value, -62.2);
assert.strictEqual(zafBase.earlier_in_window_not_used, null);
const zafCsv = fs.readFileSync(path.join(root, "data/demographics/baseline_1960_1979.csv"), "utf8");
assert.ok(zafCsv.includes("21,South Africa,ZAF,EUR,1960,19.3,"));
assert.ok(zafCsv.includes(",2022,7.3,-12.0,"));

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
