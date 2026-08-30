/**
 * The Elections section: chapters that stack.
 *
 * The map is the first thing on the page and there is no prose above it. Each
 * selection appends a pane below the one it was made in and scrolls to it,
 * and the panes above stay on screen and stay live — so going back a level is
 * a scroll, not a click that throws the level away, and the address bar holds
 * every level at once.
 *
 * **Four levels, not three.** Rural Kerala elects three bodies over the same
 * ground: a grama panchayat, the block panchayat above it, the district
 * panchayat above that. A voter casts three ballots and gets three results.
 * A district therefore opens three panes rather than one — the district
 * panchayat's own result, its block panchayats, its grama panchayats — and a
 * block panchayat opens the grama panchayats inside it. Municipalities and
 * corporations are named beside the block map rather than nested under it,
 * because they sit outside that hierarchy and are atomic bodies.
 *
 * The page does not say in words that no level summarises the level below it.
 * A pane headed "THRISSUR District Panchayat" and a separate pane headed
 * "16 block panchayats in THRISSUR" have said it already; a sentence repeating
 * a heading is a sentence a reader learns to skip.
 *
 * **A ward selection never survives a cycle change.** 1,136 of 1,199 bodies
 * change ward count between two cycles, so ward 7 of 2020 and ward 7 of 2025
 * are different ground in 95% of them. Moving the cycle closes the ward pane
 * and rests the drill at the body. Where the cycle takes the body itself —
 * 29 bodies first contested in 2015, 38 last contested in 2010 — the drill
 * rests at the deepest pane that still exists and that pane says which body
 * went and why.
 *
 * Four empty cases are kept apart, because a reader should be able to tell
 * them apart: the commission published no result for the body at all
 * (Mattannur); the body exists but was not constituted for the cycle asked
 * for; the body exists in the cycle but the layer being drawn holds no polygon
 * for it; and the body contested in 2010, had no successor, and so has no
 * published position on any map of any cycle.
 */

import { useEffect, useRef } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";

import BodySelector from "@/components/select/BodySelector";
import Alongside from "@/components/elections/Alongside";
import CandidatesTable from "@/components/elections/CandidatesTable";
import CycleSlider from "@/components/elections/CycleSlider";
import DrillMap from "@/components/elections/DrillMap";
import OwnResult from "@/components/elections/OwnResult";
import Pane from "@/components/elections/Pane";
import SeatsBar from "@/components/elections/SeatsBar";
import SelectedCard from "@/components/elections/SelectedCard";
import Sources from "@/components/elections/Sources";
import Unplaced, { type UnplacedBody } from "@/components/elections/Unplaced";
import WardTable from "@/components/elections/WardTable";
import styles from "@/components/elections/elections.module.css";
import {
  candidatesInWard,
  controlSentence,
  formatCount,
  wardLabel,
  CYCLES,
  type CycleResult,
  type FrontEntry,
  type FrontsPayload,
  type MapUnit,
} from "@/components/elections/payload";
import { electionsPath, paneKey, readSelection } from "@/components/elections/selection";
import {
  blocksUrl,
  districtsUrl,
  featureFor,
  localBodiesUrl,
  useBlockMembership,
  useCycleResult,
  useFronts,
  useGeometry,
  useMaps,
  wardsUrl,
  type GeometryState,
} from "@/components/elections/useElections";
import { useBodies, type BodySummary } from "@/hooks/useBodies";
import { track } from "@/lib/telemetry";

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
  "These bodies were absorbed into municipalities and corporations at the 2015 " +
  "reorganisation, five years before the earliest boundary layer was drawn. " +
  "Their results are here; a place on the map is what does not exist.";

const NO_POLYGON_LABEL = "In this cycle, not on this map";

/** The sentence a climb lands on, so the reader is taken to the reason. */
const CLIMB = "pane-climb";

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

/**
 * The body stood at some cycle, and not at this one.
 *
 * Kept apart from a body the commission published nothing for: that one has a
 * sentence of the commission's own, which the page shows where the body's
 * result would have been.
 */
function outOfCycle(body: BodySummary | null | undefined, cycle: number): boolean {
  return Boolean(body && body.in_elections && !contested(body, cycle));
}

/** Which cycle took the body away, in the body list's own numbers. */
function whyGone(body: BodySummary, cycle: number): string {
  const name = `${body.lb_name_en} ${body.lb_type}`;
  if (body.first_cycle !== null && cycle < body.first_cycle) {
    return `${name} first contested in ${body.first_cycle}. The ${cycle} cycle has no result for it.`;
  }
  return `${name} last contested in ${body.last_cycle}. The ${cycle} cycle has no result for it.`;
}

/** Bodies of one tier in the district that the drawn layer holds no polygon for. */
function missingFrom(
  geometry: GeometryState,
  candidates: BodySummary[],
  belongs: (body: BodySummary) => boolean,
): UnplacedBody[] {
  if (geometry.status !== "ready") return [];
  const drawn = new Set(
    geometry.collection.features.map((feature) => String(feature.properties.lb_code)),
  );
  return candidates.filter((body) => belongs(body) && !drawn.has(body.lb_code));
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
  const { cycle, district, block, lbCode, ward, level } = selection;

  const blockBody =
    bodies.data?.bodies.find((body) => body.lb_code === block) ?? null;

  // The two ways a cycle can take a level away. The pane closes and the pane
  // above it says which body went and when it last stood.
  const blockGone = outOfCycle(blockBody, cycle);
  const bodyGone = outOfCycle(selectedBody, cycle);
  const openBody = bodyGone ? null : lbCode;

  const fronts = useFronts(cycle);
  const result = useCycleResult(openBody ?? "", cycle);
  const maps = useMaps();
  const membership = useBlockMembership();

  // The cycle before this one, for the ward count the body pane compares
  // against. Nothing to compare at 2010, which is the first.
  const previous = CYCLES[CYCLES.indexOf(cycle as (typeof CYCLES)[number]) - 1] ?? null;
  const before = useCycleResult(openBody ?? "", openBody ? (previous ?? null) : null);

  // One slice per open pane. A body's own outline is not a request of its own:
  // it is the feature keyed to that body in the slice its tier was drawn from.
  const districtsGeo = useGeometry(districtsUrl(cycle));
  const blocksGeo = useGeometry(blocksUrl(district, cycle));
  const bodiesGeo = useGeometry(localBodiesUrl(district, cycle));
  const inBlockGeo = useGeometry(
    blockGone ? null : localBodiesUrl(district, cycle, block),
  );
  const wardsGeo = useGeometry(wardsUrl(openBody, cycle));

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
  const districtPanchayat = frontEntries.find(
    (entry) => districtEntry !== null && entry.lb_code === districtEntry.lb_code,
  );

  const blockEntries = frontEntries.filter(
    (entry) => inDistrict(entry) && entry.lb_type === "Block Panchayat",
  );
  // Only the ones that stood in this cycle. The fronts payload lists every
  // body that ever contested, with a null front where it has no row, and a
  // list headed "municipalities and corporations" reading "no front in
  // control" for a corporation that did not yet exist is a worse answer than
  // leaving it out.
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

  const inThisDistrict =
    district && bodies.data
      ? bodies.data.bodies.filter(
          (body) => body.district_name === district && contested(body, cycle),
        )
      : [];

  // Bodies whose last election was before any layer was drawn. Not "missing
  // from this map" — absent from every map there is, at every tier.
  const noSuccessor: UnplacedBody[] = inThisDistrict.filter(
    (body) => body.last_cycle !== null && body.last_cycle < FIRST_MAPPED_CYCLE,
  );
  const placeable = inThisDistrict.filter(
    (body) => !noSuccessor.some((other) => other.lb_code === body.lb_code),
  );

  // Bodies the drawn layer holds no polygon for. Stated only where a map was
  // drawn: a grid of squares claims no geography, so nothing can be missing
  // from it.
  const noBlockPolygon = missingFrom(
    blocksGeo,
    placeable,
    (body) => body.lb_type === "Block Panchayat",
  );
  const noBodyPolygon = missingFrom(bodiesGeo, placeable, (body) =>
    DIRECT_TYPES.has(body.lb_type),
  );

  // ---------------------------------------------------------------------
  // Which panes are open, and which of them is the last
  // ---------------------------------------------------------------------

  const wardPane = openBody !== null && selectedWardRow !== null;
  const bodyPane = openBody !== null;
  const blockPane = block !== null && !blockGone;
  const districtPanes = district !== null;

  const PANE = {
    state: "pane-kerala",
    districtOwn: "pane-district-panchayat",
    blocks: "pane-block-panchayats",
    bodies: "pane-grama-panchayats",
    inBlock: "pane-in-block",
    body: "pane-wards",
    ward: "pane-ward",
  };

  const deepest = wardPane
    ? PANE.ward
    : bodyPane
      ? PANE.body
      : blockPane
        ? PANE.inBlock
        : districtPanes
          ? PANE.bodies
          : PANE.state;

  /**
   * The pane a selection opens at, which is the one it is scrolled to.
   *
   * A district opens three panes at once, and the reader is put at the first
   * of them rather than the last: the district panchayat's own result is the
   * answer to the click, and the two tiers under it are what to read next.
   * It is also the pane whose position is settled, because the panes above it
   * were already drawn.
   */
  const entered = wardPane
    ? PANE.ward
    : bodyPane
      ? PANE.body
      : blockPane
        ? PANE.inBlock
        : districtPanes
          ? PANE.districtOwn
          : PANE.state;

  // The sentence that says which body the cycle took away. It hangs on the
  // deepest pane that survived, which is the one the reader has been left on.
  const climb = bodyGone
    ? whyGone(selectedBody as BodySummary, cycle)
    : blockGone && !bodyPane
      ? whyGone(blockBody as BodySummary, cycle)
      : null;

  // Ward numbers are a division of a delimitation. Where the count moved
  // between two cycles, the body pane says so once.
  const beforeWards =
    before.status === "ready" && before.payload.available
      ? before.payload.total_wards
      : null;
  const nowWards = cycleResult?.total_wards ?? null;
  const delimitation =
    previous !== null && beforeWards !== null && nowWards !== null && beforeWards !== nowWards
      ? `${formatCount(nowWards)} wards in ${cycle}, ${formatCount(beforeWards)} in ${previous}. ` +
        "Ward numbers are not the same divisions across a delimitation."
      : null;

  // ---------------------------------------------------------------------
  // A new chapter is scrolled to; a new ward inside one is not
  // ---------------------------------------------------------------------

  // A climb is a chapter change of its own: the pane the reader was on has
  // gone, and they are moved to the sentence that says which and why rather
  // than left looking at the space it left.
  const chapter = `${paneKey(selection)}|${climb ? "climb" : ""}`;
  const target = useRef(entered);
  target.current = climb ? CLIMB : entered;
  // The chapter the page last settled on, rather than a "have we mounted"
  // flag: an effect that runs twice on one mount must not read as a move.
  const settled = useRef<string | null>(null);

  useEffect(() => {
    // The first paint is wherever the reader arrived, including a pasted link
    // three levels deep. Nothing has been chosen yet, so nothing is scrolled.
    if (settled.current === null || settled.current === chapter) {
      settled.current = chapter;
      return;
    }
    settled.current = chapter;

    let live = true;
    const stop = () => {
      live = false;
    };
    const scroll = () => {
      document
        .getElementById(target.current)
        ?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    };

    scroll();

    // The panes that have just opened are still fetching their boundaries, and
    // the page grows under the scroll as each arrives. So the scroll is
    // followed until the height settles — or until the reader takes over,
    // which ends it at once.
    window.addEventListener("wheel", stop, { passive: true, once: true });
    window.addEventListener("touchstart", stop, { passive: true, once: true });
    window.addEventListener("keydown", stop, { once: true });

    let first = true;
    const observer =
      typeof ResizeObserver === "function"
        ? new ResizeObserver(() => {
            if (first) {
              first = false;
              return;
            }
            if (live) scroll();
          })
        : null;
    observer?.observe(document.body);
    const done = window.setTimeout(stop, 1500);

    return () => {
      stop();
      observer?.disconnect();
      window.clearTimeout(done);
      window.removeEventListener("wheel", stop);
      window.removeEventListener("touchstart", stop);
      window.removeEventListener("keydown", stop);
    };
  }, [chapter]);

  return (
    <div className="shell-container section-page">
      <div className={styles.cycleBar}>
        <CycleSlider
          cycle={cycle}
          // A ward never crosses a delimitation. The rest of the drill does.
          onChange={(next) => go({ cycle: next, district, block, lbCode, ward: null })}
        />
      </div>

      {fronts.status === "error" ? (
        <p className="notice" role="alert">
          {fronts.message}
        </p>
      ) : null}

      <Pane
        id={PANE.state}
        top
        crumb={{ label: "Kerala", to: level === "state" ? undefined : electionsPath({ cycle }) }}
        heading={`Kerala's 14 districts by the front that runs the district panchayat, ${cycle}`}
        foot={
          district === null && climb ? (
            <p id={CLIMB} className={styles.climb} role="status">
              {climb}
            </p>
          ) : null
        }
      >
        {fronts.status === "ready" ? (
          <DrillMap
            title={`Districts of Kerala by ruling front, ${cycle}`}
            units={districtUnits(fronts.payload)}
            variant="area"
            unitNoun="district"
            cycle={cycle}
            geometry={districtsGeo}
            onSelect={(name) => drill("district", { cycle, district: name })}
          />
        ) : (
          <p className="selector-status" aria-busy="true">
            Loading the {cycle} results…
          </p>
        )}
      </Pane>

      {district ? (
        <>
          <Pane
            id={PANE.districtOwn}
            crumb={{
              label: district,
              to: level === "district" ? undefined : electionsPath({ cycle, district }),
            }}
            heading={`${district} District Panchayat`}
            result={
              districtEntry ? (
                <OwnResult
                  front={districtEntry.ruling_front}
                  controlType={districtEntry.control_type}
                  wards={districtPanchayat?.total_wards ?? null}
                  lbCode={districtEntry.lb_code}
                  cycle={cycle}
                />
              ) : (
                <p className={styles.ownResult}>
                  <span>The district panchayat has no result for {cycle}.</span>
                </p>
              )
            }
          >
            {null}
          </Pane>

          <Pane
            id={PANE.blocks}
            heading={`${formatCount(blockEntries.length)} block panchayats in ${district}, ${cycle}`}
          >
            <DrillMap
              title={`Block panchayats in ${district} by ruling front, ${cycle}`}
              units={tierUnits(
                blockEntries,
                nameOf,
                null,
                (name) => `Click to open the grama panchayats in ${name}.`,
              )}
              variant="area"
              unitNoun="block panchayat"
              cycle={cycle}
              geometry={blocksGeo}
              onSelect={(code) => drill("block", { cycle, district, block: code })}
            />
            <Alongside bodies={urbanEntries} nameOf={nameOf} cycle={cycle} />
            <Unplaced
              label={NO_POLYGON_LABEL}
              explanation={`The ${cycle} block panchayat layer holds no polygon for these. Their results are published all the same.`}
              bodies={noBlockPolygon}
              cycle={cycle}
            />
          </Pane>

          <Pane
            id={PANE.bodies}
            heading={`${formatCount(directEntries.length)} grama panchayats and urban bodies in ${district}, ${cycle}`}
            foot={
              climb ? (
                <p id={CLIMB} className={styles.climb} role="status">
                  {climb}
                </p>
              ) : null
            }
          >
            <DrillMap
              title={`Grama panchayats and urban bodies in ${district} by ruling front, ${cycle}`}
              units={tierUnits(
                directEntries,
                nameOf,
                lbCode,
                (name) => `Click to open the wards of ${name}.`,
              )}
              variant="area"
              unitNoun="local body"
              cycle={cycle}
              geometry={bodiesGeo}
              onSelect={(code) => drill("body", { cycle, lbCode: code })}
            />
            <Unplaced
              label={NO_POLYGON_LABEL}
              explanation={`The ${cycle} local body layer holds no polygon for these. Their results are published all the same.`}
              bodies={noBodyPolygon}
              cycle={cycle}
            />
            <Unplaced
              label={NO_SUCCESSOR_LABEL}
              explanation={NO_SUCCESSOR_NOTE}
              bodies={noSuccessor}
              cycle={cycle}
            />
          </Pane>
        </>
      ) : null}

      {blockPane && block ? (
        <Pane
          id={PANE.inBlock}
          crumb={{
            label: nameOf(block),
            to: level === "block" ? undefined : electionsPath({ cycle, district, block }),
          }}
          heading={`${formatCount(inBlockEntries.length)} grama panchayats in ${nameOf(block)} Block Panchayat, ${cycle}`}
          result={
            blockEntry ? (
              <OwnResult
                front={blockEntry.ruling_front}
                controlType={blockEntry.control_type}
                wards={blockEntry.total_wards}
                lbCode={blockEntry.lb_code}
                cycle={cycle}
              />
            ) : null
          }
        >
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
            geometry={inBlockGeo}
            onSelect={(code) => drill("body", { cycle, lbCode: code, block })}
          />
        </Pane>
      ) : null}

      {bodyPane ? (
        <Pane
          id={PANE.body}
          crumb={{
            label: selectedBody?.lb_name_en ?? openBody ?? "",
            to:
              level === "body"
                ? undefined
                : electionsPath({ cycle, lbCode: openBody, block }),
          }}
          heading={`Wards of ${bodyName}, ${cycle}`}
          result={
            cycleResult ? (
              <OwnResult
                front={cycleResult.ruling_front}
                controlType={cycleResult.control_type}
                wards={cycleResult.total_wards}
                lbCode={null}
                cycle={cycle}
                note={delimitation}
              />
            ) : null
          }
        >
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
            <div className={styles.split}>
              <div className={styles.mapColumn}>
                <DrillMap
                  title={`Wards of ${bodyName} by winning front, ${cycle}`}
                  units={wardUnits(cycleResult, ward)}
                  variant="ward"
                  unitNoun="ward"
                  cycle={cycle}
                  geometry={wardsGeo}
                  outline={featureFor(
                    selectedBody?.lb_type === "Block Panchayat" ? blocksGeo : bodiesGeo,
                    openBody,
                  )}
                  onSelect={(wardNo) =>
                    drill("ward", { cycle, lbCode: openBody, block, ward: Number(wardNo) })
                  }
                />
              </div>

              <div className="flex flex-col gap-s7">
                <SeatsBar result={cycleResult} />
                <WardTable
                  result={cycleResult}
                  selectedWard={ward}
                  onSelect={(wardNo) => go({ cycle, lbCode: openBody, block, ward: wardNo })}
                />
              </div>
            </div>
          ) : null}
        </Pane>
      ) : null}

      {wardPane && cycleResult && selectedWardRow ? (
        <Pane
          id={PANE.ward}
          crumb={{ label: `Ward ${ward}` }}
          heading={`${wardLabel(selectedWardRow)}, ${bodyName}, ${cycle}`}
        >
          <SelectedCard
            key={`card-${ward}`}
            ward={selectedWardRow}
            bodyName={bodyName}
            cycle={cycle}
          />
          <CandidatesTable
            key={`candidates-${ward}`}
            candidates={candidatesInWard(cycleResult.candidates, ward)}
            ward={selectedWardRow}
            cycle={cycle}
          />
        </Pane>
      ) : null}

      <BodySelector section="elections" />

      {maps.status === "ready" ? <Sources maps={maps.payload} /> : null}

      {maps.status === "error" ? (
        <p className="notice" role="alert">
          {maps.message}
        </p>
      ) : null}
    </div>
  );
}
