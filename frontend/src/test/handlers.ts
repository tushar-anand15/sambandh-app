/**
 * MSW handlers mirroring the public API contract.
 *
 * One file, deliberately. The contract worth protecting is the endpoint payload
 * shape, so a payload change should break here — once — rather than in twenty
 * per-component `fetch` stubs that would each keep passing against a shape the
 * backend no longer returns.
 *
 * The figures are the fixture slice's, which are the master database's:
 * Chalakudy Municipality 2023-24 really is 357 projects, ₹23.88 cr formulated
 * and ₹11.69 cr spent. Keeping them true means a frontend assertion and a
 * backend assertion can quote the same number.
 *
 * Endpoints land in Unit 4. These handlers are the contract they are written
 * against; when an endpoint ships, its handler here is the thing to reconcile.
 */

import { http, HttpResponse } from "msw";

/** Every response carries its source, so no page hardcodes provenance. */
export interface Provenance {
  dataset: string;
  build_date: string;
}

export interface BodySummary {
  lb_code: string;
  lb_name_en: string;
  lb_name_ml: string | null;
  district_name: string;
  lb_type: string;
  has_meetings: boolean;
  has_geometry: boolean;
  in_elections: boolean;
}

/**
 * A section a body has no data for. Never a bare `[]` — the UI renders "not
 * covered", "no record for this year" and "none held" differently, and
 * collapsing them into an empty array produces a page that reads as broken.
 */
export interface Unavailable {
  available: false;
  reason: string;
  provenance: Provenance;
}

export const provenance: Provenance = {
  dataset: "Gram Sambandh master database",
  build_date: "2026-08-13",
};

export const unavailable = (reason: string): Unavailable => ({
  available: false,
  reason,
  provenance,
});

/** The seven bodies in backend/tests/fixtures/master_slice.sql. */
export const bodies: BodySummary[] = [
  {
    lb_code: "M08032",
    lb_name_en: "Chalakudy",
    lb_name_ml: "ചാലക്കുടി",
    district_name: "THRISSUR",
    lb_type: "Municipality",
    has_meetings: true,
    has_geometry: true,
    in_elections: true,
  },
  {
    lb_code: "M13057",
    lb_name_en: "Mattannur",
    lb_name_ml: "മട്ടന്നൂർ",
    district_name: "KANNUR",
    lb_type: "Municipality",
    has_meetings: true,
    has_geometry: false,
    in_elections: false,
  },
  {
    lb_code: "B03024",
    lb_name_en: "Pulikkeezhu",
    lb_name_ml: null,
    district_name: "PATHANAMTHITTA",
    lb_type: "Block Panchayat",
    has_meetings: true,
    has_geometry: false,
    in_elections: true,
  },
  {
    lb_code: "M07025",
    lb_name_en: "Aluva",
    lb_name_ml: null,
    district_name: "ERNAKULAM",
    lb_type: "Municipality",
    has_meetings: true,
    has_geometry: true,
    in_elections: true,
  },
  {
    lb_code: "G04036",
    lb_name_en: "Muttar",
    lb_name_ml: null,
    district_name: "ALAPPUZHA",
    lb_type: "Grama Panchayat",
    has_meetings: true,
    has_geometry: true,
    in_elections: true,
  },
  {
    lb_code: "G13064",
    lb_name_en: "Panoor",
    lb_name_ml: null,
    district_name: "KANNUR",
    lb_type: "Grama Panchayat",
    has_meetings: false,
    has_geometry: false,
    in_elections: true,
  },
  {
    lb_code: "D12001",
    lb_name_en: "WAYANAD",
    lb_name_ml: null,
    district_name: "WAYANAD",
    lb_type: "District Panchayat",
    has_meetings: true,
    has_geometry: false,
    in_elections: true,
  },
];

/** Chalakudy 2023-24, unrounded, exactly as the fixture slice holds it. */
export const chalakudyFinances = {
  lb_code: "M08032",
  year_label: "2023-2024",
  is_complete: true,
  projects: 357,
  formulation: 238806688,
  expense: 116913203,
  expense_pct: 49.0,
  also_in_prev_year: 140,
  first_seen_this_year: 214,
  provenance,
};

export const chalakudyMeetings = {
  lb_code: "M08032",
  year_label: "2023-2024",
  available: true as const,
  meetings: 64,
  governing_body: 18,
  standing_committee: 46,
  ordinary: 31,
  special: 33,
  first_meeting: "2023-04-05",
  last_meeting: "2024-03-27",
  provenance,
};

const knownCode = (code: string) => bodies.some((b) => b.lb_code === code);

const notFound = (code: string) =>
  HttpResponse.json({ detail: `No local body with code ${code}` }, { status: 404 });

export const handlers = [
  http.get("*/api/bodies", () => HttpResponse.json({ bodies, provenance })),

  http.get("*/api/finances/:lb/:year", ({ params }) => {
    const { lb, year } = params as { lb: string; year: string };
    if (!knownCode(lb)) return notFound(lb);
    if (lb === "M08032" && year === "2023-2024") {
      return HttpResponse.json(chalakudyFinances);
    }
    return HttpResponse.json({
      ...chalakudyFinances,
      lb_code: lb,
      year_label: year,
      is_complete: year !== "2025-2026",
    });
  }),

  http.get("*/api/meetings/:lb/:year", ({ params }) => {
    const { lb, year } = params as { lb: string; year: string };
    if (!knownCode(lb)) return notFound(lb);
    const body = bodies.find((b) => b.lb_code === lb)!;
    if (!body.has_meetings) {
      return HttpResponse.json(
        unavailable("Sakarma holds no meeting record for this body."),
      );
    }
    return HttpResponse.json({ ...chalakudyMeetings, lb_code: lb, year_label: year });
  }),

  http.get("*/api/elections/:lb/:cycle", ({ params }) => {
    const { lb } = params as { lb: string; cycle: string };
    if (!knownCode(lb)) return notFound(lb);
    const body = bodies.find((b) => b.lb_code === lb)!;
    if (!body.in_elections) {
      return HttpResponse.json(
        unavailable("The State Election Commission published no result for this body."),
      );
    }
    return HttpResponse.json({
      lb_code: lb,
      cycle: 2025,
      available: true,
      total_wards: 33,
      ruling_front: "LDF",
      seats: { LDF: 18, UDF: 12, NDA: 3, OTH: 0 },
      provenance,
    });
  }),
];
