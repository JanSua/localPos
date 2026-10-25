export function formatGroupedAmount(amount: number): string {
  const safeAmount = Number.isFinite(amount) ? Math.round(amount) : 0;
  const digits = String(Math.abs(safeAmount));
  const groups: string[] = [];

  for (let end = digits.length; end > 0; end -= 3) {
    groups.unshift(digits.slice(Math.max(0, end - 3), end));
  }

  const separator = groups.length > 1 ? "." : "";
  const grouped =
    groups.length > 1
      ? `${groups.slice(0, -1).join("'")}${separator}${groups[groups.length - 1]}`
      : groups[0];

  return safeAmount < 0 ? `-${grouped}` : grouped;
}

export function formatAmountInput(value: number | string): string {
  const textValue = String(value).trim();
  if (textValue === "") return "";

  const numericValue =
    typeof value === "number" ? value : Number(textValue);
  const digits = Number.isFinite(numericValue)
    ? String(Math.abs(Math.round(numericValue)))
    : textValue.replace(/\D/g, "").replace(/^0+(?=\d)/, "");

  if (!digits) return "";

  const groups: string[] = [];
  for (let end = digits.length; end > 0; end -= 3) {
    groups.unshift(digits.slice(Math.max(0, end - 3), end));
  }

  return groups.length > 1
    ? `${groups.slice(0, -1).join("'")}.${groups[groups.length - 1]}`
    : groups[0];
}

// Keep the shop's configured currency symbol while displaying whole pesos.
export function formatMoney(amount: number, symbol = "Rs."): string {
  return `${symbol} ${formatGroupedAmount(amount)}`;
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
