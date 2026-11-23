// Hollywood tab. Reads data/hollywood.json.
// User-facing text lives in i18n/*.json under the hollywood.* prefix.
(function () {
  "use strict";

  const t = (key, vars) => (window.t ? window.t("hollywood." + key, vars) : key);
  const locale = () => (window.currentLocale ? window.currentLocale() : (document.documentElement.lang || "en"));
  const esc = v => String(v == null ? "" : v).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const SUBJECTS = ["a", "e", "holocaust", "armenian", "holodomor"];

  let data = null, loading = null;
  const view = document.getElementById("hollywood-view");
  if (!view) return;

  const state = {
    details: false,
    query: "",
    subject: "all",
    headlineOnly: false,
    sortKey: "year",
    sortDir: -1
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

  function subjectLabel(id) {
    return t("subject_" + id);
  }

  function countsOf(id) {
    return data && data.counts && data.counts[id] ? data.counts[id] : { fd: 0, majority: 0, strict: 0 };
  }

  // ---------- Chart ----------
  function renderChart() {
    const max = Math.max(1, ...SUBJECTS.map(id => {
      const c = countsOf(id);
      return Math.max(c.fd || 0, c.majority || 0);
    }));
    const rows = SUBJECTS.map(id => {
      const c = countsOf(id);
      const prov = c.provisional
        ? ` <abbr class="hv-prov" title="${esc(t("provisional_note"))}">${esc(t("provisional_mark"))}</abbr>`
        : "";
      const bar = (rule, n, cls) => {
        const pct = max ? Math.max(0, (Number(n) / max) * 100) : 0;
        return `<div class="hv-bar-row">
          <span class="hv-bar-track"><span class="${cls}" style="width:${pct}%"></span></span>
          <span class="hv-bar-n">${esc(fmt(n))}</span>
          <span class="hv-bar-rule">${esc(t(rule))}</span>
        </div>`;
      };
      return `<li class="hv-chart-item">
        <div class="hv-chart-label">${esc(subjectLabel(id))}${prov}</div>
        <div class="hv-chart-bars" role="group" aria-label="${esc(subjectLabel(id))}">
          ${bar("rule_fd", c.fd, "hv-bar hv-bar-fd")}
          ${bar("rule_majority", c.majority, "hv-bar hv-bar-mp")}
        </div>
      </li>`;
    }).join("");
    return `<figure class="hv-chart">
      <figcaption class="hv-h" id="hv-chart-h">${esc(t("chart_h"))}</figcaption>
      <p class="hv-desc">${esc(t("chart_desc"))}</p>
      <ul class="hv-chart-rows">${rows}</ul>
      <p class="hv-at-least">${esc(t("at_least"))}</p>
    </figure>`;
  }

  function findingHtml() {
    const a = countsOf("a");
    const e = countsOf("e");
    return `<p class="hv-finding">${esc(t("finding", { a_fd: fmt(a.fd), a_mp: fmt(a.majority), e: fmt(e.fd) }))}</p>
      <p class="hv-prov-note">${esc(t("provisional_note"))}</p>`;
  }

  // ---------- Details ----------
  function ratioLabel(id) {
    return t("ratio_" + id);
  }

  function renderRatios() {
    const block = data.ratios;
    if (!block || !Array.isArray(block.rows) || !block.rows.length) return "";
    const body = block.rows.map(row => {
      const note = row.note
        ? `<div class="hv-why">${esc(row.note)}${enOnlyBadge()}</div>`
        : "";
      const baseline = `${row.baseline || ""} (${row.baseline_source || ""})`;
      const per = row.per_million == null ? "—" : fmt(row.per_million, { maximumFractionDigits: 1 });
      return `<tr>
        <th scope="row">${esc(ratioLabel(row.id))}${note}</th>
        <td>${esc(baseline)}${enOnlyBadge()}</td>
        <td class="num">${esc(fmt(row.count))}</td>
        <td class="num">${esc(per)}</td>
      </tr>`;
    }).join("");
    return `<section class="hv-block">
      <h3 class="hv-subh">${esc(t("ratios_h"))}</h3>
      <p class="hv-desc">${esc(t("ratios_desc"))}</p>
      <div class="hv-table-wrap">
        <table class="hv-table">
          <thead>
            <tr>
              <th>${esc(t("col_subject"))}</th>
              <th>${esc(t("col_baseline"))}</th>
              <th class="num">${esc(t("col_count"))}</th>
              <th class="num">${esc(t("col_per_million"))}</th>
            </tr>
          </thead>
          <tbody>${body}</tbody>
        </table>
      </div>
    </section>`;
  }

  function renderStrict() {
    const rows = SUBJECTS.map(id => {
      const n = countsOf(id).strict;
      const prov = countsOf(id).provisional
        ? ` <abbr class="hv-prov" title="${esc(t("provisional_note"))}">${esc(t("provisional_mark"))}</abbr>`
        : "";
      return `<tr>
        <th scope="row">${esc(subjectLabel(id))}${prov}</th>
        <td class="num">${esc(fmt(n))}</td>
      </tr>`;
    }).join("");
    return `<section class="hv-block">
      <h3 class="hv-subh">${esc(t("strict_h"))}</h3>
      <p class="hv-desc">${esc(t("strict_desc"))}</p>
      <div class="hv-table-wrap">
        <table class="hv-table">
          <thead><tr><th>${esc(t("col_subject"))}</th><th class="num">${esc(t("at_least"))}</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>`;
  }

  function renderDefinition() {
    const def = data.definition || "";
    const rulings = data.definition_rulings || "";
    return `<section class="hv-block">
      <h3 class="hv-subh">${esc(t("definition_h"))}${enOnlyBadge()}</h3>
      <p class="hv-desc hv-en">${esc(def)}</p>
      ${rulings ? `<p class="hv-desc hv-en">${esc(rulings)}</p>` : ""}
    </section>`;
  }

  function renderRules() {
    const r = data.rules || {};
    const items = ["fd", "majority", "strict"].map(k => {
      const label = t(k === "fd" ? "rule_fd" : k === "majority" ? "rule_majority" : "rule_strict");
      return `<li><strong>${esc(label)}.</strong> ${esc(r[k] || "")}</li>`;
    }).join("");
    return `<section class="hv-block">
      <h3 class="hv-subh">${esc(t("rules_h"))}${enOnlyBadge()}</h3>
      <ul class="hv-rules-list hv-en">${items}</ul>
    </section>`;
  }

  function renderAgreement() {
    const a = data.agreement || {};
    const both = a.both_agree_provisional || {};
    return `<section class="hv-block">
      <h3 class="hv-subh">${esc(t("agreement_h"))}</h3>
      <p class="hv-desc">${esc(t("agreement", {
        pct: fmt(a.independent_pct, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
        kappa: fmt(a.independent_kappa, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        n: fmt(a.n)
      }))}</p>
      <p class="hv-desc">${esc(t("agreement_both", {
        fd: fmt(both.fd),
        mp: fmt(both.majority),
        strict: fmt(both.strict)
      }))}</p>
    </section>`;
  }

  function detailsHtml() {
    const hidden = state.details ? "" : " hidden";
    return `<div class="hv-details-wrap">
      <button type="button" class="hv-details-btn" id="hv-details-btn" aria-expanded="${state.details ? "true" : "false"}">${esc(state.details ? t("details_hide") : t("details_btn"))}</button>
      <div class="hv-details" id="hv-details"${hidden}>
        <h2 class="hv-h">${esc(t("details_h"))}</h2>
        ${renderStrict()}
        ${renderRatios()}
        ${renderDefinition()}
        ${renderRules()}
        ${renderAgreement()}
      </div>
    </div>`;
  }

  // ---------- Title list ----------
  function rulePills(rules) {
    const parts = [];
    if (rules.fd) parts.push(t("rule_pass_fd"));
    if (rules.majority) parts.push(t("rule_pass_mp"));
    if (rules.strict) parts.push(t("rule_pass_strict"));
    return parts.length ? parts.map(p => `<span class="hv-pill">${esc(p)}</span>`).join(" ") : esc(t("none"));
  }

  function passesHeadline(rec) {
    const r = rec.rules || {};
    return !!(r.fd || r.majority || r.strict);
  }

  function filteredTitles() {
    const q = state.query.trim().toLowerCase();
    let list = (data.titles || []).slice();
    if (state.subject !== "all") list = list.filter(r => r.subject === state.subject);
    if (state.headlineOnly) list = list.filter(passesHeadline);
    if (q) {
      list = list.filter(r => {
        const hay = [
          r.title, r.year, r.studio, r.coprod_source, r.origin, subjectLabel(r.subject)
        ].map(v => String(v == null ? "" : v).toLowerCase()).join(" ");
        return hay.includes(q);
      });
    }
    const dir = state.sortDir;
    const key = state.sortKey;
    list.sort((a, b) => {
      let va, vb;
      if (key === "year") { va = a.year == null ? -Infinity : a.year; vb = b.year == null ? -Infinity : b.year; }
      else if (key === "title") { va = (a.title || "").toLowerCase(); vb = (b.title || "").toLowerCase(); }
      else if (key === "subject") { va = subjectLabel(a.subject); vb = subjectLabel(b.subject); }
      else if (key === "studio") { va = (a.studio || "").toLowerCase(); vb = (b.studio || "").toLowerCase(); }
      else { va = a[key]; vb = b[key]; }
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      const ta = (a.title || "").toLowerCase(), tb = (b.title || "").toLowerCase();
      if (ta < tb) return -1;
      if (ta > tb) return 1;
      return (a.year || 0) - (b.year || 0);
    });
    return list;
  }

  function sortMark(key) {
    if (state.sortKey !== key) return "";
    return state.sortDir > 0 ? " ▲" : " ▼";
  }

  function listHtml() {
    const rows = filteredTitles();
    const opts = [`<option value="all"${state.subject === "all" ? " selected" : ""}>${esc(t("filter_all"))}</option>`]
      .concat(SUBJECTS.map(id => `<option value="${id}"${state.subject === id ? " selected" : ""}>${esc(subjectLabel(id))}</option>`))
      .join("");
    const body = rows.length
      ? rows.map(r => {
          const pending = Array.isArray(r.pending) && r.pending.length
            ? ` <span class="hv-pill hv-pill-pending">${esc(t("pending_badge"))}</span>`
            : "";
          const coprod = r.coprod_source
            ? `${esc(r.coprod_source)}${enOnlyBadge()}`
            : "—";
          return `<tr>
            <th scope="row">${esc(r.title || "")}${pending}</th>
            <td data-label="${esc(t("col_year"))}" class="num">${r.year == null ? "—" : esc(fmt(r.year, { useGrouping: false }))}</td>
            <td data-label="${esc(t("col_subject"))}">${esc(subjectLabel(r.subject))}</td>
            <td data-label="${esc(t("col_studio"))}">${r.studio ? esc(r.studio) + enOnlyBadge() : "—"}</td>
            <td data-label="${esc(t("col_rules"))}">${rulePills(r.rules || {})}</td>
            <td data-label="${esc(t("col_coprod"))}">${coprod}</td>
          </tr>`;
        }).join("")
      : `<tr><td colspan="6" class="hv-empty">${esc(t("no_matches"))}</td></tr>`;
    return `<section class="hv-section" id="hv-list">
      <h2 class="hv-h">${esc(t("list_h"))}</h2>
      <p class="hv-desc">${esc(t("list_desc"))}</p>
      <div class="hv-list-toolbar">
        <label class="hv-search-lab">
          <span>${esc(t("search"))}</span>
          <input type="search" id="hv-search" value="${esc(state.query)}" autocomplete="off" aria-label="${esc(t("search_aria"))}">
        </label>
        <label class="hv-filter-lab">
          <span>${esc(t("filter_subject"))}</span>
          <select id="hv-subject">${opts}</select>
        </label>
        <label class="hv-check">
          <input type="checkbox" id="hv-headline"${state.headlineOnly ? " checked" : ""}>
          ${esc(t("filter_headline"))}
        </label>
        <p class="hv-list-count" id="hv-list-count">${esc(t("list_count", { n: fmt(rows.length) }))}</p>
      </div>
      <div class="hv-table-wrap">
        <table class="hv-table hv-titles">
          <thead>
            <tr>
              <th data-sort="title">${esc(t("col_title"))}${sortMark("title")}</th>
              <th data-sort="year" class="num">${esc(t("col_year"))}${sortMark("year")}</th>
              <th data-sort="subject">${esc(t("col_subject"))}${sortMark("subject")}</th>
              <th data-sort="studio">${esc(t("col_studio"))}${sortMark("studio")}</th>
              <th>${esc(t("col_rules"))}</th>
              <th>${esc(t("col_coprod"))}</th>
            </tr>
          </thead>
          <tbody>${body}</tbody>
        </table>
      </div>
    </section>`;
  }

  function renderListOnly() {
    const tbody = view.querySelector(".hv-titles tbody");
    const count = document.getElementById("hv-list-count");
    if (!tbody) return render();
    const tmp = document.createElement("div");
    tmp.innerHTML = listHtml();
    const nextBody = tmp.querySelector(".hv-titles tbody");
    const nextCount = tmp.querySelector("#hv-list-count");
    const nextHead = tmp.querySelector(".hv-titles thead");
    if (!nextBody) return render();
    tbody.replaceWith(nextBody);
    if (count && nextCount) count.replaceWith(nextCount);
    const head = view.querySelector(".hv-titles thead");
    if (head && nextHead) head.replaceWith(nextHead);
  }

  function render() {
    if (!data) return;
    const source = data.source
      ? `<p class="hv-source">${esc(t("source_caption"))}${enOnlyBadge()}</p>`
      : "";
    view.innerHTML = `<div class="hv-inner">
      <header class="hv-head">
        <h2 id="hv-title">${esc(t("title"))}</h2>
        <p class="ex-lede">${esc(t("lede"))}</p>
      </header>
      ${renderChart()}
      ${findingHtml()}
      ${detailsHtml()}
      ${listHtml()}
      ${source}
    </div>`;
  }

  view.addEventListener("click", e => {
    const btn = e.target.closest("#hv-details-btn");
    if (btn) { state.details = !state.details; render(); return; }
    const th = e.target.closest(".hv-titles thead th[data-sort]");
    if (!th) return;
    const key = th.getAttribute("data-sort");
    if (state.sortKey === key) state.sortDir *= -1;
    else { state.sortKey = key; state.sortDir = key === "year" ? -1 : 1; }
    render();
  });
  view.addEventListener("input", e => {
    if (e.target && e.target.id === "hv-search") {
      state.query = e.target.value;
      renderListOnly();
    }
  });
  view.addEventListener("change", e => {
    if (!e.target) return;
    if (e.target.id === "hv-subject") { state.subject = e.target.value; render(); }
    else if (e.target.id === "hv-headline") { state.headlineOnly = e.target.checked; render(); }
  });

  function load() {
    if (data) return render();
    if (loading) return;
    view.innerHTML = `<div class="hv-inner"><p class="ex-lede">${esc(t("loading"))}</p></div>`;
    loading = fetch("data/hollywood.json")
      .then(r => { if (!r.ok) throw new Error("data/hollywood.json: HTTP " + r.status); return r.json(); })
      .then(json => { data = json; render(); })
      .catch(err => {
        console.error(err);
        loading = null;
        view.innerHTML = `<div class="hv-inner"><p class="pending-note">${esc(t("load_error"))}</p></div>`;
      });
  }

  window.renderHollywoodView = function () {
    if (view.hidden) return;
    if (data) render();
    else load();
  };

  function start() {
    if (!view.hidden) load();
  }

  const ready = window.I18N_READY || Promise.resolve();
  ready.then(start);
})();
