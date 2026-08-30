/**
 * The boundary layers this page is drawn from, as a list of downloads.
 *
 * A line is a label, a size and a link. The vintage, the licence and the
 * attribution are properties of the source rather than of the file, so they
 * are stated once per source under the list — `what(layer)` used to append the
 * vintage to every layer, which put "as KSMART publishes them today" on the
 * page four times.
 *
 * The ODbL attribution is a condition on redistribution and a rendered map is
 * redistribution, so it stays on the page whatever else moves.
 *
 * The fronts the commission names beyond the four with colours are named here
 * too. That belongs at the foot of the page with the rest of the accounting
 * for what the colours are, not in a legend beside every map.
 */

import SourceLine from "@/components/shell/SourceLine";

import styles from "./elections.module.css";
import { formatBytes, formatCount, type MapLayer, type MapsPayload } from "./payload";
import { track } from "@/lib/telemetry";

/** One block per source, in the order the layers first name them. */
function sources(layers: MapLayer[]): { source: string; lines: string[] }[] {
  const blocks: { source: string; lines: string[] }[] = [];
  const seen = new Set<string>();
  for (const layer of layers) {
    if (seen.has(layer.source)) continue;
    seen.add(layer.source);
    blocks.push({
      source: layer.source,
      lines: [
        `Boundaries: ${layer.boundary_vintage}.`,
        `${layer.licence ?? "No open licence published"}. ${layer.licence_note}`,
        `Attribution: ${layer.attribution}.`,
      ],
    });
  }
  return blocks;
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

      {sources(maps.layers).map((block) => (
        <p key={block.source} className={styles.layerMeta}>
          {block.source}. {block.lines.join(" ")}
        </p>
      ))}

      <p className={styles.layerMeta}>
        Four fronts have a colour. Any other group the commission names, BJP+
        among them, takes the OTH colour and keeps its own name in every table
        it appears in.
      </p>

      <SourceLine
        dataset={maps.provenance.dataset}
        build_date={maps.provenance.build_date}
        note={maps.provenance.source}
      />
    </section>
  );
}
