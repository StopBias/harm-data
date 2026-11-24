// Pure helpers for the Demographics supplements.
// origin series v1.14.0 (France, Germany, Spain) and the 1960–79 baseline v1.15.0.
// The baseline file stores latest founding share minus the baseline share.
// A fall is negative. That is the sign the live Demographics tab displays.
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.HarmDemographicsSupplements = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const PENDING_ISO = { ARM: true, GEO: true };

  function finite(v) {
    if (v == null || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function isNotVerified(row) {
    return /NOT VERIFIED/i.test(String((row && row.verification) || ""));
  }

  function isPublishableBaseline(row) {
    if (!row || !row.iso3) return false;
    if (isNotVerified(row)) return false;
    if (row.baseline_year == null || row.baseline_year === "") return false;
    if (row.baseline_founding_pct == null || row.baseline_founding_pct === "") return false;
    return true;
  }

  function displayChange(row) {
    if (!isPublishableBaseline(row)) return null;
    const direct = finite(row.change_pp_baseline_to_latest);
    if (direct != null) return { value: direct, indicative: false, raw: direct };
    const indicative = finite(row.indicative_change_pp_across_definition_break);
    if (indicative != null) return { value: indicative, indicative: true, raw: indicative };
    return { value: null, indicative: false, raw: null };
  }

  // When the optional baseline view is off, the caller keeps the existing score.
  // When it is on, a null value means "no 1960–79 change to colour", not the old score.
  function colourScore(baselineOn, row) {
    if (!baselineOn) return { useExisting: true, value: null };
    const change = row ? displayChange(row) : null;
    if (!change || change.value == null) return { useExisting: false, value: null };
    return { useExisting: false, value: change.value };
  }

  function textBlob(row) {
    const flags = Array.isArray(row && row.flags) ? row.flags : [];
    const sources = Array.isArray(row && row.sources) ? row.sources : [];
    return [
      row && row.measure,
      flags.join("\n"),
      sources.map(s => ((s && s.publisher) || "") + " " + ((s && s.title) || "")).join("\n")
    ].join("\n");
  }

  function baselineBadges(row) {
    if (!row) return [];
    const blob = textBlob(row);
    const badges = [];
    if (/DEFINITION BREAK/i.test(blob)) badges.push("definition_break");
    if (/(^|[^A-Za-z])ESTIMATE([^A-Za-z]|$)/i.test(blob)) badges.push("estimate");
    if (/weak\s+proxy/i.test(blob)) badges.push("weak_proxy");
    if (/Demoscope/i.test(blob)) badges.push("demoscope");
    return badges;
  }

  function classificationPending(iso) {
    return !!PENDING_ISO[iso];
  }

  function groupWording(s) {
    return String(s == null ? "" : s)
      .replace(/\b(?<!ethnic )Jews\b/g, "ethnic Jewish people")
      .replace(/\b(?<!ethnic )Jewish\b/g, "ethnic Jewish")
      .replace(/\b(?<!ethnic )(?<!non-)European\b/g, "ethnic European");
  }

  function sourceList(country) {
    return (country && Array.isArray(country.sources) ? country.sources : [])
      .map(s => ({
        publisher: (s && s.publisher) || "",
        title: (s && s.title) || "",
        url: (s && s.url) || ""
      }))
      .filter(s => /^https?:\/\//i.test(s.url));
  }

  function seriesChange(points, explicit) {
    if (explicit != null && explicit !== "" && Number.isFinite(Number(explicit))) return Number(explicit);
    if (!points || points.length < 2) return null;
    return Math.round((points[points.length - 1].value - points[0].value) * 100) / 100;
  }

  function sharePoint(p) {
    const value = finite(p && p.ethnic_european_founding_pct);
    if (!p || value == null) return null;
    return {
      year: p.year,
      value: value,
      provisional: /provisional/i.test(String(p.status || "")),
      frame: p.frame || ""
    };
  }

  function originModel(country) {
    if (!country || !country.iso3) return null;
    const iso = country.iso3;
    const base = {
      iso: iso,
      label: country.label || "",
      concept: country.concept || "",
      sources: sourceList(country)
    };
    if (iso === "FRA") {
      const points = (country.series || []).map(sharePoint).filter(Boolean);
      const filed = country.change_2011_2021_pp && country.change_2011_2021_pp.ethnic_european_founding;
      return Object.assign(base, {
        generations: "two",
        tracks: [{ id: "main", connect: true, points: points, change: seriesChange(points, filed) }],
        detached: [],
        sensitivity: null,
        unchained: false,
        snapshotNote: (country.snapshot_2024 && country.snapshot_2024.note) || ""
      });
    }
    if (iso === "DEU") {
      const chained = [];
      const detached = [];
      const sensitivity = {};
      (country.series || []).forEach(p => {
        const point = sharePoint(p);
        if (!point) return;
        const frame = String(point.frame);
        const oldFrame = /2011/.test(frame) && !/2022/.test(frame);
        if (oldFrame) detached.push(point);
        else chained.push(point);
        const sens = p.sensitivity_excl_north_america;
        if (sens && sens.ethnic_european_founding_pct != null) {
          sensitivity[p.year] = sens.ethnic_european_founding_pct;
        }
      });
      return Object.assign(base, {
        generations: "two",
        tracks: [{ id: "census2022", connect: true, points: chained, change: seriesChange(chained) }],
        detached: detached,
        sensitivity: sensitivity,
        unchained: true,
        snapshotNote: ""
      });
    }
    if (iso === "ESP") {
      const mapSeries = arr => {
        const points = (arr || []).map(sharePoint).filter(Boolean);
        return { points: points, change: seriesChange(points) };
      };
      const padron = mapSeries(country.series_padron_1998_2022);
      const table = mapSeries(country.series_stock_68525_2021_2026);
      return Object.assign(base, {
        generations: "first",
        tracks: [
          { id: "padron", connect: true, points: padron.points, change: padron.change },
          { id: "table68525", connect: true, points: table.points, change: table.change }
        ],
        detached: [],
        sensitivity: null,
        unchained: true,
        chainingNote: country.chaining_note || "",
        snapshotNote: ""
      });
    }
    return null;
  }

  function connectedPairs(model) {
    const pairs = [];
    (model && model.tracks || []).forEach(track => {
      if (!track.connect) return;
      const points = track.points || [];
      for (let i = 1; i < points.length; i++) {
        pairs.push([points[i - 1].year, points[i].year, track.id]);
      }
    });
    return pairs;
  }

  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"]/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"
    }[c]));
  }

  function originChartSvg(model, formatShare) {
    if (!model) return "";
    const fmt = formatShare || function (n) {
      return Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };
    const tracks = model.tracks || [];
    const detached = model.detached || [];
    const all = [];
    tracks.forEach(t => (t.points || []).forEach(p => all.push(p)));
    detached.forEach(p => all.push(p));
    if (!all.length) return "";
    const years = all.map(p => Number(p.year));
    const vals = all.map(p => Number(p.value));
    const xMin = Math.min.apply(null, years);
    const xMax = Math.max.apply(null, years);
    const yMinV = Math.min.apply(null, vals);
    const yMaxV = Math.max.apply(null, vals);
    const yPad = Math.max(0.8, (yMaxV - yMinV) * 0.22);
    const yMin = yMinV - yPad;
    const yMax = yMaxV + yPad * (detached.length ? 2.1 : 1.15);
    const W = 680;
    const H = detached.length ? 300 : 250;
    const L = 54;
    const R = 16;
    const T = detached.length ? 86 : 34;
    const B = 36;
    const xSpan = (xMax - xMin) || 1;
    const ySpan = (yMax - yMin) || 1;
    const X = year => L + ((Number(year) - xMin) / xSpan) * (W - L - R);
    const Y = v => T + ((yMax - v) / ySpan) * (H - T - B);
    const colors = {
      main: "#077183",
      census2022: "#077183",
      padron: "#077183",
      table68525: "#1d2a36"
    };
    const sparse = all.length <= 6;
    const parts = [];
    parts.push('<svg class="dv-chart" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + esc(chartLabel(model, fmt)) + '">');
    const ticks = 4;
    for (let i = 0; i < ticks; i++) {
      const v = yMin + ((yMax - yMin) * i) / (ticks - 1);
      const y = Y(v);
      parts.push('<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y.toFixed(1) + '" y2="' + y.toFixed(1) + '" stroke="#e3e7ea" stroke-width="1"></line>');
      parts.push('<text x="' + (L - 8) + '" y="' + (y + 4).toFixed(1) + '" text-anchor="end" font-size="12" fill="#5c656b">' + esc(fmt(v)) + "</text>");
    }
    tracks.forEach(track => {
      const points = track.points || [];
      if (!points.length) return;
      const color = colors[track.id] || "#077183";
      if (track.connect && points.length > 1) {
        const d = points.map(p => X(p.year).toFixed(1) + "," + Y(p.value).toFixed(1)).join(" ");
        const dash = track.id === "table68525" ? ' stroke-dasharray="5 4"' : "";
        parts.push('<polyline data-series="' + esc(track.id) + '" data-years="' + esc(points.map(p => p.year).join(",")) + '" fill="none" stroke="' + color + '" stroke-width="2.25" stroke-linejoin="round" stroke-linecap="round" points="' + d + '"' + dash + "></polyline>");
      }
      points.forEach((p, idx) => {
        const anchor = idx === 0 ? "start" : (idx === points.length - 1 ? "end" : "middle");
        parts.push(circle(p, X, Y, color, false, sparse, fmt, anchor));
      });
    });
    detached.forEach(p => {
      parts.push(circle(p, X, Y, "#8a5a00", true, true, fmt, "start"));
    });
    const yearSet = [];
    all.forEach(p => { if (yearSet.indexOf(p.year) < 0) yearSet.push(p.year); });
    const yearLabels = yearSet.length > 8
      ? [yearSet[0], yearSet[yearSet.length - 1]]
      : yearSet;
    yearLabels.forEach(year => {
      parts.push('<text x="' + X(year).toFixed(1) + '" y="' + (H - 12) + '" text-anchor="middle" font-size="12" fill="#5c656b">' + esc(year) + "</text>");
    });
    parts.push("</svg>");
    return parts.join("");
  }

  function circle(p, X, Y, color, detached, showLabel, fmt, anchor) {
    const x = X(p.year);
    const y = Y(p.value);
    const bits = [];
    const title = p.year + ": " + fmt(p.value) + (p.provisional ? " provisional" : "") + (detached ? " Census 2011 frame, not comparable" : "");
    bits.push('<circle data-year="' + esc(p.year) + '" data-connect="' + (detached ? "0" : "1") + '" data-value="' + esc(fmt(p.value)) + '"' +
      (detached ? ' data-label="Census 2011 frame, not comparable"' : "") +
      ' cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + (detached ? "5.5" : "4") + '" fill="' + (detached ? "#fff" : color) + '" stroke="' + color + '" stroke-width="2"><title>' + esc(title) + "</title></circle>");
    if (detached) {
      const lx = Math.max(8, x - 4).toFixed(1);
      const phraseY = Math.max(28, y - 36);
      bits.push('<text data-detached-label="1" x="' + lx + '" y="' + phraseY.toFixed(1) + '" text-anchor="start" font-size="13" fill="#8a5a00">');
      bits.push('<tspan x="' + lx + '" dy="0">Census 2011 frame,</tspan>');
      bits.push('<tspan x="' + lx + '" dy="15">not comparable</tspan>');
      bits.push("</text>");
      bits.push('<text data-point-label="' + esc(p.year) + '" x="' + (x + 18).toFixed(1) + '" y="' + (y + 4).toFixed(1) + '" text-anchor="start" font-size="13" fill="#8a5a00">' + esc(fmt(p.value)) + "</text>");
      return bits.join("");
    }
    if (showLabel) {
      const shift = anchor === "end" ? -8 : (anchor === "start" ? 8 : 0);
      const lx = (x + shift).toFixed(1);
      bits.push('<text data-point-label="' + esc(p.year) + '" x="' + lx + '" y="' + (y - (p.provisional ? 30 : 12)).toFixed(1) + '" text-anchor="' + anchor + '" font-size="13" fill="#1d2a36">' + esc(fmt(p.value)) + "</text>");
      if (p.provisional) {
        bits.push('<text data-provisional="1" x="' + lx + '" y="' + (y - 16).toFixed(1) + '" text-anchor="' + anchor + '" font-size="12" fill="#8a5a00">provisional</text>');
      }
    }
    return bits.join("");
  }

  function chartLabel(model, fmt) {
    const bits = ["Ethnic European share"];
    (model.tracks || []).forEach(track => {
      const points = track.points || [];
      if (!points.length) return;
      const a = points[0];
      const b = points[points.length - 1];
      bits.push(a.year + " " + fmt(a.value) + " to " + b.year + " " + fmt(b.value) + (b.provisional ? " provisional" : ""));
    });
    (model.detached || []).forEach(p => {
      bits.push(p.year + " " + fmt(p.value) + " Census 2011 frame, not comparable");
    });
    return bits.join(". ");
  }

  return {
    isNotVerified: isNotVerified,
    isPublishableBaseline: isPublishableBaseline,
    displayChange: displayChange,
    colourScore: colourScore,
    baselineBadges: baselineBadges,
    classificationPending: classificationPending,
    groupWording: groupWording,
    originModel: originModel,
    originChartSvg: originChartSvg,
    connectedPairs: connectedPairs,
    sourceList: sourceList
  };
});
