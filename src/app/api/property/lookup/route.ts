import { NextRequest } from 'next/server'
import { z } from 'zod'
import { withAuth } from '@/lib/auth/middleware'
import { checkRateLimit } from '@/lib/rate-limit'
import { apiSuccess, Errors } from '@/lib/api-response'
import { createAdminClient } from '@/lib/supabase/server'

const LookupSchema = z.object({
  address: z.string().min(3),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
})

export const POST = withAuth(async (req: NextRequest, { user }) => {
  try {
    const body = await req.json()
    const parsed = LookupSchema.safeParse(body)

    if (!parsed.success) {
      return Errors.badRequest('Invalid address. Please provide at least a street address.')
    }

    const { address, city, state, zip } = parsed.data

    // Rate limit check
    const { allowed } = await checkRateLimit(user.id, 'property-lookup')
    if (!allowed) return Errors.rateLimited()

    const supabase = createAdminClient()

    // DB-First: Check if property already exists
    let query = supabase
      .from('properties')
      .select('*')
      .ilike('address', `%${address}%`)

    if (city) query = query.ilike('city', city)
    if (state) query = query.ilike('state', state)
    if (zip) query = query.eq('zip', zip)

    const { data: existing } = await query.limit(1).single()

    if (existing) {
      return apiSuccess(existing, true)
    }

    // Call RealEstateAPI PropertyDetail
    const reApiUrl = 'https://api.realestateapi.com/v2/PropertyDetail'

    const reApiRes = await fetch(reApiUrl, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'x-api-key': process.env.REAPI_SECRET_KEY!,
      },
      body: JSON.stringify({
        address: address,
        city: city || undefined,
        state: state || undefined,
        zip: zip || undefined,
      }),
    })

    if (!reApiRes.ok) {
      const errBody = await reApiRes.text()
      console.error('RealEstateAPI error:', reApiRes.status, errBody)
      return Errors.externalApi('RealEstateAPI', { status: reApiRes.status })
    }

    const reApiData = await reApiRes.json()
    const prop = reApiData?.data?.[0] || reApiData?.data

    if (!prop) {
      return Errors.notFound('Property')
    }

    // Normalize RealEstateAPI data
    const normalized = {
      address: prop.address?.address || prop.address?.oneLine || address,
      city: prop.address?.city || city || null,
      state: prop.address?.state || state || null,
      zip: prop.address?.zip || prop.address?.zipCode || zip || null,
      list_price: prop.saleInfo?.salePrice || prop.taxInfo?.assessedValue || null,
      bedrooms: prop.buildingInfo?.bedrooms || null,
      bathrooms: prop.buildingInfo?.bathrooms || null,
      sqft: prop.buildingInfo?.livingSquareFeet || prop.buildingInfo?.totalSquareFeet || null,
      year_built: prop.buildingInfo?.yearBuilt || null,
      lot_size: prop.lotInfo?.lotSquareFeet || prop.lotInfo?.lotAcres || null,
      property_type: prop.propertyType || prop.buildingInfo?.propertyType || null,
      owner_name: prop.ownerInfo?.owner1FullName || prop.ownerInfo?.ownerName || null,
      raw_attom_data: reApiData,
      created_by: user.id,
      status: 'new' as const,
    }

    // Save to database
    const { data: saved, error: saveError } = await supabase
      .from('properties')
      .upsert(normalized, { onConflict: 'address,city,state,zip' })
      .select()
      .single()

    if (saveError) {
      console.error('Save error:', saveError)
      return Errors.internal(saveError.message)
    }

    return apiSuccess(saved, false)
  } catch (error) {
    console.error('Property lookup error:', error)
    return Errors.internal()
  }
})

