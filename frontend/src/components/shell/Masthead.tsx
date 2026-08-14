/**
 * The masthead. Static chrome — it does not scroll with the reader, does not
 * collapse, and holds no state.
 *
 * The 4px laterite band across the top is the single use of --earth on the
 * site. It is close enough in hue to the LDF red that a second appearance
 * anywhere near data would read as a party colour, so it is spent here and
 * nowhere else.
 *
 * The band sits on --surface-2 rather than --surface. A near-white header on a
 * husk-coloured page reads as a strip pasted over it; the muted ground steps
 * down into the page instead, and the sticky tab bar below carries the page's
 * own colour.
 */

import Logo from "./Logo";

export default function Masthead() {
  return (
    <header className="masthead">
      <div className="masthead-band" aria-hidden="true" />
      <div className="shell-container masthead-inner">
        {/* The Malayalam is the same name again, so it is not part of the
            accessible name -- a screen reader should hear it once. */}
        <a href="/" className="masthead-title" aria-label="Gram Sambandh">
          <Logo />
          <span className="masthead-name">
            Gram Sambandh
            <span className="masthead-name-mal" lang="ml">
              ഗ്രാമ സംബന്ധ്
            </span>
          </span>
        </a>
        <p className="masthead-sub">
          Kerala local government, from the state&rsquo;s own records
        </p>
      </div>
    </header>
  );
}
