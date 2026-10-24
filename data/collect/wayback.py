"""Wayback Machine CDX lookups and capture selection, for source discovery (issue #13).

The carriers' own sites block scripted clients or replace files in place, so most raw
sources are taken from the Wayback Machine. Which capture to take is decided here by
rule, never by hand: query the CDX index for a URL (or a URL prefix), then pick the
capture a `Pick` describes. The id_ passthrough URL of that capture returns the
original bytes.

Two clients answer CDX queries:

- `LiveCdx` asks web.archive.org, politely (sequential, a pause with jitter between
  requests, backoff on 429 and 5xx, an identifying User-Agent). It can keep every
  response it got, so a run can be recorded.
- `RecordedCdx` answers from such a recording, so tests and `--offline` runs need no
  network. data/tests/fixtures/cdx.json.gz is the recording the tests use.
"""

from __future__ import annotations

import gzip
import json
import random
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

CDX = "https://web.archive.org/cdx/search/cdx"
FIELDS = "urlkey,timestamp,original,statuscode,mimetype,digest"
USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) parcel-rates-dashboard/0.1 "
    "(+https://github.com/aivuk/parcel-rates; polite source discovery)"
)
PAUSE_SECONDS = 3.0
JITTER_SECONDS = 2.0
BACKOFF_SECONDS = (10, 30, 90)
TIMEOUT_SECONDS = 180


@dataclass(frozen=True)
class Capture:
    urlkey: str
    timestamp: str  # YYYYMMDDhhmmss
    original: str
    status: str  # "200", "301", ...; "-" for a revisit record (same bytes as an earlier capture)
    mimetype: str
    digest: str


@dataclass(frozen=True)
class Pick:
    """Which capture to take: the latest (or earliest) good capture in [after, before).

    `after` and `before` are dates (YYYY-MM-DD) or 14-digit timestamps; either may be
    empty. A good capture has status 200, or is a revisit of bytes some 200 capture
    returned. `mimetype`, when set, must be contained in the capture's type.
    """

    before: str = ""
    after: str = ""
    latest: bool = True
    mimetype: str = ""


def stamp(value: str) -> str:
    """A date or timestamp as a 14-digit CDX timestamp; '' stays ''."""
    digits = value.replace("-", "")
    return digits.ljust(14, "0") if digits else ""


def good(captures: list[Capture], mimetype: str = "") -> list[Capture]:
    ok_digests = {c.digest for c in captures if c.status == "200"}
    keep = [c for c in captures if c.status == "200" or (c.status == "-" and c.digest in ok_digests)]
    return [c for c in keep if mimetype in c.mimetype] if mimetype else keep


def select(captures: list[Capture], pick: Pick) -> Capture | None:
    lo, hi = stamp(pick.after), stamp(pick.before)
    window = [c for c in good(captures, pick.mimetype) if (not lo or c.timestamp >= lo) and (not hi or c.timestamp < hi)]
    if not window:
        return None
    window.sort(key=lambda c: c.timestamp)
    return window[-1] if pick.latest else window[0]


def id_url(timestamp: str, original: str) -> str:
    """The passthrough URL that returns the capture's original bytes."""
    return f"https://web.archive.org/web/{timestamp}id_/{original}"


def query_string(url: str, prefix: bool = False, pick: Pick | None = None) -> str:
    params = {"url": url, "output": "json", "fl": FIELDS}
    if prefix:
        params |= {"matchType": "prefix", "collapse": "urlkey"}
    # The window narrows the answer (CDX bounds are inclusive; select() applies the exact ones).
    if pick and pick.after:
        params["from"] = stamp(pick.after)
    if pick and pick.before:
        params["to"] = stamp(pick.before)
    return urllib.parse.urlencode(params)


def parse(body: str) -> list[Capture]:
    rows = json.loads(body or "[]")
    return [Capture(*row) for row in rows[1:]]


class CdxClient(Protocol):
    def raw(self, query: str) -> str: ...


def captures(client: CdxClient, url: str, pick: Pick | None = None) -> list[Capture]:
    """Every capture of one URL, within the pick's window when one is given."""
    return parse(client.raw(query_string(url, pick=pick)))


def listing(client: CdxClient, prefix: str) -> list[Capture]:
    """The first capture of every URL under a prefix."""
    return parse(client.raw(query_string(prefix, prefix=True)))


class LiveCdx:
    def __init__(self, keep: bool = False, reuse: dict[str, str] | None = None) -> None:
        """`reuse`: answers from an earlier recording, asked again only when missing."""
        self.kept: dict[str, str] = dict(reuse or {})
        self.keep = keep
        self.asked: set[str] = set()
        self._last = 0.0

    def raw(self, query: str) -> str:
        self.asked.add(query)
        if query in self.kept:
            return self.kept[query]
        body = self._get(f"{CDX}?{query}")
        if self.keep or self.kept:
            self.kept[query] = body
        return body

    def _get(self, url: str) -> str:
        request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        for attempt, backoff in enumerate((*BACKOFF_SECONDS, None)):
            wait = PAUSE_SECONDS + random.uniform(0, JITTER_SECONDS) - (time.monotonic() - self._last)
            if wait > 0:
                time.sleep(wait)
            try:
                with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
                    return response.read().decode("utf-8")
            except urllib.error.HTTPError as error:
                if not (error.code == 429 or error.code >= 500) or backoff is None:
                    raise
                problem: Exception = error
            except (urllib.error.URLError, TimeoutError, ConnectionError) as error:
                if backoff is None:
                    raise
                problem = error
            finally:
                self._last = time.monotonic()
            print(f"    CDX retry {attempt + 1} in {backoff}s ({problem})", flush=True)
            time.sleep(backoff)
        raise RuntimeError("unreachable")

    def save(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        with gzip.open(path, "wt", encoding="utf-8") as handle:
            json.dump(dict(sorted(self.kept.items())), handle, indent=0)


class RecordedCdx:
    def __init__(self, path: Path) -> None:
        with gzip.open(path, "rt", encoding="utf-8") as handle:
            self.responses: dict[str, str] = json.load(handle)

    def raw(self, query: str) -> str:
        if query not in self.responses:
            raise KeyError(f"no recorded CDX response for {urllib.parse.unquote(query)}")
        return self.responses[query]
