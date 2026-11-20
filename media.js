// Media coverage view (pilot). Reads data/media/summary.json and data/media/baseline_ncvs.json.
// All user-facing text lives in MEDIA_STRINGS so it can move into the site's i18n files later.
(function () {
  "use strict";

  const MEDIA_STRINGS = {
    en: {
      tab_map: "Map",
      tab_media: "Media coverage",
      tabs_label: "Site sections",
      title: "Media coverage",
      badge_pilot: "Pilot",
      lede: "How often five U.S. news outlets covered White-on-Black versus Black-on-White crime stories, compared with how often each happened according to the government's National Crime Victimization Survey (NCVS). Raw counts are shown beside every index.",
      loading: "Loading media data…",
      load_error: "The media data could not be loaded.",
      outlets_h: "By outlet, {year}",
      col_outlet: "Outlet",
      col_total: "Keyword-matched stories",
      col_total_hint: "Media Cloud hits for the search phrases (volume only, not yet checked for relevance)",
      col_coded: "Coded sample",
      col_coded_hint: "Hand-coded stories of those randomly sampled",
      col_wb: "White-on-Black stories",
      col_bw: "Black-on-White stories",
      col_other: "Other included",
      col_cdi: "Distortion index (CDI)",
      of: "{a} of {b}",
      cdi_null: "Not computed",
      zero_adj: "+0.5 added to both story counts because one is 0",
      calc: "({w} ÷ {b}) ÷ ({nw} ÷ {nb})",
      coding_incomplete: "Coding incomplete",
      not_coded: "Not coded yet",
      cdi_explain_h: "What the index means",
      cdi_explain: "CDI = (outlet's White-on-Black : Black-on-White story ratio) ÷ (NCVS White-on-Black : Black-on-White incident ratio for the same year). 1 means coverage matches the incident ratio; above 1 means relatively more White-on-Black stories; below 1 relatively more Black-on-White stories. With only a handful of coded stories the index is very unstable.",
      ncvs_ratio: "NCVS {year}: {nw} White-on-Black and {nb} Black-on-White violent incidents (ratio {r}).",
      baseline_h: "Government baseline: violent incidents by offender and victim race",
      baseline_lede: "Bureau of Justice Statistics, National Crime Victimization Survey. Nonfatal violent incidents (rape or sexual assault, robbery, aggravated and simple assault); homicide is not covered. White and Black are non-Hispanic. Offender race is the victim's perception. These figures say nothing about motive and are not hate-crime counts.",
      col_year: "Year",
      col_bwi: "Black offender → White victim",
      col_wbi: "White offender → Black victim",
      col_source: "BJS source",
      se: "SE {se}",
      pct_only: "{p}% of incidents against {v} victims (count not published)",
      not_published: "Not published",
      victims_white: "White",
      victims_black: "Black",
      baseline_comp: "Not a strict time series: BJS changed how mixed Hispanic offender groups are classified in 2022, 2018 was published as percentages only, and BJS published no such table for 2020.",
      gaps_h: "Data gaps",
      method_h: "Method and judgement calls",
      sources_h: "Sources and files",
      src_stories: "Coded stories ({year}, CSV)",
      src_summary: "Computed summary (summary.json)",
      src_baseline: "NCVS baseline (baseline_ncvs.json)",
      src_scripts: "Build scripts and README",
      src_mediacloud: "Media Cloud search",
      table_p: "p. {p}",
      generated: "Summary generated {d} by {s}.",
    },
  };

  const lang = () => {
    const l = (document.documentElement.lang || "en").slice(0, 2).toLowerCase();
    return MEDIA_STRINGS[l] ? l : "en";
  };
  const t = (key, vars) => {
    let s = (MEDIA_STRINGS[lang()] || {})[key];
    if (s == null) s = MEDIA_STRINGS.en[key];
    if (s == null) return key;
    return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m)) : s;
  };
  const esc = v => String(v).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const fmt = n => (n == null ? "—" : Number(n).toLocaleString("en-US"));
  const REPO_BLOB = "https://github.com/StopBias/harm-data/blob/main/data/media/";

  let data = null, loading = null;
  const view = document.getElementById("media-view");
  if (!view) return;

  // ---------- Tabs (inserted after the header, so the header markup is untouched) ----------
  const nav = document.createElement("nav");
  nav.className = "site-tabs";
  nav.setAttribute("aria-label", t("tabs_label"));
  nav.innerHTML = `<button type="button" data-tab="map"></button><button type="button" data-tab="media"></button>`;
  const header = document.querySelector("header");
  header.insertAdjacentElement("afterend", nav);
  const mapParts = [document.querySelector(".layout"), document.getElementById("explorer")];

  function labelTabs() {
    nav.querySelector('[data-tab="map"]').textContent = t("tab_map");
    nav.querySelector('[data-tab="media"]').textContent = t("tab_media");
  }

  function show(tab) {
    const media = tab === "media";
    mapParts.forEach(el => { if (el) el.hidden = media; });
    view.hidden = !media;
    nav.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.tab === tab)));
    document.body.classList.toggle("media-active", media);
    if (media) load();
    else window.dispatchEvent(new Event("resize"));  // the map re-measures itself after being hidden
  }

  nav.addEventListener("click", e => {
    const b = e.target.closest("button[data-tab]");
    if (!b) return;
    const tab = b.dataset.tab;
    if (tab === "media") { if (location.hash !== "#media") history.pushState(null, "", "#media"); }
    else if (location.hash === "#media") history.pushState(null, "", location.pathname + location.search);
    show(tab);
  });
  window.addEventListener("popstate", () => show(location.hash === "#media" ? "media" : "map"));
  window.addEventListener("hashchange", () => show(location.hash === "#media" ? "media" : "map"));

  // ---------- Data ----------
  function load() {
    if (data) return render();
    if (loading) return;
    view.innerHTML = `<div class="mv-inner"><p class="ex-lede">${esc(t("loading"))}</p></div>`;
    const get = u => fetch(u).then(r => { if (!r.ok) throw new Error(u + ": HTTP " + r.status); return r.json(); });
    loading = Promise.all([get("data/media/summary.json"), get("data/media/baseline_ncvs.json")])
      .then(([summary, baseline]) => { data = { summary, baseline }; render(); })
      .catch(err => {
        console.error(err);
        loading = null;
        view.innerHTML = `<div class="mv-inner"><p class="pending-note">${esc(t("load_error"))}</p></div>`;
      });
  }

  function cdiCell(r) {
    if (r.cdi == null) {
      return `<span class="mv-null">${esc(t("cdi_null"))}</span>${r.cdi_null_reason ? `<span class="mv-why">${esc(r.cdi_null_reason)}</span>` : ""}`;
    }
    const adj = r.zero_adjust_applied ? 0.5 : 0;
    const calc = t("calc", { w: fmt(r.stories_W_on_B + adj), b: fmt(r.stories_B_on_W + adj), nw: fmt(r.ncvs_W_on_B), nb: fmt(r.ncvs_B_on_W) });
    return `<span class="mv-cdi">${esc(r.cdi.toFixed(2))}</span><span class="mv-why">${esc(calc)}</span>` +
      (r.zero_adjust_applied ? `<span class="mv-why">${esc(t("zero_adj"))}</span>` : "");
  }

  function outletTable(rows, year) {
    const head = `<tr><th scope="col">${esc(t("col_outlet"))}</th>
      <th scope="col" class="num" title="${esc(t("col_total_hint"))}">${esc(t("col_total"))}</th>
      <th scope="col" class="num" title="${esc(t("col_coded_hint"))}">${esc(t("col_coded"))}</th>
      <th scope="col" class="num">${esc(t("col_wb"))}</th>
      <th scope="col" class="num">${esc(t("col_bw"))}</th>
      <th scope="col" class="num">${esc(t("col_other"))}</th>
      <th scope="col">${esc(t("col_cdi"))}</th></tr>`;
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
        <td class="mv-cdi-cell" data-label="${esc(t("col_cdi"))}">${cdiCell(r)}</td></tr>`;
    }).join("");
    return `<div class="mv-table-wrap"><table class="mv-table" id="mv-outlets">${"<thead>" + head + "</thead>"}<tbody>${body}</tbody></table></div>`;
  }

  function baselineTable(b) {
    const byYear = {};
    b.rows.forEach(r => { (byYear[r.year] = byYear[r.year] || {})[r.offender_race + ">" + r.victim_race] = r; });
    const status = {}; (b.years_status || []).forEach(s => { status[s.year] = s; });
    const cell = (r, victimKey) => {
      if (!r) return "—";
      if (r.count != null) return `${fmt(r.count)}<span class="mv-why">${esc(t("se", { se: fmt(r.se) }))}</span>`;
      if (r.pct != null) return `<span class="mv-null">${esc(t("pct_only", { p: r.pct, v: t(victimKey) }))}</span>`;
      return `<span class="mv-null">${esc(t("not_published"))}</span>`;
    };
    const years = Object.keys(byYear).map(Number).sort();
    const rows = years.map(y => {
      const s = status[y] || {}; const src = s.source || {};
      const page = src.table_pdf_page ? " (" + t("table_p", { p: src.table_pdf_page }) + ")" : "";
      const link = src.pdf_url ? `<a href="${esc(src.pdf_url)}" target="_blank" rel="noopener">${esc(src.report || src.pdf_url)}</a>${src.table ? `<span class="mv-why">${esc(src.table + page)}${src.se_table ? "; SE: " + esc(src.se_table) : ""}</span>` : `<span class="mv-why">${esc(t("not_published"))}</span>`}` : "—";
      return `<tr data-year="${y}"><th scope="row" data-label="${esc(t("col_year"))}">${y}</th>
        <td class="num" data-label="${esc(t("col_bwi"))}">${cell(byYear[y]["Black>White"], "victims_white")}</td>
        <td class="num" data-label="${esc(t("col_wbi"))}">${cell(byYear[y]["White>Black"], "victims_black")}</td>
        <td data-label="${esc(t("col_source"))}">${link}</td></tr>`;
    }).join("");
    return `<div class="mv-table-wrap"><table class="mv-table" id="mv-baseline"><thead><tr><th scope="col">${esc(t("col_year"))}</th>
      <th scope="col" class="num">${esc(t("col_bwi"))}</th><th scope="col" class="num">${esc(t("col_wbi"))}</th>
      <th scope="col">${esc(t("col_source"))}</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  function render() {
    labelTabs();
    if (!data) return;
    const { summary: s, baseline: b } = data;
    const years = [...new Set(s.by_outlet_year.map(r => r.year))].sort();
    const blocks = years.map(y => {
      const rows = s.by_outlet_year.filter(r => r.year === y);
      const r0 = rows[0] || {};
      const ratio = r0.ncvs_W_on_B && r0.ncvs_B_on_W ? (r0.ncvs_W_on_B / r0.ncvs_B_on_W).toFixed(3) : null;
      return `<h3 class="ex-kicker">${esc(t("outlets_h", { year: y }))}${rows.some(r => r.pilot) ? ` <span class="status pending">${esc(t("badge_pilot"))}</span>` : ""}</h3>
        ${outletTable(rows, y)}
        ${ratio ? `<p class="ex-small mv-ratio">${esc(t("ncvs_ratio", { year: y, nw: fmt(r0.ncvs_W_on_B), nb: fmt(r0.ncvs_B_on_W), r: ratio }))}</p>` : ""}`;
    }).join("");
    const storyLinks = (s.story_files || []).map(f => {
      const y = (f.match(/\d{4}/) || [""])[0];
      return `<li><a href="${REPO_BLOB}${esc(f)}" target="_blank" rel="noopener">${esc(t("src_stories", { year: y }))}</a></li>`;
    }).join("");
    view.innerHTML = `<div class="mv-inner">
      <div class="ex-head"><h2 id="mv-title">${esc(t("title"))}</h2>${s.pilot_notice ? `<span class="badge mv-badge">${esc(t("badge_pilot"))}</span>` : ""}</div>
      <p class="ex-lede">${esc(t("lede"))}</p>
      ${s.pilot_notice ? `<p class="mv-pilot" id="mv-pilot" role="note">${esc(s.pilot_notice)}</p>` : ""}
      ${blocks}
      <div class="mv-explain"><h3>${esc(t("cdi_explain_h"))}</h3><p>${esc(t("cdi_explain"))}</p></div>
      <h3 class="ex-kicker mv-section">${esc(t("baseline_h"))}</h3>
      <p class="ex-lede">${esc(t("baseline_lede"))}</p>
      ${baselineTable(b)}
      <p class="ex-small">${esc(t("baseline_comp"))}</p>
      <h3 class="ex-kicker mv-section">${esc(t("gaps_h"))}</h3>
      <ul class="mv-gaps" id="mv-gaps">${(s.data_gaps || []).map(g => `<li><b>${esc(g.topic)}:</b> ${esc(g.reason)}</li>`).join("")}</ul>
      <details class="method"><summary>${esc(t("method_h"))}</summary>
        <ul>${(s.judgement_calls || []).map(j => `<li>${esc(j)}</li>`).join("")}</ul>
        <p class="ex-small">${esc(t("generated", { d: s.generated, s: s.script }))}</p>
      </details>
      <div class="mv-sources" id="mv-sources"><h3>${esc(t("sources_h"))}</h3><ul>
        ${storyLinks}
        <li><a href="${REPO_BLOB}summary.json" target="_blank" rel="noopener">${esc(t("src_summary"))}</a></li>
        <li><a href="${REPO_BLOB}baseline_ncvs.json" target="_blank" rel="noopener">${esc(t("src_baseline"))}</a></li>
        <li><a href="${REPO_BLOB}README.md" target="_blank" rel="noopener">${esc(t("src_scripts"))}</a></li>
        <li><a href="${esc(b.source.url)}" target="_blank" rel="noopener">${esc(b.source.name)}</a></li>
        <li><a href="https://search.mediacloud.org/" target="_blank" rel="noopener">${esc(t("src_mediacloud"))}</a></li>
      </ul></div>
    </div>`;
  }

  window.MEDIA_STRINGS = MEDIA_STRINGS;
  window.renderMediaView = render;  // call after a language change
  labelTabs();
  show(location.hash === "#media" ? "media" : "map");
})();
