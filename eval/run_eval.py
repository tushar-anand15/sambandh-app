#!/usr/bin/env python3
"""
Evaluation harness for GramSAMBANDH retrieval pipeline.

Runs test cases against the hybrid search (without LLM) and reports
retrieval quality metrics.

Usage:
    python eval/run_eval.py [--api-url http://localhost:8000] [--no-rerank]
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
import time
from dataclasses import dataclass
from pathlib import Path

import asyncpg


@dataclass
class TestResult:
    test_id: int
    query: str
    query_type: str
    passed: bool
    num_results: int
    latency_ms: float
    matched_lb: bool
    matched_project: bool
    matched_chunk_types: bool
    top_lbs: list[str]
    top_projects: list[str]
    top_chunk_types: list[str]
    notes: str = ""


async def run_search(
    conn: asyncpg.Connection,
    query: str,
    top_k: int = 10,
) -> tuple[list[dict], float]:
    """Run hybrid search (FTS only — no embedding on eval machine)."""
    start = time.monotonic()

    rows = await conn.fetch(
        """
        SELECT pc.chunk_id, pc.chunk_type, pc.display_text,
               pc.page_start, pc.page_end, pc.district_name,
               pc.lb_name, pc.lb_type, pc.project_no, pc.year_label,
               ts_rank_cd(pc.tsv, q) AS score
        FROM processed_chunks pc,
             plainto_tsquery('simple', $1) AS q
        WHERE pc.tsv @@ q
        ORDER BY ts_rank_cd(pc.tsv, q) DESC
        LIMIT $2
        """,
        query,
        top_k,
    )

    latency_ms = (time.monotonic() - start) * 1000
    results = [dict(r) for r in rows]
    return results, latency_ms


async def evaluate_test_case(
    conn: asyncpg.Connection,
    test_case: dict,
) -> TestResult:
    """Evaluate a single test case."""
    query = test_case["query"]
    results, latency_ms = await run_search(conn, query, top_k=10)

    top_lbs = list({r["lb_name"] for r in results if r.get("lb_name")})
    top_projects = list({r["project_no"] for r in results if r.get("project_no")})
    top_chunk_types = list({r["chunk_type"] for r in results})

    matched_lb = True
    if "expected_lb_name" in test_case:
        matched_lb = test_case["expected_lb_name"] in top_lbs

    matched_project = True
    if "expected_project_no" in test_case:
        matched_project = test_case["expected_project_no"] in top_projects

    matched_chunk_types = True
    if "expected_chunk_types" in test_case:
        expected = set(test_case["expected_chunk_types"])
        matched_chunk_types = bool(expected & set(top_chunk_types))

    min_results = test_case.get("min_results", 1)
    has_enough = len(results) >= min_results

    passed = has_enough and matched_lb and matched_project and matched_chunk_types

    return TestResult(
        test_id=test_case["id"],
        query=query,
        query_type=test_case["query_type"],
        passed=passed,
        num_results=len(results),
        latency_ms=latency_ms,
        matched_lb=matched_lb,
        matched_project=matched_project,
        matched_chunk_types=matched_chunk_types,
        top_lbs=top_lbs[:5],
        top_projects=top_projects[:5],
        top_chunk_types=top_chunk_types,
        notes=test_case.get("notes", ""),
    )


async def main(db_url: str, test_file: str):
    conn = await asyncpg.connect(db_url)

    test_cases = []
    with open(test_file) as f:
        for line in f:
            line = line.strip()
            if line:
                test_cases.append(json.loads(line))

    print(f"\n{'='*70}")
    print(f"  GramSAMBANDH Retrieval Evaluation — {len(test_cases)} test cases")
    print(f"{'='*70}\n")

    results: list[TestResult] = []
    for tc in test_cases:
        result = await evaluate_test_case(conn, tc)
        results.append(result)

        status = "PASS" if result.passed else "FAIL"
        icon = "✓" if result.passed else "✗"
        print(
            f"  {icon} [{status}] Test {result.test_id}: {result.query[:50]:<50} "
            f"({result.num_results} results, {result.latency_ms:.0f}ms)"
        )
        if not result.passed:
            if not result.matched_lb:
                print(f"           LB mismatch: got {result.top_lbs}")
            if not result.matched_project:
                print(f"           Project mismatch: got {result.top_projects}")
            if not result.matched_chunk_types:
                print(f"           Chunk type mismatch: got {result.top_chunk_types}")

    await conn.close()

    passed = sum(1 for r in results if r.passed)
    total = len(results)
    avg_latency = sum(r.latency_ms for r in results) / total if total else 0

    print(f"\n{'='*70}")
    print(f"  Results: {passed}/{total} passed ({passed/total*100:.0f}%)")
    print(f"  Avg latency: {avg_latency:.0f}ms")
    print(f"{'='*70}\n")

    report_path = Path(test_file).parent / "eval_report.md"
    with open(report_path, "w") as f:
        f.write(f"# Evaluation Report\n\n")
        f.write(f"**Date**: {time.strftime('%Y-%m-%d %H:%M')}\n")
        f.write(f"**Tests**: {passed}/{total} passed ({passed/total*100:.0f}%)\n")
        f.write(f"**Avg latency**: {avg_latency:.0f}ms\n\n")
        f.write("| # | Query | Type | Pass | Results | Latency | Notes |\n")
        f.write("|---|-------|------|------|---------|---------|-------|\n")
        for r in results:
            status = "✓" if r.passed else "✗"
            f.write(
                f"| {r.test_id} | {r.query[:40]} | {r.query_type} | {status} | "
                f"{r.num_results} | {r.latency_ms:.0f}ms | {r.notes[:40]} |\n"
            )

    print(f"  Report written to {report_path}\n")
    return 0 if passed == total else 1


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run retrieval evaluation")
    parser.add_argument(
        "--db-url",
        default="postgresql://sambandh:sambandh@localhost:5434/sambandh",
        help="Database URL",
    )
    parser.add_argument(
        "--test-file",
        default=str(Path(__file__).parent / "test_cases.jsonl"),
        help="Path to test cases JSONL",
    )
    args = parser.parse_args()

    sys.exit(asyncio.run(main(args.db_url, args.test_file)))
