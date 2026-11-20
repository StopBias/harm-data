#!/usr/bin/env python3
"""Build data/media/baseline_ncvs.json from official BJS "Criminal Victimization" reports.

Only published BJS tables are used. Nothing is estimated, interpolated or derived:
every count and standard error below is read verbatim from a BJS PDF table.

Requires: Python 3.8+, curl, and pdftotext (poppler-utils).
Usage (from the repo root):
    python3 data/media/build_baseline_ncvs.py            # downloads PDFs to ~/.cache/stopbias-ncvs
    python3 data/media/build_baseline_ncvs.py --cache DIR --out data/media/baseline_ncvs.json

If BJS revises a PDF, its SHA-256 will differ from the one recorded here; the script
then stops (use --accept-new-pdf to rebuild from the new file and record its hash).
"""
import argparse, datetime, hashlib, json, os, re, subprocess, sys

UA = "Mozilla/5.0 (StopBias harm-data baseline build; contact via github.com/StopBias)"
SERIES_URL = "https://bjs.ojp.gov/library/publications/list?series_filter=Criminal%20Victimization"

# One entry per report year. Tables are the year-specific cross-tab of violent incidents by
# victim and offender race/Hispanic origin. Column order is exactly as printed by BJS.
REPORTS = {
    2018: dict(
        title="Criminal Victimization, 2018", ncj="NCJ 253043", published="2019-09",
        pdf="https://bjs.ojp.gov/content/pub/pdf/cv18.pdf",
        page="https://bjs.ojp.gov/library/publications/criminal-victimization-2018",
        sha256="19dceee73c84d8a004b945b7d104312178a10533db778c9f94bfeed7b1b4d386",
        table="Table 14", table_title=r"^\s*Percent of violent incidents, by victim and offender race or ethnicity, 2018",
        kind="percent",
        cols=["victim_total", "Total", "White", "Black", "Hispanic", "Asian", "Other", "Multiple"],
        se_table="Appendix table 19", se_title=r"Standard errors for table 14: Percent of violent incidents, by victim and offender race or ethnicity, 2018",
        se_cols=["victim_total", "White", "Black", "Hispanic", "Asian", "Other", "Multiple"],
    ),
    2019: dict(
        title="Criminal Victimization, 2019", ncj="NCJ 255113", published="2020-09",
        pdf="https://bjs.ojp.gov/content/pub/pdf/cv19.pdf",
        page="https://bjs.ojp.gov/library/publications/criminal-victimization-2019",
        sha256="e66f8716d18c7613d61b0e47ca782cd8b68e65c3b7cf6c75103046cc662296e0",
        table="Table 15", table_title=r"^\s*Number of violent incidents, by victim and offender race or ethnicity, 2019",
        kind="count",
        cols=["victim_total", "White", "Black", "Hispanic", "Other"],
        se_table="Appendix table 18", se_title=r"Standard errors for table 15: Number of violent incidents,",
        se_cols=["victim_total", "White", "Black", "Hispanic", "Other"],
    ),
    2020: dict(
        title="Criminal Victimization, 2020", ncj="NCJ 301775", published="2021-10",
        pdf="https://bjs.ojp.gov/sites/g/files/xyckuh236/files/media/document/cv20.pdf",
        page="https://bjs.ojp.gov/library/publications/criminal-victimization-2020",
        sha256="cf14c0afb1f5fabc26649a338f11740eb9e1faaa08ca4f04d8a4f4fd035695a3",
        table=None, kind="absent",
    ),
    2021: dict(
        title="Criminal Victimization, 2021", ncj="NCJ 305101", published="2022-09 (revised 2023-07-05)",
        pdf="https://bjs.ojp.gov/content/pub/pdf/cv21.pdf",
        page="https://bjs.ojp.gov/library/publications/criminal-victimization-2021",
        sha256="d73207d59b2f6e123664bd5df2d7c13b4319052319b7ad4023527e93c6fb7483",
        table="Table 13", table_title=r"^\s*Number of violent incidents, by race or Hispanic origin of victims and offenders, 2021",
        kind="count",
        cols=["victim_total", "White", "Black", "Hispanic", "Other", "Unknown"],
        se_table="Appendix table 14", se_title=None,  # title line is lost in text extraction; located by layout (see find_se_2021)
        se_cols=["victim_total", "White", "Black", "Hispanic", "Other", "Unknown"],
    ),
    2022: dict(
        title="Criminal Victimization, 2022", ncj="NCJ 307089", published="2023-09",
        pdf="https://bjs.ojp.gov/document/cv22.pdf",
        page="https://bjs.ojp.gov/library/publications/criminal-victimization-2022",
        sha256="ac895e0148ee154f9b431b2a7c31f581e2a2febcd0ede7ac234fc25519c59f2d",
        table="Table 13", table_title=r"^\s*Number of violent incidents, by race or Hispanic origin of victims and offenders, 2022",
        kind="count",
        cols=["victim_total", "White", "Black", "Hispanic", "Other", "Unknown"],
        se_table="Appendix table 14", se_title=r"Standard errors for table 13: Number of violent incidents, by race or Hispanic origin of victims and offenders, 2022",
        se_cols=["victim_total", "White", "Black", "Hispanic", "Other", "Unknown"],
    ),
    2023: dict(
        title="Criminal Victimization, 2023", ncj="NCJ 309335", published="2024-09 (revised 2025-06-09)",
        pdf="https://bjs.ojp.gov/document/cv23.pdf",
        page="https://bjs.ojp.gov/library/publications/criminal-victimization-2023",
        sha256="0157c09e5622067f9ce4f44ede22558fb036456cb7bcb2dcecd4d0085ccbc888",
        table="Table 13", table_title=r"^\s*Number of violent incidents, by race or Hispanic origin of victims and offenders, 2023",
        kind="count",
        cols=["victim_total", "White", "Black", "Hispanic", "Other", "Unknown"],
        se_table="Appendix table 14", se_title=r"Standard errors for table 13: Number of violent incidents, by race or Hispanic origin of victims and offenders, 2023",
        se_cols=["victim_total", "White", "Black", "Hispanic", "Other", "Unknown"],
    ),
}

# Definitions as printed in each table's notes (quoted or closely paraphrased; see README).
DEFS = {
    2018: dict(
        hispanic="White and Black exclude persons of Hispanic/Latino origin (table note a). The table note does not state how multiple-offender incidents with a Hispanic offender were classified.",
        multiple="Multiple offenders of various races are a separate column; the White and Black columns therefore cover a single offender or an all-White / all-Black group (inferred from the column layout, not stated).",
        unknown="Excludes incidents where offender race/ethnicity was unknown (11% of violent incidents).",
    ),
    2019: dict(
        hispanic="White and Black exclude persons of Hispanic origin (note a). If the victim perceived any offender in a multiple-offender incident as Hispanic, the offenders were classified as Hispanic (note b).",
        multiple="Multiple offenders of various races are counted in Other (note c), so White/Black = a single offender or a group all perceived as that race.",
        unknown="Excludes incidents where offender race/ethnicity was unknown (16% of violent incidents).",
    ),
    2021: dict(
        hispanic="White and Black exclude persons of Hispanic origin (note b). If the victim perceived any offender in a multiple-offender incident as Hispanic, the offenders were classified as Hispanic (note c).",
        multiple="Persons in multiple-offender incidents perceived as various races are counted in Other (note d).",
        unknown="An Unknown offender column is published (note e) and included here.",
    ),
    2022: dict(
        hispanic="White and Black exclude persons who identified or were perceived as Hispanic (note b). Hispanic = single offenders perceived as Hispanic and groups in which ALL offenders were perceived as Hispanic (note c; changed from the earlier any-Hispanic rule).",
        multiple="Multiple-offender incidents perceived as various races (including mixed Hispanic and non-Hispanic groups) are counted in Other (note d).",
        unknown="An Unknown offender column is published (note e) and included here.",
    ),
}
DEFS[2023] = DEFS[2022]

NUM = r"(?:<?\d[\d,]*(?:\.\d+)?%?|~)"
CELL = re.compile(r"(" + NUM + r")\s*((?:[*†‡!]\s*)*)")
LABEL = re.compile(r"(?:^|\s)(White|Black|Hispanic|Other|Asian)(?:[a-e](?:,[a-e])*)?\s+(?=[<\d~])")


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def fetch(url, dest):
    if os.path.exists(dest) and os.path.getsize(dest) > 0:
        return
    tmp = dest + ".part"
    code = subprocess.run(["curl", "-sL", "-A", UA, "--max-time", "120", "-o", tmp, "-w", "%{http_code}", url],
                          capture_output=True, text=True).stdout.strip()
    if code != "200":
        if os.path.exists(tmp):
            os.remove(tmp)
        raise SystemExit(f"Download failed ({code}) for {url}. If the site blocks access, record it; do not work around it.")
    os.replace(tmp, dest)


def pdf_text(path):
    return subprocess.run(["pdftotext", "-layout", path, "-"], capture_output=True, text=True, check=True).stdout.split("\n")


def parse_cells(s):
    out = []
    for m in CELL.finditer(s):
        raw, flags = m.group(1), re.sub(r"\s+", "", m.group(2))
        if raw == "~":
            val = None
        else:
            v = raw.replace(",", "").replace("%", "")
            val = None if v.startswith("<") else float(v)
        out.append(dict(raw=raw, value=val, flags=flags, lt="<" in raw))
    return out


def read_rows(lines, start, cols, labels=("White", "Black"), window=14):
    """Return {victim_label: {col: cell}} for the first rows after line index `start`."""
    found = {}
    for line in lines[start + 1:start + 1 + window]:
        # A layout line can hold two side-by-side tables; take the LAST label match with numbers.
        matches = list(LABEL.finditer(line))
        for m in matches[::-1]:
            lab = m.group(1)
            if lab in found or lab not in labels:
                continue
            cells = parse_cells(line[m.end():])
            if len(cells) >= len(cols):
                found[lab] = dict(zip(cols, cells[:len(cols)]))
                break
    missing = [l for l in labels if l not in found]
    if missing:
        raise SystemExit(f"Could not parse rows {missing} after line {start + 1}")
    return found


def page_of(lines, i):
    """1-based PDF page of text line i (pdftotext marks page breaks with form feeds)."""
    return 1 + sum(l.count("\f") for l in lines[:i + 1])


def find_line(lines, pattern, nth=0):
    hits = [i for i, l in enumerate(lines) if re.search(pattern, l)]
    if len(hits) <= nth:
        raise SystemExit(f"Table title not found: {pattern}")
    return hits[nth]


def find_se_2021(lines):
    # In cv21.pdf the appendix table 14 title is rendered as an image band; the SE block is the
    # second "Victim race/ ... Offender race/Hispanic origin" header (the first is Table 13).
    hits = [i for i, l in enumerate(lines) if re.search(r"Victim race/\s+Total violent\s+Offender race/Hispanic origin", l)]
    if len(hits) < 2:
        raise SystemExit("2021 SE block not found")
    return hits[1]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", default=os.path.expanduser("~/.cache/stopbias-ncvs"))
    ap.add_argument("--out", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "baseline_ncvs.json"))
    ap.add_argument("--accept-new-pdf", action="store_true")
    a = ap.parse_args()
    os.makedirs(a.cache, exist_ok=True)

    rows, years = [], []
    pairs = [("White", "White"), ("White", "Black"), ("Black", "White"), ("Black", "Black")]
    for year, r in REPORTS.items():
        pdf = os.path.join(a.cache, os.path.basename(r["pdf"]))
        fetch(r["pdf"], pdf)
        got = sha256(pdf)
        if got != r["sha256"] and not a.accept_new_pdf:
            raise SystemExit(f"{year}: PDF hash changed ({got}); BJS may have revised it. Re-check, then rerun with --accept-new-pdf.")
        lines = pdf_text(pdf)
        src = dict(report=r["title"], ncj=r["ncj"], published=r["published"], pdf_url=r["pdf"], page_url=r["page"],
                   pdf_sha256=got, table=r.get("table"), se_table=r.get("se_table"))
        yinfo = dict(year=year, source=src)

        if r["kind"] == "absent":
            # Confirm the report has no victim-by-offender race table (guards against a silent revision).
            text = "\n".join(lines)
            if re.search(r"by (victim and offender race|race or Hispanic origin of victims and offenders)", text):
                raise SystemExit("2020 report now contains a race cross-tab; update the build.")
            yinfo.update(status="not_published",
                         note="BJS Criminal Victimization, 2020 contains no table of violent incidents by victim and offender race (checked the full text). No other year-specific BJS table for 2020 was found. Left null; not estimated.")
            for o, v in pairs:
                rows.append(dict(year=year, offender_race=o, victim_race=v, count=None, se=None,
                                 note="Not published for 2020 (no BJS offender-by-victim race table).", source=src))
            years.append(yinfo)
            continue

        t = find_line(lines, r["table_title"])
        main_rows = read_rows(lines, t, r["cols"])
        s = find_se_2021(lines) if year == 2021 else find_line(lines, r["se_title"])
        se_rows = read_rows(lines, s, r["se_cols"])
        src["table_pdf_page"] = page_of(lines, t)
        src["se_table_pdf_page"] = page_of(lines, s)
        yinfo.update(status="published" if r["kind"] == "count" else "published_percent_only",
                     definitions=DEFS[year],
                     victim_totals={v: dict(count=main_rows[v]["victim_total"]["value"],
                                            se=se_rows[v]["victim_total"]["value"]) for v in ("White", "Black")})
        offenders = ["White", "Black"] + (["Unknown"] if "Unknown" in r["cols"] else [])
        for v in ("White", "Black"):
            for o in offenders:
                c, e = main_rows[v][o], se_rows[v][o]
                flags = c["flags"]
                caution = "!" in flags
                base = dict(year=year, offender_race=o, victim_race=v)
                notes = []
                if caution:
                    notes.append("BJS flag '!': interpret with caution (10 or fewer sample cases or CV > 50%).")
                if r["kind"] == "percent":
                    notes.append(f"BJS published only a percentage for 2018: {c['raw']} of the {main_rows[v]['victim_total']['raw']} violent incidents against {v} victims with known offender race (SE {e['raw']} percentage points). No count was published, so count is null and is not derived.")
                    rows.append(dict(base, count=None, se=None, pct=c["value"], pct_se=e["value"],
                                     victim_race_total=main_rows[v]["victim_total"]["value"],
                                     victim_race_total_se=se_rows[v]["victim_total"]["value"],
                                     bjs_flags=flags, note=" ".join(notes), source=src))
                else:
                    if o == "Unknown":
                        notes.append("Offender race or Hispanic origin unknown to the victim.")
                    rows.append(dict(base, count=int(c["value"]), se=int(e["value"]), bjs_flags=flags,
                                     note=" ".join(notes), source=src))
        years.append(yinfo)

    out = {
        "source": {
            "name": "Bureau of Justice Statistics (BJS), National Crime Victimization Survey (NCVS), Criminal Victimization annual bulletins",
            "url": SERIES_URL,
            "table": "Year-specific table of violent incidents by victim and offender race or Hispanic origin (2018 Table 14 [percent only]; 2019 Table 15; 2021-2023 Table 13); standard errors from the matching appendix tables. 2020: not published.",
            "years": "2018-2023",
        },
        "unit": "violent incidents",
        "unit_note": "An incident is a specific criminal act involving one or more victims (BJS). These are incidents, not victimizations or persons. Violent crime = rape or sexual assault, robbery, aggravated assault and simple assault; homicide is not covered by the NCVS. Persons age 12 or older in U.S. households.",
        "race_note": "White and Black are non-Hispanic. Offender race/Hispanic origin is the victim's perception of the offender, not a recorded identity. Rows are offender race x victim race; nothing here indicates motive, and these figures must not be described as bias or hate crimes.",
        "comparability_note": "Not a strict time series: BJS changed the Hispanic multiple-offender rule in 2022 (all offenders Hispanic, previously any offender Hispanic); 2019 and 2018 tables exclude incidents with unknown offender race while 2021-2023 publish an Unknown column; 2018 is percentages only; 2020 is not published. Each BJS figure is an estimate from a sample survey; see se (standard error, same unit as count).",
        "flags_note": "bjs_flags copies BJS's markers: † / ‡ = difference from that table row's comparison group is significant at the 95% / 90% level (the comparison group differs by year: the intraracial cell in 2018-2019, the White-offender column in 2021-2023); * = the comparison group itself; ! = interpret with caution. They are not tests of White-on-Black versus Black-on-White.",
        "se_note": "se is the BJS-published standard error of the count. BJS significance tests use the 95% confidence level (roughly count +/- 1.96 x se). Our site does not compute its own intervals.",
        "not_used": [
            {"source": "NCVS API / NCVS Select Personal Victimization (data.ojp.usdoj.gov)", "status": "unreachable from our build machine on 2026-11-19 (TLS connection reset; also HTTP 500 via a second fetcher); not worked around.",
             "why_not_needed": "Its record-level files count victimizations (not incidents) on a collection-year basis and would require our own weighting; BJS's published incident tables are preferred."},
            {"source": "NCVS Dashboard (N-DASH, https://ncvs.bjs.ojp.gov/)", "status": "reachable", "why_not_needed": "Its incident characteristics (injury, reporting to police, victim-offender relationship, services, weapon) do not include offender race."},
        ],
        "built_by": "data/media/build_baseline_ncvs.py",
        "built": datetime.date.today().isoformat(),
        "years_status": years,
        "rows": rows,
    }
    with open(a.out, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print(f"wrote {a.out}: {len(rows)} rows")
    for y in years:
        print(y["year"], y["status"])
    for r in rows:
        if r["offender_race"] != r["victim_race"] and "Unknown" not in r["offender_race"]:
            print(r["year"], f"{r['offender_race']}->{r['victim_race']}", r.get("count"), r.get("se"), r.get("pct"), r.get("bjs_flags"))


if __name__ == "__main__":
    main()
