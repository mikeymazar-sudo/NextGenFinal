import { NextRequest } from 'next/server'
import { z } from 'zod'
import { withAuth } from '@/lib/auth/middleware'
import { checkRateLimit } from '@/lib/api/rate-limit'
import { apiSuccess, Errors } from '@/lib/api/response'
import { createAdminClient } from '@/lib/supabase/server'

const SoldCompsSchema = z.object({
    propertyId: z.string().uuid(),
    address: z.string().min(3),
    bedrooms: z.number().optional(),
    bathrooms: z.number().optional(),
    sqft: z.number().optional(),
    // Filter params
    radius: z.number().optional(),
    compCount: z.number().optional(),
    daysOld: z.number().optional(), // For sold comps: how many days back to look
    force: z.boolean().optional(), // Bypass cache and re-fetch
    beds: z.number().optional(), // Override bedrooms filter
    baths: z.number().optional(), // Override bathrooms filter
    sqftMin: z.number().optional(),
    sqftMax: z.number().optional(),
})

export const POST = withAuth(async (req: NextRequest, { user }) => {
    try {
        const body = await req.json()
        const parsed = SoldCompsSchema.safeParse(body)

        if (!parsed.success) {
            return Errors.badRequest('Invalid input. Provide propertyId and address.')
        }

        const { propertyId, address, bedrooms, bathrooms, sqft, radius, compCount, daysOld, force, beds, baths, sqftMin, sqftMax } = parsed.data

        // Use filter overrides if provided, otherwise fall back to property values
        const effectiveBeds = beds ?? bedrooms
        const effectiveBaths = baths ?? bathrooms

        // Rate limit check
        const { allowed } = await checkRateLimit(user.id, 'sold-comps')
        if (!allowed) return Errors.rateLimited()

        const supabase = createAdminClient()

        // Check cache: return if sold_data is <30 days old (skip if force or custom filters)
        const shouldBypassCache = force || radius || compCount || daysOld || beds || baths || sqftMin || sqftMax
        if (!shouldBypassCache) {
            const { data: property } = await supabase
                .from('properties')
                .select('sold_data, sold_fetched_at')
                .eq('id', propertyId)
                .single()

            if (property?.sold_data && property?.sold_fetched_at) {
                const fetchedAt = new Date(property.sold_fetched_at)
                const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
                if (fetchedAt > thirtyDaysAgo) {
                    return apiSuccess(property.sold_data, true)
                }
            }
        }

        // Call RentCast AVM Value API for sold comps
        const params = new URLSearchParams({
            address,
            compCount: (compCount || 5).toString()
        })
        if (effectiveBeds) params.set('bedrooms', effectiveBeds.toString())
        if (effectiveBaths) params.set('bathrooms', effectiveBaths.toString())
        if (sqft) params.set('squareFootage', sqft.toString())
        if (radius) params.set('maxRadius', radius.toString())
        if (daysOld) params.set('daysOld', daysOld.toString())

        const rentcastRes = await fetch(
            `https://api.rentcast.io/v1/avm/value?${params.toString()}`,
            {
                headers: {
                    'Accept': 'application/json',
                    'X-Api-Key': process.env.RENTCAST_API_KEY!,
                },
            }
        )

        if (!rentcastRes.ok) {
            const errBody = await rentcastRes.text()
            console.error('RentCast AVM Value API error:', rentcastRes.status, errBody)
            return Errors.externalApi('RentCast', { status: rentcastRes.status })
        }

        const rentcastData = await rentcastRes.json()

        const soldData = {
            price: rentcastData.price || rentcastData.priceEstimate || 0,
            priceRangeLow: rentcastData.priceRangeLow || 0,
            priceRangeHigh: rentcastData.priceRangeHigh || 0,
            comparables: (rentcastData.comparables || []).map((comp: Record<string, unknown>) => ({
                address: comp.formattedAddress || comp.address || '',
                price: comp.price || comp.salePrice || 0,
                bedrooms: comp.bedrooms || 0,
                bathrooms: comp.bathrooms || 0,
                sqft: comp.squareFootage || 0,
                distance: comp.distance || 0,
                soldDate: comp.lastSaleDate || comp.saleDate || '',
                latitude: comp.latitude || null,
                longitude: comp.longitude || null,
                propertyType: comp.propertyType || null,
                yearBuilt: comp.yearBuilt || null,
                lotSize: comp.lotSize || null,
                status: comp.status || comp.listingType || null,
            })),
        }

        // Save to property
        const { error: updateError } = await supabase
            .from('properties')
            .update({
                sold_data: soldData,
                sold_fetched_at: new Date().toISOString(),
            })
            .eq('id', propertyId)

        if (updateError) {
            console.error('Failed to save sold data:', updateError)
        }

        return apiSuccess(soldData, false)
    } catch (error) {
        console.error('Sold comps error:', error)
        return Errors.internal()
    }
})
