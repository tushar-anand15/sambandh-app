/**
 * MSW handler for the method endpoint.
 *
 * Mirrors `backend/app/routers/method.py` field for field. Registered by the
 * method page's own tests with `server.use(...)` rather than in `setup.ts`,
 * because `/api/method` is the one router in this unit that `main.py` does not
 * yet wire, and a global handler would let a page reach an endpoint the
 * deployment does not serve without a test noticing.
 *
 * The figures are the master database's, from the build of 13 August 2026:
 * 1,208 local bodies listed for 2012-13 against 1,200 from 2016-17, and 29
 * entering against 36 leaving in 2015-16.
 */

import { http, HttpResponse } from "msw";

import { provenance } from "./handlers";

const BODIES_BY_YEAR = [
  { year_label: "2012-2013", bodies: 1208, entered: null, left: null },
  { year_label: "2013-2014", bodies: 1209, entered: 1, left: 0 },
  { year_label: "2014-2015", bodies: 1209, entered: 0, left: 0 },
  { year_label: "2015-2016", bodies: 1202, entered: 29, left: 36 },
  { year_label: "2016-2017", bodies: 1200, entered: 0, left: 2 },
  { year_label: "2017-2018", bodies: 1200, entered: 0, left: 0 },
  { year_label: "2018-2019", bodies: 1200, entered: 0, left: 0 },
  { year_label: "2019-2020", bodies: 1200, entered: 0, left: 0 },
  { year_label: "2020-2021", bodies: 1200, entered: 0, left: 0 },
  { year_label: "2021-2022", bodies: 1200, entered: 0, left: 0 },
  { year_label: "2022-2023", bodies: 1200, entered: 0, left: 0 },
  { year_label: "2023-2024", bodies: 1200, entered: 0, left: 0 },
  { year_label: "2024-2025", bodies: 1200, entered: 0, left: 0 },
  { year_label: "2025-2026", bodies: 1200, entered: 0, left: 0 },
];

/** Statewide, per year. Meetings begin in 2015-16 with 245 of them. */
const COVERAGE = [
  ["2012-2013", 1208, 184645, 85947000000, 0, 0],
  ["2013-2014", 1209, 206340, 106805000000, 0, 0],
  ["2014-2015", 1209, 222857, 119176000000, 0, 0],
  ["2015-2016", 1202, 227255, 124452000000, 99, 245],
  ["2016-2017", 1200, 216033, 125491000000, 545, 8989],
  ["2017-2018", 1200, 261510, 149620000000, 1111, 30058],
  ["2018-2019", 1200, 262783, 196223000000, 1118, 34647],
  ["2019-2020", 1200, 280932, 198959000000, 1130, 33812],
  ["2020-2021", 1200, 304157, 219983000000, 1147, 29785],
  ["2021-2022", 1200, 247990, 204880000000, 1159, 38699],
  ["2022-2023", 1200, 265292, 233103000000, 1168, 46966],
  ["2023-2024", 1200, 291083, 274292000000, 1197, 68889],
  ["2024-2025", 1200, 350072, 304765000000, 1198, 91638],
  ["2025-2026", 1200, 284503, 234139000000, 1198, 59507],
] as const;

export const methodPayload = {
  build: {
    dataset: "Gram Sambandh master database",
    built_at: "2026-08-13T06:56:01.751100+00:00",
    master_version: "0.1.0",
    source_dumps: [
      "sulekha_backup_20260507_patched.dump",
      "sakarma_backup_20260812.dump",
    ],
    bodies: 1238,
    projects: 3605452,
    meetings: 443235,
    candidates: 296095,
  },
  bodies_by_year: BODIES_BY_YEAR,
  body_diff_note:
    "A local body is counted in a year when the Sulekha portal lists it for that year. Entering and leaving are counted against the previous year's list. The portal records the list, not the reason it changed, so a body that leaves may have been merged, split, renamed or reclassified, and the four are not distinguishable here.",
  dataset_coverage: COVERAGE.map(
    ([year, financeBodies, projects, formulation, meetingBodies, meetings]) => ({
      year_label: year,
      is_complete: year !== "2025-2026",
      finance_bodies: financeBodies,
      projects,
      formulation,
      expense: null,
      meeting_bodies: meetingBodies,
      meetings,
    }),
  ),
  meetings_coverage_note:
    "Sakarma covers more local bodies every year. The early years hold very few meetings, and the last full year holds nearly all of them.",
  boundary_vintage: [
    {
      cycle: 2025,
      level: "ward",
      source: "KSMART vector tiles",
      boundary_vintage: "current (KSMART tile server)",
      per_cycle_delimitation: true,
      note: null,
    },
    {
      cycle: 2020,
      level: "local_body",
      source: "opendatakerala LSG release (OpenStreetMap)",
      boundary_vintage: "November 2020 snapshot",
      per_cycle_delimitation: true,
      note: "The snapshot's own vintage matches this cycle.",
    },
    {
      cycle: 2015,
      level: "local_body",
      source: "opendatakerala LSG release (OpenStreetMap)",
      boundary_vintage: "November 2020 snapshot",
      per_cycle_delimitation: false,
      note: "The November 2020 snapshot reused. No 2015-vintage boundary set has been published.",
    },
    {
      cycle: 2010,
      level: "local_body",
      source: "opendatakerala LSG release (OpenStreetMap)",
      boundary_vintage: "November 2020 snapshot",
      per_cycle_delimitation: false,
      note: "The November 2020 snapshot reused, and the largest approximation of the three: 47 of 2010's 1,208 bodies have no 2020-vintage counterpart and are absent from the layer.",
    },
  ],
  ward_geometry_note:
    "No ward-level geometry exists for 2010, 2015 or 2020. opendatakerala publishes local-body polygons only, and no alternative source has been published.",
  provenance: {
    ...provenance,
    source:
      "Gram Sambandh master database, built by sulekha from the Sulekha and Sakarma portal dumps and the State Election Commission's own exports",
  },
};

export const handlers = [
  http.get("*/api/method", () => HttpResponse.json(methodPayload)),
];
