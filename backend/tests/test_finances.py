"""`/api/finances/{lb_code}` and `/api/finances/{lb_code}/{year}`.

The figures asserted here are the master database's own, carried into the
fixture slice by ``build_slice.py``. Chalakudy Municipality really did formulate
357 projects worth ₹23,88,06,688 in 2023-24 and spend ₹11,69,13,203 of it. An
assertion that quotes those numbers is therefore an assertion about Kerala's
published record, not about a value somebody typed into a fixture.
"""

import pytest


# ---------------------------------------------------------------------------
# The worked example
# ---------------------------------------------------------------------------


async def test_chalakudy_2023_24_totals(client, chalakudy):
    response = await client.get(f"/api/finances/{chalakudy}/2023-2024")
    payload = response.json()

    assert response.status_code == 200
    assert payload["available"] is True
    assert payload["projects"] == 357
    assert payload["formulation"] == 238806688
    assert payload["expense"] == 116913203


async def test_totals_are_unrounded(client, chalakudy):
    """No crore, no lakh, no thousands separator. Formatting is the page's job."""
    payload = (await client.get(f"/api/finances/{chalakudy}/2023-2024")).json()

    assert isinstance(payload["formulation"], int)
    assert payload["expense_pct"] == 49.0


async def test_project_rows_match_the_count(client, chalakudy):
    payload = (await client.get(f"/api/finances/{chalakudy}/2023-2024")).json()

    rows = payload["project_rows"]
    assert len(rows) == payload["projects"] == 357
    assert sum(r["formulation"] for r in rows) == payload["formulation"]


async def test_a_project_without_a_pdf_is_stated_not_omitted(client, chalakudy):
    """351 of the 357 have a PDF. The other six still appear, without a link."""
    payload = (await client.get(f"/api/finances/{chalakudy}/2023-2024")).json()

    rows = payload["project_rows"]
    assert payload["projects_with_pdf"] == 351
    assert sum(1 for r in rows if r["has_pdf"]) == 351
    assert all(r["pdf_path"] is None for r in rows if not r["has_pdf"])


async def test_every_row_carries_a_pdf_url_field_signed_or_stated(client, chalakudy):
    """A row with a document answers with a URL, or with a stated absence.

    Whether the URL is there depends on the deployment holding a signing key,
    so this asserts the pair rather than the value: a signed URL addresses the
    object in the bucket, and a null one comes with the sentence saying why.
    See ``app/presign.py`` and ``tests/test_presign.py``.
    """
    payload = (await client.get(f"/api/finances/{chalakudy}/2023-2024")).json()
    rows = payload["project_rows"]

    assert all("pdf_url" in row for row in rows)
    assert all(row["pdf_url"] is None for row in rows if not row["has_pdf"])

    with_document = [row for row in rows if row["has_pdf"]]
    if payload["pdf_url_reason"] is None:
        assert all(
            row["pdf_url"].startswith("https://storage.googleapis.com/")
            for row in with_document
        )
        assert all(row["pdf_path"] in row["pdf_url"] for row in with_document)
    else:
        assert all(row["pdf_url"] is None for row in with_document)
        assert "scans Sulekha holds are named here" in payload["pdf_url_reason"]


async def test_the_stable_object_path_survives_alongside_the_signed_url(
    client, chalakudy
):
    """A signed URL expires within the hour. The path is what a CSV keeps."""
    payload = (await client.get(f"/api/finances/{chalakudy}/2023-2024")).json()

    paths = [row["pdf_path"] for row in payload["project_rows"] if row["has_pdf"]]
    assert len(paths) == 351
    assert all(path.startswith("pdfs/") for path in paths)


async def test_continuity_counts_are_carried(client, chalakudy):
    payload = (await client.get(f"/api/finances/{chalakudy}/2023-2024")).json()

    assert payload["also_in_prev_year"] == 140
    assert payload["first_seen_this_year"] == 214


async def test_no_classification_is_offered_or_invented(client, chalakudy):
    """Nothing in the source classifies a project, and no proxy stands in."""
    payload = (await client.get(f"/api/finances/{chalakudy}/2023-2024")).json()

    assert payload["classification"] is None
    assert "no sector or category" in payload["classification_note"]


# ---------------------------------------------------------------------------
# The fourteen-year series
# ---------------------------------------------------------------------------


async def test_series_covers_every_financial_year(client, chalakudy):
    payload = (await client.get(f"/api/finances/{chalakudy}")).json()

    labels = [y["year_label"] for y in payload["years"]]
    assert labels == sorted(labels)
    assert len(labels) == 14
    assert labels[0] == "2012-2013" and labels[-1] == "2025-2026"


async def test_series_keeps_years_the_body_has_no_record_for(client):
    """Panoor has three years of plan data out of fourteen.

    The other eleven stay in the series as rows with ``has_data: false``, so a
    chart draws a gap rather than a line straight across them.
    """
    payload = (await client.get("/api/finances/G13064")).json()

    with_data = [y for y in payload["years"] if y["has_data"]]
    assert len(payload["years"]) == 14
    assert [y["year_label"] for y in with_data] == ["2012-2013", "2013-2014", "2014-2015"]
    assert all(y["projects"] is None for y in payload["years"] if not y["has_data"])


async def test_the_year_in_progress_is_flagged_incomplete(client, chalakudy):
    """2025-2026 must never be compared silently against a closed year."""
    payload = (await client.get(f"/api/finances/{chalakudy}")).json()

    incomplete = [y["year_label"] for y in payload["years"] if not y["is_complete"]]
    assert incomplete == ["2025-2026"]

    year = (await client.get(f"/api/finances/{chalakudy}/2025-2026")).json()
    assert year["is_complete"] is False

    closed = (await client.get(f"/api/finances/{chalakudy}/2023-2024")).json()
    assert closed["is_complete"] is True


# ---------------------------------------------------------------------------
# The three empty cases, kept apart
# ---------------------------------------------------------------------------


async def test_unknown_body_is_a_404_naming_the_code(client):
    response = await client.get("/api/finances/Z99999/2023-2024")

    assert response.status_code == 404
    assert "Z99999" in response.json()["detail"]


async def test_a_year_the_body_has_no_plan_record_for(client):
    """Panoor in 2023-24: covered by Sulekha, but nothing recorded that year."""
    response = await client.get("/api/finances/G13064/2023-2024")
    payload = response.json()

    assert response.status_code == 200
    assert payload["available"] is False
    assert payload["reason_code"] == "no_record_for_year"
    # And the reason says where the record does run, so the page can too.
    assert "2012-2013" in payload["reason"] and "2014-2015" in payload["reason"]


async def test_the_empty_year_never_answers_with_a_bare_list(client):
    payload = (await client.get("/api/finances/G13064/2023-2024")).json()

    assert payload.get("project_rows") is None
    assert payload["reason"]
    assert payload["provenance"]["build_date"]


# ---------------------------------------------------------------------------
# Malformed input
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("year", ["2023", "banana", "2023_2024", "20233-2024"])
async def test_a_malformed_year_is_422_not_500(client, chalakudy, year):
    response = await client.get(f"/api/finances/{chalakudy}/{year}")

    assert response.status_code == 422


async def test_a_well_formed_year_outside_the_dataset_is_422(client, chalakudy):
    """``1999-2000`` parses as a year and is still not one this dataset holds."""
    response = await client.get(f"/api/finances/{chalakudy}/1999-2000")

    assert response.status_code == 422
    assert "1999-2000" in response.json()["detail"]


# ---------------------------------------------------------------------------
# Mattannur behaves normally here
# ---------------------------------------------------------------------------


async def test_mattannur_finances_are_ordinary(client, mattannur):
    """Its elections are the exception; its finances are not."""
    series = (await client.get(f"/api/finances/{mattannur}")).json()

    assert series["available"] is True
    assert series["years_with_finance"] == 14
    assert sum(1 for y in series["years"] if y["has_data"]) == 14
