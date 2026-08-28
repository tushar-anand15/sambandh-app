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
 *
 * The last column opens what the council published. Sakarma holds a decision
 * register and minutes for 420,561 of the 443,235 meetings in the manifest; a
 * meeting it holds neither for says so in the cell rather than showing a button
 * that would open an empty panel.
 */

import SourceLine from "@/components/shell/SourceLine";
import { formatYearLabel } from "@/components/select/YearControl";

import styles from "./meetings.module.css";
import {
  categoryOf,
  DOCUMENT_LABEL,
  formatCount,
  formatDate,
  natureOf,
  type DocumentKind,
  type MeetingRow,
  type MeetingsYear,
} from "./payload";

const NOT_RECORDED = "Not recorded";

/** Sakarma published neither document for this meeting. */
const NO_DOCUMENT = "No document available";

function Term({ source, gloss }: { source: string; gloss: string }) {
  return (
    <>
      {source}
      <span className={styles.gloss}>{gloss}</span>
    </>
  );
}

interface RowProps {
  row: MeetingRow;
  onOpen: (row: MeetingRow, kind: DocumentKind) => void;
}

function Row({ row, onOpen }: RowProps) {
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
      <td>
        {row.documents.length === 0 ? (
          <span className={styles.absent}>{NO_DOCUMENT}</span>
        ) : (
          <span className={styles.documents}>
            {row.documents.map((kind) => (
              <button
                key={kind}
                type="button"
                className={styles.documentButton}
                onClick={() => onOpen(row, kind)}
              >
                Read the {DOCUMENT_LABEL[kind].toLowerCase()}
              </button>
            ))}
          </span>
        )}
      </td>
    </tr>
  );
}

interface MeetingListProps {
  payload: MeetingsYear;
  /** Opens the panel holding one meeting's own document. */
  onOpen: (row: MeetingRow, kind: DocumentKind) => void;
}

export default function MeetingList({ payload, onOpen }: MeetingListProps) {
  const year = formatYearLabel(payload.year_label);
  const first = formatDate(payload.first_meeting);
  const last = formatDate(payload.last_meeting);
  const rows = payload.meeting_rows;

  return (
    <section className="mt-s7" aria-labelledby="meeting-list-heading">
      <h2 className={styles.head} id="meeting-list-heading">
        Every meeting recorded in {year}
      </h2>

      <p className={styles.note}>
        {formatCount(rows.length)} meetings
        {first && last ? `, ${first} to ${last}` : null}.
      </p>

      <div className="data-table-scroll">
        <table className={`data-table ${styles.dateColumn}`} aria-labelledby="meeting-list-heading">
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Category</th>
              <th scope="col">Nature</th>
              <th scope="col">Venue</th>
              <th scope="col">Meeting number</th>
              <th scope="col">Document</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <Row
                key={`${row.meeting_id}-${index}`}
                row={row}
                onOpen={onOpen}
              />
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
