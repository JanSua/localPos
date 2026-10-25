const TIME_ZONE = 'America/Bogota';
const DAY_MS = 86_400_000;

function dateKeyInBogota(value = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const part = (type) => parts.find((entry) => entry.type === type).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function parseBogotaDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  if (
    utcDate.getUTCFullYear() !== year ||
    utcDate.getUTCMonth() !== month - 1 ||
    utcDate.getUTCDate() !== day
  ) {
    return null;
  }
  return new Date(Date.UTC(year, month - 1, day, 5));
}

function bogotaDayStart(value = new Date()) {
  return parseBogotaDate(dateKeyInBogota(value));
}

function addDays(value, days) {
  return new Date(value.getTime() + days * DAY_MS);
}

module.exports = { addDays, bogotaDayStart, dateKeyInBogota, parseBogotaDate };
