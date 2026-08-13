/**
 * MSW handlers for elections and the boundary layers.
 *
 * Owned by the Elections section. The payloads mirror
 * `backend/app/routers/elections.py`, `maps.py` and `geo.py` field for field,
 * so a change to any of those breaks here once rather than passing against a
 * shape the backend no longer returns.
 *
 * The figures are the fixture slice's where the slice has them: Chalakudy's
 * 2020 result really is 36 wards, LDF 1 / UDF 25 / NDA 0 / OTH 10, UDF in
 * control by majority, and its 2025 result really has 37 wards. The ward rows
 * are generated, because 36 hand-written rows would be 36 chances to disagree
 * with the totals above them.
 */

import { http, HttpResponse } from "msw";

import { bodies, knownCode, notFound, provenance } from "./handlers";

const electionsProvenance = {
  ...provenance,
  source: "Kerala State Election Commission",
};

const mapsProvenance = {
  ...provenance,
  source: "KSMART vector tiles and the opendatakerala OpenStreetMap release",
};

// ---------------------------------------------------------------------------
// Results, per body and cycle
// ---------------------------------------------------------------------------

/** Ward counts per body-cycle. Chalakudy's are the fixture slice's own. */
const WARD_COUNTS: Record<string, Record<number, number>> = {
  M08032: { 2010: 36, 2015: 36, 2020: 36, 2025: 37 },
  M07025: { 2010: 26, 2015: 26, 2020: 26, 2025: 26 },
  G04036: { 2010: 13, 2015: 13, 2020: 13, 2025: 14 },
  B03024: { 2010: 13, 2015: 13, 2020: 13, 2025: 14 },
  G13064: { 2010: 16, 2015: 16 },
  D12001: { 2010: 16, 2015: 16, 2020: 16, 2025: 17 },
};

/** The ruling front per body-cycle. An absent entry is a hung result. */
const RULING: Record<string, Record<number, string>> = {
  M08032: { 2010: "UDF", 2020: "UDF", 2025: "UDF" },
  M07025: { 2010: "UDF", 2015: "UDF", 2020: "UDF", 2025: "LDF" },
  G04036: { 2010: "LDF", 2015: "UDF", 2025: "UDF" },
  B03024: { 2010: "LDF", 2015: "LDF", 2020: "LDF", 2025: "LDF" },
  G13064: { 2010: "UDF", 2015: "LDF" },
  D12001: { 2010: "UDF", 2015: "UDF", 2025: "UDF" },
};

const RESERVATIONS = ["General", "Woman", "SC", "SC Woman"];
const PARTIES: Record<string, string> = {
  LDF: "CPI(M)",
  UDF: "INC",
  NDA: "BJP",
  OTH: "IND",
};

function frontOfWard(index: number, ruling: string | null): string {
  if (ruling && index % 3 !== 2) return ruling;
  return ["LDF", "UDF", "NDA", "OTH"][index % 4];
}

function wardRow(lb: string, cycle: number, index: number, ruling: string | null) {
  const front = frontOfWard(index, ruling);
  const wardNo = index + 1;
  const winnerVotes = 600 + index * 7;
  // Ward 3 stood uncontested, so it has no runner-up and no margin.
  const uncontested = wardNo === 3;
  const runnerupVotes = uncontested ? null : 380 + index * 3;
  const margin = runnerupVotes === null ? null : winnerVotes - runnerupVotes;
  const valid = winnerVotes + (runnerupVotes ?? 0) + 120;

  return {
    ward_no: wardNo,
    ward_code: `${lb}${String(wardNo).padStart(3, "0")}`,
    ward_name: `${lb === "M08032" ? "Chalakudy" : "Ward"} ${wardNo} Division`,
    ward_name_ml: null,
    reservation: RESERVATIONS[index % RESERVATIONS.length],
    winner_name: `Winner ${wardNo} of ${cycle}`,
    winner_party: PARTIES[front],
    winner_front: front,
    winner_votes: winnerVotes,
    winner_role: null,
    winner_gender: null,
    runnerup_name: uncontested ? null : `Runner-up ${wardNo}`,
    runnerup_votes: runnerupVotes,
    margin,
    margin_pct: margin === null ? null : Math.round((10000 * margin) / valid) / 100,
    valid_votes: valid,
    invalid_votes: 12,
    candidates: uncontested ? 1 : 4,
    uncontested,
    tie: false,
  };
}

function seatsFrom(wards: ReturnType<typeof wardRow>[]) {
  const seats: Record<string, number> = { LDF: 0, UDF: 0, NDA: 0, OTH: 0 };
  for (const ward of wards) seats[ward.winner_front] += 1;
  return seats;
}

function bodyBlock(lb: string) {
  const body = bodies.find((entry) => entry.lb_code === lb)!;
  return {
    lb_name_en: body.lb_name_en,
    lb_name_ml: body.lb_name_ml,
    district_name: body.district_name,
    lb_type: body.lb_type,
  };
}

const NO_RESULT_PUBLISHED =
  "The State Election Commission published no result for this body, " +
  "so it has no ward, candidate or seat figures in any cycle.";

export function cyclePayload(lb: string, cycle: number) {
  const body = bodies.find((entry) => entry.lb_code === lb)!;
  const base = {
    lb_code: lb,
    cycle,
    body: bodyBlock(lb),
    in_elections: body.in_elections,
    first_cycle: body.first_cycle,
    last_cycle: body.last_cycle,
  };

  if (!body.in_elections) {
    return {
      ...base,
      available: false as const,
      reason_code: "no_result_published" as const,
      reason: NO_RESULT_PUBLISHED,
      provenance: electionsProvenance,
    };
  }

  const first = body.first_cycle;
  const last = body.last_cycle;
  // The body list's own cycle bounds win over the ward counts below, so a body
  // whose first cycle moves in a test reads as not yet constituted before it.
  const constituted = (!first || cycle >= first) && (!last || cycle <= last);
  const total = constituted ? WARD_COUNTS[lb]?.[cycle] : undefined;
  if (!total) {
    let reason: string;
    if (first && cycle < first) {
      reason = `This body was not constituted for the ${cycle} cycle; its results begin in ${first}.`;
    } else if (last && cycle > last) {
      reason = `This body has no result after ${last}, so the ${cycle} cycle shows nothing.`;
    } else {
      reason = `The State Election Commission published no result for this body in the ${cycle} cycle.`;
    }
    return {
      ...base,
      available: false as const,
      reason_code: "no_result_for_cycle" as const,
      reason,
      provenance: electionsProvenance,
    };
  }

  const ruling = RULING[lb]?.[cycle] ?? null;
  const wards = Array.from({ length: total }, (_, i) => wardRow(lb, cycle, i, ruling));
  const seats = seatsFrom(wards);
  const largest = Object.entries(seats).sort((a, b) => b[1] - a[1])[0];

  return {
    ...base,
    available: true as const,
    reason_code: null,
    seats,
    total_wards: total,
    majority_threshold: Math.floor(total / 2) + 1,
    largest_front: largest[0],
    largest_front_seats: largest[1],
    ruling_front: ruling,
    control_type: ruling ? "majority" : "hung",
    head: null,
    wards,
    candidates: [],
    provenance: electionsProvenance,
  };
}

// ---------------------------------------------------------------------------
// Boundary layers
// ---------------------------------------------------------------------------

const KSMART = {
  source: "KSMART vector tiles",
  boundary_vintage: "current (KSMART tile server)",
  per_cycle_delimitation: true,
  licence: null as string | null,
  licence_note:
    "KSMART publishes no open licence for this data. Redistribution terms are unstated.",
  attribution: "KSMART, Government of Kerala",
};

const OSM = {
  source: "opendatakerala LSG release (OpenStreetMap)",
  boundary_vintage: "November 2020 snapshot",
  per_cycle_delimitation: false,
  licence: "ODbL 1.0" as string | null,
  licence_note:
    "Attribution required on any redistribution, including a rendered image.",
  attribution: "© OpenStreetMap contributors",
};

/** Seven layers: four from KSMART's 2025 tiles, three from opendatakerala. */
const LAYERS = [
  { id: "wards_2025", label: "Wards, 2025", level: "ward", cycle: 2025, ...KSMART, bytes: 59626470 },
  {
    id: "local_bodies_2025",
    label: "Local bodies, 2025",
    level: "local_body",
    cycle: 2025,
    ...KSMART,
    bytes: 11183162,
  },
  {
    id: "block_panchayats_2025",
    label: "Block panchayats, 2025",
    level: "block_panchayat",
    cycle: 2025,
    ...KSMART,
    bytes: 15199635,
  },
  {
    id: "district_panchayats_2025",
    label: "District panchayats, 2025",
    level: "district_panchayat",
    cycle: 2025,
    ...KSMART,
    bytes: 7498168,
  },
  {
    id: "local_bodies_2020",
    label: "Local bodies, 2020",
    level: "local_body",
    cycle: 2020,
    ...OSM,
    per_cycle_delimitation: true,
    note: "The snapshot's own vintage matches this cycle.",
    bytes: 7762231,
  },
  {
    id: "local_bodies_2015",
    label: "Local bodies, 2015",
    level: "local_body",
    cycle: 2015,
    ...OSM,
    per_cycle_delimitation: false,
    note: "The November 2020 snapshot reused. No 2015-vintage boundary set has been published.",
    bytes: 7763058,
  },
  {
    // The layer the current build does not emit: absent from the directory, and
    // named with the reason rather than offered as a download that would 404.
    id: "local_bodies_2010",
    label: "Local bodies, 2010",
    level: "local_body",
    cycle: 2010,
    ...OSM,
    per_cycle_delimitation: false,
    note:
      "The November 2020 snapshot reused, and the largest approximation of the three: " +
      "47 of 2010's 1,208 bodies have no 2020-vintage counterpart and are absent from the layer.",
    bytes: null,
  },
].map((layer) => ({
  ...layer,
  filename: `${layer.id}.geojson`,
  url: `/geo/${layer.id}.geojson`,
  format: "geojson",
  available: layer.bytes !== null,
  unavailable_reason:
    layer.bytes === null
      ? "This layer is not in the boundary layer directory this server was given. " +
        "It is emitted by sulekha's geo build and has to be copied into that directory " +
        "before it can be downloaded."
      : null,
}));

const WARD_GEOMETRY_NOTE =
  "No ward-level geometry exists for 2010, 2015 or 2020. opendatakerala publishes " +
  "local-body polygons only, and no alternative source has been published.";

/** A layer file, cut to two features. The `provenance` member is the point. */
function geojson(filename: string) {
  const osm = filename.startsWith("local_bodies_20") && !filename.includes("2025");
  return {
    type: "FeatureCollection",
    provenance: osm
      ? {
          source_url: "https://github.com/opendatakerala/lsg-kerala-data/releases",
          boundary_vintage: "November 2020 (opendatakerala OSM snapshot)",
          per_cycle_delimitation: false,
          licence: OSM.licence_note,
          accuracy:
            "Local-body boundaries only, from a single November 2020 OSM snapshot reused " +
            "across the 2010, 2015 and 2020 election cycles.",
        }
      : {
          source_url: "https://wardmap.ksmart.live/",
          scrape_zoom: 14,
          licence: KSMART.licence_note,
          accuracy:
            "Indicative, election-purpose boundaries reconstructed from vector tiles " +
            "scraped at zoom 14. Not cadastral.",
        },
    features: [
      {
        type: "Feature",
        properties: { lb_code: "M08032", lb_name: "Chalakudy" },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [76.33, 10.3],
              [76.34, 10.3],
              [76.34, 10.31],
              [76.33, 10.3],
            ],
          ],
        },
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export const handlers = [
  http.get("*/api/elections/fronts/:cycle", ({ params }) => {
    const cycle = Number((params as { cycle: string }).cycle);
    const entries = bodies
      .filter((body) => body.in_elections)
      .map((body) => {
        const ruling = RULING[body.lb_code]?.[cycle] ?? null;
        const total = WARD_COUNTS[body.lb_code]?.[cycle] ?? null;
        return {
          lb_code: body.lb_code,
          district_name: body.district_name,
          lb_type: body.lb_type,
          ruling_front: total ? ruling : null,
          control_type: total ? (ruling ? "majority" : "hung") : null,
          total_wards: total,
        };
      });

    const districts: Record<string, unknown>[] = [];
    for (const entry of entries) {
      let district = districts.find((d) => d.district_name === entry.district_name);
      if (!district) {
        district = {
          district_name: entry.district_name,
          bodies: 0,
          lb_code: null,
          ruling_front: null,
          control_type: null,
        };
        districts.push(district);
      }
      district.bodies = (district.bodies as number) + 1;
      if (entry.lb_type === "District Panchayat") {
        district.lb_code = entry.lb_code;
        district.ruling_front = entry.ruling_front;
        district.control_type = entry.control_type;
      }
    }

    return HttpResponse.json({
      cycle,
      bodies: entries,
      districts,
      count: entries.length,
      provenance: electionsProvenance,
    });
  }),

  http.get("*/api/elections/:lb/:cycle", ({ params }) => {
    const { lb, cycle } = params as { lb: string; cycle: string };
    if (!knownCode(lb)) return notFound(lb);
    return HttpResponse.json(cyclePayload(lb, Number(cycle)));
  }),

  http.get("*/api/maps", () =>
    HttpResponse.json({
      layers: LAYERS,
      count: LAYERS.length,
      coverage: { bodies: 1238, with_geometry: 1033, without_geometry: 205 },
      ward_geometry_note: WARD_GEOMETRY_NOTE,
      provenance: mapsProvenance,
    }),
  ),

  http.get("*/geo/:filename", ({ params }) => {
    const { filename } = params as { filename: string };
    const layer = LAYERS.find((entry) => entry.filename === filename);
    if (!layer) {
      return HttpResponse.json(
        { detail: `${filename} is not one of the 7 boundary layers.` },
        { status: 404 },
      );
    }
    if (!layer.available) {
      return HttpResponse.json({ detail: layer.unavailable_reason }, { status: 404 });
    }
    return HttpResponse.json(geojson(filename));
  }),
];
