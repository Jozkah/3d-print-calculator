// Shared display formatting helpers.

/**
 * Format an amount of money with the shop's configured currency symbol
 * (global_settings.currency_symbol), e.g. `formatMoney(12.5)` -> "€12.50".
 */
export function formatMoney(n: number, symbol = "€"): string {
  return `${symbol}${(n ?? 0).toFixed(2)}`
}
