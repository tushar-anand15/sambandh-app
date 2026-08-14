"""`/api/finances/{lb}/{year}/documents/{project_no}` — the proxy fallback.

The route exists for the deployments that can read ``gs://sulekhasakarma-pdfs``
and cannot sign for it, which is what application-default user credentials are.
Two things about it have to hold under test.

**The client never names an object.** It names Chalakudy Municipality, 2023-24
and project 1; the path
``pdfs/2023-2024/Municipality/Thrissur/Chalakkudy_Municipality/1.pdf`` is read
from ``finance.project``. A route that took the path from the request would
serve any object in the bucket to anyone who could write one.

**Every failure states which.** A project the year has no row for, a project
published with no document, a path the bucket holds nothing at, and a bucket
that could not be read are four different answers, and a reader who gets one of
them should be told which.

The bucket is faked here. What is real is the database lookup, the routing, the
range arithmetic and the headers; a live GCS read is exercised by hand against
the running deployment, not by this suite.
"""

from __future__ import annotations

import io

import pytest
from google.api_core import exceptions as api

from app import presign

BODY = "M08032"
YEAR = "2023-2024"
PATH = "pdfs/2023-2024/Municipality/Thrissur/Chalakkudy_Municipality/1.pdf"

# A minimal, genuine PDF header followed by filler, so the bytes served are
# recognisable as a PDF and long enough to cut a range out of.
DOCUMENT = b"%PDF-1.4\n" + bytes(range(256)) * 8


class FakeBlob:
    """One object. ``data is None`` is an object the bucket does not hold."""

    def __init__(self, data: bytes | None) -> None:
        self._data = data
        self.size: int | None = None
        self.reads: list[int] = []

    def reload(self) -> None:
        if self._data is None:
            raise api.NotFound("No such object")
        self.size = len(self._data)

    def open(self, mode: str, chunk_size: int | None = None):
        assert mode == "rb"
        return io.BytesIO(self._data or b"")


class FakeBucket:
    def __init__(self, objects: dict[str, bytes]) -> None:
        self.objects = objects
        self.asked: list[str] = []

    def blob(self, path: str) -> FakeBlob:
        self.asked.append(path)
        return FakeBlob(self.objects.get(path))


class FakeClient:
    def __init__(self, objects: dict[str, bytes]) -> None:
        self.bucket_object = FakeBucket(objects)
        self.buckets: list[str] = []

    def bucket(self, name: str) -> FakeBucket:
        self.buckets.append(name)
        return self.bucket_object


class BrokenClient:
    """Credentials that resolve and a bucket that does not answer."""

    def bucket(self, name: str):
        raise RuntimeError("503 Backend Error")


@pytest.fixture
def bucket(monkeypatch) -> FakeClient:
    """A bucket holding project 1's document and nothing else."""
    client = FakeClient({PATH: DOCUMENT})
    monkeypatch.setattr(presign, "_reader", lambda: client)
    return client


def url(project_no: str, lb_code: str = BODY, year: str = YEAR) -> str:
    return f"/api/finances/{lb_code}/{year}/documents/{project_no}"


# ---------------------------------------------------------------------------
# The document
# ---------------------------------------------------------------------------


async def test_the_document_is_streamed_as_a_pdf(client, bucket):
    response = await client.get(url("1"))

    assert response.status_code == 200
    assert response.content == DOCUMENT
    assert response.headers["content-type"] == "application/pdf"
    assert response.headers["content-length"] == str(len(DOCUMENT))
    assert response.headers["accept-ranges"] == "bytes"
    assert response.headers["cache-control"].startswith("public, max-age=")


async def test_it_opens_in_the_page_rather_than_downloading(client, bucket):
    disposition = (await client.get(url("1"))).headers["content-disposition"]

    assert disposition.startswith("inline;")
    assert 'filename="M08032_2023-2024_project_1.pdf"' in disposition


async def test_the_object_path_comes_from_the_database(client, bucket):
    """The request names a project. The bucket is asked for a path it never saw."""
    await client.get(url("1"))

    assert bucket.buckets == ["sulekhasakarma-pdfs"]
    assert bucket.bucket_object.asked == [PATH]


@pytest.mark.parametrize(
    "project_no", ["../../etc/passwd", "..%2Fsecret", "pdfs/2023-2024/x.pdf", ""]
)
async def test_a_path_cannot_be_smuggled_in_as_a_project_number(
    client, bucket, project_no
):
    """Nothing a caller writes reaches the bucket, whatever it looks like."""
    response = await client.get(url(project_no))

    assert response.status_code in (404, 422)
    assert bucket.bucket_object.asked == []


# ---------------------------------------------------------------------------
# Ranges, which is how a PDF viewer reads
# ---------------------------------------------------------------------------


async def test_a_range_answers_only_those_bytes(client, bucket):
    response = await client.get(url("1"), headers={"Range": "bytes=0-99"})

    assert response.status_code == 206
    assert response.content == DOCUMENT[:100]
    assert response.headers["content-range"] == f"bytes 0-99/{len(DOCUMENT)}"
    assert response.headers["content-length"] == "100"


async def test_an_open_ended_range_runs_to_the_end(client, bucket):
    start = len(DOCUMENT) - 20
    response = await client.get(url("1"), headers={"Range": f"bytes={start}-"})

    assert response.status_code == 206
    assert response.content == DOCUMENT[start:]
    assert response.headers["content-range"] == (
        f"bytes {start}-{len(DOCUMENT) - 1}/{len(DOCUMENT)}"
    )


async def test_a_suffix_range_counts_back_from_the_end(client, bucket):
    response = await client.get(url("1"), headers={"Range": "bytes=-16"})

    assert response.status_code == 206
    assert response.content == DOCUMENT[-16:]


async def test_a_range_past_the_end_is_416_and_states_the_length(client, bucket):
    response = await client.get(url("1"), headers={"Range": "bytes=999999-"})

    assert response.status_code == 416
    assert str(len(DOCUMENT)) in response.json()["detail"]
    assert response.headers["content-range"] == f"bytes */{len(DOCUMENT)}"


async def test_a_range_header_that_means_nothing_is_ignored(client, bucket):
    """A malformed range is the whole document, not an error."""
    response = await client.get(url("1"), headers={"Range": "pages=1-2"})

    assert response.status_code == 200
    assert response.content == DOCUMENT


# ---------------------------------------------------------------------------
# The four absences
# ---------------------------------------------------------------------------


async def test_a_project_the_year_has_no_row_for_is_404_naming_it(client, bucket):
    response = await client.get(url("99999"))

    assert response.status_code == 404
    detail = response.json()["detail"]
    assert "99999" in detail and BODY in detail and YEAR in detail


async def test_a_project_published_with_no_document_says_so(client, bucket):
    """Mattannur's project 74 in 2017-18 is a plan line with nothing attached."""
    response = await client.get(url("74", lb_code="M13057", year="2017-2018"))

    assert response.status_code == 404
    assert "no scanned document" in response.json()["detail"]


async def test_an_object_the_bucket_does_not_hold_is_404_naming_the_path(
    client, monkeypatch
):
    monkeypatch.setattr(presign, "_reader", lambda: FakeClient({}))

    response = await client.get(url("1"))

    assert response.status_code == 404
    assert PATH in response.json()["detail"]


async def test_a_bucket_that_cannot_be_read_is_502_naming_the_path(
    client, monkeypatch
):
    """502, not 404: the document may well be there and this site cannot say."""
    monkeypatch.setattr(presign, "_reader", lambda: BrokenClient())

    response = await client.get(url("1"))

    assert response.status_code == 502
    detail = response.json()["detail"]
    assert PATH in detail and "503 Backend Error" in detail


async def test_no_credentials_at_all_is_502_naming_the_setting(client, monkeypatch):
    monkeypatch.setattr(presign, "_reader", lambda: None)

    response = await client.get(url("1"))

    assert response.status_code == 502
    assert "PDF_SIGNING_KEY_FILE" in response.json()["detail"]


async def test_an_unknown_body_is_404_before_the_bucket_is_touched(client, bucket):
    response = await client.get(url("1", lb_code="Z99999"))

    assert response.status_code == 404
    assert "Z99999" in response.json()["detail"]
    assert bucket.bucket_object.asked == []


@pytest.mark.parametrize("year", ["2023", "banana", "20233-2024"])
async def test_a_malformed_year_is_422(client, bucket, year):
    assert (await client.get(url("1", year=year))).status_code == 422


# ---------------------------------------------------------------------------
# What the payload publishes, and when it stops publishing it
# ---------------------------------------------------------------------------


class Unsigned:
    """A signer with no key: what a checkout on user credentials has."""

    available = False
    reason = presign.NO_KEY_REASON

    def sign_paths(self, paths):
        return {}


async def test_a_readable_bucket_publishes_proxy_addresses_and_no_reason(
    client, bucket, monkeypatch
):
    from app.routers import finances

    monkeypatch.setattr(finances, "document_signer", lambda: Unsigned())
    payload = (await client.get(f"/api/finances/{BODY}/{YEAR}")).json()

    with_document = [row for row in payload["project_rows"] if row["has_pdf"]]
    assert payload["pdf_url_reason"] is None
    assert with_document[0]["pdf_url"] == url(with_document[0]["project_no"])
    # The stable path stays in the payload beside the address.
    assert with_document[0]["pdf_path"].startswith("pdfs/")


async def test_neither_signing_nor_reading_leaves_the_stated_absence(
    client, monkeypatch
):
    from app.routers import finances

    monkeypatch.setattr(finances, "document_signer", lambda: Unsigned())
    monkeypatch.setattr(presign, "_reader", lambda: None)
    payload = (await client.get(f"/api/finances/{BODY}/{YEAR}")).json()

    with_document = [row for row in payload["project_rows"] if row["has_pdf"]]
    assert all(row["pdf_url"] is None for row in with_document)
    assert payload["pdf_url_reason"] == presign.NO_ACCESS_REASON
    # The reader-facing sentence names no setting and no bucket.
    assert "PDF_SIGNING_KEY_FILE" not in payload["pdf_url_reason"]
    # And the paths are still there, so the CSV still carries them.
    assert len([row for row in with_document if row["pdf_path"]]) == 351
