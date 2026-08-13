/**
 * The two ways the endpoint answers with no meetings, kept apart on screen.
 *
 * `not_covered` is a body Sakarma has never published a meeting for, which the
 * selector states before a visitor gets here. `no_record_for_year` is a body it
 * does publish, in a year it holds nothing for; the year control disables those
 * years, so this state is now reached only by a pasted link or a typed URL.
 * Both are absences in the portal, and neither is a count of zero meetings.
 *
 * One sentence for the year case. The page used to argue the point across three
 * paragraphs, which was the cost of a control that offered the combination in
 * the first place.
 */

import SourceLine from "@/components/shell/SourceLine";
import { formatYearLabel } from "@/components/select/YearControl";

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
      ) : null}

      <SourceLine
        dataset={payload.provenance.dataset}
        build_date={payload.provenance.build_date}
        note={payload.provenance.source}
      />
    </section>
  );
}
