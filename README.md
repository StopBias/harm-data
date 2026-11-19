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
- To add a country (e.g. the UK): create `data/<iso3 lowercase>.json` (e.g. `data/gbr.json`) in the same format as
  `data/usa.json`, and add its ISO3 code to `"detailed"` in `data/index.json`. No code changes are needed. The
  manifest means the page only requests files that exist, so there are no 404 errors for countries without one.
- Optional text fields keep wording out of the code: `short_name`, `name_in_sentence`, `extra_group_labels`,
  `combined_groups`, `not_recorded` on a group (with `european_note`/`european_title`), `score.why`, per-harm
  `extra_sources`/`rate_sources`, and for cross tables `pair_sentence`, `row_intro`, `col_intro` (with `{victim}`/`{perp}`) and `overview`.

### US data
- `data/usa.json` holds every US figure, source and the score, kept apart from the code. `index.html` loads it,
  sets the USA score (56) on the map, and builds the dropdowns (harm, victim's heritage, perpetrator's heritage,
  share % vs rate per 100,000), the explanation panel, the expandable source list and the "How the score works" box.
- Each harm has `victims`, `perpetrators` and `cross` (victim × perpetrator) blocks with a `status`:
  `published`, `not_published` (recorded but no public table), `not_recorded`, or `pending` (published, not yet added).
  Missing combinations are shown on the page, never hidden.
- Figures come only from: HHS Child Maltreatment 2024, BJS Race and Hispanic Origin of Victims and Offenders 2012–15 (NCVS),
  BJS Human Trafficking Data Collection Activities 2025, US Sentencing Commission Quick Facts FY2024, and Census Vintage 2025
  population estimates (denominators for the federal-defendant rates). Sources and limitations are in the `sources` block.
- Scoring standard: 100% = published data that separately identifies people of European descent as both victims and
  perpetrators, alongside every other group, linked victim to perpetrator, for every harm. See `score` in `data/usa.json`.
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
