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

  // Full-width group label. The label cell spans every column of the
  // ranked-list grid (see .dv-group-head .dv-group-label).
  function groupHeaderMarkup(kind, text) {
    const proxy = kind === "proxy" ? " is-proxy" : "";
    return `<li class="dv-group-head${proxy}" role="presentation"><span class="dv-group-label">${esc(text)}</span></li>`;
  }

  return {
    HEADER_KEYS: HEADER_KEYS,
    sortGrouped: sortGrouped,
    withGroupHeaders: withGroupHeaders,
    groupHeaderMarkup: groupHeaderMarkup
  };
});
