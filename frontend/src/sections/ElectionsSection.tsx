/**
 * The Elections section.
 *
 * The map is the interface, three levels deep: Kerala's districts, one
 * district's local bodies, one body's wards. Each level is drawn from the
 * boundary layer the cycle has, cut to that level by `/geo/*`, and from tiles
 * where the cycle has no layer. Clicking a ward fills the result panel. Every
 * level is an address — `/elections?cycle=2025&district=THRISSUR`,
 * `/elections/M08032/2025?ward=7` — so a view can be linked, and the breadcrumb
 * walks back out without dropping the cycle.
 *
 * The map and the ward table are one selection. A click on the map and a click
 * on a row write the same URL, and both read it back. One selection has three
 * views: the card at the top, the map's zoom, and the candidates listed beside
 * the ward table. Clicking a ward moves all three.
 *
 * The card is above the map because it answers the click. Below it the map and
 * the tables sit in two columns, the map sticky in its own, so a reader can
 * work down 100 wards without losing sight of where they are.
 *
 * Three empty cases are kept apart, because a reader should be able to tell
 * them apart: the commission published no result for the body at all
 * (Mattannur), the body has results but was not constituted for the cycle asked
 * for, and the body has no boundary polygon and so cannot be on the map. Each
 * states its own cause; none of them renders an empty chart.
 */

import { useNavigate, useParams, useSearchParams } from "react-router-dom";

import BodySelector from "@/components/select/BodySelector";
import Breadcrumb, { type Crumb } from "@/components/elections/Breadcrumb";
import CandidatesTable from "@/components/elections/CandidatesTable";
import CycleSlider from "@/components/elections/CycleSlider";
import DrillMap from "@/components/elections/DrillMap";
import SeatsBar from "@/components/elections/SeatsBar";
import SelectedCard from "@/components/elections/SelectedCard";
import Sources from "@/components/elections/Sources";
import WardTable from "@/components/elections/WardTable";
import styles from "@/components/elections/elections.module.css";
import {
  candidatesInWard,
  controlSentence,
  formatCount,
  type CycleResult,
  type FrontsPayload,
  type MapUnit,
} from "@/components/elections/payload";
import { electionsPath, readSelection } from "@/components/elections/selection";
import {
  geometryUrl,
  useCycleResult,
  useFronts,
  useGeometry,
  useMaps,
} from "@/components/elections/useElections";
import { useBodies, type BodySummary } from "@/hooks/useBodies";
import { track } from "@/lib/telemetry";

const DISTRICT_CAPTION =
  "District outlines dissolved from the cycle's own local-body layer. " +
  "The colour is the district panchayat's ruling front, which is a separate election from the bodies inside the district.";

const BODY_CAPTION =
  "Grama Panchayat, Municipality and Corporation boundaries, coloured by the front that holds each. " +
  "Block and District Panchayats cover the same ground again and are left off.";

/**
 * The three levels that tile the state exactly once. Block and District
 * Panchayats cover the same ground a second and third time, so the boundary
 * layers draw them nowhere and they are not counted as missing from the map.
 */
const DIRECT_TYPES = new Set(["Grama Panchayat", "Municipality", "Corporation"]);

const WARD_CAPTION =
  "Ward boundaries as delimited for 2025, from KSMART's tiles, coloured by the winning candidate's front.";

/** Districts, from the fronts payload, which returns them in LSGD order. */
function districtUnits(fronts: FrontsPayload): MapUnit[] {
  return fronts.districts.map((district) => ({
    key: district.district_name,
    name: district.district_name,
    note: `${controlSentence(district.ruling_front, district.control_type)}, ${formatCount(district.bodies)} local bodies`,
    front: district.ruling_front,
    action: `Click to open the ${formatCount(district.bodies)} local bodies in ${district.district_name}.`,
    selected: false,
  }));
}

/**
 * The Grama Panchayats, Municipalities and Corporations of one district.
 *
 * Which of them is drawn is decided by the boundary layer; the ones it holds no
 * polygon for are named under the map with the reason. Block and District
 * Panchayat results are reached through the dropdown, because their territory
 * is these bodies' territory counted again.
 */
function bodyUnits(
  fronts: FrontsPayload,
  bodies: BodySummary[],
  district: string,
  selectedCode: string | null,
): MapUnit[] {
  const byCode = new Map(bodies.map((body) => [body.lb_code, body]));
  return fronts.bodies
    .filter((entry) => entry.district_name === district)
    .filter((entry) => DIRECT_TYPES.has(entry.lb_type))
    .map((entry) => {
      const body = byCode.get(entry.lb_code);
      const name = body ? body.lb_name_en : entry.lb_code;
      const wards =
        entry.total_wards === null ? "" : `, ${formatCount(entry.total_wards)} wards`;
      return {
        key: entry.lb_code,
        name,
        note: `${entry.lb_type}. ${controlSentence(entry.ruling_front, entry.control_type)}${wards}`,
        front: entry.ruling_front,
        action: `Click to open the wards of ${name}.`,
        selected: entry.lb_code === selectedCode,
      };
    });
}

/**
 * The wards of one body. The note is what hover and a screen reader get: the
 * ward's name, who won it and by how much, which is the reading the colour
 * alone cannot carry.
 */
function wardUnits(result: CycleResult, selectedWard: number | null): MapUnit[] {
  return result.wards.map((ward) => {
    const party = [ward.winner_party, ward.winner_front ? `(${ward.winner_front})` : ""]
      .filter(Boolean)
      .join(" ");
    const margin = ward.uncontested
      ? "uncontested"
      : ward.margin === null
        ? ""
        : `margin ${formatCount(ward.margin)}`;

    return {
      key: String(ward.ward_no),
      name: String(ward.ward_no ?? ""),
      note: [ward.ward_name, party, margin].filter(Boolean).join(", "),
      front: ward.winner_front,
      action: `Click for the result in ward ${ward.ward_no}.`,
      selected: ward.ward_no !== null && ward.ward_no === selectedWard,
    };
  });
}

export default function ElectionsSection() {
  const params = useParams();
  const [search] = useSearchParams();
  const navigate = useNavigate();

  const bodies = useBodies();
  const selectedBody =
    bodies.data?.bodies.find((body) => body.lb_code === params.lb) ?? null;

  const selection = readSelection(
    { lb: params.lb, cycle: params.cycle },
    search,
    selectedBody?.district_name ?? null,
  );
  const { cycle, district, lbCode, ward, level } = selection;

  const fronts = useFronts(cycle);
  const result = useCycleResult(lbCode ?? "", cycle);
  const maps = useMaps();
  const geometry = useGeometry(geometryUrl(level, cycle, district, lbCode));

  const go = (next: Parameters<typeof electionsPath>[0]) => navigate(electionsPath(next));

  /** A step down the map, and the level it lands on. */
  const drill = (
    into: "district" | "body" | "ward",
    next: Parameters<typeof electionsPath>[0],
  ) => {
    track({ name: "map_drill", level: into, cycle });
    go(next);
  };

  const crumbs: Crumb[] = [
    { label: "Kerala", to: level === "state" ? undefined : electionsPath({ cycle }) },
  ];
  if (district) {
    crumbs.push({
      label: district,
      to: level === "district" ? undefined : electionsPath({ cycle, district }),
    });
  }
  if (lbCode) {
    crumbs.push({
      label: selectedBody?.lb_name_en ?? lbCode,
      to: level === "body" ? undefined : electionsPath({ cycle, lbCode }),
    });
  }
  if (ward !== null) crumbs.push({ label: `Ward ${ward}` });

  const cycleResult =
    result.status === "ready" && result.payload.available ? result.payload : null;
  const bodyName = [selectedBody?.lb_name_en ?? lbCode, selectedBody?.lb_type]
    .filter(Boolean)
    .join(" ");
  const selectedWardRow =
    cycleResult && ward !== null
      ? (cycleResult.wards.find((row) => row.ward_no === ward) ?? null)
      : null;

  // Bodies in the open district the drawn layer holds no polygon for. Stated
  // only where a map was drawn: a tile map claims no geography, so nothing is
  // missing from it.
  const drawnCodes =
    geometry.status === "ready"
      ? new Set(geometry.collection.features.map((f) => String(f.properties.lb_code)))
      : null;
  const missingGeometry =
    district && bodies.data && drawnCodes && geometry.status === "ready" && geometry.collection.level === "local_body"
      ? bodies.data.bodies.filter(
          (body) =>
            body.district_name === district &&
            body.in_elections &&
            DIRECT_TYPES.has(body.lb_type) &&
            !drawnCodes.has(body.lb_code),
        )
      : [];

  return (
    <div className="shell-container section-page">
      <h1>Elections</h1>
      <p className="lede">
        Ward-level results across the 2010, 2015, 2020 and 2025 cycles, with the
        boundary layers they are drawn on.
      </p>
      <BodySelector section="elections" />

      <div className="flex flex-col gap-s7">
        <div>
          <CycleSlider
            cycle={cycle}
            onChange={(next) => go({ cycle: next, district, lbCode, ward })}
          />
        </div>

        <Breadcrumb crumbs={crumbs} />

        {result.status === "loading" ? (
          <p className="selector-status" aria-busy="true">
            Loading the {cycle} result…
          </p>
        ) : null}

        {result.status === "not-found" ? (
          <p className="notice" role="alert">
            No local body has the code {result.lbCode}.
          </p>
        ) : null}

        {result.status === "error" ? (
          <p className="notice" role="alert">
            {result.message}
          </p>
        ) : null}

        {result.status === "ready" && !result.payload.available ? (
          <p className="notice" role="status">
            {result.payload.reason}
          </p>
        ) : null}

        {cycleResult ? (
          <>
            <SelectedCard
              key={ward ?? "body"}
              result={cycleResult}
              ward={selectedWardRow}
              bodyName={bodyName}
              cycle={cycle}
            />

            <SeatsBar result={cycleResult} />

            <div className={styles.split}>
              <div className={styles.mapColumn}>
                <DrillMap
                  title={`Wards of ${bodyName} by winning front, ${cycle}`}
                  units={wardUnits(cycleResult, ward)}
                  variant="ward"
                  unitNoun="ward"
                  geometry={geometry}
                  onSelect={(wardNo) =>
                    drill("ward", { cycle, lbCode, ward: Number(wardNo) })
                  }
                  caption={WARD_CAPTION}
                />
              </div>

              <div className="flex flex-col gap-s7">
                <WardTable
                  result={cycleResult}
                  selectedWard={ward}
                  onSelect={(wardNo) => go({ cycle, lbCode, ward: wardNo })}
                />
                <CandidatesTable
                  key={ward ?? "none"}
                  candidates={candidatesInWard(cycleResult.candidates, ward)}
                  ward={selectedWardRow}
                  cycle={cycle}
                />
              </div>
            </div>
          </>
        ) : null}

        <div>
          {fronts.status === "loading" ? (
            <p className="selector-status" aria-busy="true">
              Loading the {cycle} results…
            </p>
          ) : null}

          {fronts.status === "error" ? (
            <p className="notice" role="alert">
              {fronts.message}
            </p>
          ) : null}

          {fronts.status === "ready" && level === "state" ? (
            <DrillMap
              title={`Districts of Kerala by ruling front, ${cycle}`}
              units={districtUnits(fronts.payload)}
              variant="area"
              unitNoun="district"
              geometry={geometry}
              onSelect={(name) => drill("district", { cycle, district: name })}
              caption={DISTRICT_CAPTION}
            />
          ) : null}

          {fronts.status === "ready" && level === "district" && district ? (
            <DrillMap
              title={`Local bodies in ${district} by ruling front, ${cycle}`}
              units={bodyUnits(fronts.payload, bodies.data?.bodies ?? [], district, lbCode)}
              variant="area"
              unitNoun="local body"
              geometry={geometry}
              onSelect={(code) => drill("body", { cycle, lbCode: code })}
              caption={BODY_CAPTION}
            />
          ) : null}

          {level === "district" && missingGeometry.length > 0 ? (
            <div className="notice">
              <p>
                {formatCount(missingGeometry.length)}{" "}
                {missingGeometry.length === 1 ? "local body in" : "local bodies in"}{" "}
                {district} {missingGeometry.length === 1 ? "is" : "are"} absent from the
                map: no boundary layer holds a polygon for them. They are reachable from
                the local body dropdown above.
              </p>
              <ul className={styles.missingList}>
                {missingGeometry.map((body) => (
                  <li key={body.lb_code}>
                    {body.lb_name_en}, {body.lb_type}, no published boundary
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

        </div>

        {maps.status === "ready" ? <Sources maps={maps.payload} /> : null}

        {maps.status === "error" ? (
          <p className="notice" role="alert">
            {maps.message}
          </p>
        ) : null}
      </div>
    </div>
  );
}
