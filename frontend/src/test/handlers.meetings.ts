/**
 * MSW handlers for meetings.
 *
 * Owned by the Meetings section.
 */

import { http, HttpResponse } from "msw";

import { bodies, chalakudyMeetings, knownCode, notFound, unavailable } from "./handlers";

export const handlers = [
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
];
