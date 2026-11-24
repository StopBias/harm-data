// Boundary checks for the founding-share colour bands.
// Run: node demographics-scale.test.js
"use strict";

var scale = require("./demographics-scale.js");
var id = scale.bandIdForChange;

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    console.error("FAIL " + label + ": expected " + expected + ", got " + actual);
    process.exitCode = 1;
  }
}

// Proxy rows show 3 decimals, so -0.0001 is shown as 0.000 and treated as 0.
assertEqual(id(0, 3), "dark_green", "0");
assertEqual(id(-0, 3), "dark_green", "-0");
assertEqual(id(-0.0001, 3), "dark_green", "-0.0001 rounds to 0.000");
assertEqual(id(0.006, 3), "dark_green", "India +0.006");
assertEqual(id(-0.031, 3), "light_green", "China -0.031");
assertEqual(id(-1, 3), "light_green", "-1");
assertEqual(scale.roundDisplayed(-1.0001, 3), -1, "round -1.0001 to 3 dp");
assertEqual(id(-1.0001, 3), "light_green", "-1.0001 displays as -1.000");
assertEqual(id(-1.0006, 3), "yellow", "-1.0006 displays as -1.001");
assertEqual(id(-5, 3), "yellow", "-5");
assertEqual(id(-5.0001, 3), "yellow", "-5.0001 displays as -5.000");
assertEqual(id(-15, 3), "orange", "-15");
assertEqual(id(-15.0001, 3), "orange", "-15.0001 displays as -15.000");
assertEqual(id(-15.0006, 3), "red", "-15.0006 displays as -15.001");
assertEqual(id(-15.1, 1), "red", "census -15.1");
assertEqual(id(-14.96, 1), "orange", "census -14.96 displays as -15.0");

if (!process.exitCode) console.log("demographics-scale: boundary checks passed");
