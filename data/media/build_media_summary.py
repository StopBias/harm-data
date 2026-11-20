#!/usr/bin/env python3
"""Build data/media/summary.json from data/media/stories_<year>.csv and data/media/baseline_ncvs.json.

Format: media-data-format.md v1.1 (summary method_version 1.0). summary.json is computed, never hand-edited.

Coverage Distortion Index (CDI), per outlet and year:
    CDI = (stories_W_on_B / stories_B_on_W) / (ncvs_W_on_B / ncvs_B_on_W)
  * stories_* = hand-coded stories with coded=true, include=true and that direction.
  * ncvs_* = BJS NCVS violent incidents for the same year (offender race -> victim race).
  * If exactly one media cell is 0, 0.5 is added to BOTH media cells (zero_adjust_applied=true);
    the raw counts stay unadjusted in the output. Never infinity.
  * cdi = null when any input is missing: no coded stories, no included directional story
    (both cells 0), or no published NCVS count for that year.
CDI = 1 means the outlet's story ratio matches the NCVS incident ratio; > 1 means relatively more
White-on-Black stories; < 1 relatively more Black-on-White stories.

Usage (repo root):  python3 data/media/build_media_summary.py [--generated YYYY-MM-DD]
"""
import argparse, csv, datetime, glob, json, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
OUTLETS = ["AP", "NYT", "Fox", "CNN", "WaPo"]
OUTLET_NAMES = {"AP": "Associated Press", "NYT": "The New York Times", "Fox": "Fox News", "CNN": "CNN", "WaPo": "The Washington Post"}
OUTLET_DOMAINS = {"AP": "apnews.com", "NYT": "nytimes.com", "Fox": "foxnews.com", "CNN": "cnn.com", "WaPo": "washingtonpost.com"}
PILOT_YEARS = {2023}
REPO = "https://github.com/StopBias/harm-data/blob/main/data/media/"


def ncvs_lookup(baseline):
    out = {}
    for r in baseline["rows"]:
        out[(r["year"], r["offender_race"], r["victim_race"])] = r
    return out


def rate(num, den):
    return None if den == 0 else round(num / den, 4)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--generated", default=datetime.date.today().isoformat())
    ap.add_argument("--dir", default=HERE)
    a = ap.parse_args()
    with open(os.path.join(a.dir, "baseline_ncvs.json"), encoding="utf-8") as f:
        baseline = json.load(f)
    ncvs = ncvs_lookup(baseline)

    by_outlet_year, gaps, conv_reports = [], [], {}
    files = sorted(glob.glob(os.path.join(a.dir, "stories_*.csv")))
    for path in files:
        m = re.search(r"stories_(\d{4})\.csv$", path)
        if not m:
            continue
        year = int(m.group(1))
        with open(path, newline="", encoding="utf-8") as f:
            rows = list(csv.DictReader(f))
        rep = os.path.splitext(path)[0] + "_conversion.json"
        if os.path.exists(rep):
            with open(rep, encoding="utf-8") as f:
                conv_reports[year] = json.load(f)
        wb = ncvs.get((year, "White", "Black"), {})
        bw = ncvs.get((year, "Black", "White"), {})
        n_wb, n_bw = wb.get("count"), bw.get("count")
        for o in OUTLETS:
            rs = [r for r in rows if r["outlet"] == o]
            coded = [r for r in rs if r["coded"] == "true"]
            inc = [r for r in coded if r["include"] == "true"]
            w = sum(1 for r in inc if r["direction"] == "W_on_B")
            b = sum(1 for r in inc if r["direction"] == "B_on_W")
            oth = sum(1 for r in inc if r["direction"] == "other")
            zero_adj, cdi, reason = False, None, None
            if not coded:
                reason = "no coded stories"
            elif w == 0 and b == 0:
                reason = "no included White-on-Black or Black-on-White stories in the coded sample"
            elif not n_wb or not n_bw:
                reason = f"no published NCVS count for {year}"
            else:
                mw, mb = float(w), float(b)
                if w == 0 or b == 0:
                    mw, mb, zero_adj = mw + 0.5, mb + 0.5, True
                cdi = round((mw / mb) / (n_wb / n_bw), 2)
            photo_yn = [r for r in inc if r["photo"] in ("yes", "no")]
            fm = [r for r in inc if r["first_mention_para"].strip() != ""]
            hl = [r for r in inc if r["headline_mentions_race"] in ("yes", "no")]
            row = {
                "outlet": o, "year": year,
                "stories_W_on_B": w, "stories_B_on_W": b,
                "ncvs_W_on_B": n_wb, "ncvs_B_on_W": n_bw,
                "zero_adjust_applied": zero_adj, "cdi": cdi,
                "stories_total": len(rs),
                "headline_rate": rate(sum(1 for r in hl if r["headline_mentions_race"] == "yes"), len(hl)),
                "coded_sample_n": len(coded),
                "pct_first_para": rate(sum(1 for r in fm if r["first_mention_para"].strip() in ("1", "2")), len(fm)),
                "photo_rate": rate(sum(1 for r in photo_yn if r["photo"] == "yes"), len(photo_yn)),
                "stance": {s: sum(1 for r in inc if r["stance"] == s) for s in ("affirming", "neutral", "dismissive")},
                # extra context fields (beside the v1.1 fields; raw counts for every rate above)
                "outlet_name": OUTLET_NAMES[o],
                "included_n": len(inc), "stories_other": oth,
                "headline_rate_n": len(hl), "pct_first_para_n": len(fm), "photo_rate_n": len(photo_yn),
                "ncvs_W_on_B_se": wb.get("se"), "ncvs_B_on_W_se": bw.get("se"),
                "cdi_null_reason": reason,
                "pilot": year in PILOT_YEARS,
                "media_source": f"Media Cloud (onlinenews-mediacloud) keyword-matched stories on {OUTLET_DOMAINS[o]}, {year}; rows in {REPO}stories_{year}.csv",
            }
            if year in PILOT_YEARS and conv_reports.get(year):
                bo = conv_reports[year]["counts"]["by_outlet"].get(o, {})
                row["sample_n"] = bo.get("in_sample")
                row["coding_complete"] = bool(bo.get("in_sample")) and bo.get("coded") == bo.get("in_sample")
            by_outlet_year.append(row)

    years_with_stories = sorted({r["year"] for r in by_outlet_year})
    pilot_notice = None
    if PILOT_YEARS & set(years_with_stories):
        parts = []
        for r in by_outlet_year:
            if r["year"] in PILOT_YEARS:
                parts.append(f"{r['outlet_name']} {r['coded_sample_n']} of {r.get('sample_n')}")
        pilot_notice = ("PILOT, partial coding. These figures come from one coder's first pass on a random sample of "
                        "keyword-matched Media Cloud stories. Coded so far (coded of sampled): " + "; ".join(parts) + ". "
                        "No second coder or agreement rate yet. Do not cite these as findings.")
    for y in years_with_stories:
        st = next((s for s in baseline["years_status"] if s["year"] == y), None)
        if st and st["status"] != "published":
            gaps.append({"topic": f"NCVS baseline {y}", "reason": st.get("note") or st["status"]})
    gaps += [
        {"topic": "Jewish/ethnic-European direction", "reason": "no crime baseline: no NCVS or other official U.S. table records Jewish offenders against non-Hispanic White victims; story counts only, no CDI."},
        {"topic": "AP, NYT and WaPo 2023 coding", "reason": "not coded yet. AP and NYT sample URLs returned errors or bot protection from our build machine; WaPo pages could not be retrieved (timeout/404), which is a fetch failure, not a demonstrated paywall. CDI is null for these outlets."},
        {"topic": "Homicide", "reason": "the NCVS does not cover homicide; the baseline is nonfatal violent incidents (rape/sexual assault, robbery, aggravated and simple assault)."},
        {"topic": "Query asymmetry", "reason": "the story frame was built from keyword queries, most of them anti-Black framings (\"white supremacist\", \"anti-Black\", \"racially motivated\", \"hate crime\"); only \"anti-white\" and \"Black supremacist\" target the reverse framing. Black-on-White crime stories that use none of these phrases are not in the frame, so the pilot frame is expected to under-sample them. This is a pre-registered alternative explanation (label convention, query misfire)."},
        {"topic": "Inter-coder agreement", "reason": "single coder (joseph-a) so far; the method requires a second coder and an agreement rate before results are reported."},
        {"topic": "NCVS 2018", "reason": "BJS published only percentages (Table 14) for 2018, not counts; count is null and not derived."},
    ]
    for y, rep in conv_reports.items():
        for g in rep.get("gaps", []):
            gaps.append({"topic": f"stories_{y}.csv conversion", "reason": g})

    judgement_calls = [
        "stories_W_on_B / stories_B_on_W count coded stories with include=true in that direction, from any query phrase. pilot_method.md names the \"anti-Black\" / \"anti-white\" phrase pair as the primary CDI pair; format v1.1 does not restrict by phrase. Under the phrase-pair rule the 2023 pilot would have 0 included stories in both cells. To be settled with Joseph.",
        "When both media cells are 0, cdi is null (a +0.5/+0.5 adjustment would produce a number with no stories behind it).",
        "Rates (headline_rate, pct_first_para, photo_rate) and stance counts use included stories (include=true, any direction, including 'other'); each rate's denominator is given in the matching *_n field. pct_first_para = share whose first racial mention is in the headline (para 1) or first body paragraph (para 2).",
        "stories_total = all rows for the outlet in stories_<year>.csv, i.e. keyword-matched Media Cloud hits (volume only), not coded crime stories.",
        "CDI uses the raw NCVS incident ratio for the same year (not population-adjusted), as pre-registered. NCVS counts are survey estimates with standard errors (ncvs_*_se); the CDI carries that uncertainty and the much larger uncertainty of small story counts.",
        "Sample weights are not applied: they are constant within an outlet, so the within-outlet ratio is the same weighted or unweighted.",
    ]
    out = {
        "method_version": "1.0",
        "generated": a.generated,
        "script": "build_media_summary.py",
        "pilot_notice": pilot_notice,
        "baseline_file": "baseline_ncvs.json",
        "story_files": [os.path.basename(p) for p in files],
        "by_outlet_year": by_outlet_year,
        "data_gaps": gaps,
        "judgement_calls": judgement_calls,
    }
    dest = os.path.join(a.dir, "summary.json")
    with open(dest, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print(f"wrote {dest}")
    for r in by_outlet_year:
        print(f"{r['year']} {r['outlet']:5} W_on_B={r['stories_W_on_B']} B_on_W={r['stories_B_on_W']} other={r['stories_other']} "
              f"coded={r['coded_sample_n']}/{r.get('sample_n')} total={r['stories_total']} adj={r['zero_adjust_applied']} cdi={r['cdi']} ({r['cdi_null_reason']})")


if __name__ == "__main__":
    main()
