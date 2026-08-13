/**
 * Reading the two finances endpoints.
 *
 * Selection lives in the URL, so these hooks take a code and a year as
 * arguments and hold nothing but the request they are in the middle of. A null
 * argument means "nothing selected yet" and issues no request at all, which is
 * why a page can call them unconditionally and still make one call per
 * selection.
 *
 * A 404 or a 503 is returned as a message, not thrown: a body code that
 * matches nothing is a thing to state on the page, and the endpoint already
 * states it.
 */

import { useEffect, useState } from "react";

import type { SeriesPayload, YearPayload } from "./types";

export interface Fetched<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

const IDLE = { data: null, loading: false, error: null } as const;

function useJson<T>(url: string | null, what: string): Fetched<T> {
  const [state, setState] = useState<Fetched<T>>(
    url === null ? IDLE : { data: null, loading: true, error: null },
  );

  useEffect(() => {
    if (url === null) {
      setState(IDLE);
      return;
    }

    let live = true;
    setState({ data: null, loading: true, error: null });

    fetch(url)
      .then(async (response) => {
        if (!response.ok) {
          const detail = await response
            .json()
            .then((body: { detail?: string }) => body.detail)
            .catch(() => undefined);
          throw new Error(
            detail ?? `${what} did not load (HTTP ${response.status}). Reload to try again.`,
          );
        }
        return (await response.json()) as T;
      })
      .then(
        (data) => live && setState({ data, loading: false, error: null }),
        (error: Error) => live && setState({ data: null, loading: false, error: error.message }),
      );

    return () => {
      live = false;
    };
  }, [url, what]);

  return state;
}

/** The fourteen-year series for one body, empty years included. */
export function useFinancesSeries(lbCode: string | null): Fetched<SeriesPayload> {
  return useJson<SeriesPayload>(
    lbCode ? `/api/finances/${encodeURIComponent(lbCode)}` : null,
    "The year series",
  );
}

/** One body-year: the totals, the continuity counts and the project rows. */
export function useFinancesYear(
  lbCode: string | null,
  yearLabel: string | null,
): Fetched<YearPayload> {
  return useJson<YearPayload>(
    lbCode && yearLabel
      ? `/api/finances/${encodeURIComponent(lbCode)}/${encodeURIComponent(yearLabel)}`
      : null,
    "The year's figures",
  );
}

/**
 * The financial year before this one, or null where it falls outside the
 * dataset. "2013-2014" precedes "2014-2015"; the caller checks the result
 * against the years the series actually carries.
 */
export function previousYear(yearLabel: string): string | null {
  const match = /^(\d{4})-(\d{4})$/.exec(yearLabel);
  if (!match) return null;
  const start = Number(match[1]) - 1;
  return `${start}-${start + 1}`;
}
