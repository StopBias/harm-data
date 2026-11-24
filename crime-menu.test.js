// Menu rules for the Crime heritage dropdowns.
// Run: node crime-menu.test.js
"use strict";

var fs = require("fs");
var path = require("path");
var menu = require("./crime-menu.js");

var failed = 0;
function assert(cond, label) {
  if (!cond) {
    console.error("FAIL " + label);
    failed += 1;
  }
}
function eq(actual, expected, label) {
  var a = JSON.stringify(actual);
  var b = JSON.stringify(expected);
  if (a !== b) {
    console.error("FAIL " + label + "\n  expected " + b + "\n  got      " + a);
    failed += 1;
  }
}

function load(iso) {
  return JSON.parse(fs.readFileSync(path.join("data", iso.toLowerCase() + ".json"), "utf8"));
}
function harm(detail, id) {
  return detail.harms.find(function (h) { return h.id === id; });
}
function enabled(detail, harmId, who, otherId, measure) {
  return menu.groupsAvailable(detail.groups, harm(detail, harmId), who, otherId, measure, function () { return false; });
}
function ids(detail) {
  return detail.groups.map(function (g) { return g.id; });
}
function labelOf(detail, id) {
  var g = detail.groups.find(function (x) { return x.id === id; });
  return g && g.label;
}

var usa = load("USA");
var gbr = load("GBR");

assert(usa.completeness === 54 && usa.score.value === 54, "US score unchanged");
assert(gbr.completeness === 53 && gbr.score.value === 53, "UK score unchanged");
assert(usa.harms.some(function (h) { return h.id === "maltreatment"; }), "US maltreatment figures stay in the file");
assert(usa.harms.some(function (h) { return h.id === "fatalities"; }), "US fatality figures stay in the file");
assert(harm(usa, "teen_violence").cross.matrix.white_nh.black_nh === 9.8, "US teen White victim × Black offender value unchanged");
assert(harm(gbr, "homicide").cross.matrix.white.unknown === 0.8, "UK homicide White × unknown value unchanged");
assert(harm(gbr, "homicide").perpetrators.share.unknown === 0.9, "UK homicide unknown perpetrator share unchanged");
assert(harm(usa, "sexual_abuse").perpetrators.share.other === 2, "US Other races share unchanged");
assert(harm(gbr, "online").perpetrators.share.gypsy_traveller === 0, "UK Gypsy or Irish Traveller share unchanged");

eq(labelOf(usa, "other"), "Other races", "US Other races label");
eq(labelOf(gbr, "gypsy_traveller"), "White Gypsy or Irish Traveller", "UK Gypsy or Irish Traveller label");
eq(labelOf(gbr, "unknown"), "Unknown / not recorded", "UK unknown label");
assert(ids(usa).indexOf("other") > ids(usa).indexOf("multi"), "Other races is in the US menu");
assert(ids(usa).indexOf("other") < ids(usa).indexOf("european"), "Ethnic European stays last in the US menu");
assert(ids(gbr).indexOf("gypsy_traveller") > ids(gbr).indexOf("white_irish"), "Gypsy or Irish Traveller follows White Irish");
assert(ids(gbr).indexOf("gypsy_traveller") < ids(gbr).indexOf("white_other"), "Gypsy or Irish Traveller precedes Any other White");
assert(ids(gbr).indexOf("unknown") > ids(gbr).indexOf("other") && ids(gbr).indexOf("unknown") < ids(gbr).indexOf("european"), "Unknown sits before Ethnic European");

var teenOn = ["all", "white_nh", "black_nh", "hispanic"];
var teenOff = ["aian", "asian", "nhpi", "multi", "other", "european"];
eq(enabled(usa, "teen_violence", "victims", "all", "share"), teenOn, "US teen victims enabled for share");
eq(enabled(usa, "teen_violence", "perpetrators", "all", "share"), teenOn, "US teen perpetrators enabled for share");
teenOff.forEach(function (id) {
  assert(enabled(usa, "teen_violence", "victims", "all", "share").indexOf(id) === -1, "US teen victim " + id + " stays unavailable");
  assert(enabled(usa, "teen_violence", "perpetrators", "all", "share").indexOf(id) === -1, "US teen perpetrator " + id + " stays unavailable");
});
eq(enabled(usa, "teen_violence", "perpetrators", "white_nh", "share"), teenOn, "US teen White victim keeps Black and Hispanic offenders");
assert(menu.pairIsLinked(harm(usa, "teen_violence"), "white_nh", "black_nh"), "US teen White × Black is linked");
assert(menu.matrixCell(harm(usa, "teen_violence").cross, "white_nh", "black_nh") === 9.8, "US teen cell reads 9.8");
assert(menu.measureOpen(harm(usa, "teen_violence"), "share", "white_nh", "black_nh", function () { return false; }), "share stays open for the teen pair");
assert(!menu.measureOpen(harm(usa, "teen_violence"), "rate", "white_nh", "black_nh", function () { return false; }), "rate stays closed for the teen pair");
assert(menu.measureOpen(harm(usa, "teen_violence"), "share", "all", "all", function () { return false; }), "share stays open for teen violence overall");

assert(enabled(usa, "sexual_abuse", "perpetrators", "all", "share").indexOf("other") !== -1, "Other races enabled for US sexual abuse perpetrators");
assert(enabled(usa, "sexual_abuse", "victims", "all", "share").indexOf("other") === -1, "Other races unavailable for US sexual abuse victims");
assert(enabled(usa, "exploitation", "perpetrators", "all", "share").indexOf("other") === -1, "Other races unavailable where exploitation has no such figure");
assert(enabled(usa, "exploitation", "perpetrators", "all", "share").indexOf("asian") !== -1, "Asian stays enabled for exploitation");
assert(ids(usa).indexOf("asian_nhpi") === -1, "combined Asian or Pacific Islander stays out of the menu");

["maltreatment", "sexual_abuse", "online"].forEach(function (id) {
  assert(enabled(gbr, id, "perpetrators", "all", "share").indexOf("gypsy_traveller") !== -1, "Gypsy or Irish Traveller enabled for UK " + id + " perpetrators");
  assert(enabled(gbr, id, "victims", "all", "share").indexOf("gypsy_traveller") === -1, "Gypsy or Irish Traveller unavailable for UK " + id + " victims");
});
["homicide", "group_cse", "trafficking", "sexual_abuse_survey"].forEach(function (id) {
  var measure = id === "sexual_abuse_survey" ? "rate" : "share";
  assert(enabled(gbr, id, "perpetrators", "all", measure).indexOf("gypsy_traveller") === -1, "Gypsy or Irish Traveller unavailable for UK " + id);
  assert(enabled(gbr, id, "victims", "all", measure).indexOf("gypsy_traveller") === -1, "Gypsy or Irish Traveller unavailable for UK " + id + " victims");
});

assert(enabled(gbr, "homicide", "perpetrators", "all", "share").indexOf("unknown") !== -1, "Unknown enabled for UK homicide perpetrators");
assert(enabled(gbr, "homicide", "perpetrators", "white", "share").indexOf("unknown") !== -1, "Unknown stays enabled when the victim is White");
assert(enabled(gbr, "homicide", "victims", "all", "share").indexOf("unknown") === -1, "Unknown unavailable as a UK homicide victim");
assert(enabled(gbr, "homicide", "perpetrators", "all", "share").indexOf("white_british") === -1, "White British stays unavailable on the homicide cross-table");
["maltreatment", "sexual_abuse", "online", "group_cse", "trafficking"].forEach(function (id) {
  assert(enabled(gbr, id, "perpetrators", "all", "share").indexOf("unknown") === -1, "Unknown unavailable for UK " + id);
  assert(enabled(gbr, id, "victims", "all", "share").indexOf("unknown") === -1, "Unknown unavailable for UK " + id + " victims");
});
assert(menu.matrixCell(harm(gbr, "homicide").cross, "white", "unknown") === 0.8, "UK White × unknown cell reads 0.8");
assert(menu.columnRows(harm(gbr, "homicide").cross, "unknown").indexOf("white") !== -1, "UK unknown column includes White victims");
var offenders = menu.offenderIds(harm(gbr, "homicide").cross);
eq(offenders.slice(0, 5), ["white", "black", "asian", "mixed", "other"], "UK homicide offender order unchanged");
eq(offenders[offenders.length - 1], "unknown", "UK unknown is appended as an offender column");
assert(menu.offenderIds(harm(usa, "teen_violence").cross).indexOf("unknown") === -1, "US teen table does not invent an unknown column");

// Rate-only survey: an empty share list must not turn share on, and must not enable the rate groups for share.
assert(!menu.measureOpen(harm(gbr, "sexual_abuse_survey"), "share", "all", "all", function () { return false; }), "UK survey share stays closed");
assert(menu.measureOpen(harm(gbr, "sexual_abuse_survey"), "rate", "all", "all", function () { return false; }), "UK survey rate stays open");
eq(enabled(gbr, "sexual_abuse_survey", "victims", "all", "share"), ["all"], "UK survey share does not enable heritage groups");
assert(enabled(gbr, "sexual_abuse_survey", "victims", "all", "rate").indexOf("white_british") !== -1, "UK survey rate still enables White British");

// Adding linked groups to share must not change any other country or harm.
var only = [];
fs.readdirSync("data").filter(function (f) { return /^[a-z]{3}\.json$/.test(f); }).forEach(function (f) {
  var detail = JSON.parse(fs.readFileSync(path.join("data", f), "utf8"));
  (detail.harms || []).forEach(function (h) {
    ["victims", "perpetrators"].forEach(function (who) {
      ["share", "rate"].forEach(function (measure) {
        var bm = h.availability && h.availability.by_measure && h.availability.by_measure[measure];
        if (!bm || !Array.isArray(bm[who])) return;
        var before = menu.listedIds(detail.groups, bm[who]);
        var after = menu.baseGroupIds(detail.groups, h, who, measure, function () { return false; });
        if (JSON.stringify(before) !== JSON.stringify(after)) {
          only.push(detail.iso_a3 + " " + h.id + " " + who + " " + measure + " +" + after.filter(function (id) { return before.indexOf(id) === -1; }).join(","));
        }
      });
    });
  });
});
eq(only.sort(), [
  "GBR homicide perpetrators share +unknown",
  "USA teen_violence perpetrators share +white_nh,black_nh,hispanic",
  "USA teen_violence victims share +white_nh,black_nh,hispanic"
], "linked groups join the share menu only for the US teen table and UK homicide unknown");

if (!failed) console.log("crime-menu: heritage menu checks passed");
else {
  console.error(failed + " failed");
  process.exitCode = 1;
}
