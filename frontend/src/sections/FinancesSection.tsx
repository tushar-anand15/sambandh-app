/**
 * The Finances section.
 *
 * Selection lives in the URL, as in `/finances/M08032/2023-2024`, so this
 * component reads `:lb` and `:year` from the router and holds no selection
 * state of its own. A body with no year shows the fourteen-year series; a body
 * with a year shows that year's figures, its carry-forward, and every project
 * row behind the totals. The project table is the page's centre: it is
 * paginated, and a row with a scanned document opens it in a drawer.
 *
 * Three states a reader must be able to tell apart, and the endpoint keeps
 * them apart: a body Sulekha has no plan record for at all, a body-year that
 * falls outside the years it does hold, and a year with figures. Each renders
 * its own stated cause; none of them renders an empty table.
 */

import { useParams } from "react-router-dom";

import BodySelector from "@/components/select/BodySelector";
import ContinuityPanel from "@/components/finances/ContinuityPanel";
import ProjectTable from "@/components/finances/ProjectTable";
import YearFigures from "@/components/finances/YearFigures";
import YearSeries from "@/components/finances/YearSeries";
import {
  previousYear,
  useFinancesSeries,
  useFinancesYear,
} from "@/components/finances/useFinances";
import type { ProjectRow } from "@/components/finances/types";

export default function FinancesSection() {
  const params = useParams();
  const lbCode = params.lb ?? null;
  const yearLabel = params.year ?? null;

  const series = useFinancesSeries(lbCode);
  const year = useFinancesYear(lbCode, yearLabel);

  // The previous year is fetched only when the dataset covers it and only to
  // name the carried projects. The counts themselves come from the endpoint.
  const seriesYears = series.data?.years ?? [];
  const candidate = yearLabel ? previousYear(yearLabel) : null;
  const previousLabel =
    candidate && seriesYears.some((entry) => entry.year_label === candidate)
      ? candidate
      : null;
  const previous = useFinancesYear(
    year.data?.available ? lbCode : null,
    year.data?.available ? previousLabel : null,
  );

  let previousRows: ProjectRow[] | null;
  if (previousLabel === null) {
    previousRows = [];
  } else if (previous.loading) {
    previousRows = null;
  } else {
    previousRows = previous.data?.available ? (previous.data.project_rows ?? []) : [];
  }

  return (
    <div className="shell-container section-page">
      <h1>Finances</h1>
      <p className="lede">
        What a local body planned and what it spent, year by year, from the Sulekha
        plan monitoring portal.
      </p>
      <BodySelector section="finances" />

      <div className="flex flex-col gap-s7">
        {lbCode === null ? (
          <p className="notice">
            Choose a district, a local body and a financial year to see its
            projects. A body on its own shows the fourteen-year series.
          </p>
        ) : null}

        {series.loading ? (
          <p className="selector-status" aria-busy="true">
            Loading the year series…
          </p>
        ) : null}

        {series.error ? (
          <p className="notice" role="alert">
            {series.error}
          </p>
        ) : null}

        {series.data && !series.data.available ? (
          <p className="notice" role="status">
            {series.data.reason}
          </p>
        ) : null}

        {series.data?.available && series.data.years ? (
          <YearSeries
            body={series.data.body}
            lbCode={series.data.lb_code}
            years={series.data.years}
            provenance={series.data.provenance}
          />
        ) : null}

        {lbCode !== null && yearLabel === null && series.data?.available ? (
          <p className="notice">
            Choose a financial year above for its projects, its carry-forward and
            its project table.
          </p>
        ) : null}

        {year.loading ? (
          <p className="selector-status" aria-busy="true">
            Loading the year's figures…
          </p>
        ) : null}

        {year.error ? (
          <p className="notice" role="alert">
            {year.error}
          </p>
        ) : null}

        {year.data && !year.data.available ? (
          <p className="notice" role="status">
            {year.data.reason}
          </p>
        ) : null}

        {year.data?.available ? (
          <>
            <YearFigures payload={year.data} />
            <ContinuityPanel
              payload={year.data}
              previousLabel={previousLabel}
              previousRows={previousRows}
            />
            <ProjectTable payload={year.data} />
          </>
        ) : null}
      </div>
    </div>
  );
}
