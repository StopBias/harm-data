# Demographics tab data

`../demographics.json` is the compact file the Demographics tab loads. It is a **provisional** dataset (`version`: `0.2.0-provisional`) and is **not a published finding**. The tab itself carries a provisional banner so that nothing here is read as a final result.

## What the score is

The map and ranked list are **census first**.

When a country publishes ethnicity, race, ancestry or migration-background data that can be mapped to its founding (primary) pool, `score` in this file is the change, in percentage points, in the share of the population **outside that pool**, from the earliest comparable official figure (around 1970 where possible) to the latest. The field is `census.change_outside_founding_pool`. A positive stored figure means the founding pool’s share fell; a negative stored figure means it rose. `score_kind` is `census` and `availability` is `census`. The tab does not paint that stored score. It paints the percent change in the founding share, (latest share − first share) / first share × 100, and only when both shares are present.

The tab does not display that stored figure. It shows the change in the founding population’s share, which is `latest_share_in_founding_pool − first_share_in_founding_pool` where both shares exist, otherwise `−(change_outside_founding_pool)`. Canada is −27.8, the United States −25.4, Kazakhstan +39.9. The values in this file are left as stored.

Where no such series exists, the file still holds the UN DESA International Migrant Stock 2024 dissimilarity index between 1990 and 2020 (`un_d_1990_2020`, `score_id`: `D_1990_2020`) and `score_change_pp_1990_2020`, the change in the foreign-born share from outside the founding pool. D = 0.5 × sum over pools of |share_2020 − share_1990| × 100. The tab’s displayed proxy is `−(score_change_pp_1990_2020)`, on the same signed founding-share scale and the same colours as the census rows. D stays in the country pop-up as a secondary line. These rows are labelled `score_kind`: `estimate` and `availability`: `estimate`. They are not hatched.

Australia and Israel have official statistical-office series that cannot be turned into a cross-pool founding-pool score without inventing a mapping (Australia has no ethnicity/race question; Israel’s Jews and Arabs both sit in the Semitic / Middle East and North Africa pool). Peru’s Indigenous mother-tongue series is a weak proxy held off the ranked list pending a ruling, the same way Mexico’s language-speaker proxy is already an open question. Indonesia (2010) and Zimbabwe (2022) are single official census points with no comparable earlier figure, so they have no change score. All five are stored as `availability`: `census_limited`, keep the official series and notes in `census`, and the tab shows the UN proxy on the map and ranked list.

Every country record stores the source, years and metric used. No scores in this file were invented.

## Why accurate records matter

Most countries do not record ethnicity, race or ancestry in their census. Without those records, the public cannot see how the ethnic composition of a country has changed. First-generation migrant-origin counts miss later generations and understate change. In Canada, the founding population’s share of ethnic Europeans fell by 28.9% from 1971 to 2021 (96.3% to 68.5%; Statistics Canada), while the UN-based dissimilarity index is 9.6. The file stores the outside-pool change as +27.8 percentage points. Statistics offices are urged to publish accurate, comparable ethnic data so this change can be measured rather than hidden by incomplete records.

`world_context` holds a geographic series, not an ethnicity series: UN World Population Prospects 2024, showing Europe, Northern America and Oceania together as a share of world population (29.26% in 1950, 14.41% in 2024). It is context about where people live, not a substitute for ethnic records.

`regional_averages` are UN migrant-origin estimates, population-weighted, and likewise understate change. They are included for context, not as census figures.

## Counts in this file

| Availability | Meaning | Countries |
|---|---|---:|
| `census` | Official ethnicity, race, ancestry or migration-background series, with a computed change outside the founding pool | 30 |
| `census_limited` | Official series not used as a founding-share headline (Australia, Israel, Peru, Indonesia, Zimbabwe) | 5 |
| `estimate` | UN migrant-origin D only | 196 |
| `none` | No score | 0 |
| **Total** | UN DESA areas in the source manifest | **231** |

## Colour scale

`scale.bands` in the data file is the older outside-pool cut and is not what the tab paints. The tab colours the percent change as shown (census figures to 1 decimal, UN proxy figures to 2) with half-open bands in `demographics-scale.js`:

| Shown percent change | Colour |
|---|---|
| above +2% | dark green (`#1e8449`), Growing |
| −2% to +2% | green (`#8bc34a`), Stable |
| −7% up to but not including −2% | light red (`#f5b7b1`), Declining |
| −15% up to but not including −7% | mid red (`#ec7165`), Strongly declining |
| below −15% | bright red (`#e74c3c`), Very strongly declining |

A shown 0.000 is treated as 0. Nigeria (0), India (+0.006) and China (−0.031) are green. The same function colours the map and the ranked bars. `scale.estimate_bands` remains in the file and is not used. No-score grey stays `#b9bfc4` and out-of-group grey stays `#eceeef`.

## Grouping views

The `views` array in `../demographics.json` defines the groupings used by both the map and the ranked list. The tab code only reads that array; new groups should be added there, not in the JavaScript. The current views are:

1. **Geographic region.** UN M49 continents and official geoscheme subregions (for example Northern America), taken from the `region` column of `country_pool_map.csv`.
2. **Founding populations.** Countries grouped by `primary_pool` from the same mapping file, for example “All countries founded by ethnic Europeans”. The dropdown keeps the EUR, MENA, SAS, EAS, SEA and SSA pools, and includes the Anglosphere (the United States, the United Kingdom, Canada, Australia, New Zealand and Ireland) as an option in that same list. North American Indigenous, Amerindian and Pacific Islander are not shown as filter options. There is no separate Data availability view.

## Sources

- Census scores, official notes, checkpoints, flags (weak proxy, concept break) and the 30 + 5 country supplement: StopBias ethnic-pools global dataset **v1.13.0** (23 November 2026). The standalone v1.14.0 (France, Germany and Spain origin series) and v1.15.0 (1960–79 baselines) supplements are already in this folder and are unchanged here. Compiled from official statistical-office census and population-register series. No figures were invented.
- Fallback scores and quality flags: the same dataset, built from the UN Department of Economic and Social Affairs, Population Division, *International Migrant Stock 2024* (POP/DB/MIG/Stock/Rev.2024).
- Regional averages: `regional_averages.csv` in that dataset (UN migrant-origin estimates, labelled as such).
- World population shares: `world_context.csv` in that dataset, from UN DESA *World Population Prospects 2024* (2024 is the medium-variant projection year). Geographic regions, not ethnicity.
- Primary (founding) pool, UN M49 subregion, straddles and mapping notes: the project file `country_pool_map.csv`. Assignments are editorial judgements used as a starting point for the scores, not census tabulations. From v1.4.0 of the global dataset, the census headline uses this founding pool when the census maps it (for example Kazakhstan is scored on the East Asian founding pool, not a late-Soviet European-descent plurality).
- Map boundaries: Natural Earth 1:50m, public domain (`../countries-ne50m.geojson`).

Quality letter A (UN estimates only) means foreign-born (birthplace) data; B means citizenship-based data, or over 20% of migrants of unknown origin; C means the series was imputed by UN DESA, or is citizenship-based and over 20% unknown.

The Channel Islands appear as a UN DESA aggregate (M49 830) and are not a single ISO 3166-1 code; they are placed in Northern Europe and the European-descent founding group, following Jersey and Guernsey in the mapping file, and are not drawn on the map.

## Known limits

- This file is provisional. The country-to-pool mapping and several census series are still under review. Fifteen primary-pool assignments (listed in `mapping_diff.csv`) and whether Nepal’s Tibeto-Burman groups and Laos’s Hmong count as East Asian remain provisional; this fold-in keeps the existing project map (ethnic European pool; Turkey locked to the Middle East; South Africa scored on its ethnic European population).
- Several census series have a concept break or a weak-proxy flag in `census.notes` (for example New Zealand’s switch from prioritised ethnicity to total responses; Mexico’s use of Indigenous-language speakers; Bolivia’s 2024 figure, now taken from the official INE Anuario Estadístico 2024 workbook). Those flags are preserved; the headline figure is still Adi’s published change, not a recast invented here.
- Aboriginal Australians are handled only for Australia and are not a pool.
- There is no Turkic, Central Asian or Caucasus pool; those countries are assigned the closest of the nine pools and flagged in the mapping notes.
- Eight scored areas are not in the 1:50m map (for example Tokelau, Réunion, Gibraltar) and appear only in the ranked list.
- Small-population territories can show a high UN D because a small migrant stock moves the shares a long way. Areas with fewer than 100,000 people stay in the ranked list and are flagged visually (`small_population` in the JSON). They are not dropped.
- Census founding-share changes and the UN migrant-origin proxy measure different things. The tab lists census rows first, tags the proxy, and keeps the dissimilarity index D as a secondary line in the pop-up.

## Supplements

Three standalone releases sit beside this file. The origin series and the 1960–79 baseline do not alter stored `score`, the colour bands, or the default map. The pre-1950 file is the first point of the default percent change for seven countries. Stored `score` values in `demographics.json` are not rewritten.

- `origin_series_FR_DE_ES.json` (v1.14.0) is an extra block on France, Germany and Spain. France and Germany cover two generations. Spain is first generation only, so the Spain-born children of immigrants stay inside the ethnic European share. Germany’s 2021 point is the Census 2011 frame and is not joined to the Census 2022 series. A footnote gives the sensitivity case that excludes North America. Each connected series also shows the change in the ethnic European share, and a fall is negative.
- `baseline_1960_1979.json` (v1.15.0), with `baseline_1960_1979.csv`, remains as a data release only. The file stores the change in the founding share (a negative figure means the founding share fell). It is not wired to a toggle or any other view on the tab. Rows whose `verification` contains `NOT VERIFIED` (Guatemala, Kenya, Viet Nam, Zimbabwe, Guyana, Bolivia) stay in the file. Armenia and Georgia are counted as ethnic European, with a classification-pending note in the file.
- `baseline_pre1950.json` (v1.16.0), with `baseline_pre1950.csv`, stores official pre-1950 ethnic European census baselines for eight countries. The default map uses each verified share that has a latest endpoint as the first point of the existing relative percent change, (latest share − first share) / first share × 100. Italy runs from the 1936 citizenship residual (99.98% ethnic European) to the UN estimate the map already used (95.498% in 2020). Australia has no comparable official latest founding share, so the 1911 figure is a popup indicator only and Australia’s map score is unchanged. There is no new toggle, and this does not use the 1960–79 file. Australia 1911 and New Zealand 1936 are official race tabulations; Germany 1933, France 1931, Spain 1930 and Italy 1936 are nationality residuals; the United Kingdom 1931 figure is a birthplace residual for Great Britain only; Ireland 1936 is a birthplace residual for Saorstát Éireann. These early figures are not strictly comparable across countries, or with later ethnicity or ancestry series. Italy’s census had no birthplace or ethnicity question, so naturalised or born-abroad Italians count as Italian. European country columns sum 90 above the printed Europe total; the printed total is used. Every scored row is a concept or territory break against its latest point. Germany, France and Spain use the latest verified origin-series share. Italy’s latest point is the UN estimate, not a national census.
