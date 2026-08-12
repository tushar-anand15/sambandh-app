import { expect, test } from "@playwright/test";

/**
 * The app loads and React mounts. Nothing more.
 *
 * Assertions here are on things that survive the revamp: the document title,
 * the root element having been filled by React, the client-side router
 * answering a second route, and the console being free of errors. The landing
 * and explorer components are replaced in Unit 10, so a spec asserting their
 * copy would be a spec written to be deleted.
 *
 * The backend is not running for this spec, and must not need to be.
 */

test("the app loads and React mounts", async ({ page }) => {
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

  await page.goto("/");
  await expect(page.locator("#root")).not.toBeEmpty();

  expect(errors).toEqual([]);
});
