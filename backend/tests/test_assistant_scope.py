"""The assistant's index, and the boundary it is told never to cross.

Two things are tested here, and a third deliberately is not.

Tested: the corpus endpoint the assistant page reads its coverage from, against
a real ``documents`` table; and the system prompt's scoping contract, which is
the text that has to say "decline" for the model to decline.

Not tested: whether a particular model actually refuses. That is a retrieval and
generation question, it needs an LLM and a spend, and ``eval/`` already holds a
harness for it. What can be pinned here is that the prompt states its coverage,
names both refusal cases, and never claims the site's 1,238-body reach — so a
regression that quietly widens the assistant's stated scope fails a test rather
than reaching a reader as a confident answer about a body nobody indexed.
"""

from __future__ import annotations

import pytest

from app.prompts import (
    COVERAGE_SENTENCE,
    INDEX_BODIES,
    INDEX_DISTRICT,
    INDEX_DOCUMENTS,
    INDEX_YEAR,
    SYSTEM_PROMPT,
    out_of_index_refusal,
)

# A stand-in corpus: three bodies in Thrissur, all 2025-2026, shaped like the
# real ``documents`` table in the columns ``/api/documents/filters`` reads.
INDEXED = [
    ("Chalakkudy Municipality", "Municipality", 4),
    ("Adat Grama Panchayat", "Grama Panchayat", 3),
    ("Athirappilly Grama Panchayat", "Grama Panchayat", 2),
]


@pytest.fixture(scope="module", autouse=True)
async def documents_table(test_pool):
    """Create, fill and drop a ``documents`` table for this module only.

    The fixture slice deliberately holds no RAG tables — the public site does
    not read them — so this module brings its own, and takes it away again so no
    other test can accidentally depend on it.
    """
    async with test_pool.acquire() as conn:
        await conn.execute(
            """
            CREATE TABLE documents (
                pdf_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                district_name text,
                lb_name       text,
                lb_type       text,
                year_label    text,
                project_no    text,
                project_name  text
            )
            """
        )
        for lb_name, lb_type, count in INDEXED:
            for n in range(count):
                await conn.execute(
                    "INSERT INTO documents (district_name, lb_name, lb_type, year_label, project_no)"
                    " VALUES ($1, $2, $3, $4, $5)",
                    INDEX_DISTRICT,
                    lb_name,
                    lb_type,
                    INDEX_YEAR,
                    str(n + 1),
                )
    try:
        yield
    finally:
        async with test_pool.acquire() as conn:
            await conn.execute("DROP TABLE documents")


@pytest.fixture(scope="module", autouse=True)
def signed_in():
    """Stand in for a signed-in reader. ``/ask`` is the one gated part of the site."""
    from app.auth import get_current_user
    from app.main import app

    app.dependency_overrides[get_current_user] = lambda: {
        "id": "00000000-0000-0000-0000-000000000001",
        "email": "reader@example.org",
    }
    try:
        yield
    finally:
        app.dependency_overrides.pop(get_current_user, None)


# ---------------------------------------------------------------------------
# The index, read from the corpus
# ---------------------------------------------------------------------------


async def test_filters_lists_exactly_the_indexed_local_bodies(client):
    response = await client.get("/api/documents/filters")
    assert response.status_code == 200

    names = [entry["lb_name"] for entry in response.json()["local_bodies"]]
    assert names == sorted(name for name, _, _ in INDEXED)


async def test_each_indexed_body_carries_its_document_count(client):
    payload = (await client.get("/api/documents/filters")).json()
    counts = {e["lb_name"]: e["documents"] for e in payload["local_bodies"]}

    assert counts == {name: count for name, _, count in INDEXED}
    assert payload["documents"] == sum(count for _, _, count in INDEXED)


async def test_the_index_is_one_district_and_one_year(client):
    payload = (await client.get("/api/documents/filters")).json()

    # The banner's claim, checked against the corpus rather than trusted. A
    # second district or a second year in the ingest breaks this test before it
    # can quietly widen what the page says it holds.
    assert payload["districts"] == [INDEX_DISTRICT]
    assert payload["years"] == [INDEX_YEAR]


async def test_the_corpus_endpoint_refuses_without_a_token(client):
    from app.auth import get_current_user
    from app.main import app

    override = app.dependency_overrides.pop(get_current_user)
    try:
        response = await client.get("/api/documents/filters")
        assert response.status_code == 401
    finally:
        app.dependency_overrides[get_current_user] = override


# ---------------------------------------------------------------------------
# The prompt's scoping contract
# ---------------------------------------------------------------------------


def test_the_prompt_states_its_coverage():
    assert COVERAGE_SENTENCE in SYSTEM_PROMPT
    assert f"{INDEX_DOCUMENTS:,}" in COVERAGE_SENTENCE
    assert str(INDEX_BODIES) in COVERAGE_SENTENCE
    assert INDEX_DISTRICT in COVERAGE_SENTENCE
    assert INDEX_YEAR in COVERAGE_SENTENCE


def test_the_prompt_declines_a_body_outside_the_index():
    assert "you have not read documents for, decline" in SYSTEM_PROMPT
    assert (
        "Do not answer a question about one local body using documents from another"
        in SYSTEM_PROMPT
    )


def test_the_prompt_declines_a_year_outside_the_indexed_one():
    assert f"financial year other than {INDEX_YEAR}, decline" in SYSTEM_PROMPT
    assert (
        "Do not answer a question about one year using another year's documents"
        in SYSTEM_PROMPT
    )


def test_the_prompt_does_not_claim_the_sites_coverage_as_its_own():
    # The site covers 1,238 bodies and fourteen years. The assistant covers 19
    # and one. The prompt may name the difference; it may not claim it.
    assert "1,238 local bodies and fourteen financial years. \\\n" not in SYSTEM_PROMPT
    assert "Your index does not." in SYSTEM_PROMPT


def test_the_refusal_names_the_coverage_it_does_hold():
    refusal = out_of_index_refusal("Karunagappally Grama Panchayat, Kollam district")

    assert "The assistant has read no documents for" in refusal
    assert INDEX_DISTRICT in refusal
    assert INDEX_YEAR in refusal
    # A refusal that leaves the reader nowhere is a worse answer than it needs
    # to be: the rest of the site does cover that panchayat.
    assert "Finances and Meetings" in refusal
