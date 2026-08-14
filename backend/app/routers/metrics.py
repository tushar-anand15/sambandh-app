"""Internal metrics — the one read endpoint on this site that is not public.

Everything else the revamp adds answers without a token, because the records are
public. This does not: it counts people, not panchayats, and the numbers behind
it (who signed up, how many questions were asked) are the project's own
operational data rather than anybody's public record.

It reads ``users``, ``chats`` and ``chat_messages`` directly rather than asking
the analytics service, because no client-side tool knows what a sign-up is.
Umami sees routes and downloads; only these tables see accounts and questions.

The figure to watch is ``out_of_index_share``. The assistant refuses questions
about bodies its corpus does not hold. If the share of refusals climbs, readers
are asking about places outside Thrissur, and that is the argument for extending
the ingest — not a bug in the assistant.

Nothing here returns a row about an individual: no email, no name, no question
text, no user id. Every number is an aggregate, and the tests assert that.
"""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from ..auth import get_current_user
from ..database import get_pool

router = APIRouter(prefix="/api/metrics", tags=["metrics"])

# What counts as a refusal for being out of index.
#
# It is a text match, and deliberately so: the refusal is produced by the model
# from the system prompt, so there is no flag on the row to read. The markers
# are the load-bearing phrases of that refusal — a statement that the records
# held stop at a named coverage. Widening the prompt's wording means widening
# this pattern, and the test file plants messages in both registers so a drift
# shows up as a failing count rather than as a quietly falling rate.
REFUSAL_PATTERN = (
    r"(outside (the |its |my )?(records|index|coverage|corpus)"
    r"|not (in|within) (the|its|my) (index|corpus|records)"
    r"|do(es)? not (hold|cover)"
    r"|only (hold|cover|have)s? (records|documents|projects)?.{0,40}thrissur"
    r"|coverage (is |stops |ends )?.{0,30}thrissur)"
)

# Sign-ups are reported by week rather than by day because a day is mostly
# zeroes at this size and a month hides the effect of anything anybody did.
DEFAULT_WEEKS = 12


class WeekCount(BaseModel):
    """One ISO week, named by the Monday it starts on."""

    week: date
    signups: int


class AssistantHealth(BaseModel):
    answers: int
    out_of_index_refusals: int
    #: Refusals as a share of assistant answers, 0.0–1.0. ``None`` when the
    #: assistant has answered nothing at all, because a share of zero answers is
    #: not zero — it is unknown, and drawing it as 0% would be a claim.
    out_of_index_share: float | None


class MetricsResponse(BaseModel):
    weeks: int
    signups_per_week: list[WeekCount]
    signups_total: int
    users_total: int
    questions_asked: int
    saved_chats: int
    returning_users: int
    assistant: AssistantHealth


SIGNUPS_SQL = """
    SELECT date_trunc('week', created_at)::date AS week, count(*)::int AS signups
    FROM users
    WHERE created_at >= date_trunc('week', now()) - make_interval(weeks => $1 - 1)
    GROUP BY 1
    ORDER BY 1
"""

# A returning user is one who asked something on more than one calendar day.
# Two questions in one sitting is one visit; coming back a week later is the
# thing worth counting, and it is the strongest signal this project has that the
# assistant was useful rather than merely tried.
RETURNING_SQL = """
    SELECT count(*)::int FROM (
        SELECT c.user_id
        FROM chat_messages m
        JOIN chats c ON c.id = m.chat_id
        WHERE m.role = 'user'
        GROUP BY c.user_id
        HAVING count(DISTINCT m.created_at::date) > 1
    ) AS repeat_visitors
"""

ASSISTANT_SQL = """
    SELECT
        count(*)::int AS answers,
        count(*) FILTER (WHERE content ~* $1)::int AS refusals
    FROM chat_messages
    WHERE role = 'assistant'
"""


@router.get("", response_model=MetricsResponse)
async def metrics(
    weeks: int = Query(DEFAULT_WEEKS, ge=1, le=104),
    _user: dict = Depends(get_current_user),
) -> MetricsResponse:
    """Sign-ups, questions, saved chats, returning readers and refusal rate.

    Empty weeks are filled in rather than omitted: a gap in a series drawn from
    the rows that exist reads as "no data", and the true statement is "nobody
    signed up that week".
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        signup_rows = await conn.fetch(SIGNUPS_SQL, weeks)
        users_total = await conn.fetchval("SELECT count(*)::int FROM users")
        questions = await conn.fetchval(
            "SELECT count(*)::int FROM chat_messages WHERE role = 'user'"
        )
        saved_chats = await conn.fetchval("SELECT count(*)::int FROM chats")
        returning = await conn.fetchval(RETURNING_SQL)
        assistant = await conn.fetchrow(ASSISTANT_SQL, REFUSAL_PATTERN)

    counted = {row["week"]: row["signups"] for row in signup_rows}
    series = [
        WeekCount(week=week, signups=counted.get(week, 0))
        for week in _recent_weeks(weeks)
    ]

    answers = assistant["answers"]
    refusals = assistant["refusals"]

    return MetricsResponse(
        weeks=weeks,
        signups_per_week=series,
        signups_total=sum(entry.signups for entry in series),
        users_total=users_total,
        questions_asked=questions,
        saved_chats=saved_chats,
        returning_users=returning,
        assistant=AssistantHealth(
            answers=answers,
            out_of_index_refusals=refusals,
            out_of_index_share=(refusals / answers) if answers else None,
        ),
    )


def _recent_weeks(weeks: int) -> list[date]:
    """The Mondays of the last ``weeks`` weeks, oldest first, this week last."""
    from datetime import timedelta

    today = date.today()
    monday = today - timedelta(days=today.weekday())
    return [monday - timedelta(weeks=back) for back in range(weeks - 1, -1, -1)]
