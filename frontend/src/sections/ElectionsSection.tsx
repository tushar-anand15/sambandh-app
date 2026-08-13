/**
 * The Elections section.
 *
 * The map is the interface, three levels deep: Kerala's districts, one
 * district's local bodies, one body's wards. Clicking a ward fills the result
 * panel. Every level is an address — `/elections?cycle=2025&district=THRISSUR`,
 * `/elections/M08032/2025?ward=7` — so a view can be linked, and the breadcrumb
 * walks back out without dropping the cycle.
 *
 * The map and the ward table are one selection. A click on a tile and a click
 * on a row write the same URL, and both read it back.
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
import BoundaryLayers from "@/components/elections/BoundaryLayers";
import CycleSlider from "@/components/elections/CycleSlider";
import DrillMap, { type MapUnit } from "@/components/elections/DrillMap";
import ResultPanel from "@/components/elections/ResultPanel";
import SeatsBar from "@/components/elections/SeatsBar";
import WardTable from "@/components/elections/WardTable";
import styles from "@/components/elections/elections.module.css";
import {
  controlSentence,
  formatCount,
  type CycleResult,
  type FrontsPayload,
} from "@/components/elections/payload";
import { electionsPath, readSelection } from "@/components/elections/selection";
import { useCycleResult, useFronts, useMaps } from "@/components/elections/useElections";
import { useBodies, type BodySummary } from "@/hooks/useBodies";

const DISTRICT_CAPTION =
  "Each tile is one district, in the LSGD's own district order from Thiruvananthapuram to Kasaragod. " +
  "The colour is the district panchayat's ruling front, which is a separate election from the bodies inside the district. " +
  "Tiles carry no geography; the published boundary polygons are below.";

const BODY_CAPTION =
  "Each tile is one local body, coloured by the front that holds it. " +
  "Tiles carry no geography; the published boundary polygons are below.";

const WARD_CAPTION =
  "Each tile is one ward, coloured by the winning candidate's front. " +
  "Ward polygons exist for 2025 only and are downloadable below.";

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

function bodyUnits(
  fronts: FrontsPayload,
  bodies: BodySummary[],
  district: string,
  selectedCode: string | null,
): MapUnit[] {
  const byCode = new Map(bodies.map((body) => [body.lb_code, body]));
  return fronts.bodies
    .filter((entry) => entry.district_name === district)
    .filter((entry) => byCode.get(entry.lb_code)?.has_geometry)
    .map((entry) => {
      const body = byCode.get(entry.lb_code);
      const name = body ? body.lb_name_en : entry.lb_code;
      return {
        key: entry.lb_code,
        name,
        note: `${entry.lb_type}. ${controlSentence(entry.ruling_front, entry.control_type)}`,
        front: entry.ruling_front,
        action: `Click to open the wards of ${name}.`,
        selected: entry.lb_code === selectedCode,
      };
    });
}

function wardUnits(result: CycleResult, selectedWard: number | null): MapUnit[] {
  return result.wards.map((ward) => ({
    key: String(ward.ward_no),
    name: String(ward.ward_no ?? ""),
    note: [ward.ward_name, ward.winner_party].filter(Boolean).join(", "),
    front: ward.winner_front,
    action: `Click for the result in ward ${ward.ward_no}.`,
    selected: ward.ward_no !== null && ward.ward_no === selectedWard,
  }));
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

  const go = (next: Parameters<typeof electionsPath>[0]) => navigate(electionsPath(next));

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

  // Bodies in the open district that no boundary layer holds a polygon for.
  const missingGeometry =
    district && bodies.data
      ? bodies.data.bodies.filter(
          (body) =>
            body.district_name === district && body.in_elections && !body.has_geometry,
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

        <div>
          <Breadcrumb crumbs={crumbs} />

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
              onSelect={(name) => go({ cycle, district: name })}
              caption={DISTRICT_CAPTION}
            />
          ) : null}

          {fronts.status === "ready" && level === "district" && district ? (
            <DrillMap
              title={`Local bodies in ${district} by ruling front, ${cycle}`}
              units={bodyUnits(fronts.payload, bodies.data?.bodies ?? [], district, lbCode)}
              variant="area"
              onSelect={(code) => go({ cycle, lbCode: code })}
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

          {cycleResult && (level === "body" || level === "ward") ? (
            <DrillMap
              title={`Wards of ${bodyName} by winning front, ${cycle}`}
              units={wardUnits(cycleResult, ward)}
              variant="ward"
              onSelect={(wardNo) => go({ cycle, lbCode, ward: Number(wardNo) })}
              caption={WARD_CAPTION}
            />
          ) : null}
        </div>

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

        {selectedWardRow ? (
          <ResultPanel ward={selectedWardRow} bodyName={bodyName} cycle={cycle} />
        ) : null}

        {cycleResult ? (
          <>
            <SeatsBar result={cycleResult} />
            <WardTable
              result={cycleResult}
              selectedWard={ward}
              onSelect={(wardNo) => go({ cycle, lbCode, ward: wardNo })}
            />
          </>
        ) : null}

        {maps.status === "ready" ? <BoundaryLayers maps={maps.payload} /> : null}

        {maps.status === "error" ? (
          <p className="notice" role="alert">
            {maps.message}
          </p>
        ) : null}
      </div>
    </div>
  );
}
