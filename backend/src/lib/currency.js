// Supported currencies and their default symbols. The active currency is
// stored in ShopSettings; the frontend formats amounts using the symbol.
// This is a curated set of major/regionally-relevant currencies, not the
// full ISO 4217 list.
const CURRENCIES = {
  USD: { symbol: "$", label: "US Dollar" },
  COP: { symbol: "$", label: "Peso Colombiano" },
};

function symbolFor(code, fallback) {
  return CURRENCIES[code]?.symbol || fallback || code;
}

module.exports = { CURRENCIES, symbolFor };
