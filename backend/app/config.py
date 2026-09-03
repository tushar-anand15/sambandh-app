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

    # `extra: ignore` so the file may also carry variables this class does not
    # read. litellm takes VERTEXAI_PROJECT and VERTEXAI_LOCATION straight from
    # the environment, and production supplies them as container env, which
    # pydantic ignores. Without this, the same two lines in a local .env stop
    # the app booting -- a setting that works in production and breaks
    # development is the wrong way round.
    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
