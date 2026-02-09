'use client'

import { useMemo, useState, useCallback } from 'react'
import { GoogleMap, useJsApiLoader, Marker, InfoWindow } from '@react-google-maps/api'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { ExternalLink } from 'lucide-react'
import type { RentalComp, SoldComp } from '@/types/schema'

interface CompsMapProps {
    subjectAddress: string
    subjectLat?: number
    subjectLng?: number
    comps: (RentalComp | SoldComp)[]
    compType: 'rental' | 'sold'
    onGeocode?: (addresses: string[]) => Promise<{ address: string; lat: number; lng: number }[]>
}

const mapContainerStyle = {
    width: '100%',
    height: '300px',
    borderRadius: '0.5rem',
}

const defaultCenter = {
    lat: 25.7617,
    lng: -80.1918,
}

// Generate Zillow link
function generateZillowLink(address: string): string {
    const encoded = encodeURIComponent(address.replace(/,/g, ''))
    return `https://www.zillow.com/homes/${encoded}_rb/`
}

export function CompsMap({
    subjectAddress,
    subjectLat,
    subjectLng,
    comps,
    compType,
}: CompsMapProps) {
    const [selectedMarker, setSelectedMarker] = useState<number | 'subject' | null>(null)
    const [geocodedComps, setGeocodedComps] = useState<Map<string, { lat: number; lng: number }>>(new Map())
    const [geocoding, setGeocoding] = useState(false)

    const { isLoaded, loadError } = useJsApiLoader({
        googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '',
    })

    // Subject marker position
    const subjectPosition = useMemo(() => {
        if (subjectLat && subjectLng) {
            return { lat: subjectLat, lng: subjectLng }
        }
        return null
    }, [subjectLat, subjectLng])

    // Geocode addresses that don't have coordinates
    const geocodeAddresses = useCallback(async () => {
        if (!isLoaded || geocoding) return

        const addressesToGeocode = comps.filter(
            (comp) => !comp.latitude && !comp.longitude && !geocodedComps.has(comp.address)
        )

        if (addressesToGeocode.length === 0) return

        setGeocoding(true)

        const geocoder = new google.maps.Geocoder()
        const newGeocodedComps = new Map(geocodedComps)

        for (const comp of addressesToGeocode) {
            try {
                const result = await new Promise<google.maps.GeocoderResult | null>((resolve) => {
                    geocoder.geocode({ address: comp.address }, (results, status) => {
                        if (status === 'OK' && results && results[0]) {
                            resolve(results[0])
                        } else {
                            resolve(null)
                        }
                    })
                })

                if (result) {
                    newGeocodedComps.set(comp.address, {
                        lat: result.geometry.location.lat(),
                        lng: result.geometry.location.lng(),
                    })
                }
            } catch (error) {
                console.error('Geocoding error for:', comp.address, error)
            }

            // Small delay to avoid rate limiting
            await new Promise((resolve) => setTimeout(resolve, 100))
        }

        setGeocodedComps(newGeocodedComps)
        setGeocoding(false)
    }, [isLoaded, comps, geocodedComps, geocoding])

    // Get marker positions for all comps
    const compMarkers = useMemo(() => {
        return comps
            .map((comp, index) => {
                let lat = comp.latitude
                let lng = comp.longitude

                if (!lat || !lng) {
                    const geocoded = geocodedComps.get(comp.address)
                    if (geocoded) {
                        lat = geocoded.lat
                        lng = geocoded.lng
                    }
                }

                if (!lat || !lng) return null

                return {
                    position: { lat, lng },
                    comp,
                    index,
                }
            })
            .filter(Boolean) as { position: { lat: number; lng: number }; comp: RentalComp | SoldComp; index: number }[]
    }, [comps, geocodedComps])

    // Calculate map bounds
    const bounds = useMemo(() => {
        if (!isLoaded) return null

        const allPositions = compMarkers.map((m) => m.position)
        if (subjectPosition) {
            allPositions.push(subjectPosition)
        }

        if (allPositions.length === 0) return null

        const bounds = new google.maps.LatLngBounds()
        allPositions.forEach((pos) => bounds.extend(pos))
        return bounds
    }, [isLoaded, compMarkers, subjectPosition])

    // Map center based on subject or first comp
    const center = useMemo(() => {
        if (subjectPosition) return subjectPosition
        if (compMarkers.length > 0) return compMarkers[0].position
        return defaultCenter
    }, [subjectPosition, compMarkers])

    if (loadError) {
        return (
            <div className="bg-zinc-100 dark:bg-zinc-800 rounded-lg p-4 text-center text-sm text-muted-foreground">
                Failed to load Google Maps
            </div>
        )
    }

    if (!isLoaded) {
        return <Skeleton className="h-[300px] rounded-lg" />
    }

    const hasMarkersToShow = compMarkers.length > 0 || subjectPosition

    return (
        <div className="space-y-2">
            {!hasMarkersToShow && comps.length > 0 && (
                <div className="text-center">
                    <Button onClick={geocodeAddresses} variant="outline" size="sm" disabled={geocoding}>
                        {geocoding ? 'Geocoding...' : 'Load Map Locations'}
                    </Button>
                </div>
            )}

            {hasMarkersToShow && (
                <GoogleMap
                    mapContainerStyle={mapContainerStyle}
                    center={center}
                    zoom={13}
                    onLoad={(map) => {
                        if (bounds) {
                            map.fitBounds(bounds, 50)
                        }
                    }}
                    options={{
                        mapTypeControl: false,
                        streetViewControl: false,
                        fullscreenControl: false,
                    }}
                >
                    {/* Subject Marker */}
                    {subjectPosition && (
                        <Marker
                            position={subjectPosition}
                            icon={{
                                path: google.maps.SymbolPath.CIRCLE,
                                scale: 10,
                                fillColor: '#DC2626',
                                fillOpacity: 1,
                                strokeColor: '#FFFFFF',
                                strokeWeight: 2,
                            }}
                            label={{
                                text: 'S',
                                color: '#FFFFFF',
                                fontSize: '10px',
                                fontWeight: 'bold',
                            }}
                            onClick={() => setSelectedMarker('subject')}
                        />
                    )}

                    {/* Comp Markers */}
                    {compMarkers.map(({ position, index }) => (
                        <Marker
                            key={index}
                            position={position}
                            icon={{
                                path: google.maps.SymbolPath.CIRCLE,
                                scale: 10,
                                fillColor: compType === 'rental' ? '#16A34A' : '#2563EB',
                                fillOpacity: 1,
                                strokeColor: '#FFFFFF',
                                strokeWeight: 2,
                            }}
                            label={{
                                text: String(index + 1),
                                color: '#FFFFFF',
                                fontSize: '10px',
                                fontWeight: 'bold',
                            }}
                            onClick={() => setSelectedMarker(index)}
                        />
                    ))}

                    {/* Info Windows */}
                    {selectedMarker === 'subject' && subjectPosition && (
                        <InfoWindow
                            position={subjectPosition}
                            onCloseClick={() => setSelectedMarker(null)}
                        >
                            <div className="text-sm p-1">
                                <p className="font-medium">Subject Property</p>
                                <p className="text-xs text-gray-600">{subjectAddress}</p>
                            </div>
                        </InfoWindow>
                    )}

                    {typeof selectedMarker === 'number' && compMarkers[selectedMarker] && (
                        <InfoWindow
                            position={compMarkers[selectedMarker].position}
                            onCloseClick={() => setSelectedMarker(null)}
                        >
                            <div className="text-sm p-1 max-w-[200px]">
                                <p className="font-medium truncate">{compMarkers[selectedMarker].comp.address}</p>
                                <p className="text-xs text-gray-600">
                                    {compMarkers[selectedMarker].comp.bedrooms}bd / {compMarkers[selectedMarker].comp.bathrooms}ba
                                </p>
                                <p className="font-semibold mt-1">
                                    ${compType === 'rental'
                                        ? (compMarkers[selectedMarker].comp as RentalComp).rent?.toLocaleString()
                                        : (compMarkers[selectedMarker].comp as SoldComp).price?.toLocaleString()}
                                    {compType === 'rental' && '/mo'}
                                </p>
                                <p className="text-xs text-gray-500">
                                    {compMarkers[selectedMarker].comp.distance?.toFixed(1)} mi away
                                </p>
                                <a
                                    href={generateZillowLink(compMarkers[selectedMarker].comp.address)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline mt-1"
                                >
                                    <ExternalLink className="h-3 w-3" />
                                    Zillow
                                </a>
                            </div>
                        </InfoWindow>
                    )}
                </GoogleMap>
            )}

            {geocoding && (
                <p className="text-xs text-center text-muted-foreground">Loading map locations...</p>
            )}
        </div>
    )
}
