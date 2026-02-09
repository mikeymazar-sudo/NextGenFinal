'use client'

import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Bed, Bath, Ruler, MapPin, Phone, Mail, User, Calendar } from 'lucide-react'
import type { Property } from '@/types/schema'

const statusColors: Record<string, string> = {
  new: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  hot: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
  cold: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400',
  archived: 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500',
}

const formatPhone = (phone: string) => {
  const cleaned = phone.replace(/\D/g, '')
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`
  }
  return phone
}

export function PropertyCard({ property }: { property: Property }) {
  // Get owner phone from property (stored after skip trace)
  const ownerPhone = property.owner_phone?.[0]

  return (
    <Link href={`/leads/${property.id}`}>
      <Card className="shadow-sm hover:shadow-md transition-shadow cursor-pointer h-full">
        <CardContent className="p-5">
          {/* Header: Address + Status */}
          <div className="flex items-start justify-between mb-2">
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold text-sm truncate">{property.address}</h3>
              <div className="flex items-center gap-1 mt-0.5 text-muted-foreground">
                <MapPin className="h-3 w-3 flex-shrink-0" />
                <p className="text-xs truncate">
                  {[property.city, property.state, property.zip].filter(Boolean).join(', ')}
                </p>
              </div>
            </div>
            <Badge variant="secondary" className={`${statusColors[property.status]} ml-2 flex-shrink-0`}>
              {property.status}
            </Badge>
          </div>

          {/* Property Details */}
          <div className="flex items-center gap-3 text-xs text-muted-foreground mb-3">
            {property.sqft && (
              <span className="flex items-center gap-1">
                <Ruler className="h-3 w-3" />
                {Number(property.sqft).toLocaleString()} sqft
              </span>
            )}
            {property.year_built && (
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                Built {property.year_built}
              </span>
            )}
          </div>

          {/* Divider */}
          <div className="border-t my-3" />

          {/* Owner Info */}
          <div className="space-y-2">
            {/* Owner Name */}
            {property.owner_name && (
              <div className="flex items-center gap-2 text-sm">
                <User className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                <span className="truncate font-medium">{property.owner_name}</span>
              </div>
            )}

            {/* Owner Phone */}
            {ownerPhone && (
              <div className="flex items-center gap-2 text-sm">
                <Phone className="h-3.5 w-3.5 text-green-600 flex-shrink-0" />
                <a
                  href={`/dialer?number=${encodeURIComponent(ownerPhone)}`}
                  className="text-green-600 hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  {formatPhone(ownerPhone)}
                </a>
              </div>
            )}

            {/* Show placeholder if no contact info */}
            {!property.owner_name && !ownerPhone && (
              <p className="text-xs text-muted-foreground italic">
                No contact info — run skip trace
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
