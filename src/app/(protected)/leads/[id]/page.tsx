'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { DealAnalysisCard } from '@/components/leads/deal-analysis'
import { RentalComps } from '@/components/leads/rental-comps'
import { SkipTrace } from '@/components/leads/skip-trace'
import { PropertyNotes } from '@/components/leads/property-notes'
import { ActivityTimeline } from '@/components/leads/activity-timeline'
import { CompsMap } from '@/components/leads/comps-map'
import type { Property, Contact, RentalEstimate, SoldEstimate, RentalComp, SoldComp } from '@/types/schema'

const statusColors: Record<string, string> = {
  new: 'bg-blue-100 text-blue-700',
  hot: 'bg-orange-100 text-orange-700',
  cold: 'bg-zinc-100 text-zinc-600',
  archived: 'bg-zinc-100 text-zinc-500',
}

// Comps Map Widget Component
function CompsMapWidget({ property }: { property: Property }) {
  const [compType, setCompType] = useState<'rental' | 'sold'>('rental')

  const rentalComps = property.rental_data?.comparables || []
  const soldComps = property.sold_data?.comparables || []
  const currentComps = compType === 'rental' ? rentalComps : soldComps
  const hasComps = currentComps.length > 0

  return (
    <Card className="shadow-sm">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            📍 Comps Map
          </h3>
          {/* Toggle */}
          <div className="flex rounded-lg border p-0.5 bg-zinc-100 dark:bg-zinc-800">
            <button
              onClick={() => setCompType('rental')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${compType === 'rental'
                ? 'bg-white dark:bg-zinc-700 shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
                }`}
            >
              Rental
            </button>
            <button
              onClick={() => setCompType('sold')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${compType === 'sold'
                ? 'bg-white dark:bg-zinc-700 shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
                }`}
            >
              Sold
            </button>
          </div>
        </div>

        {hasComps ? (
          <CompsMap
            subjectAddress={property.address}
            comps={currentComps as (RentalComp | SoldComp)[]}
            compType={compType}
          />
        ) : (
          <div className="h-[200px] bg-zinc-100 dark:bg-zinc-800 rounded-lg flex items-center justify-center">
            <p className="text-sm text-muted-foreground text-center px-4">
              No {compType} comps available yet.<br />
              <span className="text-xs">Fetch comps below to see them on the map.</span>
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default function PropertyDetailPage() {
  const params = useParams()
  const id = params.id as string

  const [property, setProperty] = useState<Property | null>(null)
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      const supabase = createClient()

      const [propRes, contactsRes] = await Promise.all([
        supabase.from('properties').select('*').eq('id', id).single(),
        supabase.from('contacts').select('*').eq('property_id', id),
      ])

      if (propRes.data) {
        setProperty(propRes.data as Property)
      }
      if (contactsRes.data) {
        setContacts(contactsRes.data as Contact[])
      }
      setLoading(false)
    }
    fetchData()
  }, [id])

  const updateStatus = async (newStatus: string) => {
    const supabase = createClient()
    const { error } = await supabase
      .from('properties')
      .update({ status: newStatus })
      .eq('id', id)

    if (error) {
      toast.error('Failed to update status')
    } else {
      setProperty((prev) => prev ? { ...prev, status: newStatus as Property['status'] } : prev)
      toast.success(`Status updated to ${newStatus}`)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!property) {
    return (
      <div className="text-center py-16">
        <h2 className="text-lg font-medium">Property not found</h2>
        <Link href="/leads" className="text-blue-600 hover:underline text-sm mt-2 inline-block">
          Back to Leads
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Back button */}
      <Link
        href="/leads"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Leads
      </Link>

      {/* Two column layout */}
      <div className="grid lg:grid-cols-5 gap-6">
        {/* Left Column - 60% - Sticky */}
        <div className="lg:col-span-3 lg:self-start lg:sticky lg:top-6 space-y-6">
          {/* Owner Info / Skip Trace */}
          <SkipTrace
            propertyId={property.id}
            ownerName={property.owner_name}
            address={property.address}
            city={property.city}
            state={property.state}
            zip={property.zip}
            existingContacts={contacts}
            status={property.status}
            sqft={property.sqft}
            yearBuilt={property.year_built}
            bedrooms={property.bedrooms}
            bathrooms={property.bathrooms}
            lotSize={property.lot_size}
            propertyType={property.property_type}
            listPrice={property.list_price}
          />

          {/* Notes */}
          <PropertyNotes propertyId={property.id} />
        </div>

        {/* Right Column - 40% */}
        <div className="lg:col-span-2 space-y-6">
          {/* Comps Map */}
          <CompsMapWidget
            property={property}
          />

          {/* Rental Comps */}
          <RentalComps
            propertyId={property.id}
            address={property.address}
            bedrooms={property.bedrooms}
            bathrooms={property.bathrooms}
            sqft={property.sqft}
            existingRentalData={property.rental_data}
            existingSoldData={property.sold_data}
            onRentalDataFetched={(data: RentalEstimate) => {
              setProperty((prev) => prev ? { ...prev, rental_data: data } : prev)
            }}
            onSoldDataFetched={(data: SoldEstimate) => {
              setProperty((prev) => prev ? { ...prev, sold_data: data } : prev)
            }}
          />

          {/* AI Analysis */}
          <DealAnalysisCard
            propertyId={property.id}
            existingAnalysis={property.ai_analysis}
            analyzedAt={property.ai_analyzed_at}
            hasRentalData={!!property.rental_data}
          />

          {/* Activity Timeline */}
          <ActivityTimeline propertyId={property.id} />
        </div>
      </div>
    </div>
  )
}
