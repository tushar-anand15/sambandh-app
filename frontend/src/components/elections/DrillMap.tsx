/**
 * The map, three levels deep: Kerala, one district, one local body.
 *
 * Which of two things gets drawn depends on what has been published. Where the
 * cycle has boundaries — districts and local bodies for 2015, 2020 and 2025,
 * wards for 2025 — the shapes are the real ones, cut to this level by
 * `/geo/*` and projected to SVG paths. Where it does not, the same units are
 * drawn as tiles and the map says that is what they are, because a reader who
 * took a tile for a boundary would be reading a shape that is not one.
 *
 * The legend, the line naming the unit under the pointer, and the selection are
 * the same either way, so stepping from a cycle with boundaries to one without
 * changes the picture and nothing else. What does change is the note above the
 * map, which says which of the two is on screen every time rather than only
 * when something is missing: squares read as authoritatively as coastlines.
 *
 * One tier is drawn at a time, and `caption` is where that is said in words.
 * The three rural tiers cover the same ground and are three separate
 * elections; a reader who takes a block panchayat's colour for a summary of
 * its grama panchayats is reading the map wrong, and nothing about the map
 * looks wrong enough to correct them.
 */

import { useCallback, useState, type ReactNode } from "react";

import styles from "./elections.module.css";
import PolygonMap from "./PolygonMap";
import RenderNote from "./RenderNote";
import TileMap from "./TileMap";
import type { GeometryState } from "./useElections";
import { frontLabel, frontToken, type MapUnit } from "./payload";

export type { MapUnit };

interface DrillMapProps {
  /** Names what is drawn, with the cycle: "Local bodies in THRISSUR, 2025". */
  title: string;
  units: MapUnit[];
  /** Ward tiles carry a number and nothing else, so they are smaller. */
  variant: "area" | "ward";
  /** What one unit is called, for the sentence under a tile map. */
  unitNoun: string;
  geometry: GeometryState;
  onSelect: (key: string) => void;
  /**
   * What this level is, in words: which tier it is, and that its colours are
   * that tier's own election. Shown whether the map is drawn or tiled, because
   * it is a fact about the election and not about the rendering.
   */
  caption: string;
  /** The cycle, for the note that says whether these are boundaries. */
  cycle: number;
  /** Placed between the heading and the map: the clicked body's own result. */
  note?: ReactNode;
}

/** The four colours, and the fronts the commission names beyond them. */
function Legend() {
  return (
    <ul className={styles.legend} aria-label="Front colours">
      {["LDF", "UDF", "NDA", "OTH"].map((front) => (
        <li key={front} className={styles.legendItem}>
          <span
            className={styles.swatch}
            style={{ backgroundColor: `var(--${frontToken(front)})` }}
          />
          {front}
        </li>
      ))}
      <li className={styles.legendItem}>
        Any other group the commission names, BJP+ among them, takes the OTH
        colour and keeps its own name everywhere it is written.
      </li>
    </ul>
  );
}

export default function DrillMap({
  title,
  units,
  variant,
  unitNoun,
  geometry,
  onSelect,
  caption,
  cycle,
  note,
}: DrillMapProps) {
  const [hovered, setHovered] = useState<MapUnit | null>(null);

  // Stable, so the memoised shapes and tiles do not re-render when the hovered
  // unit does.
  const handleHover = useCallback((unit: MapUnit | null) => setHovered(unit), []);
  const handleSelect = useCallback((key: string) => onSelect(key), [onSelect]);

  const drawn = geometry.status === "ready" && geometry.collection.features.length > 0;

  // Why the tiles are on screen instead of a map. Three causes, three
  // sentences: the cycle has no published layer at this level, the layer holds
  // no polygon for this unit, or the request for it failed.
  let fallback: string | null = null;
  if (geometry.status === "absent") {
    fallback = geometry.reason;
  } else if (geometry.status === "error") {
    fallback = geometry.message;
  } else if (geometry.status === "ready" && !drawn) {
    fallback = "No boundaries have been published at this level.";
  }

  return (
    <section aria-label={title}>
      <h2>{title}</h2>
      {note}
      {geometry.status === "loading" ? null : (
        <RenderNote
          drawn={drawn}
          cycle={cycle}
          unitNoun={unitNoun}
          reason={fallback}
        />
      )}
      <p className={styles.tierCaption}>{caption}</p>
      <Legend />

      {geometry.status === "loading" ? (
        <p className={styles.hoverLine} aria-busy="true">
          Drawing the map…
        </p>
      ) : null}

      {drawn && geometry.status === "ready" ? (
        <PolygonMap
          title={title}
          units={units}
          geometry={geometry.collection}
          onSelect={handleSelect}
          onHover={handleHover}
        />
      ) : null}

      {fallback !== null ? (
        <TileMap
          units={units}
          variant={variant}
          onSelect={handleSelect}
          onHover={handleHover}
        />
      ) : null}

      <p className={styles.hoverLine} role="status" data-testid="map-hover">
        {hovered
          ? [hovered.name, hovered.note ?? frontLabel(hovered.front), hovered.action]
              .filter(Boolean)
              .join(". ")
          : ""}
      </p>

    </section>
  );
}
