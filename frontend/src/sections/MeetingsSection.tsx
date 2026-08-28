import { useState } from "react";
import { useParams } from "react-router-dom";

import BodySelector from "@/components/select/BodySelector";
import CoverageNote from "@/components/meetings/CoverageNote";
import MeetingCounts from "@/components/meetings/MeetingCounts";
import MeetingList from "@/components/meetings/MeetingList";
import MeetingsUnavailable from "@/components/meetings/MeetingsUnavailable";
import RegisterDrawer from "@/components/meetings/RegisterDrawer";
import ScopeNote from "@/components/meetings/ScopeNote";
import {
  formatDate,
  type BodyBlock,
  type DocumentKind,
  type MeetingRow,
} from "@/components/meetings/payload";
import { formatYearLabel } from "@/components/select/YearControl";
import type { RegisterRequest } from "@/components/meetings/useRegister";
import { useMeetingsYear } from "@/components/meetings/useMeetingsYear";
import styles from "@/components/meetings/meetings.module.css";

/**
 * The page's own headline, in the client's construction. Before a body is
 * chosen there is no name for the council, and the sentence is written about a
 * local body rather than left as the section's name.
 */
function headline(body: BodyBlock | undefined): string {
  const whose = body ? `${body.lb_name_en}'s` : "a local body's";
  return `When ${whose} council met, and what it wrote down`;
}

/** "Meetings · Amboori Grama Panchayat · 2023–24". */
function eyebrow(body: BodyBlock | undefined, yearLabel: string): string {
  return [
    "Meetings",
    body ? `${body.lb_name_en} ${body.lb_type}` : null,
    yearLabel ? formatYearLabel(yearLabel) : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

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
 * What was decided is the other half of the register, and it is here: each row
 * of the list opens the decision register or the minutes Sakarma published for
 * that meeting, in a panel. The documents are fetched one at a time — a
 * body-year runs to a few hundred meetings and each file is 100 to 400 KB.
 */
export default function MeetingsSection() {
  const params = useParams();
  const lbCode = params.lb ?? "";
  const yearLabel = params.year ?? "";
  const state = useMeetingsYear(lbCode, yearLabel);

  // Which document is open, and the words naming it. Held here rather than in
  // the list so closing the panel does not re-render the table.
  const [open, setOpen] = useState<{ request: RegisterRequest; label: string } | null>(
    null,
  );

  const openDocument = (row: MeetingRow, kind: DocumentKind) => {
    const date = formatDate(row.meeting_date);
    setOpen({
      request: { meetingId: row.meeting_id, kind },
      label: [date, row.meeting_no ? `meeting ${row.meeting_no}` : null]
        .filter(Boolean)
        .join(", "),
    });
  };

  const body = state.status === "ready" || state.status === "missing"
    ? state.payload.body
    : undefined;

  return (
    <div className="shell-container section-page">
      <p className={styles.eyebrow}>{eyebrow(body, yearLabel)}</p>
      <h1 className={styles.headline}>{headline(body)}</h1>
      <p className="lede">
        Every meeting the council recorded for the year, and whether it
        published the minutes.
      </p>
      <BodySelector section="meetings" />

      {state.status === "ready" ? <ScopeNote note={state.payload.scope_note} /> : null}

      {state.status === "idle" ? (
        <p className="selector-status">
          Choose a district, a local body and a financial year.
        </p>
      ) : null}

      {state.status === "loading" ? (
        <p className="selector-status" aria-busy="true">
          Loading the meetings.
        </p>
      ) : null}

      {state.status === "error" ? (
        <p className="notice" role="alert">
          {state.message} Reload the page to try again.
        </p>
      ) : null}

      {state.status === "missing" ? <MeetingsUnavailable payload={state.payload} /> : null}

      {state.status === "ready" ? (
        <>
          <MeetingCounts payload={state.payload} />
          <CoverageNote />
          <MeetingList payload={state.payload} onOpen={openDocument} />
        </>
      ) : null}

      <RegisterDrawer
        request={open?.request ?? null}
        label={open?.label ?? ""}
        onClose={() => setOpen(null)}
      />
    </div>
  );
}
