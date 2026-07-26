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
  return data.map((row: unknown) => {
    const record = row as Record<string, unknown>
    return {
      address: String(record.display_name ?? ""),
      lat: Number(record.lat),
      lon: Number(record.lon),
    }
  })
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
