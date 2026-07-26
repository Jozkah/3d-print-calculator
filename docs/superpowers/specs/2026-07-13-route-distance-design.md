# Route-based Distance Calculation — Design

**Date:** 2026-07-13
**Status:** Approved for planning

## Problem

The quote calculator has a manual "Distance Traveled (km)" input that feeds the
fuel-cost calculation (`distance / 100 × consumption_per_100km × fuel_cost_per_liter`).
Entering the distance requires the user to look it up themselves. The user wants
to select point A (home) and point B (client), have the app calculate the real
driving distance, and count the round trip (home → client → home).

## Decisions (from brainstorming)

| Question | Decision |
|---|---|
| Distance type | Real driving route via OSRM public API (not straight-line) |
| Point selection | Address search (Nominatim autocomplete) + Leaflet map preview with route drawn |
| Round trip | One-way / round-trip toggle, default round trip (one-way × 2) |
| Existing manual field | Auto-filled by the calculation, remains manually editable; manual-only entry keeps working |
| UI placement | Dialog opened from a button next to the existing km field (Approach A) |

## User flow

1. In the calculator, next to "Distance Traveled (km)", a **"Calculate from
   route"** button (map-pin icon) opens a dialog.
2. **Point A (Home):** text input pre-filled from `company_address` in global
   settings; editable per quote.
3. **Point B (Client):** address search input with debounced autocomplete
   (Nominatim). Selecting a suggestion resolves coordinates.
4. When both points are resolved, the driving route is fetched from OSRM and
   rendered on a Leaflet map (two pins + route polyline) with the one-way
   distance shown.
5. **Round trip / One way** toggle (default round trip). Round trip distance =
   one-way × 2.
6. **"Use this distance"** writes the final km into the existing
   `distanceTraveledKm` field and closes the dialog. The field stays editable;
   typing over it overrides the calculated value.
7. On any failure (offline, no results, OSRM error) the dialog shows a clear
   error message; the user falls back to manual km entry. Existing behavior is
   never broken.

## Components & files

- **`components/route-distance-dialog.tsx`** (new): dialog containing the two
  address inputs, autocomplete suggestion list, Leaflet map, round-trip toggle,
  distance readout, and confirm button. Dynamically imported with
  `next/dynamic` (`ssr: false`) so Leaflet only loads when the dialog is
  opened.
- **`lib/geo.ts`** (new): pure fetch-based helpers, no API keys:
  - `geocodeAddress(query)` → Nominatim `/search` → `{ address, lat, lon }[]`
  - `fetchRoute(from, to)` → OSRM `/route/v1/driving` → `{ distanceKm, geometry }`
  - `roundTripKm(oneWayKm, isRoundTrip)` → pure doubling logic
- **`components/excel-calculator.tsx`** (modified): add the button, wire the
  dialog result into `distanceTraveledKm`, persist/restore the new quote
  fields.
- **New dependencies:** `leaflet`, `react-leaflet`, `@types/leaflet`.

## Data model

Quote gains optional fields (backwards compatible — old quotes simply lack
them and behave as today):

```ts
route_origin?: { address: string; lat: number; lon: number }
route_destination?: { address: string; lat: number; lon: number }
route_is_round_trip?: boolean
route_one_way_km?: number
```

`distance_traveled_km` remains the single source of truth for the fuel-cost
math — the cost calculation does not change. The route fields exist only so a
reopened quote can display and recompute its route.

Global settings gain cached coordinates so the home address is geocoded once:

```ts
company_lat?: number
company_lon?: number
```

The cache is refreshed whenever `company_address` changes.

## Error handling & API etiquette

- **Nominatim policy:** identify the app via `User-Agent`/`Referer`; max ~1
  request/second → autocomplete debounced at 500 ms, minimum 3 characters
  before searching.
- **OSRM demo server:** no key, no SLA → 10 s timeout via `AbortController`;
  on failure show "Couldn't fetch route — enter km manually".
- No silent failures: every fetch error surfaces as a visible message in the
  dialog.

## Testing

- Unit tests (vitest, existing harness) for `lib/geo.ts` with mocked `fetch`:
  - geocode success, empty results, HTTP error
  - route success (meters → km conversion), timeout, HTTP error
  - `roundTripKm` doubling logic
- Manual browser verification of the dialog flow (search, map render, toggle,
  fill-in, manual override).

## Out of scope

- Multiple stops / multi-trip counters
- Offline straight-line fallback calculation
- Live GPS tracking of actual trips
