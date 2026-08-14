/**
 * The local body a question is about, restricted to the ones that were indexed.
 *
 * The site's own selector offers every local body in Kerala. This one offers
 * the handful the assistant has documents for, because a dropdown that lists a
 * body the retrieval cannot answer for is an invitation to the failure the
 * scoping work exists to prevent.
 *
 * Choosing a body prefixes the question with it. The prefix is visible in the
 * message the reader sent, so the answer can be checked against the question
 * that was actually asked.
 */

import type { IndexedBody } from "./CoverageBanner";

interface ScopeSelectorProps {
  bodies: IndexedBody[];
  value: string;
  onChange: (lbName: string) => void;
  disabled?: boolean;
}

/** "Chalakkudy Municipality (61 documents)". */
export function optionLabel(body: IndexedBody): string {
  return `${body.lb_name} (${body.documents} documents)`;
}

export default function ScopeSelector({
  bodies,
  value,
  onChange,
  disabled = false,
}: ScopeSelectorProps) {
  return (
    <div className="flex flex-col gap-s1">
      <label
        htmlFor="assistant-body"
        className="font-sans text-t1 uppercase tracking-label text-ink-faint"
      >
        Local body
      </label>
      <select
        id="assistant-body"
        className="rounded-lg border border-border bg-surface px-s3 py-s2 text-t3 text-ink"
        value={value}
        disabled={disabled || bodies.length === 0}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Any local body below</option>
        {bodies.map((body) => (
          <option key={body.lb_name} value={body.lb_name}>
            {optionLabel(body)}
          </option>
        ))}
      </select>
    </div>
  );
}

/** The question as it is sent, carrying the chosen body when there is one. */
export function scopedQuestion(lbName: string, text: string): string {
  return lbName ? `In ${lbName}: ${text}` : text;
}
