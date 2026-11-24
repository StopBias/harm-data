// Endpoint checks for the Media map purple-to-cyan scale.
// Run: node media-scale.test.js
"use strict";

var fs = require("fs");
var html = fs.readFileSync("index.html", "utf8");
var start = html.indexOf("const MEDIA_PENDING_COLOR");
var end = html.indexOf("const colorFor =");
if (start < 0 || end < start) {
  console.error("FAIL could not find MEDIA_SCALE in index.html");
  process.exit(1);
}
var api = new Function(html.slice(start, end) + "\nreturn { colorForL: colorForL };")();

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    console.error("FAIL " + label + ": expected " + expected + ", got " + actual);
    process.exitCode = 1;
  }
}

assertEqual(api.colorForL(2), "#0cc0df", "antiwhite end");
assertEqual(api.colorForL(-2), "#6e0cdf", "antiblack end");
assertEqual(api.colorForL(0), "#f7f7f7", "centre");

var css = fs.readFileSync("media.css", "utf8");
assertEqual(css.indexOf("#fdb863") === -1 && css.indexOf("#e08214") === -1 && css.indexOf("#b35806") === -1, true, "legend bar has no brown stops");
assertEqual(css.indexOf("#9fe3ef") === -1 && css.indexOf("#2bb4cc") === -1 && css.indexOf("#077183") === -1, true, "legend bar has no previous cyan stops");
assertEqual(css.indexOf("#542788") === -1 && css.indexOf("#8073ac") === -1 && css.indexOf("#b2abd2") === -1, true, "legend bar has no previous purple stops");
assertEqual(css.indexOf("#6e0cdf, #a769e9, #d2b0f1") !== -1, true, "legend bar purple stops");
assertEqual(css.indexOf("#a9e5ef, #5ad2e7, #0cc0df") !== -1, true, "legend bar cyan stops");

if (!process.exitCode) console.log("media-scale: endpoint checks passed");
