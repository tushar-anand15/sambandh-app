/**
 * The masthead. Static chrome — it does not scroll with the reader, does not
 * collapse, and holds no state.
 *
 * The 4px laterite band across the top is the single use of --earth on the
 * site. It is close enough in hue to the LDF red that a second appearance
 * anywhere near data would read as a party colour, so it is spent here and
 * nowhere else.
 */

export default function Masthead() {
  return (
    <header className="masthead">
      <div className="masthead-band" aria-hidden="true" />
      <div className="shell-container masthead-inner">
        <a href="/" className="masthead-title">
          Gram Sambandh
        </a>
        <p className="masthead-sub">
          Kerala local government, from the state&rsquo;s own records
        </p>
      </div>
    </header>
  );
}
