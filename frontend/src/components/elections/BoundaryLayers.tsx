/**
 * The boundary layers, their provenance, and what changed between cycles.
 *
 * These sit under the map because they are what the map is drawn against;
 * there is no separate Maps tab.
 *
 * The boundary story is stated here in full. Ward polygons exist for the 2025
 * cycle only. The three earlier cycles have local-body polygons from one
 * November 2020 opendatakerala snapshot, reused for all three, because no
 * ward-level boundary set has ever been published for them. That is a property
 * of what has been published, and the wording follows sulekha's geo runbook of
 * 6 August 2026 rather than softening it.
 */

import SourceLine from "@/components/shell/SourceLine";

import LayerCard from "./LayerCard";
import styles from "./elections.module.css";
import { formatCount, type MapsPayload } from "./payload";

/**
 * Features in each local-body layer, measured in sulekha's geo runbook,
 * 6 August 2026. The 2010 and 2015 counts fall short of the commission's own
 * body count for those cycles: the November 2020 snapshot has no counterpart
 * for bodies that no longer existed by then.
 */
const CHANGE_ROWS = [
  {
    cycle: 2010,
    level: "Local body",
    source: "opendatakerala (OpenStreetMap)",
    vintage: "November 2020 snapshot, reused",
    delimited: "No",
    bodies: "1,208",
    inLayer: "1,158",
  },
  {
    cycle: 2015,
    level: "Local body",
    source: "opendatakerala (OpenStreetMap)",
    vintage: "November 2020 snapshot, reused",
    delimited: "No",
    bodies: "1,199",
    inLayer: "1,187",
  },
  {
    cycle: 2020,
    level: "Local body",
    source: "opendatakerala (OpenStreetMap)",
    vintage: "November 2020 snapshot",
    delimited: "Yes",
    bodies: "1,199",
    inLayer: "1,199",
  },
];

export default function BoundaryLayers({ maps }: { maps: MapsPayload }) {
  const { coverage } = maps;

  return (
    <section aria-label="Boundary layers">
      <h2>Boundary layers</h2>

      <p>
        Ward polygons exist for the 2025 cycle only, read from KSMART's live tile
        server. {maps.ward_geometry_note} The 2010, 2015 and 2020 layers are
        local-body polygons from a single opendatakerala snapshot taken in November
        2020, reused for all three cycles and labelled as such in each layer's own
        provenance.
      </p>

      <p>
        {formatCount(maps.count)} layers: four from KSMART's 2025 tiles, at ward,
        local body, block panchayat and district panchayat level, and three
        local-body layers from the opendatakerala release. None of them is
        cadastral, and none should be used for a property, survey or delimitation
        record.
      </p>

      <p>
        {formatCount(coverage.with_geometry)} of {formatCount(coverage.bodies)} local
        bodies have a polygon in these layers.{" "}
        {formatCount(coverage.without_geometry)} do not, so they are absent from the
        map above and are reachable through the local body dropdown.
      </p>

      <ul className={styles.layers}>
        {maps.layers.map((layer) => (
          <LayerCard key={layer.id} layer={layer} />
        ))}
      </ul>

      <h3>What changed between cycles</h3>
      <div className={styles.tableScroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Cycle</th>
              <th scope="col">Geometry level</th>
              <th scope="col">Source</th>
              <th scope="col">Boundary vintage</th>
              <th scope="col">Delimited for the cycle</th>
              <th scope="col" className={styles.numeric}>
                Local bodies that cycle
              </th>
              <th scope="col" className={styles.numeric}>
                In the layer
              </th>
            </tr>
          </thead>
          <tbody>
            {CHANGE_ROWS.map((row) => (
              <tr key={row.cycle}>
                <td>{row.cycle}</td>
                <td>{row.level}</td>
                <td>{row.source}</td>
                <td>{row.vintage}</td>
                <td>{row.delimited}</td>
                <td className={styles.numeric}>{row.bodies}</td>
                <td className={styles.numeric}>{row.inLayer}</td>
              </tr>
            ))}
            <tr>
              <td>2025</td>
              <td>Ward and local body</td>
              <td>KSMART vector tiles</td>
              <td>Current, from the live tile server</td>
              <td>Yes</td>
              <td className={styles.numeric}>{formatCount(coverage.bodies)}</td>
              <td className={styles.numeric}>{formatCount(coverage.with_geometry)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className={styles.layerMeta}>
        The 2010, 2015 and 2020 rows are measured in sulekha's geo runbook, 6 August
        2026. The 2025 row is the coverage count this site's own database holds.
      </p>

      <SourceLine
        dataset={maps.provenance.dataset}
        build_date={maps.provenance.build_date}
        note={maps.provenance.source}
      />
    </section>
  );
}
