/**
 * The boundary layers as downloads, one card each.
 *
 * The map above is drawn from these, cut to one level at a time. Whole files
 * are offered here for a reader who wants the layer itself.
 *
 * Each card carries its own layer's vintage, licence and attribution, read from
 * `/api/maps`. The page carries no account of the boundary vintages beyond
 * that: which cycle was delimited when, and why 2010, 2015 and 2020 share one
 * November 2020 snapshot, is the method page's subject.
 */

import SourceLine from "@/components/shell/SourceLine";

import LayerCard from "./LayerCard";
import styles from "./elections.module.css";
import { formatCount, type MapsPayload } from "./payload";

export default function BoundaryLayers({ maps }: { maps: MapsPayload }) {
  const { coverage } = maps;

  return (
    <section aria-label="Boundary layers">
      <h2>Boundary layers</h2>

      <p>
        {formatCount(coverage.with_geometry)} of {formatCount(coverage.bodies)} local
        bodies have a polygon in these {formatCount(maps.count)} layers.{" "}
        {formatCount(coverage.without_geometry)} do not.
      </p>

      <ul className={styles.layers}>
        {maps.layers.map((layer) => (
          <LayerCard key={layer.id} layer={layer} />
        ))}
      </ul>

      <SourceLine
        dataset={maps.provenance.dataset}
        build_date={maps.provenance.build_date}
        note={maps.provenance.source}
      />
    </section>
  );
}
