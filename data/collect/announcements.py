"""Find the carriers' announced increases for a coming year, by rule, with no agent involved.

Issue #11: the year-over-year view projects each carrier's next year from its own announced
general rate increase. Announcements arrive months before the price lists (UPS and FedEx in
September to November, USPS in October to November), so this script watches the pages where
they appear, keeps a copy of each source in data/raw (with a manifest row and checksum) and
records the percentage with a verbatim quote in data/collect/announcements_found.csv. The
carrier pipelines merge those rows into data/processed/<carrier>/announced_increase.csv, and
data/tests/test_citations.py checks every quote against the saved page.

Sources, per carrier (each fetched live first, then from the latest Wayback capture):

- USPS (primary): the newsroom release that announces the January prices for the year,
  found on the national-releases index or by a Wayback CDX listing of the previous year's
  releases; the percentages per product come from its text.
- UPS (secondary): UPS's own rate pages render in the browser and carry no text, so the
  dated rate-increase table on ebb Logistics' GRI history page (already the source of the
  UPS 2024 row) is read: "<year> <percent>% <effective date>" in the UPS column.
- FedEx (primary): the FedEx rate-changes page, "will increase an average of <percent>%"
  under an "Effective <date>" heading in the target year.

Usage (polite: sequential, pauses with jitter, retries with backoff, identifying User-Agent):

    uv run python -m data.collect.announcements                 # next calendar year
    uv run python -m data.collect.announcements --year 2027
    uv run python -m data.collect.announcements --check         # report only, write nothing

Then rebuild the tables: uv run python -m data.pipeline.<carrier> for each carrier that changed.
"""

from __future__ import annotations

import argparse
import csv
import gzip
import hashlib
import html
import json
import random
import re
import sys
import time
import urllib.error
import urllib.request
from dataclasses import asdict, dataclass
from datetime import date
from pathlib import Path

DATA = Path(__file__).resolve().parents[1]
RAW = DATA / "raw"
MANIFEST = RAW / "manifest.csv"
FOUND = Path(__file__).resolve().parent / "announcements_found.csv"
FOUND_COLUMNS = [
    "carrier", "year", "product_scope", "rate_card", "percent", "source_type",
    "source_file", "source_ref", "source_quote", "url", "found_on",
]

USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) parcel-rates-dashboard/0.1 "
    "(+https://github.com/aivuk/parcel-rates; polite announcement watcher)"
)
PAUSE_SECONDS = 3.0
JITTER_SECONDS = 2.0
BACKOFF_SECONDS = (10, 30, 90)
TIMEOUT_SECONDS = 90

USPS_INDEX = "https://about.usps.com/newsroom/national-releases/"
USPS_RELEASES = "about.usps.com/newsroom/national-releases/{year}/"
UPS_TABLE = "https://ebblogistics.com/ups-fedex-rate-increase-history/"
FEDEX_PAGE = "https://www.fedex.com/en-us/shipping/rate-changes.html"
CDX = "https://web.archive.org/cdx/search/cdx"

MONTH = r"(?:January|February|March|April|May|June|July|August|September|October|November|December)"
NUMBER = r"(\d+(?:\.\d+)?)"
SHORT_MONTH = r"(?:Jan|Feb|Mar|Apr|May|June?|July?|Aug|Sept?|Oct|Nov|Dec)[a-z]*\.?"

# USPS product names as the releases write them -> product_scope in announced_increase.csv.
# "Priority Mail" must not match the start of "Priority Mail Express".
USPS_PRODUCTS = [
    ("usps_ground_advantage", r"USPS Ground Advantage"),
    ("usps_priority_mail_express", r"Priority Mail Express"),
    ("usps_priority_mail", r"Priority Mail(?! Express)"),
]


@dataclass(frozen=True)
class Found:
    carrier: str
    year: int
    product_scope: str
    rate_card: str
    percent: str
    source_type: str
    quote: str


# ---------------------------------------------------------------------------- text and rules
def page_text(raw: str) -> str:
    """Visible text of an HTML page, whitespace collapsed (the same text the citation test reads)."""
    raw = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", raw, flags=re.S | re.I)
    text = html.unescape(re.sub(r"<[^>]+>", " ", raw))
    return re.sub(r"\s+", " ", text.replace(" ", " ")).strip()


def usps_release_links(index_html: str, year: int) -> list[str]:
    """Links to releases published in year - 1 that announce competitive or shipping prices
    "for <year>" (the January price change), oldest first."""
    pattern = re.compile(
        rf'(?:https://about\.usps\.com)?/newsroom/national-releases/{year - 1}/\d{{4}}-'
        rf'[a-z0-9-]*(?:competitive|shipping)[a-z0-9-]*prices?[a-z0-9-]*-for-{year}\.htm'
    )
    links = sorted(set(pattern.findall(index_html)))
    return [link if link.startswith("http") else "https://about.usps.com" + link for link in links]


def usps_percentages(text: str, year: int) -> list[Found]:
    """Per-product percentages from a USPS price release. Both phrasings occur:
    "USPS Ground Advantage prices would increase by 5.4 percent" and
    "3.9 percent for USPS Ground Advantage"."""
    found: dict[str, Found] = {}
    sentences = re.split(r"(?<=[.;])\s+", text)
    for sentence in sentences:
        for scope, name in USPS_PRODUCTS:
            if scope in found:
                continue
            after = re.search(rf"{name}[^.;]{{0,80}}?(increase|decrease)[^.;]{{0,40}}?{NUMBER} percent", sentence)
            before = re.search(rf"{NUMBER} percent for {name}", sentence)
            if after:
                pct = after.group(2) if after.group(1) == "increase" else "-" + after.group(2)
                found[scope] = Found("usps", year, scope, "", pct, "primary", after.group(0))
            elif before:
                found[scope] = Found("usps", year, scope, "", before.group(1), "primary", before.group(0))
    return list(found.values())


def ups_from_history_table(text: str, year: int) -> Found | None:
    """The UPS column of the dated GRI table: "<year> <percent>% <Month D, YYYY>". The page
    writes "<year> Not yet announced" while UPS has not announced."""
    match = re.search(rf"\b{year} {NUMBER}% ({MONTH} \d{{1,2}}, \d{{4}})", text)
    if not match:
        return None
    return Found("ups", year, "all", "list", match.group(1), "secondary", match.group(0))


def fedex_from_rate_changes(text: str, year: int) -> Found | None:
    """FedEx's average increase under an "Effective <date>" heading in `year`, e.g. "Effective
    Jan. 4, 2027 FedEx package standard list rates ... will increase an average of 5.9%."
    The quote starts at the last "FedEx" before the percentage."""
    match = re.search(
        rf"Effective {SHORT_MONTH} \d{{1,2}}, {year}\s+((?:(?!Effective ).){{0,40}}?"
        rf"FedEx(?:(?!FedEx).){{0,200}}?will increase an average of {NUMBER}%\.)",
        text,
    )
    if not match:
        return None
    return Found("fedex", year, "all", "list", match.group(2), "primary", match.group(1).strip())


# ---------------------------------------------------------------------------- polite fetching
def fetch(url: str) -> bytes | None:
    """GET with retries; None when the resource does not exist or keeps failing."""
    for attempt, wait in enumerate((0, *BACKOFF_SECONDS)):
        if wait:
            time.sleep(wait)
        time.sleep(PAUSE_SECONDS + random.uniform(0, JITTER_SECONDS))
        request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        try:
            with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
                body = response.read()
            # Wayback id_ captures keep the original Content-Encoding, often gzip.
            return gzip.decompress(body) if body[:2] == b"\x1f\x8b" else body
        except urllib.error.HTTPError as err:
            if err.code not in (429, 500, 502, 503, 504):
                print(f"  {err.code} {url}")
                return None
            print(f"  {err.code} {url}, retry {attempt + 1}")
        except (urllib.error.URLError, TimeoutError, OSError) as err:
            print(f"  {err} {url}, retry {attempt + 1}")
    return None


def latest_capture(url: str) -> str | None:
    """The id_ passthrough URL of the latest 200 capture of `url` in the Wayback Machine."""
    query = f"{CDX}?url={urllib.request.quote(url, safe='')}&output=json&fl=timestamp,original&filter=statuscode:200&limit=-1"
    body = fetch(query)
    if not body:
        return None
    rows = json.loads(body.decode("utf-8") or "[]")[1:]
    if not rows:
        return None
    timestamp, original = rows[-1]
    return f"https://web.archive.org/web/{timestamp}id_/{original}"


def cdx_prefix(prefix: str) -> list[str]:
    """Original URLs of 200 captures under a URL prefix (one per URL)."""
    query = f"{CDX}?url={urllib.request.quote(prefix, safe='')}&matchType=prefix&output=json&fl=original&filter=statuscode:200&collapse=urlkey"
    body = fetch(query)
    if not body:
        return []
    return [row[0] for row in json.loads(body.decode("utf-8") or "[]")[1:]]


BLOCK_PAGE = re.compile(r"(?i)you don't have permission to view|access denied|request unsuccessful|captcha")


def blocked(body: bytes) -> bool:
    """A bot-protection page served with status 200 (FedEx does this)."""
    return bool(BLOCK_PAGE.search(page_text(body[:20000].decode("utf-8", "replace"))))


def get_page(url: str) -> tuple[str, bytes] | None:
    """(where it came from, body): live first, else the latest Wayback capture."""
    body = fetch(url)
    if body and not blocked(body):
        return url, body
    if body:
        print(f"  blocked live page, trying the Wayback Machine: {url}")
    capture = latest_capture(url)
    if capture:
        body = fetch(capture)
        if body:
            return capture, body
    return None


# ---------------------------------------------------------------------------- per carrier
def find_usps(year: int) -> list[tuple[Found, str, bytes]]:
    links: list[str] = []
    index = get_page(USPS_INDEX)
    if index:
        links = usps_release_links(index[1].decode("utf-8", "replace"), year)
    if not links:
        listing = " ".join(cdx_prefix(USPS_RELEASES.format(year=year - 1)))
        links = usps_release_links(listing.replace("http://", "https://"), year)
    out = []
    for link in links:
        page = get_page(link)
        if not page:
            continue
        for found in usps_percentages(page_text(page[1].decode("utf-8", "replace")), year):
            out.append((found, page[0], page[1]))
        if out:
            break
    return out


def find_ups(year: int) -> list[tuple[Found, str, bytes]]:
    page = get_page(UPS_TABLE)
    if not page:
        return []
    found = ups_from_history_table(page_text(page[1].decode("utf-8", "replace")), year)
    return [(found, page[0], page[1])] if found else []


def find_fedex(year: int) -> list[tuple[Found, str, bytes]]:
    page = get_page(FEDEX_PAGE)
    if not page:
        return []
    found = fedex_from_rate_changes(page_text(page[1].decode("utf-8", "replace")), year)
    return [(found, page[0], page[1])] if found else []


FINDERS = {"usps": find_usps, "ups": find_ups, "fedex": find_fedex}


# ---------------------------------------------------------------------------- recording
def read_found() -> list[dict]:
    if not FOUND.exists():
        return []
    with FOUND.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def processed_rows() -> list[dict]:
    """announced_increase rows already in the processed tables (curated or found earlier)."""
    rows = []
    for carrier in FINDERS:
        path = DATA / "processed" / carrier / "announced_increase.csv"
        if path.exists():
            with path.open(newline="", encoding="utf-8") as handle:
                rows += list(csv.DictReader(handle))
    return rows


def raw_name(found: Found, url: str) -> str:
    stem = re.sub(r"[^a-z0-9]+", "-", url.split("/")[-1].split("?")[0].lower()).strip("-") or "page"
    stem = stem.removesuffix("-htm").removesuffix("-html")
    return f"{found.carrier}/{found.year}/announcement_{date.today().isoformat()}_{stem}.html"


def record(results: list[tuple[Found, str, bytes]]) -> int:
    """Save each new source to data/raw with a manifest row and add its rows to FOUND."""
    rows = read_found()
    known = {(r["carrier"], r["year"], r["product_scope"], r["rate_card"]) for r in rows + processed_rows()}
    with MANIFEST.open(newline="", encoding="utf-8") as handle:
        manifest = list(csv.DictReader(handle))
    saved: dict[str, str] = {}
    added = 0
    for found, url, body in results:
        key = (found.carrier, str(found.year), found.product_scope, found.rate_card)
        if key in known:
            continue
        if url not in saved:
            path = raw_name(found, url)
            target = RAW / path
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(body)
            manifest.append({
                "carrier": found.carrier, "year": str(found.year), "path": path, "url": url,
                "method": "wayback" if "web.archive.org" in url else "direct",
                "sha256": hashlib.sha256(body).hexdigest(), "bytes": str(len(body)), "in_git": "true",
                "content": f"{found.carrier.upper()} announcement of the {found.year} increase, found by data/collect/announcements.py",
            })
            saved[url] = path
        rows.append({**{k: str(v) for k, v in asdict(found).items() if k != "quote"},
                     "source_file": saved[url], "source_ref": "", "source_quote": found.quote,
                     "url": url, "found_on": date.today().isoformat()})
        known.add(key)
        added += 1
    if added:
        with MANIFEST.open("w", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(handle, fieldnames=list(manifest[0].keys()))
            writer.writeheader()
            writer.writerows(manifest)
        with FOUND.open("w", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(handle, fieldnames=FOUND_COLUMNS)
            writer.writeheader()
            writer.writerows(rows)
    return added


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--year", type=int, default=date.today().year + 1)
    parser.add_argument("--carrier", choices=sorted(FINDERS))
    parser.add_argument("--check", action="store_true", help="report only; save nothing")
    args = parser.parse_args(argv)

    results = []
    for carrier, finder in FINDERS.items():
        if args.carrier and carrier != args.carrier:
            continue
        print(f"{carrier} {args.year}:")
        found = finder(args.year)
        if not found:
            print("  no announcement found")
        for f, url, _ in found:
            print(f"  {f.product_scope} {f.percent}% ({f.source_type}) from {url}\n    \"{f.quote}\"")
        results += found
    if args.check or not results:
        return 0
    added = record(results)
    print(f"recorded {added} new row(s) in {FOUND.relative_to(DATA.parent)}; rebuild with data.pipeline.<carrier>")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
