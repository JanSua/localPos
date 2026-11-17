"use client";

import { addDaysToDateInput, dateInputValue } from "@/lib/colombia-time";

const FILTERS = ["Hoy", "Ayer", "Esta semana", "Este mes", "Este año"] as const;

function getRange(label: (typeof FILTERS)[number]) {
  const today = dateInputValue();
  const year = today.slice(0, 4);
  const monthStart = `${year}-${today.slice(5, 7)}-01`;
  switch (label) {
    case "Hoy":
      return { from: today, to: today };
    case "Ayer": {
      const yesterday = addDaysToDateInput(today, -1);
      return { from: yesterday, to: yesterday };
    }
    case "Esta semana": {
      const day = new Date(`${today}T00:00:00Z`).getUTCDay();
      const mondayOffset = day === 0 ? 6 : day - 1;
      return { from: addDaysToDateInput(today, -mondayOffset), to: today };
    }
    case "Este mes":
      return { from: monthStart, to: today };
    case "Este año":
      return { from: `${year}-01-01`, to: today };
  }
}

export function QuickDateFilters({
  from,
  to,
  originalFrom,
  originalTo,
  onSelect,
}: {
  from: string;
  to: string;
  originalFrom: string;
  originalTo: string;
  onSelect: (from: string, to: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2" aria-label="Filtros rápidos por fecha">
      {FILTERS.map((label) => {
        const range = getRange(label);
        const active = from === range.from && to === range.to;
        return (
          <button
            key={label}
            type="button"
            aria-pressed={active}
            onClick={() =>
              onSelect(
                active ? originalFrom : range.from,
                active ? originalTo : range.to,
              )
            }
            className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
              active
                ? "border-brand bg-brand text-brand-foreground"
                : "border-border text-foreground/70 hover:bg-surface-muted"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
