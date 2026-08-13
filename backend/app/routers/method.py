"""What changed by year, read out of the database rather than written down.

Three things drift between a rebuild and a hand-written method note: how many
local bodies the source lists in each year, which boundary set each election
cycle is drawn on, and how much of each dataset a year actually holds. This
router computes all three from ``core``, ``finance`` and ``meetings`` at request
time, so the method page is a view of the build rather than a description of it.

The boundary section is the one part that is not a query. It comes from
``maps.LAYERS``, which is where the layer provenance already lives, so the map
and the method page cannot disagree about which cycle reuses which snapshot.

Not registered in ``main.py`` here by design; the routers are wired in one
place, deliberately.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from ..database import get_pool
from ..public import BUILD_DATE, DATASET, as_number, public_json, rate_limit
from .maps import LAYERS, WARD_GEOMETRY_NOTE

router = APIRouter(prefix="/api/method", tags=["public"], dependencies=[Depends(rate_limit)])

SOURCE = (
    "Gram Sambandh master database, built by sulekha from the Sulekha and "
    "Sakarma portal dumps and the State Election Commission's own exports"
)

# What the year-on-year diff can and cannot see. A body identified by its
# Sulekha entry that appears in one year and not the next left the portal's
# list; the source does not record whether it was created, merged, split or
# reclassified, and the page says so rather than picking one of the four.
BODY_DIFF_NOTE = (
    "A local body is counted in a year when the Sulekha portal lists it for that "
    "year. Entering and leaving are counted against the previous year's list. The "
    "portal records the list, not the reason it changed, so a body that leaves "
    "may have been merged, split, renamed or reclassified, and the four are not "
    "distinguishable here."
)

MEETINGS_COVERAGE_NOTE = (
    "Sakarma's record thins towards the start. A year with few meetings is a thin "
    "record, not a local body that did not meet."
)


async def _bodies_by_year(conn) -> list[dict]:
    """Bodies listed per financial year, with entries and departures.

    The diff is done here rather than in SQL because it is a set difference over
    fourteen small sets, and the SQL that expresses it is harder to read than
    the loop.
    """
    rows = await conn.fetch(
        "SELECT year_label, lb_key FROM core.lb_sulekha_year ORDER BY year_label, lb_key"
    )
    by_year: dict[str, set[int]] = {}
    for row in rows:
        by_year.setdefault(row["year_label"], set()).add(row["lb_key"])

    series: list[dict] = []
    previous: set[int] | None = None
    for year_label in sorted(by_year):
        current = by_year[year_label]
        series.append(
            {
                "year_label": year_label,
                "bodies": len(current),
                # Null in the first year: there is no earlier list to differ from,
                # and a zero there would read as "nothing changed".
                "entered": None if previous is None else len(current - previous),
                "left": None if previous is None else len(previous - current),
            }
        )
        previous = current
    return series


async def _dataset_coverage(conn) -> list[dict]:
    """Per year: what Sulekha holds and what Sakarma holds."""
    rows = await conn.fetch(
        """
        SELECT y.year_label,
               y.is_complete,
               coalesce(f.bodies, 0)      AS finance_bodies,
               coalesce(f.projects, 0)    AS projects,
               f.formulation              AS formulation,
               f.expense                  AS expense,
               coalesce(m.bodies, 0)      AS meeting_bodies,
               coalesce(m.meetings, 0)    AS meetings
        FROM core.financial_year y
        LEFT JOIN (
            SELECT year_label,
                   count(*)         AS bodies,
                   sum(projects)    AS projects,
                   sum(formulation) AS formulation,
                   sum(expense)     AS expense
            FROM finance.lb_year_summary
            GROUP BY year_label
        ) f USING (year_label)
        LEFT JOIN (
            SELECT year_label, count(*) AS bodies, sum(meetings) AS meetings
            FROM meetings.lb_year_summary
            GROUP BY year_label
        ) m USING (year_label)
        ORDER BY y.year_label
        """
    )
    return [
        {
            "year_label": r["year_label"],
            "is_complete": r["is_complete"],
            "finance_bodies": r["finance_bodies"],
            "projects": as_number(r["projects"]),
            "formulation": as_number(r["formulation"]),
            "expense": as_number(r["expense"]),
            "meeting_bodies": r["meeting_bodies"],
            "meetings": as_number(r["meetings"]),
        }
        for r in rows
    ]


def _boundary_vintage() -> list[dict]:
    """One entry per election cycle, from the layer inventory itself."""
    by_cycle: dict[int, dict] = {}
    for layer in LAYERS:
        cycle = layer["cycle"]
        entry = by_cycle.setdefault(
            cycle,
            {
                "cycle": cycle,
                "level": layer["level"],
                "source": layer["source"],
                "boundary_vintage": layer["boundary_vintage"],
                "per_cycle_delimitation": layer["per_cycle_delimitation"],
                "note": layer.get("note"),
            },
        )
        # Ward geometry is the finest level published for a cycle, and 2025 is
        # the only cycle that has any.
        if layer["level"] == "ward":
            entry["level"] = "ward"
    return [by_cycle[cycle] for cycle in sorted(by_cycle, reverse=True)]


@router.get("")
async def method(request: Request):
    pool = await get_pool()
    async with pool.acquire() as conn:
        bodies_by_year = await _bodies_by_year(conn)
        dataset_coverage = await _dataset_coverage(conn)
        manifest = await conn.fetchrow(
            """
            SELECT dataset, built_at, master_version, source_dumps,
                   bodies, projects, meetings, candidates
            FROM core.build_manifest
            ORDER BY built_at DESC
            LIMIT 1
            """
        )

    return public_json(
        request,
        {
            "build": {
                "dataset": manifest["dataset"],
                "built_at": manifest["built_at"],
                "master_version": manifest["master_version"],
                "source_dumps": list(manifest["source_dumps"]),
                "bodies": manifest["bodies"],
                "projects": manifest["projects"],
                "meetings": manifest["meetings"],
                "candidates": manifest["candidates"],
            },
            "bodies_by_year": bodies_by_year,
            "body_diff_note": BODY_DIFF_NOTE,
            "dataset_coverage": dataset_coverage,
            "meetings_coverage_note": MEETINGS_COVERAGE_NOTE,
            "boundary_vintage": _boundary_vintage(),
            "ward_geometry_note": WARD_GEOMETRY_NOTE,
            "provenance": {
                "dataset": DATASET,
                "build_date": BUILD_DATE,
                "source": SOURCE,
            },
        },
    )
