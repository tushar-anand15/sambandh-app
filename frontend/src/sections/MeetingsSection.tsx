import { useParams } from "react-router-dom";

import BodySelector from "@/components/select/BodySelector";
import CoverageNote from "@/components/meetings/CoverageNote";
import MeetingCounts from "@/components/meetings/MeetingCounts";
import MeetingList from "@/components/meetings/MeetingList";
import MeetingsUnavailable from "@/components/meetings/MeetingsUnavailable";
import ScopeNote from "@/components/meetings/ScopeNote";
import { useMeetingsYear } from "@/components/meetings/useMeetingsYear";

/**
 * The Meetings section.
 *
 * A body and a financial year come from the URL, and everything below the
 * selector is one call to `/api/meetings/{lb_code}/{year_label}`. That endpoint
 * answers four ways — a 404, a body Sakarma does not cover, a covered body with
 * nothing for the year, and counts — and each gets its own words here. The
 * cheap version of this page treats the last three as an empty list, which
 * publishes the claim that the local body did not meet.
 *
 * Resolutions are the other half of the register and are not in this release.
 * The scope note says so on every state of the page, not only where figures
 * appear.
 */
export default function MeetingsSection() {
  const params = useParams();
  const lbCode = params.lb ?? "";
  const yearLabel = params.year ?? "";
  const state = useMeetingsYear(lbCode, yearLabel);

  return (
    <div className="shell-container section-page">
      <h1>Meetings</h1>
      <p className="lede">
        Meetings held, by category and by nature, from the Sakarma meeting manifest.
      </p>
      <BodySelector section="meetings" />

      <ScopeNote note={state.status === "ready" ? state.payload.scope_note : undefined} />

      {state.status === "idle" ? (
        <p className="selector-status">
          Choose a district, a local body and a financial year to see what the
          register holds for that year.
        </p>
      ) : null}

      {state.status === "loading" ? (
        <p className="selector-status" aria-busy="true">
          Loading the meeting record.
        </p>
      ) : null}

      {state.status === "not-found" ? (
        <p className="notice" role="alert">
          No local body has the code {state.lbCode}, so there is no meeting
          record to show.
        </p>
      ) : null}

      {state.status === "error" ? (
        <p className="notice" role="alert">
          {state.message} Reloading the page requests it again.
        </p>
      ) : null}

      {state.status === "missing" ? <MeetingsUnavailable payload={state.payload} /> : null}

      {state.status === "ready" ? (
        <>
          <MeetingCounts payload={state.payload} />
          <CoverageNote />
          <MeetingList payload={state.payload} />
        </>
      ) : null}
    </div>
  );
}
