// Media coverage view. Reads data/media/summary.json (2023 keyword pilot),
// summary_audit_homicide_draft.json (draft homicide audit), baseline_ncvs.json
// and baseline_shr.json. User-facing text lives in i18n/*.json under media.*.
(function () {
  "use strict";

  const t = (key, vars) => (window.t ? window.t("media." + key, vars) : key);
  // Same neutral grey as MEDIA_DRAFT_COLOR in index.html. Not an index colour.
  const DRAFT_MAP_COLOR = "#c5c9cc";
  const locale = () => (window.currentLocale ? window.currentLocale() : (document.documentElement.lang || "en"));
  const esc = v => String(v == null ? "" : v).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const fmt = n => (n == null ? "—" : Number(n).toLocaleString(locale()));
  const REPO_BLOB = "https://github.com/StopBias/harm-data/blob/main/data/media/";
  const MINUS = "\u2212";

  let data = null, loading = null, detailed = [];
  const view = document.getElementById("media-view");
  if (!view) return;

  const state = {
    label: "antiwhite",   // or antiblack (sign flip only)
    rule: "strict",
    mode: "map",          // map | table
    tableView: "index",   // index | sources
    details: false,
    selected: null,       // iso
    sortKey: "country",
    sortDir: 1
  };

  function enOnlyBadge() {
    const lang = (document.documentElement.lang || "en").slice(0, 2).toLowerCase();
    if (lang === "en") return "";
    const label = window.t ? window.t("shown_in_english") : "Shown in English";
    return ` <span class="en-only">${esc(label)}</span>`;
  }

  function approxBadge(iso) {
    if (iso !== "USA") return "";
    return ` <span class="badge mv-badge" title="${esc(t("badge_approximate_hint"))}">${esc(t("badge_approximate"))}</span>`;
  }

  function fmtCiMult(value, { flip } = {}) {
    if (value == null || !isFinite(value)) return null;
    const display = Number(value).toLocaleString(locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (value > 1) return t("multiplier", { sign: flip ? MINUS : "+", value: display });
    if (Math.abs(value - 1) < 1e-9) return t("multiplier", { sign: "", value: display });
    return t("multiplier", { sign: "", value: display });
  }

  function ciText(rec) {
    if (!rec || rec.ci95_low == null) return "";
    const low = fmtCiMult(rec.ci95_low, { flip: state.label === "antiblack" });
    if (!low) return "";
    const high = rec.ci95_high == null
      ? t("ci_unbounded")
      : (fmtCiMult(rec.ci95_high, { flip: state.label === "antiblack" }) || t("ci_unbounded"));
    return t("tt_ci95", { low, high });
  }

  // ---------- Tabs ----------
  const nav = document.createElement("nav");
  nav.className = "site-tabs";
  nav.setAttribute("aria-label", t("tabs_label"));
  nav.innerHTML = `<button type="button" data-tab="demographics"></button><button type="button" data-tab="map"></button><button type="button" data-tab="media"></button>`;
  const header = document.querySelector("header");
  header.insertAdjacentElement("afterend", nav);
  const aboutView = document.getElementById("about-view");
  const aboutLink = document.getElementById("about-link");
  const explorer = document.getElementById("explorer");
  const layout = document.querySelector(".layout");

  function labelTabs() {
    nav.setAttribute("aria-label", t("tabs_label"));
    nav.querySelector('[data-tab="demographics"]').textContent = t("tab_demographics");
    nav.querySelector('[data-tab="map"]').textContent = t("tab_map");
    nav.querySelector('[data-tab="media"]').textContent = t("tab_media");
  }

  function canonicalHash() {
    if (location.hash === "#hollywood") {
      history.replaceState(null, "", "#media/hollywood");
    }
    return location.hash;
  }

  function tabFromHash() {
    const hash = canonicalHash();
    if (hash === "#media/hollywood") return "hollywood";
    if (hash === "#media" || hash === "#media/news") return "media";
    if (hash === "#demographics") return "demographics";
    // #crime/USA/maltreatment and similar deep links stay on Crime. A removed
    // category is then ignored by the explorer, which falls back to its default.
    if (hash === "#crime" || hash === "#map" || hash.startsWith("#crime/") || hash.startsWith("#map/") || hash.startsWith("#crime?") || hash.startsWith("#map?")) return "map";
    if (hash === "#about") return "about";
    if (!hash && /[?&](harm|category|offence|offense)=/i.test(location.search)) return "map";
    return "demographics";
  }

  const hollywoodView = document.getElementById("hollywood-view");
  const demographicsView = document.getElementById("demographics-view");

  function hashFor(tab) {
    if (tab === "media") return "#media";
    if (tab === "hollywood") return "#media/hollywood";
    if (tab === "demographics") return "#demographics";
    if (tab === "about") return "#about";
    if (tab === "map") return "#crime";
    return "";
  }

  function show(tab) {
    const media = tab === "media";
    const about = tab === "about";
    const hollywood = tab === "hollywood";
    const demographics = tab === "demographics";
    const mediaSection = media || hollywood;
    const standalone = about || demographics;
    if (layout) layout.hidden = standalone || hollywood;
    if (explorer) explorer.hidden = mediaSection || standalone;
    view.hidden = !media;
    if (hollywoodView) hollywoodView.hidden = !hollywood;
    if (demographicsView) demographicsView.hidden = !demographics;
    if (aboutView) aboutView.hidden = !about;
    nav.querySelectorAll("button").forEach(b => {
      const on = b.dataset.tab === tab || (b.dataset.tab === "media" && mediaSection);
      b.setAttribute("aria-pressed", String(on));
    });
    if (aboutLink) {
      if (about) aboutLink.setAttribute("aria-current", "page");
      else aboutLink.removeAttribute("aria-current");
    }
    document.body.classList.toggle("media-active", media);
    document.body.classList.toggle("media-table", media && state.mode === "table");
    document.body.classList.toggle("about-active", about);
    document.body.classList.toggle("hollywood-active", hollywood);
    document.body.classList.toggle("demographics-active", demographics);
    const agePicker = document.getElementById("age-picker");
    if (agePicker) agePicker.hidden = mediaSection || demographics;
    if (chrome) chrome.hidden = !mediaSection;
    const modes = document.getElementById("media-modes");
    if (modes) modes.hidden = !media;
    labelSubviews(tab);
    if (window.HarmMap && !hollywood && !demographics) window.HarmMap.setMode(media ? "media" : "crime");
    if (media) load();
    if (hollywood && typeof window.renderHollywoodView === "function") window.renderHollywoodView();
    if (demographics && typeof window.renderDemographicsView === "function") window.renderDemographicsView();
    if (!media) window.dispatchEvent(new Event("resize"));
  }

  function go(tab) {
    const next = hashFor(tab);
    if (location.hash !== next) history.pushState(null, "", next || (location.pathname + location.search));
    show(tab);
  }

  nav.addEventListener("click", e => {
    const b = e.target.closest("button[data-tab]");
    if (!b) return;
    go(b.dataset.tab);
  });
  if (aboutLink) {
    aboutLink.addEventListener("click", e => {
      e.preventDefault();
      go("about");
    });
  }
  window.addEventListener("popstate", () => show(tabFromHash()));
  window.addEventListener("hashchange", () => show(tabFromHash()));

  // ---------- Media sub-views and Map/Table switch (hidden outside the Media tab) ----------
  const chrome = document.createElement("div");
  chrome.id = "media-chrome";
  chrome.hidden = true;
  chrome.innerHTML = `<div class="media-modes" role="group" aria-label="" id="media-subviews">
    <button type="button" data-sub="news"></button>
    <button type="button" data-sub="hollywood"></button>
  </div>
  <div class="media-modes" role="group" aria-label="" id="media-modes">
    <button type="button" data-mode="map"></button>
    <button type="button" data-mode="table"></button>
  </div>`;
  nav.insertAdjacentElement("afterend", chrome);

  function labelSubviews(tab) {
    const group = document.getElementById("media-subviews");
    if (!group) return;
    group.setAttribute("aria-label", t("sub_aria"));
    group.querySelector('[data-sub="news"]').textContent = t("sub_news");
    group.querySelector('[data-sub="hollywood"]').textContent = t("tab_hollywood");
    const current = tab == null ? tabFromHash() : tab;
    group.querySelectorAll("button").forEach(b => {
      b.setAttribute("aria-pressed", String((b.dataset.sub === "hollywood") === (current === "hollywood")));
    });
  }

  function labelModes() {
    const group = document.getElementById("media-modes");
    if (!group) return;
    group.setAttribute("aria-label", t("mode_aria"));
    group.querySelector('[data-mode="map"]').textContent = t("mode_map");
    group.querySelector('[data-mode="table"]').textContent = t("mode_table");
    group.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.mode === state.mode)));
    labelSubviews();
  }
  chrome.addEventListener("click", e => {
    const sub = e.target.closest("button[data-sub]");
    if (sub) {
      go(sub.dataset.sub === "hollywood" ? "hollywood" : "media");
      return;
    }
    const b = e.target.closest("button[data-mode]");
    if (!b) return;
    state.mode = b.dataset.mode;
    document.body.classList.toggle("media-table", state.mode === "table");
    if (window.HarmMap) window.HarmMap.resize();
    render();
  });

  // ---------- Data helpers ----------
  function usa() { return data && data.summary.countries && data.summary.countries.USA; }
  function ruleBlock() {
    const u = usa();
    return u && u.rule_sets && u.rule_sets[state.rule];
  }
  function pref() { return usa() && usa().preferred_inference; }
  function audit() { return data && data.audit; }

  function fmtMult(value, { flip, asBound } = {}) {
    if (value == null || !isFinite(value)) return null;
    const display = (v) => {
      const n = Number(v);
      if (n >= 1) return n.toLocaleString(locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 });
      return n.toLocaleString(locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };
    if (Math.abs(value - 1) < 1e-9) return t("multiplier", { sign: "", value: display(1) });
    if (asBound) {
      if (value > 1) return t("multiplier", { sign: flip ? MINUS : "+", value: display(value) });
      return t("multiplier", { sign: "", value: display(value) });
    }
    // point estimate: signed public multiplier
    if (value > 1) return t("multiplier", { sign: flip ? MINUS : "+", value: display(value) });
    const rec = 1 / value;
    return t("multiplier", { sign: flip ? "+" : MINUS, value: display(rec) });
  }

  function formatP(p) {
    if (p == null || !isFinite(Number(p))) return "";
    const n = Number(p);
    if (n > 0 && n < 0.001) return n.toLocaleString(locale(), { maximumSignificantDigits: 2 });
    return n.toLocaleString(locale(), { maximumSignificantDigits: 3 });
  }

  function significanceText(rec) {
    if (!rec) return "";
    const p = formatP(rec.p_two_sided);
    const label = rec.significance_label;
    if (label === "not_published_as_finding" || rec.finding_published === false) {
      return p ? t("sig_not_a_finding", { p }) : "";
    }
    if (rec.significant) return t("sig_significant", { p });
    if (rec.p_two_sided != null) return t("sig_not_significant", { p });
    return "";
  }

  function locFixed(value, digits) {
    return Number(value).toLocaleString(locale(), { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }

  function auditMultiplier() {
    const a = audit();
    if (!a) return "";
    const flip = state.label === "antiblack";
    if (a.rate_ratio != null && Math.abs(Number(a.rate_ratio) - 1) < 1e-9) {
      return t("multiplier", { sign: "", value: locFixed(1, 2) });
    }
    const showMinus = a.signed_lean === "antiblack" ? !flip : flip;
    return t("multiplier", { sign: showMinus ? MINUS : "+", value: locFixed(a.signed_magnitude, 2) });
  }

  function auditSignedInterval() {
    const a = audit();
    if (!a) return "";
    const flip = state.label === "antiblack";
    const piece = (sign, mag) => t("multiplier", {
      sign: sign === "-" ? MINUS : "+",
      value: locFixed(mag, 2)
    });
    const low = a.ci95_signed_low_magnitude;
    const high = a.ci95_signed_high_magnitude;
    if (!flip) return "[" + piece("-", low) + ", " + piece("+", high) + "]";
    return "[" + piece("-", high) + ", " + piece("+", low) + "]";
  }

  function auditSig() {
    const a = audit();
    if (!a) return "";
    return t("sig_draft_not_significant", { p: locFixed(a.p_two_sided_headline, 2) });
  }

  function auditCountsLine() {
    const a = audit();
    if (!a) return "";
    return t("audit_counts", {
      w: fmt(a.n_covered_W),
      b: fmt(a.n_covered_B),
      m: fmt(a.n_sampled_W)
    });
  }

  function auditHeadline() {
    return {
      status: "draft",
      text: auditMultiplier(),
      sub: auditSig(),
      zero: null,
      interval: auditSignedInterval(),
      counts: auditCountsLine(),
      draft: true
    };
  }

  function keywordHeadline() {
    const p = pref();
    if (!p) return { status: "pending", text: t("pending"), sub: t("pending_hint") };
    const flip = state.label === "antiblack";
    const bound = p.index_lower_display;
    const zero = p.zero_of_n;
    const rec = usa() || {};
    const status = rec.index_status || "pending";
    const sig = significanceText(Object.assign({}, p, rec));
    if (status === "bound") {
      const m = fmtMult(bound, { flip, asBound: true });
      const atLeast = m ? t("at_least", { m }) : "";
      return {
        status: "bound",
        text: atLeast || t("pending"),
        zero,
        bound: m,
        sub: sig
      };
    }
    if (status === "insufficient_data" || rec.index_defined === false) {
      return { status: "insufficient_data", text: t("insufficient"), sub: t("insufficient_hint") };
    }
    if (p.cdi != null && p.point_estimate_published) {
      return { status: "point", text: fmtMult(p.cdi, { flip, asBound: false }), sub: sig };
    }
    return { status: "pending", text: t("pending"), sub: t("pending_hint") };
  }

  function headline() {
    if (audit()) return auditHeadline();
    return keywordHeadline();
  }

  function completenessOf(iso) {
    const tracked = window.HarmMap ? window.HarmMap.getTracked() : (window.tracked || {});
    const info = tracked && tracked[iso];
    return info && info.completeness != null ? info.completeness : null;
  }

  function countryName(iso) {
    if (window.HarmMap && window.HarmMap.countryName) return window.HarmMap.countryName(iso);
    return iso;
  }

  function inScopeList() {
    if (window.HarmMap && window.HarmMap.getInScope) return window.HarmMap.getInScope();
    return ["USA"];
  }

  // Tables, CSV and country pickers use the 43 scored countries in data/index.json
  // "detailed". IN_SCOPE (50) is for the map only, so microstates stay grey there
  // but do not appear as table rows or picker options.
  function detailedList() {
    if (window.HarmMap && typeof window.HarmMap.getDetailed === "function") {
      const d = window.HarmMap.getDetailed();
      if (d && d.length) return d;
    }
    return detailed.slice();
  }

  function countryRecord(iso) {
    return data && data.summary && data.summary.countries && data.summary.countries[iso];
  }

  function signedL(bound, flip) {
    if (bound == null || !isFinite(bound) || bound <= 0) return null;
    const L = Math.log2(bound);
    return flip ? -L : L;
  }

  function mediaStateFor(iso) {
    if (iso === "USA" && audit()) {
      const a = audit();
      return {
        status: "draft",
        draft: true,
        index_defined: true,
        finding_published: false,
        significant: false,
        significance_label: a.significance_label,
        p_two_sided: a.p_two_sided,
        p_one_sided: a.p_one_sided,
        test: a.test,
        L: null,
        bound: null,
        incidents: a.n_sampled,
        start: a.date_start,
        end: a.date_end,
        completeness: completenessOf(iso),
        n_covered_W: a.n_covered_W,
        n_covered_B: a.n_covered_B,
        n_sampled_W: a.n_sampled_W,
        n_sampled_B: a.n_sampled_B
      };
    }
    const rec = countryRecord(iso);
    const flip = state.label === "antiblack";
    if (rec) {
      const p = rec.preferred_inference;
      const rb = rec.rule_sets && rec.rule_sets[state.rule];
      const cdiBound = p && p.cdi_lower_bound;
      let status = rec.index_status;
      if (!status) {
        if (rec.index_defined === false) status = "insufficient_data";
        else if (p && p.index_lower_display != null) status = "bound";
        else if (p && p.point_estimate_published && p.cdi != null) status = "point";
        else status = "pending";
      }
      const bound = p && p.index_lower_display;
      return {
        status,
        index_defined: rec.index_defined,
        finding_published: rec.finding_published,
        significant: rec.significant,
        significance_label: rec.significance_label,
        p_two_sided: rec.p_two_sided != null ? rec.p_two_sided : (p && p.p_two_sided),
        p_one_sided: rec.p_one_sided != null ? rec.p_one_sided : (p && p.p_one_sided),
        test: rec.test || (p && p.test),
        n_covered_W: rec.n_covered_W,
        n_covered_B: rec.n_covered_B,
        zero_of_n: p && p.zero_of_n,
        n_pair: p && (p.n_pair != null ? p.n_pair : cdiBound && cdiBound.n_pair),
        unit: (p && p.unit) || "incidents",
        zero_direction: cdiBound && cdiBound.zero_direction,
        bound,
        L: signedL(bound, flip),
        incidents: rb && rb.included_incidents,
        start: rb && rb.date_start,
        end: rb && rb.date_end,
        stories: rb && rb.mixed_vs_ncvs && rb.mixed_vs_ncvs.stories,
        completeness: completenessOf(iso)
      };
    }
    const inScope = inScopeList().includes(iso);
    return {
      status: inScope ? "pending" : "out",
      completeness: completenessOf(iso)
    };
  }
  window.mediaCountryState = mediaStateFor;

  function measuredIsos() {
    if (!data || !data.summary || !data.summary.countries) return [];
    return Object.keys(data.summary.countries).filter(iso => {
      const st = mediaStateFor(iso);
      return st && (st.status === "insufficient_data" || st.status === "bound" || st.status === "point" || st.status === "draft");
    });
  }

  function subjectCountryName(iso) {
    const key = "countries_in_sentence." + iso;
    const special = window.t ? window.t(key) : "";
    const display = countryName(iso);
    if (!special || special === key) return display;
    // Locative forms (preposition + name) are not usable as a sentence subject.
    if (/^(w|в|у|in|en|i|na|im)\s/i.test(special.trim())) return display;
    return special;
  }

  function listNames(names) {
    try { return new Intl.ListFormat(locale(), { type: "conjunction" }).format(names); }
    catch (e) { return names.join(", "); }
  }

  function unitName(unit) {
    return unit === "stories" ? t("unit_stories_name") : t("unit_incidents_name");
  }

  function directionName(dir) {
    return dir === "W_on_B" ? t("dir_wb") : t("dir_bw");
  }

  function updateMapNote() {
    const note = document.getElementById("media-map-h-note");
    if (!note) return;
    const media = document.body.classList.contains("media-active") && state.mode === "map";
    if (!media || !data) { note.hidden = true; note.textContent = ""; return; }
    const isos = measuredIsos();
    if (!isos.length) { note.hidden = true; note.textContent = ""; return; }
    const names = isos.map(subjectCountryName);
    const n = isos.length;
    const text = window.tPlural
      ? window.tPlural("media.map_note", n, { country: names[0], list: listNames(names) })
      : t(n === 1 ? "map_note_one" : "map_note_other", { country: names[0], list: listNames(names), n });
    note.textContent = "(" + text + ")";
    note.hidden = false;
    requestAnimationFrame(function () {
      if (typeof window.refitWorldIfMin === "function") window.refitWorldIfMin();
    });
  }

  function mediaTooltipHtml(iso, name) {
    const st = mediaStateFor(iso);
    const display = esc(name || countryName(iso));
    if (st.status === "out") {
      return `<div class="tt-title">${display}</div><div class="tt-status">${esc(t("legend_out"))}</div>`;
    }
    if (st.status === "pending") {
      const comp = st.completeness != null
        ? `<div style="margin-top:4px">${esc(t("tt_completeness", { score: fmt(st.completeness) }))}</div>` : "";
      return `<div class="tt-title">${display}</div><div class="tt-status"><span class="swatch" style="background:#e6e8eb"></span>${esc(t("tt_pending"))}</div>${comp}`;
    }
    if (st.status === "draft" && audit()) {
      const a = audit();
      const label = state.label === "antiblack" ? t("index_antiblack") : t("index_antiwhite");
      const lines = [
        `<div class="tt-title">${display}</div>`,
        `<div class="tt-status"><span class="swatch" style="background:${DRAFT_MAP_COLOR}"></span>${esc(t("tt_draft_index", { label, m: auditMultiplier(), sig: auditSig() }))}</div>`,
        `<div style="margin-top:4px">${esc(t("tt_draft_interval", { interval: auditSignedInterval() }))}</div>`,
        `<div style="margin-top:4px">${esc(t("tt_draft_counts", {
          w: fmt(a.n_covered_W), mw: fmt(a.n_sampled_W),
          b: fmt(a.n_covered_B), mb: fmt(a.n_sampled_B),
          pooled: fmt(a.n_covered), n: fmt(a.n_sampled)
        }))}</div>`,
        `<div style="margin-top:4px">${esc(t("tt_draft_sample", { n: fmt(a.n_sampled), start: a.date_start, end: a.date_end }))}</div>`,
        st.completeness != null ? `<div style="margin-top:4px">${esc(t("tt_completeness", { score: fmt(st.completeness) }))}</div>` : ""
      ];
      return lines.join("");
    }
    const flip = state.label === "antiblack";
    const m = fmtMult(st.bound, { flip, asBound: true });
    const lean = flip ? t("lean_antiblack") : t("lean_antiwhite");
    const boundLine = t("tt_insufficient_bound", {
      m,
      lean,
      zero: st.zero_of_n,
      unit: unitName(st.unit),
      direction: directionName(st.zero_direction)
    });
    const sig = significanceText(st);
    const stories = st.stories || {};
    const fill = (window.HarmMap && typeof window.HarmMap.colorFor === "function")
      ? window.HarmMap.colorFor(iso)
      : "#0cc0df";
    const lines = [
      `<div class="tt-title">${display}</div>`,
      `<div class="tt-status"><span class="swatch hatch" style="background-color:${esc(fill)}"></span>${esc(boundLine)}</div>`,
      sig ? `<div style="margin-top:4px">${esc(sig)}</div>` : "",
      st.completeness != null ? `<div style="margin-top:4px">${esc(t("tt_completeness", { score: fmt(st.completeness) }))}</div>` : "",
      (st.start && st.end) ? `<div style="margin-top:4px">${esc(t("tt_sample", { n: fmt(st.incidents), start: st.start, end: st.end }))}</div>` : "",
      `<div style="margin-top:4px">${esc(t("tt_counts", { w: fmt(stories.W_on_B), b: fmt(stories.B_on_W), o: fmt(stories.other) }))}</div>`
    ];
    return lines.join("");
  }
  window.mediaTooltipHtml = mediaTooltipHtml;

  // ---------- Controls ----------
  function orderedCountryIsos(isos) {
    const nameFn = countryName;
    if (window.orderCountryIsos) return window.orderCountryIsos(isos, nameFn, locale());
    const pinnedIsos = (window.PINNED_COUNTRY_ISOS && window.PINNED_COUNTRY_ISOS.slice()) || ["USA", "GBR", "FRA", "DEU", "ESP", "ITA", "RUS"];
    const set = new Set(isos);
    const pinned = pinnedIsos.filter(iso => set.has(iso));
    const rest = isos.filter(iso => !pinnedIsos.includes(iso))
      .sort((a, b) => nameFn(a).localeCompare(nameFn(b), locale()));
    return { pinned, rest };
  }

  function countrySelectHtml(id) {
    const opts = ["<option value=\"\">" + esc(t("select_country")) + "</option>"];
    const { pinned, rest } = orderedCountryIsos(detailedList());
    const opt = iso => {
      const sel = iso === state.selected ? " selected" : "";
      return `<option value="${esc(iso)}"${sel}>${esc(countryName(iso))}</option>`;
    };
    pinned.forEach(iso => opts.push(opt(iso)));
    if (pinned.length && rest.length) {
      opts.push(`<option disabled value="" class="country-sep">────────</option>`);
    }
    rest.forEach(iso => opts.push(opt(iso)));
    return `<div class="media-country-row">
      <label for="${id}">${esc(t("country_picker"))}</label>
      <select id="${id}" aria-label="${esc(t("country_picker_aria"))}">${opts.join("")}</select>
    </div>`;
  }

  function bindCountrySelect(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("change", () => {
      const iso = el.value || null;
      state.selected = iso;
      if (iso && window.HarmMap) window.HarmMap.selectCountry(iso);
      else if (!iso && window.HarmMap) window.HarmMap.clearSelection();
      render();
    });
  }

  function resultsHtml() {
    if (!state.selected) {
      return `<p class="hint">${esc(t("map_hint"))}</p>`;
    }
    const st = mediaStateFor(state.selected);
    const indexLabel = state.label === "antiblack" ? t("index_antiblack") : t("index_antiwhite");
    const toggleLabel = state.label === "antiblack" ? t("toggle_to_antiwhite") : t("toggle_to_antiblack");
    const signHint = state.label === "antiblack" ? t("signed_minus_hint") : t("signed_plus_hint");
    const score = st.completeness;
    const scoreText = score != null ? fmt(score) : t("completeness_none");
    const eeRow = `<div class="mv-stat-ee" id="mv-ee-stat">
        <div class="mv-stat-label">${esc(t("col_ee_index"))}${approxBadge(state.selected)}</div>
        <p class="mv-stat-value mv-stat-value-sm">${esc(t("pending"))}</p>
        <p class="mv-stat-hint">${esc(t("ee_row_desc"))}</p>
      </div>`;
    const usaAudit = state.selected === "USA" && audit();
    let indexBlock;
    if (usaAudit) {
      const h = auditHeadline();
      const pilot = keywordHeadline();
      const pilotCi = ciText(usa() || {});
      indexBlock = `<div class="mv-index-col">
        <h3 class="mv-h mv-audit-head" id="mv-audit-h">${esc(t("audit_h"))}</h3>
        <p class="mv-desc" id="mv-audit-desc">${esc(t("audit_desc", { n: fmt(audit().n_sampled_W) }))}</p>
        <div class="mv-stat" id="mv-index-stat">
          <div class="mv-stat-label" id="mv-index-label">${esc(indexLabel)}</div>
          <p class="mv-stat-value" id="mv-index-value">${esc(h.text)} <span class="badge mv-badge mv-badge-draft" id="mv-draft-badge">${esc(t("badge_draft"))}</span></p>
          <div class="mv-stat-sub" id="mv-audit-counts">${esc(h.counts)}</div>
          <div class="mv-stat-sub" id="mv-ci95">${esc(t("audit_ci_signed", { interval: h.interval }))}</div>
          <div class="mv-stat-sub" id="mv-audit-sig">${esc(h.sub)}</div>
          <p class="mv-stat-hint">${esc(signHint)}</p>
          <button type="button" class="mv-toggle" id="mv-sign-toggle">${esc(toggleLabel)}</button>
          <div class="mv-earlier" id="mv-pilot-earlier">
            <h3 class="mv-h" id="mv-pilot-h">${esc(t("pilot_earlier_h"))}</h3>
            <p class="mv-desc">${esc(t("pilot_earlier_desc"))}</p>
            <p class="mv-stat-value mv-stat-value-sm" id="mv-pilot-value">${esc(pilot.text)}</p>
            ${pilot.zero ? `<div class="mv-stat-sub" id="mv-pilot-zero">${esc(pilot.zero)}</div>` : ""}
            ${pilotCi ? `<div class="mv-stat-sub" id="mv-pilot-ci">${esc(pilotCi)}</div>` : ""}
            ${pilot.sub ? `<div class="mv-stat-sub" id="mv-pilot-sig">${esc(pilot.sub)}</div>` : ""}
          </div>
          ${eeRow}
        </div>
      </div>`;
    } else if (state.selected === "USA") {
      const h = keywordHeadline();
      const rec = usa() || {};
      const zeroLine = h.zero ? `<div class="mv-stat-sub">${esc(h.zero)}</div>` : "";
      const ciLine = rec.ci95_low != null ? `<div class="mv-stat-sub" id="mv-ci95">${esc(ciText(rec))}</div>` : "";
      indexBlock = `<div class="mv-stat" id="mv-index-stat">
        <div class="mv-stat-label" id="mv-index-label">${esc(indexLabel)}</div>
        <p class="mv-stat-value" id="mv-index-value">${esc(h.text)}</p>
        ${zeroLine}
        ${ciLine}
        ${h.sub && h.sub !== h.zero ? `<div class="mv-stat-sub">${esc(h.sub)}</div>` : ""}
        <p class="mv-stat-hint">${esc(signHint)}</p>
        <button type="button" class="mv-toggle" id="mv-sign-toggle">${esc(toggleLabel)}</button>
        ${eeRow}
      </div>`;
    } else {
      indexBlock = `<div class="mv-stat" id="mv-index-stat">
        <div class="mv-stat-label" id="mv-index-label">${esc(indexLabel)}</div>
        <p class="mv-stat-value" id="mv-index-value">${esc(t("pending"))}</p>
        <p class="mv-stat-hint">${esc(t("pending_hint"))}</p>
        ${eeRow}
      </div>`;
    }
    return `<div class="mv-results" id="mv-results">
      ${indexBlock}
      <div class="mv-stat" id="mv-completeness-stat">
        <div class="mv-stat-label">${esc(t("completeness"))}</div>
        <p class="mv-stat-value" id="mv-completeness-value">${esc(scoreText)}</p>
        <p class="mv-stat-hint">${esc(t("completeness_desc"))}</p>
      </div>
    </div>
    ${state.selected === "USA" ? `<button type="button" class="mv-details-btn" id="mv-details-btn" aria-expanded="${state.details}">${esc(state.details ? t("details_hide") : t("details_btn"))}</button>` : ""}`;
  }

  function bindResults() {
    const tog = document.getElementById("mv-sign-toggle");
    if (tog) tog.addEventListener("click", () => {
      state.label = state.label === "antiwhite" ? "antiblack" : "antiwhite";
      render();
    });
    const det = document.getElementById("mv-details-btn");
    if (det) det.addEventListener("click", () => {
      state.details = !state.details;
      render();
      if (state.details) {
        const el = document.getElementById("mv-details");
        if (el) el.scrollIntoView({ block: "start", behavior: "smooth" });
      }
    });
  }

  function ruleToggle() {
    return `<div class="mv-rules" role="group" aria-label="${esc(t("rule_label"))}" id="mv-rules">
      <button type="button" data-rule="strict" aria-pressed="${state.rule === "strict"}">${esc(t("rule_strict"))}</button>
      <button type="button" data-rule="broad" aria-pressed="${state.rule === "broad"}">${esc(t("rule_broad"))}</button>
    </div>
    <p class="ex-small">${esc(state.rule === "broad" ? t("rule_broad_hint") : t("rule_strict_hint"))}</p>`;
  }

  function boundCell(zeroOfN, boundObj) {
    if (!zeroOfN) return `<span class="mv-null">${esc(t("pending_outlet"))}</span>`;
    const flip = state.label === "antiblack";
    const disp = boundObj && boundObj.cdi_lower_display;
    const m = disp != null ? fmtMult(disp, { flip, asBound: true }) : null;
    const at = m ? t("at_least", { m }) : "";
    return `<span>${esc(zeroOfN)}</span>${at ? `<span class="mv-why">${esc(at)}</span>` : ""}`;
  }

  function outletTable() {
    if (!data) return "";
    const rows = data.summary.by_outlet_year.filter(r => r.year === 2023 && r.rule_set === state.rule);
    const head = `<tr>
      <th scope="col">${esc(t("col_outlet"))}</th>
      <th scope="col" class="num" title="${esc(t("col_total_hint"))}">${esc(t("col_total"))}</th>
      <th scope="col" class="num" title="${esc(t("col_coded_hint"))}">${esc(t("col_coded"))}</th>
      <th scope="col" class="num">${esc(t("col_wb"))}</th>
      <th scope="col" class="num">${esc(t("col_bw"))}</th>
      <th scope="col" class="num">${esc(t("col_other"))}</th>
      <th scope="col">${esc(t("col_index_outlet"))}</th>
      <th scope="col">${esc(t("col_zero"))}</th></tr>`;
    const body = rows.map(r => {
      const status = r.coded_sample_n === 0 ? `<span class="status not_recorded">${esc(t("not_coded"))}</span>`
        : (r.coding_complete === false ? `<span class="status not_published">${esc(t("coding_incomplete"))}</span>` : "");
      const coded = r.sample_n != null ? t("of", { a: fmt(r.coded_sample_n), b: fmt(r.sample_n) }) : fmt(r.coded_sample_n);
      return `<tr data-outlet="${esc(r.outlet)}">
        <th scope="row" data-label="${esc(t("col_outlet"))}">${esc(r.outlet_name || r.outlet)}${status ? "<br>" + status : ""}</th>
        <td class="num" data-label="${esc(t("col_total"))}">${fmt(r.stories_total)}</td>
        <td class="num" data-label="${esc(t("col_coded"))}">${esc(coded)}</td>
        <td class="num" data-label="${esc(t("col_wb"))}">${fmt(r.stories_W_on_B)}</td>
        <td class="num" data-label="${esc(t("col_bw"))}">${fmt(r.stories_B_on_W)}</td>
        <td class="num" data-label="${esc(t("col_other"))}">${fmt(r.stories_other)}</td>
        <td data-label="${esc(t("col_index_outlet"))}"><span class="mv-null">${esc(t("pending_outlet"))}</span></td>
        <td data-label="${esc(t("col_zero"))}">${boundCell(r.zero_of_n_stories, r.stories_bound)}</td>
      </tr>`;
    }).join("");
    return `<div class="mv-table-wrap"><table class="mv-table" id="mv-outlets"><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
  }

  function shrTable() {
    const shr = data && data.shr;
    const y = shr && (shr.years || []).find(r => r.year === 2023);
    if (!y) return "";
    const w = y.directions.W_on_B;
    const b = y.directions.B_on_W;
    const src = `${esc(y.table)}, ${esc(y.subset)}`;
    const link = y.source_url ? `<a href="${esc(y.source_url)}" target="_blank" rel="noopener">${esc(y.workbook || y.table)}</a>${enOnlyBadge()}` : esc(y.table);
    return `<div class="mv-table-wrap"><table class="mv-table" id="mv-shr">
      <thead><tr>
        <th scope="col">${esc(t("col_direction"))}</th>
        <th scope="col" class="num">${esc(t("col_raw"))}</th>
        <th scope="col">${esc(t("col_percapita"))}</th>
        <th scope="col">${esc(t("col_source"))}</th>
      </tr></thead>
      <tbody>
        <tr><th scope="row" data-label="${esc(t("col_direction"))}">${esc(t("dir_wb"))}</th>
          <td class="num" data-label="${esc(t("col_raw"))}">${fmt(w.count)}</td>
          <td data-label="${esc(t("col_percapita"))}"><span class="mv-null">${esc(t("percapita_pending"))}</span></td>
          <td data-label="${esc(t("col_source"))}">${link}<span class="mv-why">${src}</span></td></tr>
        <tr><th scope="row" data-label="${esc(t("col_direction"))}">${esc(t("dir_bw"))}</th>
          <td class="num" data-label="${esc(t("col_raw"))}">${fmt(b.count)}</td>
          <td data-label="${esc(t("col_percapita"))}"><span class="mv-null">${esc(t("percapita_pending"))}</span></td>
          <td data-label="${esc(t("col_source"))}">${link}<span class="mv-why">${src}</span></td></tr>
      </tbody></table></div>`;
  }

  function ncvsTable(b) {
    const byYear = {};
    b.rows.forEach(r => { (byYear[r.year] = byYear[r.year] || {})[r.offender_race + ">" + r.victim_race] = r; });
    const status = {}; (b.years_status || []).forEach(s => { status[s.year] = s; });
    const cell = (r, victimKey) => {
      if (!r) return "—";
      if (r.count != null) return `${fmt(r.count)}<span class="mv-why">${esc(t("se", { se: fmt(r.se) }))}</span>`;
      if (r.pct != null) return `<span class="mv-null">${esc(t("pct_only", { p: Number(r.pct).toLocaleString(locale()), v: t(victimKey) }))}</span>`;
      return `<span class="mv-null">${esc(t("not_published"))}</span>`;
    };
    const years = Object.keys(byYear).map(Number).sort();
    const rows = years.map(y => {
      const s = status[y] || {}; const src = s.source || {};
      const page = src.table_pdf_page ? " (" + t("table_p", { p: src.table_pdf_page }) + ")" : "";
      const badge = enOnlyBadge();
      const link = src.pdf_url ? `<a href="${esc(src.pdf_url)}" target="_blank" rel="noopener">${esc(src.report || src.pdf_url)}</a>${badge}${src.table ? `<span class="mv-why">${esc(src.table + page)}${src.se_table ? "; SE: " + esc(src.se_table) : ""}</span>` : `<span class="mv-why">${esc(t("not_published"))}</span>`}` : "—";
      return `<tr data-year="${y}"><th scope="row" data-label="${esc(t("col_year"))}">${y}</th>
        <td class="num" data-label="${esc(t("col_bwi"))}">${cell(byYear[y]["Black>White"], "victims_white")}</td>
        <td class="num" data-label="${esc(t("col_wbi"))}">${cell(byYear[y]["White>Black"], "victims_black")}</td>
        <td data-label="${esc(t("col_source"))}">${link}</td></tr>`;
    }).join("");
    return `<div class="mv-table-wrap"><table class="mv-table" id="mv-baseline"><thead><tr><th scope="col">${esc(t("col_year"))}</th>
      <th scope="col" class="num">${esc(t("col_bwi"))}</th><th scope="col" class="num">${esc(t("col_wbi"))}</th>
      <th scope="col">${esc(t("col_source"))}</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  function storiesTable() {
    const rb = ruleBlock();
    const list = (rb && rb.included_story_list) || [];
    const dirLabel = d => d === "W_on_B" ? t("dir_wb") : d === "B_on_W" ? t("dir_bw") : t("dir_other");
    const how = r => {
      const bits = [];
      if (r.headline_mentions_race === "yes") bits.push("headline");
      if (r.first_mention_feature) bits.push(r.first_mention_feature);
      if (r.first_mention_para) bits.push("para " + r.first_mention_para);
      return bits.join(", ") || "—";
    };
    const body = list.map(r => `<tr>
      <th scope="row" data-label="${esc(t("col_headline"))}"><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.headline)}</a></th>
      <td data-label="${esc(t("col_outlet"))}">${esc(r.outlet)}</td>
      <td data-label="${esc(t("col_date"))}">${esc(r.date)}</td>
      <td data-label="${esc(t("col_direction"))}">${esc(dirLabel(r.direction))}</td>
      <td data-label="${esc(t("col_how_stated"))}">${esc(how(r))}${enOnlyBadge()}</td>
    </tr>`).join("");
    return `<div class="mv-table-wrap"><table class="mv-table" id="mv-stories"><thead><tr>
      <th scope="col">${esc(t("col_headline"))}</th><th scope="col">${esc(t("col_outlet"))}</th>
      <th scope="col">${esc(t("col_date"))}</th><th scope="col">${esc(t("col_direction"))}</th>
      <th scope="col">${esc(t("col_how_stated"))}</th>
    </tr></thead><tbody>${body}</tbody></table></div>`;
  }

  function homicideBlock() {
    const rb = ruleBlock();
    if (!rb) return "";
    const h = rb.homicide_vs_shr || {};
    const sv = h.like_for_like_svso_2023 || {};
    const st = h.stories || {};
    const inc = h.incidents || {};
    const stBound = boundCell(st.zero_of_n, st.cdi_lower_bound);
    const incBound = boundCell(inc.zero_of_n, inc.cdi_lower_bound);
    return `<div class="mv-table-wrap"><table class="mv-table" id="mv-homicide">
      <thead><tr>
        <th scope="col">${esc(t("col_pairing"))}</th>
        <th scope="col">${esc(t("col_wb"))}</th>
        <th scope="col">${esc(t("col_bw"))}</th>
        <th scope="col">${esc(t("col_zero"))}</th>
      </tr></thead>
      <tbody>
        <tr><th scope="row">${esc(sv.descriptor || "SV/SO 2023")}${enOnlyBadge()}</th>
          <td class="num">${esc(sv.W_on_B_of || "")}</td>
          <td class="num">${esc(sv.B_on_W_of || "")}</td>
          <td>—</td></tr>
        <tr><th scope="row">${esc(t("unit_stories"))}</th>
          <td class="num">${fmt(st.W_on_B)}</td><td class="num">${fmt(st.B_on_W)}</td>
          <td>${stBound}</td></tr>
        <tr><th scope="row">${esc(t("unit_incidents"))}</th>
          <td class="num">${fmt(inc.W_on_B)}</td><td class="num">${fmt(inc.B_on_W)}</td>
          <td>${incBound}</td></tr>
      </tbody></table></div>
      <p class="ex-small">${esc(h.caveat || "")}${enOnlyBadge()}</p>`;
  }

  function eeBaselineHtml() {
    const b = (usa() || {}).euro_baseline;
    if (!b) return "";
    const ratio = b.ratio == null ? "—" : Number(b.ratio).toLocaleString(locale(), { minimumFractionDigits: 3, maximumFractionDigits: 3 });
    const unit = t("ee_baseline_unit");
    return `<h3 class="mv-h ex-kicker mv-section" id="mv-ee-baseline-h">${esc(t("ee_baseline_h"))}</h3>
      <p class="mv-desc">${esc(t("ee_baseline_desc"))}</p>
      <div class="mv-table-wrap"><table class="mv-table" id="mv-ee-baseline">
        <tbody>
          <tr><th scope="row">${esc(t("ee_baseline_ne_on_e"))}</th><td class="num">${esc(fmt(b.non_european_on_european))} ${esc(unit)}</td></tr>
          <tr><th scope="row">${esc(t("ee_baseline_e_on_ne"))}</th><td class="num">${esc(fmt(b.european_on_non_european))} ${esc(unit)}</td></tr>
          <tr><th scope="row">${esc(t("ee_baseline_ratio"))}</th><td class="num">${esc(ratio)}</td></tr>
        </tbody>
      </table></div>`;
  }

  function auditOutletTable(a) {
    const head = `<tr>
      <th scope="col">${esc(t("col_outlet"))}</th>
      <th scope="col" class="num">${esc(t("col_stories_wb"))}</th>
      <th scope="col" class="num">${esc(t("col_stories_bw"))}</th>
      <th scope="col" class="num">${esc(t("col_cases_wb"))}</th>
      <th scope="col" class="num">${esc(t("col_cases_bw"))}</th>
      <th scope="col">${esc(t("col_index_outlet"))}</th>
      <th scope="col">${esc(t("col_zero"))}</th></tr>`;
    const body = (a.outlets || []).map(r => {
      const casesW = t("of", { a: fmt(r.cases_W_on_B), b: fmt(r.n_sampled) });
      const casesB = t("of", { a: fmt(r.cases_B_on_W), b: fmt(r.n_sampled) });
      const zero = r.zero_cell
        ? `<span id="mv-zero-${esc(r.outlet)}">${esc(r.zero_of_n)}</span><span class="mv-why">${esc(t("cp_upper", { pct: r.coverage_upper_display }))}</span>`
        : "—";
      return `<tr data-outlet="${esc(r.outlet)}">
        <th scope="row" data-label="${esc(t("col_outlet"))}">${esc(r.outlet_name)}</th>
        <td class="num" data-label="${esc(t("col_stories_wb"))}">${fmt(r.stories_W_on_B)}</td>
        <td class="num" data-label="${esc(t("col_stories_bw"))}">${fmt(r.stories_B_on_W)}</td>
        <td class="num" data-label="${esc(t("col_cases_wb"))}">${esc(casesW)}</td>
        <td class="num" data-label="${esc(t("col_cases_bw"))}">${esc(casesB)}</td>
        <td data-label="${esc(t("col_index_outlet"))}"><span class="mv-null">${esc(t("pending_outlet"))}</span></td>
        <td data-label="${esc(t("col_zero"))}">${zero}</td>
      </tr>`;
    }).join("");
    return `<div class="mv-table-wrap"><table class="mv-table" id="mv-audit-outlets"><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
  }

  function sensTable(a) {
    const body = (a.sensitivities || []).map(r => `<tr>
      <th scope="row" data-label="${esc(t("col_pairing"))}">${esc(t("sens_" + r.id))}</th>
      <td class="num" data-label="${esc(t("dir_wb"))}">${esc(r.w)}</td>
      <td class="num" data-label="${esc(t("dir_bw"))}">${esc(r.b)}</td>
    </tr>`).join("");
    return `<div class="mv-table-wrap"><table class="mv-table" id="mv-sens"><thead><tr>
      <th scope="col">${esc(t("col_pairing"))}</th>
      <th scope="col" class="num">${esc(t("dir_wb"))}</th>
      <th scope="col" class="num">${esc(t("dir_bw"))}</th>
    </tr></thead><tbody>${body}</tbody></table></div>`;
  }

  function auditDetailsHtml(a) {
    const stats = t("audit_stats", {
      qw: a.q_W_display,
      qb: a.q_B_display,
      ratio: a.rate_ratio_display,
      odds: a.odds_ratio_display,
      p2: a.p_two_sided_detail,
      p1: a.p_one_sided_detail,
      or_low: a.ci95_low_display,
      or_high: a.ci95_high_display,
      or_low_r: a.ci95_low_rounded,
      or_high_r: a.ci95_high_rounded,
      signed: auditSignedInterval()
    });
    return `<h3 class="mv-h" id="mv-audit-method-h">${esc(t("audit_method_h"))}</h3>
      <p class="mv-desc">${esc(t("audit_method_desc"))}</p>
      <h3 class="mv-h" id="mv-audit-sample-h">${esc(t("audit_sample_h"))}</h3>
      <p class="mv-desc" id="mv-audit-sample">${esc(t("audit_sample_desc", {
        n: fmt(a.n_sampled),
        mw: fmt(a.n_sampled_W),
        mb: fmt(a.n_sampled_B),
        stories: fmt(a.stories_n),
        sw: fmt(a.stories_W_on_B),
        sb: fmt(a.stories_B_on_W),
        dom: fmt(a.dominant_case_stories)
      }))}</p>
      <p class="ex-small" id="mv-audit-stats">${esc(stats)}</p>
      <h3 class="mv-h ex-kicker" id="mv-audit-outlets-h">${esc(t("audit_outlets_h"))}</h3>
      <p class="mv-desc">${esc(t("audit_outlets_desc"))}</p>
      ${auditOutletTable(a)}
      <h3 class="mv-h ex-kicker mv-section" id="mv-sens-h">${esc(t("sens_h"))}</h3>
      <p class="mv-desc">${esc(t("sens_desc"))}</p>
      ${sensTable(a)}`;
  }

  function detailsHtml() {
    if (!state.details || state.selected !== "USA" || !data) return "";
    const s = data.summary;
    const rb = ruleBlock();
    const badge = enOnlyBadge();
    const mixed = rb && rb.mixed_vs_ncvs;
    const a = audit();
    const notice = s.pilot_notice ? `<p class="mv-pilot" id="mv-pilot" role="note">${esc(s.pilot_notice)}${badge}</p>` : "";
    const gaps = (s.data_gaps || []).map(g => {
      if (a && g.topic === "Incident-based sample") {
        return `<li><b>${esc(t("gap_audit_topic"))}:</b> ${esc(t("gap_audit_reason"))}</li>`;
      }
      return `<li><b>${esc(g.topic)}:</b> ${esc(g.reason)}</li>`;
    }).join("");
    return `<section id="mv-details">
      ${a ? auditDetailsHtml(a) : ""}
      <h3 class="mv-h ex-kicker mv-section">${esc(t("baseline_shr_h"))}</h3>
      <p class="mv-desc">${esc(t("baseline_shr_desc"))}</p>
      ${a ? `<p class="ex-small" id="mv-audit-shr-note">${esc(t("audit_shr_note"))}</p>` : ""}
      ${shrTable()}
      <h3 class="mv-h ex-kicker mv-section">${esc(t("baseline_ncvs_h"))}</h3>
      <p class="mv-desc">${esc(t("baseline_ncvs_desc"))}</p>
      ${ncvsTable(data.baseline)}
      <p class="ex-small">${esc(t("baseline_comp"))}</p>
      ${eeBaselineHtml()}
      ${a ? `<h3 class="mv-h ex-kicker mv-section" id="mv-pilot-details-h">${esc(t("pilot_earlier_h"))}</h3>
      <p class="mv-desc">${esc(t("pilot_earlier_desc"))}</p>
      ${notice}` : notice}
      <h3 class="mv-h" id="mv-method-note-h">${esc(t("method_note_h"))}</h3>
      <p class="mv-desc">${esc(t("method_note_desc"))}</p>
      <p class="ex-small">${esc(t("pairing"))}</p>
      ${ruleToggle()}
      <h3 class="mv-h">${esc(t("sample_h"))}</h3>
      <p class="mv-desc">${esc(t("sample_desc"))}</p>
      <p>${esc(t("sample_stories", { n: fmt(rb.included_stories) }))} · ${esc(t("sample_incidents", { n: fmt(rb.included_incidents) }))}</p>
      <p class="ex-small">${esc(t("date_range", { start: rb.date_start, end: rb.date_end }))}</p>
      <p class="mv-pilot" role="note">${esc(t("frame_caveat"))}</p>
      ${mixed ? `<p class="ex-small">${esc(mixed.stories.zero_of_n)} ${esc(t("unit_stories"))}: ${esc(t("at_least", { m: fmtMult((mixed.stories.cdi_lower_bound || {}).cdi_lower_display, { flip: state.label === "antiblack", asBound: true }) }))};
        ${esc(mixed.incidents.zero_of_n)} ${esc(t("unit_incidents"))}: ${esc(t("at_least", { m: fmtMult((mixed.incidents.cdi_lower_bound || {}).cdi_lower_display, { flip: state.label === "antiblack", asBound: true }) }))}.</p>` : ""}
      <h3 class="mv-h ex-kicker">${esc(t("outlets_h"))}</h3>
      <p class="mv-desc">${esc(t("outlets_desc"))}</p>
      ${outletTable()}
      ${homicideBlock()}
      <h3 class="mv-h ex-kicker mv-section">${esc(t("disclosure_h"))}</h3>
      <p class="mv-desc">${esc(t("disclosure_desc"))}</p>
      <p>${esc(t("disclosure_pending"))}</p>
      <h3 class="mv-h ex-kicker mv-section">${esc(t("stories_h"))}</h3>
      <p class="mv-desc">${esc(t("stories_desc"))}</p>
      ${storiesTable()}
      <h3 class="ex-kicker mv-section" id="mv-gaps-h">${esc(t("gaps_h"))}${badge}</h3>
      <ul class="mv-gaps" id="mv-gaps">${gaps}</ul>
      <details class="method" open><summary>${esc(t("method_h"))}${badge}</summary>
        <h4 class="mv-explain" style="margin-top:12px">${esc(t("methods_cdi_h"))}</h4>
        <p>${esc(t("methods_cdi"))}</p>
        <ul>${(s.judgement_calls || []).filter(j => j.indexOf("29.4") === -1 && j.indexOf("16.3") === -1).map(j => `<li>${esc(j)}</li>`).join("")}</ul>
        <p class="ex-small">${esc(t("generated", { d: s.generated, s: s.script }))}</p>
        ${a ? `<p class="ex-small">${esc(t("audit_generated", { d: a.computed_at, s: a.script }))}</p>` : ""}
      </details>
      ${sourcesHtml()}
    </section>`;
  }

  function sourcesHtml() {
    const s = data.summary;
    const badge = enOnlyBadge();
    const b = data.baseline;
    const storyLinks = (s.story_files || []).map(f => {
      const key = /broad/.test(f) ? "src_stories_broad" : "src_stories";
      const y = (f.match(/\d{4}/) || ["2023"])[0];
      return `<li><a href="${REPO_BLOB}${esc(f)}" target="_blank" rel="noopener">${esc(t(key, { year: y }))}</a></li>`;
    }).join("");
    return `<div class="mv-sources" id="mv-sources"><h3>${esc(t("sources_h"))}</h3><ul>
      ${storyLinks}
      <li><a href="${REPO_BLOB}summary.json" target="_blank" rel="noopener">${esc(t("src_summary"))}</a></li>
      ${audit() ? `<li><a href="${REPO_BLOB}summary_audit_homicide_draft.json" target="_blank" rel="noopener">${esc(t("src_audit"))}</a></li>` : ""}
      <li><a href="${REPO_BLOB}baseline_ncvs.json" target="_blank" rel="noopener">${esc(t("src_baseline"))}</a></li>
      <li><a href="${REPO_BLOB}baseline_shr.json" target="_blank" rel="noopener">${esc(t("src_baseline_shr"))}</a></li>
      <li><a href="${REPO_BLOB}incidents_2023.json" target="_blank" rel="noopener">${esc(t("src_incidents"))}</a></li>
      <li><a href="${REPO_BLOB}README.md" target="_blank" rel="noopener">${esc(t("src_scripts"))}</a></li>
      <li><a href="${esc((b.source && b.source.url) || "https://bjs.ojp.gov/")}" target="_blank" rel="noopener">${esc((b.source && b.source.name) || "BJS NCVS")}</a>${badge}</li>
      <li><a href="https://search.mediacloud.org/" target="_blank" rel="noopener">${esc(t("src_mediacloud"))}</a></li>
    </ul></div>`;
  }

  function countryRows() {
    const rows = detailedList().map(iso => {
      const st = mediaStateFor(iso);
      const name = countryName(iso);
      let indexText, indexSort, indexHtml;
      if (iso === "USA" && audit()) {
        const h = auditHeadline();
        indexText = [h.text, t("badge_draft"), h.sub, h.interval].filter(Boolean).join(" · ");
        indexHtml = esc(indexText);
        indexSort = Number(audit().rate_ratio) || 0;
      } else if (iso === "USA" && usa()) {
        const h = keywordHeadline();
        indexText = [h.zero, h.text, significanceText(Object.assign({}, pref(), usa() || {}))].filter(Boolean).join(" · ");
        indexHtml = esc(indexText) + approxBadge(iso);
        indexSort = (pref() && pref().index_lower_display) || 0;
      } else {
        indexText = t("pending");
        indexHtml = esc(indexText);
        indexSort = -1;
      }
      const aud = iso === "USA" ? audit() : null;
      const rb = iso === "USA" ? ruleBlock() : null;
      const stories = rb && rb.mixed_vs_ncvs && rb.mixed_vs_ncvs.stories;
      const dirs = aud
        ? `${aud.n_covered_W} / ${aud.n_covered_B}`
        : (stories ? `${stories.W_on_B} / ${stories.B_on_W} / ${stories.other}` : "—");
      return {
        iso, name,
        indexText, indexSort,
        sample: st.incidents != null ? st.incidents : null,
        completeness: st.completeness,
        dates: (st.start && st.end) ? `${st.start} – ${st.end}` : "—",
        dirs,
        baseline: aud ? t("audit_sources_baseline") : (iso === "USA" ? "NCVS 2023; FBI SHR Table 6 2023" : "—"),
        outlets: iso === "USA" ? (usa().outlet_names || []).join(", ") : "—",
        rule: aud ? t("audit_sources_rule") : (iso === "USA" ? t(state.rule === "broad" ? "rule_broad" : "rule_strict") : "—"),
        pairing: aud ? t("audit_sources_pairing") : (iso === "USA" ? t("pairing") : "—"),
        eeText: t("pending"),
        eeHtml: esc(t("pending")) + (iso === "USA" ? approxBadge(iso) : ""),
        indexHtml
      };
    });
    const key = state.sortKey;
    const dir = state.sortDir;
    const val = r => {
      if (key === "index") return r.indexSort;
      if (key === "sample") return r.sample == null ? -1 : r.sample;
      if (key === "completeness") return r.completeness == null ? -1 : r.completeness;
      if (key === "dates") return r.dates;
      return r.name;
    };
    rows.sort((a, b) => {
      const va = val(a), vb = val(b);
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
      return String(va).localeCompare(String(vb), locale()) * dir;
    });
    return rows;
  }

  function comparisonTable() {
    const rows = countryRows();
    const indexView = state.tableView === "index";
    const th = (key, label, cls) =>
      `<th scope="col"${cls ? ` class="${cls}"` : ""} data-sort="${key}">${esc(label)}</th>`;
    let head, body;
    if (indexView) {
      head = `<tr>${th("country", t("col_country"))}${th("index", t("col_index"))}${th("sample", t("col_sample"), "num")}${th("completeness", t("col_completeness"), "num")}${th("ee_index", t("col_ee_index"))}${th("dates", t("col_dates"))}<th scope="col">${esc(t("col_directions"))}</th></tr>`;
      body = rows.map(r => `<tr data-iso="${esc(r.iso)}" class="${r.iso === state.selected ? "is-selected" : ""}">
        <th scope="row" data-label="${esc(t("col_country"))}">${esc(r.name)}</th>
        <td data-label="${esc(t("col_index"))}">${r.indexHtml}</td>
        <td class="num" data-label="${esc(t("col_sample"))}">${r.sample != null ? fmt(r.sample) : "—"}</td>
        <td class="num" data-label="${esc(t("col_completeness"))}">${r.completeness != null ? fmt(r.completeness) : esc(t("completeness_none"))}</td>
        <td data-label="${esc(t("col_ee_index"))}">${r.eeHtml}</td>
        <td data-label="${esc(t("col_dates"))}">${esc(r.dates)}</td>
        <td data-label="${esc(t("col_directions"))}">${esc(r.dirs)}</td>
      </tr>`).join("");
    } else {
      head = `<tr>${th("country", t("col_country"))}<th scope="col">${esc(t("col_baseline"))}</th><th scope="col">${esc(t("col_outlets"))}</th><th scope="col">${esc(t("col_ruleset"))}</th><th scope="col">${esc(t("col_pairing"))}</th></tr>`;
      body = rows.map(r => `<tr data-iso="${esc(r.iso)}" class="${r.iso === state.selected ? "is-selected" : ""}">
        <th scope="row" data-label="${esc(t("col_country"))}">${esc(r.name)}</th>
        <td data-label="${esc(t("col_baseline"))}">${esc(r.baseline)}${r.iso === "USA" && !audit() ? enOnlyBadge() : ""}</td>
        <td data-label="${esc(t("col_outlets"))}">${esc(r.outlets)}</td>
        <td data-label="${esc(t("col_ruleset"))}">${esc(r.rule)}</td>
        <td data-label="${esc(t("col_pairing"))}">${esc(r.pairing)}</td>
      </tr>`).join("");
    }
    return `<div class="mv-table-toolbar">
      <div class="mv-rules" id="mv-table-view" role="group">
        <button type="button" data-tview="index" aria-pressed="${indexView}">${esc(t("table_view_index"))}</button>
        <button type="button" data-tview="sources" aria-pressed="${!indexView}">${esc(t("table_view_sources"))}</button>
      </div>
      <button type="button" class="mv-csv" id="mv-csv">${esc(t("csv_download"))}</button>
    </div>
    <div class="mv-table-wrap"><table class="mv-table" id="mv-countries"><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
  }

  function csvText() {
    const rows = countryRows();
    const cols = ["iso", "name", "indexText", "sample", "completeness", "eeText", "dates", "dirs", "baseline", "outlets", "rule"];
    const header = ["iso", "country", "index", "sample_incidents", "completeness", "ethnic_european_index", "date_range", "stories_wb_bw_other", "baseline", "outlets", "rule_set"];
    const escCell = v => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    return [header.join(","), ...rows.map(r => cols.map(k => escCell(r[k])).join(","))].join("\n");
  }

  function bindTable() {
    const tv = document.getElementById("mv-table-view");
    if (tv) tv.addEventListener("click", e => {
      const b = e.target.closest("button[data-tview]");
      if (!b) return;
      state.tableView = b.dataset.tview;
      render();
    });
    const table = document.getElementById("mv-countries");
    if (table) {
      table.querySelectorAll("th[data-sort]").forEach(th => {
        th.addEventListener("click", () => {
          const k = th.dataset.sort;
          if (state.sortKey === k) state.sortDir *= -1;
          else { state.sortKey = k; state.sortDir = 1; }
          render();
        });
      });
      table.querySelectorAll("tbody tr[data-iso]").forEach(tr => {
        tr.addEventListener("click", () => {
          state.selected = tr.dataset.iso;
          if (window.HarmMap) window.HarmMap.selectCountry(state.selected);
          render();
        });
      });
    }
    const csv = document.getElementById("mv-csv");
    if (csv) csv.addEventListener("click", () => {
      const blob = new Blob([csvText()], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "antiwhite-media-bias-index.csv";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
  }

  function bindDetails() {
    const rules = document.getElementById("mv-rules");
    if (rules) rules.addEventListener("click", e => {
      const b = e.target.closest("button[data-rule]");
      if (!b) return;
      state.rule = b.dataset.rule;
      render();
    });
  }

  // ---------- Panel (map mode) ----------
  function renderPanel() {
    const title = document.getElementById("panel-title");
    const content = document.getElementById("panel-content");
    if (!title || !content) return;
    if (state.selected) title.textContent = countryName(state.selected);
    else title.textContent = t("select_country");
    content.innerHTML = countrySelectHtml("media-country") + resultsHtml();
    bindCountrySelect("media-country");
    bindResults();
  }

  window.renderMediaCountry = function (iso) {
    state.selected = iso;
    if (document.body.classList.contains("media-active")) render();
  };
  window.clearMediaCountry = function () {
    state.selected = null;
    if (document.body.classList.contains("media-active")) render();
  };

  function hatchFillColor() {
    const iso = measuredIsos().find(code => {
      const st = mediaStateFor(code);
      return st && st.L != null;
    });
    if (iso && window.HarmMap && typeof window.HarmMap.colorFor === "function") return window.HarmMap.colorFor(iso);
    if (window.HarmMap && typeof window.HarmMap.colorForL === "function") {
      const flip = state.label === "antiblack";
      return window.HarmMap.colorForL(flip ? -2 : 2);
    }
    return state.label === "antiblack" ? "#a455fe" : "#0cc0df";
  }

  function renderLegend() {
    const el = document.getElementById("legend");
    if (!el || !document.body.classList.contains("media-active")) return;
    const hatchColor = hatchFillColor();
    const showHatch = measuredIsos().some(iso => {
      const st = mediaStateFor(iso);
      return st && (st.status === "bound" || st.status === "insufficient_data");
    });
    const hatchNote = showHatch
      ? `<div class="legend-note"><span class="swatch hatch large" style="background-color:${esc(hatchColor)}"></span><span>${esc(t("legend_hatch_note"))}</span></div>`
      : "";
    el.innerHTML =
      `<div class="legend-title">${esc(t("legend_title"))}</div>
       <div class="legend-scale"><span class="ex-small">${esc(t("legend_minus"))}</span>
         <span class="legend-scale-bar" aria-hidden="true"></span>
         <span class="ex-small">${esc(t("legend_plus"))}</span></div>
       <div class="legend-scale-center"><span class="swatch" style="background:#f7f7f7;box-shadow:inset 0 0 0 1px #d5d8da"></span>${esc(t("legend_center"))}</div>
       <div class="legend-scale-notes">
         ${hatchNote}
         <div class="legend-note" id="mv-legend-draft"><span class="swatch large" style="background:${DRAFT_MAP_COLOR};box-shadow:inset 0 0 0 1px #d5d8da"></span><span>${esc(t("legend_draft"))}</span></div>
         <div class="legend-note"><span class="swatch large" style="background:#e6e8eb;box-shadow:inset 0 0 0 1px #d5d8da"></span><span>${esc(t("legend_pending"))}</span></div>
       </div>
       <div class="legend-items">
         <span class="legend-item subtle"><span class="swatch" style="background:#f4f5f6;box-shadow:inset 0 0 0 1px #d5d8da"></span>${esc(t("legend_out"))}</span>
       </div>`;
  }
  window.renderMediaLegend = renderLegend;

  function findingsHtml() {
    const rec = usa() || {};
    const published = rec.finding_published && rec.significant;
    const conclusions = published
      ? `<h3 class="mv-h" id="mv-findings-h">${esc(t("findings_h"))}</h3>
         <p class="mv-desc" id="mv-findings-body">${esc(significanceText(Object.assign({}, pref() || {}, rec)))}</p>`
      : "";
    return `<section class="mv-findings" id="mv-findings">
      ${conclusions}
      <div class="mv-ee-index" id="mv-ee-index">
        <h3 class="mv-h">${esc(t("ee_index"))}</h3>
        <p class="mv-desc">${esc(t("ee_index_pending"))}</p>
      </div>
    </section>`;
  }

  function render() {
    labelTabs();
    labelModes();
    if (!data) return;
    const s = data.summary;
    const badge = data.audit
      ? `<span class="badge mv-badge mv-badge-draft">${esc(t("badge_draft"))}</span>`
      : (s.pilot_notice ? `<span class="badge mv-badge">${esc(t("badge_pilot"))}</span>` : "");
    const draftNote = data.audit ? `<p class="mv-pilot" id="mv-draft-note" role="note">${esc(t("draft_note"))}</p>` : "";
    const tableBlock = state.mode === "table" ? `
      <h3 class="mv-h" id="mv-table-h">${esc(t("table_h"))}</h3>
      <p class="mv-desc">${esc(t("table_desc"))}</p>
      ${comparisonTable()}` : "";
    const resultsInView = state.mode === "table" ? (countrySelectHtml("media-country-table") + resultsHtml()) : "";
    view.innerHTML = `<div class="mv-inner">
      <div class="ex-head"><h2 id="mv-title">${esc(t("title"))}</h2>${badge}</div>
      <p class="ex-lede">${esc(t("lede"))}</p>
      ${draftNote}
      ${!data.audit && s.pilot_notice ? `<p class="mv-pilot" id="mv-pilot" role="note">${esc(s.pilot_notice)}${enOnlyBadge()}</p>` : ""}
      ${findingsHtml()}
      ${resultsInView}
      ${tableBlock}
      ${detailsHtml()}
    </div>`;
    if (state.mode === "map") renderPanel();
    else {
      bindCountrySelect("media-country-table");
      bindResults();
    }
    if (state.mode === "table") bindTable();
    bindDetails();
    renderLegend();
    updateMapNote();
    if (window.refreshTermTips) window.refreshTermTips();
    if (window.HarmMap) {
      if (window.HarmMap.refreshFill) window.HarmMap.refreshFill();
      else if (window.HarmMap.refreshHatch) window.HarmMap.refreshHatch();
    }
  }

  function load() {
    if (data) return render();
    if (loading) return;
    view.innerHTML = `<div class="mv-inner"><p class="ex-lede">${esc(t("loading"))}</p></div>`;
    const get = u => fetch(u).then(r => { if (!r.ok) throw new Error(u + ": HTTP " + r.status); return r.json(); });
    loading = Promise.all([
      get("data/media/summary.json"),
      get("data/media/baseline_ncvs.json"),
      get("data/media/baseline_shr.json"),
      get("data/index.json"),
      get("data/media/summary_audit_homicide_draft.json")
    ]).then(([summary, baseline, shr, index, auditFile]) => {
      detailed = Array.isArray(index && index.detailed) ? index.detailed.slice() : [];
      data = { summary, baseline, shr, audit: auditFile };
      render();
    })
      .catch(err => {
        console.error(err);
        loading = null;
        view.innerHTML = `<div class="mv-inner"><p class="pending-note">${esc(t("load_error"))}</p></div>`;
      });
  }

  window.renderMediaView = function () {
    labelTabs();
    labelModes();
    if (data && !view.hidden) render();
  };

  function start() {
    labelTabs();
    labelModes();
    show(tabFromHash());
    if (typeof window.playAttentionShimmer === "function") window.playAttentionShimmer();
  }

  const ready = window.I18N_READY || Promise.resolve();
  ready.then(start);
})();
