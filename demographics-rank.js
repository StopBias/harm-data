// Group header rows for the Demographics ranked country list.
// Census-scored rows stay in one block. Rows that display the UN figure,
// including census-limited rows, stay in the next block. Header rows are
// not countries: callers sort and filter the country list first, then
// insert headers, so search and sort never see them.
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.HarmDemographicsRank = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const HEADER_KEYS = {
    census: "group_census",
    proxy: "group_proxy"
  };

  // Exact column order of the ranked table.
  const COLUMN_KEYS = [
    "col_country",
    "col_first_year",
    "col_first_count",
    "col_first_share",
    "col_latest_year",
    "col_latest_count",
    "col_rel_change"
  ];

  function kindRank(kind) {
    if (kind === "census") return 0;
    if (kind === "proxy") return 1;
    return 2;
  }

  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"]/g, c => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;"
    }[c]));
  }

  // Census block, then UN block, then unscored. compareWithin is the
  // existing sort and runs only inside a block.
  function sortGrouped(list, kindOf, compareWithin) {
    const kind = typeof kindOf === "function" ? kindOf : function () { return "none"; };
    const within = typeof compareWithin === "function" ? compareWithin : function () { return 0; };
    return list.slice().sort((a, b) => {
      const g = kindRank(kind(a)) - kindRank(kind(b));
      if (g) return g;
      return within(a, b) || 0;
    });
  }

  // Insert one header at the start of the census block and one at the
  // start of the UN block. Unscored rows get no header. A header has no
  // country, so it cannot be selected, sorted or filtered as a row.
  function withGroupHeaders(sorted, kindOf) {
    const kind = typeof kindOf === "function" ? kindOf : function () { return "none"; };
    const out = [];
    const seen = { census: false, proxy: false };
    (sorted || []).forEach(country => {
      const k = kind(country);
      if ((k === "census" || k === "proxy") && !seen[k]) {
        seen[k] = true;
        out.push({ type: "header", kind: k, key: HEADER_KEYS[k] });
      }
      out.push({ type: "row", country: country, kind: k });
    });
    return out;
  }

  // A count already stored on the row. Missing, blank, or non-numeric
  // values stay empty so the table can show a dash. Nothing is derived
  // from a share or from total population.
  function storedCount(v) {
    if (v == null || v === "" || typeof v === "boolean") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  // One ranked-table record. pre wins over a census score, then a UN proxy.
  // preCount / latestCount are used only when they are already numbers.
  function rankedEndpoint(spec) {
    const src = spec || {};
    if (src.pre) {
      return {
        kind: "census",
        firstYear: src.pre.first_year,
        firstShare: src.pre.first_share,
        firstCount: storedCount(src.preCount),
        latestYear: src.pre.latest_year,
        latestShare: src.pre.latest_share,
        latestCount: storedCount(src.latestCount),
        change: src.pre.change,
        proxy: false
      };
    }
    if (src.census) {
      return {
        kind: "census",
        firstYear: src.census.first_year,
        firstShare: src.census.first_share,
        firstCount: storedCount(src.census.first_count),
        latestYear: src.census.latest_year,
        latestShare: src.census.latest_share,
        latestCount: storedCount(src.census.latest_count),
        change: src.census.change,
        proxy: false
      };
    }
    if (src.proxy) {
      return {
        kind: "proxy",
        firstYear: 1990,
        firstShare: src.proxy.firstShare,
        firstCount: storedCount(src.proxy.first_count),
        latestYear: 2020,
        latestShare: src.proxy.latestShare,
        latestCount: storedCount(src.proxy.latest_count),
        change: src.proxy.change,
        proxy: true
      };
    }
    return {
      kind: "none",
      firstYear: null,
      firstShare: null,
      firstCount: null,
      latestYear: null,
      latestShare: null,
      latestCount: null,
      change: null,
      proxy: false
    };
  }

  function dash(v, format) {
    if (v == null || v === "") return "\u2014";
    return esc(typeof format === "function" ? format(v) : String(v));
  }

  function columnHeadMarkup(labels) {
    const cells = (labels || []).map(label => `<th scope="col">${esc(label)}</th>`);
    return `<tr class="dv-rank-cols">${cells.join("")}</tr>`;
  }

  // Section title spans every column. It is not a country row.
  function sectionRowMarkup(kind, text) {
    const proxy = kind === "proxy" ? " is-proxy" : "";
    return `<tr class="dv-rank-section${proxy}"><th colspan="7" scope="colgroup">${esc(text)}</th></tr>`;
  }

  // Country name is its own cell, in full. No concept-break pill is drawn.
  function countryRowMarkup(row, format) {
    const fmt = format || {};
    const name = esc(row && row.name || "");
    const color = esc(row && row.color || "transparent");
    const small = row && row.small
      ? ` <span class="dv-small-flag">${esc(row.smallLabel || "")}</span>`
      : "";
    const end = rankedEndpoint(row);
    const shareDigits = end.proxy ? (fmt.shareProxy || fmt.share) : fmt.share;
    return `<tr class="dv-rank-row${row && row.selected ? " is-selected" : ""}" data-id="${esc(row && row.id || "")}" tabindex="0">
      <th scope="row" class="dv-rank-name"><span class="dv-rank-swatch" style="background:${color}" aria-hidden="true"></span><span class="dv-rank-label">${name}</span>${small}</th>
      <td>${dash(end.firstYear, fmt.year)}</td>
      <td>${dash(end.firstCount, fmt.count)}</td>
      <td>${dash(end.firstShare, shareDigits)}</td>
      <td>${dash(end.latestYear, fmt.year)}</td>
      <td>${dash(end.latestCount, fmt.count)}</td>
      <td>${dash(end.change, end.proxy ? fmt.changeProxy : fmt.change)}</td>
    </tr>`;
  }

  return {
    HEADER_KEYS: HEADER_KEYS,
    COLUMN_KEYS: COLUMN_KEYS,
    sortGrouped: sortGrouped,
    withGroupHeaders: withGroupHeaders,
    storedCount: storedCount,
    rankedEndpoint: rankedEndpoint,
    columnHeadMarkup: columnHeadMarkup,
    sectionRowMarkup: sectionRowMarkup,
    countryRowMarkup: countryRowMarkup
  };
});
