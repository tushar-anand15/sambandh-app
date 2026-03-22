from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql://sambandh:sambandh@localhost:5434/sambandh"
    jwt_secret: str = "change-this-to-a-random-secret-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expiry_hours: int = 24

    embed_model: str = "BAAI/bge-m3"
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

    model_config = {"env_file": ".env"}


settings = Settings()
