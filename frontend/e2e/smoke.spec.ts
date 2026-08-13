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
 * The backend is not running for this spec, and must not need to be. The home
 * page reads two endpoints for its coverage table, so those two are fulfilled
 * from a stub: a proxy with nothing behind it would log a failed request, and
 * the console-error assertion below would then be measuring the absence of a
 * backend rather than the health of the first paint.
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
