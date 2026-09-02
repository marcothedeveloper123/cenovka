"""Rebuild the datasets in ./data from the Czech Statistical Office API.

The CSVs are committed, so you only need this if you want fresher months or to
audit how they were built. See README.md for what each file is.

ČSÚ serves JSON-stat 2.0. The plain `/data/sady/{kod}` endpoint returns only one
default slice of a dataset — historical and alternate-frequency data lives behind
*named selections*, which is why every URL below is `/data/vybery/{vyberKod}`.
"""

import csv
import datetime as dt
import json
import urllib.request
from collections import defaultdict
from pathlib import Path

DATA = Path(__file__).resolve().parent / "data"
API = "https://data.csu.gov.cz/api/dotaz/v1/data/vybery"


def fetch(selection: str) -> dict:
    url = f"{API}/{selection}?format=JSON_STAT"
    with urllib.request.urlopen(url, timeout=120) as r:  # noqa: S310 - fixed https host
        return json.load(r)


def series(doc: dict, item_dim: str, time_dim: str) -> tuple[dict, dict]:
    """{item_code: {period: value}} plus the item labels, from a JSON-stat doc.

    The `value` array is row-major over `size`; dimension order differs between
    ČSÚ vintages, so the flat index is computed rather than assumed.
    """
    ids, size, val = doc["id"], doc["size"], doc["value"]
    pos = {d: i for i, d in enumerate(ids)}
    items = doc["dimension"][item_dim]["category"]
    times = doc["dimension"][time_dim]["category"]
    out = {}
    for code, ci in items["index"].items():
        row = {}
        for period, ti in times["index"].items():
            coord = [0] * len(ids)
            coord[pos[item_dim]] = ci
            coord[pos[time_dim]] = ti
            flat = 0
            for c, s in zip(coord, size, strict=True):
                flat = flat * s + c
            v = val[flat] if isinstance(val, list) else val.get(str(flat))
            row[period] = v
        out[code] = row
    return out, items.get("label", {})


def build_consumer_prices() -> None:
    """csu_food_xl.csv — 12 staples, monthly, 2006-01..2025-12.

    Three vintages spliced: weekly 2006-2010 averaged to months, then monthly
    2011-2018, then monthly 2019-2025. Only the 12 items whose definition is
    stable across all three survive; pork loin is dropped because it changed
    from with-bone to without-bone at the 2018/2019 boundary.
    """
    weekly, _ = series(fetch("CEN0101GT01"), "CENREP2", "CASW1")
    mid, _ = series(fetch("CEN0101GT02"), "CENREP2", "CasM")
    late, labels = series(fetch("CEN0101FT01"), "REPRCENS", "CasM")

    # ISO week -> the month containing its Thursday.
    def week_month(w: str) -> str:
        y, ww = int(w[:4]), int(w[6:])
        return dt.date.fromisocalendar(y, ww, 4).strftime("%Y-%m")

    codes = [c for c in late if c in mid and c in weekly]
    rows, months = [], None
    for code in codes:
        buckets = defaultdict(list)
        for w, v in weekly[code].items():
            if v is not None:
                buckets[week_month(w)].append(v)
        # Require >=3 weeks so a partial month can't bias the average.
        early = {m: sum(vs) / len(vs) for m, vs in buckets.items() if len(vs) >= 3}
        merged = {**early, **{k: v for k, v in mid[code].items() if v is not None},
                  **{k: v for k, v in late[code].items() if v is not None}}
        if months is None:
            months = sorted(merged)
        if any(m not in merged for m in months):
            continue  # gaps: dropped rather than interpolated
        rows.append([code, labels.get(code, code)] + [merged[m] for m in months])

    with (DATA / "csu_food_xl.csv").open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["code", "item"] + months)
        w.writerows(rows)
    print(f"csu_food_xl.csv: {len(rows)} series x {len(months)} months")


def build_producer_chain() -> None:
    """cen02_series.json — farm-gate (Z), producer (P) and consumer (S) prices
    for the same commodities, monthly 2013-01 onward. This is the covariate
    source: the only inputs that beat a naive baseline."""
    doc = fetch("CEN02T01")
    rows, labels = series(doc, "IndicatorType", "CasM")
    months = sorted(next(iter(rows.values())))
    payload = {
        "months": months,
        "labels": labels,
        "data": {c: [rows[c][m] for m in months] for c in rows},
    }
    (DATA / "cen02_series.json").write_text(json.dumps(payload))
    print(f"cen02_series.json: {len(rows)} indicators x {len(months)} months")


if __name__ == "__main__":
    DATA.mkdir(exist_ok=True)
    build_consumer_prices()
    build_producer_chain()
