# Media coverage data (data/media)

Format: `media-data-format.md` v1.2. Every file here is built by a committed script; nothing is
hand-edited. The site's **Media** tab (`index.html#media`, code in `media.js` / `media.css`) reads
`summary.json`, `baseline_ncvs.json` and `baseline_shr.json`.

The public name of the index is the **Antiwhite media bias index** (toggle: **Antiblack media bias
index**). Coverage Distortion Index (CDI) is the methods name for the same calculation and is not
used as a public label. A point-estimate CDI is never manufactured with a +0.5 (or any other)
correction. When a direction cell is 0, the published figure is **0 of N** plus the Clopper-Pearson
exact one-sided 95% lower bound (the headline “at least” figure). Outlet point-estimate index cells stay **pending** until an
incident-based sample exists. **Insufficient data** means the index is undefined (no covered White–Black pair incidents). A significance test (exact two-sided p, alpha 0.05) is stored on each measured country; small samples are published with their p. The 2023 keyword sample’s exact test is a worked example and is not published as a finding.

`summary.json` also stores the exact 95% interval that inverts that two-sided test (`ci95_low`,
`ci95_high` with null = unbounded, `ci_method`, `ci_scale`) and `baseline_unit`. For the US keyword
sample versus NCVS 2023 Table 13, the published Sterne interval (`ci_method`: `sterne_binomial`,
`ci_scale`: `index`) is +3.27× to unbounded; the headline remains at least +4.0×. These interval
figures come from the method’s published calculation.

The Ethnic European media bias index is a separate pairing and stays **pending** until audit data
exist. The official NCVS 2023 Table 13 ethnic European baseline (strict: Black or Hispanic) is stored
on the US record as incidents only: 726,420 non-European-on-European versus 495,650
European-on-non-European (ratio 0.682). That ratio is a baseline, not a published media index.
Table 13 incidents are canonical; do not mix with victimizations or homicides. US published values
carry an Approximate badge because White non-Hispanic is a proxy for ethnic European heritage.

| File | What it is | Built by |
|---|---|---|
| `baseline_ncvs.json` | U.S. violent incidents by offender race x victim race, 2018-2023, from BJS | `build_baseline_ncvs.py` |
| `baseline_shr.json` | FBI SHR Expanded Homicide Data Table 6, 2023, single victim/single offender (White-on-Black 324, Black-on-White 726) | `build_baseline_shr.py` |
| `incidents_2023.json` | Documented crime type and Table 6 eligibility for each coded incident id | (documented from the pilot notes; not inferred) |
| `stories_2023.csv` | 2023 Media Cloud story frame with the **strict** rule-set coding overlaid (v1.1 columns) | `convert_pilot_stories.py` |
| `stories_2023_broad.csv` | The same frame with the **broad** rule-set coding overlaid | `convert_pilot_stories.py` |
| `stories_2023_conversion.json` / `stories_2023_broad_conversion.json` | What the converter dropped, checked and counted | `convert_pilot_stories.py` |
| `summary.json` | Country- and outlet-level counts, bounds, rates, gaps and judgement calls (method_version 3.0) | `build_media_summary.py` |

Rebuild everything (from the repo root; needs Python 3, curl and `pdftotext` from poppler-utils):

```sh
python3 data/media/build_baseline_ncvs.py
python3 data/media/build_baseline_shr.py --generated YYYY-MM-DD
python3 data/media/convert_pilot_stories.py --frame <pilot>/stories_2023.csv \
    --coded-strict <pilot>/coded_2023_pass1.csv --coded-broad <pilot>/coded_2023_pass1b.csv
python3 data/media/build_media_summary.py --generated YYYY-MM-DD
```

## 1. Crime baseline (`baseline_ncvs.json`)

**Source:** Bureau of Justice Statistics (BJS), National Crime Victimization Survey (NCVS), annual
*Criminal Victimization* bulletins. Only figures printed in BJS tables are used. Nothing is estimated,
interpolated or derived. The script downloads each PDF, checks its SHA-256, extracts the text with
`pdftotext -layout`, and reads the White and Black victim rows of the table below, plus the matching
standard-error table.

| Year | Report (PDF) | Table (PDF page) | Standard errors | What is published |
|---|---|---|---|---|
| 2018 | [Criminal Victimization, 2018](https://bjs.ojp.gov/content/pub/pdf/cv18.pdf) (NCJ 253043) | Table 14 (p. 13) | Appendix table 19 | **Percentages only.** Count left null |
| 2019 | [Criminal Victimization, 2019](https://bjs.ojp.gov/content/pub/pdf/cv19.pdf) (NCJ 255113) | Table 15 (p. 18) | Appendix table 18 | Counts |
| 2020 | [Criminal Victimization, 2020](https://bjs.ojp.gov/sites/g/files/xyckuh236/files/media/document/cv20.pdf) (NCJ 301775) | none | none | **No offender-by-victim race table.** All null |
| 2021 | [Criminal Victimization, 2021](https://bjs.ojp.gov/content/pub/pdf/cv21.pdf) (NCJ 305101, rev. 2023-07-05) | Table 13 (p. 12) | Appendix table 14 (p. 27) | Counts plus an Unknown-offender column |
| 2022 | [Criminal Victimization, 2022](https://bjs.ojp.gov/document/cv22.pdf) (NCJ 307089) | Table 13 (p. 13) | Appendix table 14 | Counts plus an Unknown-offender column |
| 2023 | [Criminal Victimization, 2023](https://bjs.ojp.gov/document/cv23.pdf) (NCJ 309335, rev. 2025-06-09) | Table 13 (p. 13) | Appendix table 14 | Counts plus an Unknown-offender column |

**Definitions, from the table notes:**
- **Unit: violent incidents.** An incident is a specific criminal act involving one or more victims. These are incidents, not victimizations or persons.
- **Coverage:** rape or sexual assault, robbery, and aggravated and simple assault, against persons aged 12 or older in U.S. households. Homicide is not covered by the NCVS.
- **Race:** White and Black are non-Hispanic. Offender race or Hispanic origin is the victim's perception.
- **Hispanic and multiple offenders:**
  - 2019 and 2021: any perceived Hispanic offender made the whole group Hispanic.
  - 2022 and 2023: a group counts as Hispanic only if all offenders were perceived as Hispanic. Mixed groups go to Other.
  - 2018: the notes do not state the Hispanic rule. Mixed-race groups are a separate column.
  - In every year, the White and Black columns mean a single offender, or a group in which every offender was perceived as that race.
- **Unknown offender race:**
  - 2018 and 2019 exclude incidents where the offender's race was unknown (11% and 16% of incidents).
  - 2021 to 2023 publish an Unknown column, which is included here.
- **`se`** is BJS's published standard error, in the same unit as the count. **`bjs_flags`** copies BJS's markers:
  - † and ‡ mean significant against that row's comparison group.
  - ! means interpret with caution.
  - None of these flags tests White-on-Black against Black-on-White.
- **No motive.** These figures are not hate-crime or bias-crime counts and must not be described that way.
- **Not a strict time series.** The rule changes above, the 2018 percent-only table and the missing 2020 table all break comparability.

**Sources checked but not used:**
- The **NCVS API** at data.ojp.usdoj.gov was unreachable from our build machine on 2026-11-19. The TLS connection was reset, and a second fetcher got HTTP 500. We did not work around this. It also counts victimizations on a collection-year basis, not incidents.
- The **NCVS Dashboard** (https://ncvs.bjs.ojp.gov/) has no offender-race variable.

## 2. Stories (`stories_2023.csv` and `stories_2023_broad.csv`)

Joseph's pilot files are in `/workspace/stopbias/pilot` on the team box and are never modified:
- `stories_2023.csv` is the 1,500-story Media Cloud frame. It already uses the v1.1 columns, and every row is uncoded.
- `coded_2023_pass1.csv` is the 300-story random sample under the **strict** rule set, seed 20261119. It has the v1.1 columns plus `sample_weight`, `sample_order` and `fetch_status`.
- `coded_2023_pass1b.csv` is the same sample under the **broad** rule set.

The coded files do not conform exactly, so `convert_pilot_stories.py` builds each output as follows:
- It takes every frame row.
- For each story in the sample, it copies the coded file's v1.1 columns verbatim.
- It drops the extra columns that are not in the format.
- It checks the identity fields and the allowed values, and writes a conversion report beside each CSV.

Nothing is inferred. The latest conversion found 0 identity mismatches and 0 value violations in both rule sets.

## 3. Summary (`summary.json`) and CDI

The Coverage Distortion Index (CDI) is the methods name for the calculation behind the Antiwhite
media bias index. It is not a second public label. For a given pairing and baseline:

`CDI = (W_m / B_m) / (W_b / B_b)`

- **Media counts** (`W_m`, `B_m`) are included stories or incidents (`include=true`) in that direction. Stories of the same incident are a cluster; the preferred country inference is the incident-level figure.
- **Baselines** are not pooled. Homicide is compared with FBI SHR Expanded Homicide Data Table 6 (single victim/single offender). Non-fatal violence, and the mixed keyword-sample country bound, are compared with NCVS for the same year.
- **Zero cells:** no +0.5, or any other constant, is added to manufacture a point estimate. When a direction cell is 0, `cdi` is null and the published figure is **0 of N** plus the Clopper-Pearson exact one-sided 95% lower bound. `zero_adjust_applied` is always false.
- **Null CDI:** `cdi` is also null when both media cells are 0, when there is no published baseline count for that comparison, when there are fewer than 20 included incidents (Insufficient data), or for an outlet until an incident-based sample exists (outlet index cells stay **pending**).

The judgement calls (for example, which query phrases count, and what each rate's denominator is) are listed inside `summary.json`.

**2023 coding status** (from `summary.json`; a PILOT, one coder, no second coder or agreement rate yet).
The figures come from a stratified random sample of 300 keyword-matched 2023 Media Cloud stories
(AP 31, a census of its frame; CNN 29; Fox 95; NYT 80; WaPo 65). All five outlets have been coded
by a single coder. Six sample rows could not be coded (fetch failures): AP 31 of 31, NYT 80 of 80,
Fox 94 of 95, CNN 27 of 29, WaPo 62 of 65. Under the strict rule set the included set is 14 stories
(12 White-on-Black, 0 Black-on-White, 2 other) and 6 incidents; under broad, 25 stories (16 / 0 / 9)
and 8 incidents. That is fewer than 20 included incidents, so a point-estimate index is not
published. A zero Black-on-White cell is shown as 0 of N plus the exact one-sided 95% lower bound.
The keyword frame is not a random sample of interracial incidents. The story frame comes mostly
from anti-Black framing queries, so it is expected to under-sample Black-on-White stories.
