"""The rate limiter counts callers, not the proxy in front of them.

Until this unit landed, `public.rate_limit` keyed on `request.client.host` with
nothing translating that back into the real caller. Behind nginx that address is
nginx's own container, so every visitor to the site shared one bucket and the
600-per-minute limit was a single global tap: one scraper could 429 everybody,
and a per-IP limit on anything expensive was decorative.

The fix is `ProxyHeadersMiddleware` installed in the application rather than
passed to uvicorn as `--proxy-headers`, which is what makes it reachable from
here at all — `conftest.py` speaks `ASGITransport(app=app)` straight to
`app.main:app` and never starts a server, so a flag on the command line would
have been tested by nothing.

Three claims:

* a forwarded address is what gets counted, and two of them do not share a
  budget;
* a forwarded address from a source that is not a trusted proxy is ignored, so
  a caller cannot mint a fresh bucket by inventing a header;
* the counter map is the size of recent traffic, not of all traffic ever.

The CORS tests are here because they defend the same boundary: who is allowed
to reach this API, and from where.
"""

import pytest
from fastapi import Depends, FastAPI, Request
from httpx import ASGITransport, AsyncClient

from app import public
from app.config import settings
from app.public import rate_limit

# ---------------------------------------------------------------------------
# Harness
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def empty_limiter():
    """The counters are process-global, so no test may inherit another's."""
    public.reset_rate_limits()
    yield
    public.reset_rate_limits()


def _probe_app(trusted_hosts):
    """A one-route app behind the middleware, with the trust boundary chosen.

    The deployed app trusts `*`, which is correct there — nothing but nginx can
    open a socket to it — but it means the real app cannot demonstrate what
    happens to a header from an *untrusted* source. This builds the same
    middleware over the same dependency with a boundary that excludes the
    caller, which is the configuration a narrowed `TRUSTED_PROXIES` produces.
    """
    from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware

    inner = FastAPI()

    @inner.get("/probe", dependencies=[Depends(rate_limit)])
    async def probe(request: Request) -> dict[str, str]:
        return {"client": request.client.host}

    return ProxyHeadersMiddleware(inner, trusted_hosts=trusted_hosts)


def _client_from(app, source_ip: str) -> AsyncClient:
    """An httpx client whose connections appear to come from `source_ip`."""
    transport = ASGITransport(app=app, client=(source_ip, 44444))
    return AsyncClient(transport=transport, base_url="http://testserver")


# ---------------------------------------------------------------------------
# The forwarded address is the key
# ---------------------------------------------------------------------------


async def test_a_forwarded_client_is_counted_under_its_own_address(client, monkeypatch):
    """The defect itself: three requests from one caller, counted as three."""
    monkeypatch.setattr(public, "RATE_LIMIT", 2)
    headers = {"X-Forwarded-For": "203.0.113.9"}

    statuses = [(await client.get("/api/bodies", headers=headers)).status_code for _ in range(3)]

    assert statuses == [200, 200, 429]
    assert "203.0.113.9" in public._hits


async def test_a_second_client_ip_gets_its_own_budget(client, monkeypatch):
    """Before this change both addresses landed in nginx's single bucket."""
    monkeypatch.setattr(public, "RATE_LIMIT", 2)
    for _ in range(3):
        await client.get("/api/bodies", headers={"X-Forwarded-For": "203.0.113.9"})

    exhausted = await client.get("/api/bodies", headers={"X-Forwarded-For": "203.0.113.9"})
    other = await client.get("/api/bodies", headers={"X-Forwarded-For": "198.51.100.7"})

    assert exhausted.status_code == 429
    assert other.status_code == 200
    assert set(public._hits) == {"203.0.113.9", "198.51.100.7"}


async def test_a_429_still_tells_the_caller_when_to_retry(client, monkeypatch):
    monkeypatch.setattr(public, "RATE_LIMIT", 1)
    await client.get("/api/bodies", headers={"X-Forwarded-For": "203.0.113.9"})

    response = await client.get("/api/bodies", headers={"X-Forwarded-For": "203.0.113.9"})

    assert response.status_code == 429
    assert response.headers["retry-after"] == "60"


# ---------------------------------------------------------------------------
# A header from an untrusted source is not evidence
# ---------------------------------------------------------------------------


async def test_a_forwarded_header_from_an_untrusted_source_is_ignored():
    """Otherwise the limiter is worse than none: a spoofed header is a free reset."""
    app = _probe_app(trusted_hosts=["10.9.9.9"])

    async with _client_from(app, "203.0.113.50") as caller:
        response = await caller.get("/probe", headers={"X-Forwarded-For": "1.1.1.1"})

    assert response.json()["client"] == "203.0.113.50"
    assert set(public._hits) == {"203.0.113.50"}


async def test_a_spoofer_cannot_buy_a_fresh_budget_with_a_new_header(monkeypatch):
    monkeypatch.setattr(public, "RATE_LIMIT", 2)
    app = _probe_app(trusted_hosts=["10.9.9.9"])

    async with _client_from(app, "203.0.113.50") as caller:
        for i in range(2):
            await caller.get("/probe", headers={"X-Forwarded-For": f"1.1.1.{i}"})
        response = await caller.get("/probe", headers={"X-Forwarded-For": "1.1.1.99"})

    assert response.status_code == 429


async def test_a_trusted_proxy_is_believed():
    """The same request from the proxy's own address does get translated."""
    app = _probe_app(trusted_hosts=["10.9.9.9"])

    async with _client_from(app, "10.9.9.9") as proxy:
        response = await proxy.get("/probe", headers={"X-Forwarded-For": "1.1.1.1"})

    assert response.json()["client"] == "1.1.1.1"


async def test_no_forwarded_header_falls_back_to_the_socket_address():
    """A direct caller — a health check on the VM — is still counted as itself."""
    app = _probe_app(trusted_hosts="*")

    async with _client_from(app, "192.0.2.77") as caller:
        response = await caller.get("/probe")

    assert response.json()["client"] == "192.0.2.77"
    assert set(public._hits) == {"192.0.2.77"}


# ---------------------------------------------------------------------------
# The counter map does not grow forever
# ---------------------------------------------------------------------------


def test_expired_clients_do_not_stay_in_the_counter_map():
    """One retained deque per address ever seen is a slow leak on a 2 GB VM."""
    for n in range(200):
        public.check_rate(f"203.0.113.{n}", now=100.0, limit=5)
    assert len(public._hits) == 200

    public.check_rate("198.51.100.1", now=100.0 + public.RATE_WINDOW * 2)

    assert set(public._hits) == {"198.51.100.1"}


def test_a_client_still_inside_its_window_survives_a_sweep():
    """Eviction must not hand an active caller a fresh budget."""
    for _ in range(2):
        public.check_rate("203.0.113.9", now=100.0, limit=3)
    public.check_rate("203.0.113.9", now=130.0, limit=3)

    public.check_rate("198.51.100.1", now=170.0, limit=3)  # triggers the sweep

    assert "203.0.113.9" in public._hits
    # The 130.0 hit is still inside the window at 170.0, so it still counts.
    assert public.check_rate("203.0.113.9", now=170.0, limit=1) is False


# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------


async def test_a_preflight_from_an_unlisted_origin_is_refused(client):
    """`allow_origins=["*"]` with credentials allowed nothing and forbade nothing."""
    response = await client.options(
        "/api/bodies",
        headers={
            "Origin": "https://not-this-site.example",
            "Access-Control-Request-Method": "GET",
        },
    )

    assert response.status_code == 400
    assert "access-control-allow-origin" not in response.headers


async def test_a_preflight_from_an_allowed_origin_succeeds(client):
    origin = settings.cors_origins[0]

    response = await client.options(
        "/api/bodies",
        headers={"Origin": origin, "Access-Control-Request-Method": "GET"},
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == origin


async def test_cors_no_longer_claims_to_allow_credentials(client):
    """The token is a Bearer header, not a cookie, so nothing needs the claim —
    and paired with a wildcard origin the claim was one browsers reject."""
    origin = settings.cors_origins[0]

    response = await client.get("/api/bodies", headers={"Origin": origin})

    assert response.headers["access-control-allow-origin"] == origin
    assert "access-control-allow-credentials" not in response.headers
