/**
 * Sign-ups by week.
 *
 * A table, not a chart. At this size the series is a dozen numbers and a reader
 * wants the number, not an impression of it — a bar chart of twelve integers
 * costs a dependency and returns a shape.
 *
 * Empty weeks are drawn as zero rather than omitted, because a gap in a series
 * reads as missing data when the true statement is that nobody signed up.
 */

import type { WeekCount } from "./types";

const WEEK_FORMAT = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
});

export function weekLabel(iso: string): string {
  const date = new Date(`${iso}T00:00:00`);
  return Number.isNaN(date.getTime()) ? iso : WEEK_FORMAT.format(date);
}

export default function SignupWeeks({ weeks }: { weeks: WeekCount[] }) {
  return (
    <section aria-labelledby="signups-heading">
      <h2 id="signups-heading">Sign-ups per week</h2>
      <table data-testid="signup-weeks">
        <caption className="label">Week beginning, and accounts created in it</caption>
        <thead>
          <tr>
            <th scope="col">Week beginning</th>
            <th scope="col">Sign-ups</th>
          </tr>
        </thead>
        <tbody>
          {weeks.map((week) => (
            <tr key={week.week}>
              <th scope="row">{weekLabel(week.week)}</th>
              <td>{week.signups}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
