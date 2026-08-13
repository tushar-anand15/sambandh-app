/**
 * The fallback map: one tile per territory, where no polygon exists.
 *
 * Ward polygons were published for the 2025 cycle only, and no local-body layer
 * is emitted for 2010 at all. Those levels still have results, so they still
 * get a map of a kind — a tile per unit, coloured by front, carrying the result
 * and nothing about where the unit is. `DrillMap` says which of the two a
 * reader is looking at.
 *
 * A body with 100 wards is 100 elements, and only the two tiles whose selection
 * changed re-render on a click, because each tile is memoised on props that do
 * not change when the hovered unit does.
 */

import { memo } from "react";

import styles from "./elections.module.css";
import { frontToken, type MapUnit } from "./payload";

interface TileProps {
  unit: MapUnit;
  variant: "area" | "ward";
  onSelect: (key: string) => void;
  onHover: (unit: MapUnit | null) => void;
}

const Tile = memo(function Tile({ unit, variant, onSelect, onHover }: TileProps) {
  const ward = variant === "ward";
  const classes = [
    styles.tile,
    ward ? styles.wardTile : "",
    unit.selected ? styles.tileSelected : "",
  ]
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

interface TileMapProps {
  units: MapUnit[];
  /** Ward tiles carry a number and nothing else, so they are smaller. */
  variant: "area" | "ward";
  onSelect: (key: string) => void;
  onHover: (unit: MapUnit | null) => void;
}

export default function TileMap({ units, variant, onSelect, onHover }: TileMapProps) {
  return (
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
          onSelect={onSelect}
          onHover={onHover}
        />
      ))}
    </div>
  );
}
