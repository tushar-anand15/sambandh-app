import { useEffect, useState } from "react";
import api from "@/lib/api";

interface FilterRowProps {
  district: string;
  lbType: string;
  year: string;
  onDistrictChange: (v: string) => void;
  onLbTypeChange: (v: string) => void;
  onYearChange: (v: string) => void;
}

interface FilterOptions {
  districts: string[];
  lb_types: string[];
  years: string[];
}

export default function FilterRow({
  district,
  lbType,
  year,
  onDistrictChange,
  onLbTypeChange,
  onYearChange,
}: FilterRowProps) {
  const [options, setOptions] = useState<FilterOptions>({
    districts: [],
    lb_types: [],
    years: [],
  });

  useEffect(() => {
    api
      .get("/documents/filters")
      .then(({ data }) => setOptions(data))
      .catch(() => {});
  }, []);

  const selectClass =
    "rounded-md border border-border bg-surface px-3 py-1.5 text-xs text-ink transition-colors focus:border-indigo focus:outline-none";

  return (
    <div className="flex flex-wrap gap-2">
      <select
        value={district}
        onChange={(e) => onDistrictChange(e.target.value)}
        className={selectClass}
      >
        <option value="">All Districts</option>
        {options.districts.map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </select>

      <select
        value={lbType}
        onChange={(e) => onLbTypeChange(e.target.value)}
        className={selectClass}
      >
        <option value="">All LB Types</option>
        {options.lb_types.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>

      <select
        value={year}
        onChange={(e) => onYearChange(e.target.value)}
        className={selectClass}
      >
        <option value="">All Years</option>
        {options.years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
    </div>
  );
}
