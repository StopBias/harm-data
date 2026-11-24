// Demographics tab. Reads data/demographics.json.
// User-facing text lives in i18n/*.json under the demographics.* prefix.
// Group lists (geographic region, founding population, Anglosphere) come from
// the data file so new groups can be added without changing this file.
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

  let data = null, loading = null, byId = {}, map = null, mapReady = false;
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
    return Number(n).toLocaleString(locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 });
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

  function bands() {
    const list = data && data.scale && Array.isArray(data.scale.bands) ? data.scale.bands : [];
    return list;
  }

  function noScoreColor() {
    return (data && data.scale && data.scale.no_score_color) || DEFAULT_NO_SCORE;
  }

  function outGroupColor() {
    return (data && data.scale && data.scale.out_of_group_color) || DEFAULT_OUT_GROUP;
  }

  function bandFor(score) {
    const list = bands();
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (score >= b.from && (score < b.to || (i === list.length - 1 && score <= b.to))) return b;
    }
    return null;
  }

  function colorForScore(score) {
    const b = bandFor(score);
    return b ? b.color : noScoreColor();
  }

  function colorForCountry(c, inGroup) {
    if (!inGroup) return outGroupColor();
    if (!c || c.score == null) return noScoreColor();
    return colorForScore(c.score);
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
    if (b.open_ended) {
      const open = t("band_label_open", { from: b.from.toLocaleString(locale()) });
      if (open && open !== "demographics.band_label_open") return open;
      return String(b.from) + "+";
    }
    const range = t("band_label", {
      from: b.from.toLocaleString(locale()),
      to: b.to.toLocaleString(locale())
    });
    if (range && range !== "demographics.band_label") return range;
    return b.from + "–" + b.to;
  }

  // ---------- Shell ----------
  function mountShell() {
    view.innerHTML = `<div class="dv-inner">
      <div class="dv-head">
        <h2 id="dv-title"></h2>
        <div class="dv-banner" id="dv-banner" hidden></div>
        <p class="dv-desc" id="dv-lede"></p>
        <p class="dv-prov-note" id="dv-prov-note"></p>
      </div>
      <div class="dv-switcher-wrap">
        <div class="dv-switcher" id="dv-switcher" role="group"></div>
        <label class="dv-filter-lab" id="dv-group-lab">
          <span id="dv-group-lbl"></span>
          <select id="dv-group"></select>
        </label>
      </div>
      <section class="dv-section" aria-labelledby="dv-map-h">
        <h3 class="dv-h" id="dv-map-h"></h3>
        <p class="dv-desc" id="dv-map-desc"></p>
        <div class="dv-map-wrap">
          <div id="dv-map" role="img"></div>
          <div class="dv-legend" id="dv-legend"></div>
        </div>
        <p class="dv-scale-note" id="dv-scale-note"></p>
        <div class="dv-selected" id="dv-selected" hidden></div>
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
      <section class="dv-section">
        <button type="button" class="dv-details-btn" id="dv-details-btn"></button>
        <div class="dv-details" id="dv-details" hidden></div>
        <p class="dv-source" id="dv-source"></p>
      </section>
    </div>`;
  }

  function labelStatic() {
    const title = view.querySelector("#dv-title");
    if (title) title.textContent = t("title");
    const lede = view.querySelector("#dv-lede");
    if (lede) lede.textContent = t("lede");
    const note = view.querySelector("#dv-prov-note");
    if (note) note.textContent = t("provisional_note");
    const mapH = view.querySelector("#dv-map-h");
    if (mapH) mapH.textContent = t("map_h");
    const mapD = view.querySelector("#dv-map-desc");
    if (mapD) mapD.textContent = t("map_desc");
    const scale = view.querySelector("#dv-scale-note");
    if (scale) scale.textContent = t("scale_note");
    const barH = view.querySelector("#dv-bar-h");
    if (barH) barH.textContent = t("bar_h");
    const barD = view.querySelector("#dv-bar-desc");
    if (barD) barD.textContent = t("bar_desc");
    const searchLbl = view.querySelector("#dv-search-lbl");
    if (searchLbl) searchLbl.textContent = t("search");
    const search = view.querySelector("#dv-search");
    if (search) {
      search.setAttribute("aria-label", t("search_aria"));
      search.setAttribute("placeholder", t("search"));
      if (search.value !== state.query) search.value = state.query;
    }
    const sortLbl = view.querySelector("#dv-sort-lbl");
    if (sortLbl) sortLbl.textContent = t("sort");
    const groupLbl = view.querySelector("#dv-group-lbl");
    if (groupLbl) groupLbl.textContent = t("group_filter");
    const source = view.querySelector("#dv-source");
    if (source) source.textContent = t("source_caption");
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

  function renderGroupSelect() {
    const lab = view.querySelector("#dv-group-lab");
    const sel = view.querySelector("#dv-group");
    if (!lab || !sel) return;
    const v = viewDef(state.viewId);
    const groups = (v && v.groups) || [];
    const selectable = groups.filter(g => g.level !== "all" || groups.length > 1);
    // Hide the dropdown when a view has a single fixed group (Anglosphere).
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
        kids.forEach(g => {
          html += `<option value="${esc(g.id)}">${esc(groupLabel(g))}</option>`;
        });
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
    const list = bands().slice().reverse();
    const items = list.map(b => {
      return `<span class="dv-legend-item"><span class="swatch" style="background:${esc(b.color)}"></span>${esc(bandLabel(b))}</span>`;
    }).join("");
    el.innerHTML = `<div class="dv-legend-title">${esc(t("legend_title"))}</div>
      <div class="dv-legend-ends"><span>${esc(t("legend_most"))}</span><span>${esc(t("legend_least"))}</span></div>
      <div class="dv-legend-items">${items}
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
    Object.keys(byId).forEach(id => {
      const c = byId[id];
      if (!c.iso3) return;
      fc.push(c.iso3, colorForCountry(c, inG.has(id)));
    });
    fc.push(outGroupColor());
    return fc;
  }

  function refreshFill() {
    if (!map || !map.getLayer("countries-fill")) return;
    map.setPaintProperty("countries-fill", "fill-color", fillExpression());
  }

  function setFeatureFlag(iso, key, val) {
    if (!map || !iso) return;
    try { map.setFeatureState({ source: "countries", id: iso }, { [key]: val }); } catch (e) {}
  }

  function ensureMap() {
    if (map || typeof maplibregl === "undefined") return;
    const container = document.getElementById("dv-map");
    if (!container) return;
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
    map.touchZoomRotate.disableRotation();
    map.keyboard.disableRotation();

    const hover = ["boolean", ["feature-state", "hover"], false];
    const selected = ["boolean", ["feature-state", "selected"], false];

    map.on("load", () => {
      map.fitBounds(WORLD_BOUNDS, { padding: 16, animate: false });
      const z = map.getZoom();
      map.setMinZoom(z);
      map.setMaxZoom(z + 4);
      fetch(COUNTRIES_URL)
        .then(r => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
        .then(gj => {
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
        })
        .catch(err => console.error(err));
    });
  }

  let hoveredIso = null;
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
    if (c.score == null) {
      return `<strong>${esc(name)}</strong><br>${esc(t("legend_no_score"))}`;
    }
    const est = (c.status === "estimate" || (data && data.provisional))
      ? ` <span class="dv-pill dv-pill-prov">${esc(t("flag_estimate"))}</span>`
      : "";
    return `<strong>${esc(name)}</strong><br>
      <span class="swatch" style="background:${esc(colorForScore(c.score))}"></span>
      ${esc(t("tooltip_score", { score: fmtScore(c.score) }))}${est}`;
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
      const row = view.querySelector('.dv-bar-item.is-selected');
      if (row) row.scrollIntoView({ block: "nearest" });
    }
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
    if (c.status === "estimate") pills.push(`<span class="dv-pill dv-pill-prov">${esc(t("flag_estimate"))}</span>`);
    if (c.status === "census_and_estimate") pills.push(`<span class="dv-pill">${esc(t("flag_census"))}</span>`);
    if (c.quality) pills.push(`<span class="dv-pill" title="${esc(qualityLabel(c.quality))}">${esc(t("tooltip_quality", { quality: c.quality }))}</span>`);
    if (!c.on_map) pills.push(`<span class="dv-pill">${esc(t("not_on_map"))}</span>`);
    if (isSmall(c)) pills.push(`<span class="dv-pill dv-pill-prov">${esc(t("flag_small"))}</span>`);
    if (!inG) pills.push(`<span class="dv-pill">${esc(t("outside_group"))}</span>`);
    const lines = [
      `<p>${esc(t("selected_score", { score: fmtScore(c.score) }))}</p>`,
      `<p class="dv-meta">${esc(t("selected_pool", { pool: poolLabel(c.primary_pool) }))}</p>`
    ];
    if (c.cross_pool_fb_pct_2020 != null) {
      lines.push(`<p class="dv-meta">${esc(t("selected_share", { share: fmtScore(c.cross_pool_fb_pct_2020) }))}</p>`);
    }
    if (c.census && c.census.outside_majority_change_pp != null && c.census.latest_year) {
      lines.push(`<p class="dv-meta">${esc(t("selected_census", {
        change: fmtScore(c.census.outside_majority_change_pp),
        year: fmt(c.census.latest_year, { maximumFractionDigits: 0 })
      }))}${enOnlyBadge()}</p>`);
    }
    if (c.mapping_note) {
      lines.push(`<p class="dv-meta">${esc(c.mapping_note)}${enOnlyBadge()}</p>`);
    }
    if (c.source) {
      lines.push(`<p class="dv-meta">${esc(c.source)}${enOnlyBadge()}</p>`);
    }
    el.hidden = false;
    el.innerHTML = `<h3>${esc(countryName(c))}</h3><p>${pills.join(" ")}</p>${lines.join("")}`;
  }

  function filteredCountries() {
    const inG = memberSet();
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
    const scored = list.filter(c => c.score != null);
    const max = Math.max(1, ...scored.map(c => c.score || 0));
    if (count) count.textContent = t("list_count", { n: fmt(list.length, { maximumFractionDigits: 0 }) });
    if (!list.length) {
      ul.innerHTML = `<li class="dv-empty">${esc(t("no_matches"))}</li>`;
      return;
    }
    ul.innerHTML = list.map(c => {
      const pct = c.score == null ? 0 : Math.max(0, Math.min(100, (c.score / max) * 100));
      const color = c.score == null ? noScoreColor() : colorForScore(c.score);
      const sel = c.id === state.selected ? " is-selected" : "";
      const small = isSmall(c);
      const smallMark = small
        ? ` <span class="dv-small-flag" title="${esc(t("flag_small"))}">${esc(t("flag_small_short"))}</span>`
        : "";
      const title = (c.score == null ? t("legend_no_score") : t("tooltip_score", { score: fmtScore(c.score) }))
        + (small ? " — " + t("flag_small") : "");
      return `<li class="dv-bar-item${sel}${small ? " is-small" : ""}" data-id="${esc(c.id)}">
        <button type="button" class="dv-bar-btn" aria-label="${esc(countryName(c))}, ${esc(title)}">
          <span class="dv-bar-name"><span class="dv-bar-label">${esc(countryName(c))}</span>${smallMark}</span>
          <span class="dv-bar-track"><span class="dv-bar-fill" style="width:${pct}%;background:${esc(color)}"></span></span>
          <span class="dv-bar-n">${esc(fmtScore(c.score))}</span>
        </button>
      </li>`;
    }).join("");
  }

  function highlightBar() {
    view.querySelectorAll(".dv-bar-item").forEach(li => {
      li.classList.toggle("is-selected", li.getAttribute("data-id") === state.selected);
    });
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
    renderSwitcher();
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
    if (!view.querySelector("#dv-map")) mountShell();
    if (!state.viewId) defaultViewState();
    labelStatic();
    renderSwitcher();
    renderSort();
    renderLegend();
    renderBars();
    renderDetails();
    renderSelected();
    ensureMap();
    updateAttribution();
    if (map) {
      map.resize();
      refreshFill();
    }
  }

  // ---------- Events ----------
  view.addEventListener("click", e => {
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

  function showLoadError(err) {
    console.error(err);
    loading = null;
    if (map) {
      try { map.remove(); } catch (e) {}
      map = null;
      mapReady = false;
    }
    view.innerHTML = `<div class="dv-inner"><p class="pending-note">${esc(t("load_error"))}</p></div>`;
  }

  function load() {
    if (data) {
      try { render(); } catch (err) { showLoadError(err); }
      return;
    }
    if (loading) return;
    view.innerHTML = `<div class="dv-inner"><p class="ex-lede">${esc(t("loading"))}</p></div>`;
    loading = fetch(DATA_URL)
      .then(r => { if (!r.ok) throw new Error(DATA_URL + ": HTTP " + r.status); return r.json(); })
      .then(json => {
        data = json;
        byId = {};
        (data.countries || []).forEach(c => {
          byId[c.id] = c;
          if (c.iso3 && c.iso3 !== c.id) byId[c.iso3] = c;
        });
        defaultViewState();
        render();
      })
      .catch(err => showLoadError(err));
  }

  window.renderDemographicsView = function () {
    if (view.hidden) return;
    try {
      if (data) render();
      else load();
    } catch (err) {
      showLoadError(err);
    }
  };

  function start() {
    if (!view.hidden) load();
  }

  const ready = window.I18N_READY || Promise.resolve();
  ready.then(start);
})();
