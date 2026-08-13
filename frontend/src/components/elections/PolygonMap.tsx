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
 *
 * **Every territory carries its name.** A district a reader cannot name is a
 * district they cannot choose. The name is written at the shape's pole of
 * inaccessibility rather than its centroid, because the centroid of a coastal
 * panchayat is often in the sea, and it is dropped where it does not fit inside
 * the shape: a hundred overlapping ward names read as none. What is dropped is
 * still on hover and still in the shape's accessible name.
 *
 * **The map zooms to the selection.** The `viewBox` is interpolated from where
 * it was to the box that frames the selected territory, so clicking a row in
 * the ward table moves the map to that ward rather than redrawing it somewhere
 * else. Under `prefers-reduced-motion` the same box is set in one step.
 */

import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import styles from "./elections.module.css";
import { usePrefersReducedMotion } from "./motion";
import {
  frame,
  project,
  viewBoxOf,
  type Box,
  type GeoCollection,
  type Shape,
} from "./geometry";
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

// ---------------------------------------------------------------------------
// Names on the map
// ---------------------------------------------------------------------------

/** What a name is drawn at, in CSS pixels, whatever the map is scaled to. */
const LABEL_PX = 12.5;

/** The width of one character as a share of the size, for this sans stack. */
const CHARACTER = 0.55;

/** The three sizes a name is tried at before it is dropped. */
const STEPS = [1, 0.85, 0.72];

interface Label {
  key: string;
  x: number;
  y: number;
  /** In viewBox units, at the size the name was found to fit at. */
  size: number;
  primary: string;
  secondary: string | null;
}

function width(text: string, size: number): number {
  return text.length * size * CHARACTER;
}

/**
 * Whether a name can be written inside its own shape.
 *
 * Measured against the shape's bounding box, with a floor on how far the
 * anchor is from the edge so a name is not written along a sliver. A name that
 * fails this is dropped: a hundred ward names written over each other are
 * worth less than none, and hover still carries every one of them.
 */
function fits(text: string, size: number, shape: Shape): boolean {
  return (
    width(text, size) <= shape.box.w * 0.94 &&
    size <= shape.box.h * 0.8 &&
    size <= shape.labelRadius * 2.6
  );
}

/**
 * The names that fit inside their own shape, at the size each fits at.
 *
 * `unit` is what the page calls the territory — a district name, a local body
 * name, a ward number — and the feature's own name is written under it where
 * the two differ and there is room, which is what puts a ward's name under its
 * number.
 */
function labelsFor(shapes: Shape[], byKey: Map<string, MapUnit>, base: number): Label[] {
  const labels: Label[] = [];

  for (const shape of shapes) {
    const unit = byKey.get(shape.key);
    const primary = unit?.name || shape.name;
    if (!primary) continue;

    const size = STEPS.map((step) => base * step).find((candidate) =>
      fits(primary, candidate, shape),
    );
    if (size === undefined) continue;

    const different =
      shape.name && shape.name.toLowerCase() !== primary.toLowerCase() ? shape.name : null;
    const secondary =
      different && fits(different, size * 0.82, shape) && size * 2.6 <= shape.box.h
        ? different
        : null;

    // Held inside the shape's own box, so a name anchored near an edge does
    // not run out over its neighbour.
    const half = width(secondary ?? primary, size) / 2;
    labels.push({
      key: shape.key,
      x: Math.min(
        Math.max(shape.labelX, shape.box.x + half),
        shape.box.x + shape.box.w - half,
      ),
      y: shape.labelY,
      size,
      primary,
      secondary,
    });
  }

  return labels;
}

const Labels = memo(function Labels({ labels }: { labels: Label[] }) {
  return (
    <g className={styles.mapLabels} aria-hidden="true">
      {labels.map((label) => (
        <text
          key={label.key}
          className={styles.mapLabel}
          x={label.x}
          y={label.secondary ? label.y - label.size * 0.15 : label.y + label.size * 0.34}
          fontSize={label.size}
          strokeWidth={label.size * 0.28}
        >
          {label.primary}
          {label.secondary ? (
            <tspan
              className={styles.mapLabelSecondary}
              x={label.x}
              dy={label.size * 1.05}
              fontSize={label.size * 0.82}
            >
              {label.secondary}
            </tspan>
          ) : null}
        </text>
      ))}
    </g>
  );
});

// ---------------------------------------------------------------------------
// Zoom
// ---------------------------------------------------------------------------

/** Long enough to follow, short enough not to be waited on. */
const ZOOM_MS = 420;

function ease(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

/**
 * The viewBox on its way to `target`.
 *
 * The first box is taken whole: a map that zoomed in on load would animate
 * something the reader never asked for. Every box after it is interpolated,
 * unless the reader has asked for no movement.
 */
function useZoom(target: Box, reduced: boolean): Box {
  const [box, setBox] = useState(target);
  const from = useRef(target);
  const first = useRef(true);

  useEffect(() => {
    if (first.current || reduced) {
      first.current = false;
      from.current = target;
      setBox(target);
      return;
    }

    const start = from.current;
    const began = performance.now();
    let frameId = 0;

    const step = (now: number) => {
      const t = Math.min(1, (now - began) / ZOOM_MS);
      const k = ease(t);
      const next = {
        x: start.x + (target.x - start.x) * k,
        y: start.y + (target.y - start.y) * k,
        w: start.w + (target.w - start.w) * k,
        h: start.h + (target.h - start.h) * k,
      };
      from.current = next;
      setBox(next);
      if (t < 1) frameId = requestAnimationFrame(step);
    };

    frameId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frameId);
  }, [target, reduced]);

  return box;
}

/** The box the map is rendered into, in CSS pixels. */
function useRenderedSize(ref: React.RefObject<SVGSVGElement | null>): {
  width: number;
  height: number;
} {
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const measure = () => {
      const rect = node.getBoundingClientRect();
      setSize({ width: rect.width, height: rect.height });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);

  return size;
}

/**
 * How many viewBox units one CSS pixel is.
 *
 * `preserveAspectRatio` fits the whole viewBox inside the element, so the
 * scale is whichever of the two directions runs out first. Kerala is two and a
 * half times taller than it is wide and its map is capped by height, which is
 * where reading this off the width alone put every district name at half the
 * size it was asked for.
 */
function unitsPerPixel(box: Box, size: { width: number; height: number }): number {
  if (size.width <= 0 || size.height <= 0) return 1;
  return Math.max(box.w / size.width, box.h / size.height);
}

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
  const svg = useRef<SVGSVGElement>(null);
  const reduced = usePrefersReducedMotion();
  const size = useRenderedSize(svg);

  const { extent, shapes } = useMemo(() => project(geometry), [geometry]);
  const byKey = useMemo(() => new Map(units.map((unit) => [unit.key, unit])), [units]);

  const selectedKey = units.find((unit) => unit.selected)?.key ?? null;
  const selectedBox =
    shapes.find((shape) => shape.key === selectedKey)?.box ?? null;

  // `shapes` is memoised on the geometry, so a shape's box keeps its identity
  // across every re-render that does not change the selection, and a re-render
  // for something else does not restart the zoom.
  const target = useMemo(() => frame(extent, selectedBox), [extent, selectedBox]);
  const box = useZoom(target, reduced);

  // A name asked for at 12.5px is drawn at that size whether the map is in a
  // half column or across the page. Which names fit is decided against the
  // settled zoom, so none of them flicker on and off while it runs.
  const perPixel = unitsPerPixel(target, size);
  const labels = useMemo(
    () => labelsFor(shapes, byKey, LABEL_PX * perPixel),
    [shapes, byKey, perPixel],
  );

  // Mid-zoom the viewBox is wider than the target, so the names are scaled by
  // that ratio and hold still on screen while the map moves under them.
  const scale = target.w > 0 ? box.w / target.w : 1;
  const drawn = useMemo(
    () => labels.map((label) => ({ ...label, size: label.size * scale })),
    [labels, scale],
  );

  return (
    <svg
      ref={svg}
      className={styles.polygonMap}
      viewBox={viewBoxOf(box)}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={title}
      data-testid="drill-map"
      data-level={geometry.level}
      data-zoom={selectedKey ?? ""}
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
      <Labels labels={drawn} />
    </svg>
  );
}
