/**
 * The boundary layers this page is drawn from: the files, then where they came
 * from.
 *
 * Two lists and nothing else. The first is the downloads — a label, a size and
 * a link. The second is one short bullet per source.
 *
 * A bullet says which cycles the source covers, because that is the question a
 * reader has in front of a list of files spanning four of them: the 2025 shapes
 * are KSMART's and the older ones are OpenStreetMap's, and nothing else on the
 * page says so.
 *
 * Then the snapshot date, where there is one. OpenStreetMap's 2015 and 2010
 * layers are drawn from a November 2020 capture, so those are current
 * boundaries standing in for older ones — a real caveat, and the reason the
 * field is worth a clause. KSMART is served live and has no date to give.
 *
 * Then the attribution, where a licence asks for one. ODbL does, and a rendered
 * map is redistribution, so "© OpenStreetMap contributors" stays whatever else
 * moves. KSMART publishes no licence, so its bullet ends at the cycles.
 *
 * Everything else that used to be here is gone: the licence notes spelling out
 * what the licence line already says, a paragraph about front colours that
 * belonged beside the map legend, and a provenance footer repeating the dataset
 * name inside the section about where the data came from.
 */

import styles from "./elections.module.css";
import { formatBytes, formatCount, type MapLayer, type MapsPayload } from "./payload";
import { track } from "@/lib/telemetry";

/**
 * One entry per source, in the order the layers first name them.
 *
 * Cycles come from the layers this server actually holds. A file listed as
 * absent is still worth naming in the downloads above, so a reader knows it
 * exists and why they cannot have it, but claiming its year here would say the
 * site covers a cycle it cannot draw.
 */
function sources(layers: MapLayer[]): { layer: MapLayer; cycles: number[] }[] {
  const bySource = new Map<string, { layer: MapLayer; cycles: number[] }>();
  for (const layer of layers) {
    const entry = bySource.get(layer.source);
    const cycles = entry ? entry.cycles : [];
    if (layer.available) cycles.push(layer.cycle);
    if (!entry) bySource.set(layer.source, { layer, cycles });
  }
  return [...bySource.values()]
    .map((entry) => ({ ...entry, cycles: [...new Set(entry.cycles)].sort((a, b) => b - a) }))
    .filter((entry) => entry.cycles.length > 0);
}

/** "2025", "2020 and 2015", "2020, 2015 and 2010". */
function listCycles(cycles: number[]): string {
  if (cycles.length <= 1) return String(cycles[0] ?? "");
  return `${cycles.slice(0, -1).join(", ")} and ${cycles[cycles.length - 1]}`;
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

      <ul className={styles.sourceRefs}>
        {sources(maps.layers).map(({ layer, cycles }) => (
          <li key={layer.source}>
            <span className={styles.sourceName}>{layer.source}</span> —{" "}
            {listCycles(cycles)}
            {layer.snapshot ? `, ${layer.snapshot} snapshot` : ""}
            {layer.licence ? `, ${layer.attribution}` : ""}
          </li>
        ))}
      </ul>
    </section>
  );
}
