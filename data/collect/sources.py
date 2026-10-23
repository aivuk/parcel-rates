"""The raw-source catalogue: every file in data/raw/manifest.csv, and the rule that finds it.

Discovery (data/collect/discover.py) turns these entries into manifest rows with no agent
involved. The USPS price changes are a pattern in code below; every other source is a row
of data/collect/sources.csv (method, the URL, the cut-off for archived files, whether a
direct page is live, whether the file is kept in git, and its description). Three kinds
of entry:

- `direct`: a URL on the publisher's own site that serves the file as is. Entries marked
  `live` point at a page that is replaced in place (a DMM section, a zone-chart page), so a
  later fetch can return newer bytes; their copies are kept in git.
- `archived`: a file taken from the Wayback Machine. The entry gives the publisher's URL
  and a `Pick` (the latest good capture before a cut-off date); discovery asks the CDX
  index and emits the id_ passthrough URL of the capture the rule selects. The cut-offs
  reproduce the captures the data were built from (a full timestamp, one second after the
  capture, where the archive holds several captures that day); to take a newer version,
  move the cut-off and re-run discovery, then the fetch and the data tests.
- USPS price changes: one entry per price change in `USPS_PRICE_CHANGES` gives its
  Notice 123 PDF (the DMM archive folder named after the effective date) and its price-file
  zip, whose file name is discovered from the CDX listing of Postal Explorer's PriceChange
  folder (see `usps_price_file`).

Order matters: it is the order of the manifest rows.
"""

from __future__ import annotations

import csv
import re
import urllib.parse
from dataclasses import dataclass
from pathlib import Path

from data.collect.wayback import Capture, Pick

USPS_DMM_ARCHIVE = "https://pe.usps.com/Archive/PDF/DMMArchive{date}/Notice123.pdf"
USPS_PRICE_FOLDER = "pe.usps.com/resources/PriceChange/"


@dataclass(frozen=True)
class Source:
    carrier: str
    year: str
    path: str
    content: str
    in_git: bool
    url: str = ""  # direct: the file itself
    original: str = ""  # archived: the publisher's URL
    pick: Pick | None = None
    live: bool = False  # direct, and replaced in place by the publisher
    price_label: str = ""  # USPS price-file zip: the label its file name starts with

    @property
    def method(self) -> str:
        return "wayback" if self.original else "direct"


def direct(carrier: str, year: str, path: str, url: str, *, in_git: bool, content: str, live: bool = False) -> Source:
    return Source(carrier, year, path, content, in_git, url=url, live=live)


def archived(carrier: str, year: str, path: str, original: str, *, before: str, in_git: bool, content: str,
             after: str = "", mimetype: str = "") -> Source:
    return Source(carrier, year, path, content, in_git, original=original,
                  pick=Pick(before=before, after=after, mimetype=mimetype))


# ---------------------------------------------------------------------------- USPS price changes
@dataclass(frozen=True)
class PriceChange:
    effective: str  # YYYY-MM-DD, also the DMM archive folder date
    label: str  # how Postal Explorer names its files, e.g. "July 2024", "Time-Limited 2025"
    kind: str = ""  # "", "peak" or "transportation"
    ends: str = ""  # last day of a time-limited change
    note: str = ""
    notice_url: str = ""  # when the Notice 123 PDF is not in the DMM archive folder


USPS_PRICE_CHANGES = [
    PriceChange("2022-01-09", "January 2022", note="PM, PME, FCPS, Retail Ground, Parcel Select Ground tables by zone and weight; surcharge footnotes"),
    PriceChange("2022-07-10", "July 2022"),
    PriceChange("2022-10-02", "October 2022", "peak", "2023-01-22"),
    PriceChange("2023-01-22", "January 2023"),
    PriceChange("2023-07-09", "July 2023", note="first Ground Advantage prices"),
    PriceChange("2024-01-21", "January 2024"),
    PriceChange("2024-07-14", "July 2024"),
    PriceChange("2024-10-06", "October 2024", "peak", "2025-01-19"),
    PriceChange("2025-01-19", "January 2025"),
    PriceChange("2025-07-13", "July 2025"),
    PriceChange("2025-10-05", "Time-Limited 2025", "peak", "2026-01-18"),
    PriceChange("2026-01-18", "January 2026"),
    PriceChange("2026-04-26", "Transportation-Related Time-Limited 2026", "transportation", "2027-01-17",
                notice_url="https://pe.usps.com/resources/PriceChange/Transportation-Related%20Time-Limited%202026%20Price%20Change%20-%20Notice123%20PDF.pdf"),
    PriceChange("2026-07-12", "July 2026"),
    PriceChange("2026-10-04", "Time-Limited OCT 2026", "peak", "2027-01-17",
                # the same bytes as the "current" notice123.pdf it was first taken from, at a stable name
                notice_url="https://pe.usps.com/resources/PriceChange/Time-Limited%20OCT%202026%20Price%20Change%20-%20Notice123%20PDF%20-%20Final.pdf"),
]

SUFFIX = {"": "", "peak": "_peak", "transportation": "_transportation"}


def notice_source(pc: PriceChange) -> Source:
    year = pc.effective[:4]
    path = f"usps/{year}/notice123_{pc.effective}{SUFFIX[pc.kind]}.pdf"
    head = "Notice 123 Price List PDF"
    if pc.kind == "peak":
        content = f"{head}, peak-season prices {pc.effective} to {pc.ends}"
    elif pc.kind == "transportation":
        content = f"{head}, transportation-related time-limited prices {pc.effective} to {pc.ends}"
    else:
        content = f"{head} effective {pc.effective}" + (f" ({pc.note})" if pc.note else "")
    url = pc.notice_url or USPS_DMM_ARCHIVE.format(date=pc.effective.replace("-", ""))
    return direct("usps", year, path, url, in_git=False, content=content)


def zip_source(pc: PriceChange) -> Source:
    year = pc.effective[:4]
    note = {"": "", "peak": " (peak)", "transportation": " (transportation time-limited)"}[pc.kind]
    return Source(
        "usps", year, f"usps/{year}/price_files_csv_{pc.effective}{SUFFIX[pc.kind]}.zip",
        "Postal Explorer price-file CSV zip (~50 CSVs, one per product incl. PM/PME/GA retail) "
        f"effective {pc.effective}{note}",
        in_git=True, price_label=pc.label,
    )


# A price change's files are revised (draft, proposed, final) under new names. The zip with
# the retail CSVs is a "Notice 123" zip (2023 on) or a "Price Files - CSV" zip (before);
# SKU files, drafts, redlines, proposals and the alternative scenarios USPS published while
# a case was pending are not. Of the rest, the file the Wayback Machine first saw last is
# the final one.
PRICE_FILE_KINDS = re.compile(r"(Notice 123|Price Files - CSV)")
NOT_FINAL = re.compile(r"(?i)SKU|Draft|Redline|Proposed|HPM|BPM|Status Quo")


def usps_price_file(label: str, folder: list[Capture]) -> str | None:
    """The price-file zip of the price change named `label`, from a CDX listing of the folder."""
    best: tuple[str, str] | None = None
    for capture in folder:
        name = urllib.parse.unquote(capture.original.split("/PriceChange/", 1)[-1])
        if capture.status != "200" or not name.endswith(".zip") or not name.startswith(label + " "):
            continue
        if not PRICE_FILE_KINDS.search(name) or NOT_FINAL.search(name):
            continue
        if best is None or capture.timestamp > best[0]:
            best = (capture.timestamp, name)
    return f"https://{USPS_PRICE_FOLDER}{urllib.parse.quote(best[1])}" if best else None


# ---------------------------------------------------------------------------- everything else
CATALOGUE = Path(__file__).resolve().parent / "sources.csv"


def load_catalogue(path: Path = CATALOGUE) -> list[Source]:
    """Every other source, one row each: a direct URL, or a publisher URL and its cut-off."""
    with path.open(newline="", encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))
    out = []
    for r in rows:
        common = dict(in_git=r["in_git"] == "true", content=r["content"])
        if r["method"] == "wayback":
            out.append(archived(r["carrier"], r["year"], r["path"], r["url"], before=r["before"],
                                mimetype=r["mimetype"], **common))
        else:
            out.append(direct(r["carrier"], r["year"], r["path"], r["url"], live=r["live"] == "true", **common))
    return out


SOURCES: list[Source] = [
    *(notice_source(pc) for pc in USPS_PRICE_CHANGES),
    *(zip_source(pc) for pc in USPS_PRICE_CHANGES),
    *load_catalogue(),
]
