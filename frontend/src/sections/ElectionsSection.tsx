/**
 * The Elections section.
 *
 * The map is the interface and it comes first on the page. Everything below it
 * — the card, the seat bar, the ward table, the candidates, the selector — is
 * an answer to something clicked on it, and a reader who has to scroll past
 * five tables to find the map has been shown the answers before the question.
 *
 * **Four levels, not three.** Rural Kerala elects three bodies over the same
 * ground: a grama panchayat, the block panchayat above it, the district
 * panchayat above that. A voter casts three ballots and gets three results.
 * The page used to collapse the lower two into one flat list of "local bodies
 * in a district", which is not a level — it is two levels flattened. So a
 * district now offers a choice of tier: the district panchayat's own result,
 * its block panchayats, or its grama panchayats; and a block panchayat opens
 * the grama panchayats inside it. Municipalities and corporations are listed
 * alongside rather than nested, because they sit outside that hierarchy
 * entirely and are atomic bodies in their own right.
 *
 * **No level summarises the level below it.** A block panchayat's colour is
 * the block panchayat's own election, not a roll-up of its grama panchayats,
 * exactly as a district's colour has always been its district panchayat's own
 * result. The map cannot show that, and a reader who assumes otherwise sees
 * nothing wrong, so `OwnResult` says it in words at every step down.
 *
 * Each level is an address — `/elections?cycle=2025&district=THRISSUR&tier=grama_panchayat`,
 * `/elections?cycle=2025&district=THRISSUR&block=B08076`,
 * `/elections/M08032/2025?ward=7` — so a view can be linked, and the
 * breadcrumb walks back out without dropping the cycle or the tier.
 *
 * The map and the ward table are one selection. A click on the map and a click
 * on a row write the same URL, and both read it back. One selection has three
 * views: the card, the map's zoom, and the candidates listed beside the ward
 * table. Clicking a ward moves all three.
 *
 * Four empty cases are kept apart, because a reader should be able to tell
 * them apart: the commission published no result for the body at all
 * (Mattannur); the body has results but was not constituted for the cycle
 * asked for; the body exists in the cycle but the layer being drawn holds no
 * polygon for it; and the body contested in 2010, had no successor, and so has
 * no published position on any map of any cycle. Each states its own cause;
 * none of them renders an empty chart or drops a result.
 */

import { useNavigate, useParams, useSearchParams } from "react-router-dom";

import BodySelector from "@/components/select/BodySelector";
import Alongside from "@/components/elections/Alongside";
import Breadcrumb, { type Crumb } from "@/components/elections/Breadcrumb";
import CandidatesTable from "@/components/elections/CandidatesTable";
import CycleSlider from "@/components/elections/CycleSlider";
import DrillMap from "@/components/elections/DrillMap";
import OwnResult from "@/components/elections/OwnResult";
import SeatsBar from "@/components/elections/SeatsBar";
import SelectedCard from "@/components/elections/SelectedCard";
import Sources from "@/components/elections/Sources";
import TierPicker from "@/components/elections/TierPicker";
import Unplaced, { type UnplacedBody } from "@/components/elections/Unplaced";
import WardTable from "@/components/elections/WardTable";
import styles from "@/components/elections/elections.module.css";
import {
  candidatesInWard,
  controlSentence,
  formatCount,
  type CycleResult,
  type FrontEntry,
  type FrontsPayload,
  type MapUnit,
} from "@/components/elections/payload";
import {
  electionsPath,
  readSelection,
  type Tier,
} from "@/components/elections/selection";
import {
  geometryUrl,
  useBlockMembership,
  useCycleResult,
  useFronts,
  useGeometry,
  useMaps,
} from "@/components/elections/useElections";
import { useBodies, type BodySummary } from "@/hooks/useBodies";
import { track } from "@/lib/telemetry";

/**
 * What each level is, said above the map rather than under it. A reader who
 * has already formed a reading of the colours will not go looking for a
 * caption to correct it.
 */
const DISTRICT_CAPTION =
  "Kerala's fourteen districts, coloured by the front that runs the district " +
  "panchayat. The district panchayat is a body of its own, elected on its own " +
  "ballot; a district's colour is its result and not a tally of the bodies " +
  "inside the district.";

const BLOCK_CAPTION =
  "Every block panchayat in the district, coloured by the front that runs it. " +
  "A block panchayat is elected on its own ballot to its own body. Its colour " +
  "is that election and not a summary of the grama panchayats inside it — a " +
  "block held by one front can contain a majority of panchayats held by another.";

const BODY_CAPTION =
  "Grama Panchayats, Municipalities and Corporations, coloured by the front " +
  "that runs each one. These are the bodies that tile the district exactly " +
  "once; the block and district panchayats cover the same ground again and " +
  "are shown at their own levels.";

const GP_IN_BLOCK_CAPTION =
  "Every grama panchayat inside this block panchayat, coloured by the front " +
  "that runs it. These are separate elections from the block panchayat's own, " +
  "and from each other.";

const WARD_CAPTION =
  "Ward boundaries as drawn for the 2025 election, from KSMART, coloured by " +
  "the winning candidate's front.";

/**
 * The three levels that tile the state exactly once. Block and District
 * Panchayats cover the same ground a second and third time, so they are drawn
 * at their own levels and are never counted as missing from this one.
 */
const DIRECT_TYPES = new Set(["Grama Panchayat", "Municipality", "Corporation"]);
const URBAN_TYPES = new Set(["Municipality", "Corporation"]);

/**
 * The earliest cycle any boundary layer covers. A body whose last election was
 * before it appears in no layer at any tier, so it has no position to be drawn
 * at rather than a missing one.
 */
const FIRST_MAPPED_CYCLE = 2015;

const NO_SUCCESSOR_LABEL = "Contested in 2010, no position published";

const NO_SUCCESSOR_NOTE =
  "These bodies fought the 2010 election and had no successor: they were " +
  "absorbed into municipalities and corporations at the 2015 reorganisation. " +
  "No boundary layer holds them, at any tier, for any cycle — the earliest one " +
  "published is a November 2020 snapshot, by which time they had been gone for " +
  "five years. Their results are here; a place on the map is what does not exist.";

const NO_POLYGON_LABEL = "In this cycle, not on this map";

/** Districts, from the fronts payload, which returns them in LSGD order. */
function districtUnits(fronts: FrontsPayload): MapUnit[] {
  return fronts.districts.map((district) => ({
    key: district.district_name,
    name: district.district_name,
    note: `${controlSentence(district.ruling_front, district.control_type)}, ${formatCount(district.bodies)} local bodies`,
    front: district.ruling_front,
    action: `Click to open the three tiers elected in ${district.district_name}.`,
    selected: false,
  }));
}

/** One tier's bodies as map units, with what a click on each does. */
function tierUnits(
  entries: FrontEntry[],
  nameOf: (lbCode: string) => string,
  selectedCode: string | null,
  action: (name: string) => string,
): MapUnit[] {
  return entries.map((entry) => {
    const name = nameOf(entry.lb_code);
    const wards =
      entry.total_wards === null ? "" : `, ${formatCount(entry.total_wards)} wards`;
    return {
      key: entry.lb_code,
      name,
      note: `${entry.lb_type}. ${controlSentence(entry.ruling_front, entry.control_type)}${wards}`,
      front: entry.ruling_front,
      action: action(name),
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

/** A body's result for the cycle exists, whether or not it can be drawn. */
function contested(body: BodySummary, cycle: number): boolean {
  if (!body.in_elections) return false;
  if (body.first_cycle !== null && cycle < body.first_cycle) return false;
  if (body.last_cycle !== null && cycle > body.last_cycle) return false;
  return true;
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
  const { cycle, district, block, tier, lbCode, ward, level } = selection;

  const fronts = useFronts(cycle);
  const result = useCycleResult(lbCode ?? "", cycle);
  const maps = useMaps();
  const membership = useBlockMembership();
  const geometry = useGeometry(
    geometryUrl(level, cycle, district, lbCode, tier, block),
  );

  const go = (next: Parameters<typeof electionsPath>[0]) => navigate(electionsPath(next));

  /** A step down the map, and the level it lands on. */
  const drill = (
    into: "district" | "block" | "body" | "ward",
    next: Parameters<typeof electionsPath>[0],
  ) => {
    track({ name: "map_drill", level: into, cycle });
    go(next);
  };

  const nameOf = (code: string) =>
    bodies.data?.bodies.find((body) => body.lb_code === code)?.lb_name_en ?? code;

  const cycleResult =
    result.status === "ready" && result.payload.available ? result.payload : null;
  const bodyName = [selectedBody?.lb_name_en ?? lbCode, selectedBody?.lb_type]
    .filter(Boolean)
    .join(" ");
  const selectedWardRow =
    cycleResult && ward !== null
      ? (cycleResult.wards.find((row) => row.ward_no === ward) ?? null)
      : null;

  // ---------------------------------------------------------------------
  // The tiers of the open district
  // ---------------------------------------------------------------------

  const inDistrict = (entry: FrontEntry) => entry.district_name === district;
  const frontEntries = fronts.status === "ready" ? fronts.payload.bodies : [];
  const districtEntry =
    fronts.status === "ready"
      ? (fronts.payload.districts.find((d) => d.district_name === district) ?? null)
      : null;

  const blockEntries = frontEntries.filter(
    (entry) => inDistrict(entry) && entry.lb_type === "Block Panchayat",
  );
  // Only the ones that stood in this cycle. The fronts payload lists every
  // body that ever contested, with a null front where it has no row, and a
  // list headed "urban local bodies" reading "no front in control" for a
  // corporation that did not yet exist is a worse answer than leaving it out.
  const urbanEntries = frontEntries.filter((entry) => {
    if (!inDistrict(entry) || !URBAN_TYPES.has(entry.lb_type)) return false;
    const body = bodies.data?.bodies.find((row) => row.lb_code === entry.lb_code);
    return body === undefined || contested(body, cycle);
  });
  const directEntries = frontEntries.filter(
    (entry) => inDistrict(entry) && DIRECT_TYPES.has(entry.lb_type),
  );

  const ofBlock = membership.status === "ready" ? membership.payload.of_block : {};
  const blockEntry = blockEntries.find((entry) => entry.lb_code === block) ?? null;
  const inBlockEntries = frontEntries.filter(
    (entry) => block !== null && ofBlock[entry.lb_code] === block,
  );

  // ---------------------------------------------------------------------
  // What is not on the map, and why
  // ---------------------------------------------------------------------

  // Bodies whose last election was before any layer was drawn. Not "missing
  // from this map" — absent from every map there is, at every tier.
  const noSuccessor: UnplacedBody[] =
    district && bodies.data
      ? bodies.data.bodies.filter(
          (body) =>
            body.district_name === district &&
            contested(body, cycle) &&
            body.last_cycle !== null &&
            body.last_cycle < FIRST_MAPPED_CYCLE,
        )
      : [];

  // Bodies in the open district that the drawn layer holds no polygon for.
  // Stated only where a map was drawn: a grid of squares claims no geography,
  // so nothing can be missing from it.
  const drawnCodes =
    geometry.status === "ready"
      ? new Set(geometry.collection.features.map((f) => String(f.properties.lb_code)))
      : null;
  const noPolygon: UnplacedBody[] =
    district && bodies.data && drawnCodes && geometry.status === "ready"
      ? bodies.data.bodies.filter((body) => {
          if (body.district_name !== district || !contested(body, cycle)) return false;
          if (noSuccessor.some((other) => other.lb_code === body.lb_code)) return false;
          if (geometry.collection.level === "local_body") {
            if (!DIRECT_TYPES.has(body.lb_type)) return false;
            if (block !== null && ofBlock[body.lb_code] !== block) return false;
          } else if (geometry.collection.level === "block_panchayat") {
            if (body.lb_type !== "Block Panchayat") return false;
          } else {
            return false;
          }
          return !drawnCodes.has(body.lb_code);
        })
      : [];

  // ---------------------------------------------------------------------
  // The breadcrumb
  // ---------------------------------------------------------------------

  const crumbs: Crumb[] = [
    { label: "Kerala", to: level === "state" ? undefined : electionsPath({ cycle }) },
  ];
  if (district) {
    crumbs.push({
      label: district,
      to: level === "district" ? undefined : electionsPath({ cycle, district, tier }),
    });
  }
  if (block) {
    crumbs.push({
      label: blockEntry ? nameOf(block) : block,
      to: level === "block" ? undefined : electionsPath({ cycle, district, block }),
    });
  }
  if (lbCode) {
    crumbs.push({
      label: selectedBody?.lb_name_en ?? lbCode,
      to: level === "body" ? undefined : electionsPath({ cycle, lbCode }),
    });
  }
  if (ward !== null) crumbs.push({ label: `Ward ${ward}` });

  // ---------------------------------------------------------------------
  // The map for the level the reader is on
  // ---------------------------------------------------------------------

  let drillMap = null;
  if (fronts.status === "ready" && level === "state") {
    drillMap = (
      <DrillMap
        title={`Districts of Kerala by ruling front, ${cycle}`}
        units={districtUnits(fronts.payload)}
        variant="area"
        unitNoun="district"
        cycle={cycle}
        geometry={geometry}
        onSelect={(name) => drill("district", { cycle, district: name })}
        caption={DISTRICT_CAPTION}
      />
    );
  } else if (fronts.status === "ready" && level === "district" && district) {
    const showBlocks = tier === "block_panchayat";
    drillMap = (
      <DrillMap
        title={
          showBlocks
            ? `Block panchayats in ${district} by ruling front, ${cycle}`
            : `Grama panchayats and urban bodies in ${district} by ruling front, ${cycle}`
        }
        units={
          showBlocks
            ? tierUnits(
                blockEntries,
                nameOf,
                null,
                (name) => `Click to open the grama panchayats in ${name}.`,
              )
            : tierUnits(
                directEntries,
                nameOf,
                lbCode,
                (name) => `Click to open the wards of ${name}.`,
              )
        }
        variant="area"
        unitNoun={showBlocks ? "block panchayat" : "local body"}
        cycle={cycle}
        geometry={geometry}
        onSelect={(code) =>
          showBlocks
            ? drill("block", { cycle, district, block: code })
            : drill("body", { cycle, lbCode: code })
        }
        caption={showBlocks ? BLOCK_CAPTION : BODY_CAPTION}
        note={
          districtEntry ? (
            <OwnResult
              name={`${district} District Panchayat`}
              below={showBlocks ? "block panchayats" : "local bodies"}
              front={districtEntry.ruling_front}
              controlType={districtEntry.control_type}
              lbCode={districtEntry.lb_code}
              cycle={cycle}
            />
          ) : null
        }
      />
    );
  } else if (fronts.status === "ready" && level === "block" && block) {
    drillMap = (
      <DrillMap
        title={`Grama panchayats in ${nameOf(block)} by ruling front, ${cycle}`}
        units={tierUnits(
          inBlockEntries,
          nameOf,
          lbCode,
          (name) => `Click to open the wards of ${name}.`,
        )}
        variant="area"
        unitNoun="grama panchayat"
        cycle={cycle}
        geometry={geometry}
        onSelect={(code) => drill("body", { cycle, lbCode: code })}
        caption={GP_IN_BLOCK_CAPTION}
        note={
          blockEntry ? (
            <OwnResult
              name={`${nameOf(block)} Block Panchayat`}
              below="grama panchayats"
              front={blockEntry.ruling_front}
              controlType={blockEntry.control_type}
              lbCode={blockEntry.lb_code}
              cycle={cycle}
            />
          ) : null
        }
      />
    );
  }

  return (
    <div className="shell-container section-page">
      <h1>Elections</h1>
      <p className="lede">
        Who won each ward in the 2010, 2015, 2020 and 2025 local body
        elections, and by how many votes. Rural Kerala elects three bodies over
        the same ground — a grama panchayat, a block panchayat and a district
        panchayat — and every level here shows that tier's own election, never a
        summary of the tier below it.
      </p>

      <div className="flex flex-col gap-s7">
        <div>
          <CycleSlider
            cycle={cycle}
            onChange={(next) => go({ cycle: next, district, block, tier, lbCode, ward })}
          />
        </div>

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

        {level === "district" && district ? (
          <TierPicker
            district={district}
            cycle={cycle}
            tier={tier}
            districtPanchayat={districtEntry?.lb_code ?? null}
            onTier={(next: Tier) => go({ cycle, district, tier: next })}
          />
        ) : null}

        {drillMap}

        {level === "district" && district && tier === "block_panchayat" ? (
          <Alongside bodies={urbanEntries} nameOf={nameOf} cycle={cycle} />
        ) : null}

        <Unplaced
          label={NO_SUCCESSOR_LABEL}
          explanation={NO_SUCCESSOR_NOTE}
          bodies={noSuccessor}
          cycle={cycle}
        />

        <Unplaced
          label={NO_POLYGON_LABEL}
          explanation={
            `The ${cycle} boundary layer holds no polygon for these bodies, so ` +
            "they are not drawn. Their results are published all the same."
          }
          bodies={noPolygon}
          cycle={cycle}
        />

        {result.status === "loading" ? (
          <p className="selector-status" aria-busy="true">
            Loading the {cycle} result…
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
                  cycle={cycle}
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

        <BodySelector section="elections" />

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
