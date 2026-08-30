/**
 * The map of one level, with its legend beside it.
 *
 * Which of three things gets drawn depends on what has been published. Where
 * the cycle has boundaries — every tier for 2015, 2020 and 2025, wards for
 * 2025 — the shapes are the real ones, cut to this level by `/geo/*` and
 * projected to SVG paths. Wards before 2025 get the body's outline with a
 * block of cells inside it. Everything else falls back to tiles.
 *
 * The legend, the line naming the unit under the pointer and the selection are
 * the same in all three, so stepping from a cycle with boundaries to one
 * without changes the picture and nothing else.
 *
 * Nothing here says what the map is. The pane heading above it does that, and
 * a sentence repeating a heading is a sentence a reader learns to skip. The
 * one thing that is said is where a reader would otherwise be misled: that the
 * squares and the cells are not boundaries.
 */

import { useCallback, useState } from "react";

import styles from "./elections.module.css";
import type { GeoCollection } from "./geometry";
import PolygonMap from "./PolygonMap";
import RenderNote, { type NoteKind } from "./RenderNote";
import TileMap from "./TileMap";
import WardCells from "./WardCells";
import type { GeometryState } from "./useElections";
import { frontLabel, frontToken, type MapUnit } from "./payload";

export type { MapUnit };

interface DrillMapProps {
  /** Names what is drawn, with the cycle. Read by a screen reader as the image. */
  title: string;
  units: MapUnit[];
  /** Ward tiles carry a number and nothing else, so they are smaller. */
  variant: "area" | "ward";
  /** What one unit is called, for the sentence under a fallback map. */
  unitNoun: string;
  geometry: GeometryState;
  /**
   * The body's own outline, for a ward level with no ward polygons. Null at
   * every other level, and for 2010, which publishes no outline either.
   */
  outline?: GeoCollection | null;
  onSelect: (key: string) => void;
  /** The cycle, for the note that says what the fallback shapes are. */
  cycle: number;
}

/** The four colours, read down the side of the map. */
function Legend() {
  return (
    <ul className={styles.mapLegend} aria-label="Front colours">
      {["LDF", "UDF", "NDA", "OTH"].map((front) => (
        <li key={front} className={styles.legendItem}>
          <span
            className={styles.swatch}
            style={{ backgroundColor: `var(--${frontToken(front)})` }}
          />
          {front}
        </li>
      ))}
    </ul>
  );
}

export default function DrillMap({
  title,
  units,
  variant,
  unitNoun,
  geometry,
  outline = null,
  onSelect,
  cycle,
}: DrillMapProps) {
  const [hovered, setHovered] = useState<MapUnit | null>(null);

  // Stable, so the memoised shapes and tiles do not re-render when the hovered
  // unit does.
  const handleHover = useCallback((unit: MapUnit | null) => setHovered(unit), []);
  const handleSelect = useCallback((key: string) => onSelect(key), [onSelect]);

  const drawn = geometry.status === "ready" && geometry.collection.features.length > 0;

  // Why something other than a map is on screen. Three causes, three
  // sentences: the cycle has no published layer at this level, the layer holds
  // no polygon for this unit, or the request for it failed.
  let reason: string | null = null;
  if (geometry.status === "absent") {
    reason = geometry.reason;
  } else if (geometry.status === "error") {
    reason = geometry.message;
  } else if (geometry.status === "ready" && !drawn) {
    reason = "No boundaries have been published at this level.";
  }

  const cells = !drawn && variant === "ward";
  const kind: NoteKind = cells
    ? outline
      ? "cells-in-outline"
      : "cells"
    : "squares";

  return (
    <div className={styles.figure}>
      {geometry.status === "loading" ? (
        <p className={styles.hoverLine} aria-busy="true">
          Drawing the map…
        </p>
      ) : (
        <>
          {reason === null ? null : (
            <RenderNote kind={kind} cycle={cycle} unitNoun={unitNoun} reason={reason} />
          )}

          <div className={styles.mapRow}>
            <div className={styles.mapArea}>
              {drawn && geometry.status === "ready" ? (
                <PolygonMap
                  title={title}
                  units={units}
                  geometry={geometry.collection}
                  onSelect={handleSelect}
                  onHover={handleHover}
                />
              ) : cells ? (
                <WardCells
                  title={title}
                  units={units}
                  outline={outline}
                  onSelect={handleSelect}
                  onHover={handleHover}
                />
              ) : (
                <TileMap
                  units={units}
                  variant={variant}
                  onSelect={handleSelect}
                  onHover={handleHover}
                />
              )}
            </div>
            <Legend />
          </div>

          <p className={styles.hoverLine} role="status" data-testid="map-hover">
            {hovered
              ? [hovered.name, hovered.note ?? frontLabel(hovered.front), hovered.action]
                  .filter(Boolean)
                  .join(". ")
              : ""}
          </p>
        </>
      )}
    </div>
  );
}
