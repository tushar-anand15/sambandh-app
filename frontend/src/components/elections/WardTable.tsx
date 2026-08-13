/**
 * Every ward of one body-cycle, in the order the commission numbers them.
 *
 * The table and the map are one selection, not two. A row click selects the
 * same ward a tile click does, and the selected row carries `aria-selected`,
 * so a reader working down the table and a reader working across the map end
 * up at the same result panel.
 *
 * A ward the commission recorded as uncontested has no runner-up and so no
 * margin. That cell says uncontested rather than showing a zero, which would
 * read as a margin of nothing.
 */

import SourceLine from "@/components/shell/SourceLine";

import styles from "./elections.module.css";
import {
  formatCount,
  frontToken,
  type CycleResult,
  type WardRow,
} from "./payload";

interface WardTableProps {
  result: CycleResult;
  selectedWard: number | null;
  onSelect: (ward: number) => void;
}

function Row({
  ward,
  selected,
  onSelect,
}: {
  ward: WardRow;
  selected: boolean;
  onSelect: (ward: number) => void;
}) {
  return (
    <tr
      className={[styles.row, selected ? styles.rowSelected : ""].filter(Boolean).join(" ")}
      aria-selected={selected}
      onClick={() => ward.ward_no !== null && onSelect(ward.ward_no)}
    >
      <td className={styles.numeric}>{formatCount(ward.ward_no)}</td>
      <td>{ward.ward_name ?? <span className={styles.absent}>Unnamed in the source</span>}</td>
      <td>{ward.winner_name ?? <span className={styles.absent}>Not named in the source</span>}</td>
      <td>
        <span
          className={styles.partyDot}
          style={{ backgroundColor: `var(--${frontToken(ward.winner_front)})` }}
        />
        {ward.winner_party ?? <span className={styles.absent}>Not stated</span>}
      </td>
      <td className={styles.numeric}>{formatCount(ward.winner_votes)}</td>
      <td className={styles.numeric}>
        {ward.uncontested ? (
          <span className={styles.absent}>Uncontested</span>
        ) : (
          formatCount(ward.margin)
        )}
      </td>
      <td>{ward.reservation ?? "—"}</td>
    </tr>
  );
}

export default function WardTable({ result, selectedWard, onSelect }: WardTableProps) {
  const name = [result.body.lb_name_en ?? result.lb_code, result.body.lb_type]
    .filter(Boolean)
    .join(" ");
  const title = `Ward results, ${name}, ${result.cycle}`;

  return (
    <section aria-label={title}>
      <h2>{title}</h2>
      <p className={styles.layerMeta}>
        {formatCount(result.wards.length)} wards. Votes are the count the commission
        published for the winning candidate; the margin is the winner's votes less
        the runner-up's.
      </p>
      <div className={styles.tableScroll}>
        <table className={styles.table} aria-label={title}>
          <thead>
            <tr>
              <th scope="col" className={styles.numeric}>
                Ward
              </th>
              <th scope="col">Name</th>
              <th scope="col">Winner</th>
              <th scope="col">Party</th>
              <th scope="col" className={styles.numeric}>
                Votes
              </th>
              <th scope="col" className={styles.numeric}>
                Margin
              </th>
              <th scope="col">Reservation</th>
            </tr>
          </thead>
          <tbody>
            {result.wards.map((ward) => (
              <Row
                key={ward.ward_code ?? String(ward.ward_no)}
                ward={ward}
                selected={ward.ward_no !== null && ward.ward_no === selectedWard}
                onSelect={onSelect}
              />
            ))}
          </tbody>
        </table>
      </div>
      <p className={styles.layerMeta}>
        The margin as a share of valid votes is in the result panel. The commission
        publishes no turnout figure per ward, so that share is of the votes counted.
      </p>
      <SourceLine
        dataset={result.provenance.dataset}
        build_date={result.provenance.build_date}
        note={result.provenance.source}
      />
    </section>
  );
}
