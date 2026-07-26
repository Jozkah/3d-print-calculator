# Route-based Distance Calculation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user pick point A (home) and point B (client) by address, fetch the real driving distance from OSRM, show it on a map, and fill the calculator's existing "Distance Traveled (km)" field (round trip by default).

**Architecture:** A new pure fetch module `lib/geo.ts` (Nominatim geocoding + OSRM routing + round-trip math) is consumed by a new dialog component `components/route-distance-dialog.tsx` (address search, Leaflet map preview, round-trip toggle). The dialog is dynamically imported into `components/excel-calculator.tsx` behind a button next to the km field; confirming fills `distanceTraveledKm`, which the existing fuel-cost math already consumes. Route metadata is persisted on the quote; home coordinates are cached in global settings.

**Tech Stack:** Next.js 16 (App Router, client components), React 19, TypeScript, vitest, Nominatim (geocoding, free), OSRM public server (routing, free), leaflet + react-leaflet (map).

**Spec:** `docs/superpowers/specs/2026-07-13-route-distance-design.md`

## Global Constraints

- Package manager is **pnpm** (`pnpm-lock.yaml` at repo root).
- Dev server runs on port 4001 (`pnpm dev`).
- Tests run with `pnpm test` (vitest, node environment, tests co-located with source in `lib/`).
- No API keys anywhere. Nominatim and OSRM are called directly from the browser; the browser's automatic `Referer` header satisfies Nominatim's identification policy (the `User-Agent` header is a forbidden header in browsers — do NOT try to set it).
- `distance_traveled_km` stays the single source of truth for fuel cost. Do not touch the fuel-cost math at `components/excel-calculator.tsx:590-594`.
- New quote/settings fields are optional — old rows without them must keep working (`types/db.ts` types keep `[key: string]: any`).
- Follow repo conventions: kebab-case component filenames, `"use client"` where hooks are used, shadcn/ui components from `components/ui/`, icons from `lucide-react`.
- No `console.log` in shipped code. Errors surface via UI state.

---

### Task 1: `lib/geo.ts` — geocoding, routing, round-trip math (TDD)

**Files:**
- Create: `lib/geo.ts`
- Test: `lib/geo.test.ts`

**Interfaces:**
- Consumes: nothing (leaf module; plain `fetch`).
- Produces (used by Tasks 2–4):
  - `type GeoPoint = { address: string; lat: number; lon: number }`
  - `type RouteResult = { distanceKm: number; geometry: [number, number][] }` — geometry is `[lat, lon]` pairs ready for Leaflet.
  - `geocodeAddress(query: string): Promise<GeoPoint[]>`
  - `fetchRoute(from: GeoPoint, to: GeoPoint): Promise<RouteResult>`
  - `roundTripKm(oneWayKm: number, isRoundTrip: boolean): number` — doubles when round trip, rounds to 1 decimal.

- [ ] **Step 1: Write the failing tests**

Create `lib/geo.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest"
import { fetchRoute, geocodeAddress, roundTripKm } from "./geo"

function mockFetchOnce(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => body,
  })
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("geocodeAddress", () => {
  it("maps Nominatim results to GeoPoints", async () => {
    mockFetchOnce([
      { display_name: "Rua A 1, Lisboa", lat: "38.72", lon: "-9.14" },
      { display_name: "Rua A 2, Porto", lat: "41.15", lon: "-8.61" },
    ])

    const results = await geocodeAddress("Rua A")

    expect(results).toEqual([
      { address: "Rua A 1, Lisboa", lat: 38.72, lon: -9.14 },
      { address: "Rua A 2, Porto", lat: 41.15, lon: -8.61 },
    ])
  })

  it("URL-encodes the query and passes an abort signal", async () => {
    const fetchMock = mockFetchOnce([])

    await geocodeAddress("Rua São João 5")

    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toContain(encodeURIComponent("Rua São João 5"))
    expect(options.signal).toBeInstanceOf(AbortSignal)
  })

  it("returns empty array when Nominatim finds nothing", async () => {
    mockFetchOnce([])
    expect(await geocodeAddress("zzzzzz")).toEqual([])
  })

  it("throws a descriptive error on HTTP failure", async () => {
    mockFetchOnce({}, { ok: false, status: 503 })
    await expect(geocodeAddress("Rua A")).rejects.toThrow("Address search failed (HTTP 503)")
  })

  it("throws when the response is not an array", async () => {
    mockFetchOnce({ error: "blocked" })
    await expect(geocodeAddress("Rua A")).rejects.toThrow("Address search returned an unexpected response")
  })
})

describe("fetchRoute", () => {
  const from = { address: "Home", lat: 38.72, lon: -9.14 }
  const to = { address: "Client", lat: 38.75, lon: -9.1 }

  it("converts meters to km and flips [lon,lat] to [lat,lon]", async () => {
    mockFetchOnce({
      code: "Ok",
      routes: [
        {
          distance: 12345,
          geometry: { coordinates: [[-9.14, 38.72], [-9.1, 38.75]] },
        },
      ],
    })

    const route = await fetchRoute(from, to)

    expect(route.distanceKm).toBeCloseTo(12.345)
    expect(route.geometry).toEqual([
      [38.72, -9.14],
      [38.75, -9.1],
    ])
  })

  it("requests OSRM with lon,lat;lon,lat ordering and geojson geometry", async () => {
    const fetchMock = mockFetchOnce({
      code: "Ok",
      routes: [{ distance: 1000, geometry: { coordinates: [] } }],
    })

    await fetchRoute(from, to)

    const [url] = fetchMock.mock.calls[0]
    expect(url).toContain("/route/v1/driving/-9.14,38.72;-9.1,38.75")
    expect(url).toContain("geometries=geojson")
  })

  it("throws a descriptive error on HTTP failure", async () => {
    mockFetchOnce({}, { ok: false, status: 500 })
    await expect(fetchRoute(from, to)).rejects.toThrow("Route lookup failed (HTTP 500)")
  })

  it("throws when OSRM reports no route", async () => {
    mockFetchOnce({ code: "NoRoute", routes: [] })
    await expect(fetchRoute(from, to)).rejects.toThrow("No driving route found between these points")
  })
})

describe("roundTripKm", () => {
  it("doubles the one-way distance for a round trip", () => {
    expect(roundTripKm(12.3, true)).toBe(24.6)
  })

  it("returns the one-way distance when not a round trip", () => {
    expect(roundTripKm(12.3, false)).toBe(12.3)
  })

  it("rounds to one decimal place", () => {
    expect(roundTripKm(12.345, true)).toBe(24.7)
    expect(roundTripKm(12.344, false)).toBe(12.3)
  })

  it("returns 0 for 0 km", () => {
    expect(roundTripKm(0, true)).toBe(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- lib/geo.test.ts`
Expected: FAIL — `Cannot find module './geo'` (or equivalent resolve error).

- [ ] **Step 3: Write the implementation**

Create `lib/geo.ts`:

```ts
// Free, keyless geo services for the route-distance feature.
//
// - Nominatim (OpenStreetMap) for address -> coordinates. Browser requests
//   carry a Referer header automatically, which satisfies Nominatim's
//   identification policy; callers must debounce (>= 500ms) to respect the
//   ~1 req/sec limit.
// - OSRM public demo server for driving routes. No SLA, so every call is
//   capped by a timeout and errors are surfaced to the caller.

export type GeoPoint = {
  address: string
  lat: number
  lon: number
}

export type RouteResult = {
  distanceKm: number
  // [lat, lon] pairs, ready for Leaflet (OSRM returns [lon, lat]).
  geometry: [number, number][]
}

const NOMINATIM_BASE = "https://nominatim.openstreetmap.org"
const OSRM_BASE = "https://router.project-osrm.org"
const FETCH_TIMEOUT_MS = 10_000
const MAX_SUGGESTIONS = 5

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    return await fetch(url, { signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

export async function geocodeAddress(query: string): Promise<GeoPoint[]> {
  const url = `${NOMINATIM_BASE}/search?format=jsonv2&limit=${MAX_SUGGESTIONS}&q=${encodeURIComponent(query)}`
  const res = await fetchWithTimeout(url)
  if (!res.ok) {
    throw new Error(`Address search failed (HTTP ${res.status})`)
  }
  const data = await res.json()
  if (!Array.isArray(data)) {
    throw new Error("Address search returned an unexpected response")
  }
  return data.map((row: any) => ({
    address: String(row.display_name ?? ""),
    lat: Number(row.lat),
    lon: Number(row.lon),
  }))
}

export async function fetchRoute(from: GeoPoint, to: GeoPoint): Promise<RouteResult> {
  const url =
    `${OSRM_BASE}/route/v1/driving/${from.lon},${from.lat};${to.lon},${to.lat}` +
    `?overview=full&geometries=geojson`
  const res = await fetchWithTimeout(url)
  if (!res.ok) {
    throw new Error(`Route lookup failed (HTTP ${res.status})`)
  }
  const data = await res.json()
  if (data?.code !== "Ok" || !Array.isArray(data.routes) || data.routes.length === 0) {
    throw new Error("No driving route found between these points")
  }
  const route = data.routes[0]
  const coordinates: [number, number][] = Array.isArray(route.geometry?.coordinates)
    ? route.geometry.coordinates.map(([lon, lat]: [number, number]) => [lat, lon] as [number, number])
    : []
  return {
    distanceKm: route.distance / 1000,
    geometry: coordinates,
  }
}

export function roundTripKm(oneWayKm: number, isRoundTrip: boolean): number {
  const total = isRoundTrip ? oneWayKm * 2 : oneWayKm
  return Math.round(total * 10) / 10
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- lib/geo.test.ts`
Expected: PASS — all tests green. Also run the full suite once (`pnpm test`) to confirm nothing else broke.

- [ ] **Step 5: Commit**

```bash
git add lib/geo.ts lib/geo.test.ts
git commit -m "feat: geo module with Nominatim geocoding, OSRM routing and round-trip math"
```

---

### Task 2: Types, dependencies, and the route dialog component

**Files:**
- Modify: `types/db.ts` (Quote at ~line 125, GlobalSettings at ~line 94)
- Create: `components/route-distance-dialog.tsx`
- Modify: `package.json` (via `pnpm add`)

**Interfaces:**
- Consumes: `GeoPoint`, `RouteResult`, `geocodeAddress`, `fetchRoute`, `roundTripKm` from `lib/geo` (Task 1); `Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle`/`DialogFooter` from `components/ui/dialog`; `Button`, `Input`, `Label`, `Checkbox` from `components/ui/`.
- Produces (used by Task 3):
  - Default export `RouteDistanceDialog` with props:
    ```ts
    type RouteDistanceDialogProps = {
      open: boolean
      onOpenChange: (open: boolean) => void
      initialOrigin: GeoPoint | null        // saved route origin or settings-cached point
      initialOriginAddress: string          // company_address text fallback when no coords
      initialDestination: GeoPoint | null
      initialIsRoundTrip: boolean
      onConfirm: (selection: RouteSelection) => void
    }
    ```
  - `export type RouteSelection = { origin: GeoPoint; destination: GeoPoint; oneWayKm: number; isRoundTrip: boolean; totalKm: number }`
  - Quote type fields: `route_origin`, `route_destination`, `route_is_round_trip`, `route_one_way_km`
  - GlobalSettings type fields: `company_lat`, `company_lon`

- [ ] **Step 1: Install dependencies**

```bash
pnpm add leaflet react-leaflet
pnpm add -D @types/leaflet
```

Expected: `react-leaflet` resolves to v5.x (requires React 19 — this repo has 19.2.0), `leaflet` to 1.9.x.

- [ ] **Step 2: Add the new optional fields to `types/db.ts`**

In the `GlobalSettings` type, directly after the `company_address?: string` line (~line 94), add:

```ts
  // Cached coordinates for company_address, geocoded once on settings save so
  // the route dialog doesn't re-geocode the home address on every quote.
  company_lat?: number | null
  company_lon?: number | null
```

In the `Quote` type, directly after the `distance_traveled_km: number` line (~line 125), add:

```ts
  // Route used to calculate distance_traveled_km via the route dialog.
  // Absent on manually-entered quotes; distance_traveled_km stays the single
  // source of truth for the fuel-cost math either way.
  route_origin?: { address: string; lat: number; lon: number } | null
  route_destination?: { address: string; lat: number; lon: number } | null
  route_is_round_trip?: boolean
  route_one_way_km?: number | null
```

- [ ] **Step 3: Create `components/route-distance-dialog.tsx`**

The whole file. Note the split: the outer default export stays mounted; `RouteDialogBody` holds all state and remounts on every dialog open (Radix unmounts `DialogContent` children when closed), so each open starts fresh from the current props.

```tsx
"use client"

import { useEffect, useRef, useState } from "react"
import { MapContainer, TileLayer, Polyline, CircleMarker, useMap } from "react-leaflet"
import "leaflet/dist/leaflet.css"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  fetchRoute,
  geocodeAddress,
  roundTripKm,
  type GeoPoint,
  type RouteResult,
} from "@/lib/geo"

export type RouteSelection = {
  origin: GeoPoint
  destination: GeoPoint
  oneWayKm: number
  isRoundTrip: boolean
  totalKm: number
}

type RouteDistanceDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialOrigin: GeoPoint | null
  initialOriginAddress: string
  initialDestination: GeoPoint | null
  initialIsRoundTrip: boolean
  onConfirm: (selection: RouteSelection) => void
}

// Nominatim etiquette: >= 500ms between keystrokes, >= 3 chars.
const SEARCH_DEBOUNCE_MS = 500
const MIN_QUERY_LENGTH = 3

type AddressFieldProps = {
  id: string
  label: string
  point: GeoPoint | null
  initialQuery: string
  placeholder: string
  onSelect: (point: GeoPoint | null) => void
}

function AddressField({ id, label, point, initialQuery, placeholder, onSelect }: AddressFieldProps) {
  const [query, setQuery] = useState(initialQuery)
  const [suggestions, setSuggestions] = useState<GeoPoint[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  // Set when a suggestion is clicked so the query change it causes doesn't
  // immediately re-trigger a search.
  const skipNextSearchRef = useRef(false)

  useEffect(() => {
    if (skipNextSearchRef.current) {
      skipNextSearchRef.current = false
      return
    }
    if (query.trim().length < MIN_QUERY_LENGTH) {
      setSuggestions([])
      return
    }
    const handle = setTimeout(async () => {
      setIsSearching(true)
      setSearchError(null)
      try {
        setSuggestions(await geocodeAddress(query))
      } catch (err) {
        setSuggestions([])
        setSearchError(err instanceof Error ? err.message : "Address search failed")
      } finally {
        setIsSearching(false)
      }
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(handle)
  }, [query])

  const handleSuggestionClick = (suggestion: GeoPoint) => {
    skipNextSearchRef.current = true
    setQuery(suggestion.address)
    setSuggestions([])
    onSelect(suggestion)
  }

  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={query}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(e) => {
          setQuery(e.target.value)
          // Any manual edit invalidates the previously selected point.
          if (point) onSelect(null)
        }}
        className="bg-card"
      />
      {isSearching && <p className="text-xs text-muted-foreground">Searching…</p>}
      {searchError && <p className="text-xs text-destructive">{searchError}</p>}
      {suggestions.length > 0 && (
        <ul className="max-h-40 overflow-y-auto rounded-md border bg-popover text-sm shadow-md">
          {suggestions.map((s) => (
            <li key={`${s.lat},${s.lon}`}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left hover:bg-accent"
                onClick={() => handleSuggestionClick(s)}
              >
                {s.address}
              </button>
            </li>
          ))}
        </ul>
      )}
      {!point && query.trim().length >= MIN_QUERY_LENGTH && suggestions.length === 0 && !isSearching && !searchError && (
        <p className="text-xs text-muted-foreground">Pick an address from the suggestions to set this point.</p>
      )}
    </div>
  )
}

function FitRoute({ positions }: { positions: [number, number][] }) {
  const map = useMap()
  useEffect(() => {
    if (positions.length > 0) {
      map.fitBounds(positions, { padding: [24, 24] })
    }
  }, [map, positions])
  return null
}

type RouteDialogBodyProps = Omit<RouteDistanceDialogProps, "open" | "onOpenChange"> & {
  onClose: () => void
}

function RouteDialogBody({
  initialOrigin,
  initialOriginAddress,
  initialDestination,
  initialIsRoundTrip,
  onConfirm,
  onClose,
}: RouteDialogBodyProps) {
  const [origin, setOrigin] = useState<GeoPoint | null>(initialOrigin)
  const [destination, setDestination] = useState<GeoPoint | null>(initialDestination)
  const [isRoundTrip, setIsRoundTrip] = useState(initialIsRoundTrip)
  const [route, setRoute] = useState<RouteResult | null>(null)
  const [isRouting, setIsRouting] = useState(false)
  const [routeError, setRouteError] = useState<string | null>(null)

  useEffect(() => {
    if (!origin || !destination) {
      setRoute(null)
      setRouteError(null)
      return
    }
    let cancelled = false
    setIsRouting(true)
    setRouteError(null)
    fetchRoute(origin, destination)
      .then((result) => {
        if (!cancelled) setRoute(result)
      })
      .catch((err) => {
        if (!cancelled) {
          setRoute(null)
          setRouteError(
            err instanceof Error ? `${err.message} — you can still enter the km manually.` : "Route lookup failed",
          )
        }
      })
      .finally(() => {
        if (!cancelled) setIsRouting(false)
      })
    return () => {
      cancelled = true
    }
  }, [origin, destination])

  const oneWayKm = route ? Math.round(route.distanceKm * 10) / 10 : 0
  const totalKm = route ? roundTripKm(route.distanceKm, isRoundTrip) : 0

  const handleConfirm = () => {
    if (!origin || !destination || !route) return
    onConfirm({ origin, destination, oneWayKm, isRoundTrip, totalKm })
    onClose()
  }

  return (
    <>
      <div className="space-y-4">
        <AddressField
          id="route-origin"
          label="Point A — Home"
          point={origin}
          initialQuery={initialOrigin?.address ?? initialOriginAddress}
          placeholder="Your starting address…"
          onSelect={setOrigin}
        />
        <AddressField
          id="route-destination"
          label="Point B — Client"
          point={destination}
          initialQuery={initialDestination?.address ?? ""}
          placeholder="Client address…"
          onSelect={setDestination}
        />

        {isRouting && <p className="text-sm text-muted-foreground">Calculating route…</p>}
        {routeError && <p className="text-sm text-destructive">{routeError}</p>}

        {route && origin && destination && (
          <div className="space-y-2">
            <div className="h-56 w-full overflow-hidden rounded-md border">
              <MapContainer
                center={[origin.lat, origin.lon]}
                zoom={10}
                style={{ height: "100%", width: "100%" }}
                attributionControl={true}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <CircleMarker center={[origin.lat, origin.lon]} radius={7} pathOptions={{ color: "#16a34a" }} />
                <CircleMarker center={[destination.lat, destination.lon]} radius={7} pathOptions={{ color: "#dc2626" }} />
                <Polyline positions={route.geometry} pathOptions={{ color: "#2563eb", weight: 4 }} />
                <FitRoute positions={route.geometry} />
              </MapContainer>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="route-round-trip"
                  checked={isRoundTrip}
                  onCheckedChange={(checked) => setIsRoundTrip(checked === true)}
                />
                <Label htmlFor="route-round-trip">Round trip (there and back)</Label>
              </div>
              <p className="text-sm font-medium">
                {isRoundTrip ? `${oneWayKm} km × 2 = ${totalKm} km` : `${totalKm} km one way`}
              </p>
            </div>
          </div>
        )}
      </div>

      <DialogFooter className="mt-4">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="button" onClick={handleConfirm} disabled={!route || isRouting}>
          Use this distance{route ? ` (${totalKm} km)` : ""}
        </Button>
      </DialogFooter>
    </>
  )
}

export default function RouteDistanceDialog({
  open,
  onOpenChange,
  initialOrigin,
  initialOriginAddress,
  initialDestination,
  initialIsRoundTrip,
  onConfirm,
}: RouteDistanceDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Calculate distance from route</DialogTitle>
          <DialogDescription>
            Search both addresses, check the route on the map, then apply the distance to the quote.
          </DialogDescription>
        </DialogHeader>
        {open && (
          <RouteDialogBody
            initialOrigin={initialOrigin}
            initialOriginAddress={initialOriginAddress}
            initialDestination={initialDestination}
            initialIsRoundTrip={initialIsRoundTrip}
            onConfirm={onConfirm}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 4: Verify it compiles**

Run: `pnpm exec tsc --noEmit`
Expected: no NEW errors in `components/route-distance-dialog.tsx`, `types/db.ts`, or `lib/geo.ts`. (If the repo has pre-existing errors elsewhere, they are out of scope — only the three files above must be clean.)

Also run: `pnpm test`
Expected: PASS (Task 1 tests unaffected).

- [ ] **Step 5: Commit**

```bash
git add types/db.ts components/route-distance-dialog.tsx package.json pnpm-lock.yaml
git commit -m "feat: route distance dialog with address search, OSRM route and map preview"
```

---

### Task 3: Wire the dialog into the calculator

**Files:**
- Modify: `components/excel-calculator.tsx`
  - imports (top of file)
  - state block (~line 134, next to `distanceTraveledKm`)
  - quote-load effect (~line 284)
  - save payload #1 (~line 837) and save payload #2 / draft (~line 968)
  - distance input UI (~lines 1298–1315)
  - dialog render (next to the input, same JSX block)

**Interfaces:**
- Consumes: `RouteDistanceDialog` (default export) and `RouteSelection` from `components/route-distance-dialog` (Task 2); `GeoPoint` from `lib/geo` (Task 1); quote fields `route_origin` / `route_destination` / `route_is_round_trip` / `route_one_way_km` and settings fields `company_lat` / `company_lon` (Task 2).
- Produces: quotes persisted with the four `route_*` fields; nothing else consumes this task.

- [ ] **Step 1: Add imports**

Near the top of `components/excel-calculator.tsx`, add `MapPin` to the existing `lucide-react` import list, and add:

```tsx
import dynamic from "next/dynamic"
import type { GeoPoint } from "@/lib/geo"
import type { RouteSelection } from "@/components/route-distance-dialog"

// Leaflet touches `window` at import time — load the dialog only in the
// browser, and only when a quote actually needs a route.
const RouteDistanceDialog = dynamic(() => import("@/components/route-distance-dialog"), { ssr: false })
```

(`dynamic` must be a top-level module call, not inside the component.)

- [ ] **Step 2: Add route state**

Directly under `const [distanceTraveledKm, setDistanceTraveledKm] = useState(0)` (~line 134), add:

```tsx
  // Route metadata backing the km field when it was filled via the route
  // dialog. Manual km entry leaves these untouched; they exist so a reopened
  // quote can show and redo its route.
  const [routeDialogOpen, setRouteDialogOpen] = useState(false)
  const [routeOrigin, setRouteOrigin] = useState<GeoPoint | null>(null)
  const [routeDestination, setRouteDestination] = useState<GeoPoint | null>(null)
  const [routeIsRoundTrip, setRouteIsRoundTrip] = useState(true)
  const [routeOneWayKm, setRouteOneWayKm] = useState<number | null>(null)
```

- [ ] **Step 3: Restore route fields when loading a quote for editing**

In the quote-load effect, directly after `setDistanceTraveledKm(quote.distance_traveled_km || 0)` (~line 284), add:

```tsx
        setRouteOrigin(quote.route_origin ?? null)
        setRouteDestination(quote.route_destination ?? null)
        setRouteIsRoundTrip(quote.route_is_round_trip ?? true)
        setRouteOneWayKm(quote.route_one_way_km ?? null)
```

Do NOT add this to the template-load effect (~line 376) — templates carry structure only; a template's route belongs to the original client, so new quotes started from a template begin with no route (the copied `distance_traveled_km` still restores as today).

- [ ] **Step 4: Persist route fields in BOTH save payloads**

There are two payload literals that currently contain `distance_traveled_km: distanceTraveledKm,` — the final-save payload (~line 837) and the draft-save payload (~line 968). In **each** of them, directly after that line, add:

```ts
        route_origin: routeOrigin,
        route_destination: routeDestination,
        route_is_round_trip: routeIsRoundTrip,
        route_one_way_km: routeOneWayKm,
```

- [ ] **Step 5: Add the button and dialog to the distance field UI**

Replace the existing block at ~lines 1298–1315:

```tsx
              <div>
                <Label htmlFor="distance">
                  Distance Traveled (km)
                </Label>
                <Input
                  id="distance"
                  type="number"
                  min="0" // Added min="0"
                  inputMode="numeric"
                  step="0.1"
                  value={distanceTraveledKm || ""}
                  onChange={(e) => {
                    const value = e.target.value
                    setDistanceTraveledKm(value === "" ? 0 : Number.parseFloat(value) || 0)
                  }}
                  className="bg-card"
                />
              </div>
```

with:

```tsx
              <div>
                <Label htmlFor="distance">
                  Distance Traveled (km)
                </Label>
                <div className="flex gap-2">
                  <Input
                    id="distance"
                    type="number"
                    min="0" // Added min="0"
                    inputMode="numeric"
                    step="0.1"
                    value={distanceTraveledKm || ""}
                    onChange={(e) => {
                      const value = e.target.value
                      setDistanceTraveledKm(value === "" ? 0 : Number.parseFloat(value) || 0)
                    }}
                    className="bg-card"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="shrink-0"
                    title="Calculate from route"
                    onClick={() => setRouteDialogOpen(true)}
                  >
                    <MapPin className="h-4 w-4" />
                  </Button>
                </div>
                <RouteDistanceDialog
                  open={routeDialogOpen}
                  onOpenChange={setRouteDialogOpen}
                  initialOrigin={
                    routeOrigin ??
                    (globalSettings?.company_lat != null && globalSettings?.company_lon != null
                      ? {
                          address: globalSettings.company_address || "",
                          lat: globalSettings.company_lat,
                          lon: globalSettings.company_lon,
                        }
                      : null)
                  }
                  initialOriginAddress={globalSettings?.company_address || ""}
                  initialDestination={routeDestination}
                  initialIsRoundTrip={routeIsRoundTrip}
                  onConfirm={(selection: RouteSelection) => {
                    setRouteOrigin(selection.origin)
                    setRouteDestination(selection.destination)
                    setRouteIsRoundTrip(selection.isRoundTrip)
                    setRouteOneWayKm(selection.oneWayKm)
                    setDistanceTraveledKm(selection.totalKm)
                  }}
                />
              </div>
```

(`Button` is already imported in this file; only `MapPin` is new.)

- [ ] **Step 6: Verify compile + tests**

Run: `pnpm exec tsc --noEmit` — no new errors in `components/excel-calculator.tsx`.
Run: `pnpm test` — PASS.

- [ ] **Step 7: Commit**

```bash
git add components/excel-calculator.tsx
git commit -m "feat: calculate distance traveled from A-to-B route in the quote calculator"
```

---

### Task 4: Cache home coordinates in global settings

**Files:**
- Modify: `components/global-settings-form.tsx` (imports; `handleSave` at ~line 106; the `.update({...})` payload at ~line 150)

**Interfaces:**
- Consumes: `geocodeAddress` from `lib/geo` (Task 1); `company_lat`/`company_lon` on `GlobalSettings` (Task 2). The `settings` prop already carries the previously saved values.
- Produces: `global_settings.company_lat` / `company_lon` written on save; the calculator (Task 3) reads them to pre-resolve point A.

- [ ] **Step 1: Add the import**

```tsx
import { geocodeAddress } from "@/lib/geo"
```

- [ ] **Step 2: Geocode the company address when it changes**

Inside `handleSave`, after `setIsSaving(true)` / `const supabase = createClient()` (~line 145) and before the `.update({...})` call, add:

```tsx
    // Cache home coordinates for the route-distance dialog. Best-effort: the
    // dialog re-geocodes on open when no cached coordinates exist, so a
    // geocoding failure must never block saving settings.
    const trimmedAddress = companyAddress.trim()
    let companyLat = settings?.company_lat ?? null
    let companyLon = settings?.company_lon ?? null
    if (!trimmedAddress) {
      companyLat = null
      companyLon = null
    } else if (trimmedAddress !== (settings?.company_address || "").trim()) {
      try {
        const results = await geocodeAddress(trimmedAddress)
        companyLat = results[0]?.lat ?? null
        companyLon = results[0]?.lon ?? null
      } catch {
        // Stale coordinates for a changed address would be wrong — drop them.
        companyLat = null
        companyLon = null
      }
    }
```

- [ ] **Step 3: Persist the coordinates**

In the `.update({...})` payload, directly after `company_address: companyAddress.trim(),` (~line 164), add:

```ts
        company_lat: companyLat,
        company_lon: companyLon,
```

Note: the `GlobalSettings` interface defined locally at the top of `global-settings-form.tsx` (~line 21) must also gain the two optional fields so `settings?.company_lat` type-checks:

```ts
  company_lat?: number | null
  company_lon?: number | null
```

- [ ] **Step 4: Verify compile + tests**

Run: `pnpm exec tsc --noEmit` — no new errors in `components/global-settings-form.tsx`.
Run: `pnpm test` — PASS.

- [ ] **Step 5: Commit**

```bash
git add components/global-settings-form.tsx
git commit -m "feat: cache company address coordinates for the route dialog"
```

---

### Task 5: Full verification

**Files:** none created; verification only.

**Interfaces:**
- Consumes: everything from Tasks 1–4.
- Produces: a verified, buildable feature branch.

- [ ] **Step 1: Full test suite and production build**

```bash
pnpm test
pnpm build
```

Expected: all tests PASS; `next build` completes with no errors (Leaflet must not be evaluated during SSR/prerender — if the build fails with `window is not defined`, the dynamic import in Task 3 Step 1 is wrong).

- [ ] **Step 2: Manual browser verification**

Run `pnpm dev` and open http://localhost:4001, then walk through:

1. Settings: save a company address → reload settings page, no errors.
2. Calculator: click the map-pin button next to "Distance Traveled (km)".
3. Point A is pre-filled with the company address; type a client address in Point B, pick a suggestion.
4. Route appears on the map with both markers and a polyline; distance shown.
5. Toggle "Round trip" off/on — the total switches between `x km` and `x × 2` km.
6. Click "Use this distance" — the km field is filled; fuel cost updates in the summary.
7. Type over the km field manually — the value changes (manual override works).
8. Save the quote, reopen it for editing — km restored; open the route dialog — both addresses restored.
9. Disconnect from the internet, open the dialog, type an address — a visible error appears, dialog can be cancelled, manual km entry still works.

- [ ] **Step 3: Final commit (if any fixups were needed)**

```bash
git add -A
git commit -m "fix: route distance verification fixups"
```

Only commit if Step 1/2 surfaced fixes; otherwise nothing to do.
