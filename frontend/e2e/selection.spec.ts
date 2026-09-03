import { expect, test, type Page } from "@playwright/test";

/**
 * Selection, end to end.
 *
 * Two things only a real browser can prove. First, that the public sections
 * render with no token in local storage — the un-gating in this unit is a
 * claim about a browser that has never signed in, and a jsdom test that never
 * had a token cannot distinguish "public" from "the gate did not run". Second,
 * that the three-interaction flow works against the router's real history:
 * navigating, going back, and reloading a deep link are browser behaviours,
 * not React ones.
 *
 * The backend is not running. `/api/bodies` is fulfilled from a fixture that
 * mirrors `backend/tests/fixtures/master_slice.sql`, so this spec is about the
 * selection contract and never about whether a VM is up.
 */

const BODIES = {
  bodies: [
    {
      lb_code: "M08032",
      lb_name_en: "Chalakudy",
      lb_name_ml: "ചാലക്കുടി",
      district_name: "THRISSUR",
      lb_type: "Municipality",
      has_finances: true,
      has_meetings: true,
      has_geometry: true,
      in_elections: true,
      first_cycle: 2010,
      last_cycle: 2025,
      years_with_finance: 14,
      years_with_meetings: 9,
    },
    {
      lb_code: "G13064",
      lb_name_en: "Panoor",
      lb_name_ml: null,
      district_name: "KANNUR",
      lb_type: "Grama Panchayat",
      has_finances: true,
      has_meetings: false,
      has_geometry: false,
      in_elections: true,
      first_cycle: 2010,
      last_cycle: 2015,
      years_with_finance: 11,
      years_with_meetings: 0,
    },
  ],
  count: 2,
  districts: ["KANNUR", "THRISSUR"],
  financial_years: [
    { year_label: "2022-2023", is_complete: true },
    { year_label: "2023-2024", is_complete: true },
    { year_label: "2025-2026", is_complete: false },
  ],
  cycles: [2010, 2015, 2020, 2025],
  provenance: {
    dataset: "Gram Sambandh master database",
    build_date: "2026-08-13",
    source: "Kerala LSGD registry",
  },
};

async function stubBodies(page: Page) {
  await page.route("**/api/bodies", (route) =>
    route.fulfill({ json: BODIES, headers: { "Cache-Control": "no-store" } }),
  );
}

test.describe("public routes", () => {
  test("renders /finances with no token in storage", async ({ page }) => {
    await stubBodies(page);

    await page.goto("/finances");

    // No redirect, and the selector is live rather than a login form.
    //
    // The headline is written about a local body rather than named after the
    // section, so there is no heading called "Finances" to assert -- and the
    // word itself appears in the tab bar as well as the page's eyebrow.
    await expect(page).toHaveURL(/\/finances$/);
    await expect(
      page.getByRole("heading", { name: /planned, and what it spent/ }),
    ).toBeVisible();
    await expect(page.getByLabel("District")).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem("auth_token"))).toBeNull();
  });

  test("renders /meetings and /elections with no token either", async ({ page }) => {
    await stubBodies(page);

    await page.goto("/meetings");
    await expect(
      page.getByRole("heading", { name: /council met, and what it wrote down/ }),
    ).toBeVisible();

    await page.goto("/elections");
    // Elections leads with the map rather than a headline, so the selector
    // below is what says the page rendered and stayed public.
    // Cycles, not financial years — the same selector, a different period.
    // Scoped to the selector: the cycle slider under the map carries the same
    // label, deliberately, and both being called "Election cycle" is correct.
    await expect(
      page.getByRole("region", { name: "Selection" }).getByLabel("Election cycle"),
    ).toBeVisible();
  });

  test("/maps folds into elections rather than 404ing", async ({ page }) => {
    await stubBodies(page);

    await page.goto("/maps");

    await expect(page).toHaveURL(/\/elections$/);
  });
});

test.describe("the gate", () => {
  test("/ask redirects a signed-out visitor to the login", async ({ page }) => {
    await page.goto("/ask");

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });
});

test.describe("three interactions", () => {
  test("district, body and year reach a populated page", async ({ page }) => {
    await stubBodies(page);
    await page.goto("/finances");

    await page.getByLabel("District").selectOption("THRISSUR");
    await page.getByLabel("Local body").selectOption("M08032");
    await page.getByLabel("Financial year", { exact: true }).selectOption("2023-2024");

    await expect(page).toHaveURL(/\/finances\/M08032\/2023-2024$/);
    // The page is populated in the sense this unit owns: all three selections
    // are resolved and the coverage the body has is stated.
    await expect(page.getByLabel("District")).toHaveValue("THRISSUR");
    await expect(page.getByLabel("Local body")).toHaveValue("M08032");
    await expect(page.getByRole("link", { name: "Meetings" }).first()).toBeVisible();
  });

  test("a pasted deep link restores the view on a cold load", async ({ page }) => {
    await stubBodies(page);

    await page.goto("/finances/M08032/2023-2024");

    await expect(page.getByLabel("District")).toHaveValue("THRISSUR");
    await expect(page.getByLabel("Local body")).toHaveValue("M08032");
    await expect(page.getByLabel("Financial year", { exact: true })).toHaveValue(
      "2023-2024",
    );
  });

  test("back undoes one selection", async ({ page }) => {
    await stubBodies(page);
    await page.goto("/finances");

    await page.getByLabel("District").selectOption("THRISSUR");
    await page.getByLabel("Local body").selectOption("M08032");
    await page.getByLabel("Financial year", { exact: true }).selectOption("2023-2024");
    await page.goBack();

    await expect(page).toHaveURL(/\/finances\/M08032$/);
    await expect(page.getByLabel("Financial year", { exact: true })).toHaveValue("");
  });

  test("a body a section has no record of says who published nothing", async ({
    page,
  }) => {
    await stubBodies(page);

    await page.goto("/meetings/G13064");

    // The exact sentence lives in NOT_COVERED in src/hooks/useBodies.ts. What
    // this test is for is the distinction it draws, not its phrasing: the page
    // must say the *portal* published nothing, and must not let a reader
    // conclude the council did not meet. So the assertion below checks the
    // subject of the sentence is Sakarma, and the one after it checks the
    // reading we must never produce.
    await expect(
      page.getByText("Sakarma publishes no meetings for this local body.").first(),
    ).toBeVisible();
    await expect(page.getByText(/held no meetings|did not meet/i)).toHaveCount(0);
  });

  test("an unknown code names the code rather than rendering blank", async ({
    page,
  }) => {
    await stubBodies(page);

    await page.goto("/finances/M99999");

    // Two alerts name it: the selector's and the section's. Either one
    // answers the question this test asks.
    await expect(page.getByRole("alert").first()).toContainText("M99999");
  });
});
