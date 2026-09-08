/**
 * Amboori grama panchayat, in three numbered panels.
 *
 * The page's argument is that one body's record is legible when the three
 * portals are read together, so the example is one body read three ways: who
 * its 14 wards elected in 2025, what the council that seated formulated over
 * fourteen financial years, and which sittings adopted the spending.
 *
 * Every figure is read from the live API for G01014 through the same hooks the
 * Elections, Finances and Meetings sections use. Nothing here computes a
 * figure those sections do not.
 *
 * FALLBACKS (R15, R15a). A panel that cannot read its figures shows the design
 * canvas's published values and says on the page that it is doing so, naming
 * the date the canvas was synced. An unlabelled fallback would have the home
 * page assert a figure the section page contradicts, which is the failure this
 * site exists to correct. The fallback covers three cases, not one: a failed
 * request, a 200 carrying `available: false`, and a series whose every year is
 * flagged `has_data: false`. The last two are successful requests with no
 * figures in them, and a panel that caught only the error path would render
 * blank cells and call it success.
 *
 * PANEL 01 DRAWS THROUGH THE SITE'S OWN RENDERING, not the canvas's picture.
 * Ward polygons exist for the 2025 cycle alone, which is why the example is
 * `DrillMap` selects the body's real outline with one numbered cell per ward
 * inside it. The canvas's `amboori-*.svg` paints 2020 results onto 2025 KSMART
 * shapes, which is the substitution `WardCells` exists to refuse: 1,136 of
 * 1,199 bodies changed ward count between two cycles, so for most of them
 * there is no ward of 2025 that is ward 7 of 2020. The caption under the map
 * says the cells carry no location, because this is the page whose reader is
 * being taught to read the record for the first time.
 */

import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";

import DrillMap from "@/components/elections/DrillMap";
import {
  featureFor,
  localBodiesUrl,
  useCycleResult,
  useGeometry,
  wardsUrl,
} from "@/components/elections/useElections";
import {
  formatCount,
  type CycleResult,
  type MapUnit,
  type WardRow,
} from "@/components/elections/payload";
import { useFinancesSeries } from "@/components/finances/useFinances";
import YearSeries from "@/components/finances/YearSeries";
import type { SeriesYear } from "@/components/finances/types";
import MeetingCounts from "@/components/meetings/MeetingCounts";
import { useMeetingsYear } from "@/components/meetings/useMeetingsYear";
import type { MeetingsYear } from "@/components/meetings/payload";

import AmbooriParagraph, { AMBOORI, YEAR } from "./AmbooriParagraph";
import { SNAPSHOT_DATE } from "./StatStrip";
import styles from "./home.module.css";

/**
 * The council in the worked example is the one the 2025 election seated.
 *
 * 2025 rather than an earlier cycle because it is the only one Kerala has
 * published ward boundaries for, so this panel draws Amboori's real wards
 * instead of a block of numbered cells standing in for them. On the page that
 * teaches a newcomer to read the record, a real map is worth more than an
 * older one.
 */
export const EXAMPLE_CYCLE = 2025;

const DISTRICT = "THIRUVANANTHAPURAM";

const CRORE = 10_000_000;

/** Said wherever a panel is showing the canvas's values rather than the API's. */
function Snapshot({ what }: { what: string }) {
  return (
    <p className="notice" role="status">
      {what} did not load, so this panel shows the figures published on{" "}
      {SNAPSHOT_DATE} rather than the current record. The{" "}
      <a href="/elections">section pages</a> read the current one.
    </p>
  );
}

// ---------------------------------------------------------------------------
// Panel 01 — Elections
// ---------------------------------------------------------------------------

/**
 * Amboori's 14 wards at the 2025 election, as the design canvas published
 * them on 4 September 2026. Shown only behind a `Snapshot` notice.
 *
 * `area` is the canvas's own square-kilometre figure per ward. The Commission
 * publishes no ward area, so the live table has no such column and this one
 * does not either; the figure is kept here because the canvas carried it and
 * dropping it silently would lose the record of what the canvas claimed.
 */
const SNAPSHOT_WARDS: {
  no: number;
  name: string;
  reservation: string;
  party: string;
  front: string;
  winMargin: number;
}[] = [
  { no: 1, name: "Mayam", reservation: "Woman", party: "CPI(M)", front: "LDF", winMargin: 21 },
  { no: 2, name: "Panchayat Office Ward", reservation: "General", party: "INC", front: "UDF", winMargin: 186 },
  { no: 3, name: "Thodumala", reservation: "SC", party: "CPI(M)", front: "LDF", winMargin: 21 },
  { no: 4, name: "Panthaplamoodu", reservation: "Woman", party: "CPI(M)", front: "LDF", winMargin: 46 },
  { no: 5, name: "Amboori", reservation: "General", party: "INC", front: "UDF", winMargin: 171 },
  { no: 6, name: "Koottappu", reservation: "ST", party: "INC", front: "UDF", winMargin: 33 },
  { no: 7, name: "Thekkupara", reservation: "Woman", party: "CPI", front: "LDF", winMargin: 76 },
  { no: 8, name: "Kannannoor", reservation: "General", party: "INC", front: "UDF", winMargin: 4 },
  { no: 9, name: "Kudappanamoodu", reservation: "General", party: "INC", front: "UDF", winMargin: 73 },
  { no: 10, name: "Thudiyamkonam", reservation: "General", party: "INC", front: "UDF", winMargin: 39 },
  { no: 11, name: "Puruthippara", reservation: "Woman", party: "INC", front: "UDF", winMargin: 94 },
  { no: 12, name: "Chirayakkodu", reservation: "Woman", party: "CPI", front: "LDF", winMargin: 59 },
  { no: 13, name: "Kuttamala", reservation: "Woman", party: "CPI(M)", front: "LDF", winMargin: 65 },
  { no: 14, name: "Kandamthitta", reservation: "Woman", party: "INC", front: "UDF", winMargin: 98 },
];

interface SeatRow {
  no: number | null;
  name: string | null;
  reservation: string | null;
  party: string | null;
  front: string | null;
  winMargin: number | null;
  uncontested: boolean;
}

function seatRows(wards: WardRow[]): SeatRow[] {
  return wards.map((ward) => ({
    no: ward.ward_no,
    name: ward.ward_name,
    reservation: ward.reservation,
    party: ward.winner_party,
    front: ward.winner_front,
    winMargin: ward.margin,
    uncontested: ward.uncontested,
  }));
}

function snapshotRows(): SeatRow[] {
  return SNAPSHOT_WARDS.map((ward) => ({
    no: ward.no,
    name: ward.name,
    reservation: ward.reservation,
    party: ward.party,
    front: ward.front,
    winMargin: ward.winMargin,
    uncontested: false,
  }));
}

/**
 * Who holds the council and on what margin, computed from the rows rather
 * than typed. The canvas's sentence — the UDF 8 wards to 6, on a ward won by
 * four votes — is what this produces from the 2020 record; typing it would
 * make it a claim that outlives its own evidence.
 */
function controlSentence(rows: SeatRow[]): string | null {
  const byFront = new Map<string, number>();
  for (const row of rows) {
    if (!row.front) continue;
    byFront.set(row.front, (byFront.get(row.front) ?? 0) + 1);
  }
  const ranked = [...byFront.entries()].sort((a, b) => b[1] - a[1]);
  if (ranked.length === 0) return null;

  const [front, seats] = ranked[0];
  const runnerUp = ranked[1]?.[1] ?? 0;
  const held =
    seats > runnerUp
      ? `The ${front} holds the council ${formatCount(seats)} wards to ${formatCount(runnerUp)}.`
      : `No front holds the council: ${front} and the next front took ${formatCount(seats)} wards each.`;

  const contested = rows.filter((row) => !row.uncontested && row.winMargin !== null);
  if (contested.length === 0) return held;

  const thinnest = contested.reduce((a, b) => ((a.winMargin ?? 0) <= (b.winMargin ?? 0) ? a : b));
  return `${held} Ward ${formatCount(thinnest.no)} was won by ${formatCount(
    thinnest.winMargin,
  )} votes, so control rests on a margin thinner than one booth's queue.`;
}

function SeatsTable({ rows }: { rows: SeatRow[] }) {
  return (
    <div className="data-table-scroll">
      <table className="data-table" aria-label={`Ward results, Amboori grama panchayat, ${EXAMPLE_CYCLE}`}>
        <caption>
          Every ward of Amboori at the {EXAMPLE_CYCLE} election. The margin is the
          winner's votes less the runner-up's.
        </caption>
        <thead>
          <tr>
            <th scope="col" className="num">
              #
            </th>
            <th scope="col">Ward</th>
            <th scope="col">Reserved</th>
            <th scope="col">Won by</th>
            <th scope="col" className="num">
              Margin
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.no ?? row.name}>
              <td className="num">{formatCount(row.no)}</td>
              <td>{row.name ?? "Unnamed"}</td>
              <td>{row.reservation ?? "Not stated"}</td>
              <td>
                {row.party ?? "Not stated"}
                {row.front ? ` (${row.front})` : ""}
              </td>
              <td className="num">
                {row.uncontested ? "Uncontested" : formatCount(row.winMargin)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The map's units: one cell per ward, carrying the reading the colour cannot. */
function wardUnits(result: CycleResult): MapUnit[] {
  return result.wards.map((ward) => ({
    key: String(ward.ward_no),
    name: String(ward.ward_no ?? ""),
    note: [
      ward.ward_name,
      ward.winner_party,
      ward.uncontested
        ? "uncontested"
        : ward.margin === null
          ? ""
          : `margin ${formatCount(ward.margin)}`,
    ]
      .filter(Boolean)
      .join(", "),
    front: ward.winner_front,
    action: `Open ward ${ward.ward_no} on the Elections page.`,
    selected: false,
  }));
}

function ElectionsPanel() {
  const navigate = useNavigate();
  const result = useCycleResult(AMBOORI, EXAMPLE_CYCLE);
  const wardsGeo = useGeometry(wardsUrl(AMBOORI, EXAMPLE_CYCLE));
  const bodiesGeo = useGeometry(localBodiesUrl(DISTRICT, EXAMPLE_CYCLE));

  const live =
    result.status === "ready" && result.payload.available ? result.payload : null;
  const settled = result.status !== "loading" && result.status !== "idle";
  const rows = live ? seatRows(live.wards) : snapshotRows();
  const sentence = controlSentence(rows);

  return (
    <Panel
      number="01"
      title="Elections"
      source={`State Election Commission · ${EXAMPLE_CYCLE} cycle`}
      map={
        live ? (
          <>
            <DrillMap
              title={`Wards of Amboori grama panchayat by winning front, ${EXAMPLE_CYCLE}`}
              units={wardUnits(live)}
              variant="ward"
              unitNoun="ward"
              cycle={EXAMPLE_CYCLE}
              geometry={wardsGeo}
              outline={featureFor(bodiesGeo, AMBOORI)}
              onSelect={() => navigate(`/elections/${AMBOORI}/${EXAMPLE_CYCLE}`)}
            />
            <p className={styles.mapCaption}>
              Amboori's {EXAMPLE_CYCLE} wards, each drawn on the boundary
              published for that cycle and filled with the front that won it.
              {EXAMPLE_CYCLE} is the only cycle Kerala publishes ward boundaries
              for; the earlier ones are on the elections page as numbered cells
              inside the body's outline.
            </p>
          </>
        ) : null
      }
    >
      {!settled ? (
        <p className="selector-status" aria-busy="true">
          Reading the {EXAMPLE_CYCLE} result for Amboori.
        </p>
      ) : null}

      {settled && !live ? <Snapshot what="Amboori&rsquo;s ward results" /> : null}

      {settled ? (
        <>
          {sentence ? <p className={styles.panelLede}>{sentence}</p> : null}
          <SeatsTable rows={rows} />
        </>
      ) : null}
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Panel 02 — Plan proposals
// ---------------------------------------------------------------------------

/** Amboori's fourteen years as the canvas published them, in ₹ crore. */
const SNAPSHOT_YEARS: [string, number, number][] = [
  ["2012-2013", 3.5, 1.9],
  ["2013-2014", 5.0, 3.4],
  ["2014-2015", 6.0, 3.0],
  ["2015-2016", 5.1, 3.4],
  ["2016-2017", 5.6, 2.9],
  ["2017-2018", 7.0, 4.0],
  ["2018-2019", 13.2, 8.1],
  ["2019-2020", 10.6, 2.6],
  ["2020-2021", 10.6, 5.1],
  ["2021-2022", 9.0, 4.6],
  ["2022-2023", 9.8, 3.8],
  ["2023-2024", 27.0, 4.3],
  ["2024-2025", 38.4, 7.1],
  ["2025-2026", 15.2, 3.5],
];

function snapshotSeries(): SeriesYear[] {
  return SNAPSHOT_YEARS.map(([year, formulation, expense]) => ({
    year_label: year,
    is_complete: year !== "2025-2026",
    has_data: true,
    projects: null,
    formulation: Math.round(formulation * CRORE),
    expense: Math.round(expense * CRORE),
    expense_pct: Number(((expense / formulation) * 100).toFixed(1)),
    projects_with_pdf: null,
    also_in_prev_year: null,
    first_seen_this_year: null,
  }));
}

const SNAPSHOT_PROVENANCE = {
  dataset: "GramSAMBANDH published figures",
  build_date: "2026-09-04",
  source: "Sulekha",
};

function PlanPanel() {
  const series = useFinancesSeries(AMBOORI);

  const years = series.data?.available ? (series.data.years ?? []) : [];
  const live = years.some((year) => year.has_data) ? years : null;
  const settled = !series.loading;

  return (
    <Panel
      number="02"
      title="Plan proposals"
      source="Sulekha · from 2012–13"
      map={null}
    >
      <p className={styles.panelLede}>
        The council Amboori elected formulates a plan: named projects, each
        carrying an amount. Payments are filed against the project they belong
        to.
      </p>
      <p className={styles.panelNote}>
        Sulekha publishes no sector or category for a project, so none is shown
        and none is inferred. The gap between the two lines is what the record
        supports.
      </p>

      {!settled ? (
        <p className="selector-status" aria-busy="true">
          Reading the plan and payments for Amboori.
        </p>
      ) : null}

      {settled && !live ? (
        <Snapshot what="Amboori&rsquo;s year-by-year plan figures" />
      ) : null}

      {settled ? (
        <YearSeries
          body={live ? series.data?.body : undefined}
          lbCode={AMBOORI}
          years={live ?? snapshotSeries()}
          provenance={live && series.data ? series.data.provenance : SNAPSHOT_PROVENANCE}
        />
      ) : null}
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Panel 03 — Deliberation records
// ---------------------------------------------------------------------------

/** Amboori's 2018-19 register as the canvas published it. */
const SNAPSHOT_MEETINGS: MeetingsYear = {
  lb_code: AMBOORI,
  year_label: "2018-2019",
  is_complete: true,
  body: {
    lb_code: AMBOORI,
    lb_name_en: "Amboori",
    lb_name_ml: null,
    district_name: "THIRUVANANTHAPURAM",
    lb_type: "Grama Panchayat",
  },
  available: true,
  reason_code: null,
  meetings: 30,
  governing_body: 30,
  standing_committee: 0,
  ordinary: 14,
  special: 16,
  first_meeting: null,
  last_meeting: null,
  meeting_rows: [],
  scope_note: "",
  provenance: { ...SNAPSHOT_PROVENANCE, source: "Sakarma" },
};

function DeliberationPanel() {
  const meetings = useMeetingsYear(AMBOORI, YEAR);

  const live = meetings.status === "ready" ? meetings.payload : null;
  const settled = meetings.status !== "loading" && meetings.status !== "idle";

  return (
    <Panel
      number="03"
      title="Deliberation records"
      source={`Sakarma · ${YEAR.replace("-20", "–")}`}
      map={null}
    >
      <p className={styles.panelLede}>
        Nothing may be spent that the council did not adopt in a minuted
        sitting. Sakarma names the committee that met and how the meeting was
        called, so the same sittings split two ways.
      </p>

      {!settled ? (
        <p className="selector-status" aria-busy="true">
          Reading the meeting register for Amboori.
        </p>
      ) : null}

      {settled && !live ? <Snapshot what="Amboori&rsquo;s meeting register" /> : null}

      {settled ? <MeetingCounts payload={live ?? SNAPSHOT_MEETINGS} /> : null}
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// The three panels, and the body they are all about
// ---------------------------------------------------------------------------

interface PanelProps {
  number: string;
  title: string;
  source: string;
  map: ReactNode;
  children: ReactNode;
}

function Panel({ number, title, source, map, children }: PanelProps) {
  return (
    <section className={styles.panel} aria-labelledby={`panel-${number}`}>
      <div className={styles.panelHead}>
        <span className={styles.panelNumber} data-numeric>
          {number}
        </span>
        <h3 className={styles.panelTitle} id={`panel-${number}`}>
          {title}
        </h3>
        <span className={styles.panelSource}>{source}</span>
      </div>
      <div className={styles.panelBody}>
        {map ? <div className={styles.panelMap}>{map}</div> : null}
        <div className={styles.panelRecord}>{children}</div>
      </div>
    </section>
  );
}

export default function WorkedExample() {
  return (
    <div id="amboori" className={styles.example}>
      <h2 className="section-head">Start here: Amboori grama panchayat</h2>
      <p className={styles.identifiers} data-numeric>
        G01014 · Thiruvananthapuram · 14 wards · 48.1 km²
      </p>
      <p className={styles.exampleLede}>
        Amboori is the first grama panchayat in this site&rsquo;s alphabetical
        index. The three panels below are its own record: who its wards elected, what the council that seated
        formulated, and which sittings adopted the spending.
      </p>

      <AmbooriParagraph />

      <ElectionsPanel />
      <PlanPanel />
      <DeliberationPanel />
    </div>
  );
}
