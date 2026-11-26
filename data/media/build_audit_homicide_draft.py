#!/usr/bin/env python3
"""Build data/media/summary_audit_homicide_draft.json from the draft tally CSV.

The CSV is the numeric source (recomputed 2026-11-26 12:12 PM America/Edmonton).
Nothing here is hand-edited after the script runs. summary.json is not modified.
Coder files, incident names and story rows are not read.

Usage (repo root or this directory):
    python3 data/media/build_audit_homicide_draft.py
"""
import csv
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
CSV_NAME = "draft_full_run_tally_20261124.csv"
OUT_NAME = "summary_audit_homicide_draft.json"

OUTLETS = [
    ("AP", "Associated Press"),
    ("CNN", "CNN"),
    ("Fox", "Fox News"),
    ("NYT", "The New York Times"),
    ("WaPo", "The Washington Post"),
]

# Display strings taken from the tally, not recomputed to a different rounding.
SIGNED_INTERVAL = "[\u22124.84\u00d7, +1.19\u00d7]"
SIGNED_LOW = "4.84"
SIGNED_HIGH = "1.19"


def load_csv(path):
    with open(path, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    return {r["metric"]: r["value"] for r in rows}


def num(metrics, key):
    return float(metrics[key])


def integer(metrics, key):
    return int(metrics[key])


def split_of(text):
    """'9 of 143 vs 17 of 149' -> ('9 of 143', '17 of 149')."""
    left, right = text.split(" vs ")
    return left.strip(), right.strip()


def build(metrics):
    y_w = integer(metrics, "yW_covered")
    y_b = integer(metrics, "yB_covered")
    m_w = integer(metrics, "mW")
    m_b = integer(metrics, "mB")
    if metrics.get("fisher_or_ci95_signed") != SIGNED_INTERVAL:
        raise SystemExit("signed interval in the tally CSV is not the expected display string")

    cp_upper = 1 - 0.05 ** (1 / m_b)
    cp_pct = round(cp_upper * 100 + 1e-12, 2)
    if f"{cp_pct:.2f}%" != "1.95%":
        raise SystemExit("Clopper-Pearson upper bound is not 1.95%")

    q_w = num(metrics, "qW")
    q_b = num(metrics, "qB")
    rate = num(metrics, "rate_ratio_qW_over_qB")
    signed = num(metrics, "draft_index_signed")
    if round(abs(signed), 2) != 1.89:
        raise SystemExit("signed index does not display as 1.89")
    if f"{q_w * 100:.2f}%" != "5.92%" or f"{q_b * 100:.2f}%" != "11.18%":
        raise SystemExit("coverage-rate display percents do not match the tally")

    odds = num(metrics, "odds_ratio")
    p_two = num(metrics, "fisher_minlike_p_OR1")
    p_one = num(metrics, "fisher_one_sided_less")
    or_low = num(metrics, "fisher_or_ci95_low")
    or_high = num(metrics, "fisher_or_ci95_high")
    if f"{p_two:.4f}" != "0.1500" or f"{p_one:.4f}" != "0.0750":
        raise SystemExit("Fisher p display does not match the tally")
    if f"{or_low:.3f}" != "0.207" or f"{or_high:.3f}" != "1.185":
        raise SystemExit("odds-ratio display rounding does not match the tally")
    if abs(or_low - 0.206633) > 1e-9 or abs(or_high - 1.185223) > 1e-9:
        raise SystemExit("odds-ratio endpoints are not the tally values")

    outlets = []
    stories_w = 0
    stories_b = 0
    for code, name in OUTLETS:
        sw = integer(metrics, f"stories_{code}_W_on_B")
        sb = integer(metrics, f"stories_{code}_B_on_W")
        cw = integer(metrics, f"cases_{code}_W_on_B")
        cb = integer(metrics, f"cases_{code}_B_on_W")
        stories_w += sw
        stories_b += sb
        zero = cb == 0
        row = {
            "outlet": code,
            "outlet_name": name,
            "stories_W_on_B": sw,
            "stories_B_on_W": sb,
            "cases_W_on_B": cw,
            "cases_B_on_W": cb,
            "n_sampled": m_w,
            "index_status": "pending",
            "cdi": None,
            "zero_adjust_applied": False,
            "zero_cell": zero,
            "zero_of_n": f"0 of {m_b}" if zero else None,
            "zero_direction": "B_on_W" if zero else None,
            "coverage_upper": round(cp_upper, 6) if zero else None,
            "coverage_upper_display": "1.95%" if zero else None,
            "coverage_upper_method": (
                "Clopper-Pearson exact one-sided 95% upper bound on the coverage rate"
                if zero else None
            ),
        }
        outlets.append(row)

    if stories_w != 159 or stories_b != 44:
        raise SystemExit(f"all-five story totals {stories_w}/{stories_b} are not 159/44")
    if integer(metrics, "stories_n") != stories_w + stories_b:
        raise SystemExit("story total does not match the outlet sum")
    ap = next(r for r in outlets if r["outlet"] == "AP")
    if ap["stories_W_on_B"] != 11 or ap["cases_W_on_B"] != 3 or ap["cases_B_on_W"] != 0:
        raise SystemExit("AP cells are not 11 stories / 3 of 152 / 0 of 152")

    sens_keys = [
        ("all", "9 of 152", "17 of 152", True),
        ("exclude_vehicular",) + split_of(metrics["sens_exclude_vehicular"]) + (True,),
        ("exclude_white_hispanic",) + split_of(metrics["sens_exclude_white_hispanic"]) + (True,),
        ("exclude_both",) + split_of(metrics["sens_exclude_both"]) + (True,),
        ("official_record_only",) + split_of(metrics["sens_official_record_only"]) + (False,),
    ]
    sensitivities = [
        {"id": key, "w": w, "b": b, "used_for_index": used}
        for key, w, b, used in sens_keys
    ]

    out = {
        "method_version": "3.0",
        "generated": "2026-11-26",
        "computed_at": metrics["computed_at"],
        "script": "build_audit_homicide_draft.py",
        "source_csv": CSV_NAME,
        "draft": True,
        "finding_published": False,
        "design": "b",
        "test": "fisher_coverage",
        "crime": "homicide",
        "measure": "any-of-five national-outlet case coverage",
        "iso": "USA",
        "index_defined": True,
        "index_status": "draft",
        "map_treatment": "draft_not_significant",
        "point_estimate_published": False,
        "significant": False,
        "significance_label": "not_statistically_significant",
        "zero_adjust_applied": False,
        "per_capita_rate": None,
        "cdi": rate,
        "cdi_note": "Methods field only (coverage-rate ratio q_W/q_B). Not a public label.",
        "rate_ratio": rate,
        "rate_ratio_display": f"{rate:.4f}",
        "signed_magnitude": 1.89,
        "signed_lean": "antiblack",
        "odds_ratio": odds,
        "odds_ratio_display": f"{odds:.3f}",
        "p_two_sided": p_two,
        "p_one_sided": p_one,
        "p_two_sided_headline": "0.15",
        "p_two_sided_detail": f"{p_two:.4f}",
        "p_one_sided_detail": f"{p_one:.4f}",
        "n_sampled_W": m_w,
        "n_sampled_B": m_b,
        "n_covered_W": y_w,
        "n_covered_B": y_b,
        "n_sampled": integer(metrics, "sample_verified"),
        "n_covered": integer(metrics, "cases_covered"),
        "q_W": q_w,
        "q_B": q_b,
        "q_W_display": "5.92%",
        "q_B_display": "11.18%",
        "pooled_display": "8.55%",
        "date_start": "2020",
        "date_end": "2024",
        "ci95_low": or_low,
        "ci95_high": or_high,
        "ci95_low_display": metrics["fisher_or_ci95_low"],
        "ci95_high_display": metrics["fisher_or_ci95_high"],
        "ci95_low_rounded": "0.207",
        "ci95_high_rounded": "1.185",
        "ci_method": "fisher_minlike_or",
        "ci_scale": "odds_ratio",
        "ci95_signed_display": SIGNED_INTERVAL,
        "ci95_signed_low_magnitude": SIGNED_LOW,
        "ci95_signed_high_magnitude": SIGNED_HIGH,
        "ci_includes_one": True,
        "stories_n": integer(metrics, "stories_n"),
        "stories_W_on_B": stories_w,
        "stories_B_on_W": stories_b,
        "dominant_case_stories": integer(metrics, "wright_stories"),
        "outlet_index_status": "pending",
        "outlets": outlets,
        "sensitivities": sensitivities,
        "design_a_applied": False,
    }
    if y_w != 9 or y_b != 17 or m_w != 152 or m_b != 152 or out["n_sampled"] != 304:
        raise SystemExit("headline case counts are not 9 of 152 vs 17 of 152")
    blob = json.dumps(out, ensure_ascii=False)
    for banned in ("29.4", "16.3", "Daunte", "Wright", "Italia", "Kelly", "coder2"):
        if banned in blob:
            raise SystemExit("refusing to write a banned token: " + banned)
    return out


def main():
    metrics = load_csv(os.path.join(HERE, CSV_NAME))
    out = build(metrics)
    dest = os.path.join(HERE, OUT_NAME)
    with open(dest, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print(f"wrote {dest}")


if __name__ == "__main__":
    main()
