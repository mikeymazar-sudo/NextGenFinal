import { NextRequest } from 'next/server'
import { z } from 'zod'
import { withAuth } from '@/lib/auth/middleware'
import { checkRateLimit } from '@/lib/api/rate-limit'
import { apiSuccess, Errors } from '@/lib/api/response'
import { createAdminClient } from '@/lib/supabase/server'

const CompsSchema = z.object({
  propertyId: z.string().uuid(),
  address: z.string().min(3),
  bedrooms: z.number().optional(),
  bathrooms: z.number().optional(),
  sqft: z.number().optional(),
  // Filter params
  radius: z.number().optional(),
  compCount: z.number().optional(),
  daysOld: z.number().optional(),
  force: z.boolean().optional(), // Bypass cache and re-fetch
  beds: z.number().optional(), // Override bedrooms filter
  baths: z.number().optional(), // Override bathrooms filter
  sqftMin: z.number().optional(),
  sqftMax: z.number().optional(),
})

export const POST = withAuth(async (req: NextRequest, { user }) => {
  try {
    const body = await req.json()
    const parsed = CompsSchema.safeParse(body)

    if (!parsed.success) {
      return Errors.badRequest('Invalid input. Provide propertyId and address.')
    }

    const { propertyId, address, bedrooms, bathrooms, sqft, radius, compCount, daysOld, force, beds, baths, sqftMin, sqftMax } = parsed.data

    // Use filter overrides if provided, otherwise fall back to property values
    const effectiveBeds = beds ?? bedrooms
    const effectiveBaths = baths ?? bathrooms

    // Rate limit check
    const { allowed } = await checkRateLimit(user.id, 'rental-comps')
    if (!allowed) return Errors.rateLimited()

    const supabase = createAdminClient()

    // Check cache: return if rental_data is <30 days old (skip cache if force or custom filters)
    const shouldBypassCache = force || radius || compCount || beds || baths || sqftMin || sqftMax || daysOld
    if (!shouldBypassCache) {
      const { data: property } = await supabase
        .from('properties')
        .select('rental_data, rental_fetched_at')
        .eq('id', propertyId)
        .single()

      if (property?.rental_data && property?.rental_fetched_at) {
        const fetchedAt = new Date(property.rental_fetched_at)
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
        if (fetchedAt > thirtyDaysAgo) {
          return apiSuccess(property.rental_data, true)
        }
      }
    }

    // Call RentCast API
    const params = new URLSearchParams({
      address,
      compCount: (compCount || 5).toString()
    })
    if (effectiveBeds) params.set('bedrooms', effectiveBeds.toString())
    if (effectiveBaths) params.set('bathrooms', effectiveBaths.toString())
    if (sqft) params.set('squareFootage', sqft.toString())
    if (radius) params.set('maxRadius', radius.toString())

    const rentcastRes = await fetch(
      `https://api.rentcast.io/v1/avm/rent/long-term?${params.toString()}`,
      {
        headers: {
          'Accept': 'application/json',
          'X-Api-Key': process.env.RENTCAST_API_KEY!,
        },
      }
    )

    if (!rentcastRes.ok) {
      const errBody = await rentcastRes.text()
      console.error('RentCast API error:', rentcastRes.status, errBody)
      return Errors.externalApi('RentCast', { status: rentcastRes.status })
    }

    const rentcastData = await rentcastRes.json()

    const rentalData = {
      rent: rentcastData.rent || rentcastData.rentEstimate || 0,
      rentRangeLow: rentcastData.rentRangeLow || 0,
      rentRangeHigh: rentcastData.rentRangeHigh || 0,
      comparables: (rentcastData.comparables || []).map((comp: Record<string, unknown>) => ({
        address: comp.formattedAddress || comp.address || '',
        rent: comp.price || comp.rent || 0,
        bedrooms: comp.bedrooms || 0,
        bathrooms: comp.bathrooms || 0,
        sqft: comp.squareFootage || 0,
        distance: comp.distance || 0,
        latitude: comp.latitude || null,
        longitude: comp.longitude || null,
        propertyType: comp.propertyType || null,
        yearBuilt: comp.yearBuilt || null,
        status: comp.status || comp.listingType || null,
      })),
    }

    // Save to property
    const { error: updateError } = await supabase
      .from('properties')
      .update({
        rental_data: rentalData,
        rental_fetched_at: new Date().toISOString(),
      })
      .eq('id', propertyId)

    if (updateError) {
      console.error('Failed to save rental data:', updateError)
    }

    return apiSuccess(rentalData, false)
  } catch (error) {
    console.error('Rental comps error:', error)
    return Errors.internal()
  }
})
