/**
 * The map, drawn from the published boundaries.
 *
 * One `<path>` per territory, filled with the front that holds it, inside a
 * single inline SVG. That keeps hit-testing where it is cheapest: the pointer
 * is over a path or it is not, and the browser decides, so hovering a
 * hundred-ward body runs no geometry code at all. The hover outline is a CSS
 * `:hover` rule rather than React state, so moving the pointer across the map
 * re-renders nothing; the one line of text naming the unit under the pointer is
 * the only thing state drives, and every shape is memoised against it.
 *
 * A shape the results do not cover — a local body the commission published
 * nothing for — is drawn in the neutral surface colour and is not clickable. It
 * keeps its place on the map rather than leaving a hole, and its name and the
 * reason are in its `<title>`.
 */

import { memo, useMemo } from "react";

import styles from "./elections.module.css";
import { project, type GeoCollection, type Shape } from "./geometry";
import { frontToken, type MapUnit } from "./payload";

interface AreaProps {
  shape: Shape;
  unit: MapUnit | undefined;
  onSelect: (key: string) => void;
  onHover: (unit: MapUnit | null) => void;
}

const Area = memo(function Area({ shape, unit, onSelect, onHover }: AreaProps) {
  if (!unit) {
    return (
      <path className={[styles.area, styles.areaBlank].join(" ")} d={shape.d}>
        <title>{`${shape.name}. No result for this cycle.`}</title>
      </path>
    );
  }

  return (
    <path
      className={[styles.area, unit.selected ? styles.areaSelected : ""]
        .filter(Boolean)
        .join(" ")}
      d={shape.d}
      style={{ fill: `var(--${frontToken(unit.front)})` }}
      role="button"
      tabIndex={0}
      aria-pressed={unit.selected}
      // The label carries the result too, so a screen reader gets what the
      // colour carries for everyone else.
      aria-label={[unit.name, unit.note, unit.action].filter(Boolean).join(". ")}
      onClick={() => onSelect(unit.key)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(unit.key);
        }
      }}
      onMouseEnter={() => onHover(unit)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(unit)}
      onBlur={() => onHover(null)}
    >
      <title>{[unit.name, unit.note].filter(Boolean).join(". ")}</title>
    </path>
  );
});

interface PolygonMapProps {
  /** Names what is drawn, with the cycle. Read by a screen reader as the image. */
  title: string;
  units: MapUnit[];
  geometry: GeoCollection;
  onSelect: (key: string) => void;
  onHover: (unit: MapUnit | null) => void;
}

export default function PolygonMap({
  title,
  units,
  geometry,
  onSelect,
  onHover,
}: PolygonMapProps) {
  const { viewBox, shapes } = useMemo(() => project(geometry), [geometry]);
  const byKey = useMemo(() => new Map(units.map((unit) => [unit.key, unit])), [units]);

  return (
    <svg
      className={styles.polygonMap}
      viewBox={viewBox}
      preserveAspectRatio="xMidYMid meet"
      aria-label={title}
      data-testid="drill-map"
      data-level={geometry.level}
    >
      {shapes.map((shape) => (
        <Area
          key={shape.key}
          shape={shape}
          unit={byKey.get(shape.key)}
          onSelect={onSelect}
          onHover={onHover}
        />
      ))}
    </svg>
  );
}
