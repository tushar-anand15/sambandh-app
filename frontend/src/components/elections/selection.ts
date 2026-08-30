/**
 * Where the reader is on the map, held entirely in the URL.
 *
 * The page is chapters that stack: choosing a district appends the panes for
 * that district below the state map and leaves the state map on screen, so
 * every level a reader has opened is still there to be scrolled back to. What
 * makes that work is that a pane is not a mode. It is a level of one address,
 * and the address holds all of them at once.
 *
 * Five addresses:
 *
 *   /elections?cycle=2025                         Kerala, fourteen districts
 *   /elections?cycle=2025&district=THRISSUR       its three tiers, stacked
 *   /elections?cycle=2025&district=THRISSUR&block=B08076
 *                                                 the grama panchayats in one block
 *   /elections/M08032/2025                        one body, its wards
 *   /elections/G08001/2025?block=B08076           the same, reached through a block
 *   /elections/M08032/2025?ward=7                 one ward, its result
 *
 * A district used to carry a `tier` too, choosing between its block panchayats
 * and its grama panchayats. Both are drawn now, one pane under the other, so
 * there is nothing left to choose and the parameter is gone.
 *
 * The cycle is in the path once a body is chosen, because the route already
 * carries it there, and in the query before that, because there is no path
 * segment for a cycle without a body. Both are read here so walking back out
 * of a body never drops the cycle the reader picked.
 *
 * The district stays in the query alongside `block`, because a block's grama
 * panchayats are cut out of the district's slice and the address has to carry
 * enough to ask for it without a lookup.
 */

import { CYCLES, LATEST_CYCLE } from "./payload";

export type Level = "state" | "district" | "block" | "body" | "ward";

export interface Selection {
  district: string | null;
  /** A block panchayat's lb_code, once the reader has opened one. */
  block: string | null;
  lbCode: string | null;
  cycle: number;
  ward: number | null;
  /** The deepest level the address reaches. Every level above it is open too. */
  level: Level;
}

function readCycle(value: string | null | undefined): number | null {
  const parsed = Number(value);
  return (CYCLES as readonly number[]).includes(parsed) ? parsed : null;
}

export function readSelection(
  params: { lb?: string; cycle?: string },
  search: URLSearchParams,
  /** The district of the selected body, once the body list has loaded. */
  bodyDistrict: string | null,
): Selection {
  const lbCode = params.lb ?? null;
  const cycle = readCycle(params.cycle) ?? readCycle(search.get("cycle")) ?? LATEST_CYCLE;
  const district = bodyDistrict ?? search.get("district");
  // A body reached through a block keeps the block in the address, so the
  // block's pane stays open above it and going back to it is a scroll.
  const block = search.get("block") || null;

  const wardParam = search.get("ward");
  const ward = lbCode && wardParam !== null && wardParam !== "" ? Number(wardParam) : null;

  let level: Level = "state";
  if (lbCode && ward !== null) level = "ward";
  else if (lbCode) level = "body";
  else if (block && district) level = "block";
  else if (district) level = "district";

  return { district, block, lbCode, cycle, ward, level };
}

/** The address for a selection. The one place a link on this page is built. */
export function electionsPath(next: {
  district?: string | null;
  block?: string | null;
  lbCode?: string | null;
  cycle: number;
  ward?: number | null;
}): string {
  if (next.lbCode) {
    const query = new URLSearchParams();
    if (next.block) query.set("block", next.block);
    if (next.ward !== null && next.ward !== undefined) query.set("ward", String(next.ward));
    const search = query.toString();
    return `/elections/${next.lbCode}/${next.cycle}${search ? `?${search}` : ""}`;
  }

  const query = new URLSearchParams({ cycle: String(next.cycle) });
  if (next.district) query.set("district", next.district);
  if (next.district && next.block) query.set("block", next.block);
  return `/elections?${query.toString()}`;
}

/**
 * Which pane a selection rests at, as a key.
 *
 * Two selections with the same key are the same chapter, so moving between
 * them is not a new chapter to scroll to. Moving from ward 7 to ward 8 is one
 * of those; opening a district is not. The cycle is deliberately absent: it
 * re-colours every open pane and moves the reader nowhere.
 */
export function paneKey(selection: Selection): string {
  const { district, block, lbCode, level } = selection;
  return [district ?? "", block ?? "", lbCode ?? "", level === "ward" ? "ward" : ""].join(
    "|",
  );
}
