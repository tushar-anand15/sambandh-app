/**
 * The whole state's result for one cycle, in four distributions.
 *
 * It lives under `components/elections/` rather than under `components/home/`
 * for a reason that is not filing: the accent lint in `tokens.test.ts` scans
 * this directory for `var(--accent)` used as a fill, stroke, background or
 * border, and the accent is a navy that reads as a fifth front beside UDF
 * blue. A component drawing election data from anywhere else would draw it
 * with no lint over it at all. The same component serves the home page and the
 * elections page, so there is one set of statewide figures on the site.
 *
 * Every one of the four carries the denominator it is a share of, because
 * 1,033, 1,199 and 1,238 are all correct counts of Kerala's local governments
 * and a bare percentage would not say which one is underneath it. Seats are
 * over the seats the Commission reported; margins and reservation over the
 * ward rows; control over the bodies with a result.
 *
 * A cycle the Commission published nothing for is a stated absence, not an
 * empty table: the endpoint answers 200 with nulls throughout and its own
 * sentence, and that sentence is what appears here.
 */

import styles from "./elections.module.css";
import { formatCount, frontToken } from "./payload";
import { statewideShare, useStatewide, type StatewidePayload } from "./useStatewide";

interface StatewideBlockProps {
  cycle: number;
  /** Named so the home page and the elections page can head it differently. */
  heading?: string;
  /** Anchors the three sample questions on the home page point at. */
  controlId?: string;
  marginsId?: string;
}

/** Ward seats by front, with the swatch the map and the legend use. */
function Seats({ payload }: { payload: StatewidePayload }) {
  return (
    <div className={styles.statewideGroup}>
      <h3 className={styles.statewideHead}>Ward seats by front</h3>
      <p className={styles.layerMeta}>
        {formatCount(payload.seats_total)} seats the Commission reported across{" "}
        {formatCount(payload.bodies_with_result)} local governments. A rural voter
        elects three councils over the same ground, so seats outnumber wards on a
        map of Kerala.
      </p>
      <table className="data-table">
        <thead>
          <tr>
            <th scope="col">Front</th>
            <th scope="col" className="num">
              Seats
            </th>
            <th scope="col" className="num">
              Share
            </th>
          </tr>
        </thead>
        <tbody>
          {payload.seats.map((row) => (
            <tr key={row.front}>
              <td className={styles.nowrap}>
                <span
                  className={styles.partyDot}
                  style={{ backgroundColor: `var(--${frontToken(row.front)})` }}
                />
                {row.front}
              </td>
              <td className="num">{formatCount(row.seats)}</td>
              <td className="num">{statewideShare(row.share)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Winning margins in bands of votes. The finest band the endpoint cuts is 50. */
function Margins({ payload, id }: { payload: StatewidePayload; id?: string }) {
  return (
    <div className={styles.statewideGroup} id={id}>
      <h3 className={styles.statewideHead}>Wards by winning margin</h3>
      <p className={styles.layerMeta}>
        Shares of the {formatCount(payload.wards_counted)} wards with a published
        ward result. The margin is the winner's votes less the runner-up's, so a
        ward nobody contested has none.
      </p>
      <table className="data-table">
        <thead>
          <tr>
            <th scope="col">Margin</th>
            <th scope="col" className="num">
              Wards
            </th>
            <th scope="col" className="num">
              Share
            </th>
          </tr>
        </thead>
        <tbody>
          {payload.margins.map((band) => (
            <tr key={band.key}>
              <td>{band.label}</td>
              <td className="num">{formatCount(band.wards)}</td>
              <td className="num">{statewideShare(band.share)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** How a council is held, not by whom. The Commission's own three words. */
function Control({ payload, id }: { payload: StatewidePayload; id?: string }) {
  const hung = payload.control.find((row) => row.control_type === "hung");
  const tie = payload.control.find((row) => row.control_type === "tie");
  const noMajority = (hung?.bodies ?? 0) + (tie?.bodies ?? 0);

  return (
    <div className={styles.statewideGroup} id={id}>
      <h3 className={styles.statewideHead}>Councils by control</h3>
      <p className={styles.layerMeta}>
        Shares of the {formatCount(payload.bodies_with_result)} local governments
        with a result for {payload.cycle}. {formatCount(noMajority)} of them came
        out of the election with no front holding a majority.
      </p>
      <table className="data-table">
        <thead>
          <tr>
            <th scope="col">Control</th>
            <th scope="col" className="num">
              Councils
            </th>
            <th scope="col" className="num">
              Share
            </th>
          </tr>
        </thead>
        <tbody>
          {payload.control.map((row) => (
            <tr key={row.control_type}>
              <td>{CONTROL_LABEL[row.control_type] ?? row.control_type}</td>
              <td className="num">{formatCount(row.bodies)}</td>
              <td className="num">{statewideShare(row.share)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The Commission's own words, sentence-cased. "unstated" is the fourth case
 * and is kept in the table rather than dropped, so the four sum to the bodies.
 */
const CONTROL_LABEL: Record<string, string> = {
  majority: "Clear majority",
  hung: "Hung",
  tie: "Tied",
  unstated: "Not stated by the Commission",
};

function Reservation({ payload }: { payload: StatewidePayload }) {
  return (
    <div className={styles.statewideGroup}>
      <h3 className={styles.statewideHead}>Ward seats by reservation</h3>
      <p className={styles.layerMeta}>
        Shares of the {formatCount(payload.wards_counted)} wards with a published
        ward result, under the reservation each seat was notified with.
      </p>
      <table className="data-table">
        <thead>
          <tr>
            <th scope="col">Reserved for</th>
            <th scope="col" className="num">
              Wards
            </th>
            <th scope="col" className="num">
              Share
            </th>
          </tr>
        </thead>
        <tbody>
          {payload.reservation.map((row) => (
            <tr key={row.reservation}>
              <td>{row.reservation}</td>
              <td className="num">{formatCount(row.wards)}</td>
              <td className="num">{statewideShare(row.share)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function StatewideBlock({
  cycle,
  heading = `Kerala's whole result, ${cycle}`,
  controlId,
  marginsId,
}: StatewideBlockProps) {
  const state = useStatewide(cycle);

  return (
    <section aria-labelledby="statewide-heading" data-testid="statewide">
      <h2 className="section-head" id="statewide-heading">
        {heading}
      </h2>

      {state.status === "loading" ? (
        <p className="selector-status" aria-busy="true">
          Reading the {cycle} result for every local government.
        </p>
      ) : null}

      {state.status === "error" ? (
        <p className="notice" role="alert">
          {state.message} The same figures are on <a href="/elections">Elections</a>.
        </p>
      ) : null}

      {state.status === "ready" && !state.payload.available ? (
        <p className="notice" role="status">
          {state.payload.reason}
        </p>
      ) : null}

      {state.status === "ready" && state.payload.available ? (
        <div className={styles.statewide}>
          <Seats payload={state.payload} />
          <Margins payload={state.payload} id={marginsId} />
          <Control payload={state.payload} id={controlId} />
          <Reservation payload={state.payload} />
        </div>
      ) : null}
    </section>
  );
}
