"""The report form: it sends, or it says it did not.

The behaviour these tests exist for is the failing send. A form that silently
drops a report is worse than no form, because the person who wrote it walks away
believing a maintainer has it. So the first test here is the mail API timing
out, and the claim is a 502 whose text says the report did not send and what to
do next.

Nothing is stored, so there is nothing to assert about a table. What is asserted
instead: the mail API is reached with the right message, a tampered or stale
token is refused, the honeypot swallows a bot without telling it why, long text
is trimmed rather than rejected, control characters do not survive, the limit is
its own and much stricter than the 600-a-minute public read budget, and no
response carries a public cache header.

Outbound HTTP goes through an ``httpx.MockTransport`` installed over the
router's ``_mail_client`` seam, so the request the router builds is really
constructed and can be read back, and no test opens a socket. The seam matters:
patching ``httpx.AsyncClient`` itself would also replace the client
``conftest.py`` drives the application with, and every test would pass without
the application running at all.
"""

from __future__ import annotations

import json
import time

import httpx
import pytest

from app import public
from app.config import Settings
from app.routers import report

# ---------------------------------------------------------------------------
# Harness
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def mail_settings(monkeypatch):
    """A configured mailer, and counters no other test has touched."""
    monkeypatch.setattr(report.settings, "mail_api_url", "https://api.resend.test/emails", False)
    monkeypatch.setattr(report.settings, "mail_api_key", "test-mail-api-value", False)
    monkeypatch.setattr(report.settings, "mail_from", "Gram Sambandh <no-reply@example.test>", False)
    monkeypatch.setattr(report.settings, "mail_to", "maintainer@example.test", False)
    monkeypatch.setattr(report.settings, "report_token_secret", "test-signing-value", False)
    public.reset_rate_limits()
    yield
    public.reset_rate_limits()


class Sent:
    """Every request the router made to the mail API."""

    def __init__(self):
        self.calls: list[httpx.Request] = []

    def __len__(self) -> int:
        return len(self.calls)

    def body(self, index: int = 0) -> dict:
        return json.loads(self.calls[index].content)


def _install(monkeypatch, handler) -> Sent:
    record = Sent()

    def recording(request: httpx.Request) -> httpx.Response:
        record.calls.append(request)
        return handler(request)

    monkeypatch.setattr(
        report,
        "_mail_client",
        lambda: httpx.AsyncClient(transport=httpx.MockTransport(recording)),
    )
    return record


@pytest.fixture
def mail(monkeypatch):
    """A mail API that accepts everything, recording each request."""
    return _install(monkeypatch, lambda request: httpx.Response(200, json={"id": "accepted"}))


def token(age_seconds: float = 10.0) -> dict:
    """A signed token issued ``age_seconds`` ago."""
    issued_at = int(time.time() - age_seconds)
    return {"issued_at": issued_at, "signature": report._sign(issued_at)}


def submission(**overrides) -> dict:
    body = {
        "subject": "Wrong project total",
        "message": "Chalakudy Municipality, 2023-24: the project total is short by two projects.",
        "website": "",
        **token(),
    }
    body.update(overrides)
    return body


# ---------------------------------------------------------------------------
# The send fails
# ---------------------------------------------------------------------------


async def test_a_mail_api_timeout_is_a_502_that_says_it_did_not_send(client, monkeypatch):
    """The behaviour the form is for. A dropped report must never look sent."""

    def timeout(request):
        raise httpx.ReadTimeout("timed out", request=request)

    _install(monkeypatch, timeout)

    response = await client.post("/api/report", json=submission())

    assert response.status_code == 502
    detail = response.json()["detail"]
    assert "did not send" in detail
    assert "!" not in detail
    assert "sorry" not in detail.lower()


async def test_a_rejecting_mail_api_is_also_a_502(client, monkeypatch):
    _install(monkeypatch, lambda request: httpx.Response(403, json={"message": "no"}))

    response = await client.post("/api/report", json=submission())

    assert response.status_code == 502


# ---------------------------------------------------------------------------
# The send works
# ---------------------------------------------------------------------------


async def test_a_valid_submission_reaches_the_mail_api(client, mail):
    response = await client.post("/api/report", json=submission())

    assert response.status_code == 200
    assert response.json() == {"sent": True}

    assert len(mail) == 1
    request = mail.calls[0]
    assert str(request.url) == "https://api.resend.test/emails"
    assert request.headers["Authorization"] == "Bearer test-mail-api-value"
    assert mail.body()["to"] == ["maintainer@example.test"]
    assert "Wrong project total" in mail.body()["subject"]
    assert "Chalakudy" in mail.body()["text"]


async def test_the_token_endpoint_signs_the_time_it_issued(client):
    response = await client.get("/api/report/token")

    assert response.status_code == 200
    body = response.json()
    assert body["signature"] == report._sign(body["issued_at"])
    assert abs(time.time() - body["issued_at"]) < 5


# ---------------------------------------------------------------------------
# The honeypot and the token
# ---------------------------------------------------------------------------


async def test_a_filled_honeypot_is_accepted_and_sends_nothing(client, mail):
    """A bot is told nothing. It gets the same 200 a person gets, and no mail."""
    response = await client.post("/api/report", json=submission(website="https://example.test"))

    assert response.status_code == 200
    assert response.json() == {"sent": True}
    assert len(mail) == 0


async def test_a_tampered_signature_is_rejected(client, mail):
    forged = submission()
    forged["issued_at"] = forged["issued_at"] - 600

    response = await client.post("/api/report", json=forged)

    assert response.status_code == 422
    assert "Reload the page" in response.json()["detail"]
    assert len(mail) == 0


async def test_a_submission_faster_than_a_person_is_rejected_with_a_reason(client, mail):
    response = await client.post("/api/report", json=submission(**token(age_seconds=0)))

    assert response.status_code == 422
    detail = response.json()["detail"]
    assert "3 seconds" in detail
    assert "send the report again" in detail
    assert len(mail) == 0


async def test_a_token_older_than_fifteen_minutes_is_rejected(client, mail):
    response = await client.post("/api/report", json=submission(**token(age_seconds=901)))

    assert response.status_code == 422
    detail = response.json()["detail"]
    assert "expired" in detail
    assert "Reload the page" in detail
    assert "sorry" not in detail.lower()
    assert len(mail) == 0


async def test_a_token_inside_the_window_still_works(client, mail):
    """The ceiling is 15 minutes, not 15 seconds."""
    response = await client.post("/api/report", json=submission(**token(age_seconds=880)))

    assert response.status_code == 200
    assert len(mail) == 1


# ---------------------------------------------------------------------------
# The text
# ---------------------------------------------------------------------------


async def test_a_ten_thousand_character_message_is_capped_not_refused(client, mail):
    response = await client.post("/api/report", json=submission(message="a" * 10_000))

    assert response.status_code == 200
    assert len(mail.body()["text"]) == report.MESSAGE_MAX


async def test_a_long_subject_is_capped(client, mail):
    await client.post("/api/report", json=submission(subject="b" * 900))

    subject = mail.body()["subject"]
    assert subject == "[Gram Sambandh] " + "b" * report.SUBJECT_MAX


async def test_control_characters_are_stripped(client, mail):
    await client.post(
        "/api/report",
        json=submission(
            subject="Wrong\r\ntotal\x00",
            message="Line one\nLine two\x07\x1b[31m",
        ),
    )

    sent = mail.body()
    assert sent["subject"] == "[Gram Sambandh] Wrongtotal"
    assert sent["text"] == "Line one\nLine two[31m"


async def test_an_empty_message_is_refused_with_what_to_do(client, mail):
    response = await client.post("/api/report", json=submission(message="   \x00 "))

    assert response.status_code == 422
    assert "empty" in response.json()["detail"]
    assert len(mail) == 0


# ---------------------------------------------------------------------------
# The limit and the headers
# ---------------------------------------------------------------------------


def test_the_limit_is_stricter_than_the_public_read_budget():
    assert report.REPORT_RATE_LIMIT < public.RATE_LIMIT
    assert report.REPORT_RATE_LIMIT <= 10


async def test_the_limit_stops_a_client_well_before_the_read_budget_would(client, mail):
    accepted = 0
    for _ in range(report.REPORT_RATE_LIMIT + 3):
        response = await client.post("/api/report", json=submission())
        if response.status_code == 200:
            accepted += 1
        else:
            assert response.status_code == 429
            assert response.headers["Retry-After"] == "60"

    assert accepted == report.REPORT_RATE_LIMIT
    assert len(mail) == report.REPORT_RATE_LIMIT


async def test_neither_route_carries_a_public_cache_header(client, mail):
    posted = await client.post("/api/report", json=submission())
    issued = await client.get("/api/report/token")

    for response in (posted, issued):
        assert "public" not in response.headers.get("cache-control", "")
        assert response.headers["cache-control"] == "no-store"


# ---------------------------------------------------------------------------
# Boot
# ---------------------------------------------------------------------------


def test_startup_raises_when_the_mail_flag_is_on_and_the_configuration_is_empty():
    incomplete = Settings(
        mail_enabled=True,
        mail_api_key="",
        mail_from="",
        mail_to="",
        report_token_secret="",
    )

    with pytest.raises(RuntimeError) as raised:
        report.verify_mail_config(incomplete)

    message = str(raised.value)
    assert "MAIL_API_KEY" in message
    assert "REPORT_TOKEN_SECRET" in message


def test_startup_is_silent_when_the_flag_is_off():
    """Which is why the whole suite imports `app.main` with no mail environment."""
    report.verify_mail_config(Settings(mail_enabled=False, mail_api_key=""))


def test_startup_passes_with_the_flag_on_and_everything_set():
    report.verify_mail_config(
        Settings(
            mail_enabled=True,
            mail_api_key="k",
            mail_from="f@example.test",
            mail_to="t@example.test",
            report_token_secret="s",
        )
    )


async def test_the_lifespan_is_what_refuses_to_boot(monkeypatch):
    """The check is wired in, not merely written.

    The pool is stubbed out: this is a claim about startup order, and the test
    database is already open under `conftest.py`'s session pool.
    """
    from app import main

    async def unreachable():  # pragma: no cover - must never be called
        raise AssertionError("the pool was opened before the configuration was checked")

    monkeypatch.setattr(main, "get_pool", unreachable)
    monkeypatch.setattr(main.settings, "mail_enabled", True, False)
    monkeypatch.setattr(main.settings, "mail_api_key", "", False)

    with pytest.raises(RuntimeError):
        async with main.lifespan(main.app):
            pass
