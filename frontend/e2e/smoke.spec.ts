import { expect, test, type Page } from "@playwright/test";

/**
 * The app loads and React mounts. Nothing more.
 *
 * Assertions here are on things that survive the revamp: the document title,
 * the root element having been filled by React, the client-side router
 * answering a second route, and the console being free of errors. The landing
 * and explorer components are replaced in Unit 10, so a spec asserting their
 * copy would be a spec written to be deleted.
 *
 * The backend is not running for this spec, and must not need to be. Every
 * endpoint the first paint touches is fulfilled from a stub: a proxy with
 * nothing behind it logs a failed request, and the console-error assertion
 * below would then be measuring the absence of a backend rather than the health
 * of the first paint.
 *
 * Keep the stub in step with the page. When the home page began reading
 * Amboori's own figures it started calling two more endpoints, and because a
 * developer's backend is usually up, the gap only appeared in CI. The v4 home
 * page added four more: the statewide aggregate for 2020, Amboori's own 2020
 * result, and the two boundary slices panel 01 draws through.
 */

const PROVENANCE = {
  dataset: "Gram Sambandh master database",
  build_date: "2026-08-13",
};

async function stubPublicApi(page: Page) {
  await page.route("**/api/bodies", (route) =>
    route.fulfill({
      json: {
        bodies: [],
        count: 0,
        districts: [],
        financial_years: [{ year_label: "2025-2026", is_complete: false }],
        cycles: [2010, 2015, 2020, 2025],
        provenance: PROVENANCE,
      },
    }),
  );

  // Amboori's figures, read by the home page's opening paragraph.
  await page.route("**/api/finances/**", (route) =>
    route.fulfill({
      json: {
        lb_code: "G01014",
        year_label: "2023-2024",
        is_complete: true,
        body: null,
        available: true,
        reason_code: null,
        projects: 312,
        formulation: 118_000_000,
        expense: 79_000_000,
        expense_pct: 66.9,
        projects_with_pdf: 0,
        distinct_projects: 312,
        provenance: PROVENANCE,
      },
    }),
  );

  await page.route("**/api/meetings/**", (route) =>
    route.fulfill({
      json: {
        lb_code: "G01014",
        year_label: "2023-2024",
        is_complete: true,
        body: null,
        available: true,
        reason_code: null,
        meetings: 24,
        governing_body: 12,
        standing_committee: 12,
        ordinary: 18,
        special: 6,
        first_meeting: null,
        last_meeting: null,
        // The paragraph filters these for minutes, so an absent array is not an
        // empty state -- it throws, and takes the whole app down with it.
        meeting_rows: [
          { meeting_id: "m1", meeting_date: "2023-06-14", meeting_no: 1,
            meeting_type: "Governing Body", meeting_nature: "Ordinary",
            venue: null, category_code: null, documents: [] },
        ],
        scope_note: "",
        provenance: PROVENANCE,
      },
    }),
  );

  // The 2020 statewide aggregate, read twice on the home page: once by the
  // stat strip for the Commission's own seat total, once by the block under
  // the worked example.
  await page.route("**/api/elections/statewide/**", (route) =>
    route.fulfill({
      json: {
        cycle: 2020,
        available: true,
        reason_code: null,
        reason: null,
        bodies_with_result: 1199,
        wards_counted: 20_962,
        seats: [
          { front: "LDF", seats: 10_046, share: 0.46 },
          { front: "UDF", seats: 8_014, share: 0.367 },
          { front: "NDA", seats: 1_596, share: 0.073 },
          { front: "OTH", seats: 2_164, share: 0.099 },
        ],
        seats_total: 21_820,
        margins: [
          { key: "under_50", label: "Under 50 votes", min_votes: null, max_votes: 49, wards: 4_567, share: 0.218 },
        ],
        control: [
          { control_type: "majority", bodies: 785, share: 0.655 },
          { control_type: "hung", bodies: 406, share: 0.339 },
          { control_type: "tie", bodies: 8, share: 0.007 },
          { control_type: "unstated", bodies: 0, share: 0 },
        ],
        reservation: [
          { reservation: "General", wards: 8_983, share: 0.429 },
          { reservation: "Woman", wards: 9_639, share: 0.46 },
        ],
        provenance: PROVENANCE,
      },
    }),
  );

  // Amboori's 2020 result, read by panel 01.
  await page.route("**/api/elections/G01014/**", (route) =>
    route.fulfill({
      json: {
        lb_code: "G01014",
        cycle: 2020,
        body: { lb_name_en: "Amboori", lb_type: "Grama Panchayat" },
        available: true,
        reason_code: null,
        seats: { LDF: 6, UDF: 8, NDA: 0, OTH: 0 },
        total_wards: 14,
        majority_threshold: 8,
        largest_front: "UDF",
        largest_front_seats: 8,
        ruling_front: "UDF",
        control_type: "majority",
        wards: Array.from({ length: 14 }, (_, i) => ({
          ward_no: i + 1,
          ward_code: `G01014${String(i + 1).padStart(3, "0")}`,
          ward_name: `Ward ${i + 1}`,
          ward_name_ml: null,
          reservation: "General",
          winner_name: `Winner ${i + 1}`,
          winner_party: i < 8 ? "INC" : "CPI(M)",
          winner_front: i < 8 ? "UDF" : "LDF",
          winner_votes: 500 + i * 10,
          winner_role: null,
          winner_gender: null,
          runnerup_name: `Runner-up ${i + 1}`,
          runnerup_votes: 400,
          margin: 100 + i * 10,
          margin_pct: null,
          valid_votes: 1000,
          invalid_votes: 8,
          candidates: 3,
          uncontested: false,
          tie: false,
        })),
        candidates: [],
        provenance: PROVENANCE,
      },
    }),
  );

  // The boundary slices panel 01 asks for. Ward polygons exist for the 2025
  // cycle alone, so an empty collection here is the real answer for 2020 and
  // is what makes the panel draw cells inside the outline.
  await page.route("**/geo/**", (route) =>
    route.fulfill({
      json: { type: "FeatureCollection", features: [] },
    }),
  );

  await page.route("**/api/maps", (route) =>
    route.fulfill({
      json: {
        layers: [],
        count: 0,
        coverage: { bodies: 1238, with_geometry: 1033, without_geometry: 205 },
        ward_geometry_note: "",
        provenance: PROVENANCE,
      },
    }),
  );
}

test("the app loads and React mounts", async ({ page }) => {
  await stubPublicApi(page);
  await page.goto("/");

  await expect(page).toHaveTitle(/GramSAMBANDH/);
  await expect(page.locator("#root")).not.toBeEmpty();
  await expect(page.locator("body")).toBeVisible();
});

test("the client-side router answers a second route", async ({ page }) => {
  await page.goto("/login");

  // Whatever the login screen becomes, it takes a password.
  await expect(page.locator('input[type="password"]')).toBeVisible();
});

test("the first paint logs no console errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await stubPublicApi(page);
  await page.goto("/");
  await expect(page.locator("#root")).not.toBeEmpty();

  expect(errors).toEqual([]);
});
