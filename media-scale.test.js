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

assertEqual(api.colorForL(2), "#077183", "antiwhite end");
assertEqual(api.colorForL(-2), "#542788", "antiblack end");
assertEqual(api.colorForL(0), "#f7f7f7", "centre");

var css = fs.readFileSync("media.css", "utf8");
assertEqual(css.indexOf("#fdb863") === -1 && css.indexOf("#e08214") === -1 && css.indexOf("#b35806") === -1, true, "legend bar has no brown stops");
assertEqual(css.indexOf("#9fe3ef, #2bb4cc, #077183") !== -1, true, "legend bar cyan stops");

if (!process.exitCode) console.log("media-scale: endpoint checks passed");
