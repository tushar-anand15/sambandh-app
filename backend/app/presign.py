"""Reaching the project documents held in Google Cloud Storage.

Sulekha's project documents live in ``gs://sulekhasakarma-pdfs``. The finance
tables carry an object path, ``pdfs/2023-2024/Municipality/Thrissur/…/1.pdf``,
which is not an address a browser can open. There are two ways to turn that
path into one, and this module holds both.

Signing is the preferred way. A V4 signed URL sends the browser straight to
Cloud Storage, so the API never carries the bytes: a 3 MB scan proxied through
the app is 3 MB of the app's bandwidth and one more request the rate limiter
has to hold open. Signing is local RSA over a service account's private key,
about 0.7 ms per URL on the machine this was written on, so a body-year with
357 documents costs a quarter of a second and :func:`sign_paths` is meant to be
called off the event loop.

Proxying is the fallback. A V4 signature needs a private key. Application-
default credentials from ``gcloud auth application-default login`` are a user
account and hold no private key, so they can read an object and cannot sign for
one. That identity is what most checkouts and some deployments run on, and a
site where no document opens is worse than one that spends its own bandwidth,
so :func:`open_document` and :func:`stream_document` read the object on the
same identity and ``/api/finances/{lb}/{year}/documents/{project_no}`` streams
it. :func:`documents_readable` is what the finances endpoint asks before it
publishes a proxy address.

When neither works — no signing key and no credentials at all — every URL is
``None``, :attr:`DocumentSigner.reason` or :data:`NO_ACCESS_REASON` carries the
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
from collections.abc import Iterator
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
    "The scanned documents cannot be opened from this site at the moment."
)

# Published only when signing and proxying have both failed, which is the one
# state in which a document genuinely cannot be reached.
NO_ACCESS_REASON = (
    "This site holds no credentials for the bucket Sulekha's scans are in, so "
    "the scans Sulekha holds are named here without being reachable."
)

NO_ACCESS_NOTE = (
    "No credentials for gs://{bucket}: neither a signing key nor application-"
    "default credentials. Set PDF_SIGNING_KEY_FILE, or run "
    "gcloud auth application-default login, and the documents become "
    "reachable. The underlying error was: {error}"
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
    _reader.cache_clear()


# ---------------------------------------------------------------------------
# Proxying: reading an object this process can read but cannot sign for
# ---------------------------------------------------------------------------


class DocumentMissing(LookupError):
    """The path is in ``finance.project`` and the bucket holds nothing at it."""


class DocumentUnreadable(RuntimeError):
    """The bucket could not be read. The cause is carried, not swallowed."""


# 256 KB per read. Large enough that a 3 MB scan is a dozen reads, small enough
# that a slow reader never holds a megabyte of the process's memory per request.
CHUNK_BYTES = 256 * 1024


@lru_cache(maxsize=1)
def _reader():
    """A storage client for proxying, or ``None`` where there are none.

    Building one resolves credentials, which is file I/O and, off Google's
    infrastructure, one short metadata-server probe. Cached so the finances
    endpoint can ask :func:`documents_readable` on every request.
    """
    try:
        return storage_client()
    except Exception as error:  # noqa: BLE001 - reported, then reported again
        log.warning(
            "Documents cannot be proxied. %s",
            NO_ACCESS_NOTE.format(bucket=settings.pdf_bucket, error=error),
        )
        return None


def documents_readable() -> bool:
    """Whether this process can read the bucket, signing key or not."""
    return _reader() is not None


def open_document(object_path: str):
    """The blob at ``object_path``, with its metadata loaded.

    Loading the metadata first is what separates the two failures the endpoint
    has to answer differently: an object the bucket does not hold is a 404, and
    a bucket that could not be reached at all is a 502. It also yields the
    length, which a range request needs.
    """
    client = _reader()
    if client is None:
        raise DocumentUnreadable(
            NO_ACCESS_NOTE.format(bucket=settings.pdf_bucket, error="no credentials")
        )

    from google.api_core import exceptions as api

    try:
        blob = client.bucket(settings.pdf_bucket).blob(object_path.lstrip("/"))
        blob.reload()
    except api.NotFound as missing:
        raise DocumentMissing(object_path) from missing
    except Exception as error:  # noqa: BLE001 - the cause is reported
        raise DocumentUnreadable(str(error)) from error
    return blob


def stream_document(blob, start: int = 0, end: int | None = None) -> Iterator[bytes]:
    """The object's bytes, :data:`CHUNK_BYTES` at a time, ``start`` to ``end``.

    ``end`` is inclusive, as it is in an HTTP range. Blocking on every read, so
    it is handed to Starlette as a synchronous iterator and runs in the
    threadpool rather than on the event loop.
    """
    remaining = None if end is None else end - start + 1
    with blob.open("rb", chunk_size=CHUNK_BYTES) as handle:
        if start:
            handle.seek(start)
        while remaining is None or remaining > 0:
            size = CHUNK_BYTES if remaining is None else min(CHUNK_BYTES, remaining)
            chunk = handle.read(size)
            if not chunk:
                return
            if remaining is not None:
                remaining -= len(chunk)
            yield chunk
