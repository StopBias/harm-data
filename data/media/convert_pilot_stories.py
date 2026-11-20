#!/usr/bin/env python3
"""Convert Joseph's 2023 pilot files into data/media/stories_2023*.csv (format v1.1 columns only).

Inputs (Joseph's files are read, never modified):
  --frame         stories_2023.csv        the full Media Cloud story frame (agreed columns, coded=false)
  --coded         coded_2023_pass1.csv    hand-coded sample (strict rule set; backward-compatible single file)
  --coded-strict  coded_2023_pass1.csv    same, when writing both rule sets
  --coded-broad   coded_2023_pass1b.csv   broad rule set

Mapping: start from the frame row; for every story_id present in the coded file, replace the
agreed columns with the coded file's values verbatim. Nothing is inferred, filled in or recoded.
The three extra sample columns are not part of the format and are dropped (listed as a gap).
A JSON report of everything that did not map cleanly is written beside each CSV.

When both --coded-strict and --coded-broad are given, the script writes:
  stories_<year>.csv        strict overlay (same path as before)
  stories_<year>_broad.csv  broad overlay

Usage (repo root):
  python3 data/media/convert_pilot_stories.py --frame /path/stories_2023.csv --coded /path/coded_2023_pass1.csv
  python3 data/media/convert_pilot_stories.py --frame /path/stories_2023.csv \\
      --coded-strict /path/coded_2023_pass1.csv --coded-broad /path/coded_2023_pass1b.csv
"""
import argparse, csv, json, os, re, collections

COLUMNS = ["story_id", "outlet", "date", "url", "headline", "direction", "incident_id", "source_tool", "coded",
           "first_mention_para", "first_mention_pct", "photo", "stance", "coder", "notes", "query_phrase", "include",
           "exclude_reason", "headline_mentions_race", "first_mention_feature", "offender_race_stated", "word_count",
           "follow_up_count", "stance_target"]
ALLOWED = {
    "outlet": {"AP", "NYT", "Fox", "CNN", "WaPo"},
    "direction": {"W_on_B", "B_on_W", "other", ""},
    "source_tool": {"MediaCloud", "GDELT", "manual"},
    "coded": {"true", "false"},
    "photo": {"yes", "no", "na", ""},
    "stance": {"affirming", "neutral", "dismissive", "na", ""},
    # "dup" is a coded row that redirects to another sampled story; it is not include=true and is not counted.
    "include": {"true", "false", "", "dup"},
    "headline_mentions_race": {"yes", "no", "na", ""},
    "first_mention_feature": {"race", "name", "photo", ""},
    "offender_race_stated": {"yes", "no", ""},
}
IDENTITY = ["outlet", "date", "url", "headline", "source_tool", "query_phrase"]
HERE = os.path.dirname(os.path.abspath(__file__))


def read(path):
    with open(path, newline="", encoding="utf-8") as f:
        r = csv.DictReader(f)
        return r.fieldnames, list(r)


def convert_one(frame, fh, coded_path, out_path):
    ch, coded = read(coded_path)
    report = dict(inputs=dict(frame=None, coded=os.path.basename(coded_path)),
                  frame_header_conforms=fh == COLUMNS, coded_header_conforms=ch == COLUMNS,
                  dropped_columns=[c for c in ch if c not in COLUMNS],
                  missing_columns=dict(frame=[c for c in COLUMNS if c not in fh], coded=[c for c in COLUMNS if c not in ch]),
                  identity_mismatches=[], coded_ids_not_in_frame=[], duplicate_ids=[], value_violations=[], counts={})
    if report["missing_columns"]["frame"] or report["missing_columns"]["coded"]:
        raise SystemExit(f"Missing agreed columns: {report['missing_columns']}")

    ids = collections.Counter(r["story_id"] for r in frame)
    report["duplicate_ids"] = sorted(k for k, v in ids.items() if v > 1)
    by_id = {r["story_id"]: r for r in coded}
    frame_ids = set(ids)
    report["coded_ids_not_in_frame"] = sorted(set(by_id) - frame_ids)

    rows = []
    for fr in frame:
        row = {c: fr[c] for c in COLUMNS}
        cr = by_id.get(fr["story_id"])
        if cr is not None:
            for c in IDENTITY:
                if cr[c] != fr[c]:
                    report["identity_mismatches"].append(dict(story_id=fr["story_id"], column=c, frame=fr[c], coded=cr[c]))
            row = {c: cr[c] for c in COLUMNS}  # verbatim copy of the agreed columns
        rows.append(row)

    for row in rows:
        for c, ok in ALLOWED.items():
            if row[c] not in ok:
                report["value_violations"].append(dict(story_id=row["story_id"], column=c, value=row[c]))
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", row["date"]):
            report["value_violations"].append(dict(story_id=row["story_id"], column="date", value=row["date"]))
        if row["coded"] == "true" and row["include"] == "":
            report["value_violations"].append(dict(story_id=row["story_id"], column="include", value="(blank on a coded row)"))

    c = collections.Counter
    report["counts"] = dict(
        rows=len(rows),
        sample_rows_overlaid=sum(1 for r in frame if r["story_id"] in by_id),
        included=sum(1 for r in rows if r["include"] == "true"),
        by_outlet={o: dict(frame=n,
                           in_sample=sum(1 for r in coded if r["outlet"] == o),
                           coded=sum(1 for r in rows if r["outlet"] == o and r["coded"] == "true"),
                           included=sum(1 for r in rows if r["outlet"] == o and r["include"] == "true"))
                   for o, n in sorted(c(r["outlet"] for r in rows).items())},
        sample_fetch_status={f"{o}|{s}": n for (o, s), n in sorted(c((r["outlet"], r.get("fetch_status", "")) for r in coded).items())},
    )
    report["gaps"] = [
        "sample_weight, sample_order and fetch_status (coded file only) are not in the agreed v1.1 columns and were dropped; they remain in Joseph's pilot folder. Sample weights are constant within an outlet, so they do not change a within-outlet W_on_B : B_on_W ratio.",
        "Rows outside the 300-row random sample are uncoded frame rows (coded=false, coding fields blank).",
        "Uncoded sample rows keep blank coding fields; nothing was inferred.",
        "include=dup is a coded redirect to another sampled story; it is not counted as included.",
    ]
    with open(out_path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=COLUMNS, lineterminator="\n")
        w.writeheader()
        w.writerows(rows)
    rep_path = os.path.splitext(out_path)[0] + "_conversion.json"
    with open(rep_path, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print(f"wrote {out_path} ({len(rows)} rows) and {rep_path}")
    print(json.dumps({k: report[k] for k in ("frame_header_conforms", "coded_header_conforms", "dropped_columns", "counts")}, indent=1))
    print("identity mismatches:", len(report["identity_mismatches"]), "violations:", len(report["value_violations"]),
          "coded ids not in frame:", len(report["coded_ids_not_in_frame"]), "dup ids:", len(report["duplicate_ids"]))
    return report


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--frame", required=True)
    ap.add_argument("--coded", default=None, help="single coded file (strict); ignored if --coded-strict is set")
    ap.add_argument("--coded-strict", default=None)
    ap.add_argument("--coded-broad", default=None)
    ap.add_argument("--year", default="2023")
    ap.add_argument("--out", default=None)
    a = ap.parse_args()
    fh, frame = read(a.frame)
    strict = a.coded_strict or a.coded
    if not strict:
        raise SystemExit("Provide --coded or --coded-strict")
    out_strict = a.out or os.path.join(HERE, f"stories_{a.year}.csv")
    # stamp the frame basename into the report after convert_one (it does not receive the frame path)
    def run(coded_path, out_path):
        report = convert_one(frame, fh, coded_path, out_path)
        report["inputs"]["frame"] = os.path.basename(a.frame)
        with open(os.path.splitext(out_path)[0] + "_conversion.json", "w", encoding="utf-8") as f:
            json.dump(report, f, ensure_ascii=False, indent=1)
            f.write("\n")
    run(strict, out_strict)
    if a.coded_broad:
        out_broad = os.path.join(os.path.dirname(out_strict), f"stories_{a.year}_broad.csv")
        run(a.coded_broad, out_broad)


if __name__ == "__main__":
    main()
