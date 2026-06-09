// Central configuration for the two-owner business model used by the
// cost/quote calculators. Self-hosters can edit this one file instead of
// hunting through component logic.
//
// OWNER_A_KEY / OWNER_B_KEY are the STABLE identifiers stored in the database
// (printers.owner). Do NOT change them once you have data, or existing rows
// will stop matching. OWNER_A_LABEL / OWNER_B_LABEL are display-only and safe
// to rename at any time.

export const OWNER_A_KEY = "Owner A"
export const OWNER_B_KEY = "Owner B"

export const OWNER_A_LABEL = "Owner A"
export const OWNER_B_LABEL = "Owner B"

// Share of profit and of emergency fees allocated to Owner A. Owner B receives
// the remainder (1 - ratio). Defaults to an even 50/50 split.
export const PROFIT_SPLIT_RATIO = 0.5
export const EMERGENCY_SPLIT_RATIO = 0.5

// Options rendered in the printer "owner" dropdown.
export const OWNER_OPTIONS: { key: string; label: string }[] = [
  { key: OWNER_A_KEY, label: OWNER_A_LABEL },
  { key: OWNER_B_KEY, label: OWNER_B_LABEL },
]
