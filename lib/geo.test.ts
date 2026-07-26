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
