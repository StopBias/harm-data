// Colour bands for the change in founding population share, in percentage points.
// Round to the digits the row actually shows, then use half-open cuts.
//   v >= 0            dark green   no change or a gain
//   -1 <= v < 0       light green  within 1 point
//   -5 <= v < -1      yellow
//   -15 <= v < -5     orange
//   v < -15           red
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.ShareScale = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var COLOURS = {
    dark_green: "#1e8449",
    light_green: "#8bc34a",
    yellow: "#f4d03f",
    orange: "#f39c12",
    red: "#e74c3c"
  };

  // Same order as the legend: largest decline first.
  var BANDS = [
    { id: "red", color: COLOURS.red, labelKey: "band_red" },
    { id: "orange", color: COLOURS.orange, labelKey: "band_orange" },
    { id: "yellow", color: COLOURS.yellow, labelKey: "band_yellow" },
    { id: "light_green", color: COLOURS.light_green, labelKey: "band_near" },
    { id: "dark_green", color: COLOURS.dark_green, labelKey: "band_gain" }
  ];

  function roundDisplayed(value, digits) {
    var n = Number(value);
    if (!isFinite(n)) return null;
    var f = Math.pow(10, digits == null ? 3 : digits);
    var r = Math.round(n * f) / f;
    return r === 0 ? 0 : r;
  }

  function bandIdForChange(value, digits) {
    var v = roundDisplayed(value, digits);
    if (v == null) return null;
    if (v >= 0) return "dark_green";
    if (v >= -1) return "light_green";
    if (v >= -5) return "yellow";
    if (v >= -15) return "orange";
    return "red";
  }

  function bandForChange(value, digits) {
    var id = bandIdForChange(value, digits);
    if (!id) return null;
    for (var i = 0; i < BANDS.length; i++) {
      if (BANDS[i].id === id) return BANDS[i];
    }
    return null;
  }

  return {
    COLOURS: COLOURS,
    BANDS: BANDS,
    roundDisplayed: roundDisplayed,
    bandIdForChange: bandIdForChange,
    bandForChange: bandForChange
  };
});
