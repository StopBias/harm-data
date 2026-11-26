// Draft US homicide-audit display. Run: node media-audit-draft.test.js
"use strict";

var fs = require("fs");
var path = require("path");
var cp = require("child_process");

var failed = 0;
function check(cond, label) {
  if (!cond) {
    console.error("FAIL " + label);
    failed += 1;
  }
}

var auditPath = "data/media/summary_audit_homicide_draft.json";
var beforeBuild = fs.readFileSync(auditPath, "utf8");
var built = cp.spawnSync("python3", ["data/media/build_audit_homicide_draft.py"], { encoding: "utf8" });
check(built.status === 0, "builder exits 0: " + (built.stderr || built.stdout));
check(fs.readFileSync(auditPath, "utf8") === beforeBuild, "committed audit JSON matches the builder");

var audit = JSON.parse(beforeBuild);
var csv = fs.readFileSync("data/media/draft_full_run_tally_20261124.csv", "utf8");
var summary = JSON.parse(fs.readFileSync("data/media/summary.json", "utf8"));
var js = fs.readFileSync("media.js", "utf8");
var html = fs.readFileSync("index.html", "utf8");
var langs = ["en", "de", "es", "fr", "it", "pt", "ru", "uk", "pl", "hu", "sv"];

check(audit.draft === true, "draft flag");
check(audit.finding_published === false, "not a published finding");
check(audit.index_defined === true, "index defined");
check(audit.index_status === "draft", "index status draft");
check(audit.map_treatment === "draft_not_significant", "neutral map treatment");
check(audit.test === "fisher_coverage", "fisher coverage test");
check(audit.significant === false, "not significant");
check(audit.design_a_applied === false, "design (a) not applied");
check(audit.per_capita_rate === null, "per-capita stays null");
check(audit.zero_adjust_applied === false, "no continuity correction");
check(audit.n_covered_W === 9 && audit.n_sampled_W === 152, "9 of 152 W-on-B");
check(audit.n_covered_B === 17 && audit.n_sampled_B === 152, "17 of 152 B-on-W");
check(audit.n_sampled === 304 && audit.n_covered === 26, "26 of 304");
check(audit.signed_magnitude === 1.89 && audit.signed_lean === "antiblack", "signed -1.89");
check(audit.p_two_sided_headline === "0.15", "headline p = 0.15");
check(audit.p_two_sided_detail === "0.1500", "detail two-sided p");
check(audit.p_one_sided_detail === "0.0750", "detail one-sided p");
check(audit.ci95_low === 0.206633 && audit.ci95_high === 1.185223, "exact OR interval");
check(audit.ci95_low_rounded === "0.207" && audit.ci95_high_rounded === "1.185", "tally OR rounding");
check(audit.ci95_signed_display === "[\u22124.84\u00d7, +1.19\u00d7]", "signed interval exact");
check(audit.ci95_signed_low_magnitude === "4.84" && audit.ci95_signed_high_magnitude === "1.19", "signed ends");
check(audit.ci_method === "fisher_minlike_or" && audit.ci_scale === "odds_ratio", "ci method");
check(audit.stories_W_on_B === 159 && audit.stories_B_on_W === 44 && audit.stories_n === 203, "all-five stories");
check(audit.dominant_case_stories === 142, "one case dominates stories");
check(csv.indexOf(audit.ci95_signed_display) !== -1, "signed interval copied from the tally CSV");
check(csv.indexOf("0.206633") !== -1 && csv.indexOf("1.185223") !== -1, "CSV OR endpoints");

var ap = audit.outlets.filter(function (r) { return r.outlet === "AP"; })[0];
check(ap && ap.stories_W_on_B === 11 && ap.stories_B_on_W === 0, "AP stories 11 and 0");
check(ap && ap.cases_W_on_B === 3 && ap.cases_B_on_W === 0, "AP cases 3 of 152 and 0 of 152");
check(ap && ap.zero_of_n === "0 of 152" && ap.coverage_upper_display === "1.95%", "AP Clopper-Pearson upper bound");
check(ap && ap.cdi === null && ap.index_status === "pending", "AP index stays pending");
audit.outlets.forEach(function (r) {
  check(r.cdi === null && r.index_status === "pending", r.outlet + " outlet index pending");
});
check(JSON.stringify(audit).indexOf("29.4") === -1 && JSON.stringify(audit).indexOf("16.3") === -1, "audit JSON has no forbidden multipliers");
check(JSON.stringify(audit).indexOf("Daunte") === -1 && JSON.stringify(audit).indexOf("Wright") === -1, "audit JSON has no names");

var sens = {};
audit.sensitivities.forEach(function (r) { sens[r.id] = r; });
check(sens.all && sens.all.w === "9 of 152" && sens.all.b === "17 of 152", "sensitivity all");
check(sens.exclude_vehicular && sens.exclude_vehicular.w === "9 of 143" && sens.exclude_vehicular.b === "17 of 149", "sensitivity vehicular");
check(sens.exclude_white_hispanic && sens.exclude_white_hispanic.w === "7 of 102" && sens.exclude_white_hispanic.b === "14 of 128", "sensitivity hispanic");
check(sens.exclude_both && sens.exclude_both.w === "7 of 94" && sens.exclude_both.b === "14 of 125", "sensitivity both");
check(sens.official_record_only && sens.official_record_only.used_for_index === false, "official-record cut unused");

check(summary.countries.USA.index_status === "bound", "keyword summary still a bound");
check(summary.countries.USA.preferred_inference.index_lower_display === 4, "keyword at least 4.0 remains in summary.json");
check(summary.countries.USA.preferred_inference.zero_of_n === "0 of 5", "keyword 0 of 5 remains");
["stories_2023.csv", "stories_2023_broad.csv", "incidents_2023.json", "summary.json"].forEach(function (name) {
  check(fs.existsSync(path.join("data/media", name)), "pilot file kept: " + name);
});

check(js.indexOf("summary_audit_homicide_draft.json") !== -1, "media.js loads the draft audit");
check(js.indexOf('id="mv-audit-h"') !== -1 && js.indexOf('t("audit_h")') !== -1, "audit heading");
check(js.indexOf('id="mv-audit-desc"') !== -1 && js.indexOf('t("audit_desc"') !== -1, "audit descriptor");
check(js.indexOf('id="mv-draft-badge"') !== -1 && js.indexOf('t("badge_draft")') !== -1, "DRAFT badge");
check(js.indexOf('id="mv-audit-sig"') !== -1 && js.indexOf("auditSig()") !== -1, "significance line");
check(js.indexOf('id="mv-pilot-earlier"') !== -1 && js.indexOf("keywordHeadline()") !== -1, "earlier pilot below the headline");
check(js.indexOf('state.label = state.label === "antiwhite" ? "antiblack" : "antiwhite"') !== -1, "sign toggle");
check(js.indexOf("signed_lean === \"antiblack\" ? !flip : flip") !== -1, "sign flip uses the toggle");
check(js.indexOf('id="mv-audit-outlets"') !== -1 && js.indexOf('t("pending_outlet")') !== -1, "outlet index pending");
check(js.indexOf('t("cp_upper"') !== -1 && js.indexOf("zero_of_n") !== -1, "zero cell plus upper bound");
check(js.indexOf('id="mv-sens"') !== -1 && js.indexOf('t("sens_h")') !== -1, "sensitivity table heading");
check(js.indexOf('status: "draft"') !== -1 && js.indexOf("L: null") !== -1, "map state is draft without an index colour");
check(js.indexOf("DRAFT_MAP_COLOR") !== -1 && js.indexOf('t("legend_draft")') !== -1, "draft legend");
check(js.indexOf('t("percapita_pending")') !== -1, "per-capita cell still pending");
check(js.indexOf("29.4×") === -1 && js.indexOf("16.3×") === -1, "media.js does not print the forbidden multipliers");

check(html.indexOf('const MEDIA_DRAFT_COLOR = "#c5c9cc"') !== -1, "draft map colour");
check(html.indexOf('if (st && st.status === "draft") return MEDIA_DRAFT_COLOR;') !== -1, "draft fill is not an index colour");
check(js.indexOf('DRAFT_MAP_COLOR = "#c5c9cc"') !== -1, "legend colour matches the map");

var en = JSON.parse(fs.readFileSync("i18n/en.json", "utf8")).media;
check(en.audit_h.indexOf("Homicides (FBI SHR single victim/single offender), 2020–2024 pooled") === 0, "English heading text");
check(en.sig_draft_not_significant === "Not statistically significant (p = {p})", "English significance wording");
check(en.completeness === "Ethnic data completeness", "Ethnic data completeness label");
check(en.completeness_desc.indexOf("not part of the index") !== -1, "completeness is not part of the index");
check(en.draft_note.indexOf("CDI") === -1, "CDI is not in the results note");
check(en.methods_cdi.indexOf("CDI") !== -1, "CDI stays in methods text");
check(en.table_h === "Homicide cases covered by national outlets, 2020–2024", "comparison table heading");
check(en.audit_outlets_h.indexOf("Homicide cases and stories by outlet") === 0, "outlet table heading");

var placeholders = function (s) { return (s.match(/\{(\w+)\}/g) || []).sort().join(","); };
langs.forEach(function (lang) {
  var pack = JSON.parse(fs.readFileSync(path.join("i18n", lang + ".json"), "utf8")).media;
  ["audit_h", "audit_desc", "badge_draft", "draft_note", "sig_draft_not_significant", "pilot_earlier_h",
    "legend_draft", "cp_upper", "audit_outlets_h", "audit_outlets_desc", "sens_h", "sens_desc",
    "audit_sample_h", "audit_sample_desc", "table_h", "table_desc", "audit_shr_note",
    "sens_official_record_only", "tt_draft_index", "tt_draft_counts"].forEach(function (key) {
    check(typeof pack[key] === "string" && pack[key].length > 0, lang + " " + key);
  });
  check(placeholders(pack.audit_desc) === placeholders(en.audit_desc), lang + " audit_desc placeholders");
  check(placeholders(pack.audit_counts) === placeholders(en.audit_counts), lang + " audit_counts placeholders");
  check(placeholders(pack.audit_sample_desc) === placeholders(en.audit_sample_desc), lang + " sample placeholders");
  check(pack.draft_note.indexOf("CDI") === -1, lang + " draft note has no CDI");
  check(pack.legend_draft.indexOf("CDI") === -1, lang + " legend has no CDI");
});

if (!failed) console.log("media-audit-draft: draft homicide audit checks passed");
else {
  console.error(failed + " failed");
  process.exitCode = 1;
}
