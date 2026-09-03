/**
 * Said only where its absence would mislead.
 *
 * A drawn map needs no caption telling the reader it is a map. Squares and
 * cells do, because a square laid out on a grid reads as authoritatively as a
 * coastline and a reader who takes one for a boundary is reading a shape that
 * is not one. So this renders in the fallback cases and in no other.
 *
 * 2010 publishes nothing, deliberately: the only polygons that could stand in
 * for it are a November 2020 snapshot, fifteen years and three delimitations
 * away, and drawing them would assert a boundary set that never existed.
 * 2015 and 2020 publish every tier above wards and no wards at all.
 */

import styles from "./elections.module.css";

export type NoteKind = "squares" | "cells" | "cells-in-outline";

/**
 * `cells-in-outline` renders nothing. Where the body's own boundary is drawn
 * the picture already reads as a real shape holding placeholder cells, and the
 * caption spent four lines restating it.
 */

interface RenderNoteProps {
  kind: NoteKind;
  cycle: number;
  /** What one unit is called: "district", "block panchayat", "ward". */
  unitNoun: string;
  /** The endpoint's own sentence for why there is nothing to draw. */
  reason: string | null;
}

export default function RenderNote({ kind, cycle, unitNoun, reason }: RenderNoteProps) {
  if (kind === "cells-in-outline") return null;

  if (kind === "cells") {
    return (
      <p className={styles.renderNote}>
        Cells, not boundaries. {reason ?? `Nothing has been published for ${cycle}.`}{" "}
        Each cell is one ward in number order and carries the result alone.
      </p>
    );
  }

  return (
    <p className={styles.renderNote}>
      Squares, not boundaries.{" "}
      {reason ?? `No ${unitNoun} boundaries have been published for ${cycle}.`} Each
      square is one {unitNoun}, coloured by front, and carries nothing about where
      the {unitNoun} is or what it borders.
    </p>
  );
}
