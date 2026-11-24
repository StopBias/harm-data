// Boundary checks for the founding-share colour bands.
// Run: node demographics-scale.test.js
"use strict";

var fs = require("fs");
var scale = require("./demographics-scale.js");
var id = scale.bandIdForChange;

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    console.error("FAIL " + label + ": expected " + expected + ", got " + actual);
    process.exitCode = 1;
  }
}

assertEqual(scale.COLOURS.little, "#8bc34a", "green");
assertEqual(scale.COLOURS.light, "#f5b7b1", "light red");
assertEqual(scale.COLOURS.medium, "#ec7165", "mid red");
assertEqual(scale.COLOURS.dark, "#e74c3c", "bright red");
assertEqual(scale.BANDS.length, 4, "four bands");
assertEqual(scale.BANDS[3].color, scale.COLOURS.little, "green comes from one constant");
assertEqual(scale.BANDS[3].outline, undefined, "green swatch has no outline");

// >= -1, including gains and a shown zero, is the green band.
assertEqual(id(0, 3), "little", "0");
assertEqual(id(-0, 3), "little", "-0");
assertEqual(id(-0.0001, 3), "little", "-0.0001 rounds to 0.000");
assertEqual(id(0.006, 3), "little", "India +0.006");
assertEqual(id(-0.031, 3), "little", "China -0.031");
assertEqual(id(0.2, 1), "little", "census +0.2");
assertEqual(id(-1, 3), "little", "-1");
assertEqual(id(-1, 1), "little", "census -1");
assertEqual(scale.roundDisplayed(-1.0001, 3), -1, "round -1.0001 to 3 dp");
assertEqual(id(-1.0001, 3), "little", "-1.0001 displays as -1.000");
assertEqual(id(-1.0006, 3), "light", "-1.0006 displays as -1.001");

// -5 <= v < -1 is light red. -5 itself stays light.
assertEqual(id(-4.9, 1), "light", "census -4.9");
assertEqual(id(-5, 3), "light", "-5");
assertEqual(id(-5, 1), "light", "census -5");
assertEqual(id(-5.0001, 3), "light", "-5.0001 displays as -5.000");
assertEqual(id(-5.0006, 3), "medium", "-5.0006 displays as -5.001");

// -15 <= v < -5 is mid red. -15 itself stays mid red.
assertEqual(id(-15, 3), "medium", "-15");
assertEqual(id(-15, 1), "medium", "census -15");
assertEqual(id(-15.0001, 3), "medium", "-15.0001 displays as -15.000");
assertEqual(id(-14.96, 1), "medium", "census -14.96 displays as -15.0");
assertEqual(id(-15.0006, 3), "dark", "-15.0006 displays as -15.001");
assertEqual(id(-15.1, 1), "dark", "census -15.1");
assertEqual(id(-27.8, 1), "dark", "census -27.8");

var labels = JSON.parse(fs.readFileSync("i18n/en.json", "utf8")).demographics;
assertEqual(labels.band_little, "Stable", "green legend name");
assertEqual(labels.band_little_range, "(\u22121% or more)", "green legend range");
assertEqual(labels.band_light, "Declining", "light red legend name");
assertEqual(labels.band_light_range, "(\u22125% up to but not including \u22121%)", "light red legend range");
assertEqual(labels.band_medium, "Strongly declining", "mid red legend name");
assertEqual(labels.band_medium_range, "(\u221215% up to but not including \u22125%)", "mid red legend range");
assertEqual(labels.band_dark, "Very strongly declining", "bright red legend name");
assertEqual(labels.band_dark_range, "(below \u221215%)", "bright red legend range");
assertEqual(labels.key_stable, "Stable", "title key name");
assertEqual(labels.key_mild, "Declining", "light red key name");
assertEqual(labels.key_endangered, "Strongly declining", "mid red key name");
assertEqual(labels.key_high, "Very strongly declining", "bright red key name");
assertEqual(labels.key_colour_green, "green", "title key colour is accessibility text only");
assertEqual(labels.map_desc, "Green countries have stable founding populations; light red have declining founding populations; medium red have strongly declining founding populations; dark red have very strongly declining founding populations.", "title paragraph");
assertEqual(labels.map_desc.indexOf("\u2212") === -1, true, "title paragraph has no numeric range");
assertEqual(labels.scale_note.indexOf("\u2212") === -1, true, "numeric ranges are not repeated below the map");
assertEqual(labels.band_dark_range.indexOf("\u221215%") !== -1, true, "numeric range stays in the inset legend");
assertEqual(labels.band_little_range.indexOf("pp") === -1, true, "legend range uses percent");
assertEqual(scale.relativeChange(7.3, 20.8, 1), -64.9, "South Africa relative decline");
assertEqual(scale.bandIdForChange(scale.relativeChange(7.3, 20.8, 1), 1), "dark", "South Africa band");
assertEqual(scale.relativeChange(100 - 7.615, 100 - 2.623, 2), -5.13, "Belgium relative decline");
assertEqual(scale.bandIdForChange(scale.relativeChange(100 - 7.615, 100 - 2.623, 2), 2), "medium", "Belgium band");
assertEqual(scale.relativeChange(68.5, 96.3, 1), -28.9, "Canada relative decline");
assertEqual(scale.relativeChange(1, 0, 1), null, "zero first share is unscored");
assertEqual(scale.relativeChange(null, 92.08, 1), null, "missing latest share is unscored");
var locales = fs.readdirSync("i18n").filter(function (name) { return name.endsWith(".json"); });
locales.forEach(function (name) {
  var copy = JSON.parse(fs.readFileSync("i18n/" + name, "utf8")).demographics;
  assertEqual(copy.map_desc, labels.map_desc, name + " map_desc");
  assertEqual(copy.scale_note.indexOf("\u2212") === -1, true, name + " scale_note has no numeric range");
  ["band_little", "band_light", "band_medium", "band_dark", "key_stable", "key_mild", "key_endangered", "key_high",
    "band_little_range", "band_light_range", "band_medium_range", "band_dark_range",
    "col_change", "col_proxy", "bar_desc"].forEach(function (key) {
    assertEqual(copy[key], labels[key], name + " " + key);
  });
});
var demoJs = fs.readFileSync("demographics.js", "utf8");
assertEqual(demoJs.indexOf("(${esc(t(b.keyColour))})") === -1, true, "title key does not print the colour word");
assertEqual(demoJs.indexOf("aria-label=\"${esc(colourName)}\"") !== -1, true, "colour name is an accessible label");
assertEqual(scale.BANDS[3].rangeKey, "band_little_range", "green band range key");

if (!process.exitCode) console.log("demographics-scale: boundary checks passed");
