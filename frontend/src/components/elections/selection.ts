/**
 * Where the reader is on the map, held entirely in the URL.
 *
 * Rural Kerala elects three bodies over the same ground — a grama panchayat, a
 * block panchayat, a district panchayat — so "inside a district" is not one
 * level but a choice between them. The tier is therefore part of the address
 * like everything else here, and a link carries which of the three elections
 * the reader was looking at.
 *
 * Six addresses:
 *
 *   /elections?cycle=2025                         Kerala, fourteen districts
 *   /elections?cycle=2025&district=THRISSUR       its block panchayats
 *   /elections?cycle=2025&district=THRISSUR&tier=grama_panchayat
 *                                                 its grama panchayats and ULBs
 *   /elections?cycle=2025&district=THRISSUR&block=B08076
 *                                                 the grama panchayats in one block
 *   /elections/M08032/2025                        one body, its wards
 *   /elections/M08032/2025?ward=7                 one ward, its result
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

/**
 * Which of a district's two lower tiers is on the map.
 *
 * The district panchayat is not one of these. It is a single body, so
 * "the district panchayat's own result" is its body view — an address that
 * already exists — rather than a third way of drawing the district.
 */
export type Tier = "block_panchayat" | "grama_panchayat";

export const TIERS: readonly Tier[] = ["block_panchayat", "grama_panchayat"];

/**
 * Block panchayats first. It is the tier the site could not show at all
 * before, and it is the step that makes the district's three elections
 * legible: the reader meets the middle tier before the 70-odd bodies below it.
 */
export const DEFAULT_TIER: Tier = "block_panchayat";

export interface Selection {
  district: string | null;
  /** A block panchayat's lb_code, once the reader has opened one. */
  block: string | null;
  /** Which tier a district shows. Meaningless above and below that level. */
  tier: Tier;
  lbCode: string | null;
  cycle: number;
  ward: number | null;
  level: Level;
}

function readCycle(value: string | null | undefined): number | null {
  const parsed = Number(value);
  return (CYCLES as readonly number[]).includes(parsed) ? parsed : null;
}

function readTier(value: string | null): Tier {
  return (TIERS as readonly string[]).includes(value ?? "") ? (value as Tier) : DEFAULT_TIER;
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
  const block = lbCode ? null : (search.get("block") || null);
  const tier = readTier(search.get("tier"));

  const wardParam = search.get("ward");
  const ward = lbCode && wardParam !== null && wardParam !== "" ? Number(wardParam) : null;

  let level: Level = "state";
  if (lbCode && ward !== null) level = "ward";
  else if (lbCode) level = "body";
  else if (block && district) level = "block";
  else if (district) level = "district";

  return { district, block, tier, lbCode, cycle, ward, level };
}

/** The address for a selection. The one place a link on this page is built. */
export function electionsPath(next: {
  district?: string | null;
  block?: string | null;
  tier?: Tier | null;
  lbCode?: string | null;
  cycle: number;
  ward?: number | null;
}): string {
  if (next.lbCode) {
    const ward = next.ward === null || next.ward === undefined ? "" : `?ward=${next.ward}`;
    return `/elections/${next.lbCode}/${next.cycle}${ward}`;
  }

  const query = new URLSearchParams({ cycle: String(next.cycle) });
  if (next.district) query.set("district", next.district);
  if (next.district && next.block) query.set("block", next.block);
  // The default tier is left out, so the plainest view of a district has the
  // plainest address and a shared link is not longer than what it says.
  if (next.district && !next.block && next.tier && next.tier !== DEFAULT_TIER) {
    query.set("tier", next.tier);
  }
  return `/elections?${query.toString()}`;
}
