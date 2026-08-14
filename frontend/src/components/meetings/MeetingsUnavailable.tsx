/**
 * The two ways the endpoint answers with no meetings, kept apart on screen.
 *
 * `not_covered` is a local body Sakarma has never published a meeting for,
 * which the selector states above this. What it cannot say is how unusual that
 * is, so that is the sentence here. `no_record_for_year` is a body Sakarma does
 * publish, in a year it holds nothing for; the year control disables those
 * years, so this state is now reached only by a pasted link or a typed URL.
 *
 * One sentence either way. The page used to argue the point across three
 * paragraphs, which was the cost of a control that offered the combination in
 * the first place.
 */

import SourceLine from "@/components/shell/SourceLine";

import { bodyLabel, withFormattedYears, type MeetingsMissing } from "./payload";

export default function MeetingsUnavailable({ payload }: { payload: MeetingsMissing }) {
  const body = bodyLabel(payload.body);
  const notCovered = payload.reason_code === "not_covered";

  return (
    <section className="mt-s7" aria-label="Meetings">
      <p role="status" data-testid="unavailable-reason">
        {notCovered
          ? `Sakarma covers 1,200 of Kerala's 1,238 local bodies. ${body} is one of the 38 it does not cover.`
          : withFormattedYears(payload.reason)}
      </p>

      <SourceLine
        dataset={payload.provenance.dataset}
        build_date={payload.provenance.build_date}
        note={payload.provenance.source}
      />
    </section>
  );
}
