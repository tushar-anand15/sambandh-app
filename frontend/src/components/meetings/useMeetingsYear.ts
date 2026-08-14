/**
 * One body-year of the meeting register, fetched from the URL's selection.
 *
 * Nothing is cached. A body-year is a page a reader lands on once and leaves,
 * and a stale count of a public record is worse than a second request.
 *
 * The 404 is kept as its own state rather than folded into `error`, because a
 * code that matches no local body and a portal that went down are different
 * facts and the page says different things about them.
 */

import { useEffect, useState } from "react";

import type { MeetingsMissing, MeetingsPayload, MeetingsYear } from "./payload";

export type MeetingsState =
  /** No body or no year chosen yet. */
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; payload: MeetingsYear }
  | { status: "missing"; payload: MeetingsMissing }
  | { status: "not-found"; lbCode: string }
  | { status: "error"; message: string };

export function useMeetingsYear(lbCode: string, yearLabel: string): MeetingsState {
  const [state, setState] = useState<MeetingsState>({ status: "idle" });

  useEffect(() => {
    if (!lbCode || !yearLabel) {
      setState({ status: "idle" });
      return;
    }

    let live = true;
    setState({ status: "loading" });

    fetch(`/api/meetings/${lbCode}/${yearLabel}`)
      .then(async (response) => {
        if (!live) return;
        if (response.status === 404) {
          setState({ status: "not-found", lbCode });
          return;
        }
        if (!response.ok) {
          setState({
            status: "error",
            message: `The meeting record did not load (${response.status}).`,
          });
          return;
        }
        const payload = (await response.json()) as MeetingsPayload;
        if (!live) return;
        setState(
          payload.available
            ? { status: "ready", payload }
            : { status: "missing", payload },
        );
      })
      .catch(() => {
        if (live) {
          setState({ status: "error", message: "The meeting record did not load." });
        }
      });

    return () => {
      live = false;
    };
  }, [lbCode, yearLabel]);

  return state;
}
