// Colour bands for the change in founding population share, in percentage points.
// Round to the digits the row actually shows, then use half-open cuts.
// One red hue. Census and UN-proxy values use the same cuts.
//   v >= -1           near-white   little or no decline, including a gain
//   -5 <= v < -1      light red
//   -15 <= v < -5     medium red
//   v < -15           dark red
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.ShareScale = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var COLOURS = {
    little: "#fdf0ee",
    light: "#f5b7b1",
    medium: "#e74c3c",
    dark: "#922b21"
  };

  // Same order as the legend: largest decline first.
  // The near-white swatch needs an outline so it stays distinct from no-data grey.
  var BANDS = [
    { id: "dark", color: COLOURS.dark, labelKey: "band_dark" },
    { id: "medium", color: COLOURS.medium, labelKey: "band_medium" },
    { id: "light", color: COLOURS.light, labelKey: "band_light" },
    { id: "little", color: COLOURS.little, labelKey: "band_little", outline: true }
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
    if (v >= -1) return "little";
    if (v >= -5) return "light";
    if (v >= -15) return "medium";
    return "dark";
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
