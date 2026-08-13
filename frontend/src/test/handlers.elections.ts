/**
 * MSW handlers for elections.
 *
 * Owned by the Elections section.
 */

import { http, HttpResponse } from "msw";

import { bodies, knownCode, notFound, provenance, unavailable } from "./handlers";

export const handlers = [
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
