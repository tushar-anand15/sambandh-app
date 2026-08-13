"""`/api/meetings/register/{meeting_id}/{kind}` and the rewrite behind it.

Two things are under test and they fail differently.

The sanitiser is a pure function over a string, so it is tested against the
shapes Sakarma actually publishes: an ASP.NET page whose document sits inside
`<div id="Panel1">`, wrapped in a postback form, carrying a print script and a
Word paste. Every assertion here names something that would end up on the page
if the rewrite stopped doing its job.

The endpoint is tested against the fixture slice with the download replaced.
The bucket is not reachable from CI and the bytes are not what is being
checked; what is being checked is that the right object is looked up, that a
meeting with no document says so instead of 404ing, and that a bucket failure
is a 502 naming the path rather than a 500.
"""

from __future__ import annotations

import pytest

from app import artifacts
from app.artifacts import is_empty, sanitise

# One Sakarma document, cut down to the constructs that matter. The nesting,
# the unclosed `<td>`, the `javascript:` link and the `mso-` spans are all
# copied from `gs://sulekhasakarma-meetings/10/2/124/2025/245/3286/dr.html`.
SAKARMA_PAGE = """
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN">
<html xmlns="http://www.w3.org/1999/xhtml">
<head id="Head1">
<link href="stylenew.css" rel="stylesheet" type="text/css" media="print" />
<title>DecisionRegister</title>
<script language="javascript" type="text/javascript">
function printDiv(Panel1) { window.print(); }
</script>
<style type="text/css">.CHK{border-width:25px;}</style>
</head>
<body onload="alert(1)">
<form name="form1" method="post" action="PublicDRegister.aspx" id="form1">
<div>
<input type="hidden" name="__VIEWSTATE" id="__VIEWSTATE" value="Gbrix0tpZYUEbtOU" />
<input type="hidden" name="__EVENTVALIDATION" id="__EVENTVALIDATION" value="txti" />
</div>
<div><div id="Panel1" style="border-width:2px;width:100%;">
  <table style="background-position:center;" border="0">
    <tr><td align="center">
      <span id="lblHeading" style="font-family:Meera;">തീരുമാന രജിസ്റ്റർ</span>
    </td></tr>
    <tr><td>
      <table id="GrdDecision">
        <tr><td colspan="2">
          <a id="lnkFileView" href="javascript:__doPostBack('lnkFileView','')">file</a>
          <p class="MsoNormal" style="mso-bidi-language:ML">
            <span lang="ML" style="font-size:16.0pt;mso-fareast-font-family:Meera">
              Normal 0 false false false EN-US X-NONE ML
              Tender awarded at 88,500 rupees.<o:p></o:p>
            </span>
          </p>
          <p class="MsoNormal">&nbsp;</p>
        </td></tr>
      </table>
    </td>
  </table>
</div></div>
</form>
<div id="footer">Site maintained by IKM</div>
</body></html>
"""


class TestTheRewrite:
    def test_keeps_the_document_and_drops_the_page_around_it(self):
        html = sanitise(SAKARMA_PAGE)

        assert "Tender awarded at 88,500 rupees." in html
        assert "തീരുമാന രജിസ്റ്റർ" in html
        # Everything outside <div id="Panel1"> is the portal's own chrome.
        assert "Site maintained by IKM" not in html
        assert "DecisionRegister" not in html

    @pytest.mark.parametrize(
        "fragment",
        [
            "<script",
            "javascript:",
            "__VIEWSTATE",
            "__doPostBack",
            "onload",
            "href",
            "stylenew.css",
            "style=",
            "id=",
            "<input",
            "<form",
        ],
    )
    def test_nothing_executable_or_external_survives(self, fragment):
        assert fragment not in sanitise(SAKARMA_PAGE)

    def test_the_word_paste_is_cleaned_out(self):
        html = sanitise(SAKARMA_PAGE)

        assert "Normal 0" not in html
        assert "X-NONE" not in html
        assert "mso-" not in html
        assert "<o:p" not in html
        # The paragraph Word left holding one non-breaking space is not a
        # paragraph, and printing it puts a gap in the middle of a decision.
        assert "<p></p>" not in html

    def test_the_table_the_register_is_written_as_survives(self):
        html = sanitise(SAKARMA_PAGE)

        assert "<table>" in html
        assert "<td colspan=\"2\">" in html

    def test_an_attribute_that_is_not_a_span_count_is_dropped(self):
        html = sanitise('<table><tr><td colspan="x" rowspan="2" bgcolor="red">a</td></tr></table>')

        assert "bgcolor" not in html
        assert 'colspan="x"' not in html
        assert 'rowspan="2"' in html

    def test_a_document_with_no_panel1_keeps_its_body(self):
        """Not every file the crawl holds is the ASP.NET shape."""
        html = sanitise("<html><body><p>Decision 1</p><script>x()</script></body></html>")

        assert "Decision 1" in html
        assert "script" not in html

    def test_an_empty_document_is_recognisable_as_one(self):
        assert is_empty(sanitise("<html><body><div id='Panel1'></div></body></html>"))
        assert not is_empty(sanitise("<p>Decision 1</p>"))

    def test_unbalanced_source_markup_does_not_leak_open_tags(self):
        """Sakarma's own tables open rows inside cells and never close them."""
        html = sanitise("<table><tr><td>one<tr><td>two</table>")

        assert html.count("<td>") == html.count("</td>")
        assert html.count("<table>") == html.count("</table>")


# ---------------------------------------------------------------------------
# The endpoint
# ---------------------------------------------------------------------------


@pytest.fixture
async def a_meeting_with_a_register(db):
    """A meeting id in the slice that has both documents."""
    row = await db.fetchrow(
        """
        SELECT meeting_id FROM meetings.artifact
        WHERE artifact_type = 'dr_html'
        INTERSECT
        SELECT meeting_id FROM meetings.artifact WHERE artifact_type = 'minutes_html'
        LIMIT 1
        """
    )
    assert row is not None, "the fixture slice holds no meeting with both documents"
    return row["meeting_id"]


@pytest.fixture
def served(monkeypatch):
    """Stand in for the bucket, recording which object was asked for."""
    asked: list[str] = []

    def fake_download(gcs_path: str, bucket: str | None = None) -> str:
        asked.append(gcs_path)
        return SAKARMA_PAGE

    monkeypatch.setattr("app.routers.meetings.download", fake_download)
    return asked


async def test_the_register_is_served_as_a_readable_fragment(
    client, served, a_meeting_with_a_register
):
    response = await client.get(f"/api/meetings/register/{a_meeting_with_a_register}/dr")
    payload = response.json()

    assert response.status_code == 200
    assert payload["available"] is True
    assert payload["kind_label"] == "Decision register"
    assert "Tender awarded at 88,500 rupees." in payload["html"]
    assert "<script" not in payload["html"]
    assert payload["source_path"].endswith("dr.html")
    assert payload["body"]["lb_code"]
    assert payload["provenance"]["build_date"]


async def test_dr_and_minutes_are_different_objects(
    client, served, a_meeting_with_a_register
):
    await client.get(f"/api/meetings/register/{a_meeting_with_a_register}/dr")
    await client.get(f"/api/meetings/register/{a_meeting_with_a_register}/minutes")

    assert len(served) == 2
    assert served[0].endswith("dr.html")
    assert served[1].endswith("minutes.html")


async def test_a_meeting_with_no_such_document_says_so_rather_than_404ing(
    client, served, db
):
    row = await db.fetchrow(
        """
        SELECT meeting_id FROM meetings.meeting
        WHERE meeting_id NOT IN (
            SELECT meeting_id FROM meetings.artifact WHERE artifact_type = 'dr_html'
        )
        LIMIT 1
        """
    )
    if row is None:
        pytest.skip("every meeting in the slice has a decision register")

    response = await client.get(f"/api/meetings/register/{row['meeting_id']}/dr")
    payload = response.json()

    assert response.status_code == 200
    assert payload["available"] is False
    assert payload["reason_code"] == "no_document_published"
    assert "Sakarma published no decision register" in payload["reason"]
    assert served == []


async def test_an_unknown_meeting_is_a_404_naming_the_id(client, served):
    response = await client.get("/api/meetings/register/999999999/dr")

    assert response.status_code == 404
    assert "999999999" in response.json()["detail"]


async def test_a_document_type_that_does_not_exist_is_422(
    client, served, a_meeting_with_a_register
):
    response = await client.get(
        f"/api/meetings/register/{a_meeting_with_a_register}/attachments"
    )

    assert response.status_code == 422
    assert "dr or minutes" in response.json()["detail"]


async def test_a_bucket_failure_is_a_502_naming_the_path(
    client, monkeypatch, a_meeting_with_a_register
):
    def fails(gcs_path: str, bucket: str | None = None) -> str:
        raise artifacts.ArtifactUnavailable("404 No such object")

    monkeypatch.setattr("app.routers.meetings.download", fails)
    response = await client.get(f"/api/meetings/register/{a_meeting_with_a_register}/dr")

    assert response.status_code == 502
    detail = response.json()["detail"]
    assert "dr.html" in detail
    assert "404 No such object" in detail


async def test_an_empty_published_document_is_not_an_empty_page(
    client, monkeypatch, a_meeting_with_a_register
):
    monkeypatch.setattr(
        "app.routers.meetings.download",
        lambda gcs_path, bucket=None: "<html><body><div id='Panel1'></div></body></html>",
    )
    payload = (
        await client.get(f"/api/meetings/register/{a_meeting_with_a_register}/dr")
    ).json()

    assert payload["available"] is False
    assert payload["reason_code"] == "no_document_published"
    assert "empty document" in payload["reason"]


# ---------------------------------------------------------------------------
# The list points at them
# ---------------------------------------------------------------------------


async def test_every_meeting_row_names_the_documents_it_has(client, chalakudy):
    payload = (await client.get(f"/api/meetings/{chalakudy}/2023-2024")).json()
    rows = payload["meeting_rows"]

    assert all(isinstance(r["meeting_id"], int) for r in rows)
    assert all(set(r["documents"]) <= {"dr", "minutes"} for r in rows)
    # Chalakudy 2023-24 is a fully crawled body-year.
    assert sum(1 for r in rows if "dr" in r["documents"]) > 0
