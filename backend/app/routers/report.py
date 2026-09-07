"""Report an error: a public form that reaches a maintainer, and stores nothing.

Three requests, and no table behind any of them.

``GET /api/report/token`` issues ``{issued_at, signature}`` when the dialog
opens. ``POST /api/report`` verifies the signature, checks the age, sanitises
the text and hands it to a mail API over HTTPS. Nothing is written to the
database, so there is no migration here and no citizen free text in the nightly
dump. A report that fails to send is reported as failed to the person who wrote
it, which is the only place the information is useful.

**Why HTTPS and not SMTP.** GCP blocks outbound port 25 from Compute Engine
with no exception mechanism, and a fresh VM address has no sending reputation
in any case. One ``httpx.post`` is fewer dependencies than a vendor SDK and is
readable in a public repository. The URL is configuration, so the provider can
change without a code change; Resend is what production points at.

**Why the token is not single use.** A spent-token store is the table this
router exists to avoid. Three controls stand in for it, and each does a
separate job:

* the signature makes the timestamp unforgeable, so an age cannot be edited in
  the browser the way the arithmetic captcha it replaces could be;
* the 15-minute ceiling bounds how long a captured token replays. A floor alone
  would not be a control at all, since a token with no ceiling replays for
  ever;
* the per-client rate limit below bounds how many submissions fit inside one
  window.

Together those cap the mail a single client can cause. Do not "fix" the missing
single-use check by adding a store: the storage is the cost that was being
avoided, and the limit is what was bought with it.

**Why the limit is its own.** ``public.rate_limit`` allows 600 requests a
minute, which is right for a cacheable GET of public records and absurd for a
POST that sends mail. 600 emails a minute from one client is exactly the
outcome this module is named against.
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import secrets
import time

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from ..config import Settings, settings
from ..public import check_rate, rate_limit

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/report", tags=["public"], dependencies=[Depends(rate_limit)])

# How long a token is usable, in seconds.
#
# The floor rejects a form filled faster than a person fills a form. The
# ceiling is what stops a captured token from working for ever, and is the
# reason a spent-token store is not needed.
MIN_AGE_SECONDS = 3
MAX_AGE_SECONDS = 900

# Accepted submissions per client per minute. `check_rate`'s window is 60
# seconds, so this is a per-minute figure. Three is above what a person filing
# one report needs and far below anything worth calling a mail cannon.
REPORT_RATE_LIMIT = 3

SUBJECT_MAX = 200
MESSAGE_MAX = 4000

# A secret for this process only, used when `REPORT_TOKEN_SECRET` is unset.
#
# Production never reaches it: `verify_mail_config` refuses to boot without the
# real value. It exists so local development and the test suite issue and
# verify tokens without any mail environment, and so a missing secret can never
# degrade into signing with the empty string.
_EPHEMERAL_SECRET = secrets.token_hex(32)


def _signing_secret() -> str:
    return settings.report_token_secret or _EPHEMERAL_SECRET


def _sign(issued_at: int) -> str:
    return hmac.new(
        _signing_secret().encode("utf-8"), str(issued_at).encode("utf-8"), hashlib.sha256
    ).hexdigest()


def verify_mail_config(config: Settings) -> None:
    """Refuse to run with the mail flag on and the configuration incomplete.

    Called from the lifespan in ``app/main.py`` rather than expressed as
    required fields on ``Settings``. Every field there carries a default, and
    ``tests/conftest.py`` imports ``app.main`` with no mail environment at all,
    so a required pydantic field would raise at import and take the whole
    backend suite with it. Validating here keeps development and tests importing
    cleanly while production refuses to start with a secret missing.
    """
    if not config.mail_enabled:
        return
    missing = [
        name
        for name, value in (
            ("MAIL_API_KEY", config.mail_api_key),
            ("MAIL_API_URL", config.mail_api_url),
            ("MAIL_FROM", config.mail_from),
            ("MAIL_TO", config.mail_to),
            ("REPORT_TOKEN_SECRET", config.report_token_secret),
        )
        if not value.strip()
    ]
    if missing:
        raise RuntimeError(
            "MAIL_ENABLED is on and these are unset: "
            + ", ".join(missing)
            + ". Set them, or set MAIL_ENABLED=false to run without the report form."
        )


# ---------------------------------------------------------------------------
# Sanitising
# ---------------------------------------------------------------------------


def _clean(text: str, limit: int, keep_newlines: bool) -> str:
    """Drop control characters and cap the length.

    Header injection is moot over a JSON API, and it is not moot for any
    ``Reply-To`` built from this text later. If this router ever speaks SMTP,
    build the message with ``email.message.EmailMessage`` and never format RFC
    822 by hand.

    Over-length text is trimmed rather than refused. A person who wrote 10,000
    characters about a wrong figure should not lose them to a validation error.
    """
    allowed = "\n\t" if keep_newlines else ""
    stripped = "".join(c for c in text if c in allowed or (ord(c) >= 32 and ord(c) != 127))
    return stripped.strip()[:limit]


# ---------------------------------------------------------------------------
# The two requests
# ---------------------------------------------------------------------------


class Token(BaseModel):
    issued_at: int
    signature: str


class Submission(BaseModel):
    subject: str = ""
    message: str = ""
    issued_at: int
    signature: str
    # The honeypot. Named for what a form-filling bot expects to find and
    # rendered off-screen and out of the accessibility tree, so a person never
    # sees it and never fills it in.
    website: str = Field(default="")


@router.get("/token", response_model=Token)
async def issue_token() -> JSONResponse:
    """The timestamp the POST checks, signed so it cannot be edited in the browser.

    ``no-store``, because a token held in a shared cache is a token that arrives
    already half expired.
    """
    issued_at = int(time.time())
    return _json({"issued_at": issued_at, "signature": _sign(issued_at)})


def _reject(detail: str) -> HTTPException:
    return HTTPException(status_code=422, detail=detail)


def _check_token(issued_at: int, signature: str, now: float) -> None:
    if not hmac.compare_digest(_sign(issued_at), signature):
        raise _reject("This form could not be verified. Reload the page and send the report again.")

    age = now - issued_at
    if age < MIN_AGE_SECONDS:
        raise _reject(
            f"The form was sent less than {MIN_AGE_SECONDS} seconds after it opened. "
            "Wait a moment, then send the report again."
        )
    if age > MAX_AGE_SECONDS:
        raise _reject(
            f"The form expired {MAX_AGE_SECONDS // 60} minutes after it opened. "
            "Reload the page and send the report again."
        )


def _mail_client() -> httpx.AsyncClient:
    """The outbound client, in one place so a test can replace the transport.

    Patching ``httpx.AsyncClient`` wholesale would also replace the client the
    test suite drives the app with, since that is an ``httpx.AsyncClient`` too.
    """
    return httpx.AsyncClient(timeout=settings.mail_timeout_seconds)


async def _send(subject: str, message: str) -> None:
    """Hand the report to the mail API. Raises ``httpx.HTTPError`` on failure."""
    async with _mail_client() as client:
        response = await client.post(
            settings.mail_api_url,
            headers={"Authorization": f"Bearer {settings.mail_api_key}"},
            json={
                "from": settings.mail_from,
                "to": [settings.mail_to],
                "subject": f"[Gram Sambandh] {subject}" if subject else "[Gram Sambandh] report",
                "text": message,
            },
        )
    response.raise_for_status()


@router.post("")
async def submit_report(request: Request, submission: Submission) -> JSONResponse:
    """Send one report, and say truthfully whether the mail API took it.

    A 200 here means the provider accepted the message for delivery. It does not
    mean the message reached an inbox, and no request can know that, so neither
    this response nor the form claims it.

    Deliberately not ``public.public_json``: that stamps ``Cache-Control:
    public, max-age=86400``, which is wrong for every mutation and absurd for
    one that sends mail.
    """
    client = request.client.host if request.client else "unknown"
    if not check_rate(f"report:{client}", limit=REPORT_RATE_LIMIT):
        raise HTTPException(
            status_code=429,
            detail="Too many reports from this connection. Wait a minute, then send it again.",
            headers={"Retry-After": "60"},
        )

    # First, and silently. A bot told which field gave it away learns to leave
    # that field alone.
    if submission.website.strip():
        return _json({"sent": True})

    _check_token(submission.issued_at, submission.signature, time.time())

    subject = _clean(submission.subject, SUBJECT_MAX, keep_newlines=False)
    message = _clean(submission.message, MESSAGE_MAX, keep_newlines=True)
    if not message:
        raise _reject("The report is empty. Describe what is wrong, then send it again.")

    try:
        await _send(subject, message)
    except httpx.HTTPError as err:
        # The text is not logged. It is a stranger's free text about a public
        # record, and a log is one more place it would sit unread.
        logger.warning("Report not sent: %s", err)
        raise HTTPException(
            status_code=502,
            detail="The report did not send. Try again in a few minutes.",
        ) from err

    return _json({"sent": True})


def _json(payload: dict) -> JSONResponse:
    """A response no cache may keep."""
    return JSONResponse(payload, headers={"Cache-Control": "no-store"})
