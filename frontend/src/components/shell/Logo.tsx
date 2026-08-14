/**
 * The mark: two strands meeting at a point and continuing as one.
 *
 * It is the whole premise of the site drawn small. Kerala publishes the
 * deliberation and the spending separately and has never joined them; this
 * site joins them, one local body at a time. The join itself is the only place
 * the accent appears in the mark, because the join is the thing that is new.
 *
 * Inline SVG rather than a file: it inherits the ink colour, so it works in
 * both themes with no second asset and no request.
 */

interface LogoProps {
  /** Rendered size in pixels. The mark is drawn on a 24-unit grid. */
  size?: number;
}

export default function Logo({ size = 30 }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
    >
      {/* What a council decided, and what it spent: two records, apart. */}
      <path d="M2.5 5.5C8 5.5 10 12 13.5 12" />
      <path d="M2.5 18.5C8 18.5 10 12 13.5 12" />
      {/* Joined, and readable together. */}
      <path d="M13.5 12H21.5" />
      <circle cx="13.5" cy="12" r="1.9" fill="var(--accent)" stroke="none" />
    </svg>
  );
}
