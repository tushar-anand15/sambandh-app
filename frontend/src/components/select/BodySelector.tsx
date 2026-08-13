/**
 * District → body → year, in three interactions, for all three data sections.
 *
 * Two rules govern this component.
 *
 * **The URL is the single source of truth.** Nothing here is stored in state
 * that the address bar could hold instead: the selected body is `:lb`, the
 * selected period is `:year` or `:cycle`, and the district is read back off the
 * selected body. Choosing writes to the URL and the component re-reads it. So a
 * pasted link restores the view exactly, a back button undoes one selection,
 * and a screenshot of the address bar is a shareable citation.
 *
 * The one piece of local state is the district chosen before any body is —
 * which is not a view, has nothing to restore, and disappears the moment a body
 * is picked.
 *
 * **A year with no record is shown and not offered.** `/api/bodies` names the
 * financial years each body has a record for, section by section. A year
 * outside that list stays in the control, labelled "no record", and cannot be
 * chosen. Offering it and then answering with an explanation put the reader
 * through an interaction whose only outcome was a paragraph about absence.
 *
 * **A missing section is stated, never hidden.** Panoor has no Sakarma record.
 * Dropping Meetings from its coverage list would leave a visitor to conclude
 * the body holds no meetings; naming the portal that published nothing is the
 * difference between a page that reads as broken and one that reads as honest.
 */

import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import {
  coverageOf,
  unavailableReason,
  useBodies,
  yearsFor,
  type BodySummary,
  type Section,
} from "@/hooks/useBodies";
import { track } from "@/lib/telemetry";
import YearControl, { formatYearLabel, type YearOption } from "./YearControl";

interface BodySelectorProps {
  section: Section;
}

/** `/finances`, `/finances/M08032`, `/finances/M08032/2023-2024`. */
export function sectionPath(section: string, code?: string, period?: string): string {
  const parts: string[] = [section];
  if (code) {
    parts.push(code);
    if (period) parts.push(period);
  }
  return `/${parts.join("/")}`;
}

/** The period segment is named `:cycle` under Elections and `:year` elsewhere. */
function periodParam(section: Section): "cycle" | "year" {
  return section === "elections" ? "cycle" : "year";
}

function bodyOptionLabel(body: BodySummary): string {
  return `${body.lb_name_en} — ${body.lb_type}`;
}

export default function BodySelector({ section }: BodySelectorProps) {
  const params = useParams();
  const navigate = useNavigate();
  const { data, loading, error } = useBodies();

  const lbCode = params.lb ?? "";
  const period = params[periodParam(section)] ?? "";

  // District before a body is chosen. Cleared implicitly once one is, because
  // the selected body's own district wins below.
  const [pendingDistrict, setPendingDistrict] = useState("");

  if (loading) {
    return (
      <section className="selector" aria-busy="true">
        <p className="selector-status">Loading the list of local bodies…</p>
      </section>
    );
  }

  if (error || !data) {
    return (
      <section className="selector">
        <p className="selector-status" role="alert">
          {error ?? "Could not load the list of local bodies."}
        </p>
      </section>
    );
  }

  const selected = data.bodies.find((body) => body.lb_code === lbCode) ?? null;
  // A code in the URL that matches nothing. Distinct from no code at all: one
  // is a visitor who has not chosen yet, the other is a broken link, and they
  // must not render the same.
  const unknownCode = lbCode !== "" && selected === null;

  const district = selected ? selected.district_name : pendingDistrict;
  const bodiesInDistrict = district
    ? data.bodies.filter((body) => body.district_name === district)
    : [];

  // Which years this body has a record for in this section. Null means the
  // question does not apply — no body chosen, or a section with no per-body
  // year list — and every year is then offered.
  const recorded = selected ? yearsFor(selected, section) : null;
  const hasRecord = recorded === null ? null : new Set(recorded);

  const yearOptions: YearOption[] =
    section === "elections"
      ? data.cycles.map((cycle) => ({ value: String(cycle), label: String(cycle) }))
      : data.financial_years.map((year) => {
          const unavailable = hasRecord !== null && !hasRecord.has(year.year_label);
          return {
            value: year.year_label,
            label: formatYearLabel(year.year_label),
            unavailable,
            note: unavailable
              ? "no record"
              : year.is_complete
                ? undefined
                : "in progress",
          };
        });

  const chooseDistrict = (value: string) => {
    setPendingDistrict(value);
    // The selected body is no longer in the chosen district, so the selection
    // it stands for is gone. Say so in the URL rather than leaving the address
    // bar describing a view nobody is looking at.
    if (lbCode) navigate(sectionPath(section));
  };

  const chooseBody = (value: string) => {
    if (!value) {
      navigate(sectionPath(section));
      return;
    }
    const body = data.bodies.find((b) => b.lb_code === value);
    if (body) {
      track({
        name: "body_opened",
        lb_code: body.lb_code,
        lb_type: body.lb_type,
        district: body.district_name,
        section,
      });
    }
    // The period survives a change of body: a year is not a property of the
    // body, so re-picking one would be an interaction that bought the reader
    // nothing. A year the new body has no record for is disabled in the
    // control below and answered in one sentence by the page.
    navigate(sectionPath(section, value, period));
  };

  const choosePeriod = (value: string) => {
    // Only a real change. The control is populated from the URL on every
    // render, and counting that as a choice would report a year change for
    // every page load of a pasted link.
    if (value !== period) {
      track({
        name: "year_changed",
        section,
        from: period === "" ? null : period,
        to: value === "" ? null : value,
      });
    }
    navigate(sectionPath(section, lbCode, value));
  };

  const sectionReason = selected ? unavailableReason(selected, section) : null;

  return (
    <section className="selector" aria-label="Selection">
      <div className="selector-row">
        <div className="field">
          <label className="field-label" htmlFor="district-select">
            District
          </label>
          <select
            id="district-select"
            className="field-select"
            value={district}
            onChange={(event) => chooseDistrict(event.target.value)}
          >
            <option value="">All fourteen districts</option>
            {data.districts.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label className="field-label" htmlFor="body-select">
            Local body
          </label>
          <select
            id="body-select"
            className="field-select"
            value={selected ? selected.lb_code : ""}
            disabled={district === ""}
            onChange={(event) => chooseBody(event.target.value)}
          >
            <option value="">
              {district === "" ? "Choose a district first" : "Choose a local body"}
            </option>
            {bodiesInDistrict.map((body) => (
              <option key={body.lb_code} value={body.lb_code}>
                {bodyOptionLabel(body)}
              </option>
            ))}
          </select>
        </div>

        <YearControl
          id="year-select"
          label={section === "elections" ? "Election cycle" : "Financial year"}
          options={yearOptions}
          value={period}
          onChange={choosePeriod}
          disabled={selected === null}
          placeholder={
            selected === null
              ? "Choose a local body first"
              : section === "elections"
                ? "Choose a cycle"
                : "Choose a year"
          }
        />
      </div>

      {unknownCode ? (
        <p className="notice" role="alert">
          No local body has the code {lbCode}. Kerala has {data.count} local
          bodies and none of them carries that code — check the link, or choose
          a district and body above.
        </p>
      ) : null}

      {sectionReason ? (
        <p className="notice" role="status">
          {sectionReason}
        </p>
      ) : null}

      {selected ? (
        <ul className="coverage" aria-label={`What this site holds for ${selected.lb_name_en}`}>
          {coverageOf(selected).map((entry) => (
            <li
              key={entry.section}
              className={entry.available ? "coverage-item" : "coverage-item coverage-off"}
            >
              {entry.available ? (
                <Link to={sectionPath(entry.section, selected.lb_code, period)}>
                  {entry.label}
                </Link>
              ) : (
                <>
                  <span className="coverage-name">{entry.label} — unavailable</span>
                  <span className="coverage-reason">{entry.reason}</span>
                </>
              )}
              {entry.section === "elections" &&
              entry.available &&
              !selected.has_geometry ? (
                <span className="coverage-reason">
                  No boundary geometry has been published for this body, so it is
                  absent from the map and reachable only from this selector.
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
