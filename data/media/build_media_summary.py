#!/usr/bin/env python3
"""Build data/media/summary.json from the story CSVs and the NCVS / SHR baselines.

Format: media-data-format.md v1.2 (summary method_version 1.2). summary.json is computed,
never hand-edited.

The Coverage Distortion Index (CDI) is the methods name for the calculation behind the
public Antiwhite media bias index. It is stored as a methods field. It is not published
as a point estimate when a direction cell is 0, when there are fewer than 20 included
incidents, or for an outlet before an incident-based sample exists.

    CDI = (W_m / B_m) / (W_b / B_b)

No +0.5 (or any other constant) is added to manufacture a point estimate. When exactly
one media direction is 0, cdi is null and the Clopper-Pearson exact one-sided 95% lower
bound is reported instead, as 0 of N plus an "at least" multiplier.

Homicide stories are compared with FBI SHR Expanded Homicide Data Table 6 (single
victim / single offender). Non-fatal violence, and the mixed keyword-sample preferred
country inference, are compared with NCVS. The two are not pooled into one published
point-estimate index against a single baseline.

Usage (repo root):  python3 data/media/build_media_summary.py [--generated YYYY-MM-DD]
"""
import argparse, csv, datetime, json, math, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
OUTLETS = ["AP", "NYT", "Fox", "CNN", "WaPo"]
OUTLET_NAMES = {"AP": "Associated Press", "NYT": "The New York Times", "Fox": "Fox News", "CNN": "CNN", "WaPo": "The Washington Post"}
OUTLET_DOMAINS = {"AP": "apnews.com", "NYT": "nytimes.com", "Fox": "foxnews.com", "CNN": "cnn.com", "WaPo": "washingtonpost.com"}
PILOT_YEARS = {2023}
REPO = "https://github.com/StopBias/harm-data/blob/main/data/media/"
INSUFFICIENT_INCIDENT_THRESHOLD = 20
ALPHA = 0.05
COUNTRY = "USA"


def load_json(name):
    with open(os.path.join(HERE, name), encoding="utf-8") as f:
        return json.load(f)


def ncvs_lookup(baseline):
    out = {}
    for r in baseline["rows"]:
        out[(r["year"], r["offender_race"], r["victim_race"])] = r
    return out


def rate(num, den):
    return None if den == 0 else round(num / den, 4)


def round_bound(cdi):
    """Display rounding used in the approved method table: 1 decimal if >= 1, else 2."""
    if cdi is None:
        return None
    if cdi >= 1:
        return round(cdi + 1e-12, 1)
    return round(cdi + 1e-12, 2)


def clopper_pearson_zero(n, r_b):
    """Exact one-sided 95% bounds when the zero cell is Black-on-White, N = W_m + B_m, B_m = 0.

    c_zero <= 1 - alpha^(1/N)
    c_other >= alpha^(1/N)
    CDI >= alpha^(1/N) / ((1 - alpha^(1/N)) * r_b)
    """
    if not n or r_b in (None, 0):
        return None
    c_other = ALPHA ** (1 / n)
    c_zero = 1 - c_other
    cdi_lo = c_other / (c_zero * r_b)
    return {
        "n_pair": n,
        "zero_direction": "B_on_W",
        "coverage_B_on_W_upper": round(c_zero, 4),
        "coverage_W_on_B_lower": round(c_other, 4),
        "cdi_lower": round(cdi_lo, 4),
        "cdi_lower_display": round_bound(cdi_lo),
        "method": "Clopper-Pearson exact one-sided 95% lower bound on CDI; binomial model on N White-Black pair units",
    }


def direction_counts(rows):
    w = sum(1 for r in rows if r["direction"] == "W_on_B")
    b = sum(1 for r in rows if r["direction"] == "B_on_W")
    o = sum(1 for r in rows if r["direction"] == "other")
    return w, b, o


def incident_units(inc_rows):
    """Distinct incident_id values among included stories, with a direction for the incident.

    An incident is a White-Black pair unit if any included story for it is W_on_B or B_on_W.
    If stories disagree, both directions are recorded; the pair is still one incident.
    """
    by = {}
    for r in inc_rows:
        iid = r.get("incident_id") or ""
        if not iid:
            continue
        rec = by.setdefault(iid, {"incident_id": iid, "directions": set(), "outlets": set(), "stories": 0})
        rec["directions"].add(r["direction"])
        rec["outlets"].add(r["outlet"])
        rec["stories"] += 1
    incidents = []
    for rec in by.values():
        dirs = sorted(rec["directions"])
        pair = [d for d in dirs if d in ("W_on_B", "B_on_W")]
        incidents.append({
            "incident_id": rec["incident_id"],
            "directions": dirs,
            "pair_directions": pair,
            "outlets": sorted(rec["outlets"]),
            "stories": rec["stories"],
        })
    return incidents


def filter_homicide(inc_rows, meta, homicide):
    out = []
    for r in inc_rows:
        info = meta.get(r.get("incident_id") or "", {})
        if info.get("homicide") is homicide:
            out.append(r)
    return out


def zero_or_counts(w, b):
    n = w + b
    if w == 0 and b == 0:
        return {"kind": "both_zero", "zero_of_n": None, "n_pair": 0}
    if b == 0:
        return {"kind": "zero_B_on_W", "zero_of_n": f"0 of {n}", "n_pair": n}
    if w == 0:
        return {"kind": "zero_W_on_B", "zero_of_n": f"0 of {n}", "n_pair": n}
    return {"kind": "both_observed", "zero_of_n": None, "n_pair": n}


def block_for(inc_rows, r_b, baseline_name, unit):
    w, b, o = direction_counts(inc_rows)
    n_pair = w + b
    z = zero_or_counts(w, b)
    bound = None
    if z["kind"] == "zero_B_on_W":
        bound = clopper_pearson_zero(n_pair, r_b)
    cdi = None
    cdi_reason = None
    if z["kind"] == "both_zero":
        cdi_reason = "no included White-on-Black or Black-on-White %s" % unit
    elif z["kind"] != "both_observed":
        cdi_reason = "zero cell: point-estimate CDI is not published; see zero_of_n and cdi_lower_bound"
    elif not r_b:
        cdi_reason = "no published baseline ratio for this comparison"
    else:
        cdi = round((w / b) / r_b, 4)
    return {
        "unit": unit,
        "baseline": baseline_name,
        "W_on_B": w,
        "B_on_W": b,
        "other": o,
        "n_pair": n_pair,
        "n_included": w + b + o,
        "coverage_W_on_B": rate(w, n_pair) if n_pair else None,
        "coverage_B_on_W": rate(b, n_pair) if n_pair else None,
        "zero_of_n": z["zero_of_n"],
        "zero_kind": z["kind"],
        "cdi": cdi,
        "cdi_null_reason": cdi_reason,
        "cdi_lower_bound": bound,
        "point_estimate_published": False if unit == "stories" or z["kind"] != "both_observed" else None,
    }


def load_stories(path):
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def outlet_row(o, year, rs, rows, conv, n_wb, n_bw, n_wb_se, n_bw_se, r_b, meta):
    coded = [r for r in rs if r["coded"] == "true"]
    inc = [r for r in coded if r["include"] == "true"]
    w, b, oth = direction_counts(inc)
    incidents = incident_units(inc)
    pair_inc = [i for i in incidents if i["pair_directions"]]
    w_inc = sum(1 for i in pair_inc if "W_on_B" in i["pair_directions"] and "B_on_W" not in i["pair_directions"])
    b_inc = sum(1 for i in pair_inc if "B_on_W" in i["pair_directions"] and "W_on_B" not in i["pair_directions"])
    both_inc = sum(1 for i in pair_inc if "W_on_B" in i["pair_directions"] and "B_on_W" in i["pair_directions"])
    stories_blk = block_for(inc, r_b, "ncvs", "stories")
    # incident-level block uses one row per pair incident with its pair direction
    inc_as_rows = []
    for i in incidents:
        # represent the incident as a synthetic row for direction_counts
        if "W_on_B" in i["pair_directions"] and "B_on_W" not in i["pair_directions"]:
            inc_as_rows.append({"direction": "W_on_B"})
        elif "B_on_W" in i["pair_directions"] and "W_on_B" not in i["pair_directions"]:
            inc_as_rows.append({"direction": "B_on_W"})
        elif not i["pair_directions"]:
            inc_as_rows.append({"direction": "other"})
        else:
            # conflict: counted in sample, not assigned to one pair cell
            inc_as_rows.append({"direction": "other"})
    incidents_blk = block_for(inc_as_rows, r_b, "ncvs", "incidents")
    photo_yn = [r for r in inc if r["photo"] in ("yes", "no")]
    fm = [r for r in inc if r["first_mention_para"].strip() != ""]
    hl = [r for r in inc if r["headline_mentions_race"] in ("yes", "no")]
    reason = None
    if not coded:
        reason = "no coded stories"
    elif w == 0 and b == 0:
        reason = "no included White-on-Black or Black-on-White stories in the coded sample"
    # Outlet point-estimate index is pending until an incident-based sample exists,
    # even when both directions are observed.
    row = {
        "outlet": o, "outlet_name": OUTLET_NAMES[o], "year": year, "rule_set": rs_name(None) if False else None,
        "stories_W_on_B": w, "stories_B_on_W": b, "stories_other": oth, "included_n": len(inc),
        "incidents_n": len(incidents),
        "incidents_W_on_B": w_inc, "incidents_B_on_W": b_inc, "incidents_other": sum(1 for i in incidents if not i["pair_directions"]),
        "incidents_direction_conflict": both_inc,
        "ncvs_W_on_B": n_wb, "ncvs_B_on_W": n_bw,
        "ncvs_W_on_B_se": n_wb_se, "ncvs_B_on_W_se": n_bw_se,
        "zero_adjust_applied": False,
        "cdi": None,
        "cdi_null_reason": "outlet point-estimate index is pending until an incident-based sample is complete",
        "index_status": "pending",
        "stories_bound": stories_blk.get("cdi_lower_bound"),
        "incidents_bound": incidents_blk.get("cdi_lower_bound"),
        "zero_of_n_stories": stories_blk.get("zero_of_n"),
        "zero_of_n_incidents": incidents_blk.get("zero_of_n"),
        "stories_total": len(rs),
        "headline_rate": rate(sum(1 for r in hl if r["headline_mentions_race"] == "yes"), len(hl)),
        "coded_sample_n": len(coded),
        "pct_first_para": rate(sum(1 for r in fm if r["first_mention_para"].strip() in ("1", "2")), len(fm)),
        "photo_rate": rate(sum(1 for r in photo_yn if r["photo"] == "yes"), len(photo_yn)),
        "stance": {s: sum(1 for r in inc if r["stance"] == s) for s in ("affirming", "neutral", "dismissive")},
        "headline_rate_n": len(hl), "pct_first_para_n": len(fm), "photo_rate_n": len(photo_yn),
        "pilot": year in PILOT_YEARS,
        "media_source": f"Media Cloud (onlinenews-mediacloud) keyword-matched stories on {OUTLET_DOMAINS[o]}, {year}; rows in {REPO}stories_{year}.csv",
    }
    if conv:
        bo = conv["counts"]["by_outlet"].get(o, {})
        row["sample_n"] = bo.get("in_sample")
        row["coding_complete"] = bool(bo.get("in_sample")) and bo.get("coded") == bo.get("in_sample")
    if reason and w == 0 and b == 0:
        # keep the more specific empty-cell reason alongside pending
        row["empty_reason"] = reason
    # silence unused
    _ = meta
    return row, stories_blk, incidents_blk


def rs_name(x):
    return x


def included_stories(inc, rule_set):
    out = []
    for r in inc:
        out.append({
            "story_id": r["story_id"],
            "outlet": r["outlet"],
            "date": r["date"],
            "url": r["url"],
            "headline": r["headline"],
            "direction": r["direction"],
            "incident_id": r["incident_id"],
            "headline_mentions_race": r["headline_mentions_race"],
            "first_mention_para": r["first_mention_para"] or None,
            "first_mention_feature": r["first_mention_feature"] or None,
            "rule_set": rule_set,
        })
    out.sort(key=lambda s: (s["date"], s["outlet"], s["story_id"]))
    return out


def country_rule(year, rule_set, rows, n_wb, n_bw, r_ncvs, shr, meta):
    coded = [r for r in rows if r["coded"] == "true"]
    inc = [r for r in rows if r["include"] == "true"]
    incidents = incident_units(inc)
    dates = [r["date"] for r in inc if r.get("date")]
    # mixed sample vs NCVS (preferred country inference is the incident row)
    mixed_stories = block_for(inc, r_ncvs, "ncvs", "stories")
    inc_as_rows = []
    for i in incidents:
        if "W_on_B" in i["pair_directions"] and "B_on_W" not in i["pair_directions"]:
            inc_as_rows.append({"direction": "W_on_B", "incident_id": i["incident_id"]})
        elif "B_on_W" in i["pair_directions"] and "W_on_B" not in i["pair_directions"]:
            inc_as_rows.append({"direction": "B_on_W", "incident_id": i["incident_id"]})
        else:
            inc_as_rows.append({"direction": "other", "incident_id": i["incident_id"]})
    mixed_incidents = block_for(inc_as_rows, r_ncvs, "ncvs", "incidents")

    # homicide vs SHR Table 6
    r_shr = None
    shr_w = shr_b = None
    if shr:
        shr_w = shr["directions"]["W_on_B"]["count"]
        shr_b = shr["directions"]["B_on_W"]["count"]
        r_shr = shr_w / shr_b if shr_b else None
    hom_stories = filter_homicide(inc, meta, True)
    hom_inc_ids = {r["incident_id"] for r in hom_stories}
    # like-with-like 2023 SV/SO: incidents in Table 6 (none in this sample)
    svso_covered_w = svso_covered_b = 0
    for iid in hom_inc_ids:
        info = meta.get(iid, {})
        if info.get("in_table6_svso_2023"):
            # would need the incident's pair direction
            dirs = {r["direction"] for r in inc if r["incident_id"] == iid}
            if "W_on_B" in dirs:
                svso_covered_w += 1
            if "B_on_W" in dirs:
                svso_covered_b += 1
    homicide_stories_blk = block_for(hom_stories, r_shr, "shr_table6", "stories")
    hom_inc_as = []
    seen = set()
    for r in hom_stories:
        if r["incident_id"] in seen:
            continue
        seen.add(r["incident_id"])
        # use pair direction from all included stories of this incident that are homicides
        dirs = {x["direction"] for x in hom_stories if x["incident_id"] == r["incident_id"]}
        if "W_on_B" in dirs and "B_on_W" not in dirs:
            hom_inc_as.append({"direction": "W_on_B"})
        elif "B_on_W" in dirs and "W_on_B" not in dirs:
            hom_inc_as.append({"direction": "B_on_W"})
        else:
            hom_inc_as.append({"direction": "other"})
    homicide_incidents_blk = block_for(hom_inc_as, r_shr, "shr_table6", "incidents")

    nonfatal = filter_homicide(inc, meta, False)
    nonfatal_blk = block_for(nonfatal, r_ncvs, "ncvs", "stories")

    insufficient = len(incidents) < INSUFFICIENT_INCIDENT_THRESHOLD
    preferred = {
        "rule_set": rule_set,
        "unit": "incidents",
        "baseline": "ncvs",
        "baseline_note": "Preferred country inference is the incident-level row of the mixed (homicide + non-fatal) keyword sample against the NCVS 2023 ratio. A point-estimate index is not published.",
        "zero_of_n": mixed_incidents["zero_of_n"],
        "n_pair": mixed_incidents["n_pair"],
        "n_included_incidents": len(incidents),
        "cdi": None,
        "cdi_lower_bound": mixed_incidents["cdi_lower_bound"],
        "index_status": "insufficient_data" if insufficient else ("bound" if mixed_incidents["cdi_lower_bound"] else "pending"),
        "point_estimate_published": False,
    }
    return {
        "rule_set": rule_set,
        "year": year,
        "coded_sample_n": len(coded),
        "sample_n": 300,
        "included_stories": mixed_stories["n_included"],
        "included_incidents": len(incidents),
        "insufficient_data": insufficient,
        "date_start": min(dates) if dates else None,
        "date_end": max(dates) if dates else None,
        "mixed_vs_ncvs": {"stories": mixed_stories, "incidents": mixed_incidents},
        "homicide_vs_shr": {
            "stories": homicide_stories_blk,
            "incidents": homicide_incidents_blk,
            "like_for_like_svso_2023": {
                "descriptor": "Covered 2023 single-victim/single-offender interracial homicides in this keyword sample, over FBI Table 6 known-offender-race counts. Jacksonville is a multiple-victim case and is reported next to this row, not dropped into the Table 6 fraction.",
                "W_on_B_covered": svso_covered_w,
                "B_on_W_covered": svso_covered_b,
                "W_on_B_baseline": shr_w,
                "B_on_W_baseline": shr_b,
                "W_on_B_of": f"{svso_covered_w} of {shr_w}" if shr_w is not None else None,
                "B_on_W_of": f"{svso_covered_b} of {shr_b}" if shr_b is not None else None,
                "outside_table6_2023_homicides": [
                    {"incident_id": iid, "in_table6_reason": meta[iid]["in_table6_reason"]}
                    for iid in sorted(hom_inc_ids) if not meta.get(iid, {}).get("in_table6_svso_2023")
                    and meta.get(iid, {}).get("year_of_crime") == 2023
                ],
            },
            "caveat": "Homicide stories in this sample include a 2023 multiple-victim case (Jacksonville) and 2022 follow-up coverage (Buffalo). Comparing those media counts with the 2023 Table 6 SV/SO ratio mixes units; the like-for-like SV/SO coverage is 0 of 324 and 0 of 726. The story and incident bounds against the Table 6 ratio are shown for transparency, with that caveat.",
        },
        "nonfatal_vs_ncvs": {"stories": nonfatal_blk},
        "preferred": preferred,
        "incidents": [
            {
                "incident_id": i["incident_id"],
                "directions": i["directions"],
                "outlets": i["outlets"],
                "stories": i["stories"],
                "homicide": meta.get(i["incident_id"], {}).get("homicide"),
                "year_of_crime": meta.get(i["incident_id"], {}).get("year_of_crime"),
                "in_table6_svso_2023": meta.get(i["incident_id"], {}).get("in_table6_svso_2023"),
            }
            for i in sorted(incidents, key=lambda x: x["incident_id"])
        ],
        "included_story_list": included_stories(inc, rule_set),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--generated", default=datetime.date.today().isoformat())
    ap.add_argument("--dir", default=HERE)
    a = ap.parse_args()
    baseline = load_json("baseline_ncvs.json") if a.dir == HERE else json.load(open(os.path.join(a.dir, "baseline_ncvs.json"), encoding="utf-8"))
    # allow --dir to override HERE for lookups
    global HERE_DIR
    here = a.dir
    ncvs = ncvs_lookup(baseline)
    shr_file = json.load(open(os.path.join(here, "baseline_shr.json"), encoding="utf-8"))
    shr_by_year = {y["year"]: y for y in shr_file["years"]}
    meta = {i["incident_id"]: i for i in json.load(open(os.path.join(here, "incidents_2023.json"), encoding="utf-8"))["incidents"]}

    story_map = {
        "strict": os.path.join(here, "stories_2023.csv"),
        "broad": os.path.join(here, "stories_2023_broad.csv"),
    }
    conv_reports = {}
    stories = {}
    for rs, path in story_map.items():
        if not os.path.exists(path):
            raise SystemExit(f"missing {path}")
        stories[rs] = load_stories(path)
        rep = os.path.splitext(path)[0] + "_conversion.json"
        if os.path.exists(rep):
            conv_reports[rs] = json.load(open(rep, encoding="utf-8"))

    year = 2023
    wb = ncvs.get((year, "White", "Black"), {})
    bw = ncvs.get((year, "Black", "White"), {})
    n_wb, n_bw = wb.get("count"), bw.get("count")
    r_ncvs = (n_wb / n_bw) if n_wb and n_bw else None
    shr = shr_by_year.get(year)

    by_outlet_year = []
    country_rules = {}
    for rs, rows in stories.items():
        country_rules[rs] = country_rule(year, rs, rows, n_wb, n_bw, r_ncvs, shr, meta)
        conv = conv_reports.get(rs)
        for o in OUTLETS:
            rs_rows = [r for r in rows if r["outlet"] == o]
            row, _, _ = outlet_row(o, year, rs_rows, rs_rows, conv, n_wb, n_bw, wb.get("se"), bw.get("se"), r_ncvs, meta)
            row["rule_set"] = rs
            if rs == "broad":
                row["media_source"] = row["media_source"].replace(f"stories_{year}.csv", f"stories_{year}_broad.csv")
            by_outlet_year.append(row)

    # preferred public country figures: strict and broad share the same 5 W/B-pair incidents
    pref_strict = country_rules["strict"]["preferred"]
    pref_broad = country_rules["broad"]["preferred"]
    # method: both rule sets have 0 of 5; use that shared incident bound as the headline
    usa = {
        "iso": COUNTRY,
        "year": year,
        "outlets": OUTLETS,
        "outlet_names": [OUTLET_NAMES[o] for o in OUTLETS],
        "pairing": "White / Black (race as stated in the article)",
        "race_basis": "race_stated_in_article",
        "insufficient_data": True,
        "insufficient_reason": "fewer than 20 included incidents overall (strict %s, broad %s); unweighted, all directions, including other" % (
            country_rules["strict"]["included_incidents"], country_rules["broad"]["included_incidents"]),
        "index_status": "insufficient_data",
        "point_estimate_published": False,
        "cdi": None,
        "preferred_inference": {
            "unit": "incidents",
            "rule_sets": "both (5 White-Black pair incidents under strict and broad)",
            "zero_of_n": pref_strict["zero_of_n"],
            "n_pair": pref_strict["n_pair"],
            "baseline": "ncvs",
            "baseline_W_on_B": n_wb,
            "baseline_B_on_W": n_bw,
            "baseline_ratio": r_ncvs,
            "cdi_lower_bound": pref_strict["cdi_lower_bound"],
            "index_lower_display": (pref_strict["cdi_lower_bound"] or {}).get("cdi_lower_display"),
            "note": "Preferred country inference is the incident-level Clopper-Pearson exact one-sided 95% lower bound (0 of 5, Antiwhite media bias index at least +4.0× against the NCVS 2023 ratio). A signed-multiplier point estimate is not published.",
        },
        "rule_sets": country_rules,
        "disclosure_track": {
            "status": "not_coded",
            "reason": "The 2023 keyword sample cannot support the disclosure track: inclusion required race to be stated, so disclosure is 100% by construction, and there are no knowable Black-on-White incidents in the file.",
        },
        "frame_caveat": "The keyword frame is a likely cause of the zero Black-on-White cell. Under a random frame, P(0 of 12 | NCVS share 0.766) is about 2.7e-8, but only 91 of 1,648 frame phrase-hits were B-direction, and none of the sampled B-phrase rows was a crime incident.",
    }

    gaps = [
        {"topic": "Incident-based sample", "reason": "The public point-estimate index, and every outlet point-estimate index cell, stay pending until an incident-based sample (starting from official or news-of-record incidents, then finding all coverage, including stories that omit race) can support them. A zero cell is still shown as 0 of N plus the exact one-sided 95% lower bound."},
        {"topic": "Ethnic Jewish/ethnic European direction", "reason": "no crime baseline: no NCVS or other official U.S. table records ethnic Jewish offenders against non-Hispanic White victims; story counts only, no index."},
        {"topic": "Homicide versus non-fatal baselines", "reason": "Homicide stories are compared with FBI SHR Expanded Homicide Data Table 6 (single victim/single offender, 2023: White-on-Black 324, Black-on-White 726). NCVS covers nonfatal violent incidents and excludes homicide. The two are not pooled into one point-estimate index. The preferred country lower bound uses the NCVS ratio on the mixed keyword sample and is labelled as such."},
        {"topic": "Per-capita rates for Table 6", "reason": "A per-capita rate view is required next to the raw SHR counts. No cited population denominator for Table 6's race categories (race, not Hispanic origin) has been joined, so the rates are pending."},
        {"topic": "Query asymmetry", "reason": "the story frame was built from keyword queries, most of them anti-Black framings (\"white supremacist\", \"anti-Black\", \"racially motivated\", \"hate crime\"); only \"anti-white\" and \"Black supremacist\" target the reverse framing. Black-on-White crime stories that use none of these phrases are not in the frame, so the pilot frame is expected to under-sample them. This is a pre-registered alternative explanation (label convention, query misfire)."},
        {"topic": "Inter-coder agreement", "reason": "single coder (joseph-a) so far; the method requires a second coder and an agreement rate before results are reported as findings."},
        {"topic": "NCVS 2018", "reason": "BJS published only percentages (Table 14) for 2018, not counts; count is null and not derived."},
        {"topic": "Countries other than the United States", "reason": "No media coding has been done outside the U.S. 2023 keyword pilot. Those countries show pending / not yet measured for the index; Ethnic data completeness is still the shared crime-map score where it exists."},
    ]
    years_status = {s["year"]: s for s in baseline.get("years_status", [])}
    st = years_status.get(year)
    if st and st["status"] != "published":
        gaps.insert(0, {"topic": f"NCVS baseline {year}", "reason": st.get("note") or st["status"]})
    for rs, rep in conv_reports.items():
        for g in rep.get("gaps", []):
            gaps.append({"topic": f"stories_2023{' _broad' if rs=='broad' else ''}.csv conversion".replace(" _", "_"), "reason": g})

    judgement_calls = [
        "The Coverage Distortion Index (CDI) is the methods name for the calculation behind the Antiwhite media bias index. It is not a second public index. cdi is null whenever a cell is 0, when both cells are 0, or when a point estimate would otherwise be unpublished.",
        "No +0.5, or any other constant, is added to manufacture a point-estimate index. Earlier +0.5 figures (including Fox 29.4× and CNN 16.3×, and the pooled pilot CDIs) are artifacts and must not be published as findings.",
        "When a direction is 0, the published figure is 0 of N plus the Clopper-Pearson exact one-sided 95% lower bound. The preferred country inference is the incident-level bound (stories of the same incident are a cluster). Story-level bounds are stored for transparency and for outlet rows.",
        "Insufficient data means fewer than 20 included incidents overall (unweighted, all directions, including other). A zero cell is not Insufficient data by itself; the US 2023 pilot is Insufficient data because it has 6 (strict) or 8 (broad) included incidents.",
        "Outlet point-estimate index cells are pending until an incident-based sample is complete. A zero at an outlet is still 0 of N plus the bound.",
        "Rates (headline_rate, pct_first_para, photo_rate) and stance counts use included stories (include=true, any direction, including 'other'); each rate's denominator is given in the matching *_n field. pct_first_para = share whose first racial mention is in the headline (para 1) or first body paragraph (para 2).",
        "stories_total = all rows for the outlet in the stories file, i.e. keyword-matched Media Cloud hits (volume only), not coded crime stories.",
        "Sample weights are not applied to the published counts: they are constant within an outlet, so the within-outlet ratio is the same weighted or unweighted. Thresholds use unweighted counts.",
        "include=dup is not counted as included.",
        "The Strict / Broad toggle follows the 19 Nov rules: Broad counts a \"white supremacist\" or \"white nationalist\" label, or \"espoused White supremacist beliefs\", as White; liking or sharing such content does not. ethnic Jewish or Palestinian (and similar) labels are coded direction=other.",
        "Homicide and non-fatal comparisons are stored separately and are not pooled into one published point-estimate index.",
    ]

    pilot_notice = (
        "PILOT. These figures come from one coder's first pass on a stratified random sample of 300 "
        "keyword-matched 2023 Media Cloud stories from Associated Press, CNN, Fox News, The New York Times "
        "and The Washington Post (AP 31, a census of its frame; CNN 29; Fox 95; NYT 80; WaPo 65). "
        "Six sample rows could not be coded (fetch failures). No second coder or agreement rate yet. "
        "There are fewer than 20 included incidents, so a point-estimate index is not published. "
        "A zero Black-on-White cell is shown as 0 of N plus the exact one-sided 95% lower bound. "
        "The keyword frame is not a random sample of interracial incidents."
    )

    out = {
        "method_version": "1.2",
        "generated": a.generated,
        "script": "build_media_summary.py",
        "pilot_notice": pilot_notice,
        "baseline_files": ["baseline_ncvs.json", "baseline_shr.json"],
        "baseline_file": "baseline_ncvs.json",
        "story_files": ["stories_2023.csv", "stories_2023_broad.csv"],
        "incident_file": "incidents_2023.json",
        "by_outlet_year": by_outlet_year,
        "countries": {COUNTRY: usa},
        "data_gaps": gaps,
        "judgement_calls": judgement_calls,
    }
    dest = os.path.join(here, "summary.json")
    with open(dest, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print(f"wrote {dest}")
    for r in by_outlet_year:
        print(f"{r['year']} {r['rule_set']:6} {r['outlet']:5} W={r['stories_W_on_B']} B={r['stories_B_on_W']} "
              f"other={r['stories_other']} inc={r['incidents_n']} coded={r['coded_sample_n']}/{r.get('sample_n')} "
              f"zero_st={r['zero_of_n_stories']} bound={(r['stories_bound'] or {}).get('cdi_lower_display')} "
              f"status={r['index_status']}")
    for rs, block in country_rules.items():
        p = block["preferred"]
        disp = (p["cdi_lower_bound"] or {}).get("cdi_lower_display")
        print(f"USA {rs}: incidents={block['included_incidents']} stories={block['included_stories']} "
              f"{p['zero_of_n']} at least {disp}× insufficient={block['insufficient_data']}")


if __name__ == "__main__":
    main()
