/**
 * One boundary layer: what it is, where it came from, and its download.
 *
 * The vintage and the delimitation flag are the layer's own, read from
 * `/api/maps` rather than written here, so the sentence a reader sees is the
 * one the layer file itself carries in its `provenance` member.
 *
 * The ODbL layers state their attribution on the card. It is a licence
 * condition on redistribution, and a rendered map is redistribution.
 *
 * A layer this server does not hold offers no link. A link to a file that is
 * not there produces a 404 the browser saves as a document, and a GeoJSON
 * parser then fails on it a long way from the cause.
 */

import styles from "./elections.module.css";
import { formatBytes, type MapLayer } from "./payload";
import { track } from "@/lib/telemetry";

export default function LayerCard({ layer }: { layer: MapLayer }) {
  return (
    <li className={styles.layerCard}>
      <h3 className={styles.layerTitle}>{layer.label}</h3>
      <p className={styles.layerMeta}>
        {layer.level === "ward" ? "Ward polygons" : "Local-body polygons"} · {layer.source}
      </p>
      <p className={styles.layerMeta}>
        Boundary vintage: {layer.boundary_vintage}.{" "}
        {layer.per_cycle_delimitation
          ? "Delimited for this cycle."
          : "Not delimited for this cycle."}
        {layer.note ? ` ${layer.note}` : ""}
      </p>
      <p className={styles.layerMeta}>
        {layer.licence ? `${layer.licence}. ` : ""}
        {layer.licence_note} Attribution: {layer.attribution}.
      </p>
      {layer.available ? (
        <p className={styles.layerMeta}>
          <a
            href={layer.url}
            download={layer.filename}
            onClick={() =>
              track({ name: "layer_download", layer: layer.filename, format: "geojson" })
            }
          >
            Download GeoJSON
          </a>{" "}
          · {formatBytes(layer.bytes)}
        </p>
      ) : (
        <p className={[styles.layerMeta, styles.absent].join(" ")} role="status">
          {layer.unavailable_reason}
        </p>
      )}
    </li>
  );
}
