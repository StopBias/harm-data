# Ethnic Bias Data Explorer

The public name of this site is **Ethnic Bias Data Explorer**. The repository and site URL remain `harm-data` (`https://stopbias.github.io/harm-data/`). Subtitle: “Calling for transparency in ethnic data and reporting”. Interface colours follow the logo: cyan `#0cc0df` with black text, and the same hue darkened to `#077183` for text and white-on-colour. An About page is at `#about`.

Data related to bias harms at the global, national, and regional levels.

## OWID-style choropleth (no basemap)

- `index.html` — MapLibre GL JS 5.24.1, empty style (background colour only) + one country layer. No tiles, no keys, no servers.
- `data/countries-ne50m.geojson` — 240 countries/territories, Natural Earth 1:50m admin-0 (v5.x, `nvkelso/natural-earth-vector`),
  dissolved by ISO code, simplified 20%, 2-decimal coordinates. ~357 KB raw, ~110 KB gzipped as GitHub Pages serves it.
  Properties: `iso_a3`, `name`, `admin`, `continent`.
- `build-boundaries.sh` — regenerates that file.

## Colours
Legend title: "Ethnic data completeness".

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


## Languages
The interface is available in English, German, Spanish, French, Italian, Portuguese, Russian, Ukrainian, Polish, Hungarian and Swedish. Strings live in `i18n/en.json`, `de.json`, `es.json`, `fr.json`, `it.json`, `pt.json`, `ru.json`, `uk.json`, `pl.json`, `hu.json` and `sv.json`, including the media-coverage tab and the About heading. English is the fallback for any missing key. Portuguese uses European spelling where it differs, in wording that stays clear in Brazil.

A language dropdown in the header, with a globe icon, lists each language as a code plus its native name (EN English, DE Deutsch, ES Español, FR Français, IT Italiano, PT Português, RU Русский, UK Українська, PL Polski, HU Magyar, SV Svenska). The choice is kept in `localStorage` (`harm-data-lang`), a `?lang=` URL parameter is honoured, and the page otherwise follows the browser language when it is one of the eleven. Country names use `Intl.DisplayNames` (Kosovo / XKX is named by hand). Numbers, percentages and plural forms follow the active locale (`Intl.PluralRules`).

Country notes, source descriptions and other per-country data text stay in English for now and are marked “Shown in English”. Official source titles are never translated. The About page body is also English-only for now, with the same mark. On the Media tab the same mark is applied to the English pilot notice, data-gap list, judgement calls and BJS table titles. On the Hollywood view the same mark is applied to the slavery-film definition, the production-rule wording, co-production sources and other long notes. On the Demographics tab the same mark is applied to the method-and-limits text, mapping notes and official source titles.

## Hollywood (under Media)
The Hollywood view sits under the Media tab (`#media/hollywood`; the older `#hollywood` address redirects there). It compares US films in which a historical event is the organizing subject. Headline counts are floors (“at least”) under two production rules shown side by side: financing-and-distribution, and majority US co-producer. A US-only studio count is kept in Details for reference. The subjects are films about Africans or African-descended people enslaved by ethnic Europeans, films about ethnic Europeans enslaved by non-Europeans, the Holocaust, the Armenian genocide and the Holodomor. A slavery film is one whose organizing subject is chattel slavery as a lived experience; rescue, search, adventure, romance and abolition-campaign films are excluded.

Counts, the title list and the agreement figures come from `data/hollywood.json`, built from the v6.1 Hollywood summary (20 November 2026). Both coders agree on the headline counts (43 / 42 / 39 on side A, 0 under every rule on side E). Markup lives in `hollywood.js` / `hollywood.css`; strings live in `i18n/*.json` under the `hollywood.*` prefix. Nothing is invented: per-victim ratios appear only where the summary gives a sourced baseline.

## Demographics tab
The Demographics tab (`#demographics`) is **provisional** (`0.2.0-provisional`) and is not a published finding. It is census first. For countries that publish ethnicity, race, ancestry or migration-background data, the score is the change in the share of the population outside the founding pool, from the earliest comparable official figure (around 1970 where possible) to the latest. Where those records are missing, the map shows a UN DESA 1990–2020 migrant-origin dissimilarity index and marks it — with hatching and a badge — as an estimate that understates change. Census scores and UN estimates are never coloured as if they were the same quantity. A “Why accurate records matter” section states the Canada gap (census +27.8 percentage points, 1971–2021, versus UN D 9.6) and urges statistics offices to publish accurate ethnic data.

The five census colour bands follow the 25 official scores (−10 or below, −10 to 0, 0–10, 10–20 and 20+; 5 / 6 / 6 / 5 / 3 countries), not the Crime tab’s even 20-point steps and not the earlier UN-D bands. Red is a larger increase outside the founding pool; green is a decrease or a smaller increase. Territories with fewer than 100,000 people stay in the ranked list and are flagged.

A grouping switcher, stored in the data file rather than hardcoded, filters both the map and the list. The views are: geographic region (UN M49 continents and subregions, for example Northern America); founding population (for example “All countries founded by ethnic Europeans”); the Anglosphere (the United States, the United Kingdom, Canada, Australia, New Zealand and Ireland); and data availability (census ethnic data, official series without a cross-pool score, UN estimate only, or no score). Further groups can be added in `data/demographics.json` without changing the tab code.

Country-to-pool assignments and UN M49 subregions come from the project’s `country_pool_map.csv`. Markup lives in `demographics.js` / `demographics.css`; strings live in `i18n/*.json` under the `demographics.*` prefix. Nothing is invented: if a country has no usable official series it is shown as an estimate or as having no score. Sources and limits are in `data/demographics/README.md`.

Two supplements are additional and do not change the default map colours or any country score. France, Germany and Spain show an origin series (v1.14.0) in the country panel: ethnic European share over two generations for France (89.50 in 2011 to 86.47 in 2021) and Germany (88.88 in 2023 to 87.99 in 2025, provisional, on the Census 2022 frame; the 2021 value 89.71 is a separate point labelled “Census 2011 frame, not comparable”), and first generation only for Spain (98.47 in 1998 to 84.63 in 2026). An optional control, “Change since earliest 1960–79 census”, draws the v1.15.0 baseline for countries with a published row. The number uses the same sign as the default score. Rows marked NOT VERIFIED stay in the data file and are not shown. Armenia and Georgia carry a classification-pending note.

## Adding / analysing a country
1. Make sure its ISO 3166-1 alpha-3 code is in `IN_SCOPE` (all European states except Cyprus and the dependencies already are).
2. Add one entry to `tracked`:

       FRA: { completeness: 35, provisional: true, note: "…" },

`completeness` is a score from 0 to 100; the colour band, legend, tooltip and panel follow automatically.
`provisional: true` adds "(provisional)" and a note that data collection is still in progress.
Natural Earth codes to know: Kosovo = XKX, Northern Cyprus = CYN, Somaliland = SOL.

## Age groups
- A map-level **Age group** selector (top right of the map) offers All ages, Children 0–17 (default), with 0–12 and 13–17
  as sub-options, 18–29, 30–64 and 65+. The choice is kept in `localStorage` (`harm-data-age`).
- Below the explorer's Inputs/Output box, **Figures by age group** shows the selected group for the country: one block per
  crime type (the type matching the Harm dropdown first, the others folded under "Other crime types"), each table with a
  heading naming the crime type, a one-line descriptor, the source, year and a fit flag: *Exact*, *Exact (derived)*,
  *Counted from official records* (our count of an official record-level file), *Estimated: nearest published group …*
  (the figure of that nearby group, never pro-rated) or *Not published*. Each table also lists the age groups the source
  itself publishes. Suppressed cells show as suppressed and are never filled in; survey cells on 10 or fewer cases are marked †.
- FBI "White" is shown as published (it includes Hispanic people); NIBRS figures also split White by Hispanic origin.
- Data: `data/age/index.json` lists countries with a file at `data/age/<iso3 lowercase>.json` (schema `harm-data/age-bands/v1`:
  `harms.<harm>.series[]` with `role` victims / perpetrators / cross, `groups` or `victim_groups`/`offender_groups`,
  `bands.<band>` = `{fit, approx_band, cells | matrix, note}`, `native_bands`, `sources`, `available_bands`).
  Countries without a file show their all-ages data and "No age breakdown published". Files so far: United States, United
  Kingdom (England and Wales Homicide Index victims; MoJ court defendants by 18+1 ethnicity), New Zealand (MoJ court data;
  age and ethnicity published separately, not crossed), Canada (StatCan homicide by Indigenous identity), Australia (ABS
  Aboriginal and Torres Strait Islander victims by state; offenders all ages) Germany (BKA PKS by nationality),
  Switzerland (BFS accused by residence group; assault victim rates by citizenship), Finland (Statistics Finland victims
  and suspects by origin), France (SSMSI victims and mis en cause by nationality), Italy (ISTAT victims and offenders by
  citizenship, under 18 / 18+ only), Norway (SSB victims by immigrant background; child-welfare measures), Spain (minors
  arrested/investigated by nationality), Denmark (decisions by citizenship/residence status), Netherlands (CBS suspects
  by origin, with rates), Croatia (reported minors by citizenship), North Macedonia (reported children by ethnicity),
  Sweden (school-survey victimisation and self-reported offending by origin, ninth grade), Serbia (juveniles sanctioned
  by national affiliation), Portugal (sentenced prisoners by nationality and age), Slovenia (juveniles sanctioned by
  citizenship), Estonia (school-survey victimisation by questionnaire language), Kosovo (juveniles convicted by
  nationality, 2017) and Romania (trafficking victims by citizenship, counted from the ANITP open dataset).
- Code and styles: `age.js`, `age.css`; strings: `age.*` in `i18n/*.json`. The explorer fires a `harm:explorer` event
  (`detail.iso`) whenever it renders a country, which is the only hook `age.js` needs.

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
  the total, and shown as their own figure when picked. "Ethnic European" stays "Not recorded".

### Canada data
- `data/can.json` is built by `build_can.py` (kept with the Canadian research, outside this repo). Canada scores 25%.
  Police report the racialized and Indigenous identity of homicide victims and accused; no other police-reported crime
  carries race or Indigenous identity yet. Official "racialized" / "rest of the population" categories never separately
  identify White or ethnic European people.

### France data
- `data/fra.json` is built by `build_fra.py` (kept with the French research, outside this repo). France scores 24%.
  France does not collect ethnic statistics. Police publish child victims of sexual violence, family violence and
  homicide by French or foreign nationality, and suspects by nationality — proxies, not ethnicity.

### Australia data
- `data/aus.json` is built by `build_aus.py` (kept with the Australian research, outside this repo). Australia scores 20%.
  Police and child-protection data identify Aboriginal and Torres Strait Islander children and offenders, but everyone
  else is 'non-Indigenous', so White or ethnic European Australians are never separately identified.

### New Zealand data
- `data/nzl.json` is built by `build_nzl.py` (kept with the New Zealand research, outside this repo). New Zealand scores 41%.
  It is the first country reviewed whose official police data separately identify ethnic European victims and offenders,
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

### Europe batch 5: Croatia, Serbia, Slovakia, Greece, Bulgaria
- `data/hrv.json`, `srb.json`, `svk.json`, `grc.json` and `bgr.json` are built by `build_<iso>.py` (kept with each
  country's research, outside this repo) and scored by `score_v2_batch8.py` on the stricter scale with the 19 Nov 2026
  harm weights. Croatia 16%, Serbia 13%, Slovakia 11%, Greece 11%, Bulgaria 11%, all red.
- Serbia is the only one with real ethnicity data: the Statistical Office's bulletin tabulates convicted adults by
  self-declared national affiliation (Serb, Montenegrin, Albanian, Hungarian, Muslim, Roma, Romanian, other) for each
  Criminal Code chapter, so the 25% cap does not apply. It covers perpetrators only, by chapter rather than child-specific
  offence, with 47% not declared or not known, and victims have no nationality, so the points are low. Serbia's
  child-marriage report also records Roma children, but child marriage is not one of the six harms.
- Croatia, Slovakia, Greece and Bulgaria record citizenship only (Croatian/foreign victims and perpetrators per article;
  Slovak/foreign offenders per crime group; Greek/foreign known offenders per offence; Bulgarian/other convicted persons
  per offence), so all their heritage points are proxies and the cap rule applies (none reaches it).
- Blocked or unreachable sources, recorded and not worked around: astynomia.gr (Access Denied to the box). The Hellenic
  Police yearbook was taken from the Ministry of Citizen Protection's own dataset on data.gov.gr, the government's
  official open-data portal, not from a mirror or archive.

### Europe batch 6a: Estonia, Latvia, Lithuania, Slovenia, Belarus, Moldova
- `data/est.json`, `lva.json`, `ltu.json`, `svn.json`, `blr.json` and `mda.json` are built by `build_<iso>.py` (kept with
  each country's research, outside this repo) and scored by `score_v2_batch9.py` on the stricter scale with the 19 Nov 2026
  harm weights. Slovenia 12%, Lithuania 11%, Estonia 10%, Latvia 10%, Moldova 9%, Belarus 2%, all red.
- None records ethnicity in crime data, so all heritage points are proxies and the 25% cap rule applies (none reaches it).
  Slovenia publishes convicted adults by citizenship (Slovenian / other EU / non-EU) per offence; Latvia gives the foreign
  share of suspects of sexual offences against minors; Lithuania and Moldova give citizenship only for all offences;
  Estonia's only split is the ISRD4 school survey by questionnaire language (Estonian/Russian), a language proxy. Estonia's
  prison statistics by ethnicity cover all offences and are not credited.
- Blocked or unreachable sources, recorded and not worked around: every Belarusian official site (belstat.gov.by,
  dataportal, mvd.gov.by, genproc.gov.by, court.gov.by: timeouts; pravo.by: 403). Lithuania's vrm.lrv.lt trafficking review
  returned a Cloudflare challenge to the box's own fetchers and was read with the public web-fetch tool.

### Europe batch 6b: Bosnia and Herzegovina, North Macedonia, Albania, Montenegro, Kosovo
- `data/bih.json`, `mkd.json`, `alb.json`, `mne.json` and `xkx.json` are built by `build_<iso>.py` (kept with each
  country's research, outside this repo) and scored by `score_v2_batch10.py` on the stricter scale with the 19 Nov 2026
  harm weights. North Macedonia 14%, Bosnia and Herzegovina 9%, Albania 8%, Montenegro 7%, Kosovo 7%, all red.
- Real ethnicity data: North Macedonia's statistics office tabulates reported adult perpetrators of every Criminal Code
  chapter by ethnic affiliation (about 3% unknown), so the cap does not apply; points stay moderate because it is
  perpetrators only, by chapter. Bosnia and Herzegovina's Ministry of Security bulletin gives the ethnicity (Bosniak, Serb,
  other; 24% unknown) of victims in OSCE-monitored trafficking cases, all ages, so its cap does not apply either (a
  judgement call). Kosovo's statistics agency has convicted adults by ethnicity only for all offences, to 2019: not credited.
- Albania and Montenegro publish no citizenship or ethnicity in child-harm statistics; the cap rule applies.
- Kosovo uses the code XKX (Natural Earth's KOS, mapped to XKX by `build-boundaries.sh`; not an official ISO 3166 code).
  Its status is disputed; the map shows it as a separate area, as Natural Earth does, without taking a position.
- Blocked or unreachable sources, recorded and not worked around: Montenegro's gov.me / wapi.gov.me trafficking documents
  (TLS errors; web-fetch 504); the Bosnian ministry's statistics portal (login required, not used).

### UK data
- `data/gbr.json` is generated from the research file by `to_explorer.py` (kept with the UK research, outside this repo); it
  copies every figure unchanged and only adds labels and structure. Shares are of people with known ethnicity; each block
  has `unknown_share`, shown on the page as "Ethnicity unknown: X% of the total".
- White British, White Irish, Any other White background (and Gypsy or Irish Traveller) and Pakistani are sub-groups
  (`subgroups` maps each to its parent). They are left out of the "All groups" bars so the bars do not double-count, and
  appear when picked. They are still not ethnic European, so "Ethnic European" stays "Not recorded".
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
- Scoring standard (shown in "How the score works"): 100% = published data that separately identifies
  ethnic Europeans as both victims and perpetrators, alongside every other group, linked victim to perpetrator, for
  every harm. Per harm, heritage is 75 points (37.5 victim + 37.5 perpetrator; full marks only when ethnic Europeans
  are identified separately). Coverage, rates and access together are 25 points. Proxies such as nationality or
  migration background earn at most one quarter of the heritage points. A published “White” category that
  merges Hispanic people or another group, so ethnic Europeans cannot be isolated, is also scored as a proxy
  under the same cap. A country with no real ethnicity data is
  capped at 25%. The country score is a weighted average of the six harms: homicide 25%, sexual abuse 20%,
  sex trafficking 20%, physical abuse 15%, online exploitation 10%, neglect 10% (approved 19 Nov 2026; before that,
  sexual abuse 25% and the other five 15% each). Each file's `score.weights` holds the weights in use and
  `score.previous_weights` the score under the earlier weights. Current published scores: United States 54% (59% before the heritage-conflation demerit),
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
