// The Demographics tab scores only areas that are absent from
// data/demographics/not_scored.json. That file is the whole list.
// This module does not apply a population cutoff of its own.
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.DemographicsNotScored = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var NO_SCORE = "#b9bfc4";

  function isoOf(countryOrIso) {
    if (!countryOrIso) return "";
    if (typeof countryOrIso === "string") return countryOrIso;
    return countryOrIso.iso3 || countryOrIso.id || "";
  }

  function open(list) {
    if (!list || !Array.isArray(list.areas)) throw new Error("not_scored list has no areas");
    if (list.no_score_color !== NO_SCORE) throw new Error("no-score grey must be #b9bfc4");
    var byIso = {};
    list.areas.forEach(function (area) {
      if (!area || !area.iso3) throw new Error("not_scored area is missing iso3");
      if (byIso[area.iso3]) throw new Error("duplicate not_scored iso3 " + area.iso3);
      if (!area.reason) throw new Error("not_scored area needs a reason");
      if (!area.popup || area.popup.indexOf("Not scored") !== 0) {
        throw new Error("popup must start with Not scored");
      }
      byIso[area.iso3] = area;
    });

    function entry(countryOrIso) {
      return byIso[isoOf(countryOrIso)] || null;
    }

    function isNotScored(countryOrIso) {
      return !!entry(countryOrIso);
    }

    function popupText(countryOrIso) {
      var area = entry(countryOrIso);
      return area ? area.popup : null;
    }

    // In-group listed areas are no-score grey. Out-of-group areas keep the
    // lighter grey, listed or not. A scored area uses scoredColor.
    function mapColor(countryOrIso, inGroup, scoredColor, colors) {
      var noScore = (colors && colors.noScore) || NO_SCORE;
      var outGroup = (colors && colors.outOfGroup) || "#eceeef";
      if (!inGroup) return outGroup;
      if (isNotScored(countryOrIso)) return noScore;
      return scoredColor || noScore;
    }

    function ranked(countries) {
      return (countries || []).filter(function (c) { return c && !isNotScored(c); });
    }

    function roster(countries) {
      var stored = { census: 0, census_limited: 0, estimate: 0, none: 0 };
      var scored = {
        countries: 0,
        census: 0,
        census_limited: 0,
        estimate: 0,
        none: 0,
        not_scored: 0,
        scored: 0
      };
      (countries || []).forEach(function (c) {
        scored.countries += 1;
        var kind = c.availability || "none";
        if (stored[kind] == null) stored[kind] = 0;
        stored[kind] += 1;
        if (isNotScored(c)) {
          scored.not_scored += 1;
          return;
        }
        if (scored[kind] == null) scored[kind] = 0;
        scored[kind] += 1;
        scored.scored += 1;
      });
      return { stored: stored, scored: scored };
    }

    return {
      NO_SCORE: NO_SCORE,
      areas: list.areas,
      entry: entry,
      isNotScored: isNotScored,
      popupText: popupText,
      mapColor: mapColor,
      ranked: ranked,
      roster: roster
    };
  }

  return { NO_SCORE: NO_SCORE, open: open };
});
