/**
 * The provenance line that sits under every panel of data on the site.
 *
 * Every public endpoint returns `{ dataset, build_date }`. This component is
 * how that promise becomes visible: a page renders data by passing the
 * provenance it was handed, so a panel that shows a number and no source is a
 * missing prop rather than a missing habit. That is the whole point — R9 holds
 * by construction, not by anyone remembering to write the attribution.
 */

export interface Provenance {
  /** Name of the dataset the figures came from. */
  dataset: string;
  /**
   * ISO date the dataset snapshot was built. Null where the source publishes
   * no build stamp — a real case, not a defensive one, and the reason this
   * component owns the separator rather than the caller.
   */
  build_date: string | null;
}

interface SourceLineProps extends Provenance {
  /** Optional extra clause, e.g. a portal name or a licence. */
  note?: string;
  className?: string;
}

/**
 * "2026-08-13" reads as "13 August 2026". A value that is not an ISO date is
 * passed through untouched rather than rendered as "Invalid Date" — an odd
 * stamp from upstream should still be legible to whoever has to chase it.
 */
function formatBuildDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return value;

  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export default function SourceLine({
  dataset,
  build_date,
  note,
  className,
}: SourceLineProps) {
  // Built from the parts that exist, then joined — the separator cannot
  // outlive the value it separates.
  const parts: string[] = [dataset];
  if (note) parts.push(note);

  return (
    <p
      className={["source-line", className].filter(Boolean).join(" ")}
      data-testid="source-line"
    >
      {parts.join(" · ")}
      {build_date ? (
        <>
          {" · Built "}
          <time dateTime={build_date}>{formatBuildDate(build_date)}</time>
        </>
      ) : null}
    </p>
  );
}
