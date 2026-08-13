/**
 * Why a thin year is thin.
 *
 * Sakarma's coverage grows year on year, so a body-year with few meetings in it
 * is usually a young record. Printing a small number without this note invites
 * the one reading the data cannot support: that the council rarely met.
 *
 * It sits under both a year that has counts and a year that has none, because
 * the same misreading is available in both.
 */

export default function CoverageNote() {
  return (
    <p className="notice" data-testid="coverage-note">
      Sakarma&rsquo;s meeting record grows year on year: 8,989 meetings across 545
      local bodies in 2016&ndash;17, and 91,478 across 1,197 local bodies in
      2024&ndash;25, counted from the Gram Sambandh master database. A year with
      few meetings in it is a thin record. How often a local body met in a year
      the register barely covers is a question this data does not answer.
    </p>
  );
}
