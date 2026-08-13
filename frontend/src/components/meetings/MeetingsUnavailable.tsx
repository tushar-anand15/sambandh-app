/**
 * The two ways the endpoint answers with no meetings, kept apart on screen.
 *
 * `not_covered` is a body Sakarma has never published a meeting for.
 * `no_record_for_year` is a body it does publish, in a year it holds nothing
 * for. Both are absences in the portal. Neither is a count of zero meetings,
 * and rendering them the same would publish that count by implication.
 */

import SourceLine from "@/components/shell/SourceLine";
import { formatYearLabel } from "@/components/select/YearControl";

import CoverageNote from "./CoverageNote";
import { bodyLabel, withFormattedYears, type MeetingsMissing } from "./payload";

export default function MeetingsUnavailable({ payload }: { payload: MeetingsMissing }) {
  const year = formatYearLabel(payload.year_label);
  const body = bodyLabel(payload.body);
  const notCovered = payload.reason_code === "not_covered";

  return (
    <section className="mt-s7" aria-labelledby="meetings-unavailable-heading">
      <h2 id="meetings-unavailable-heading">
        {notCovered
          ? `No meeting record for ${body}`
          : `No meeting record for ${year}`}
      </h2>

      <p role="status" data-testid="unavailable-reason">
        {withFormattedYears(payload.reason)}
      </p>

      {notCovered ? (
        <p className="text-t3 text-ink-2">
          Sakarma&rsquo;s manifest covers 1,200 of Kerala&rsquo;s 1,238 local
          bodies, counted in the Gram Sambandh master database. {body} is one of
          the 38 it does not cover.
        </p>
      ) : (
        <>
          <p className="text-t3 text-ink-2">
            This is an absence in the portal&rsquo;s record. The register does
            not report that {body} held no meetings in {year}.
          </p>
          <CoverageNote />
        </>
      )}

      <SourceLine
        dataset={payload.provenance.dataset}
        build_date={payload.provenance.build_date}
        note={payload.provenance.source}
      />
    </section>
  );
}
