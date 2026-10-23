"""The announcement watcher's rules (data/collect/announcements.py), offline: recorded page
text in, percentages and verbatim quotes out."""
from __future__ import annotations

import csv

from data.collect import announcements as a
from data.pipeline import common

# Phrasings from the USPS January price releases already in data/raw (2024 and 2025).
USPS_2025 = (
    "The new prices, if favorably reviewed by the PRC, would raise Priority Mail service prices approximately "
    "3.2 percent for Priority Mail service and Priority Mail Express service, and 3.9 percent for USPS Ground "
    "Advantage. Other news follows."
)
USPS_2024 = (
    "Priority Mail service prices would increase by 5.7 percent, Priority Mail Express service prices would "
    "increase by 5.9 percent. USPS Ground Advantage prices would increase by 5.4 percent."
)
USPS_INDEX = """
<a href="/newsroom/national-releases/2026/0825-usps-announces-temporary-price-change-for-2026-holiday-shipping-season.htm">x</a>
<a href="/newsroom/national-releases/2026/1112-usps-recommends-new-competitive-prices-for-2027.htm">x</a>
<a href="https://about.usps.com/newsroom/national-releases/2026/0511-usps-recommends-competitive-price-changes-for-july-2026.htm">x</a>
<a href="/newsroom/national-releases/2025/1114-usps-recommends-new-competitive-prices-for-2026.htm">x</a>
"""
EBB = (
    "2025 5.9% December 23, 2024 5.9% January 6, 2025 2026 5.9% December 22, 2025 5.9% January 5, 2026 "
    "2027 Not yet announced 5.9% January 4, 2027 Sources, by row: ... 2026 5.9% 147.9 47.9%"
)
FEDEX = (
    "Rate changes. FedEx package rates Effective Jan. 4, 2027 FedEx package standard list rates for U.S., U.S. "
    "export, and U.S. import services will increase an average of 5.9%. View 2027 FedEx standard list rates"
)


def test_usps_release_links_pick_the_january_release_for_the_year():
    assert a.usps_release_links(USPS_INDEX, 2027) == [
        "https://about.usps.com/newsroom/national-releases/2026/1112-usps-recommends-new-competitive-prices-for-2027.htm"
    ]
    assert a.usps_release_links(USPS_INDEX, 2028) == []


def test_usps_percentages_both_phrasings():
    got = {f.product_scope: (f.percent, f.quote) for f in a.usps_percentages(USPS_2025, 2025)}
    assert got["usps_ground_advantage"] == ("3.9", "3.9 percent for USPS Ground Advantage")
    assert got["usps_priority_mail"][0] == "3.2"
    got = {f.product_scope: f.percent for f in a.usps_percentages(USPS_2024, 2024)}
    assert got == {"usps_ground_advantage": "5.4", "usps_priority_mail": "5.7", "usps_priority_mail_express": "5.9"}
    decrease = a.usps_percentages("USPS Ground Advantage Retail prices will decrease 3.2 percent.", 2023)
    assert decrease[0].percent == "-3.2"


def test_ups_reads_its_column_and_waits_while_not_announced():
    found = a.ups_from_history_table(EBB, 2026)
    assert (found.percent, found.quote, found.source_type) == ("5.9", "2026 5.9% December 22, 2025", "secondary")
    assert a.ups_from_history_table(EBB, 2027) is None


def test_ups_recorded_history_page_has_no_2027_figure_yet():
    path = common.raw_path("ups/gri-history-2020-2027-ebblogistics.html")
    text = a.page_text(path.read_text(encoding="utf-8", errors="replace"))
    assert a.ups_from_history_table(text, 2024).quote == "2024 5.9% December 26, 2023"  # the curated UPS 2024 row
    assert a.ups_from_history_table(text, 2027) is None


def test_fedex_needs_an_effective_date_in_the_year():
    found = a.fedex_from_rate_changes(FEDEX, 2027)
    assert found.percent == "5.9" and found.quote.endswith("will increase an average of 5.9%.")
    assert a.fedex_from_rate_changes(FEDEX, 2028) is None


def test_fedex_recorded_rate_changes_page_matches_the_curated_2027_row():
    path = common.raw_path("fedex/2027/rate-changes_page_wayback_2026-10-11.html")
    found = a.fedex_from_rate_changes(a.page_text(path.read_text(encoding="utf-8", errors="replace")), 2027)
    assert found.percent == "5.9"
    assert found.quote == (
        "FedEx package standard list rates for U.S., U.S. export, and U.S. import services will increase an average of 5.9%."
    )


def test_found_rows_merge_only_where_the_curated_rules_are_silent(tmp_path, monkeypatch):
    found = tmp_path / "announcements_found.csv"
    with found.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=a.FOUND_COLUMNS)
        writer.writeheader()
        for year in ("2026", "2027"):
            writer.writerow({"carrier": "ups", "year": year, "product_scope": "all", "rate_card": "list", "percent": "6.5",
                             "source_type": "secondary", "source_file": "ups/2027/x.html", "source_ref": "",
                             "source_quote": f"{year} 6.5% December 21, 2026", "url": "u", "found_on": "2026-11-05"})
    monkeypatch.setattr(common, "FOUND_ANNOUNCEMENTS", found)
    curated = [{"carrier": "ups", "year": "2026", "product_scope": "all", "rate_card": "list", "percent": "5.9"}]
    merged = common.with_found_announcements("ups", curated)
    assert [(r["year"], r["percent"]) for r in merged] == [("2026", "5.9"), ("2027", "6.5")]
    assert set(merged[1]) == set(common.COLUMNS["announced_increase"])
    assert common.with_found_announcements("fedex", []) == []


def test_a_bot_protection_page_counts_as_blocked():
    page = b"<html><title>FedEx | System Down</title><p>It appears you don't have permission to view this webpage.</p>"
    assert a.blocked(page)
    assert not a.blocked(FEDEX.encode())

