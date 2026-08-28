/**
 * How many meetings a local body recorded in one financial year, cut two ways.
 *
 * The two cuts answer different questions about the same meetings — who met,
 * and how the meeting was called — so both add back to the same total, and the
 * page shows the total once above them rather than implying four buckets.
 */

import SourceLine from "@/components/shell/SourceLine";
import { formatYearLabel } from "@/components/select/YearControl";

import styles from "./meetings.module.css";
import SplitBar from "./SplitBar";
import {
  bodyLabel,
  formatCount,
  GOVERNING_BODY_TERM,
  ORDINARY_TERM,
  shareOf,
  type MeetingsYear,
} from "./payload";

interface SplitProps {
  heading: string;
  majorName: string;
  /** The register's own Malayalam term for the major part, where it has one. */
  majorTerm?: string;
  major: number;
  minorName: string;
  minor: number;
  total: number;
}

function Split({
  heading,
  majorName,
  majorTerm,
  major,
  minorName,
  minor,
  total,
}: SplitProps) {
  return (
    <div className={styles.split}>
      <h3 className={styles.splitHead}>{heading}</h3>
      <SplitBar
        major={major}
        minor={minor}
        total={total}
        label={`${majorName}, ${shareOf(major, total)}. ${minorName}, ${shareOf(minor, total)}.`}
      />
      <ul className={styles.counts}>
        <li className={styles.countRow}>
          <span>
            {majorName}
            {majorTerm ? <span className={styles.countMl}> {majorTerm}</span> : null}
          </span>
          <span className={styles.countValue} data-numeric>
            {shareOf(major, total)}
          </span>
        </li>
        <li className={styles.countRow}>
          <span>{minorName}</span>
          <span className={styles.countValue} data-numeric>
            {shareOf(minor, total)}
          </span>
        </li>
      </ul>
    </div>
  );
}

export default function MeetingCounts({ payload }: { payload: MeetingsYear }) {
  const year = formatYearLabel(payload.year_label);

  return (
    <section className="mt-s7" aria-labelledby="meeting-counts-heading">
      <h2 className={styles.head} id="meeting-counts-heading">
        Meetings recorded, {bodyLabel(payload.body)}, {year}
      </h2>

      <p className={styles.total} data-numeric data-testid="meetings-total">
        {formatCount(payload.meetings)}
      </p>
      <p className={styles.totalLabel}>Meetings published by Sakarma</p>

      {payload.is_complete ? null : (
        <p className={styles.note}>
          {year} is still running, and meetings are still being added.
        </p>
      )}

      <Split
        heading="Governing body and standing committee"
        majorName="Governing body"
        majorTerm={GOVERNING_BODY_TERM}
        major={payload.governing_body}
        minorName="Standing committee"
        minor={payload.standing_committee}
        total={payload.meetings}
      />

      <Split
        heading="Ordinary and special"
        majorName="Ordinary"
        majorTerm={ORDINARY_TERM}
        major={payload.ordinary}
        minorName="Special"
        minor={payload.special}
        total={payload.meetings}
      />

      <p className={styles.rail}>
        Sakarma names the committee that met and how the meeting was called.
        Governing body counts the meetings marked {GOVERNING_BODY_TERM}, and
        standing committee counts every other committee. Ordinary counts the
        meetings marked {ORDINARY_TERM}, and special counts every other kind
        Sakarma names.
      </p>

      <SourceLine
        dataset={payload.provenance.dataset}
        build_date={payload.provenance.build_date}
        note={payload.provenance.source}
      />
    </section>
  );
}
