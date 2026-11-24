// The Media coverage note sits under the map heading, not in a floating box.
// Run: node media-map-note.test.js
"use strict";

var fs = require("fs");
var path = require("path");

var failed = 0;
function assert(cond, label) {
  if (!cond) {
    console.error("FAIL " + label);
    failed += 1;
  }
}

var html = fs.readFileSync("index.html", "utf8");
var js = fs.readFileSync("media.js", "utf8");
var css = fs.readFileSync("media.css", "utf8");

var heading = html.slice(html.indexOf('id="media-map-h"'), html.indexOf('id="views"'));
assert(heading.indexOf('id="media-map-h-title"') !== -1, "title span is inside #media-map-h");
assert(heading.indexOf('id="media-map-h-note"') !== -1, "note span is inside #media-map-h");
assert(heading.indexOf("antiwhite") !== -1, "heading uses one-word antiwhite");
assert(html.indexOf('id="media-map-note"') === -1, "index.html has no #media-map-note");
assert(html.indexOf("media-map-note") === -1, "index.html has no media-map-note class");
assert(js.indexOf("media-map-note") === -1, "media.js does not create #media-map-note");
assert(js.indexOf("placeMapNote") === -1, "floating-note placement is gone");
assert(js.indexOf('getElementById("media-map-h-note")') !== -1, "note is updated inside the heading");
assert(js.indexOf('"(" + text + ")"') !== -1, "note text is wrapped in round brackets");
assert(js.indexOf("note.hidden = true; note.textContent = \"\"") !== -1, "hidden note leaves no empty brackets");
assert(js.indexOf('tPlural("media.map_note"') !== -1, "pluralisation still uses media.map_note");
assert(css.indexOf(".media-map-note") === -1, "media.css has no floating-note rule");
assert(html.indexOf("font-size: 0.85rem; /* same as .site-tabs button */") !== -1, "note uses the tab label font size");
assert(html.indexOf("font-weight: normal") !== -1, "note is not bold");

["en", "de", "es", "fr", "it", "pt", "ru", "uk", "pl", "hu", "sv"].forEach(function (lang) {
  var pack = JSON.parse(fs.readFileSync(path.join("i18n", lang + ".json"), "utf8"));
  var one = pack.media && pack.media.map_note_one;
  var other = pack.media && pack.media.map_note_other;
  assert(typeof one === "string" && one.indexOf("{country}") !== -1, lang + " map_note_one");
  assert(typeof other === "string" && other.indexOf("{n}") !== -1 && other.indexOf("{list}") !== -1, lang + " map_note_other");
});

if (!failed) console.log("media-map-note: heading note checks passed");
else {
  console.error(failed + " failed");
  process.exitCode = 1;
}
