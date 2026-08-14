/**
 * The four cycles, as one control.
 *
 * A range input over the index of the cycle rather than the year, because the
 * cycles are 2010, 2015, 2020 and 2025 and a year slider would offer sixteen
 * positions that hold no election. Moving it changes the URL, and the URL is
 * what every other part of the page reads.
 */

import styles from "./elections.module.css";
import { CYCLES } from "./payload";

interface CycleSliderProps {
  cycle: number;
  onChange: (cycle: number) => void;
}

export default function CycleSlider({ cycle, onChange }: CycleSliderProps) {
  const index = Math.max(0, CYCLES.indexOf(cycle as (typeof CYCLES)[number]));

  return (
    <div className={styles.slider}>
      <label className="label" htmlFor="cycle-slider">
        Election cycle
      </label>
      <input
        id="cycle-slider"
        className={styles.sliderInput}
        type="range"
        min={0}
        max={CYCLES.length - 1}
        step={1}
        value={index}
        aria-valuetext={String(cycle)}
        onChange={(event) => onChange(CYCLES[Number(event.target.value)])}
      />
      <p className={styles.sliderTicks} aria-hidden="true">
        {CYCLES.map((year) => (
          <span key={year} className={year === cycle ? styles.sliderTickOn : undefined}>
            {year}
          </span>
        ))}
      </p>
    </div>
  );
}
