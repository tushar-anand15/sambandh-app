"""Signed URLs for the project documents held in Google Cloud Storage.

Sulekha's project documents live in ``gs://sulekhasakarma-pdfs``. The finance
tables carry an object path, ``pdfs/2023-2024/Municipality/Thrissur/…/1.pdf``,
which is not an address a browser can open. This module turns that path into a
V4 signed URL, so the browser fetches the file from Cloud Storage and the API
never carries the bytes. A 3 MB scan proxied through the app is 3 MB of the
app's bandwidth and one more request the rate limiter has to hold open.

Signing is local RSA over a service account's private key: no network call, and
about 0.7 ms per URL on the machine this was written on. A body-year with 357
documents therefore costs a quarter of a second, which is why
:func:`sign_paths` is meant to be called off the event loop.

What signing needs, and what happens without it
-----------------------------------------------
A V4 signature needs a private key. Application-default credentials from
``gcloud auth application-default login`` are a user account and hold no private
key, so they can only sign by calling the IAM Credentials API's ``signBlob`` on
a service account the caller may impersonate. Neither path exists in every
environment, so this module treats a signing identity as optional: when there
is none, every URL is ``None``, :attr:`DocumentSigner.reason` carries the
sentence the page prints, and :attr:`DocumentSigner.operator_note` carries the
one naming the setting to fill in, which is logged and never published.

Settings, all read from ``app.config``:

``pdf_bucket``
    The bucket the object paths are relative to. Default
    ``sulekhasakarma-pdfs``.
``pdf_signing_key_file``
    Path to a service account JSON key with ``storage.objects.get`` on that
    bucket. Empty falls back to ``GOOGLE_APPLICATION_CREDENTIALS``.
``pdf_url_ttl_seconds``
    How long a signed URL stays valid. Default one hour, which outlasts any
    reading of one document and expires well before a copied link is useful to
    anyone else.
"""

from __future__ import annotations

import datetime as _dt
import json
import logging
import os
from functools import lru_cache

from .config import settings

log = logging.getLogger(__name__)

# Two audiences, two sentences.
#
# `reason` is published in the API payload and printed on the page, so it is
# written for a reader looking up what their panchayat spent: it says the
# document exists and that this site cannot hand over an address for it, and
# nothing about environment variables.
#
# `operator_note` is logged once at startup and never published. It names the
# setting to fill in, because a reader-facing sentence leaves whoever runs the
# deployment nothing to act on.
NO_KEY_REASON = (
    "This site cannot produce an address for the project documents, so the "
    "scans Sulekha holds are named here without being reachable."
)

BAD_KEY_REASON = (
    "The key this site signs document addresses with was not usable, so the "
    "scans Sulekha holds are named here without being reachable."
)

NO_KEY_NOTE = (
    "No signing key: set PDF_SIGNING_KEY_FILE or GOOGLE_APPLICATION_CREDENTIALS "
    "to a service account key with storage.objects.get on gs://{bucket}. "
    "Application-default user credentials cannot sign."
)

NOT_A_SERVICE_ACCOUNT_NOTE = (
    "The credentials at {path} are {kind}, which carry no private key and "
    "cannot sign a URL. Signing gs://{bucket} needs a service account key."
)

UNREADABLE_NOTE = "The signing key at {path} could not be read: {error}"

SIGNING_FAILED_NOTE = "Signing a document URL failed: {error}"


def _key_path() -> str:
    """The signing key, from the explicit setting or from the SDK's own var."""
    return settings.pdf_signing_key_file or os.environ.get(
        "GOOGLE_APPLICATION_CREDENTIALS", ""
    )


class DocumentSigner:
    """Signs object paths in one bucket, or states why it cannot.

    Construction never raises and never touches the network. A signer that
    cannot sign is a normal state of this class, not an error: it answers
    ``available == False`` and carries the sentence explaining it.
    """

    def __init__(self, bucket: str, key_path: str, ttl_seconds: int) -> None:
        self.bucket = bucket
        self.key_path = key_path
        self.ttl = _dt.timedelta(seconds=ttl_seconds)
        self._credentials = None
        #: Published in the payload. Written for a reader.
        self.reason: str | None = None
        #: Logged, never published. Written for whoever runs the deployment.
        self.operator_note: str | None = None
        self._load()

    # -- construction -------------------------------------------------------

    def _unavailable(self, reason: str, note: str) -> None:
        self._credentials = None
        self.reason = reason
        self.operator_note = note
        log.warning("Document URLs are unsigned. %s", note)

    def _load(self) -> None:
        if not self.key_path:
            self._unavailable(NO_KEY_REASON, NO_KEY_NOTE.format(bucket=self.bucket))
            return

        try:
            with open(self.key_path, encoding="utf-8") as handle:
                key = json.load(handle)
        except (OSError, ValueError) as error:
            self._unavailable(
                BAD_KEY_REASON,
                UNREADABLE_NOTE.format(path=self.key_path, error=error),
            )
            return

        kind = key.get("type", "of an unnamed type")
        if kind != "service_account":
            self._unavailable(
                BAD_KEY_REASON,
                NOT_A_SERVICE_ACCOUNT_NOTE.format(
                    path=self.key_path, kind=kind, bucket=self.bucket
                ),
            )
            return

        try:
            from google.oauth2 import service_account

            self._credentials = service_account.Credentials.from_service_account_info(
                key
            )
        except Exception as error:  # pragma: no cover - malformed key material
            self._unavailable(
                BAD_KEY_REASON,
                UNREADABLE_NOTE.format(path=self.key_path, error=error),
            )

    # -- signing ------------------------------------------------------------

    @property
    def available(self) -> bool:
        return self._credentials is not None

    @property
    def credentials(self):
        """The service account credentials, or ``None`` where there are none."""
        return self._credentials

    def sign(self, object_path: str | None) -> str | None:
        """One object path to one signed URL, or ``None`` with a stated reason."""
        if not object_path or not self.available:
            return None

        from google.cloud import storage

        blob = storage.Client(
            project=self._credentials.project_id, credentials=self._credentials
        ).bucket(self.bucket).blob(object_path.lstrip("/"))
        try:
            return blob.generate_signed_url(
                version="v4", expiration=self.ttl, method="GET"
            )
        except Exception as error:  # pragma: no cover - key rejected at use time
            self._unavailable(BAD_KEY_REASON, SIGNING_FAILED_NOTE.format(error=error))
            return None

    def sign_paths(self, paths: list[str | None]) -> dict[str, str]:
        """Many paths at once, keyed by path. Blocking: call it off the loop.

        One ``Bucket`` is built for the whole batch rather than one per path,
        because the per-URL cost that matters is the RSA signature and the rest
        is object churn.
        """
        if not self.available:
            return {}

        from google.cloud import storage

        bucket = storage.Client(
            project=self._credentials.project_id, credentials=self._credentials
        ).bucket(self.bucket)

        signed: dict[str, str] = {}
        for path in paths:
            if not path or path in signed:
                continue
            try:
                signed[path] = bucket.blob(path.lstrip("/")).generate_signed_url(
                    version="v4", expiration=self.ttl, method="GET"
                )
            except Exception as error:  # pragma: no cover - key rejected at use
                self._unavailable(BAD_KEY_REASON, SIGNING_FAILED_NOTE.format(error=error))
                return signed
        return signed


@lru_cache(maxsize=1)
def storage_client():
    """A Cloud Storage client on the same identity the signer uses.

    Falls back to application-default credentials where no signing key is set,
    which is what reads objects in an environment that cannot sign them.
    """
    from google.cloud import storage

    signer = document_signer()
    if signer.available:
        return storage.Client(
            project=signer.credentials.project_id, credentials=signer.credentials
        )
    return storage.Client()


@lru_cache(maxsize=1)
def document_signer() -> DocumentSigner:
    """The process-wide signer. Cached because reading the key is file I/O."""
    return DocumentSigner(
        bucket=settings.pdf_bucket,
        key_path=_key_path(),
        ttl_seconds=settings.pdf_url_ttl_seconds,
    )


def reset_document_signer() -> None:
    """Drops the cached signer. For tests that change the settings under it."""
    document_signer.cache_clear()
    storage_client.cache_clear()
