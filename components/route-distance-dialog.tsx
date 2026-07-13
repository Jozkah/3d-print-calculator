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
  // immediately re-trigger a search. Initialized true when the field mounts
  // with an already-resolved point, so reopening a saved route doesn't fire
  // an unprompted Nominatim search for it.
  const skipNextSearchRef = useRef(point !== null)

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
  // Derive the total from the already-rounded one-way value so the displayed
  // math stays consistent (never "12.3 km × 2 = 24.7 km").
  const totalKm = route ? roundTripKm(oneWayKm, isRoundTrip) : 0

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
