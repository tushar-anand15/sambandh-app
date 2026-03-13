"""initial schema

Revision ID: c493cdac857a
Revises: 
Create Date: 2026-03-13 21:04:46.760686

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from pgvector.sqlalchemy import Vector
from sqlalchemy.dialects.postgresql import JSONB, TSVECTOR, UUID


revision: str = 'c493cdac857a'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")

    op.create_table(
        "users",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("email", sa.Text, unique=True, nullable=False),
        sa.Column("password_hash", sa.Text, nullable=False),
        sa.Column("full_name", sa.Text, nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index("idx_users_email", "users", ["email"])

    op.create_table(
        "documents",
        sa.Column("pdf_id", UUID(as_uuid=True), primary_key=True),
        sa.Column("district_name", sa.Text),
        sa.Column("lb_name", sa.Text),
        sa.Column("lb_type", sa.Text),
        sa.Column("project_no", sa.Text),
        sa.Column("project_name", sa.Text),
        sa.Column("year_label", sa.Text),
        sa.Column("gcs_path", sa.Text, nullable=False),
        sa.Column("gcs_bucket", sa.Text, nullable=False),
        sa.Column("file_size_bytes", sa.Integer),
        sa.Column("page_count", sa.Integer),
        sa.Column("block_count", sa.Integer),
        sa.Column("table_count", sa.Integer),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index("idx_doc_district", "documents", ["district_name"])
    op.create_index("idx_doc_year", "documents", ["year_label"])
    op.create_index("idx_doc_lb_type", "documents", ["lb_type"])
    op.create_index("idx_doc_project", "documents", ["project_no"])

    op.create_table(
        "processed_chunks",
        sa.Column(
            "chunk_id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "pdf_id",
            UUID(as_uuid=True),
            sa.ForeignKey("documents.pdf_id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("chunk_index", sa.Integer, nullable=False),
        sa.Column("chunk_type", sa.Text, nullable=False),
        sa.Column(
            "section_path",
            sa.ARRAY(sa.Text),
            nullable=False,
            server_default=sa.text("'{}'"),
        ),
        sa.Column("display_text", sa.Text, nullable=False),
        sa.Column("search_text", sa.Text, nullable=False),
        sa.Column("page_start", sa.Integer, nullable=False),
        sa.Column("page_end", sa.Integer, nullable=False),
        sa.Column("token_count", sa.Integer),
        sa.Column("metadata", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("district_name", sa.Text),
        sa.Column("lb_name", sa.Text),
        sa.Column("lb_type", sa.Text),
        sa.Column("project_no", sa.Text),
        sa.Column("year_label", sa.Text),
        sa.Column(
            "tsv",
            TSVECTOR,
            sa.Computed("to_tsvector('simple', search_text)", persisted=True),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.UniqueConstraint("pdf_id", "chunk_index", name="uq_pc_pdf_chunk"),
    )
    op.create_index("idx_pc_pdf", "processed_chunks", ["pdf_id"])
    op.create_index("idx_pc_tsv", "processed_chunks", ["tsv"], postgresql_using="gin")
    op.create_index(
        "idx_pc_trgm",
        "processed_chunks",
        ["search_text"],
        postgresql_using="gin",
        postgresql_ops={"search_text": "gin_trgm_ops"},
    )
    op.create_index("idx_pc_district", "processed_chunks", ["district_name"])
    op.create_index("idx_pc_year", "processed_chunks", ["year_label"])
    op.create_index("idx_pc_lb_type", "processed_chunks", ["lb_type"])
    op.create_index("idx_pc_type", "processed_chunks", ["chunk_type"])

    op.create_table(
        "chunk_embeddings",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "chunk_id",
            UUID(as_uuid=True),
            sa.ForeignKey("processed_chunks.chunk_id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "embed_model",
            sa.Text,
            nullable=False,
            server_default=sa.text("'bge-m3-v1'"),
        ),
        sa.Column("embedding", Vector(1024), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.UniqueConstraint("chunk_id", "embed_model", name="uq_ce_chunk_model"),
    )
    op.create_index(
        "idx_ce_hnsw",
        "chunk_embeddings",
        ["embedding"],
        postgresql_using="hnsw",
        postgresql_with={"m": 16, "ef_construction": 64},
        postgresql_ops={"embedding": "vector_cosine_ops"},
    )


def downgrade() -> None:
    op.drop_table("chunk_embeddings")
    op.drop_table("processed_chunks")
    op.drop_table("documents")
    op.drop_table("users")
    op.execute("DROP EXTENSION IF EXISTS pg_trgm")
    op.execute("DROP EXTENSION IF EXISTS vector")
