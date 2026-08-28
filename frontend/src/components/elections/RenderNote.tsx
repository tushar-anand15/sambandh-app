/**
 * What the reader is looking at: published boundaries, or squares.
 *
 * The map changes shape between cycles without changing its manner, and a
 * square laid out on a grid looks as authoritative as a coastline. So the page
 * says which one it is drawing every time it draws, rather than only when
 * something is missing. A reader who takes a tile for a boundary is reading a
 * shape that is not one, and nothing about the picture would tell them.
 *
 * The four cycles are not alike here. 2015, 2020 and 2025 publish boundaries at
 * every tier above wards; 2025 alone publishes wards. 2010 publishes nothing,
 * deliberately: the only polygons that could stand in for it are a November
 * 2020 snapshot, fifteen years and three delimitations away, and drawing them
 * would assert a boundary set that never existed.
 */

import styles from "./elections.module.css";

interface RenderNoteProps {
  /** True when real polygons are on screen, false when squares are. */
  drawn: boolean;
  cycle: number;
  /** What one unit is called: "district", "block panchayat", "ward". */
  unitNoun: string;
  /** The endpoint's own sentence for why there is nothing to draw. */
  reason: string | null;
}

export default function RenderNote({ drawn, cycle, unitNoun, reason }: RenderNoteProps) {
  if (drawn) {
    return (
      <p className={`${styles.renderNote} ${styles.renderNoteDrawn}`}>
        <b>Published boundaries.</b> These are the real shapes for {cycle}, cut to
        this level from the boundary layer the build publishes. Nothing here is
        approximated.
      </p>
    );
  }

  return (
    <p className={styles.renderNote}>
      <b>Squares, not boundaries.</b>{" "}
      {reason ?? `No ${unitNoun} boundaries have been published for ${cycle}.`} Each
      square below is one {unitNoun}, coloured by front. A square carries the
      result and nothing about where the {unitNoun} is, how large it is or what
      it borders. It is not a map.
    </p>
  );
}
