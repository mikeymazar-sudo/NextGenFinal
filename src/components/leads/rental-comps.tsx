'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Home, DollarSign, TrendingUp, ExternalLink, Bed, Bath, Ruler, Calendar, MapPin, Map } from 'lucide-react'
import { api, type CompFilterOptions } from '@/lib/api-client'
import { toast } from 'sonner'
import { CompsMap } from './comps-map'
import { CompsFilters } from './comps-filters'
import type { RentalEstimate, SoldEstimate, RentalComp, SoldComp } from '@/types/schema'

interface CompsProps {
  propertyId: string
  address: string
  bedrooms: number | null
  bathrooms: number | null
  sqft: number | null
  existingRentalData: RentalEstimate | null
  existingSoldData: SoldEstimate | null
  onRentalDataFetched: (data: RentalEstimate) => void
  onSoldDataFetched: (data: SoldEstimate) => void
}

type CompType = 'rental' | 'sold'

function generateZillowLink(address: string): string {
  const encoded = encodeURIComponent(address.replace(/,/g, ''))
  return `https://www.zillow.com/homes/${encoded}_rb/`
}

export function RentalComps({
  propertyId, address, bedrooms, bathrooms, sqft,
  existingRentalData, existingSoldData,
  onRentalDataFetched, onSoldDataFetched,
}: CompsProps) {
  const [compType, setCompType] = useState<CompType>('rental')
  const [rentalData, setRentalData] = useState<RentalEstimate | null>(existingRentalData)
  const [soldData, setSoldData] = useState<SoldEstimate | null>(existingSoldData)
  const [loading, setLoading] = useState(false)
  const [selectedComp, setSelectedComp] = useState<RentalComp | SoldComp | null>(null)
  const [showMap, setShowMap] = useState(false)
  const [filters, setFilters] = useState<CompFilterOptions>({})

  const fetchRentalComps = async (filterOverrides?: CompFilterOptions) => {
    setLoading(true)
    const result = await api.getRentalComps(
      propertyId, address,
      bedrooms || undefined, bathrooms || undefined, sqft || undefined,
      filterOverrides || filters
    )
    setLoading(false)

    if (result.error) {
      toast.error(result.error)
    } else if (result.data) {
      setRentalData(result.data)
      onRentalDataFetched(result.data)
      toast.success(result.cached ? 'Loaded cached rental data' : 'Rental estimate retrieved!')
    }
  }

  const fetchSoldComps = async (filterOverrides?: CompFilterOptions) => {
    setLoading(true)
    const result = await api.getSoldComps(
      propertyId, address,
      bedrooms || undefined, bathrooms || undefined, sqft || undefined,
      filterOverrides || filters
    )
    setLoading(false)

    if (result.error) {
      toast.error(result.error)
    } else if (result.data) {
      setSoldData(result.data)
      onSoldDataFetched(result.data)
      toast.success(result.cached ? 'Loaded cached sold data' : 'Property value retrieved!')
    }
  }

  const handleFiltersChange = (newFilters: CompFilterOptions) => {
    setFilters(newFilters)
    if (compType === 'rental') {
      fetchRentalComps(newFilters)
    } else {
      fetchSoldComps(newFilters)
    }
  }

  const handleToggle = (type: CompType) => {
    setCompType(type)
    // Don't auto-fetch - let user configure filters and click Apply & Fetch
  }

  const currentData = compType === 'rental' ? rentalData : soldData
  const hasData = !!currentData

  if (loading) {
    return (
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Home className="h-4 w-4 text-green-600" />
            Property Comps
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-4 w-40" />
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card className="shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              {compType === 'rental' ? (
                <Home className="h-4 w-4 text-green-600" />
              ) : (
                <TrendingUp className="h-4 w-4 text-blue-600" />
              )}
              {compType === 'rental' ? 'Rental Comps' : 'Sold Comps'}
            </CardTitle>
            {/* Toggle */}
            <div className="flex rounded-lg border p-0.5 bg-zinc-100 dark:bg-zinc-800">
              <button
                onClick={() => handleToggle('rental')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${compType === 'rental'
                  ? 'bg-white dark:bg-zinc-700 shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
                  }`}
              >
                Rental
              </button>
              <button
                onClick={() => handleToggle('sold')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${compType === 'sold'
                  ? 'bg-white dark:bg-zinc-700 shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
                  }`}
              >
                Sold
              </button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters - always visible so user can configure before fetching */}
          <CompsFilters
            subjectBedrooms={bedrooms}
            subjectBathrooms={bathrooms}
            subjectSqft={sqft}
            compType={compType}
            onFiltersChange={handleFiltersChange}
            defaultExpanded={!hasData}
          />

          {hasData && (
            <>
              {/* Estimate Display */}
              <div className={`text-center rounded-lg p-4 ${compType === 'rental'
                ? 'bg-green-50 dark:bg-green-900/20'
                : 'bg-blue-50 dark:bg-blue-900/20'
                }`}>
                <p className="text-sm text-muted-foreground">
                  {compType === 'rental' ? 'Estimated Monthly Rent' : 'Estimated Value'}
                </p>
                <p className={`text-3xl font-bold ${compType === 'rental' ? 'text-green-600' : 'text-blue-600'
                  }`}>
                  ${compType === 'rental'
                    ? (rentalData?.rent || 0).toLocaleString()
                    : (soldData?.price || 0).toLocaleString()
                  }
                  {compType === 'rental' && <span className="text-lg font-normal">/mo</span>}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Range: ${compType === 'rental'
                    ? `${rentalData?.rentRangeLow?.toLocaleString()} - ${rentalData?.rentRangeHigh?.toLocaleString()}`
                    : `${soldData?.priceRangeLow?.toLocaleString()} - ${soldData?.priceRangeHigh?.toLocaleString()}`
                  }
                </p>
              </div>

              {/* Comparables List */}
              {((compType === 'rental' && rentalData?.comparables) ||
                (compType === 'sold' && soldData?.comparables)) && (
                  <div>
                    <p className="text-sm font-medium mb-2">
                      Comparable {compType === 'rental' ? 'Rentals' : 'Sales'}
                    </p>
                    <div className="space-y-2">
                      {(compType === 'rental' ? rentalData?.comparables : soldData?.comparables)?.map((comp, i) => (
                        <div
                          key={i}
                          onClick={() => setSelectedComp(comp)}
                          className="flex items-center justify-between text-sm bg-zinc-50 dark:bg-zinc-800 rounded-lg p-2.5 cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-xs truncate font-medium">{comp.address}</p>
                            <p className="text-xs text-muted-foreground">
                              {comp.bedrooms}bd / {comp.bathrooms}ba · {comp.sqft?.toLocaleString()} sqft
                            </p>
                          </div>
                          <div className="text-right flex-shrink-0 ml-2">
                            <p className="font-semibold">
                              ${compType === 'rental'
                                ? (comp as RentalComp).rent?.toLocaleString()
                                : (comp as SoldComp).price?.toLocaleString()
                              }
                              {compType === 'rental' && <span className="font-normal text-xs">/mo</span>}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {comp.distance?.toFixed(1)} mi
                              {compType === 'sold' && (comp as SoldComp).soldDate && (
                                <> · {new Date((comp as SoldComp).soldDate).toLocaleDateString()}</>
                              )}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              {/* Map Section */}
              {((compType === 'rental' && rentalData?.comparables && rentalData.comparables.length > 0) ||
                (compType === 'sold' && soldData?.comparables && soldData.comparables.length > 0)) && (
                  <div className="space-y-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => setShowMap(!showMap)}
                    >
                      <Map className="mr-2 h-4 w-4" />
                      {showMap ? 'Hide Map' : 'Show Map'}
                    </Button>
                    {showMap && (
                      <CompsMap
                        subjectAddress={address}
                        comps={compType === 'rental' ? (rentalData?.comparables || []) : (soldData?.comparables || [])}
                        compType={compType}
                      />
                    )}
                  </div>
                )}

              {/* Refresh Button */}
              <Button
                onClick={() => compType === 'rental' ? fetchRentalComps() : fetchSoldComps()}
                variant="ghost"
                size="sm"
                className="w-full text-xs"
              >
                Refresh {compType === 'rental' ? 'Rental' : 'Sold'} Data
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* Comp Detail Dialog */}
      <Dialog open={!!selectedComp} onOpenChange={() => setSelectedComp(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <MapPin className="h-4 w-4" />
              Comparable Property
            </DialogTitle>
          </DialogHeader>
          {selectedComp && (
            <div className="space-y-4">
              {/* Address */}
              <p className="font-medium">{selectedComp.address}</p>

              {/* Price/Rent Badge */}
              <Badge
                variant="secondary"
                className={`text-lg px-3 py-1 ${compType === 'rental'
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                  }`}
              >
                ${compType === 'rental'
                  ? (selectedComp as RentalComp).rent?.toLocaleString()
                  : (selectedComp as SoldComp).price?.toLocaleString()
                }
                {compType === 'rental' ? '/mo' : ''}
              </Badge>

              {/* Property Details Grid */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex items-center gap-2">
                  <Bed className="h-4 w-4 text-muted-foreground" />
                  <span>{selectedComp.bedrooms} Bedrooms</span>
                </div>
                <div className="flex items-center gap-2">
                  <Bath className="h-4 w-4 text-muted-foreground" />
                  <span>{selectedComp.bathrooms} Bathrooms</span>
                </div>
                <div className="flex items-center gap-2">
                  <Ruler className="h-4 w-4 text-muted-foreground" />
                  <span>{selectedComp.sqft?.toLocaleString()} sqft</span>
                </div>
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span>{selectedComp.distance?.toFixed(2)} miles</span>
                </div>
                {(selectedComp as RentalComp).yearBuilt && (
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span>Built {(selectedComp as RentalComp).yearBuilt}</span>
                  </div>
                )}
                {compType === 'sold' && (selectedComp as SoldComp).soldDate && (
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span>Sold {new Date((selectedComp as SoldComp).soldDate).toLocaleDateString()}</span>
                  </div>
                )}
                {(selectedComp as RentalComp).propertyType && (
                  <div className="col-span-2 flex items-center gap-2">
                    <Home className="h-4 w-4 text-muted-foreground" />
                    <span>{(selectedComp as RentalComp).propertyType}</span>
                  </div>
                )}
              </div>

              {/* Zillow Link */}
              <Button
                variant="outline"
                className="w-full"
                onClick={() => window.open(generateZillowLink(selectedComp.address), '_blank')}
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                View on Zillow
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
