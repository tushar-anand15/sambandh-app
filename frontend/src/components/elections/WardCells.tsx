/**
 * Wards before 2025: the body's real outline, and one cell per ward inside it.
 *
 * Ward polygons exist for the 2025 cycle alone. The obvious substitute is 2025's
 * own wards drawn under an earlier result, and it is wrong: 1,136 of 1,199
 * bodies changed ward count between two cycles, so for 95% of them there is no
 * ward of 2025 that is ward 7 of 2020.
 *
 * So the outline is drawn — that boundary was published — and the wards are a
 * compact block of squares inside it, in number order, laid out to the
 * proportions of the body's own bounding box. A cell carries the result and its
 * number. It carries nothing about where the ward was, and the caption under it
 * says so.
 *
 * The polygon is not cut into N parts. It would read as a ward map, and those
 * divisions have never been published.
 *
 * 2010 has no outline either — no boundary layer is emitted for it at all — so
 * that cycle gets the block on its own.
 */

import { memo, useMemo } from "react";

import { blockIn, gridFor, type CellBlock } from "./cells";
import styles from "./elections.module.css";
import { project, viewBoxOf, type Box, type GeoCollection } from "./geometry";
import { frontToken, type MapUnit } from "./payload";

interface CellProps {
  unit: MapUnit;
  x: number;
  y: number;
  size: number;
  onSelect: (key: string) => void;
  onHover: (unit: MapUnit | null) => void;
}

const Cell = memo(function Cell({ unit, x, y, size, onSelect, onHover }: CellProps) {
  const inset = size * 0.06;

  return (
    <g
      className={[styles.cell, unit.selected ? styles.cellSelected : ""]
        .filter(Boolean)
        .join(" ")}
      role="button"
      tabIndex={0}
      aria-pressed={unit.selected}
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
      <rect
        className={styles.cellFace}
        x={x + inset}
        y={y + inset}
        width={size - inset * 2}
        height={size - inset * 2}
        style={{ fill: `var(--${frontToken(unit.front)})` }}
      />
      <text
        className={styles.cellNumber}
        x={x + size / 2}
        y={y + size / 2 + size * 0.13}
        fontSize={size * 0.36}
        strokeWidth={size * 0.1}
      >
        {unit.name}
      </text>
      <title>{[unit.name, unit.note].filter(Boolean).join(". ")}</title>
    </g>
  );
});

/** The block on its own, at a size that reads without an outline around it. */
const BARE = 100;

function bareLayout(count: number): { block: CellBlock; view: Box } {
  const grid = gridFor(count, 1);
  return {
    block: { ...grid, size: BARE, x: 0, y: 0 },
    view: { x: -2, y: -2, w: grid.cols * BARE + 4, h: grid.rows * BARE + 4 },
  };
}

interface WardCellsProps {
  /** Names what is drawn, with the cycle. Read by a screen reader as the image. */
  title: string;
  units: MapUnit[];
  /** The body's own outline, or null where no layer holds one. */
  outline: GeoCollection | null;
  onSelect: (key: string) => void;
  onHover: (unit: MapUnit | null) => void;
}

export default function WardCells({
  title,
  units,
  outline,
  onSelect,
  onHover,
}: WardCellsProps) {
  const drawn = useMemo(() => (outline ? project(outline) : null), [outline]);
  const shape = drawn?.shapes[0] ?? null;

  const { block, view } = useMemo(() => {
    if (!shape) return bareLayout(units.length);
    return {
      block: blockIn(units.length, shape.box, {
        x: shape.labelX,
        y: shape.labelY,
        r: shape.labelRadius,
      }),
      view: drawn!.extent,
    };
  }, [shape, drawn, units.length]);

  return (
    <svg
      className={styles.cellMap}
      viewBox={viewBoxOf(view)}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={title}
      data-testid="drill-map"
      data-level="ward-cells"
      data-outline={shape ? "published" : "none"}
    >
      {shape ? (
        <path className={styles.outline} d={shape.d}>
          <title>{shape.name}</title>
        </path>
      ) : null}

      {units.map((unit, index) => (
        <Cell
          key={unit.key}
          unit={unit}
          x={block.x + (index % block.cols) * block.size}
          y={block.y + Math.floor(index / block.cols) * block.size}
          size={block.size}
          onSelect={onSelect}
          onHover={onHover}
        />
      ))}
    </svg>
  );
}
