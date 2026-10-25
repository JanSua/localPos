const TIME_ZONE = "America/Bogota";

export function dateInputValue(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function addDaysToDateInput(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

export function formatColombiaDateTime(value: string | Date) {
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: TIME_ZONE,
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export function formatColombiaDate(
  value: string | Date,
  options: Intl.DateTimeFormatOptions = {},
) {
  return new Intl.DateTimeFormat("es-CO", {
    timeZone: TIME_ZONE,
    ...options,
  }).format(new Date(value));
}

export function formatColombiaCalendarDate(
  value: string,
  options: Intl.DateTimeFormatOptions = {},
) {
  const [year, month, day] = value.split("-").map(Number);
  return formatColombiaDate(new Date(Date.UTC(year, month - 1, day, 12)), options);
}
