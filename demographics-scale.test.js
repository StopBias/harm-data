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

assertEqual(scale.COLOURS.little, "#fdf0ee", "near-white");
assertEqual(scale.COLOURS.light, "#f5b7b1", "light red");
assertEqual(scale.COLOURS.medium, "#e74c3c", "medium red");
assertEqual(scale.COLOURS.dark, "#922b21", "dark red");
assertEqual(scale.BANDS.length, 4, "four bands");
assertEqual(scale.BANDS[3].outline, true, "near-white legend outline");

// >= -1, including gains and a shown zero, is the near-white band.
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

// -15 <= v < -5 is medium red. -15 itself stays medium.
assertEqual(id(-15, 3), "medium", "-15");
assertEqual(id(-15, 1), "medium", "census -15");
assertEqual(id(-15.0001, 3), "medium", "-15.0001 displays as -15.000");
assertEqual(id(-14.96, 1), "medium", "census -14.96 displays as -15.0");
assertEqual(id(-15.0006, 3), "dark", "-15.0006 displays as -15.001");
assertEqual(id(-15.1, 1), "dark", "census -15.1");
assertEqual(id(-27.8, 1), "dark", "census -27.8");

if (!process.exitCode) console.log("demographics-scale: boundary checks passed");
