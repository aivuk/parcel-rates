"""Source discovery (data/collect/discover.py, sources.py, wayback.py), offline.

The rules are tested on small hand-made CDX answers. The last test replays the recorded
CDX answers in fixtures/cdx.json.gz through the whole catalogue and checks that discovery
rebuilds the committed manifest row for row: refresh the recording with
`uv run python -m data.collect.discover --record` when the catalogue changes.
"""
from __future__ import annotations

import pytest

from data.collect import discover as d
from data.collect import wayback as w
from data.collect.sources import SOURCES, usps_price_file


def cap(ts: str, status: str = "200", mimetype: str = "application/pdf", digest: str = "A", original: str = "x") -> w.Capture:
    return w.Capture("key", ts, original, status, mimetype, digest)


CAPTURES = [
    cap("20240101120000", digest="OLD"),
    cap("20240301120000", status="403", mimetype="text/html", digest="BLOCK"),
    cap("20240401120000", digest="NEW"),
    cap("20240405120000", status="-", mimetype="warc/revisit", digest="NEW"),
    cap("20240410120000", status="-", mimetype="warc/revisit", digest="BLOCK"),
    cap("20240501120000", mimetype="text/html", digest="PAGE"),
]


def test_stamp_pads_dates_to_cdx_timestamps():
    assert w.stamp("2024-04-02") == "20240402000000"
    assert w.stamp("20240402123456") == "20240402123456"
    assert w.stamp("") == ""


def test_select_takes_the_latest_good_capture_before_the_cut_off():
    assert w.select(CAPTURES, w.Pick(before="2024-04-02")).timestamp == "20240401120000"
    assert w.select(CAPTURES, w.Pick(before="2024-03-31")).timestamp == "20240101120000"  # the 403 is skipped


def test_select_keeps_revisits_of_good_bytes_only():
    # The revisit of NEW counts; the revisit of the 403 block page does not.
    assert w.select(CAPTURES, w.Pick(before="2024-04-30")).timestamp == "20240405120000"


def test_select_honours_after_earliest_and_mimetype():
    assert w.select(CAPTURES, w.Pick(after="2024-02-01", latest=False)).timestamp == "20240401120000"
    assert w.select(CAPTURES, w.Pick(mimetype="pdf")).timestamp == "20240401120000"
    assert w.select(CAPTURES, w.Pick(before="2023-12-31")) is None


def test_id_url_and_query_window():
    assert w.id_url("20240401120000", "https://a.example/f.pdf") == "https://web.archive.org/web/20240401120000id_/https://a.example/f.pdf"
    q = w.query_string("a.example/f.pdf", pick=w.Pick(before="2024-04-02"))
    assert "to=20240402000000" in q and "from=" not in q


FOLDER = [
    cap("20240409204843", original="https://pe.usps.com/resources/PriceChange/July%202024%20Price%20Change%20040924%20-%20Notice%20123.zip"),
    cap("20240511035537", original="https://pe.usps.com/resources/PriceChange/July%202024%20Price%20Change%20Draft%20Redlines%20-%20051024.zip"),
    cap("20240710113432", original="https://pe.usps.com/resources/PriceChange/July%202024%20Price%20Change%2020240614%20-%20Notice%20123.zip"),
    cap("20240720000000", original="https://pe.usps.com/resources/PriceChange/July%202024%20Price%20Change%20-%20SKU%20Price%20Files.zip"),
    cap("20240710113412", original="https://pe.usps.com/resources/PriceChange/July%202024%20Price%20Change%2020240625%20-%20Notice123.pdf"),
    cap("20220415154804", original="https://pe.usps.com/resources/PriceChange/July%202022%20-%20Price%20Files%20-%20CSV.zip"),
    cap("20250412192722", original="https://pe.usps.com/resources/PriceChange/July%202025%20Price%20Change%2020250411%20-%20Notice%20123%20-%20HPM%20and%20no%20BPM.zip"),
]


def test_usps_price_file_takes_the_last_final_notice_123_zip():
    assert usps_price_file("July 2024", FOLDER) == (
        "https://pe.usps.com/resources/PriceChange/July%202024%20Price%20Change%2020240614%20-%20Notice%20123.zip"
    )
    assert usps_price_file("July 2022", FOLDER).endswith("/July%202022%20-%20Price%20Files%20-%20CSV.zip")
    assert usps_price_file("July 2025", FOLDER) is None  # only an alternative scenario
    assert usps_price_file("July 202", FOLDER) is None  # labels match whole words


def test_catalogue_paths_are_unique_and_archived_entries_have_a_rule():
    paths = [s.path for s in SOURCES]
    assert len(paths) == len(set(paths))
    assert all(s.pick is not None and s.pick.before for s in SOURCES if s.original)
    assert all(s.url or s.original or s.price_label for s in SOURCES)


def test_differences_report_changes_additions_and_removals():
    old = [{"path": "a", "url": "1", "method": "direct", "in_git": "true", "content": "x", "carrier": "c", "year": ""},
           {"path": "b", "url": "2", "method": "direct", "in_git": "true", "content": "x", "carrier": "c", "year": ""}]
    new = [dict(old[0], url="9"), {"path": "c", "url": "3"}]
    assert d.differences(new, old) == ["~ a  url: '1' -> '9'", "+ c  3", "- b"]


@pytest.mark.skipif(not d.FIXTURE.is_file(), reason="no recorded CDX answers")
def test_discovery_rebuilds_the_committed_manifest():
    old = d.read_manifest()
    rows, problems = d.discover(w.RecordedCdx(d.FIXTURE), SOURCES, {r["path"]: r for r in old}, log=lambda *_: None)
    assert problems == []
    assert d.differences(rows, old) == []
    assert rows == old  # checksums carried over, same order
