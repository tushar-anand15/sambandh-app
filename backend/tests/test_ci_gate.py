"""The deploy cannot run without the tests.

Until 13 August 2026 a push to main went straight to the production VM: pull,
build, restart, no test run anywhere in front of it. The gate that now stands
there is one `needs:` line, which is exactly the kind of line a later edit
removes without anyone noticing, because nothing breaks until the day something
does. So it is asserted.

These tests read the workflow files rather than running them. What they can
prove is the dependency: the deploy job declares a need on the test job, and the
test job is this repository's test workflow rather than a stub. What they cannot
prove is that GitHub honours a `needs:` — that is GitHub's own contract, and the
empirical check is in the unit's report: a planted failing test turns both
suites red, and a red required job leaves `deploy` skipped.
"""

from __future__ import annotations

from pathlib import Path

import pytest
import yaml

WORKFLOWS = Path(__file__).resolve().parents[2] / ".github" / "workflows"


def load(name: str) -> dict:
    return yaml.safe_load((WORKFLOWS / name).read_text())


@pytest.fixture(scope="module")
def deploy() -> dict:
    return load("deploy.yml")


@pytest.fixture(scope="module")
def tests() -> dict:
    return load("test.yml")


def test_the_deploy_job_needs_the_test_job(deploy):
    needs = deploy["jobs"]["deploy"]["needs"]
    needs = [needs] if isinstance(needs, str) else needs

    assert "test" in needs, "deploy must not start before the suite has passed"


def test_the_test_job_calls_this_repository_s_test_workflow(deploy):
    assert deploy["jobs"]["test"]["uses"] == "./.github/workflows/test.yml"


def test_the_test_workflow_is_callable_and_runs_on_pushes_and_pull_requests(tests):
    # PyYAML reads a bare `on:` key as the boolean True. The workflow's triggers
    # live under it either way.
    triggers = tests.get("on", tests.get(True))

    assert "workflow_call" in triggers, "deploy.yml cannot call it otherwise"
    assert "push" in triggers
    assert "pull_request" in triggers


def test_all_three_suites_run_in_the_gate(tests):
    jobs = tests["jobs"]
    assert set(jobs) == {"backend", "frontend", "e2e"}

    commands = "\n".join(
        step.get("run", "") for job in jobs.values() for step in job["steps"]
    )
    assert "uv run pytest" in commands
    assert "npm run test" in commands
    assert "npm run test:e2e" in commands


def test_the_backend_job_has_a_database_to_run_against(tests):
    backend = tests["jobs"]["backend"]

    # Every backend test in this suite is a query against the fixture slice.
    # Without a Postgres service the job fails at collection, which would be a
    # red gate for the wrong reason.
    assert "postgres-test" in backend["services"]
    assert "55433" in backend["env"]["TEST_DATABASE_URL"]
