// Supported currencies and their default symbols. The active currency is
// stored in ShopSettings; the frontend formats amounts using the symbol.
// This is a curated set of major/regionally-relevant currencies, not the
// full ISO 4217 list.
const CURRENCIES = {
  USD: { symbol: "$", label: "Dólar estadounidense" },
  COP: { symbol: "$", label: "Peso Colombiano" },
};

function symbolFor(code, fallback) {
  return CURRENCIES[code]?.symbol || fallback || code;
}

function formatAmount(amount) {
  const value = Number.isFinite(Number(amount)) ? Math.round(Number(amount)) : 0;
  const digits = String(Math.abs(value));
  const groups = [];

  for (let end = digits.length; end > 0; end -= 3) {
    groups.unshift(digits.slice(Math.max(0, end - 3), end));
  }

  const formatted =
    groups.length > 1
      ? `${groups.slice(0, -1).join("'")}.${groups[groups.length - 1]}`
      : groups[0];
  return value < 0 ? `-${formatted}` : formatted;
}

module.exports = { CURRENCIES, symbolFor, formatAmount };
