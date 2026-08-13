"""Signed URLs for the project documents.

The interesting cases are the two ends. With a real service account key the
module has to produce a V4 signature Cloud Storage will accept, which is
checked here against the parameters the V4 scheme requires rather than against
a fetch, because a fetch would need the bucket's IAM as well as its signature.
With no key at all it has to say so twice: once for the reader who sees the
page, once in a log line naming the setting to fill in. That is the state most
deployments start in.

The key used below is generated in the test, not a real one. It is a genuine
2048-bit RSA key in the shape ``from_service_account_info`` expects, so the
signing path exercised is the production path.
"""

from __future__ import annotations

import json
from urllib.parse import parse_qs, urlparse

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

from app.presign import DocumentSigner


@pytest.fixture(scope="module")
def key_file(tmp_path_factory) -> str:
    """A service account key with a real private key and a fictional email."""
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    pem = key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode()

    path = tmp_path_factory.mktemp("credentials") / "signing-key.json"
    path.write_text(
        json.dumps(
            {
                "type": "service_account",
                "project_id": "sulekhasakarma-495616",
                "private_key_id": "0" * 40,
                "private_key": pem,
                "client_email": "test-signer@sulekhasakarma-495616.iam.gserviceaccount.com",
                "token_uri": "https://oauth2.googleapis.com/token",
            }
        )
    )
    return str(path)


BUCKET = "sulekhasakarma-pdfs"
PATH = "pdfs/2023-2024/Municipality/Thrissur/Chalakkudy_Municipality/8.pdf"


def signer(key_path: str) -> DocumentSigner:
    return DocumentSigner(bucket=BUCKET, key_path=key_path, ttl_seconds=3600)


# ---------------------------------------------------------------------------
# With a signing key
# ---------------------------------------------------------------------------


def test_a_signed_url_addresses_the_object_in_the_bucket(key_file):
    url = signer(key_file).sign(PATH)

    parsed = urlparse(url)
    assert parsed.scheme == "https"
    assert parsed.netloc == "storage.googleapis.com"
    assert parsed.path == f"/{BUCKET}/{PATH}"


def test_a_signed_url_carries_a_v4_signature_that_expires(key_file):
    query = parse_qs(urlparse(signer(key_file).sign(PATH)).query)

    assert query["X-Goog-Algorithm"] == ["GOOG4-RSA-SHA256"]
    assert query["X-Goog-Expires"] == ["3600"]
    assert query["X-Goog-Signature"][0]
    assert "test-signer@sulekhasakarma-495616.iam.gserviceaccount.com" in (
        query["X-Goog-Credential"][0]
    )


def test_the_ttl_is_the_one_configured(key_file):
    query = parse_qs(
        urlparse(
            DocumentSigner(bucket=BUCKET, key_path=key_file, ttl_seconds=900).sign(PATH)
        ).query
    )

    assert query["X-Goog-Expires"] == ["900"]


def test_a_batch_signs_every_distinct_path_once(key_file):
    paths = [PATH, PATH, None, "pdfs/2023-2024/x/1.pdf"]
    signed = signer(key_file).sign_paths(paths)

    assert set(signed) == {PATH, "pdfs/2023-2024/x/1.pdf"}
    assert signed[PATH].startswith(f"https://storage.googleapis.com/{BUCKET}/{PATH}?")


def test_no_path_is_no_url(key_file):
    assert signer(key_file).sign(None) is None
    assert signer(key_file).sign("") is None


# ---------------------------------------------------------------------------
# Without one
# ---------------------------------------------------------------------------


def test_no_key_means_no_url_and_two_sentences():
    unsigned = signer("")

    assert unsigned.available is False
    assert unsigned.sign(PATH) is None
    assert unsigned.sign_paths([PATH]) == {}

    # What the page prints, for a reader: no settings, no bucket names.
    assert "scans Sulekha holds are named here" in unsigned.reason
    assert "PDF_SIGNING_KEY_FILE" not in unsigned.reason

    # What the log carries, for whoever runs the deployment.
    assert "PDF_SIGNING_KEY_FILE" in unsigned.operator_note
    assert BUCKET in unsigned.operator_note


def test_a_missing_key_file_names_the_path_it_looked_at(tmp_path):
    missing = str(tmp_path / "absent.json")
    unsigned = signer(missing)

    assert unsigned.available is False
    assert missing in unsigned.operator_note
    assert missing not in unsigned.reason


def test_user_credentials_are_reported_as_unable_to_sign(tmp_path):
    """`gcloud auth application-default login` writes exactly this shape."""
    adc = tmp_path / "application_default_credentials.json"
    adc.write_text(json.dumps({"type": "authorized_user", "client_id": "x"}))

    unsigned = signer(str(adc))

    assert unsigned.available is False
    assert "authorized_user" in unsigned.operator_note
    assert "cannot sign" in unsigned.operator_note
