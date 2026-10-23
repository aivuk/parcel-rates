"""Rebuild data/raw/manifest.csv from the source catalogue, with no agent in the loop (issue #13).

Every row comes from an entry in data/collect/sources.py: a direct URL, a USPS price-file
name found in the CDX listing of Postal Explorer's PriceChange folder, or the Wayback
capture a rule selects. Checksums are carried over from the committed manifest when a row's
URL is unchanged; a new or changed URL gets empty ones, which the fetch fills in.

    uv run python -m data.collect.discover                # compare with the manifest, write nothing
    uv run python -m data.collect.discover --write        # rewrite the manifest
    uv run python -m data.collect.discover --newer        # also list captures after each cut-off
    python3 data/fetch_raw.py --record                    # then fetch and fill in checksums

From a clean clone the two commands rebuild data/raw: discovery writes the manifest, the
fetcher downloads what is not in git and checks every file against its checksum.

`--offline FILE` answers CDX queries from a recording (data/tests/fixtures/cdx.json.gz is
the one the tests use) and `--record FILE` writes one. CDX lookups are sequential with a
3 to 5 s pause; a full run asks about 90 questions and takes ten minutes or more.
"""

from __future__ import annotations

import argparse
import csv
import sys
from pathlib import Path

from data.collect import wayback
from data.collect.sources import SOURCES, USPS_PRICE_FOLDER, Source, usps_price_file

RAW = Path(__file__).resolve().parents[1] / "raw"
MANIFEST = RAW / "manifest.csv"
FIXTURE = Path(__file__).resolve().parents[1] / "tests" / "fixtures" / "cdx.json.gz"
COLUMNS = ["carrier", "year", "path", "url", "method", "sha256", "bytes", "in_git", "content"]


class Unresolved(Exception):
    pass


class Discovery:
    def __init__(self, client: wayback.CdxClient) -> None:
        self.client = client
        self._folder: list[wayback.Capture] | None = None

    def price_folder(self) -> list[wayback.Capture]:
        if self._folder is None:
            self._folder = wayback.listing(self.client, USPS_PRICE_FOLDER)
        return self._folder

    def url(self, source: Source) -> str:
        if source.price_label:
            url = usps_price_file(source.price_label, self.price_folder())
            if not url:
                raise Unresolved(f"no price-file zip named {source.price_label!r} in the PriceChange listing")
            return url
        if source.original:
            capture = wayback.select(wayback.captures(self.client, source.original, source.pick), source.pick)
            if not capture:
                raise Unresolved(f"no capture of {source.original} matches {source.pick}")
            return wayback.id_url(capture.timestamp, source.original)
        return source.url

    def newer(self, source: Source, chosen: str) -> list[wayback.Capture]:
        """The latest good capture after the cut-off, when its bytes differ from the chosen one's."""
        if not source.original:
            return []
        every = wayback.captures(self.client, source.original)
        taken = next((c for c in every if wayback.id_url(c.timestamp, source.original) == chosen), None)
        # Same kind of file as the one taken: a PDF's URL also answers with HTML block pages.
        kind = taken.mimetype if taken else source.pick.mimetype
        after = wayback.select(every, wayback.Pick(after=source.pick.before, mimetype=kind))
        return [after] if after and (not taken or after.digest != taken.digest) else []


def read_manifest(path: Path = MANIFEST) -> list[dict]:
    if not path.is_file():
        return []
    with path.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def write_manifest(rows: list[dict], path: Path = MANIFEST) -> None:
    tmp = path.with_suffix(".csv.tmp")
    with tmp.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=COLUMNS, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)
    tmp.replace(path)


def row_for(source: Source, url: str, known: dict[str, dict]) -> dict:
    old = known.get(source.path)
    same = old is not None and old["url"] == url
    return {
        "carrier": source.carrier,
        "year": source.year,
        "path": source.path,
        "url": url,
        "method": source.method,
        "sha256": old["sha256"] if same else "",
        "bytes": old["bytes"] if same else "",
        "in_git": "true" if source.in_git else "false",
        "content": source.content,
    }


def discover(client: wayback.CdxClient, sources: list[Source], known: dict[str, dict],
             log=print) -> tuple[list[dict], list[str]]:
    """Manifest rows for `sources`, and the problems that kept some out."""
    d = Discovery(client)
    rows, problems = [], []
    for i, source in enumerate(sources, 1):
        try:
            url = d.url(source)
        except (Unresolved, OSError) as error:
            problems.append(f"{source.path}: {error}")
            log(f"!! {source.path}: {error}")
            continue
        log(f"{i:3d}/{len(sources)} {source.path}")
        rows.append(row_for(source, url, known))
    return rows, problems


def differences(new: list[dict], old: list[dict]) -> list[str]:
    out = []
    old_by = {r["path"]: r for r in old}
    new_paths = {r["path"] for r in new}
    for r in new:
        before = old_by.get(r["path"])
        if before is None:
            out.append(f"+ {r['path']}  {r['url']}")
            continue
        for column in ("url", "method", "in_git", "content", "carrier", "year"):
            if r[column] != before[column]:
                out.append(f"~ {r['path']}  {column}: {before[column]!r} -> {r[column]!r}")
    out += [f"- {r['path']}" for r in old if r["path"] not in new_paths]
    if not out and [r["path"] for r in new] != [r["path"] for r in old]:
        out.append("~ row order differs")
    return out


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--write", action="store_true", help="rewrite data/raw/manifest.csv")
    parser.add_argument("--newer", action="store_true", help="also report captures after each cut-off")
    parser.add_argument("--carrier", help="only this carrier (with --write, other rows are kept as they are)")
    parser.add_argument("--offline", type=Path, nargs="?", const=FIXTURE, help="answer CDX queries from a recording")
    parser.add_argument("--record", type=Path, nargs="?", const=FIXTURE, help="save every CDX response to a recording")
    parser.add_argument("--reuse", type=Path, help="answer from this recording where it can, ask the archive otherwise")
    args = parser.parse_args(argv)

    if args.offline:
        client = wayback.RecordedCdx(args.offline)
    else:
        reuse = wayback.RecordedCdx(args.reuse).responses if args.reuse else None
        client = wayback.LiveCdx(keep=bool(args.record), reuse=reuse)
    old = read_manifest()
    known = {r["path"]: r for r in old}
    sources = [s for s in SOURCES if not args.carrier or s.carrier == args.carrier]
    rows, problems = discover(client, sources, known)

    if args.carrier:
        mine = {r["path"]: r for r in rows}
        rows = [mine.get(r["path"], r) for r in old if r["carrier"] != args.carrier or r["path"] in mine]
        rows += [r for r in mine.values() if r["path"] not in known]
    changes = differences(rows, old)
    print(f"\n{len(rows)} rows, {len(changes)} differences from the manifest, {len(problems)} unresolved")
    for line in changes:
        print("  " + line)

    if args.newer:
        d = Discovery(client)
        by_path = {r["path"]: r for r in rows}
        for source in sources:
            if source.path in by_path:
                for capture in d.newer(source, by_path[source.path]["url"]):
                    print(f"  newer: {source.path}  {capture.timestamp} ({capture.mimetype})")
    if args.record:
        used = client.asked
        client.kept = {q: a for q, a in client.kept.items() if q in used}
        client.save(args.record)
        print(f"recorded {len(client.kept)} CDX responses to {args.record}")
    if args.write and not problems:
        write_manifest(rows)
        print(f"wrote {MANIFEST}")
    elif args.write:
        print("not writing the manifest: some sources could not be resolved")
    return 1 if problems or (changes and not args.write) else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
