// Demographics tab. Reads data/demographics.json.
// User-facing text lives in i18n/*.json under the demographics.* prefix.
// Group lists (geographic region, founding population, Anglosphere,
// data availability) come from the data file so new groups can be added
// without changing this file.
(function () {
  "use strict";

  const t = (key, vars) => (window.t ? window.t("demographics." + key, vars) : key);
  const locale = () => (window.currentLocale ? window.currentLocale() : (document.documentElement.lang || "en"));
  const esc = v => String(v == null ? "" : v).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  const COUNTRIES_URL = "data/countries-ne50m.geojson";
  const DATA_URL = "data/demographics.json";
  const WORLD_BOUNDS = [[-180, -56], [180, 80]];
  const DEFAULT_NO_SCORE = "#b9bfc4";
  const DEFAULT_OUT_GROUP = "#eceeef";
  const FETCH_MS = 20000;
  const AVAIL_DEFAULTS = {
    census: "#077183",
    census_limited: "#7eb8c2",
    estimate: "#b9bfc4",
    none: "#eceeef"
  };

  let data = null, loading = null, byId = {}, map = null, mapReady = false, mapWait = 0, hoveredIso = null;
  const view = document.getElementById("demographics-view");
  if (!view) return;

  const state = {
    viewId: null,
    groupId: null,
    query: "",
    sortKey: "high",
    details: false,
    selected: null
  };

  function enOnlyBadge() {
    const lang = (document.documentElement.lang || "en").slice(0, 2).toLowerCase();
    if (lang === "en") return "";
    const label = window.t ? window.t("shown_in_english") : "Shown in English";
    return ` <span class="en-only">${esc(label)}</span>`;
  }

  function fmt(n, opts) {
    if (n == null || n === "") return "—";
    return Number(n).toLocaleString(locale(), opts);
  }

  function fmtScore(n) {
    if (n == null || n === "") return "—";
    return Number(n).toLocaleString(locale(), {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
      signDisplay: "exceptZero"
    });
  }

  function fmtYear(n) {
    if (n == null || n === "") return "—";
    return String(Math.round(Number(n)));
  }

  function formatYearSpan(first, latest) {
    if (first == null || latest == null || first === "" || latest === "") return "";
    const a = Number(first);
    const b = Number(latest);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return "";
    return fmtYear(a) + "–" + fmtYear(b);
  }

  // Years shown beside a bar. Census rows use census.first_year–latest_year.
  // Hatched UN rows use the window named by score_id (D_YYYY_YYYY) only when
  // the displayed score is that same un_d_YYYY_YYYY field. Otherwise blank.
  function rowYearLabel(c) {
    if (!c) return "";
    if (isCensus(c)) {
      const ce = c.census;
      return ce ? formatYearSpan(ce.first_year, ce.latest_year) : "";
    }
    if (!isEstimate(c) || c.score == null || typeof c.score_id !== "string") return "";
    const m = c.score_id.match(/^D_(\d{4})_(\d{4})$/);
    if (!m) return "";
    const field = "un_d_" + m[1] + "_" + m[2];
    if (c[field] == null || Number(c.score) !== Number(c[field])) return "";
    return formatYearSpan(m[1], m[2]);
  }

  function views() {
    return (data && Array.isArray(data.views)) ? data.views : [];
  }

  function viewDef(id) {
    return views().find(v => v.id === id) || views()[0] || null;
  }

  function groupDef(v, id) {
    if (!v || !Array.isArray(v.groups)) return null;
    return v.groups.find(g => g.id === id) || v.groups.find(g => g.id === v.default_group) || v.groups[0] || null;
  }

  function groupLabel(g) {
    if (!g) return "";
    if (g.label_key) {
      const key = "demographics." + g.label_key;
      const s = window.t ? window.t(key) : key;
      if (s && s !== key) return s;
    }
    return g.label || g.id;
  }

  function viewLabel(v) {
    if (!v) return "";
    if (v.label_key) {
      const key = "demographics." + v.label_key;
      const s = window.t ? window.t(key) : key;
      if (s && s !== key) return s;
    }
    return v.label || v.id;
  }

  function currentMembers() {
    const v = viewDef(state.viewId);
    const g = groupDef(v, state.groupId);
    if (!g || !Array.isArray(g.members)) return Object.keys(byId);
    return g.members.filter(id => byId[id]);
  }

  function memberSet() {
    return new Set(currentMembers());
  }

  function isAvailabilityView() {
    return state.viewId === "availability";
  }

  function bands() {
    return (data && data.scale && Array.isArray(data.scale.bands)) ? data.scale.bands : [];
  }

  function estimateBands() {
    return (data && data.scale && Array.isArray(data.scale.estimate_bands)) ? data.scale.estimate_bands : [];
  }

  function noScoreColor() {
    return (data && data.scale && data.scale.no_score_color) || DEFAULT_NO_SCORE;
  }

  function outGroupColor() {
    return (data && data.scale && data.scale.out_of_group_color) || DEFAULT_OUT_GROUP;
  }

  function availColor(kind) {
    const mapCols = (data && data.scale && data.scale.availability_colors) || {};
    return mapCols[kind] || AVAIL_DEFAULTS[kind] || noScoreColor();
  }

  function bandIn(score, list) {
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (score >= b.from && (score < b.to || (i === list.length - 1 && score <= b.to))) return b;
    }
    return null;
  }

  function bandFor(c) {
    if (!c || c.score == null) return null;
    if (c.score_kind === "census") return bandIn(c.score, bands());
    return bandIn(c.score, estimateBands());
  }

  function colorForCountry(c, inGroup) {
    if (!inGroup) return outGroupColor();
    if (!c) return noScoreColor();
    if (isAvailabilityView()) return availColor(c.availability || "none");
    if (c.score == null) return noScoreColor();
    const b = bandFor(c);
    return b ? b.color : noScoreColor();
  }

  function isEstimate(c) {
    return !!(c && c.score_kind === "estimate");
  }

  function isCensus(c) {
    return !!(c && c.score_kind === "census");
  }

  function countryName(c) {
    if (!c) return "";
    if (c.iso3 && window.HarmMap && window.HarmMap.countryName) {
      const n = window.HarmMap.countryName(c.iso3, c.name);
      if (n) return n;
    }
    return c.name || c.id;
  }

  function poolLabel(code) {
    if (!code) return "—";
    const key = "demographics.pool_" + code;
    const s = window.t ? window.t(key) : key;
    if (s && s !== key) return s;
    const p = (data.pools || []).find(x => x.id === code);
    return (p && p.label) || code;
  }

  function qualityLabel(q) {
    if (!q) return "";
    const key = "demographics.quality_" + String(q).toLowerCase();
    const s = window.t ? window.t(key) : key;
    return (s && s !== key) ? s : t("tooltip_quality", { quality: q });
  }

  function isSmall(c) {
    return !!(c && c.small_population);
  }

  function bandLabel(b) {
    if (!b) return "";
    if (b.label) return b.label;
    if (b.open_ended) return String(b.from) + "+";
    return b.from + "–" + b.to;
  }

  function destroyMap() {
    if (mapWait) { cancelAnimationFrame(mapWait); mapWait = 0; }
    if (map) {
      try { if (tooltip) tooltip.remove(); } catch (e) {}
      try { map.remove(); } catch (e) {}
    }
    map = null;
    mapReady = false;
    hoveredIso = null;
  }

  function showStatus(kind, message) {
    destroyMap();
    const retry = kind === "error"
      ? `<p><button type="button" class="dv-retry" id="dv-retry">${esc(t("retry"))}</button></p>`
      : "";
    view.innerHTML = `<div class="dv-status" data-kind="${esc(kind)}" role="${kind === "error" ? "alert" : "status"}">
      <p>${esc(message)}</p>${retry}
    </div>`;
  }

  function showMapMessage(text) {
    const box = view.querySelector("#dv-map-error");
    if (!box) return;
    box.hidden = !text;
    box.textContent = text || "";
  }

  // ---------- Shell ----------
  function mountShell() {
    view.innerHTML = `<div class="dv-inner">
      <section class="dv-section" aria-labelledby="dv-map-h">
        <h3 class="dv-h" id="dv-map-h"></h3>
        <p class="dv-desc" id="dv-map-desc"></p>
        <div class="dv-switcher-wrap">
          <div class="dv-switcher" id="dv-switcher" role="group"></div>
          <label class="dv-filter-lab" id="dv-group-lab">
            <span id="dv-group-lbl"></span>
            <select id="dv-group"></select>
          </label>
        </div>
        <div class="dv-map-wrap">
          <div id="dv-map" role="img"></div>
          <div class="dv-map-error" id="dv-map-error" hidden></div>
          <div class="dv-legend" id="dv-legend"></div>
        </div>
        <p class="dv-scale-note" id="dv-scale-note"></p>
        <div class="dv-selected" id="dv-selected" hidden></div>
      </section>
      <div class="dv-head">
        <h2 id="dv-title"></h2>
        <div class="dv-banner" id="dv-banner" hidden></div>
        <p class="dv-desc" id="dv-lede"></p>
        <p class="dv-prov-note" id="dv-prov-note"></p>
      </div>
      <section class="dv-section dv-records" aria-labelledby="dv-records-h">
        <h3 class="dv-h" id="dv-records-h"></h3>
        <p class="dv-desc" id="dv-records-p1"></p>
        <p class="dv-desc" id="dv-records-p2"></p>
        <p class="dv-desc" id="dv-records-p3"></p>
        <p class="dv-desc" id="dv-records-p4"></p>
        <div class="dv-avail-legend" id="dv-avail-legend"></div>
      </section>
      <section class="dv-section" aria-labelledby="dv-bar-h">
        <h3 class="dv-h" id="dv-bar-h"></h3>
        <p class="dv-desc" id="dv-bar-desc"></p>
        <div class="dv-list-toolbar">
          <label class="dv-search-lab" id="dv-search-lab">
            <span id="dv-search-lbl"></span>
            <input type="search" id="dv-search" autocomplete="off">
          </label>
          <label class="dv-filter-lab">
            <span id="dv-sort-lbl"></span>
            <select id="dv-sort"></select>
          </label>
          <p class="dv-list-count" id="dv-list-count"></p>
        </div>
        <ul class="dv-bars" id="dv-bars"></ul>
      </section>
      <section class="dv-section" aria-labelledby="dv-regional-h">
        <h3 class="dv-h" id="dv-regional-h"></h3>
        <p class="dv-desc" id="dv-regional-note"></p>
        <div class="dv-table-wrap" id="dv-regional"></div>
      </section>
      <section class="dv-section">
        <button type="button" class="dv-details-btn" id="dv-details-btn"></button>
        <div class="dv-details" id="dv-details" hidden></div>
        <p class="dv-source" id="dv-source"></p>
      </section>
    </div>`;
  }

  function worldContextVars() {
    const rows = (data && data.world_context) || [];
    const first = rows.find(r => r.year === 1950) || rows[0];
    const last = rows.find(r => r.year === 2024) || rows[rows.length - 1];
    return {
      first_year: first ? fmtYear(first.year) : "1950",
      first: first ? fmt(first.combined_pct_world, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : "29.3",
      latest_year: last ? fmtYear(last.year) : "2024",
      latest: last ? fmt(last.combined_pct_world, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : "14.4"
    };
  }

  function labelStatic() {
    const set = (sel, text) => { const el = view.querySelector(sel); if (el) el.textContent = text; };
    set("#dv-title", t("title"));
    set("#dv-lede", t("lede"));
    set("#dv-prov-note", t("provisional_note"));
    set("#dv-records-h", t("records_h"));
    set("#dv-records-p1", t("records_p1"));
    set("#dv-records-p2", t("records_p2"));
    set("#dv-records-p3", t("records_p3"));
    const p4 = view.querySelector("#dv-records-p4");
    if (p4) p4.textContent = t("records_p4", worldContextVars());
    set("#dv-map-h", t("map_h"));
    set("#dv-map-desc", t("map_desc"));
    set("#dv-scale-note", isAvailabilityView() ? t("avail_scale_note") : t("scale_note"));
    set("#dv-bar-h", t("bar_h"));
    set("#dv-bar-desc", t("bar_desc"));
    set("#dv-search-lbl", t("search"));
    const search = view.querySelector("#dv-search");
    if (search) {
      search.setAttribute("aria-label", t("search_aria"));
      search.setAttribute("placeholder", t("search"));
      if (search.value !== state.query) search.value = state.query;
    }
    set("#dv-sort-lbl", t("sort"));
    set("#dv-group-lbl", t("group_filter"));
    set("#dv-source", t("source_caption"));
    set("#dv-regional-h", t("regional_h"));
    set("#dv-regional-note", t("regional_note"));
    const banner = view.querySelector("#dv-banner");
    if (banner) {
      const show = !data || data.provisional || data.published === false;
      banner.hidden = !show;
      if (show) {
        banner.innerHTML = `<strong>${esc(t("provisional_badge"))}</strong><p>${esc(t("provisional_banner"))}</p>`;
      }
    }
    const btn = view.querySelector("#dv-details-btn");
    if (btn) btn.textContent = state.details ? t("details_hide") : t("details_btn");
  }

  function renderAvailLegend() {
    const el = view.querySelector("#dv-avail-legend");
    if (!el) return;
    const counts = (data && data.counts) || {};
    const items = [
      ["census", t("legend_census"), counts.census],
      ["census_limited", t("legend_limited"), counts.census_limited],
      ["estimate", t("legend_estimate_only"), counts.estimate],
      ["none", t("legend_none"), counts.none]
    ].filter(row => row[2] != null);
    el.innerHTML = `<div class="dv-legend-title">${esc(t("avail_legend_h"))}</div>
      <div class="dv-legend-items">${items.map(([k, lab, n]) =>
        `<span class="dv-legend-item"><span class="swatch" style="background:${esc(availColor(k))}"></span>${esc(lab)} (${esc(fmt(n, { maximumFractionDigits: 0 }))})</span>`
      ).join("")}</div>`;
  }

  function renderSwitcher() {
    const box = view.querySelector("#dv-switcher");
    if (!box) return;
    box.setAttribute("aria-label", t("views_label"));
    box.innerHTML = views().map(v => {
      const pressed = v.id === state.viewId;
      return `<button type="button" data-view="${esc(v.id)}" aria-pressed="${pressed}">${esc(viewLabel(v))}</button>`;
    }).join("");
    renderGroupSelect();
  }

  function renderGroupSelect() {
    const lab = view.querySelector("#dv-group-lab");
    const sel = view.querySelector("#dv-group");
    if (!lab || !sel) return;
    const v = viewDef(state.viewId);
    const groups = (v && v.groups) || [];
    const hide = groups.length <= 1;
    lab.hidden = hide;
    if (hide) return;
    const continents = groups.filter(g => g.level === "continent");
    if (continents.length) {
      const all = groups.find(g => g.id === "all");
      let html = all ? `<option value="${esc(all.id)}">${esc(groupLabel(all))}</option>` : "";
      continents.forEach(cont => {
        const kids = groups.filter(g => g.parent === cont.id);
        html += `<optgroup label="${esc(groupLabel(cont))}">`;
        html += `<option value="${esc(cont.id)}">${esc(t("geo_continent_all", { name: groupLabel(cont) }))}</option>`;
        kids.forEach(g => { html += `<option value="${esc(g.id)}">${esc(groupLabel(g))}</option>`; });
        html += `</optgroup>`;
      });
      sel.innerHTML = html;
    } else {
      sel.innerHTML = groups.map(g => `<option value="${esc(g.id)}">${esc(groupLabel(g))}</option>`).join("");
    }
    if (![...sel.options].some(o => o.value === state.groupId)) {
      state.groupId = v.default_group || (groups[0] && groups[0].id);
    }
    sel.value = state.groupId;
  }

  function renderSort() {
    const sel = view.querySelector("#dv-sort");
    if (!sel) return;
    const opts = [
      ["high", t("sort_high")],
      ["low", t("sort_low")],
      ["name", t("sort_name")]
    ];
    sel.innerHTML = opts.map(([v, lab]) => `<option value="${esc(v)}">${esc(lab)}</option>`).join("");
    sel.value = state.sortKey;
  }

  function renderLegend() {
    const el = view.querySelector("#dv-legend");
    if (!el) return;
    if (isAvailabilityView()) {
      const items = [
        ["census", t("legend_census")],
        ["census_limited", t("legend_limited")],
        ["estimate", t("legend_estimate_only")],
        ["none", t("legend_none")]
      ].map(([k, lab]) =>
        `<span class="dv-legend-item"><span class="swatch" style="background:${esc(availColor(k))}"></span>${esc(lab)}</span>`
      ).join("");
      el.innerHTML = `<div class="dv-legend-title">${esc(t("avail_legend_h"))}</div>
        <div class="dv-legend-items">${items}
          <span class="dv-legend-item subtle"><span class="swatch" style="background:${esc(outGroupColor())}; box-shadow: inset 0 0 0 1px #d5d8da"></span>${esc(t("legend_out_of_group"))}</span>
        </div>`;
      return;
    }
    const list = bands().slice().reverse();
    const items = list.map(b =>
      `<span class="dv-legend-item"><span class="swatch" style="background:${esc(b.color)}"></span>${esc(bandLabel(b))}</span>`
    ).join("");
    el.innerHTML = `<div class="dv-legend-title">${esc(t("legend_title"))}</div>
      <div class="dv-legend-ends"><span>${esc(t("legend_most"))}</span><span>${esc(t("legend_least"))}</span></div>
      <div class="dv-legend-items">${items}
        <span class="dv-legend-item"><span class="swatch swatch-hatch" style="background:${esc((estimateBands()[estimateBands().length - 1] || {}).color || noScoreColor())}"></span>${esc(t("legend_estimate"))}</span>
        <span class="dv-legend-item"><span class="swatch" style="background:${esc(noScoreColor())}"></span>${esc(t("legend_no_score"))}</span>
        <span class="dv-legend-item subtle"><span class="swatch" style="background:${esc(outGroupColor())}; box-shadow: inset 0 0 0 1px #d5d8da"></span>${esc(t("legend_out_of_group"))}</span>
      </div>`;
  }

  // ---------- Map ----------
  function attribution() {
    const s = window.t ? window.t("map.attribution") : "";
    return (s && s !== "map.attribution") ? s : "Boundaries: Natural Earth";
  }

  function fillExpression() {
    const inG = memberSet();
    const fc = ["match", ["get", "iso_a3"]];
    const seen = new Set();
    Object.keys(byId).forEach(id => {
      const c = byId[id];
      if (!c.iso3 || seen.has(c.iso3)) return;
      seen.add(c.iso3);
      fc.push(c.iso3, colorForCountry(c, inG.has(c.id) || inG.has(c.iso3)));
    });
    fc.push(outGroupColor());
    return fc;
  }

  function hatchFilter() {
    if (isAvailabilityView()) return ["==", ["get", "iso_a3"], ""];
    const inG = memberSet();
    const isos = [];
    const seen = new Set();
    Object.keys(byId).forEach(id => {
      const c = byId[id];
      if (!c.iso3 || seen.has(c.iso3)) return;
      seen.add(c.iso3);
      if (isEstimate(c) && (inG.has(c.id) || inG.has(c.iso3))) isos.push(c.iso3);
    });
    return isos.length
      ? ["in", ["get", "iso_a3"], ["literal", isos]]
      : ["==", ["get", "iso_a3"], ""];
  }

  function ensureHatchPattern() {
    if (!map || map.hasImage("hatch-estimate")) return;
    const size = 12;
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    const g = c.getContext("2d");
    g.clearRect(0, 0, size, size);
    g.strokeStyle = "rgba(20, 20, 20, 0.35)";
    g.lineWidth = 1.25;
    g.beginPath(); g.moveTo(-2, size); g.lineTo(size, -2); g.stroke();
    g.beginPath(); g.moveTo(0, size + 2); g.lineTo(size + 2, 0); g.stroke();
    map.addImage("hatch-estimate", g.getImageData(0, 0, size, size));
  }

  function refreshFill() {
    if (!map || !map.getLayer("countries-fill")) return;
    try { map.setPaintProperty("countries-fill", "fill-color", fillExpression()); } catch (e) { console.error(e); }
    refreshHatch();
  }

  function refreshHatch() {
    if (!map || !map.getLayer("countries-hatch")) return;
    try { map.setFilter("countries-hatch", hatchFilter()); } catch (e) { console.error(e); }
  }

  function setFeatureFlag(iso, key, val) {
    if (!map || !iso) return;
    try { map.setFeatureState({ source: "countries", id: iso }, { [key]: val }); } catch (e) {}
  }

  function scheduleMap() {
    if (view.hidden) return;
    if (mapWait) cancelAnimationFrame(mapWait);
    mapWait = requestAnimationFrame(() => {
      mapWait = requestAnimationFrame(() => {
        mapWait = 0;
        try { ensureMap(); } catch (err) {
          console.error(err);
          showMapMessage(t("map_error"));
        }
      });
    });
  }

  function ensureMap() {
    if (view.hidden) return;
    const container = document.getElementById("dv-map");
    if (!container) return;
    if (typeof maplibregl === "undefined") {
      showMapMessage(t("map_unavailable"));
      return;
    }
    if (container.clientWidth < 8 || container.clientHeight < 8) {
      if (!mapWait) mapWait = requestAnimationFrame(() => { mapWait = 0; ensureMap(); });
      return;
    }
    if (map) {
      try {
        map.resize();
        refreshFill();
        showMapMessage("");
      } catch (err) {
        console.error(err);
        showMapMessage(t("map_error"));
      }
      return;
    }
    showMapMessage("");
    try {
      map = new maplibregl.Map({
        container: "dv-map",
        style: {
          version: 8,
          sources: {},
          layers: [{ id: "background", type: "background", paint: { "background-color": "#ffffff" } }]
        },
        center: [10, 20],
        zoom: 1,
        renderWorldCopies: false,
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        boxZoom: false,
        attributionControl: { compact: true, customAttribution: attribution() }
      });
    } catch (err) {
      console.error(err);
      map = null;
      showMapMessage(t("map_error"));
      return;
    }
    try {
      map.touchZoomRotate.disableRotation();
      map.keyboard.disableRotation();
    } catch (e) {}
    map.on("error", ev => { console.error(ev && ev.error ? ev.error : ev); });
    const hover = ["boolean", ["feature-state", "hover"], false];
    const selected = ["boolean", ["feature-state", "selected"], false];
    map.on("load", () => {
      try {
        map.resize();
        map.fitBounds(WORLD_BOUNDS, { padding: 16, animate: false });
        const z = map.getZoom();
        map.setMinZoom(z);
        map.setMaxZoom(z + 4);
        ensureHatchPattern();
      } catch (err) {
        console.error(err);
        showMapMessage(t("map_error"));
        return;
      }
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), FETCH_MS);
      fetch(COUNTRIES_URL, { signal: ctrl.signal })
        .then(r => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
        .then(gj => {
          if (!map) return;
          map.addSource("countries", { type: "geojson", data: gj, promoteId: "iso_a3" });
          map.addLayer({
            id: "countries-fill", type: "fill", source: "countries",
            filter: ["!=", ["get", "iso_a3"], "ATA"],
            paint: {
              "fill-color": fillExpression(),
              "fill-opacity": ["case", hover, 0.8, 1]
            }
          });
          map.addLayer({
            id: "countries-hatch", type: "fill", source: "countries",
            filter: hatchFilter(),
            paint: { "fill-pattern": "hatch-estimate", "fill-opacity": 0.85 }
          });
          map.addLayer({
            id: "countries-line", type: "line", source: "countries",
            filter: ["!=", ["get", "iso_a3"], "ATA"],
            paint: { "line-color": "#ffffff", "line-width": 0.6 }
          });
          map.addLayer({
            id: "countries-highlight", type: "line", source: "countries",
            paint: {
              "line-color": "#1d2a36",
              "line-width": ["case", selected, 2, hover, 1.4, 0],
              "line-opacity": ["case", ["any", selected, hover], 1, 0]
            }
          });
          mapReady = true;
          bindMapEvents();
          if (state.selected) {
            const c = byId[state.selected];
            if (c && c.iso3) setFeatureFlag(c.iso3, "selected", true);
          }
        })
        .catch(err => {
          console.error(err);
          showMapMessage(t("map_error"));
        })
        .finally(() => clearTimeout(timer));
    });
  }

  const tooltip = (typeof maplibregl !== "undefined")
    ? new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: "country-tooltip", offset: 14, maxWidth: "320px" })
    : null;

  function clearHover() {
    if (hoveredIso) setFeatureFlag(hoveredIso, "hover", false);
    hoveredIso = null;
    if (tooltip) tooltip.remove();
    if (map) map.getCanvas().style.cursor = "";
  }

  function tooltipHtml(c) {
    const name = countryName(c);
    if (isAvailabilityView()) {
      return `<strong>${esc(name)}</strong><br>${esc(availLabel(c))}`;
    }
    if (c.score == null) {
      return `<strong>${esc(name)}</strong><br>${esc(t("legend_no_score"))}`;
    }
    const badge = isEstimate(c)
      ? ` <span class="dv-pill dv-pill-prov">${esc(t("flag_estimate"))}</span>`
      : ` <span class="dv-pill">${esc(t("flag_census"))}</span>`;
    const label = isCensus(c)
      ? t("tooltip_census", { score: fmtScore(c.score) })
      : t("tooltip_estimate", { score: fmtScore(c.score) });
    return `<strong>${esc(name)}</strong><br>
      <span class="swatch${isEstimate(c) ? " swatch-hatch" : ""}" style="background:${esc(colorForCountry(c, true))}"></span>
      ${esc(label)}${badge}`;
  }

  function availLabel(c) {
    const k = c.availability || "none";
    if (k === "census") return t("legend_census");
    if (k === "census_limited") return t("legend_limited");
    if (k === "estimate") return t("legend_estimate_only");
    return t("legend_none");
  }

  function bindMapEvents() {
    if (!map) return;
    map.on("mousemove", "countries-fill", e => {
      if (window.matchMedia && window.matchMedia("(max-width: 768px)").matches) return;
      const f = e.features && e.features[0];
      if (!f) return;
      const iso = f.properties.iso_a3;
      const c = byId[iso];
      if (hoveredIso !== iso) {
        clearHover();
        hoveredIso = iso;
        setFeatureFlag(iso, "hover", true);
      }
      map.getCanvas().style.cursor = c ? "pointer" : "";
      if (tooltip && c) tooltip.setLngLat(e.lngLat).setHTML(tooltipHtml(c)).addTo(map);
    });
    map.on("mouseleave", "countries-fill", clearHover);
    map.on("click", "countries-fill", e => {
      const f = e.features && e.features[0];
      if (!f) return;
      const c = byId[f.properties.iso_a3];
      if (!c) return;
      selectCountry(c.id, { scrollBar: true });
    });
  }

  function updateAttribution() {
    if (!map) return;
    const el = map.getContainer().querySelector(".maplibregl-ctrl-attrib-inner");
    if (el) el.textContent = attribution();
  }

  // ---------- Selection & bars ----------
  function selectCountry(id, opts) {
    const prev = state.selected && byId[state.selected];
    if (prev && prev.iso3) setFeatureFlag(prev.iso3, "selected", false);
    state.selected = id;
    const c = byId[id];
    if (c && c.iso3) setFeatureFlag(c.iso3, "selected", true);
    renderSelected();
    highlightBar();
    if (opts && opts.scrollBar) {
      const row = view.querySelector(".dv-bar-item.is-selected");
      if (row) row.scrollIntoView({ block: "nearest" });
    }
  }

  function checkpointTable(c) {
    const rows = c.census && c.census.rows;
    if (!rows || typeof rows !== "object") return "";
    const years = Object.keys(rows);
    if (!years.length) return "";
    const pool = c.census.founding_pool;
    const body = years.map(y => {
      const row = rows[y] || {};
      const yearLab = y === "latest" ? (c.census.latest_year != null ? fmtYear(c.census.latest_year) : "latest") : y;
      const share = pool && row[pool] != null ? fmtScore(row[pool]).replace(/^\+/, "") : "—";
      return `<tr><th scope="row">${esc(yearLab)}</th><td>${esc(share)}</td></tr>`;
    }).join("");
    return `<table class="dv-mini"><caption>${esc(t("checkpoints_h"))}${enOnlyBadge()}</caption>
      <thead><tr><th>${esc(t("checkpoints_year"))}</th><th>${esc(t("checkpoints_share"))}</th></tr></thead>
      <tbody>${body}</tbody></table>`;
  }

  function renderSelected() {
    const el = view.querySelector("#dv-selected");
    if (!el) return;
    const c = state.selected && byId[state.selected];
    if (!c) {
      el.hidden = true;
      el.innerHTML = "";
      return;
    }
    const inG = memberSet().has(c.id);
    const pills = [];
    if (data && data.provisional) pills.push(`<span class="dv-pill dv-pill-prov">${esc(t("provisional_badge"))}</span>`);
    if (c.availability === "census") pills.push(`<span class="dv-pill">${esc(t("flag_census"))}</span>`);
    if (c.availability === "census_limited") pills.push(`<span class="dv-pill dv-pill-prov">${esc(t("flag_limited"))}</span>`);
    if (isEstimate(c)) pills.push(`<span class="dv-pill dv-pill-prov">${esc(t("flag_estimate"))}</span>`);
    if (c.census && c.census.weak_proxy) pills.push(`<span class="dv-pill dv-pill-prov">${esc(t("flag_weak"))}</span>`);
    if (c.census && c.census.concept_break) pills.push(`<span class="dv-pill dv-pill-prov">${esc(t("flag_concept"))}</span>`);
    if (isEstimate(c) && c.quality) pills.push(`<span class="dv-pill" title="${esc(qualityLabel(c.quality))}">${esc(t("tooltip_quality", { quality: c.quality }))}</span>`);
    if (!c.on_map) pills.push(`<span class="dv-pill">${esc(t("not_on_map"))}</span>`);
    if (isSmall(c)) pills.push(`<span class="dv-pill dv-pill-prov">${esc(t("flag_small"))}</span>`);
    if (!inG) pills.push(`<span class="dv-pill">${esc(t("outside_group"))}</span>`);

    const lines = [];
    const ce = c.census;
    if (isCensus(c) && ce) {
      lines.push(`<p>${esc(t("selected_census_score", {
        first: fmtYear(ce.first_year),
        latest: fmtYear(ce.latest_year),
        score: fmtScore(ce.change_outside_founding_pool)
      }))}</p>`);
      if (ce.first_share_in_founding_pool != null && ce.latest_share_in_founding_pool != null) {
        lines.push(`<p class="dv-meta">${esc(t("selected_shares", {
          first_share: fmt(ce.first_share_in_founding_pool, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
          first: fmtYear(ce.first_year),
          latest_share: fmt(ce.latest_share_in_founding_pool, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
          latest: fmtYear(ce.latest_year)
        }))}</p>`);
      }
      if (c.un_d_1990_2020 != null) {
        lines.push(`<p class="dv-meta">${esc(t("selected_gap", {
          census: fmtScore(ce.change_outside_founding_pool),
          d: fmtScore(c.un_d_1990_2020)
        }))}</p>`);
      }
    } else if (c.availability === "census_limited") {
      lines.push(`<p>${esc(t("selected_limited"))}</p>`);
      if (c.score != null) {
        lines.push(`<p class="dv-meta">${esc(t("selected_estimate_score", { score: fmtScore(c.score) }))}</p>`);
      }
    } else if (isEstimate(c)) {
      lines.push(`<p>${esc(t("selected_estimate_score", { score: fmtScore(c.score) }))}</p>`);
    } else {
      lines.push(`<p>${esc(t("legend_no_score"))}</p>`);
    }
    lines.push(`<p class="dv-meta">${esc(t("selected_pool", { pool: poolLabel((ce && ce.founding_pool) || c.primary_pool) }))}</p>`);
    if (ce && ce.source) {
      lines.push(`<p class="dv-meta">${esc(t("selected_source", { source: ce.source }))}${enOnlyBadge()}</p>`);
    } else if (c.un_source) {
      lines.push(`<p class="dv-meta">${esc(c.un_source)}${enOnlyBadge()}</p>`);
    }
    if (ce && ce.notes) {
      lines.push(`<p class="dv-meta">${esc(ce.notes)}${enOnlyBadge()}</p>`);
    } else if (c.mapping_note) {
      lines.push(`<p class="dv-meta">${esc(c.mapping_note)}${enOnlyBadge()}</p>`);
    }
    el.hidden = false;
    el.innerHTML = `<h3>${esc(countryName(c))}</h3><p>${pills.join(" ")}</p>${lines.join("")}${ce ? checkpointTable(c) : ""}`;
  }

  function kindRank(c) {
    if (isCensus(c)) return 0;
    if (isEstimate(c)) return 1;
    return 2;
  }

  function filteredCountries() {
    const q = state.query.trim().toLocaleLowerCase(locale());
    let list = currentMembers().map(id => byId[id]).filter(Boolean);
    if (q) {
      list = list.filter(c => {
        const names = [c.name, countryName(c), c.iso3, c.id].filter(Boolean);
        return names.some(n => String(n).toLocaleLowerCase(locale()).indexOf(q) !== -1);
      });
    }
    const loc = locale();
    list.sort((a, b) => {
      if (state.sortKey === "name") {
        return countryName(a).localeCompare(countryName(b), loc);
      }
      const kr = kindRank(a) - kindRank(b);
      if (kr) return kr;
      const sa = a.score, sb = b.score;
      if (sa == null && sb == null) return countryName(a).localeCompare(countryName(b), loc);
      if (sa == null) return 1;
      if (sb == null) return -1;
      const diff = state.sortKey === "low" ? sa - sb : sb - sa;
      return diff || countryName(a).localeCompare(countryName(b), loc);
    });
    return list;
  }

  function renderBars() {
    const ul = view.querySelector("#dv-bars");
    const count = view.querySelector("#dv-list-count");
    if (!ul) return;
    const list = filteredCountries();
    const censusVals = list.filter(c => isCensus(c) && c.score != null).map(c => c.score);
    const estVals = list.filter(c => isEstimate(c) && c.score != null).map(c => Math.abs(c.score));
    const cMin = censusVals.length ? Math.min(0, ...censusVals) : 0;
    const cMax = censusVals.length ? Math.max(0, ...censusVals) : 1;
    const cSpan = Math.max(1, cMax - cMin);
    const eMax = Math.max(1, ...estVals, 0);
    if (count) count.textContent = t("list_count", { n: fmt(list.length, { maximumFractionDigits: 0 }) });
    if (!list.length) {
      ul.innerHTML = `<li class="dv-empty">${esc(t("no_matches"))}</li>`;
      return;
    }
    ul.innerHTML = list.map(c => {
      const color = colorForCountry(c, true);
      const sel = c.id === state.selected ? " is-selected" : "";
      const small = isSmall(c);
      const est = isEstimate(c);
      const smallMark = small
        ? ` <span class="dv-small-flag" title="${esc(t("flag_small"))}">${esc(t("flag_small_short"))}</span>`
        : "";
      const estMark = est
        ? ` <span class="dv-small-flag dv-est-flag" title="${esc(t("flag_estimate"))}">${esc(t("flag_estimate_short"))}</span>`
        : "";
      let fillStyle = `background:${esc(color)};`;
      let zeroPad = "";
      if (isCensus(c) && c.score != null) {
        const left = ((Math.min(c.score, 0) - cMin) / cSpan) * 100;
        const width = (Math.abs(c.score) / cSpan) * 100;
        fillStyle = `background:${esc(color)};margin-left:${left}%;width:${width}%;`;
        const zero = ((0 - cMin) / cSpan) * 100;
        zeroPad = `<span class="dv-bar-zero" style="left:${zero}%"></span>`;
      } else if (est && c.score != null) {
        const width = Math.max(0, Math.min(100, (Math.abs(c.score) / eMax) * 100));
        fillStyle = `background:${esc(color)};width:${width}%;`;
      } else {
        fillStyle = `background:${esc(noScoreColor())};width:0`;
      }
      const title = c.score == null
        ? t("legend_no_score")
        : (isCensus(c) ? t("tooltip_census", { score: fmtScore(c.score) }) : t("tooltip_estimate", { score: fmtScore(c.score) }));
      const years = rowYearLabel(c);
      const cls = `dv-bar-item${sel}${small ? " is-small" : ""}${est ? " is-estimate" : ""}`;
      return `<li class="${cls}" data-id="${esc(c.id)}">
        <button type="button" class="dv-bar-btn" aria-label="${esc(countryName(c))}, ${esc(title)}${years ? ", " + esc(years) : ""}">
          <span class="dv-bar-name"><span class="dv-bar-label">${esc(countryName(c))}</span>${estMark}${smallMark}</span>
          <span class="dv-bar-track">${zeroPad}<span class="dv-bar-fill${est ? " is-estimate" : ""}" style="${fillStyle}"></span></span>
          <span class="dv-bar-n">${esc(fmtScore(c.score))}</span>
          <span class="dv-bar-years">${esc(years || "—")}</span>
        </button>
      </li>`;
    }).join("");
  }

  function highlightBar() {
    view.querySelectorAll(".dv-bar-item").forEach(li => {
      li.classList.toggle("is-selected", li.getAttribute("data-id") === state.selected);
    });
  }

  function renderRegional() {
    const el = view.querySelector("#dv-regional");
    if (!el) return;
    const rows = (data && data.regional_averages) || [];
    if (!rows.length) { el.innerHTML = ""; return; }
    const body = rows.map(r => `<tr>
      <th scope="row">${esc(r.region)}</th>
      <td>${esc(fmt(r.n_countries, { maximumFractionDigits: 0 }))}</td>
      <td>${esc(fmt(r.D_1990_2020_popweighted, { minimumFractionDigits: 1, maximumFractionDigits: 1 }))}</td>
    </tr>`).join("");
    el.innerHTML = `<table class="dv-mini dv-regional-table">
      <thead><tr>
        <th>${esc(t("regional_col_region"))}</th>
        <th>${esc(t("regional_col_n"))}</th>
        <th>${esc(t("regional_d"))}</th>
      </tr></thead>
      <tbody>${body}</tbody>
    </table>`;
  }

  function renderDetails() {
    const el = view.querySelector("#dv-details");
    const btn = view.querySelector("#dv-details-btn");
    if (btn) btn.textContent = state.details ? t("details_hide") : t("details_btn");
    if (!el) return;
    el.hidden = !state.details;
    if (!state.details) { el.innerHTML = ""; return; }
    el.innerHTML = `<h3 class="dv-h">${esc(t("details_h"))}${enOnlyBadge()}</h3>
      <p>${esc(t("method_p1"))}</p>
      <p>${esc(t("method_p2"))}</p>
      <p>${esc(t("method_p3"))}</p>
      <p>${esc(t("method_p4"))}</p>
      <ul>
        <li>${esc(t("quality_a"))}</li>
        <li>${esc(t("quality_b"))}</li>
        <li>${esc(t("quality_c"))}</li>
      </ul>
      <p>${esc(t("method_p5"))}</p>`;
  }

  function defaultViewState() {
    const v = views()[0];
    state.viewId = v ? v.id : null;
    state.groupId = v ? (v.default_group || (v.groups && v.groups[0] && v.groups[0].id) || null) : null;
  }

  function setView(id) {
    const v = viewDef(id);
    if (!v) return;
    state.viewId = v.id;
    state.groupId = v.default_group || (v.groups && v.groups[0] && v.groups[0].id) || null;
    if (state.selected && !memberSet().has(state.selected)) state.selected = null;
    labelStatic();
    renderSwitcher();
    renderLegend();
    refreshFill();
    renderBars();
    renderSelected();
  }

  function setGroup(id) {
    const v = viewDef(state.viewId);
    const g = groupDef(v, id);
    if (!g) return;
    state.groupId = g.id;
    if (state.selected && !memberSet().has(state.selected)) state.selected = null;
    refreshFill();
    renderBars();
    renderSelected();
  }

  function render() {
    if (!data) return;
    // Never treat a loading or error placeholder as the mounted shell.
    if (!view.querySelector("#dv-map")) {
      destroyMap();
      mountShell();
    }
    if (!state.viewId) defaultViewState();
    labelStatic();
    renderAvailLegend();
    renderSwitcher();
    renderSort();
    renderLegend();
    renderBars();
    renderRegional();
    renderDetails();
    renderSelected();
    updateAttribution();
    scheduleMap();
  }

  function safeRender() {
    try {
      render();
    } catch (err) {
      console.error(err);
      showStatus("error", t("render_error"));
    }
  }

  function ingest(json) {
    if (!json || typeof json !== "object" || !Array.isArray(json.countries)) {
      throw new Error("demographics.json is missing countries");
    }
    data = json;
    byId = {};
    (data.countries || []).forEach(c => {
      byId[c.id] = c;
      if (c.iso3 && c.iso3 !== c.id) byId[c.iso3] = c;
    });
    defaultViewState();
  }

  function load() {
    if (data) { safeRender(); return; }
    if (loading) return loading;
    showStatus("loading", t("loading"));
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_MS);
    loading = fetch(DATA_URL, { signal: ctrl.signal, cache: "no-cache" })
      .then(r => { if (!r.ok) throw new Error(DATA_URL + ": HTTP " + r.status); return r.json(); })
      .then(json => {
        ingest(json);
        safeRender();
      })
      .catch(err => {
        console.error(err);
        loading = null;
        showStatus("error", t("load_error"));
      })
      .finally(() => clearTimeout(timer));
    return loading;
  }

  // ---------- Events ----------
  view.addEventListener("click", e => {
    const retry = e.target.closest("#dv-retry");
    if (retry) { load(); return; }
    const vb = e.target.closest("#dv-switcher button[data-view]");
    if (vb) { setView(vb.getAttribute("data-view")); return; }
    const detailsBtn = e.target.closest("#dv-details-btn");
    if (detailsBtn) { state.details = !state.details; renderDetails(); return; }
    const barBtn = e.target.closest(".dv-bar-btn");
    if (barBtn) {
      const li = barBtn.closest("[data-id]");
      if (li) selectCountry(li.getAttribute("data-id"));
    }
  });
  view.addEventListener("change", e => {
    if (e.target && e.target.id === "dv-group") setGroup(e.target.value);
    else if (e.target && e.target.id === "dv-sort") { state.sortKey = e.target.value; renderBars(); }
  });
  view.addEventListener("input", e => {
    if (e.target && e.target.id === "dv-search") {
      state.query = e.target.value;
      renderBars();
    }
  });
  window.addEventListener("resize", () => {
    if (view.hidden) return;
    if (map) { try { map.resize(); } catch (e) {} }
    else scheduleMap();
  });

  window.renderDemographicsView = function () {
    if (view.hidden) return;
    if (data) safeRender();
    else load();
  };

  function start() {
    if (!view.hidden) load();
  }

  const ready = window.I18N_READY || Promise.resolve();
  ready.then(start);
})();
