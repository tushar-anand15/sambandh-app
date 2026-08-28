/**
 * Which of a district's three elections is on the map.
 *
 * A voter in rural Kerala casts three ballots: a grama panchayat ward, a block
 * panchayat ward, a district panchayat ward. Three bodies, three results, over
 * the same ground. Before this control the site collapsed them into one list
 * of "local bodies in a district", which is not a level — it is three levels
 * flattened.
 *
 * The district panchayat is a link rather than a tier here, because it is a
 * single body: its own result is a body view, the same view a grama panchayat
 * gets, and the site already has an address for that.
 */

import { Link } from "react-router-dom";

import styles from "./elections.module.css";
import { electionsPath, type Tier } from "./selection";

interface TierPickerProps {
  district: string;
  cycle: number;
  tier: Tier;
  /** The district panchayat's own code, or null where the cycle has no row. */
  districtPanchayat: string | null;
  onTier: (tier: Tier) => void;
}

const LABELS: Record<Tier, string> = {
  block_panchayat: "Block panchayats",
  grama_panchayat: "Grama panchayats and urban bodies",
};

export default function TierPicker({
  district,
  cycle,
  tier,
  districtPanchayat,
  onTier,
}: TierPickerProps) {
  return (
    <div className={styles.tierPicker} role="group" aria-label="Which tier to show">
      <span className={styles.tierLabel}>Three elections cover {district}</span>
      {districtPanchayat ? (
        <Link
          className={styles.tierLink}
          to={electionsPath({ cycle, lbCode: districtPanchayat })}
        >
          The district panchayat's own result
        </Link>
      ) : (
        <span className={styles.tierLink} aria-disabled="true">
          The district panchayat has no result for {cycle}
        </span>
      )}
      {(Object.keys(LABELS) as Tier[]).map((option) => (
        <button
          key={option}
          type="button"
          className={styles.tierButton}
          aria-pressed={option === tier}
          onClick={() => onTier(option)}
        >
          {LABELS[option]}
        </button>
      ))}
    </div>
  );
}
