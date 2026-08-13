/**
 * Every meeting the register holds for one body-year, in the order it holds
 * them.
 *
 * The category and nature cells carry the register's own Malayalam, with the
 * English reading under it. The Malayalam is what the source says; the English
 * is this site's gloss, and putting the gloss second keeps that order clear.
 *
 * A venue the register left blank is named as such. An empty cell would read as
 * a rendering fault, and a dash would read as a value.
 */

import SourceLine from "@/components/shell/SourceLine";
import { formatYearLabel } from "@/components/select/YearControl";

import styles from "./meetings.module.css";
import {
  categoryOf,
  formatCount,
  formatDate,
  natureOf,
  type MeetingRow,
  type MeetingsYear,
} from "./payload";

const NOT_RECORDED = "Not recorded in the register";

function Term({ source, gloss }: { source: string; gloss: string }) {
  return (
    <>
      {source}
      <span className={styles.gloss}>{gloss}</span>
    </>
  );
}

function Row({ row }: { row: MeetingRow }) {
  const date = formatDate(row.meeting_date);

  return (
    <tr>
      <td>
        {date ? (
          <time dateTime={row.meeting_date ?? undefined}>{date}</time>
        ) : (
          <span className={styles.absent}>{NOT_RECORDED}</span>
        )}
      </td>
      <td>
        <Term source={row.meeting_type} gloss={categoryOf(row.meeting_type)} />
      </td>
      <td>
        <Term source={row.meeting_nature} gloss={natureOf(row.meeting_nature)} />
      </td>
      <td>
        {row.venue ? row.venue : <span className={styles.absent}>{NOT_RECORDED}</span>}
      </td>
      <td>
        {row.meeting_no ? (
          row.meeting_no
        ) : (
          <span className={styles.absent}>{NOT_RECORDED}</span>
        )}
      </td>
    </tr>
  );
}

export default function MeetingList({ payload }: { payload: MeetingsYear }) {
  const year = formatYearLabel(payload.year_label);
  const first = formatDate(payload.first_meeting);
  const last = formatDate(payload.last_meeting);
  const rows = payload.meeting_rows;

  return (
    <section className="mt-s7" aria-labelledby="meeting-list-heading">
      <h2 id="meeting-list-heading">Every meeting recorded in {year}</h2>

      <p className="text-t3 text-ink-2">
        {formatCount(rows.length)} meetings
        {first && last ? `, ${first} to ${last}` : null}.
      </p>

      <div className={styles.tableWrap}>
        <table className={styles.table} aria-labelledby="meeting-list-heading">
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Category</th>
              <th scope="col">Nature</th>
              <th scope="col">Venue</th>
              <th scope="col">Number in the register</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <Row key={`${row.meeting_date}-${row.meeting_no}-${index}`} row={row} />
            ))}
          </tbody>
        </table>
      </div>

      <SourceLine
        dataset={payload.provenance.dataset}
        build_date={payload.provenance.build_date}
        note={payload.provenance.source}
      />
    </section>
  );
}
