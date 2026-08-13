/**
 * Reading `/api/metrics`.
 *
 * The one read endpoint on this site that needs a token, so it goes through the
 * axios wrapper in `lib/api.ts` — that is where the Authorization header is
 * attached, and where a 401 already sends the reader to the login page rather
 * than leaving a page half-rendered.
 *
 * A failure is returned as a message, not thrown. This page is read by whoever
 * runs the project; an unhandled rejection in a console is not a report.
 */

import { useEffect, useState } from "react";

import api from "@/lib/api";
import type { MetricsPayload } from "./types";

export interface Fetched<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

export function useMetrics(weeks = 12): Fetched<MetricsPayload> {
  const [state, setState] = useState<Fetched<MetricsPayload>>({
    data: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let live = true;
    setState({ data: null, loading: true, error: null });

    api
      .get<MetricsPayload>("/metrics", { params: { weeks } })
      .then(
        (response) => live && setState({ data: response.data, loading: false, error: null }),
        (error: { response?: { status?: number } }) => {
          if (!live) return;
          const status = error.response?.status;
          setState({
            data: null,
            loading: false,
            error:
              status === 401 || status === 403
                ? "This page needs a signed-in account."
                : "The metrics did not load. Reload to try again.",
          });
        },
      );

    return () => {
      live = false;
    };
  }, [weeks]);

  return state;
}
