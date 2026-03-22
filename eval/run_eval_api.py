#!/usr/bin/env python3
"""
Evaluation harness that tests via the actual API (full pipeline: embed + FTS + RRF + rerank).

Usage:
    python eval/run_eval_api.py [--api-url http://localhost:8000]
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import requests


def login(api_url: str) -> str:
    """Get auth token."""
    r = requests.post(
        f"{api_url}/api/auth/login",
        json={"email": "dev@sambandh.com", "password": "devpassword123"},
    )
    if r.status_code != 200:
        # Try registering
        r = requests.post(
            f"{api_url}/api/auth/register",
            json={"email": "dev@sambandh.com", "password": "devpassword123", "full_name": "Dev"},
        )
    return r.json()["access_token"]


def run_chat(api_url: str, token: str, query: str) -> tuple[dict, float]:
    """Call the non-streaming chat endpoint."""
    start = time.monotonic()
    r = requests.post(
        f"{api_url}/api/chat",
        headers={"Authorization": f"Bearer {token}"},
        json={"message": query},
        timeout=60,
    )
    latency_ms = (time.monotonic() - start) * 1000

    if r.status_code != 200:
        return {"response": f"ERROR {r.status_code}: {r.text[:200]}", "sources": []}, latency_ms

    return r.json(), latency_ms


def main(api_url: str, test_file: str):
    test_cases = []
    with open(test_file) as f:
        for line in f:
            line = line.strip()
            if line:
                test_cases.append(json.loads(line))

    print(f"\n{'='*70}")
    print(f"  GramSAMBANDH API Evaluation — {len(test_cases)} test cases")
    print(f"  API: {api_url}")
    print(f"{'='*70}\n")

    print("  Logging in...")
    try:
        token = login(api_url)
        print(f"  ✓ Authenticated\n")
    except Exception as e:
        print(f"  ✗ Auth failed: {e}")
        return 1

    results = []
    for tc in test_cases:
        query = tc["query"]
        data, latency_ms = run_chat(api_url, token, query)

        sources = data.get("sources", [])
        response = data.get("response", "")
        num_sources = len(sources)

        source_lbs = list({s.get("lb_name", "") for s in sources if s.get("lb_name")})
        source_projects = list({s.get("project_no", "") for s in sources if s.get("project_no")})

        # Check pass criteria
        passed = True
        failures = []

        min_results = tc.get("min_results", 1)
        if num_sources < min_results:
            passed = False
            failures.append(f"Only {num_sources} sources (need {min_results})")

        if "expected_lb_name" in tc and tc["expected_lb_name"] not in source_lbs:
            passed = False
            failures.append(f"LB mismatch: got {source_lbs}")

        if "expected_project_no" in tc and tc["expected_project_no"] not in source_projects:
            passed = False
            failures.append(f"Project mismatch: got {source_projects}")

        status = "PASS" if passed else "FAIL"
        icon = "✓" if passed else "✗"
        print(
            f"  {icon} [{status}] Test {tc['id']}: {query[:50]:<50} "
            f"({num_sources} sources, {latency_ms:.0f}ms)"
        )
        if not passed:
            for f_msg in failures:
                print(f"           {f_msg}")
        if response and not response.startswith("ERROR"):
            print(f"           Response: {response[:120]}...")

        results.append({
            "id": tc["id"],
            "query": query,
            "type": tc["query_type"],
            "passed": passed,
            "sources": num_sources,
            "latency_ms": round(latency_ms),
            "response_preview": response[:150],
            "failures": failures,
        })

    passed_count = sum(1 for r in results if r["passed"])
    total = len(results)
    avg_latency = sum(r["latency_ms"] for r in results) / total if total else 0

    print(f"\n{'='*70}")
    print(f"  Results: {passed_count}/{total} passed ({passed_count/total*100:.0f}%)")
    print(f"  Avg latency: {avg_latency:.0f}ms")
    print(f"{'='*70}\n")

    report_path = Path(test_file).parent / "eval_report_api.md"
    with open(report_path, "w") as f:
        f.write(f"# API Evaluation Report\n\n")
        f.write(f"**Date**: {time.strftime('%Y-%m-%d %H:%M')}\n")
        f.write(f"**Tests**: {passed_count}/{total} passed ({passed_count/total*100:.0f}%)\n")
        f.write(f"**Avg latency**: {avg_latency:.0f}ms\n\n")
        f.write("| # | Query | Type | Pass | Sources | Latency | Notes |\n")
        f.write("|---|-------|------|------|---------|---------|-------|\n")
        for r in results:
            status = "✓" if r["passed"] else "✗"
            notes = "; ".join(r["failures"]) if r["failures"] else "OK"
            f.write(
                f"| {r['id']} | {r['query'][:40]} | {r['type']} | {status} | "
                f"{r['sources']} | {r['latency_ms']}ms | {notes[:50]} |\n"
            )

    print(f"  Report written to {report_path}\n")
    return 0 if passed_count >= 8 else 1


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--api-url", default="http://localhost:8000")
    parser.add_argument(
        "--test-file",
        default=str(Path(__file__).parent / "test_cases.jsonl"),
    )
    args = parser.parse_args()
    sys.exit(main(args.api_url, args.test_file))
