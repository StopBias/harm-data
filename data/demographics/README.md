# Demographics tab data

`../demographics.json` is the compact file the Demographics tab loads. It is a **provisional** dataset (`version`: `0.2.0-provisional`) and is **not a published finding**. The tab itself carries a provisional banner so that nothing here is read as a final result.

## What the score is

The map and ranked list are **census first**.

When a country publishes ethnicity, race, ancestry or migration-background data that can be mapped to its founding (primary) pool, `score` in this file is the change, in percentage points, in the share of the population **outside that pool**, from the earliest comparable official figure (around 1970 where possible) to the latest. The field is `census.change_outside_founding_pool`. A positive stored figure means the founding pool’s share fell; a negative stored figure means it rose. `score_kind` is `census` and `availability` is `census`.

The tab does not display that stored figure. It shows the change in the founding population’s share, which is `latest_share_in_founding_pool − first_share_in_founding_pool` where both shares exist, otherwise `−(change_outside_founding_pool)`. Canada is −27.8, the United States −25.4, Kazakhstan +39.9. The values in this file are left as stored.

Where no such series exists, the file still holds the UN DESA International Migrant Stock 2024 dissimilarity index between 1990 and 2020 (`un_d_1990_2020`, `score_id`: `D_1990_2020`) and `score_change_pp_1990_2020`, the change in the foreign-born share from outside the founding pool. D = 0.5 × sum over pools of |share_2020 − share_1990| × 100. The tab’s displayed proxy is `−(score_change_pp_1990_2020)`, on the same signed founding-share scale and the same colours as the census rows. D stays in the country pop-up as a secondary line. These rows are labelled `score_kind`: `estimate` and `availability`: `estimate`. They are not hatched.

Australia and Israel have official statistical-office series that cannot be turned into a cross-pool founding-pool score without inventing a mapping (Australia has no ethnicity/race question; Israel’s Jews and Arabs both sit in the Semitic / Middle East and North Africa pool). They are stored as `availability`: `census_limited`, keep the official series and notes in `census`, and the tab shows the UN proxy above because they have no founding-share figure.

Every country record stores the source, years and metric used. No scores in this file were invented.

## Why accurate records matter

Most countries do not record ethnicity, race or ancestry in their census. Without those records, the public cannot see how the ethnic composition of a country has changed. First-generation migrant-origin counts miss later generations and understate change. In Canada, the founding population’s share of ethnic Europeans fell by 27.8 percentage points from 1971 to 2021 (Statistics Canada), while the UN-based dissimilarity index is 9.6. The file stores the outside-pool change as +27.8. Statistics offices are urged to publish accurate, comparable ethnic data so this change can be measured rather than hidden by incomplete records.

`world_context` holds a geographic series, not an ethnicity series: UN World Population Prospects 2024, showing Europe, Northern America and Oceania together as a share of world population (29.26% in 1950, 14.41% in 2024). It is context about where people live, not a substitute for ethnic records.

`regional_averages` are UN migrant-origin estimates, population-weighted, and likewise understate change. They are included for context, not as census figures.

## Counts in this file

| Availability | Meaning | Countries |
|---|---|---:|
| `census` | Official ethnicity, race, ancestry or migration-background series, with a computed change outside the founding pool | 25 |
| `census_limited` | Official series that cannot support a cross-pool score (Australia, Israel) | 2 |
| `estimate` | UN migrant-origin D only | 204 |
| `none` | No score | 0 |
| **Total** | UN DESA areas in the source manifest | **231** |

## Colour scale

The census bands in `scale.bands` are cut on the stored outside-pool change. The tab mirrors them onto founding-share change and keeps each colour on the same countries: red is a larger decline in the founding population’s share (−20 or below), green is a rise or a smaller decline (10+ at the far end). They are **not** the Crime tab’s even 20-point completeness bands, and they are **not** the v1 UN-D bands (0–0.5, 0.5–2, 2–5, 5–10, 10+). The UN proxy uses these same bands. `scale.estimate_bands` remains in the file and is not used for colour.

| Stored band (outside-pool change, pp) | Shown as founding-share change | Colour | Census countries |
|---|---|---|---:|
| −10 or below | 10+ | dark green (`#1e8449`) | 5 |
| −10 to 0 | 0–10 | light green (`#8bc34a`) | 6 |
| 0–10 | −10 to 0 | yellow (`#f4d03f`) | 6 |
| 10–20 | −20 to −10 | orange (`#f39c12`) | 5 |
| 20+ | −20 or below | red (`#e74c3c`) | 3 |

A starting split of even 20-point steps would collapse almost all of the census scores into one or two colours. The adopted cuts spread the 25 official scores across all five steps.

## Grouping views

The `views` array in `../demographics.json` defines the groupings used by both the map and the ranked list. The tab code only reads that array; new groups should be added there, not in the JavaScript. The current views are:

1. **Geographic region.** UN M49 continents and official geoscheme subregions (for example Northern America), taken from the `region` column of `country_pool_map.csv`.
2. **Founding population.** Countries grouped by `primary_pool` from the same mapping file, for example “All countries founded by ethnic Europeans”.
3. **Anglosphere.** The United States, the United Kingdom, Canada, Australia, New Zealand and Ireland.
4. **Data availability.** Census ethnic data, official series without a cross-pool score, UN estimate only, or no score.

## Sources

- Census scores, official notes, checkpoints, flags (weak proxy, concept break) and the 25 + 2 country supplement: StopBias ethnic-pools global dataset **v1.7.0** (24 November 2026; the VERSION file is dated 2026-11-24). Compiled from official statistical-office census and population-register series. No figures were invented.
- Fallback scores and quality flags: the same dataset, built from the UN Department of Economic and Social Affairs, Population Division, *International Migrant Stock 2024* (POP/DB/MIG/Stock/Rev.2024).
- Regional averages: `regional_averages.csv` in that dataset (UN migrant-origin estimates, labelled as such).
- World population shares: `world_context.csv` in that dataset, from UN DESA *World Population Prospects 2024* (2024 is the medium-variant projection year). Geographic regions, not ethnicity.
- Primary (founding) pool, UN M49 subregion, straddles and mapping notes: the project file `country_pool_map.csv`. Assignments are editorial judgements used as a starting point for the scores, not census tabulations. From v1.4.0 of the global dataset, the census headline uses this founding pool when the census maps it (for example Kazakhstan is scored on the East Asian founding pool, not a late-Soviet European-descent plurality).
- Map boundaries: Natural Earth 1:50m, public domain (`../countries-ne50m.geojson`).

Quality letter A (UN estimates only) means foreign-born (birthplace) data; B means citizenship-based data, or over 20% of migrants of unknown origin; C means the series was imputed by UN DESA, or is citizenship-based and over 20% unknown.

The Channel Islands appear as a UN DESA aggregate (M49 830) and are not a single ISO 3166-1 code; they are placed in Northern Europe and the European-descent founding group, following Jersey and Guernsey in the mapping file, and are not drawn on the map.

## Known limits

- This file is provisional. The country-to-pool mapping and several census series are still under review.
- Several census series have a concept break or a weak-proxy flag in `census.notes` (for example New Zealand’s switch from prioritised ethnicity to total responses; Mexico’s use of Indigenous-language speakers; Bolivia’s 2024 figure, which comes from press reports of INE results). Those flags are preserved; the headline figure is still Adi’s published change, not a recast invented here.
- Aboriginal Australians are handled only for Australia and are not a pool.
- There is no Turkic, Central Asian or Caucasus pool; those countries are assigned the closest of the nine pools and flagged in the mapping notes.
- Eight scored areas are not in the 1:50m map (for example Tokelau, Réunion, Gibraltar) and appear only in the ranked list.
- Small-population territories can show a high UN D because a small migrant stock moves the shares a long way. Areas with fewer than 100,000 people stay in the ranked list and are flagged visually (`small_population` in the JSON). They are not dropped.
- Census founding-share changes and the UN migrant-origin proxy measure different things. The tab lists census rows first, tags the proxy, and keeps the dissimilarity index D as a secondary line in the pop-up.
