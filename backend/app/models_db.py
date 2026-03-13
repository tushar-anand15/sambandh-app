"""
SQLAlchemy ORM models — source of truth for the database schema.

Tables:
  - users: authentication accounts
  - documents: PDF-level metadata (synced from preprocessing pipeline)
  - processed_chunks: text chunks with FTS and denormalized filters
  - chunk_embeddings: dense vectors for ANN search (pgvector)
"""

from __future__ import annotations

import uuid
from datetime import datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    ARRAY,
    Index,
    Integer,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, TSVECTOR, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy.schema import Computed, ForeignKey


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    full_name: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        nullable=False, server_default=text("now()")
    )

    __table_args__ = (
        Index("idx_users_email", "email"),
    )


class Document(Base):
    __tablename__ = "documents"

    pdf_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True
    )
    district_name: Mapped[str | None] = mapped_column(Text)
    lb_name: Mapped[str | None] = mapped_column(Text)
    lb_type: Mapped[str | None] = mapped_column(Text)
    project_no: Mapped[str | None] = mapped_column(Text)
    project_name: Mapped[str | None] = mapped_column(Text)
    year_label: Mapped[str | None] = mapped_column(Text)
    gcs_path: Mapped[str] = mapped_column(Text, nullable=False)
    gcs_bucket: Mapped[str] = mapped_column(Text, nullable=False)
    file_size_bytes: Mapped[int | None] = mapped_column(Integer)
    page_count: Mapped[int | None] = mapped_column(Integer)
    block_count: Mapped[int | None] = mapped_column(Integer)
    table_count: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(
        nullable=False, server_default=text("now()")
    )

    chunks: Mapped[list[ProcessedChunk]] = relationship(
        back_populates="document", cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index("idx_doc_district", "district_name"),
        Index("idx_doc_year", "year_label"),
        Index("idx_doc_lb_type", "lb_type"),
        Index("idx_doc_project", "project_no"),
    )


class ProcessedChunk(Base):
    __tablename__ = "processed_chunks"

    chunk_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    pdf_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("documents.pdf_id", ondelete="CASCADE"),
        nullable=False,
    )
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    chunk_type: Mapped[str] = mapped_column(Text, nullable=False)
    section_path: Mapped[list[str]] = mapped_column(
        ARRAY(Text), nullable=False, server_default=text("'{}'")
    )
    display_text: Mapped[str] = mapped_column(Text, nullable=False)
    search_text: Mapped[str] = mapped_column(Text, nullable=False)
    page_start: Mapped[int] = mapped_column(Integer, nullable=False)
    page_end: Mapped[int] = mapped_column(Integer, nullable=False)
    token_count: Mapped[int | None] = mapped_column(Integer)
    metadata_: Mapped[dict] = mapped_column(
        "metadata", JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )
    district_name: Mapped[str | None] = mapped_column(Text)
    lb_name: Mapped[str | None] = mapped_column(Text)
    lb_type: Mapped[str | None] = mapped_column(Text)
    project_no: Mapped[str | None] = mapped_column(Text)
    year_label: Mapped[str | None] = mapped_column(Text)
    tsv: Mapped[str | None] = mapped_column(
        TSVECTOR,
        Computed("to_tsvector('simple', search_text)", persisted=True),
    )
    created_at: Mapped[datetime] = mapped_column(
        nullable=False, server_default=text("now()")
    )

    document: Mapped[Document] = relationship(back_populates="chunks")
    embeddings: Mapped[list[ChunkEmbedding]] = relationship(
        back_populates="chunk", cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index("uq_pc_pdf_chunk", "pdf_id", "chunk_index", unique=True),
        Index("idx_pc_pdf", "pdf_id"),
        Index("idx_pc_tsv", "tsv", postgresql_using="gin"),
        Index(
            "idx_pc_trgm",
            "search_text",
            postgresql_using="gin",
            postgresql_ops={"search_text": "gin_trgm_ops"},
        ),
        Index("idx_pc_district", "district_name"),
        Index("idx_pc_year", "year_label"),
        Index("idx_pc_lb_type", "lb_type"),
        Index("idx_pc_type", "chunk_type"),
    )


class ChunkEmbedding(Base):
    __tablename__ = "chunk_embeddings"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    chunk_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("processed_chunks.chunk_id", ondelete="CASCADE"),
        nullable=False,
    )
    embed_model: Mapped[str] = mapped_column(
        Text, nullable=False, server_default=text("'bge-m3-v1'")
    )
    embedding = mapped_column(Vector(1024), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        nullable=False, server_default=text("now()")
    )

    chunk: Mapped[ProcessedChunk] = relationship(back_populates="embeddings")

    __table_args__ = (
        Index("uq_ce_chunk_model", "chunk_id", "embed_model", unique=True),
        Index(
            "idx_ce_hnsw",
            "embedding",
            postgresql_using="hnsw",
            postgresql_with={"m": 16, "ef_construction": 64},
            postgresql_ops={"embedding": "vector_cosine_ops"},
        ),
    )
