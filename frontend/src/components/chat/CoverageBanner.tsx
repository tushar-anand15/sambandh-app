/**
 * What the assistant has read, stated before the first question is asked.
 *
 * The rest of the site covers every local body in Kerala and fourteen financial
 * years. The assistant's index is one district and one year. A reader arriving
 * from the Finances tab has no way to know that, and the failure it causes is
 * the worst this site can produce: a fluent, sourced-looking answer about a
 * panchayat nobody indexed, indistinguishable from a correct one.
 *
 * The figures come from `/api/documents/filters`, which counts them off the
 * corpus. A banner with typed-in numbers would keep claiming yesterday's ingest
 * after tomorrow's.
 */

import { useEffect, useState } from "react";

import api from "@/lib/api";

export interface IndexedBody {
  lb_name: string;
  lb_type: string | null;
  district_name: string | null;
  documents: number;
}

export interface AssistantIndex {
  districts: string[];
  years: string[];
  local_bodies: IndexedBody[];
  documents: number;
}

export type IndexState =
  | { status: "loading" }
  | { status: "ready"; index: AssistantIndex }
  | { status: "error" };

const COUNT = new Intl.NumberFormat("en-IN");

/** "2025-2026" reads "2025–26", as everywhere else on the site. */
export function shortYear(value: string): string {
  const match = /^(\d{4})-(\d{4})$/.exec(value);
  return match ? `${match[1]}–${match[2].slice(2)}` : value;
}

function list(values: string[]): string {
  if (values.length <= 1) return values[0] ?? "";
  return `${values.slice(0, -1).join(", ")} and ${values[values.length - 1]}`;
}

export function useAssistantIndex(): IndexState {
  const [state, setState] = useState<IndexState>({ status: "loading" });

  useEffect(() => {
    let live = true;

    api
      .get<AssistantIndex>("/documents/filters")
      .then(({ data }) => live && setState({ status: "ready", index: data }))
      .catch(() => live && setState({ status: "error" }));

    return () => {
      live = false;
    };
  }, []);

  return state;
}

export default function CoverageBanner({ state }: { state: IndexState }) {
  if (state.status === "loading") {
    return (
      <p className="border-b border-border bg-surface-alt px-s4 py-s3 text-t2 text-ink-muted">
        Reading what the assistant holds.
      </p>
    );
  }

  if (state.status === "error") {
    return (
      <p className="border-b border-border bg-surface-alt px-s4 py-s3 text-t2 text-ink-muted">
        The assistant&rsquo;s coverage could not be read. Ask about Thrissur
        district for 2025&ndash;26 only until it loads.
      </p>
    );
  }

  const { index } = state;

  return (
    <div className="border-b border-border bg-surface-alt px-s4 py-s3 text-t2 text-ink-muted">
      <p>
        The assistant has read {COUNT.format(index.documents)} project documents
        from {index.local_bodies.length} local bodies in{" "}
        {list(index.districts)} district, for{" "}
        {list(index.years.map(shortYear))} only. It declines questions about any
        other local body or year.
      </p>
      <p className="mt-s2">
        Finances, Meetings and Elections cover every local body in Kerala, and
        need no account.
      </p>
    </div>
  );
}
