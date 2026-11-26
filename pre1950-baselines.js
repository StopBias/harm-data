// Browser and Node export. The functions below are the prepared resolver.
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.Pre1950Baselines = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

// Resolve official pre-1950 baselines into a relative-% change for the
// Demographics map. Italy is never scored from this file. Australia is
// not scored from it either: there is no official comparable latest
// founding-pool share in the core data (2021 ancestry is a concept break
// with no unique-person recode). Latest shares come from the existing
// census fields or, for France, Germany and Spain, from the already
// verified origin-series supplement. A fall in the founding share is
// negative. Callers should treat every scored row as a definition break.

function finite(n) {
  return n != null && n !== "" && Number.isFinite(Number(n));
}

function verifiedRow(row) {
  if (!row) return null;
  if (row.iso3 === "ITA" || row.concept === "unverified") return null;
  if (row.verification && /NOT VERIFIED/i.test(row.verification)) return null;
  if (!finite(row.founding_share_pct) || !finite(row.baseline_year)) return null;
  return row;
}

function censusLatest(country) {
  const ce = country && country.census;
  if (!ce) return null;
  if (!finite(ce.latest_share_in_founding_pool) || !finite(ce.latest_year)) return null;
  return {
    year: Number(ce.latest_year),
    share: Number(ce.latest_share_in_founding_pool),
    source: "census"
  };
}

function isProvisionalOriginPoint(pt) {
  if (!pt || typeof pt !== "object") return true;
  if (pt.verified === false) return true;
  if (pt.provisional === true) return true;
  const status = String(pt.status || "");
  if (/FIRST RESULTS|Erstergebnisse|provisional/i.test(status)) return true;
  if (pt.ethnic_european_founding_pct == null && pt.value == null) return true;
  return false;
}

function originLatest(iso, originData) {
  const block = originData && originData.countries && (originData.countries[iso] || null);
  if (!block) return null;
  let points = [];
  if (iso === "ESP") {
    points = Array.isArray(block.series_stock_68525_2021_2026) ? block.series_stock_68525_2021_2026 : [];
  } else if (Array.isArray(block.series)) {
    points = block.series;
  }
  const usable = points.filter(pt => !isProvisionalOriginPoint(pt) && finite(pt.ethnic_european_founding_pct) && finite(pt.year));
  if (!usable.length) return null;
  const pt = usable[usable.length - 1];
  return {
    year: Number(pt.year),
    share: Number(pt.ethnic_european_founding_pct),
    source: "origin_series"
  };
}

function officialLatest(country, originData) {
  if (!country) return null;
  const iso = country.iso3 || country.id;
  return censusLatest(country) || originLatest(iso, originData);
}

function resolve(row, country, originData, scale) {
  const base = verifiedRow(row);
  if (!base) return { use: false, reason: "no_verified_pre1950_row" };
  const latest = officialLatest(country, originData);
  if (!latest) {
    return {
      use: false,
      reason: "no_comparable_official_latest_share",
      indicator: {
        year: Number(base.baseline_year),
        share: Number(base.founding_share_pct),
        concept: base.concept,
        territory: base.territory || null
      }
    };
  }
  if (!scale || typeof scale.relativeChange !== "function") return { use: false, reason: "no_scale" };
  const change = scale.relativeChange(latest.share, base.founding_share_pct, 1);
  if (change == null) return { use: false, reason: "unscored" };
  const band = scale.bandIdForChange(change, 1);
  return {
    use: true,
    definition_break: true,
    iso3: base.iso3,
    concept: base.concept,
    territory: base.territory || null,
    first_year: Number(base.baseline_year),
    first_share: Number(base.founding_share_pct),
    latest_year: latest.year,
    latest_share: latest.share,
    latest_source: latest.source,
    change: change,
    band_id: band
  };
}

function indexRows(dataset) {
  const out = {};
  const rows = (dataset && dataset.rows) || [];
  rows.forEach(r => { if (r && r.iso3) out[r.iso3] = r; });
  return out;
}

return {
  verifiedRow,
  officialLatest,
  resolve,
  indexRows
};
});
