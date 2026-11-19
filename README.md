# harm-data
Data related to bias harms at the global, national, and regional levels.

## OWID-style choropleth (no basemap)

- `index.html` — MapLibre GL JS 5.24.1, empty style (background colour only) + one country layer. No tiles, no keys, no servers.
- `data/countries-ne50m.geojson` — 240 countries/territories, Natural Earth 1:50m admin-0 (v5.x, `nvkelso/natural-earth-vector`),
  dissolved by ISO code, simplified 20%, 2-decimal coordinates. ~357 KB raw, ~110 KB gzipped as GitHub Pages serves it.
  Properties: `iso_a3`, `name`, `admin`, `continent`.
- `build-boundaries.sh` — regenerates that file.

## Colours
Legend title: "Child protection by data completeness".

| Tier | Colour | Legend label |
| --- | --- | --- |
| Analysed, score 0–20 | `#e74c3c` red | 0–20% |
| Analysed, score 20–40 | `#f39c12` orange | 20–40% |
| Analysed, score 40–60 | `#f4d03f` yellow | 40–60% |
| Analysed, score 60–80 | `#8bc34a` light green | 60–80% |
| Analysed, score 80–100 | `#1e8449` dark green | 80–100% |
| In scope, not yet analysed (`IN_SCOPE` but not `tracked`) | `#b9bfc4` darker grey | Not yet analyzed |
| Outside the project | `#eceeef` very light grey | Outside current scope (faded) |

Bands include the lower bound and exclude the upper (20 → orange), except 100 → dark green.

## Adding / analysing a country
1. Make sure its ISO 3166-1 alpha-3 code is in `IN_SCOPE` (all European states except Cyprus and the dependencies already are).
2. Add one entry to `tracked`:

       FRA: { completeness: 35, provisional: true, note: "…" },

`completeness` is a score from 0 to 100; the colour band, legend, tooltip and panel follow automatically.
`provisional: true` adds "(provisional)" and a note that data collection is still in progress.
Natural Earth codes to know: Kosovo = XKX, Northern Cyprus = CYN, Somaliland = SOL.

## Country data explorer (below the map)
- The section below the map always follows the selected country. Nothing selected (or after tapping the sea or a
  country outside the project, or pressing Esc): a short prompt. A country without a detailed file: its name,
  completeness band, note and "Detailed data for … has not been added yet." A country with a file: the full explorer.
- The explorer is split into three labelled parts: **Inputs** (the four dropdowns: harm, victim heritage,
  perpetrator heritage, measure), a bordered **Output** box (the answer for that selection, in larger bold type),
  and **Notes** (caveats, proxy warnings, definitions, unknown shares). Overall totals from the harm intro sit
  inside the output, labelled "Overall total (all groups)", so they are never read as the answer for a filtered
  selection. When a combination has no data, the output is a bold line such as "No data: Germany does not record this"
  plus a one-line reason.
- Dropdown options with no data for the selected harm (and the other current selections) are greyed out, with a
  short helper line explaining why. If a selection becomes unavailable (for example after changing harm), the
  explorer switches to the nearest available option (the parent group if there is one, otherwise "All groups").
  Availability comes from each harm's `availability` map: `victims`, `perpetrators`, `by_measure` (share / rate /
  linked) and `linked_pairs`. Groups not listed have no data for that harm and are greyed out. "All groups" is still
  always offered so a harm with no figures can show a "No data" answer. If `availability` is absent, the explorer
  derives the same lists from published share/rate keys, `also` blocks, and published cross tables.
- To add a country (e.g. the UK): create `data/<iso3 lowercase>.json` (e.g. `data/gbr.json`) in the same format as
  `data/usa.json`, and add its ISO3 code to `"detailed"` in `data/index.json`. No code changes are needed. The
  manifest means the page only requests files that exist, so there are no 404 errors for countries without one.
- Optional text fields keep wording out of the code: `short_name`, `name_in_sentence`, `extra_group_labels`,
  `combined_groups`, `not_recorded` on a group (with `european_note`/`european_title`), `score.why`, per-harm
  `extra_sources`/`rate_sources`, `availability`, and for cross tables `pair_sentence`, `row_intro`, `col_intro` (with `{victim}`/`{perp}`) and `overview`.

### Germany data
- `data/deu.json` is built by `build_deu.py` (kept with the German research, outside this repo). Germany records
  nationality (citizenship) and, in child protection and surveys, migration background, never ethnicity.
  It scores 25% on the stricter scale (capped from an uncapped 29.0%; it scored 49% on the previous rubric).
- Proxy display fields: `proxy_note` (banner under the summary), a `proxy` kind on each group (each result is tagged
  "Proxy: nationality, not ethnicity" or "Proxy: migration background, not ethnicity"), `select_labels` (dropdown
  labels), `unknown_label` ("Nationality unknown"; a block can override it), and `score.proxy_note` in the score box.
  Files without these fields (US, UK) look as before, with "Ethnicity unknown".
- Sub-groups (e.g. Syrian or EU citizens within non-German citizens) are listed under the "All groups" bars as shares of
  the total, and shown as their own figure when picked. "European descent" stays "Not recorded".

### Canada data
- `data/can.json` is built by `build_can.py` (kept with the Canadian research, outside this repo). Canada scores 25%.
  Police report the racialized and Indigenous identity of homicide victims and accused; no other police-reported crime
  carries race or Indigenous identity yet. Official "racialized" / "rest of the population" categories never separately
  identify White or European-descent people.

### France data
- `data/fra.json` is built by `build_fra.py` (kept with the French research, outside this repo). France scores 24%.
  France does not collect ethnic statistics. Police publish child victims of sexual violence, family violence and
  homicide by French or foreign nationality, and suspects by nationality — proxies, not ethnicity.

### Australia data
- `data/aus.json` is built by `build_aus.py` (kept with the Australian research, outside this repo). Australia scores 20%.
  Police and child-protection data identify Aboriginal and Torres Strait Islander children and offenders, but everyone
  else is 'non-Indigenous', so White or European-descent Australians are never separately identified.

### New Zealand data
- `data/nzl.json` is built by `build_nzl.py` (kept with the New Zealand research, outside this repo). New Zealand scores 41%.
  It is the first country reviewed whose official police data separately identify European-descent victims and offenders,
  published monthly for child sexual assault, child assault, abuse material and grooming.

### South Africa data
- `data/zaf.json` is built by `build_zaf.py` (kept with the South African research, outside this repo). South Africa scores 7%.
  Police counts of crimes against children carry no population group for victims or suspects. Death notifications record
  population group, including White, but child homicide by population group is not in the main release.

### Europe batch 1: Italy, Spain, Poland, Netherlands, Sweden
- `data/ita.json`, `esp.json`, `pol.json`, `nld.json` and `swe.json` are built by `build_<iso>.py` (kept with each
  country's research, outside this repo) and scored by `score_v2_batch4.py` on the stricter scale. None of the five
  records ethnicity, so the 25% cap rule applies to all of them: Italy 24%, Spain 21%, Netherlands 16%, Sweden 13%,
  Poland 9% (under the 19 Nov 2026 harm weights).
- Italy and Spain publish child victims and authors by citizenship or nationality (Spain also by continent); the
  Netherlands publishes suspects by nationality and by country of birth with rates, but nothing for child victims;
  Sweden has a school survey and a one-off suspect study by migration background; Poland publishes origin only for
  trafficking victims.
- A share block may have `n: null` when the source publishes percentages without the count (ISTAT female child
  victims, Interior Ministry author chart); the page then omits the number.

### Europe batch 2: Ireland, Belgium, Austria, Switzerland, Portugal
- `data/irl.json`, `bel.json`, `aut.json`, `che.json` and `prt.json` are built by `build_<iso>.py` (kept with each
  country's research, outside this repo) and scored by `score_v2_batch5.py` on the stricter scale with the 19 Nov 2026
  harm weights (`score.weights`; new files have no `previous_weights`). Switzerland 25%, Austria 14%, Portugal 13%,
  Ireland 12%, Belgium 7%.
- Ireland is the only one with real ethnicity data: the CSO Sexual Violence Survey 2022 gives childhood sexual violence
  by ethnic background with White Irish separate, so the 25% cap rule does not apply; its crime, child-protection and
  homicide statistics carry no ethnicity or nationality. The other four record nationality or residence status only,
  so the cap rule applies (none reaches it).
- Switzerland publishes child victims and accused of sexual acts with children by residence status; Austria gives
  conviction shares by citizenship; Portugal gives children in child protection and prisoners by nationality; Belgium
  publishes origin only for supported trafficking victims.
- Survey prevalence (Ireland) and victimization rates (Switzerland) use `rate` with `rate_unit` and no `share`, like
  the Swedish school survey.

### Europe batch 3: Denmark, Norway, Finland, Iceland
- `data/dnk.json`, `nor.json`, `fin.json` and `isl.json` are built by `build_<iso>.py` (kept with each country's
  research, outside this repo) and scored by `score_v2_batch6.py` on the stricter scale with the 19 Nov 2026 harm
  weights. Finland 25% (capped from 26.4%), Norway 22%, Denmark 20%, Iceland 8%.
- Denmark's herkomst (Danish origin; Western and non-Western immigrants and descendants), Norway's immigrant background
  and country groups, and Finland's origin and background country are all built from the birth country (and, in Denmark,
  citizenship) of the person and their parents, so they are scored as proxies like the Dutch and Swedish groups, and
  the 25% cap rule applies. 'Danish origin', Norway's 'rest of the population' and 'Finnish background' all absorb the
  grandchildren of immigrants and children with one native parent. Iceland records only Icelandic or foreign citizenship.
- Finland's suspects table lists background-country regions; a calculated "Finnish or European background" group sums
  Finnish background and the four European regions. Denmark's country-of-origin table is grouped the same way
  (Denmark, 33 listed European countries, Turkey, other listed countries, unlisted). These are labelled as calculated.
- Iceland's suspect shares are read from the police Power BI dashboard (percentages as displayed); its trafficking
  figures come from the US State Department report, labelled as a non-Icelandic source.
- Map views fix (requested by Mike): the World view now spans -180 to 180 so New Zealand, including South Island and
  the Chatham Islands (stored at about -176.5, so they sit at the far west edge), is inside the view. Every view
  button is fitted with padding that clears the view buttons and, on desktop, the legend overlay. Pan limits are a
  custom camera constraint (`constrainCamera`): the fitted world view widened by 20% of its width and height on each
  side. MapLibre's `setMaxBounds` is no longer used, because it cannot reach past +/-180 and it zooms the camera in
  when the box is smaller than the view, which clamped the Oceania view and cut off the south of the world view.
  Checked at 1280x800, 1024x700 and 390x844, with the panel closed and open (`test/views-results.txt`).

### Europe batch 4: Russia, Ukraine, Romania, Czechia, Hungary
- `data/rus.json`, `ukr.json`, `rou.json`, `cze.json` and `hun.json` are built by `build_<iso>.py` (kept with each
  country's research, outside this repo) and scored by `score_v2_batch7.py` on the stricter scale with the 19 Nov 2026
  harm weights. Ukraine 12%, Czechia 11%, Hungary 9%, Romania 8%, Russia 2%, all red; none reaches the 25% cap.
- Every origin variable found is citizenship (Czech/foreign offences, Hungarian/foreign offences, Ukrainian/foreign/
  stateless suspects, Romanian/foreign trafficking victims), so all heritage points are proxies. Romania's and Hungary's
  censuses record ethnicity or nationality (including Roma), but no crime, victim or child-protection statistic does, so
  the census is not used and the countries are not credited with ethnicity data.
- Czech and Hungarian shares are of offences, not persons; Hungary's denominator is all registered offences, including
  those with no known perpetrator, so its foreign share is a lower bound. Romania's trafficking shares are computed from
  ANITP's one-row-per-victim open data. Ukraine's figures exclude occupied territories.
- Blocked or unreachable sources, recorded and not worked around: Rosstat (certificate not trusted), the Russian
  Interior Ministry (connection closed), the Russian Judicial Department and crimestat.ru (no response), the Romanian
  police statistics file (site firewall), Hungary's BSR report files (no response) and data.gov.ua / data.gov.ro
  (maintenance / connection closed; the same files were taken from the publishers' own sites where they offer them).

### UK data
- `data/gbr.json` is generated from the research file by `to_explorer.py` (kept with the UK research, outside this repo); it
  copies every figure unchanged and only adds labels and structure. Shares are of people with known ethnicity; each block
  has `unknown_share`, shown on the page as "Ethnicity unknown: X% of the total".
- White British, White Irish, Any other White background (and Gypsy or Irish Traveller) and Pakistani are sub-groups
  (`subgroups` maps each to its parent). They are left out of the "All groups" bars so the bars do not double-count, and
  appear when picked. They are still not European descent, so "European descent" stays "Not recorded".
- `also` blocks show a second published source for one side (e.g. police-recorded suspects next to court convictions).
- VKPP and Hydrant reports are police-produced and labelled as not official statistics.

### US data
- `data/usa.json` holds every US figure, source and the score, kept apart from the code. `index.html` loads it,
  sets the USA score (59) on the map, and builds the dropdowns (harm, victim's heritage, perpetrator's heritage,
  share % vs rate per 100,000), the explanation panel, the expandable source list and the "How the score works" box.
- Each harm has `victims`, `perpetrators` and `cross` (victim × perpetrator) blocks with a `status`:
  `published`, `not_published` (recorded but no public table), `not_recorded`, or `pending` (published, not yet added).
  Missing combinations are shown on the page, never hidden.
- Figures come only from: HHS Child Maltreatment 2024, BJS Race and Hispanic Origin of Victims and Offenders 2012–15 (NCVS),
  BJS Human Trafficking Data Collection Activities 2025, US Sentencing Commission Quick Facts FY2024, and Census Vintage 2025
  population estimates (denominators for the federal-defendant rates). Sources and limitations are in the `sources` block.
- Scoring standard (shown in "How the score works"): 100% = published data that separately identifies people of
  European descent as both victims and perpetrators, alongside every other group, linked victim to perpetrator, for
  every harm. Per harm, heritage is 75 points (37.5 victim + 37.5 perpetrator; full marks only when European descent
  is identified separately). Coverage, rates and access together are 25 points. Proxies such as nationality or
  migration background earn at most one quarter of the heritage points. A country with no real ethnicity data is
  capped at 25%. The country score is a weighted average of the six harms: homicide 25%, sexual abuse 20%,
  sex trafficking 20%, physical abuse 15%, online exploitation 10%, neglect 10% (approved 19 Nov 2026; before that,
  sexual abuse 25% and the other five 15% each). Each file's `score.weights` holds the weights in use and
  `score.previous_weights` the score under the earlier weights. Current published scores: United States 59%,
  United Kingdom 53%, Germany 25% (capped from an uncapped 29.0%; 49% on the previous rubric), Canada 25%,
  France 24%, Australia 20%, New Zealand 41%, South Africa 7%, Italy 24%, Spain 21%, Netherlands 16%, Sweden 13%,
  Poland 9%, Switzerland 25%, Austria 14%, Portugal 13%, Ireland 12%, Belgium 7%, Finland 25% (capped from an
  uncapped 26.4%), Norway 22%, Denmark 20%, Iceland 8%. To change a country's displayed score, edit
  `completeness` in `data/<iso3>.json` (keep `score.value` in step with it); the map, badge and method box all read
  that one number.
- `us-data.json` and `us.geojson` at the repo root are from the earlier version and are not used by `index.html`.

## Licence
Natural Earth: public domain ("No permission is needed to use Natural Earth. Crediting the authors is unnecessary.")
https://www.naturalearthdata.com/about/terms-of-use/ — credited anyway in the map attribution.
Borders are Natural Earth's default "de facto" view of disputed areas. NE also
publishes country-specific point-of-view files (ne_50m_admin_0_countries_<xxx>) if a different stance is ever needed.

## Future: sub-national layer (Natural Earth admin-1)
Don't ship the whole admin-1 file (10m version is ~40 MB). Cut only the countries you need:

    curl -sLO https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson
    npx mapshaper ne_10m_admin_1_states_provinces.geojson \
      -filter '["USA","CAN","AUS","DEU"].indexOf(adm0_a3) > -1' \
      -filter-fields iso_3166_2,name,adm0_a3 \
      -simplify 10% keep-shapes -o format=geojson precision=0.01 data/admin1.geojson

Then in index.html (a commented recipe is already in the `load` handler):

    map.addSource("admin1", { type: "geojson", data: "data/admin1.geojson", promoteId: "iso_3166_2" });
    map.addLayer({ id: "admin1-fill", type: "fill", source: "admin1",
                   paint: { "fill-color": ["match", ["get","iso_3166_2"], "US-CA", "#f39c12", /* … */ "rgba(0,0,0,0)"] } },
                 "countries-line");
    map.addLayer({ id: "admin1-line", type: "line", source: "admin1",
                   paint: { "line-color": "#ffffff", "line-width": 0.4 } }, "countries-line");

keyed the same way (`US-CA`, `DE-BY`, `CA-ON` …). Raise `setMaxZoom(z + 3)` in `fitWorld()` if states need more room.

## Projection
MapLibre only offers Web Mercator (and a 3-D globe). Equal Earth / Robinson (what OWID uses) is not available in MapLibre;
it would need a D3-based SVG map instead. Mercator here is cropped to 56°S–80°N, Antarctica hidden, which keeps
Russia/Canada/Greenland from dominating too much.
