# Demographics tab data

`../demographics.json` is the compact file the Demographics tab loads. It is a **provisional** dataset and is **not a published finding**. The tab itself carries a provisional banner so that nothing here is read as a final result.

## What the score is

The published field is `score` (`score_id`: `D_1990_2020`): the dissimilarity index between each country’s 1990 and 2020 ethnic-pool distributions, in percentage points from 0 to 100.

D = 0.5 × sum over pools of |share_2020 − share_1990| × 100.

Native-born people are counted in the country’s primary, or founding, pool. Migrants of known origin are counted in the pool of their country of birth. Migrants of unknown origin are excluded and the remaining shares are renormalised. Movement within a pool does not change D.

The index counts first-generation migrant origin only and can understate change, because native-born descendants and native minorities are counted in the founding pool. In Canada, the census share outside the earlier majority pool rose by 27.8 percentage points, while the UN-based dissimilarity index is 9.6. The map and ranked list still use D; whether to switch to census figures is a decision still to be made.

The file also stores, for context, the 1990–2024 D, the cross-pool foreign-born share in 1990, 2020 and 2024, the change in that share, quality letters, and a census supplement where one exists. Those extra fields are not the map colour.

## Sources

- Scores and quality flags: StopBias ethnic-pools global dataset v1.3.0 (23 November 2026, America/Regina), built from the UN Department of Economic and Social Affairs, Population Division, *International Migrant Stock 2024* (POP/DB/MIG/Stock/Rev.2024).
- Primary (founding) pool, UN M49 subregion, straddles and mapping notes: the project file `country_pool_map.csv` (23 November 2026). Assignments are editorial judgements used as a starting point for the scores, not census tabulations.
- Map boundaries: Natural Earth 1:50m, public domain (`../countries-ne50m.geojson`).

Most countries do not collect ethnicity, so the scores are migrant-origin estimates and are flagged as such. They count first-generation migrants only: native-born descendants and native minorities are counted in the founding pool. Canada’s 2021 census, for example, puts the non-European share at 31.5%, while the UN-based cross-pool foreign-born share for 2020 is about 15%.

Quality letter A means foreign-born (birthplace) data; B means citizenship-based data, or over 20% of migrants of unknown origin; C means the series was imputed by UN DESA, or is citizenship-based and over 20% unknown.

No transformation scores in this file were invented. Countries and areas in the mapping file that have no UN DESA origin split (for example the Holy See) are omitted rather than given a made-up score. The Channel Islands appear as a UN DESA aggregate (M49 830) and are not a single ISO 3166-1 code; they are placed in Northern Europe and the European-descent founding group, following Jersey and Guernsey in the mapping file, and are not drawn on the map.

## Colour scale

The map and bars still run from green (least change) to red (most change), but the cut-offs are **not** the Crime tab’s even 20-point bands (0–20, 20–40, 40–60, 60–80, 80–100). Those bands would put 228 of 231 countries in a single colour, because D is low for most countries (median 0.5; only three countries are above 20). The five bands follow the observed distribution of D, with the first cut near the median and the top band open-ended around the 95th percentile. The thresholds live in `scale.bands` in the JSON so they can be changed without rewriting the tab.

| Band (D) | Colour | Countries |
|---|---|---:|
| 0–0.5 | dark green (`#1e8449`) | 111 |
| 0.5–2 | light green (`#8bc34a`) | 36 |
| 2–5 | yellow (`#f4d03f`) | 44 |
| 5–10 | orange (`#f39c12`) | 29 |
| 10+ | red (`#e74c3c`) | 11 |

A starting split of 0–2, 2–5, 5–10, 10–20 and 20+ was checked against the same scores: it still left 147 countries in the lowest band and only three in 20+. The adopted cuts spread the countries more evenly while keeping round, readable thresholds.

## Grouping views

The `views` array in `../demographics.json` defines the groupings used by both the map and the ranked list. The tab code only reads that array; new groups should be added there, not in the JavaScript. The current views are:

1. **Geographic region.** UN M49 continents and official geoscheme subregions (for example Northern America), taken from the `region` column of `country_pool_map.csv`.
2. **Founding population.** Countries grouped by `primary_pool` from the same mapping file, for example “All countries founded by ethnic Europeans”.
3. **Anglosphere.** The United States, the United Kingdom, Canada, Australia, New Zealand and Ireland.

## Known limits

- The country-to-pool mapping and the scores are still under review.
- Aboriginal Australians are handled only for Australia and are not a pool.
- There is no Turkic, Central Asian or Caucasus pool; those countries are assigned the closest of the nine pools and flagged in the mapping notes.
- Eight scored areas are not in the 1:50m map (for example Tokelau, Réunion, Gibraltar) and appear only in the ranked list.
- Small-population territories can show a high D because a small migrant stock moves the shares a long way. Areas with fewer than 100,000 people stay in the ranked list and are flagged visually (`small_population` in the JSON; 32 areas in this file). They are not dropped.
