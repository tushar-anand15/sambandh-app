/**
 * MSW handlers for finances.
 *
 * Owned by the Finances section so its fixtures can grow without touching
 * the other sections' mocks.
 */

import { http, HttpResponse } from "msw";

import { chalakudyFinances, knownCode, notFound } from "./handlers";

export const handlers = [
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
];
