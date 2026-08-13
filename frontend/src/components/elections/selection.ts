/**
 * Where the reader is on the map, held entirely in the URL.
 *
 * Four levels, four addresses:
 *
 *   /elections?cycle=2025                       Kerala, fourteen districts
 *   /elections?cycle=2025&district=THRISSUR     one district, its local bodies
 *   /elections/M08032/2025                      one local body, its wards
 *   /elections/M08032/2025?ward=7               one ward, its result
 *
 * The cycle is in the path once a body is chosen, because the route already
 * carries it there, and in the query before that, because there is no path
 * segment for a cycle without a body. Both are read here so walking back out
 * of a body never drops the cycle the reader picked.
 */

import { CYCLES, LATEST_CYCLE } from "./payload";

export type Level = "state" | "district" | "body" | "ward";

export interface Selection {
  district: string | null;
  lbCode: string | null;
  cycle: number;
  ward: number | null;
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

  const wardParam = search.get("ward");
  const ward = lbCode && wardParam !== null && wardParam !== "" ? Number(wardParam) : null;

  let level: Level = "state";
  if (lbCode && ward !== null) level = "ward";
  else if (lbCode) level = "body";
  else if (district) level = "district";

  return { district, lbCode, cycle, ward, level };
}

/** The address for a selection. The one place a link on this page is built. */
export function electionsPath(next: {
  district?: string | null;
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
  return `/elections?${query.toString()}`;
}
