#!/usr/bin/env python3
"""Build data/media/baseline_shr.json from the published FBI SHR Table 6 cells.

The figures are the official 2023 publication-table counts (single victim / single
offender), not estimates and not a re-tabulation of the SHR master file. They were
read from Expanded_Homicide_Data_Table_6_Single_Victim_Single_Offender_2023.xlsx
(sheet 23shrtbl06, dated 2024-04-30 in the zip), downloaded from the FBI Crime Data
Explorer, Crime in the United States Annual Reports, year 2023, collection
"Expanded Homicide Tables," file expanded-homicide-2023.zip
(https://cde.ucr.cjis.gov/LATEST/webapp/#/pages/downloads).

This script does not invent or interpolate cells. Per-capita rates are left null
until a cited population denominator for Table 6's race categories (race, not
Hispanic origin) is joined.

Usage (repo root):  python3 data/media/build_baseline_shr.py [--generated YYYY-MM-DD]
"""
import argparse, datetime, json, os

HERE = os.path.dirname(os.path.abspath(__file__))

# Official publication Table 6, 2023, known-race direction counts and the full
# race-of-victim by race-of-offender grid used to derive them. Unknown-offender-race
# cells are recorded and are not assigned to a direction.
TABLE_6_2023 = {
    "year": 2023,
    "table": "Expanded Homicide Data Table 6",
    "table_title": "Race, Sex, and Ethnicity of Victim by Race, Sex, and Ethnicity of Offender, 2023",
    "subset": "single victim / single offender",
    "workbook": "Expanded_Homicide_Data_Table_6_Single_Victim_Single_Offender_2023.xlsx",
    "sheet": "23shrtbl06",
    "sheet_dated": "2024-04-30",
    "collection": "Expanded Homicide Tables",
    "zip": "expanded-homicide-2023.zip",
    "source_url": "https://cde.ucr.cjis.gov/LATEST/webapp/#/pages/downloads",
    "cells": [
        {"victim_race": "White", "offender_race": "White", "count": 3102},
        {"victim_race": "White", "offender_race": "Black", "count": 726},
        {"victim_race": "White", "offender_race": "Other", "count": 71},
        {"victim_race": "White", "offender_race": "Unknown", "count": 112},
        {"victim_race": "Black or African American", "offender_race": "White", "count": 324},
        {"victim_race": "Black or African American", "offender_race": "Black", "count": 3282},
        {"victim_race": "Black or African American", "offender_race": "Other", "count": 18},
        {"victim_race": "Black or African American", "offender_race": "Unknown", "count": 199},
        {"victim_race": "Other", "offender_race": "White", "count": 85},
        {"victim_race": "Other", "offender_race": "Black", "count": 51},
        {"victim_race": "Other", "offender_race": "Other", "count": 147},
        {"victim_race": "Other", "offender_race": "Unknown", "count": 9},
        {"victim_race": "Unknown", "offender_race": "White", "count": 80},
        {"victim_race": "Unknown", "offender_race": "Black", "count": 76},
        {"victim_race": "Unknown", "offender_race": "Other", "count": 13},
        {"victim_race": "Unknown", "offender_race": "Unknown", "count": 66},
    ],
    "directions": {
        "W_on_B": {
            "label": "White offender, Black or African American victim",
            "count": 324,
            "per_capita_rate": None,
            "per_capita_null_reason": "no cited population denominator has been joined for Table 6 race categories (race, not Hispanic origin)",
        },
        "B_on_W": {
            "label": "Black offender, White victim",
            "count": 726,
            "per_capita_rate": None,
            "per_capita_null_reason": "no cited population denominator has been joined for Table 6 race categories (race, not Hispanic origin)",
        },
    },
    "ratio_W_on_B_to_B_on_W": None,  # filled below from the two counts, not a new figure
    "notes": [
        "Table 6 is single victim / single offender only. Multiple-victim cases are outside this table.",
        "Offenders of unknown race are excluded from the direction counts (112 White-victim and 199 Black-victim cases).",
        "Race is not non-Hispanic. Hispanic origin is a separate, non-mandatory ethnicity field. These counts are not comparable, without further work, to the NCVS non-Hispanic White / Black baseline.",
        "Table 6 has no victim-age breakdown, so child-specific claims cannot be made from this table.",
        "Per-capita rates are not published here; a per-capita view will sit next to the raw counts once a cited population denominator is joined.",
    ],
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--generated", default=datetime.date.today().isoformat())
    a = ap.parse_args()
    d = dict(TABLE_6_2023)
    w = d["directions"]["W_on_B"]["count"]
    b = d["directions"]["B_on_W"]["count"]
    d["ratio_W_on_B_to_B_on_W"] = w / b
    out = {
        "generated": a.generated,
        "script": "build_baseline_shr.py",
        "unit": "murders, single victim / single offender, known offender race",
        "years": [d],
    }
    dest = os.path.join(HERE, "baseline_shr.json")
    with open(dest, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print(f"wrote {dest}")
    print(f"2023 Table 6: W_on_B={w} B_on_W={b} ratio={w/b:.6f}")


if __name__ == "__main__":
    main()
