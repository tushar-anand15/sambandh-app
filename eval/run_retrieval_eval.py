#!/usr/bin/env python3
"""
Retrieval-only evaluation: tests embed + FTS + RRF + rerank pipeline
via the /api/search endpoint (no LLM generation).

Usage:
    python eval/run_retrieval_eval.py [--api-url http://localhost:8000]
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import requests


def get_token(api_url: str) -> str:
    r = requests.post(
        f"{api_url}/api/auth/login",
        json={"email": "eval@test.com", "password": "evalpass123"},
    )
    if r.status_code != 200:
        r = requests.post(
            f"{api_url}/api/auth/register",
            json={"email": "eval@test.com", "password": "evalpass123", "full_name": "Eval"},
        )
    return r.json()["access_token"]


def query_search(api_url: str, token: str, query: str) -> tuple[list[dict], float]:
    start = time.monotonic()
    r = requests.post(
        f"{api_url}/api/search",
        headers={"Authorization": f"Bearer {token}"},
        json={"query": query, "top_k": 10},
        timeout=300,
    )
    latency = (time.monotonic() - start) * 1000
    if r.status_code != 200:
        print(f"    ERROR {r.status_code}: {r.text[:200]}")
        return [], latency
    return r.json().get("sources", []), latency


def evaluate(tc: dict, sources: list[dict]) -> tuple[bool, list[str]]:
    failures = []

    min_results = tc.get("min_results", 1)
    if len(sources) < min_results:
        failures.append(f"sources={len(sources)} < min={min_results}")

    source_lbs = {s.get("lb_name", "") for s in sources if s.get("lb_name")}
    source_projects = {s.get("project_no", "") for s in sources if s.get("project_no")}

    if "expected_lb_name" in tc:
        if tc["expected_lb_name"] not in source_lbs:
            failures.append(f"missing LB '{tc['expected_lb_name']}' — got {sorted(source_lbs)}")

    if "expected_lb_names" in tc:
        for lb in tc["expected_lb_names"]:
            if lb not in source_lbs:
                failures.append(f"missing LB '{lb}' — got {sorted(source_lbs)}")

    if "expected_project_no" in tc:
        if tc["expected_project_no"] not in source_projects:
            failures.append(f"missing project '{tc['expected_project_no']}' — got {sorted(source_projects)}")

    return len(failures) == 0, failures


def main(api_url: str, test_file: str):
    cases = []
    with open(test_file) as f:
        for line in f:
            if line.strip():
                cases.append(json.loads(line.strip()))

    print(f"\n{'='*72}")
    print(f"  Retrieval Evaluation — {len(cases)} test cases")
    print(f"  Pipeline: BGE-M3 embed -> dense + FTS -> RRF -> Jina rerank")
    print(f"  Endpoint: {api_url}/api/search")
    print(f"{'='*72}\n")

    token = get_token(api_url)
    print("  Authenticated\n")

    results = []
    for tc in cases:
        qid = tc["id"]
        query = tc["query"]
        qtype = tc["query_type"]

        sources, latency = query_search(api_url, token, query)
        passed, failures = evaluate(tc, sources)

        icon = "PASS" if passed else "FAIL"
        top_lbs = sorted({s.get("lb_name", "?") for s in sources[:5]})
        top_scores = [f"{s.get('score', 0):.3f}" for s in sources[:3]]

        print(f"  [{icon}] #{qid} ({qtype:8s}) {query[:45]}")
        print(f"    {len(sources)} sources | {latency:.0f}ms | top: {', '.join(top_scores)}")
        print(f"    LBs: {', '.join(top_lbs[:4])}")
        if failures:
            for msg in failures:
                print(f"    >> {msg}")
        print()

        results.append({
            "id": qid, "query": query, "type": qtype,
            "passed": passed, "sources": len(sources),
            "latency_ms": round(latency), "failures": failures,
            "top_lbs": top_lbs[:5], "top_scores": top_scores,
        })

    passed_n = sum(1 for r in results if r["passed"])
    total = len(results)
    avg_lat = sum(r["latency_ms"] for r in results) / total if total else 0

    print(f"{'='*72}")
    print(f"  RESULTS: {passed_n}/{total} passed ({passed_n/total*100:.0f}%)")
    print(f"  Avg latency: {avg_lat:.0f}ms")
    print(f"{'='*72}\n")

    report = Path(test_file).parent / "retrieval_eval_report.md"
    with open(report, "w") as f:
        f.write("# Retrieval Evaluation Report\n\n")
        f.write(f"**Date**: {time.strftime('%Y-%m-%d %H:%M')}\n")
        f.write("**Pipeline**: BGE-M3 -> dense+FTS -> RRF -> Jina rerank\n")
        f.write(f"**Results**: {passed_n}/{total} passed ({passed_n/total*100:.0f}%)\n")
        f.write(f"**Avg latency**: {avg_lat:.0f}ms\n\n")
        f.write("| # | Query | Type | Pass | Sources | Latency | Top LBs | Notes |\n")
        f.write("|---|-------|------|------|---------|---------|---------|-------|\n")
        for r in results:
            s = "Y" if r["passed"] else "N"
            notes = "; ".join(r["failures"])[:60] if r["failures"] else "OK"
            lbs = ", ".join(r["top_lbs"][:3])[:40]
            f.write(
                f"| {r['id']} | {r['query'][:35]} | {r['type']} | {s} | "
                f"{r['sources']} | {r['latency_ms']}ms | {lbs} | {notes} |\n"
            )
        score_parts = []
        for r in results:
            top = r["top_scores"][0] if r["top_scores"] else "N/A"
            score_parts.append(f"#{r['id']}={top}")
        f.write(f"\n**Top scores**: {', '.join(score_parts)}\n")

    print(f"  Report: {report}\n")
    return 0 if passed_n >= 7 else 1


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--api-url", default="http://localhost:8000")
    parser.add_argument("--test-file", default=str(Path(__file__).parent / "test_cases.jsonl"))
    args = parser.parse_args()
    sys.exit(main(args.api_url, args.test_file))
