# Media coverage data (data/media)

Format: `media-data-format.md` v1.1 (agreed by Christa and Joseph on 2026-11-19). Every file here is
built by a committed script; nothing is hand-edited. The site's **Media coverage** tab
(`index.html#media`, code in `media.js` / `media.css`) reads `summary.json` and `baseline_ncvs.json`.

| File | What it is | Built by |
|---|---|---|
| `baseline_ncvs.json` | U.S. violent incidents by offender race x victim race, 2018-2023, from BJS | `build_baseline_ncvs.py` |
| `stories_2023.csv` | 2023 Media Cloud story frame, with the pilot hand-coding merged in (v1.1 columns only) | `convert_pilot_stories.py` |
| `stories_2023_conversion.json` | What the converter dropped, checked and counted | `convert_pilot_stories.py` |
| `summary.json` | Per-outlet raw counts, Coverage Distortion Index (CDI), rates, gaps, judgement calls | `build_media_summary.py` |

Rebuild everything (from the repo root; needs Python 3, curl and `pdftotext` from poppler-utils):

```sh
python3 data/media/build_baseline_ncvs.py
python3 data/media/convert_pilot_stories.py --frame <pilot>/stories_2023.csv --coded <pilot>/coded_2023_pass1.csv
python3 data/media/build_media_summary.py
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

## 2. Stories (`stories_2023.csv`)

Joseph's pilot files are in `/workspace/stopbias/pilot` on the team box and are never modified:
- `stories_2023.csv` is the 1,500-story Media Cloud frame. It already uses the v1.1 columns, and every row is uncoded.
- `coded_2023_pass1.csv` is the 300-story random sample, seed 20261119. It has the v1.1 columns plus `sample_weight`, `sample_order` and `fetch_status`.

The coded file does not conform exactly, so `convert_pilot_stories.py` builds the output as follows:
- It takes every frame row.
- For each story in the sample, it copies the coded file's v1.1 columns verbatim.
- It drops the three extra columns.
- It checks the identity fields and the allowed values, and writes `stories_2023_conversion.json`.

Nothing is inferred. On 2026-11-19 the converter found 0 identity mismatches and 0 value violations.

## 3. Summary (`summary.json`) and CDI

For each outlet and year, the CDI is:

`CDI = (stories_W_on_B / stories_B_on_W) / (ncvs_W_on_B / ncvs_B_on_W)`

- **Story counts** are coded stories with `include=true` in that direction. **NCVS counts** are the same year's incidents.
- **Zero cells:** if exactly one media count is 0, 0.5 is added to both media counts and `zero_adjust_applied` is set to true. The raw counts are always printed, and the result is never infinity.
- **Null CDI:** `cdi` is null when there are no coded stories, when no included story falls in either direction, or when there is no published NCVS count for that year.

The judgement calls (for example, which query phrases count, and what each rate's denominator is) are listed inside `summary.json`.

**2023 is a PILOT with partial coding.** Fox News and CNN are coded by a single coder. AP, The New York
Times and The Washington Post are not yet coded. There is no second coder or agreement rate yet.
The story frame comes mostly from anti-Black framing queries, so it is expected to under-sample
Black-on-White stories. The pilot CDI values are not findings.
