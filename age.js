// Age groups (map-level selector + "Figures by age group" section in the country explorer).
// Data: data/age/index.json lists countries with a file at data/age/<iso3 lowercase>.json (schema harm-data/age-bands/v1).
// User-facing interface strings live in i18n/*.json under the age.* prefix; series titles, descriptors and source
// names are data text and stay in English (marked "Shown in English"). Figures are shown as published: never filled
// in, pro-rated or imputed. Suppressed cells show as suppressed.
(function () {
  "use strict";

  const STORE = "harm-data-age";
  const BANDS = ["all", "0-17", "0-12", "13-17", "18-29", "30-64", "65+"];
  const SUB = { "0-12": "0-17", "13-17": "0-17" };
  const DEFAULT_BAND = "0-17";
  const t = (key, vars) => (window.t ? window.t("age." + key, vars) : key);
  const locale = () => (window.currentLocale ? window.currentLocale() : (document.documentElement.lang || "en"));
  const esc = v => String(v).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const fmtN = n => Number(n).toLocaleString(locale(), { maximumFractionDigits: 0 });
  const fmt1 = n => Number(n).toLocaleString(locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const isEn = () => (document.documentElement.lang || "en").slice(0, 2).toLowerCase() === "en";
  const enOnly = () => (isEn() ? "" : ` <span class="en-only">${esc(window.t ? window.t("shown_in_english") : "Shown in English")}</span>`);

  let band = DEFAULT_BAND;
  try { const s = localStorage.getItem(STORE); if (BANDS.includes(s)) band = s; } catch (e) {}
  let index = null;                 // Set of ISO3 codes with an age file
  const files = {};                 // iso -> data (or null when it failed to load)
  let iso = null;                   // country shown in the explorer

  // ---------- Map-level selector ----------
  const wrap = document.querySelector(".map-wrap");
  const picker = document.createElement("div");
  picker.className = "age-picker";
  picker.id = "age-picker";
  picker.innerHTML = `<label for="age-select" id="age-select-label"></label><select id="age-select" aria-describedby="age-select-hint"></select>` +
    `<span class="age-visually-hidden" id="age-select-hint"></span>`;
  if (wrap) wrap.appendChild(picker);
  const sel = picker.querySelector("select");

  function bandLabel(b) { return t("band." + b); }
  function fillPicker() {
    picker.querySelector("label").textContent = t("selector_label");
    picker.querySelector("#age-select-hint").textContent = t("selector_hint");
    sel.innerHTML = BANDS.map(b => `<option value="${b}"${SUB[b] ? ' class="age-sub"' : ""}>${SUB[b] ? "\u00a0\u00a0\u21b3 " : ""}${esc(bandLabel(b))}</option>`).join("");
    sel.value = band;
    placePicker();
  }
  sel.addEventListener("change", () => {
    band = sel.value;
    try { localStorage.setItem(STORE, band); } catch (e) {}
    render();
  });

  // ---------- Section in the explorer ----------
  const section = document.createElement("section");
  section.className = "age-section";
  section.id = "age-section";
  section.setAttribute("aria-labelledby", "age-title");
  section.hidden = true;
  const io = document.getElementById("ex-io");
  if (io) io.insertAdjacentElement("afterend", section);

  const getJSON = url => fetch(url).then(r => { if (!r.ok) throw new Error(url + ": HTTP " + r.status); return r.json(); });
  const indexReady = getJSON("data/age/index.json")
    .then(d => { index = new Set(d.countries || []); })
    .catch(err => { console.error(err); index = new Set(); });
  function loadCountry(code) {
    if (code in files) return Promise.resolve(files[code]);
    return getJSON(`data/age/${code.toLowerCase()}.json`)
      .then(d => (files[code] = d))
      .catch(err => { console.error(err); return (files[code] = null); });
  }

  function countryName() {
    const d = window.DETAIL && window.DETAIL[iso];
    if (isEn() && d && d.name_in_sentence) return d.name_in_sentence;
    const el = document.getElementById("panel-title");
    return el ? el.textContent : iso;
  }
  // On narrow screens the view buttons span the map's width (and may wrap), so sit just below them.
  function placePicker() {
    const views = document.getElementById("views");
    if (!views || !window.matchMedia("(max-width: 768px)").matches) { picker.style.top = ""; return; }
    picker.style.top = (views.offsetTop + views.offsetHeight + 6) + "px";
  }
  window.addEventListener("resize", placePicker);
  function explorerHarm() {
    const s = document.getElementById("sel-harm");
    return s ? s.value : null;
  }
  const harmSel = document.getElementById("sel-harm");
  if (harmSel) harmSel.addEventListener("change", () => render());

  function fitBadge(cell) {
    if (!cell) return "";
    const f = cell.fit || "unavailable";
    let txt = t("fit." + f);
    if (f === "estimated" && cell.approx_band) txt = t("fit.estimated_band", { band: cell.approx_band });
    return `<span class="age-fit age-fit-${esc(f)}" title="${esc(t("fit_help." + f))}">${esc(txt)}</span>`;
  }

  function sourceLine(d, s) {
    const src = (d.sources || {})[s.source] || {};
    const name = src.name || s.source;
    const pub = src.publisher ? ` (${src.publisher})` : "";
    const url = src.url && /^https?:\/\//.test(src.url) ? src.url.split(" ")[0] : null;
    const link = url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(name)}</a>` : esc(name);
    return `<span class="age-meta-item"><strong>${esc(t("source"))}:</strong> ${link}${esc(pub)}</span>` +
      `<span class="age-meta-item"><strong>${esc(t("year"))}:</strong> ${esc(s.year)}</span>`;
  }

  function cellNum(c, key) {
    if (!c) return `<span class="age-null">—</span>`;
    if (key === "n") {
      if (c.suppressed) return `<span class="age-suppressed" title="${esc(t("suppressed_help"))}">${esc(t("suppressed"))}</span>`;
      if (c.n == null) return `<span class="age-null">—</span>`;
      return esc(fmtN(c.n)) + (c.small_n ? `<sup class="age-small" title="${esc(t("small_n"))}">†</sup>` : "");
    }
    if (key === "share") return c.share != null ? esc(fmt1(c.share)) + "%" : `<span class="age-null">—</span>`;
    if (key === "rate") {
      if (c.rate_suppressed) return `<span class="age-suppressed">${esc(t("suppressed"))}</span>`;
      if (c.rate != null) return esc(fmt1(c.rate));
      return `<span class="age-null">—</span>`;
    }
    return "";
  }

  function groupsTable(s, cell) {
    const cells = cell.cells || {};
    const rows = s.groups.filter(g => cells[g.id]);
    if (!rows.length) return "";
    const hasShare = rows.some(g => cells[g.id].share != null);
    const hasRate = rows.some(g => cells[g.id].rate != null || cells[g.id].rate_suppressed);
    const head = `<tr><th scope="col">${esc(t("col_group"))}${enOnly()}</th><th scope="col" class="num">${esc(t(s.role === "perpetrators" ? "col_count_perp" : "col_count"))}</th>` +
      (hasShare ? `<th scope="col" class="num">${esc(t("col_share"))}</th>` : "") +
      (hasRate ? `<th scope="col" class="num">${esc(t("col_rate"))}</th>` : "") + "</tr>";
    const body = rows.map(g => {
      const c = cells[g.id];
      return `<tr${g.id === "total" || g.id === "all" ? ' class="age-total"' : ""}><th scope="row">${esc(g.label)}</th><td class="num">${cellNum(c, "n")}</td>` +
        (hasShare ? `<td class="num">${cellNum(c, "share")}</td>` : "") + (hasRate ? `<td class="num">${cellNum(c, "rate")}</td>` : "") + "</tr>";
    }).join("");
    return `<div class="age-table-wrap"><table class="age-table"><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
  }

  function matrixTable(s, cell) {
    const m = cell.matrix || {};
    const vs = s.victim_groups.filter(g => m[g.id] && Object.keys(m[g.id]).length);
    if (!vs.length) return `<p class="age-none">${esc(t("no_figure"))}</p>`;
    const os = s.offender_groups.filter(o => vs.some(v => m[v.id][o.id]));
    const head = `<tr><th scope="col">${esc(t("cross_corner"))}${enOnly()}</th>` + os.map(o => `<th scope="col" class="num">${esc(o.label)}</th>`).join("") + "</tr>";
    const body = vs.map(v => `<tr><th scope="row">${esc(v.label)}</th>` + os.map(o => `<td class="num">${cellNum(m[v.id][o.id], "n")}</td>`).join("") + "</tr>").join("");
    return `<div class="age-table-wrap"><table class="age-table age-matrix"><caption class="age-visually-hidden">${esc(t("cross_caption"))}</caption><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
  }

  function nativeList(s) {
    const items = (s.native_bands || []).map(nb => `<li>${esc(nb.label)}${nb.n != null ? `: ${esc(fmtN(nb.n))}` : ""}${nb.rate != null ? ` (${esc(fmt1(nb.rate))})` : ""}</li>`).join("");
    if (!items && !s.native_note) return "";
    return `<details class="age-native"><summary>${esc(t("native_bands"))}</summary>` +
      (s.native_note ? `<p>${esc(s.native_note)}${enOnly()}</p>` : "") + (items ? `<ul>${items}</ul>` : "") + "</details>";
  }

  function seriesCard(d, harm, s, b) {
    const cell = (s.bands || {})[b] || { fit: "unavailable" };
    const roleTxt = t("role." + s.role);
    let body;
    if (cell.fit === "unavailable" || (!cell.cells && !cell.matrix)) {
      const parent = SUB[b];
      const hint = parent && (s.bands[parent] || {}).fit && s.bands[parent].fit !== "unavailable" ? " " + t("try_parent", { band: bandLabel(parent) }) : "";
      body = `<p class="age-none">${esc(t("no_figure"))}${esc(hint)}${cell.note ? ` <span class="age-note-inline">${esc(cell.note)}${enOnly()}</span>` : ""}</p>`;
    } else {
      body = (s.victim_groups ? matrixTable(s, cell) : groupsTable(s, cell)) +
        (cell.note ? `<p class="age-foot">${esc(cell.note)}${enOnly()}</p>` : "");
    }
    const notes = [];
    if (s.no_rate_reason) notes.push(s.no_rate_reason);
    (s.notes || []).forEach(n => notes.push(n));
    if (s.other_age && cell.fit !== "unavailable") {
      const oa = s.other_age;
      if (oa.unknown != null || oa.range_spans_bands != null)
        notes.push(t("other_age", { unknown: fmtN(oa.unknown || 0), spans: fmtN(oa.range_spans_bands || 0) }));
    }
    const hid = `age-h-${s.id}`;
    return `<figure class="age-card" aria-labelledby="${esc(hid)}">` +
      `<h5 class="age-card-title" id="${esc(hid)}">${esc(s.title)}${enOnly()}</h5>` +
      `<p class="age-desc">${esc(s.descriptor)}</p>` +
      `<p class="age-meta"><span class="age-role">${esc(roleTxt)}</span>${fitBadge(cell)}${sourceLine(d, s)}` +
      (s.rate_unit && cell.fit !== "unavailable" ? `<span class="age-meta-item"><strong>${esc(t("rate_unit"))}:</strong> ${esc(s.rate_unit)}</span>` : "") + "</p>" +
      body +
      (notes.length ? `<ul class="age-notes">${notes.map(n => `<li>${esc(n)}</li>`).join("")}</ul>` : "") +
      nativeList(s) + "</figure>";
  }

  function harmBlock(d, key, h, b, open) {
    const avail = (d.available_bands || {})[key] || [];
    const chips = BANDS.map(x => `<li class="${avail.includes(x) ? "on" : "off"}${x === b ? " cur" : ""}">${esc(bandLabel(x))}</li>`).join("");
    const inner = `<p class="age-harm-desc">${esc(h.descriptor)}${enOnly()}</p>` +
      `<div class="age-chips"><span>${esc(t("bands_published"))}</span><ul>${chips}</ul></div>` +
      h.series.map(s => seriesCard(d, h, s, b)).join("");
    const title = `${esc(t("harm." + key))} <span class="age-harm-band">${esc(bandLabel(b))}</span>`;
    if (open) return `<div class="age-harm"><h4 class="age-harm-title">${title}</h4>${inner}</div>`;
    return `<details class="age-harm age-harm-more"><summary><h4 class="age-harm-title">${title}</h4></summary>${inner}</details>`;
  }

  function render() {
    fillPicker();
    if (!iso || !window.DETAIL || !window.DETAIL[iso]) { section.hidden = true; section.innerHTML = ""; return; }
    section.hidden = false;
    const head = `<h3 class="ex-kicker" id="age-title">${esc(t("section_title", { band: bandLabel(band) }))}</h3>`;
    const d = files[iso];
    if (!index || !(index.has(iso)) || !d) {
      section.innerHTML = head + `<div class="age-fallback"><p class="age-fallback-head">${esc(t("no_breakdown"))}</p>` +
        `<p>${esc(t(band === "all" ? "no_breakdown_all" : "no_breakdown_note", { country: countryName(), band: bandLabel(band) }))}</p></div>`;
      return;
    }
    const eh = explorerHarm();
    const keys = Object.keys(d.harms).filter(k => !(window.harmHiddenFromUi && window.harmHiddenFromUi(iso, k)));
    let primary = keys.filter(k => (d.harms[k].explorer_harms || []).includes(eh));
    if (!primary.length) primary = keys.slice(0, 1);
    const rest = keys.filter(k => !primary.includes(k));
    section.innerHTML = head +
      `<p class="age-lede">${esc(t("lede", { country: countryName(), band: bandLabel(band) }))}</p>` +
      `<ul class="age-race-notes">${(d.race_notes || []).map(n => `<li>${esc(n)}${enOnly()}</li>`).join("")}</ul>` +
      primary.map(k => harmBlock(d, k, d.harms[k], band, true)).join("") +
      (rest.length ? `<h4 class="age-more-head">${esc(t("more_harms"))}</h4>` + rest.map(k => harmBlock(d, k, d.harms[k], band, false)).join("") : "") +
      `<p class="age-legend"><sup class="age-small">†</sup> ${esc(t("small_n"))} · ${esc(t("suppressed"))}: ${esc(t("suppressed_help"))}</p>`;
  }

  document.addEventListener("harm:explorer", e => {
    iso = e.detail && e.detail.iso || null;
    if (!iso) { render(); return; }
    const code = iso;
    indexReady.then(() => (index.has(code) ? loadCountry(code) : null)).then(() => { if (iso === code) render(); });
    render();
  });
  (window.I18N_READY || Promise.resolve()).then(fillPicker);

  window.__age = { get band() { return band; }, setBand(b) { if (BANDS.includes(b)) { band = b; sel.value = b; render(); } }, render, files };
})();
