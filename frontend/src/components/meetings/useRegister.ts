/**
 * One meeting's decision register or minutes, fetched when a reader asks for it.
 *
 * Not with the year: a body-year is up to a few hundred meetings and each
 * document is 100 to 400 KB of HTML before it is rewritten, so loading them
 * with the list would mean tens of megabytes for a page most readers scan.
 *
 * Answers already read stay in a map for the life of the tab, keyed by meeting
 * and kind. Opening a register, closing it and opening it again is one request.
 */

import { useCallback, useEffect, useState } from "react";

import type { DocumentKind, RegisterMissing, RegisterPayload } from "./payload";

export type RegisterState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; payload: Extract<RegisterPayload, { available: true }> }
  | { status: "missing"; payload: RegisterMissing }
  | { status: "error"; message: string };

/** What the reader is looking at, or null when the panel is closed. */
export interface RegisterRequest {
  meetingId: number;
  kind: DocumentKind;
}

const cache = new Map<string, RegisterPayload>();

const keyOf = (request: RegisterRequest) => `${request.meetingId}/${request.kind}`;

/** Drops the cache. Tests call this between cases; nothing in the app does. */
export function resetRegisterCache(): void {
  cache.clear();
}

function stateFor(payload: RegisterPayload): RegisterState {
  return payload.available
    ? { status: "ready", payload }
    : { status: "missing", payload };
}

export function useRegister(request: RegisterRequest | null): RegisterState {
  const [state, setState] = useState<RegisterState>({ status: "idle" });

  const load = useCallback(async (asked: RegisterRequest) => {
    const key = keyOf(asked);
    const held = cache.get(key);
    if (held) return stateFor(held);

    const response = await fetch(`/api/meetings/register/${key}`);
    if (!response.ok) {
      // 502 is the bucket, 404 is the meeting. Both name what failed, and the
      // detail is the sentence to show.
      const detail = await response
        .json()
        .then((body: { detail?: string }) => body.detail)
        .catch(() => undefined);
      return {
        status: "error" as const,
        message: detail ?? `The document did not load (${response.status}).`,
      };
    }

    const payload = (await response.json()) as RegisterPayload;
    cache.set(key, payload);
    return stateFor(payload);
  }, []);

  useEffect(() => {
    if (!request) {
      setState({ status: "idle" });
      return;
    }

    let live = true;
    setState({ status: "loading" });

    load(request).then(
      (next) => live && setState(next),
      () => live && setState({ status: "error", message: "The document did not load." }),
    );

    return () => {
      live = false;
    };
  }, [request?.meetingId, request?.kind, load]);

  return state;
}
