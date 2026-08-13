/**
 * The map, three levels deep: Kerala, one district, one local body.
 *
 * It is a tile map. Each territory is one element, coloured by the front that
 * holds it, and the browser's own event dispatch does the hit-testing — there
 * is no point-in-polygon test and no canvas to redraw when the pointer moves.
 * A body with 100 wards is 100 elements, and only the two tiles whose
 * selection changed re-render on a click, because each tile is memoised on
 * props that do not change when the hovered unit does.
 *
 * The tiles carry no geography. Territory is drawn from the published boundary
 * layers nowhere on this page: those files are 7.5 MB to 57 MB and are offered
 * as downloads below instead. What the tiles are faithful to is the result —
 * which unit, which front, which margin — and the caption says so, because a
 * reader who takes a tile for a boundary would be reading a shape that is not
 * one.
 */

import { memo, useCallback, useState } from "react";

import styles from "./elections.module.css";
import { frontLabel, frontToken } from "./payload";

export interface MapUnit {
  /** What a click selects: a district name, an lb_code, a ward number. */
  key: string;
  name: string;
  /** The result in one clause: "UDF majority, 36 wards". */
  note: string | null;
  front: string | null;
  /** What a click does, in a sentence. Shown on hover and on focus. */
  action: string;
  selected: boolean;
}

interface DrillMapProps {
  /** Names what the tiles are, with the cycle: "Local bodies in THRISSUR, 2025". */
  title: string;
  units: MapUnit[];
  /** Ward tiles carry a number and nothing else, so they are smaller. */
  variant: "area" | "ward";
  onSelect: (key: string) => void;
  /** Stated under the map: what the tiles are and what they are not. */
  caption: string;
}

interface TileProps {
  unit: MapUnit;
  variant: "area" | "ward";
  onSelect: (key: string) => void;
  onHover: (unit: MapUnit | null) => void;
}

const Tile = memo(function Tile({ unit, variant, onSelect, onHover }: TileProps) {
  const ward = variant === "ward";
  const classes = [styles.tile, ward ? styles.wardTile : "", unit.selected ? styles.tileSelected : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      className={classes}
      aria-pressed={unit.selected}
      // The label carries the result too, so a screen reader gets what the
      // colour carries for everyone else.
      aria-label={[unit.name, unit.note, unit.action].filter(Boolean).join(". ")}
      title={unit.action}
      onClick={() => onSelect(unit.key)}
      onMouseEnter={() => onHover(unit)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(unit)}
      onBlur={() => onHover(null)}
    >
      <span
        className={styles.tileWash}
        style={{ backgroundColor: `var(--${frontToken(unit.front)})` }}
      />
      <span
        className={styles.tileBar}
        style={{ backgroundColor: `var(--${frontToken(unit.front)})` }}
      />
      {ward ? (
        <span className={styles.wardNumber}>{unit.name}</span>
      ) : (
        <>
          <span className={styles.tileName}>{unit.name}</span>
          <span className={styles.tileNote}>{unit.note}</span>
        </>
      )}
    </button>
  );
});

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
        Any other group the commission names, BJP+ among them, takes the OTH colour
        and keeps its own name in the table.
      </li>
    </ul>
  );
}

export default function DrillMap({ title, units, variant, onSelect, caption }: DrillMapProps) {
  const [hovered, setHovered] = useState<MapUnit | null>(null);

  // Stable, so the memoised tiles do not re-render when the hovered unit does.
  const handleHover = useCallback((unit: MapUnit | null) => setHovered(unit), []);
  const handleSelect = useCallback((key: string) => onSelect(key), [onSelect]);

  return (
    <section aria-label={title}>
      <h2>{title}</h2>
      <Legend />
      <div
        className={[styles.map, variant === "ward" ? styles.mapWards : ""]
          .filter(Boolean)
          .join(" ")}
        data-testid="drill-map"
      >
        {units.map((unit) => (
          <Tile
            key={unit.key}
            unit={unit}
            variant={variant}
            onSelect={handleSelect}
            onHover={handleHover}
          />
        ))}
      </div>
      <p className={styles.hoverLine} role="status" data-testid="map-hover">
        {hovered
          ? [hovered.name, hovered.note ?? frontLabel(hovered.front), hovered.action]
              .filter(Boolean)
              .join(". ")
          : ""}
      </p>
      <p className={styles.hoverLine}>{caption}</p>
    </section>
  );
}
