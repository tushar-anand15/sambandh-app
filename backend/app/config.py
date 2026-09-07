from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql://sambandh:sambandh@localhost:5434/sambandh"
    jwt_secret: str = "change-this-to-a-random-secret-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expiry_hours: int = 24

    # The model that produced chunk_embeddings. Verified against the stored
    # vectors, not taken from this line: embedding a chunk's text with this
    # model scores 0.96 cosine against its row. Changing it invalidates every
    # vector in the table and requires re-embedding the corpus.
    embed_model: str = "vertex_ai/gemini-embedding-001"
    embed_dim: int = 1024
    search_top_k: int = 10
    dense_recall_k: int = 50
    fts_recall_k: int = 50
    rrf_k: int = 60
    rerank_candidate_k: int = 40

    reranker_model: str = "jinaai/jina-reranker-v2-base-multilingual"
    reranker_enabled: bool = True

    llm_provider: str = "gemini/gemini-2.0-flash"
    llm_api_key: str = ""
    llm_model: str = ""

    max_message_length: int = 2000

    # Which source addresses may set X-Forwarded-For, and so decide what the
    # rate limiter counts against.
    #
    # `*` -- trust whatever connects -- is the right value for this deployment
    # rather than an unconsidered default. deploy/docker-compose.prod.yml
    # publishes the backend as "127.0.0.1:8000:8000", so the only thing that
    # can open a socket to uvicorn is nginx on the same host, and nginx sets
    # X-Real-IP and rewrites X-Forwarded-For on every proxied request, so a
    # header a caller invents is overwritten before it arrives.
    #
    # Narrowing it is fine, but the value must then be IP addresses or CIDR
    # ranges. ProxyHeadersMiddleware does not resolve service names, and a
    # compose bridge address changes when the network is recreated -- so
    # "frontend" or a remembered 172.18.0.x would stop matching, silently, and
    # put every request back into one bucket keyed on nginx. That is the exact
    # defect this setting exists to remove.
    trusted_proxies: str = "*"

    # Origins allowed to call this API from a browser, comma separated.
    #
    # It was `*` with `allow_credentials=True`, which the CORS spec forbids and
    # every browser rejects: the pair produced no working cross-origin request
    # and only looked permissive. Auth is a Bearer token read from
    # localStorage (frontend/src/lib/api.ts), never a cookie, so credentialed
    # CORS is not needed and `allow_credentials` is gone.
    #
    # Both deployed origins proxy /api through nginx from the same origin, so
    # this list is not on the path any page uses today. It bounds who can call
    # the API from someone else's page, which matters once a POST that sends
    # mail exists.
    cors_allow_origins: str = (
        "http://localhost:5173,http://127.0.0.1:5173,"
        "https://gramsambandh.co.in,https://www.gramsambandh.co.in"
    )

    # Where the boundary GeoJSON layers are on disk. The layers are built by
    # sulekha's `geo build` and are 7.5 MB to 57 MB each, so they are not in
    # this repository: a deployment mounts the directory and points GEO_DIR at
    # it. An unset or empty value means no layer is served, and /api/maps says
    # so per layer rather than offering a download that would 404.
    geo_dir: str = ""

    # Project documents. The finance tables carry an object path inside this
    # bucket; app/presign.py turns it into a signed URL so the browser fetches
    # the scan from Cloud Storage instead of through this API. Signing needs a
    # service account key with storage.objects.get on the bucket. Without one,
    # /api/finances returns pdf_url: null and states why.
    pdf_bucket: str = "sulekhasakarma-pdfs"
    pdf_signing_key_file: str = ""
    pdf_url_ttl_seconds: int = 3600

    # The report form (app/routers/report.py). Mail goes out over an HTTPS API,
    # not SMTP: GCP blocks outbound port 25 from Compute Engine and a fresh VM
    # address has no sending reputation. `mail_api_url` is the provider, so
    # changing provider is a configuration change; production points at Resend.
    #
    # Every field here is optional and empty, and none of them may be given a
    # working default. `Settings` is imported by tests and by local development
    # with no mail environment at all, so a required field would raise at
    # import. What makes production refuse to boot without them is
    # `report.verify_mail_config`, called from the lifespan when `mail_enabled`
    # is on.
    mail_enabled: bool = False
    mail_api_url: str = "https://api.resend.com/emails"
    mail_api_key: str = ""
    mail_from: str = ""
    mail_to: str = ""
    mail_timeout_seconds: float = 10.0

    # Its own secret, never `jwt_secret`. Two purposes sharing one key means
    # rotating either forces the other, and a leak of one is a leak of both.
    report_token_secret: str = ""

    # `extra: ignore` so the file may also carry variables this class does not
    # read. litellm takes VERTEXAI_PROJECT and VERTEXAI_LOCATION straight from
    # the environment, and production supplies them as container env, which
    # pydantic ignores. Without this, the same two lines in a local .env stop
    # the app booting -- a setting that works in production and breaks
    # development is the wrong way round.
    model_config = {"env_file": ".env", "extra": "ignore"}

    @property
    def trusted_proxy_hosts(self) -> list[str] | str:
        """`trusted_proxies` in the shape ProxyHeadersMiddleware wants.

        The literal string "*" has to survive as a string: the middleware tests
        for it by identity against `"*"` and `["*"]`, and a one-element list
        built by splitting happens to match, but only by luck. Passing it
        through unsplit keeps that from being load-bearing.
        """
        value = self.trusted_proxies.strip()
        if value == "*":
            return "*"
        return [host.strip() for host in value.split(",") if host.strip()]

    @property
    def cors_origins(self) -> list[str]:
        """`cors_allow_origins` as a list. Empty means no cross-origin caller."""
        return [origin.strip() for origin in self.cors_allow_origins.split(",") if origin.strip()]


settings = Settings()
