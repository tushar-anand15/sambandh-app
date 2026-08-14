/**
 * The boundary layers this page is drawn from, as a list of downloads.
 *
 * One line per layer: what it is, its vintage, its size and its file. The
 * licence and the attribution are the same for every layer from the same
 * source, so they are stated once per source under the list. The ODbL
 * attribution is a condition on redistribution and a rendered map is
 * redistribution, so it stays on the page whatever else moves.
 *
 * Which cycle was delimited when, and why 2010, 2015 and 2020 share one
 * November 2020 snapshot, is the method page's subject and is not repeated
 * here.
 */

import SourceLine from "@/components/shell/SourceLine";

import styles from "./elections.module.css";
import { formatBytes, formatCount, type MapLayer, type MapsPayload } from "./payload";
import { track } from "@/lib/telemetry";

const LEVELS: Record<string, string> = {
  ward: "ward boundaries",
  local_body: "local body boundaries",
  block_panchayat: "block panchayat boundaries",
  district_panchayat: "district panchayat boundaries",
};

function what(layer: MapLayer): string {
  return `${LEVELS[layer.level] ?? `${layer.level} polygons`}, ${layer.boundary_vintage}`;
}

/** One licence line per source, in the order the layers first name them. */
function licenceLines(layers: MapLayer[]): string[] {
  const lines: string[] = [];
  const seen = new Set<string>();
  for (const layer of layers) {
    const key = `${layer.source}|${layer.licence ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push(
      [
        `${layer.source}: ${layer.licence ?? "no licence published"}.`,
        layer.licence_note,
        `Attribution: ${layer.attribution}.`,
      ].join(" "),
    );
  }
  return lines;
}

export default function Sources({ maps }: { maps: MapsPayload }) {
  const { coverage } = maps;

  return (
    <section aria-label="Sources">
      <h2>Sources</h2>

      <p>
        {formatCount(coverage.with_geometry)} of {formatCount(coverage.bodies)}{" "}
        local bodies have a boundary in these {formatCount(maps.count)} files.
      </p>

      <ul className={styles.sources}>
        {maps.layers.map((layer) => (
          <li key={layer.id} className={styles.sourceItem}>
            <span className={styles.sourceName}>{layer.label}</span>
            <span>{what(layer)}</span>
            {layer.available ? (
              <>
                <span>{formatBytes(layer.bytes)}</span>
                <a
                  href={layer.url}
                  download={layer.filename}
                  onClick={() =>
                    track({ name: "layer_download", layer: layer.filename, format: "geojson" })
                  }
                >
                  Download GeoJSON
                </a>
              </>
            ) : (
              <span className={styles.absent}>{layer.unavailable_reason}</span>
            )}
          </li>
        ))}
      </ul>

      {licenceLines(maps.layers).map((line) => (
        <p key={line} className={styles.layerMeta}>
          {line}
        </p>
      ))}

      <SourceLine
        dataset={maps.provenance.dataset}
        build_date={maps.provenance.build_date}
        note={maps.provenance.source}
      />
    </section>
  );
}
