// Demographics tab. Reads data/demographics.json.
// User-facing text lives in i18n/*.json under the demographics.* prefix.
// Group lists (geographic region and founding populations, including
// the Anglosphere option) come from the data file so new groups can
// be added without changing this file.
(function () {
  "use strict";

  const t = (key, vars) => (window.t ? window.t("demographics." + key, vars) : key);
  const locale = () => (window.currentLocale ? window.currentLocale() : (document.documentElement.lang || "en"));
  const esc = v => String(v == null ? "" : v).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  const COUNTRIES_URL = "data/countries-ne50m.geojson";
  const DATA_URL = "data/demographics.json";
  const ORIGIN_URL = "data/demographics/origin_series_FR_DE_ES.json";
  const PRE1950_URL = "data/demographics/baseline_pre1950.json";
  const Supplements = window.HarmDemographicsSupplements || null;
  const Pre1950 = window.Pre1950Baselines || null;
  const WORLD_BOUNDS = [[-180, -56.2], [180, 84.2]];
  let featureBounds = { west: -180, south: -56.2, east: 180, north: 84.2 };
  const DEFAULT_NO_SCORE = "#b9bfc4";
  const DEFAULT_OUT_GROUP = "#eceeef";
  const FETCH_MS = 20000;

  let data = null, originData = null, pre1950ByIso = {}, loading = null, byId = {}, map = null, mapReady = false, mapWait = 0, hoveredIso = null;
  let demoControls = null, demoAtWorld = true;
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

  // Years shown beside a bar. A pre-1950 score uses that baseline year.
  // Other census rows use census.first_year–latest_year.
  // UN proxy rows are the 1990–2020 migrant-origin window.
  function rowYearLabel(c) {
    if (!c) return "";
    const pre = pre1950Used(c);
    if (pre) return formatYearSpan(pre.first_year, pre.latest_year);
    if (isCensusScore(c)) {
      const ce = c.census;
      return ce ? formatYearSpan(ce.first_year, ce.latest_year) : "";
    }
    if (displayValue(c) != null) return formatYearSpan(1990, 2020);
    return "";
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

  function noScoreColor() {
    return (data && data.scale && data.scale.no_score_color) || DEFAULT_NO_SCORE;
  }

  function outGroupColor() {
    return (data && data.scale && data.scale.out_of_group_color) || DEFAULT_OUT_GROUP;
  }

  function bandFor(c) {
    const shown = displayValue(c);
    if (shown == null || !window.ShareScale) return null;
    // Census rows show 1 decimal; UN proxy rows show 2. Band the rounded figure.
    return window.ShareScale.bandForChange(shown, isProxyRow(c) ? 2 : 1);
  }

  function colorForCountry(c, inGroup) {
    if (!inGroup) return outGroupColor();
    if (!c) return noScoreColor();
    const b = bandFor(c);
    return b ? b.color : noScoreColor();
  }

  function isEstimate(c) {
    return !!(c && c.score_kind === "estimate");
  }

  function isCensus(c) {
    return !!(c && c.score_kind === "census");
  }

  // Relative percent change in the founding share.
  // (latest share - first share) / first share * 100.
  // Both shares are required. A stored percentage-point score is not used in their place.
  function censusFoundingChange(c) {
    if (!isCensus(c) || !c.census || !window.ShareScale) return null;
    const ce = c.census;
    return window.ShareScale.relativeChange(ce.latest_share_in_founding_pool, ce.first_share_in_founding_pool, 1);
  }

  // UN proxy: founding share in a year is 100 minus the cross-pool foreign-born share.
  function proxyChange(c) {
    if (!c || !window.ShareScale) return null;
    if (c.cross_pool_fb_pct_1990 == null || c.cross_pool_fb_pct_1990 === "") return null;
    if (c.cross_pool_fb_pct_2020 == null || c.cross_pool_fb_pct_2020 === "") return null;
    const first = 100 - Number(c.cross_pool_fb_pct_1990);
    const latest = 100 - Number(c.cross_pool_fb_pct_2020);
    return window.ShareScale.relativeChange(latest, first, 2);
  }

  // Default map baseline. Not a toggle, and not the 1960–79 file.
  // Australia returns an indicator only. Italy uses the UN 2020 endpoint
  // the map already used, because Italy has no census or origin-series latest share.
  function pre1950Resolution(c) {
    if (!Pre1950 || !window.ShareScale || !c) return null;
    const row = pre1950ByIso[c.iso3] || pre1950ByIso[c.id];
    if (!row) return null;
    return Pre1950.resolve(row, c, originData, window.ShareScale);
  }

  function pre1950Used(c) {
    const resolved = pre1950Resolution(c);
    return resolved && resolved.use ? resolved : null;
  }

  function pre1950Indicator(c) {
    const resolved = pre1950Resolution(c);
    if (!resolved || resolved.use || !resolved.indicator) return null;
    return resolved.indicator;
  }

  function isCensusScore(c) {
    return censusFoundingChange(c) != null;
  }

  function isProxyRow(c) {
    if (pre1950Used(c)) return false;
    return !isCensusScore(c) && proxyChange(c) != null;
  }

  function displayValue(c) {
    const pre = pre1950Used(c);
    if (pre) return pre.change;
    if (isCensusScore(c)) return censusFoundingChange(c);
    return proxyChange(c);
  }

  function rowGroup(c) {
    if (pre1950Used(c) || isCensusScore(c)) return 0;
    if (displayValue(c) != null) return 1;
    return 2;
  }

  function fmtSigned(n, digits) {
    if (n == null || n === "" || !Number.isFinite(Number(n))) return "—";
    const v = Number(n) === 0 ? 0 : Number(n);
    return v.toLocaleString(locale(), {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
      signDisplay: "exceptZero"
    });
  }

  function fmtChange(n, proxy) {
    return fmtSigned(n, proxy ? 2 : 1);
  }

  function fmtShare(n) {
    return fmt(n, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }

  function fmtIndex(n) {
    if (n == null || !Number.isFinite(Number(n))) return "—";
    return fmtSigned(n, Math.abs(Number(n)) >= 0.1 ? 1 : 3);
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
        <div class="dv-map-key" id="dv-map-key"></div>
        <p class="dv-desc" id="dv-map-desc"></p>
        <div class="dv-switcher-wrap">
          <div class="dv-switcher" id="dv-switcher" role="group"></div>
          <div class="dv-filter-lab" id="dv-group-lab">
            <span id="dv-group-lbl"></span>
            <div class="dv-dropdown" id="dv-group-dropdown">
              <button type="button" class="dv-dropdown-btn" id="dv-group-btn" aria-haspopup="listbox" aria-expanded="false" aria-controls="dv-group-menu"></button>
              <div class="dv-dropdown-menu" id="dv-group-menu" role="listbox" hidden></div>
            </div>
          </div>
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
    renderMapKey();
    set("#dv-map-desc", t("map_desc"));
    set("#dv-scale-note", t("scale_note"));
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

  function groupOptions(v) {
    const groups = (v && v.groups) || [];
    const items = [];
    const continents = groups.filter(g => g.level === "continent");
    if (continents.length) {
      const all = groups.find(g => g.id === "all");
      if (all) items.push({ type: "option", id: all.id, label: groupLabel(all) });
      continents.forEach(cont => {
        items.push({ type: "label", label: groupLabel(cont) });
        items.push({ type: "option", id: cont.id, label: t("geo_continent_all", { name: groupLabel(cont) }) });
        groups.filter(g => g.parent === cont.id).forEach(g => {
          items.push({ type: "option", id: g.id, label: groupLabel(g) });
        });
      });
      return items;
    }
    return groups.map(g => ({ type: "option", id: g.id, label: groupLabel(g) }));
  }

  function closeGroupMenu() {
    const menu = view.querySelector("#dv-group-menu");
    const btn = view.querySelector("#dv-group-btn");
    if (menu) menu.hidden = true;
    if (btn) btn.setAttribute("aria-expanded", "false");
  }

  function positionGroupMenu() {
    const menu = view.querySelector("#dv-group-menu");
    const btn = view.querySelector("#dv-group-btn");
    if (!menu || !btn || menu.hidden) return;
    menu.classList.remove("is-below");
    const rect = btn.getBoundingClientRect();
    const width = Math.max(menu.offsetWidth, 220);
    if (window.innerWidth - rect.right < width + 8) menu.classList.add("is-below");
  }

  function openGroupMenu() {
    const menu = view.querySelector("#dv-group-menu");
    const btn = view.querySelector("#dv-group-btn");
    if (!menu || !btn || menu.hidden === false) return;
    menu.hidden = false;
    btn.setAttribute("aria-expanded", "true");
    positionGroupMenu();
    const selected = menu.querySelector('[aria-selected="true"]') || menu.querySelector('[role="option"]');
    if (selected) selected.focus();
  }

  function toggleGroupMenu() {
    const menu = view.querySelector("#dv-group-menu");
    if (!menu) return;
    if (menu.hidden) openGroupMenu();
    else {
      closeGroupMenu();
      const btn = view.querySelector("#dv-group-btn");
      if (btn) btn.focus();
    }
  }

  function renderGroupSelect() {
    const lab = view.querySelector("#dv-group-lab");
    const btn = view.querySelector("#dv-group-btn");
    const menu = view.querySelector("#dv-group-menu");
    if (!lab || !btn || !menu) return;
    const v = viewDef(state.viewId);
    const groups = (v && v.groups) || [];
    const hide = groups.length <= 1;
    lab.hidden = hide;
    closeGroupMenu();
    if (hide) return;
    const items = groupOptions(v);
    const ids = items.filter(it => it.type === "option").map(it => it.id);
    if (ids.indexOf(state.groupId) === -1) {
      state.groupId = v.default_group || (groups[0] && groups[0].id);
    }
    const current = items.find(it => it.type === "option" && it.id === state.groupId);
    btn.textContent = current ? current.label : "";
    btn.setAttribute("aria-label", t("group_filter") + ": " + (current ? current.label : ""));
    menu.innerHTML = items.map(it => {
      if (it.type === "label") {
        return `<div class="dv-optgroup-label">${esc(it.label)}</div>`;
      }
      const sel = it.id === state.groupId;
      return `<button type="button" role="option" class="dv-dropdown-option" data-group="${esc(it.id)}" aria-selected="${sel}">${esc(it.label)}</button>`;
    }).join("");
  }

  function focusGroupOption(from, dir) {
    const menu = view.querySelector("#dv-group-menu");
    if (!menu) return;
    const opts = [...menu.querySelectorAll('[role="option"]')];
    if (!opts.length) return;
    const i = opts.indexOf(from);
    const next = opts[Math.max(0, Math.min(opts.length - 1, (i === -1 ? 0 : i) + dir))];
    if (next) next.focus();
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

  function bandSwatch(b, colourName) {
    const edge = b && b.outline ? "; box-shadow: inset 0 0 0 1px #d5d8da" : "";
    const access = colourName
      ? ` role="img" aria-label="${esc(colourName)}" title="${esc(colourName)}"`
      : "";
    return `<span class="swatch"${access} style="background:${esc(b.color)}${edge}"></span>`;
  }

  function bandItem(b) {
    return `<span class="dv-legend-item">${bandSwatch(b)}<span class="dv-legend-name">${esc(t(b.labelKey))} <span class="dv-legend-range">${esc(t(b.rangeKey))}</span></span></span>`;
  }

  function renderMapKey() {
    const el = view.querySelector("#dv-map-key");
    if (!el) return;
    const bands = (window.ShareScale && window.ShareScale.BANDS) || [];
    if (!bands.length) { el.hidden = true; el.innerHTML = ""; return; }
    el.hidden = false;
    const order = ["growing", "little", "light", "medium", "dark"];
    el.innerHTML = order.map(id => {
      const b = bands.filter(x => x.id === id)[0];
      if (!b) return "";
      return `<span class="dv-map-key-item">${bandSwatch(b, t(b.keyColour))}<span>${esc(t(b.keyLabel))}</span></span>`;
    }).join("");
  }

  function renderLegend() {
    const el = view.querySelector("#dv-legend");
    if (!el) return;
    const list = (window.ShareScale && window.ShareScale.BANDS) || [];
    const items = list.map(bandItem).join("");
    el.innerHTML = `<div class="dv-legend-title">${esc(t("legend_title"))}</div>
      <div class="dv-legend-ends"><span>${esc(t("legend_most"))}</span><span>${esc(t("legend_least"))}</span></div>
      <div class="dv-legend-items">${items}
        <span class="dv-legend-note">${esc(t("legend_proxy_note"))}</span>
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
    // Proxy countries use the same colours as census countries, with no hatch.
    return ["==", ["get", "iso_a3"], ""];
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

  function demoFitPadding() {
    const mapEl = document.getElementById("dv-map");
    if (!mapEl || !window.HarmMapControls) return { top: 12, right: 16, bottom: 16, left: 12 };
    return window.HarmMapControls.overlayPadding(mapEl, [view.querySelector("#dv-legend")]);
  }

  function fitDemoWorld(animate) {
    if (!map || !window.HarmMapControls) return;
    try { map.resize(); } catch (e) {}
    window.HarmMapControls.fitExtent(map, featureBounds, demoFitPadding());
    demoAtWorld = true;
    if (demoControls) demoControls.sync();
    if (animate) {
      // fitExtent jumps. A second pass picks up legend size after the first paint.
    }
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
        if (demoAtWorld) fitDemoWorld(false);
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
    // MapLibre otherwise refuses to zoom out past the point where the world
    // fills the canvas width, which clips Greenland and the far south.
    map.setTransformConstrain((lngLat, zoom) => ({
      center: lngLat,
      zoom: Math.max(map.getMinZoom(), Math.min(map.getMaxZoom(), zoom))
    }));
    if (window.HarmMapControls) {
      demoControls = window.HarmMapControls.attach(map, {
        onReset: function () { fitDemoWorld(true); }
      });
      window.syncDemoMapControls = function () { if (demoControls) demoControls.sync(); };
    }
    map.on("zoomend", () => {
      if (!map) return;
      demoAtWorld = map.getZoom() <= map.getMinZoom() + 0.05;
    });
    map.on("error", ev => { console.error(ev && ev.error ? ev.error : ev); });
    const hover = ["boolean", ["feature-state", "hover"], false];
    const selected = ["boolean", ["feature-state", "selected"], false];
    map.on("load", () => {
      try {
        fitDemoWorld(false);
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
          featureBounds = window.HarmMapControls.boundsFromCountries(gj);
          fitDemoWorld(false);
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

  function pre1950IndicatorText(c) {
    const ind = pre1950Indicator(c);
    if (!ind) return "";
    return t("pre1950_indicator", {
      year: fmtYear(ind.year),
      share: fmtShare(ind.share),
      concept: ind.concept || "",
      territory: ind.territory || ""
    });
  }

  function tooltipHtml(c) {
    const name = countryName(c);
    const shown = displayValue(c);
    const pre = pre1950Used(c);
    const indicator = pre1950IndicatorText(c);
    if (shown == null) {
      const extra = indicator ? `<br>${esc(indicator)}` : "";
      return `<strong>${esc(name)}</strong><br>${esc(t("legend_no_score"))}${extra}`;
    }
    if (pre) {
      const label = t(pre.latest_source === "un_proxy" ? "pre1950_tooltip_un" : "pre1950_tooltip", {
        score: fmtChange(shown, false),
        first: fmtYear(pre.first_year),
        latest: fmtYear(pre.latest_year)
      });
      return `<strong>${esc(name)}</strong><br>
        <span class="swatch" style="background:${esc(colorForCountry(c, true))}"></span>
        ${esc(label)} <span class="dv-pill dv-pill-prov">${esc(t("flag_concept"))}</span>`;
    }
    const proxy = isProxyRow(c);
    const badge = proxy
      ? ` <span class="dv-pill dv-pill-proxy">${esc(t("flag_proxy"))}</span>`
      : ` <span class="dv-pill">${esc(t("flag_census"))}</span>`;
    const label = proxy
      ? t("tooltip_proxy", { score: fmtChange(shown, true) })
      : t("tooltip_census", { score: fmtChange(shown, false) });
    return `<strong>${esc(name)}</strong><br>
      <span class="swatch" style="background:${esc(colorForCountry(c, true))}"></span>
      ${esc(label)}${badge}`;
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
    const anyShare = years.some(y => pool && rows[y] && rows[y][pool] != null);
    if (!anyShare) return "";
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
    const preScore = pre1950Used(c);
    if (isProxyRow(c)) pills.push(`<span class="dv-pill dv-pill-proxy">${esc(t("flag_proxy"))}</span>`);
    if (c.census && c.census.weak_proxy) pills.push(`<span class="dv-pill dv-pill-prov">${esc(t("flag_weak"))}</span>`);
    if ((c.census && c.census.concept_break) || preScore) pills.push(`<span class="dv-pill dv-pill-prov">${esc(t("flag_concept"))}</span>`);
    if (isEstimate(c) && c.quality && !preScore) pills.push(`<span class="dv-pill" title="${esc(qualityLabel(c.quality))}">${esc(t("tooltip_quality", { quality: c.quality }))}</span>`);
    if (!c.on_map) pills.push(`<span class="dv-pill">${esc(t("not_on_map"))}</span>`);
    if (isSmall(c)) pills.push(`<span class="dv-pill dv-pill-prov">${esc(t("flag_small"))}</span>`);
    if (!inG) pills.push(`<span class="dv-pill">${esc(t("outside_group"))}</span>`);

    const lines = [];
    const ce = c.census;
    const shown = displayValue(c);
    const pre = pre1950Used(c);
    if (pre) {
      lines.push(`<p>${esc(t("pre1950_score", {
        first: fmtYear(pre.first_year),
        latest: fmtYear(pre.latest_year),
        score: fmtChange(shown, false)
      }))}</p>`);
      lines.push(`<p class="dv-meta">${esc(t("pre1950_shares", {
        first_share: fmtShare(pre.first_share),
        first: fmtYear(pre.first_year),
        latest_share: fmtShare(pre.latest_share),
        latest: fmtYear(pre.latest_year)
      }))}</p>`);
      if (pre.latest_source === "un_proxy") {
        lines.push(`<p class="dv-footnote">${esc(t("pre1950_break_un", {
          concept: pre.concept || "",
          territory: pre.territory || ""
        }))}${enOnlyBadge()}</p>`);
        lines.push(`<p class="dv-footnote">${esc(t("pre1950_un_latest", {
          year: fmtYear(pre.latest_year),
          share: fmtShare(pre.latest_share)
        }))}${enOnlyBadge()}</p>`);
      } else {
        lines.push(`<p class="dv-footnote">${esc(t("pre1950_break", {
          concept: pre.concept || "",
          territory: pre.territory || ""
        }))}${enOnlyBadge()}</p>`);
        if (pre.latest_source === "origin_series") {
          lines.push(`<p class="dv-footnote">${esc(t("pre1950_origin_latest", {
            year: fmtYear(pre.latest_year)
          }))}${enOnlyBadge()}</p>`);
        }
      }
      if (c.un_d_1990_2020 != null) {
        lines.push(`<p class="dv-meta">${esc(t("selected_gap", {
          census: fmtChange(shown, false),
          d: fmtIndex(c.un_d_1990_2020)
        }))}</p>`);
      }
    } else if (isCensusScore(c) && ce) {
      lines.push(`<p>${esc(t("selected_census_score", {
        first: fmtYear(ce.first_year),
        latest: fmtYear(ce.latest_year),
        score: fmtChange(shown, false)
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
          census: fmtChange(shown, false),
          d: fmtIndex(c.un_d_1990_2020)
        }))}</p>`);
      }
    } else if (shown != null) {
      if (c.availability === "census_limited") lines.push(`<p>${esc(t("selected_limited"))}</p>`);
      lines.push(`<p>${esc(t("selected_proxy", { score: fmtChange(shown, true) }))}</p>`);
      if (c.un_d_1990_2020 != null) {
        lines.push(`<p class="dv-meta">${esc(t("selected_d_line", { d: fmtIndex(c.un_d_1990_2020) }))}</p>`);
      }
    } else {
      lines.push(`<p>${esc(t("legend_no_score"))}</p>`);
    }
    const indicator = pre1950IndicatorText(c);
    if (indicator) {
      lines.push(`<p class="dv-meta">${esc(indicator)}${enOnlyBadge()}</p>`);
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
    el.innerHTML = `<h3>${esc(countryName(c))}</h3><p>${pills.join(" ")}</p>${lines.join("")}${ce ? checkpointTable(c) : ""}${originBlock(c)}`;
  }

  function share2(n) {
    return fmt(n, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function originBlock(c) {
    if (!Supplements || !originData || !originData.countries || !c) return "";
    const model = Supplements.originModel(originData.countries[c.iso3] || originData.countries[c.id]);
    if (!model) return "";
    const version = originData.version ? "v" + originData.version : "";
    const genKey = model.generations === "first" ? "origin_gen_esp" : (model.iso === "DEU" ? "origin_gen_deu" : "origin_gen_fra");
    const headline = originHeadline(model);
    const svg = Supplements.originChartSvg(model, share2);
    const legend = originLegend(model);
    const tables = originTables(model);
    const sensitivity = originSensitivity(model);
    const snapshot = model.snapshotNote
      ? `<p class="dv-footnote">${esc(model.snapshotNote)}${enOnlyBadge()}</p>`
      : "";
    const breakNote = model.iso === "ESP"
      ? `<p class="dv-footnote">${esc(t("origin_esp_break"))}${enOnlyBadge()}</p>`
      : "";
    const sources = sourceLinks(model.sources, t("origin_sources"));
    return `<section class="dv-extra" aria-label="${esc(t("origin_h"))}">
      <h4>${esc(t("origin_h"))}${version ? " (" + esc(version) + ")" : ""}</h4>
      <p class="dv-meta">${esc(model.label)}</p>
      <p>${esc(t("origin_note"))}${enOnlyBadge()}</p>
      <p>${esc(t(genKey))}${enOnlyBadge()}</p>
      ${headline}
      <div class="dv-chart-wrap">${svg}</div>
      ${legend}
      ${breakNote}
      ${tables}
      ${sensitivity}
      ${snapshot}
      ${sources}
    </section>`;
  }

  function originHeadline(model) {
    if (model.iso === "DEU") {
      const line = (model.tracks[0] && model.tracks[0].points) || [];
      const old = model.detached[0];
      if (!line.length) return "";
      const a = line[0];
      const b = line[line.length - 1];
      const span = t("origin_span_prov", {
        first: share2(a.value),
        first_year: fmtYear(a.year),
        latest: share2(b.value),
        latest_year: fmtYear(b.year)
      });
      const detached = old
        ? `<p class="dv-meta">${esc(fmtYear(old.year))}: ${esc(share2(old.value))}. ${esc(t("origin_detached"))}</p>`
        : "";
      return `<p>${esc(span)}</p>${detached}${originChangeLines(model)}`;
    }
    const ends = endpointSpan(model);
    if (!ends) return "";
    return `<p>${esc(t("origin_span", ends))}</p>${originChangeLines(model)}`;
  }

  function fmtSigned2(n) {
    return Number(n).toLocaleString(locale(), {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      signDisplay: "exceptZero"
    });
  }

  function originChangeLines(model) {
    return (model.tracks || []).map(track => {
      if (track.change == null || !track.points || track.points.length < 2) return "";
      const a = track.points[0];
      const b = track.points[track.points.length - 1];
      return `<p>${esc(t("origin_change", {
        first_year: fmtYear(a.year),
        latest_year: fmtYear(b.year),
        change: fmtSigned2(track.change)
      }))}</p>`;
    }).join("");
  }

  function endpointSpan(model) {
    const tracks = model.tracks || [];
    const firstTrack = tracks[0];
    const lastTrack = tracks[tracks.length - 1];
    if (!firstTrack || !firstTrack.points.length || !lastTrack || !lastTrack.points.length) return null;
    const a = firstTrack.points[0];
    const b = lastTrack.points[lastTrack.points.length - 1];
    return {
      first: share2(a.value),
      first_year: fmtYear(a.year),
      latest: share2(b.value),
      latest_year: fmtYear(b.year)
    };
  }

  function originLegend(model) {
    if (model.iso !== "ESP") return "";
    return `<p class="dv-chart-key">
      <span><i class="dv-key-line"></i>${esc(t("origin_series_register"))}</span>
      <span><i class="dv-key-line dv-key-dash"></i>${esc(t("origin_series_68525"))}</span>
    </p>`;
  }

  function pointNote(model, track, point) {
    if (point.provisional) return t("origin_provisional");
    if (model.iso === "ESP" && track) {
      return track.id === "table68525" ? t("origin_series_68525") : t("origin_series_register");
    }
    if (model.iso === "DEU" && track && track.id === "census2022") return t("origin_series_main");
    return "";
  }

  function originTables(model) {
    const chunks = [];
    (model.detached || []).forEach(point => {
      chunks.push(shareTable([{
        year: point.year,
        value: point.value,
        note: t("origin_detached")
      }], ""));
    });
    (model.tracks || []).forEach(track => {
      const rows = (track.points || []).map(point => ({
        year: point.year,
        value: point.value,
        note: pointNote(model, track, point)
      }));
      const caption = model.iso === "ESP"
        ? (track.id === "table68525" ? t("origin_series_68525") : t("origin_series_register"))
        : (model.iso === "DEU" ? t("origin_series_main") : "");
      chunks.push(shareTable(rows, caption));
    });
    return chunks.join("");
  }

  function shareTable(rows, caption) {
    if (!rows.length) return "";
    const body = rows.map(row => `<tr><th scope="row">${esc(fmtYear(row.year))}</th><td>${esc(share2(row.value))}</td><td>${esc(row.note || "")}</td></tr>`).join("");
    const cap = caption ? `<caption>${esc(caption)}</caption>` : "";
    return `<div class="dv-table-wrap"><table class="dv-mini">${cap}
      <thead><tr><th>${esc(t("origin_col_year"))}</th><th>${esc(t("origin_col_share"))}</th><th>${esc(t("origin_col_note"))}</th></tr></thead>
      <tbody>${body}</tbody></table></div>`;
  }

  function originSensitivity(model) {
    if (!model.sensitivity) return "";
    const s = model.sensitivity;
    if (s[2021] == null || s[2023] == null || s[2024] == null || s[2025] == null) return "";
    return `<p class="dv-footnote">${esc(t("origin_deu_sensitivity", {
      y2021: share2(s[2021]),
      y2023: share2(s[2023]),
      y2024: share2(s[2024]),
      y2025: share2(s[2025])
    }))}${enOnlyBadge()}</p>`;
  }

  function sourceLinks(sources, heading) {
    if (!sources || !sources.length) return "";
    const items = sources.map(s => {
      const label = [s.publisher, s.title].filter(Boolean).join(" — ") || s.url;
      return `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(label)}</a></li>`;
    }).join("");
    return `<p class="dv-meta">${esc(heading)}</p><ul class="dv-src-list">${items}</ul>`;
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
      const gr = rowGroup(a) - rowGroup(b);
      if (gr) return gr;
      if (state.sortKey === "name") {
        return countryName(a).localeCompare(countryName(b), loc);
      }
      const sa = displayValue(a), sb = displayValue(b);
      if (sa == null && sb == null) return countryName(a).localeCompare(countryName(b), loc);
      if (sa == null) return 1;
      if (sb == null) return -1;
      // "High" is the largest decline in founding share (the most negative figure).
      const diff = state.sortKey === "low" ? sb - sa : sa - sb;
      return diff || countryName(a).localeCompare(countryName(b), loc);
    });
    return list;
  }

  function barHead(kind) {
    const change = kind === "proxy" ? t("col_proxy") : t("col_change");
    const years = kind === "proxy" ? t("col_proxy_years") : t("col_years");
    return `<li class="dv-bar-head${kind === "proxy" ? " is-proxy" : ""}">
      <span class="dv-bar-name">${esc(t("col_country"))}</span>
      <span class="dv-col-change">${esc(change)}</span>
      <span class="dv-bar-years">${esc(years)}</span>
    </li>`;
  }

  function renderBars() {
    const ul = view.querySelector("#dv-bars");
    const count = view.querySelector("#dv-list-count");
    if (!ul) return;
    const list = filteredCountries();
    const vals = list.map(displayValue).filter(v => v != null);
    const cMin = vals.length ? Math.min(0, ...vals) : 0;
    const cMax = vals.length ? Math.max(0, ...vals) : 1;
    const cSpan = Math.max(1, cMax - cMin);
    if (count) count.textContent = t("list_count", { n: fmt(list.length, { maximumFractionDigits: 0 }) });
    if (!list.length) {
      ul.innerHTML = `<li class="dv-empty">${esc(t("no_matches"))}</li>`;
      return;
    }
    let seenCensusHead = false;
    let seenProxyHead = false;
    ul.innerHTML = list.map(c => {
      const shown = displayValue(c);
      const pre = pre1950Used(c);
      const proxy = isProxyRow(c);
      const heads = [];
      if (!proxy && (pre || isCensusScore(c)) && !seenCensusHead) {
        seenCensusHead = true;
        heads.push(barHead("census"));
      }
      if (proxy && !seenProxyHead) {
        seenProxyHead = true;
        heads.push(barHead("proxy"));
      }
      const color = colorForCountry(c, true);
      const sel = c.id === state.selected ? " is-selected" : "";
      const small = isSmall(c);
      const smallMark = small
        ? ` <span class="dv-small-flag" title="${esc(t("flag_small"))}">${esc(t("flag_small_short"))}</span>`
        : "";
      const proxyMark = proxy
        ? ` <span class="dv-proxy-flag" title="${esc(t("legend_proxy_note"))}">${esc(t("flag_proxy_short"))}</span>`
        : "";
      const breakMark = pre
        ? ` <span class="dv-small-flag" title="${esc(t(pre.latest_source === "un_proxy" ? "pre1950_break_un" : "pre1950_break", { concept: pre.concept || "", territory: pre.territory || "" }))}">${esc(t("flag_concept"))}</span>`
        : "";
      let fillStyle = `background:${esc(noScoreColor())};width:0`;
      let zeroPad = "";
      if (shown != null) {
        const left = ((Math.min(shown, 0) - cMin) / cSpan) * 100;
        const width = (Math.abs(shown) / cSpan) * 100;
        fillStyle = `background:${esc(color)};margin-left:${left}%;width:${Math.max(width, shown === 0 ? 0 : 0.4)}%;`;
        const zero = ((0 - cMin) / cSpan) * 100;
        zeroPad = `<span class="dv-bar-zero" style="left:${zero}%"></span>`;
      }
      const title = shown == null
        ? t("legend_no_score")
        : (pre
          ? t(pre.latest_source === "un_proxy" ? "pre1950_tooltip_un" : "pre1950_tooltip", { score: fmtChange(shown, false), first: fmtYear(pre.first_year), latest: fmtYear(pre.latest_year) })
          : (proxy
            ? t("tooltip_proxy", { score: fmtChange(shown, true) })
            : t("tooltip_census", { score: fmtChange(shown, false) })));
      const years = rowYearLabel(c);
      const cls = `dv-bar-item${sel}${small ? " is-small" : ""}${proxy ? " is-proxy" : ""}`;
      return heads.join("") + `<li class="${cls}" data-id="${esc(c.id)}">
        <button type="button" class="dv-bar-btn" aria-label="${esc(countryName(c))}, ${esc(title)}${years ? ", " + esc(years) : ""}">
          <span class="dv-bar-name"><span class="dv-bar-label">${esc(countryName(c))}</span>${proxyMark}${breakMark}${smallMark}</span>
          <span class="dv-bar-track">${zeroPad}<span class="dv-bar-fill" style="${fillStyle}"></span></span>
          <span class="dv-bar-n">${esc(shown == null ? "—" : fmtChange(shown, proxy))}</span>
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

  function ingestSupplements(origin) {
    originData = origin && origin.countries ? origin : null;
  }

  function ingestPre1950(dataset) {
    pre1950ByIso = Pre1950 ? Pre1950.indexRows(dataset) : {};
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
    const fetchJson = url => fetch(url, { signal: ctrl.signal, cache: "no-cache" })
      .then(r => { if (!r.ok) throw new Error(url + ": HTTP " + r.status); return r.json(); });
    loading = Promise.all([
      fetchJson(DATA_URL),
      fetchJson(ORIGIN_URL).catch(err => { console.error(err); return null; }),
      fetchJson(PRE1950_URL).catch(err => { console.error(err); return null; })
    ])
      .then(([json, origin, pre1950]) => {
        ingest(json);
        ingestSupplements(origin);
        ingestPre1950(pre1950);
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
    const opt = e.target.closest("#dv-group-menu [data-group]");
    if (opt) {
      setGroup(opt.getAttribute("data-group"));
      renderGroupSelect();
      const btn = view.querySelector("#dv-group-btn");
      if (btn) btn.focus();
      return;
    }
    if (e.target.closest("#dv-group-btn")) { toggleGroupMenu(); return; }
    closeGroupMenu();
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
  document.addEventListener("click", e => {
    if (!view.contains(e.target)) closeGroupMenu();
  });
  view.addEventListener("keydown", e => {
    const inMenu = e.target.closest && e.target.closest("#dv-group-menu");
    const onBtn = e.target && e.target.id === "dv-group-btn";
    if (onBtn && (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      openGroupMenu();
      return;
    }
    if (!inMenu) return;
    if (e.key === "Escape") {
      e.preventDefault();
      closeGroupMenu();
      const btn = view.querySelector("#dv-group-btn");
      if (btn) btn.focus();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      focusGroupOption(e.target, 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      focusGroupOption(e.target, -1);
    } else if (e.key === "Home") {
      e.preventDefault();
      focusGroupOption(null, 0);
      const first = view.querySelector("#dv-group-menu [role='option']");
      if (first) first.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      const opts = view.querySelectorAll("#dv-group-menu [role='option']");
      if (opts.length) opts[opts.length - 1].focus();
    } else if (e.key === "Enter" || e.key === " ") {
      const option = e.target.closest("[data-group]");
      if (option) {
        e.preventDefault();
        setGroup(option.getAttribute("data-group"));
        renderGroupSelect();
        const btn = view.querySelector("#dv-group-btn");
        if (btn) btn.focus();
      }
    }
  });
  view.addEventListener("change", e => {
    if (e.target && e.target.id === "dv-sort") { state.sortKey = e.target.value; renderBars(); }
  });
  view.addEventListener("input", e => {
    if (e.target && e.target.id === "dv-search") {
      state.query = e.target.value;
      renderBars();
    }
  });
  window.addEventListener("resize", () => {
    if (view.hidden) return;
    if (map) {
      try {
        map.resize();
        if (demoAtWorld) fitDemoWorld(false);
      } catch (e) {}
    } else scheduleMap();
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
