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

    // Call Attom API
    const fullAddress = [address, city, state, zip].filter(Boolean).join(', ')
    const attomUrl = `https://api.gateway.attomdata.com/propertyapi/v1.0.0/property/basicprofile?address=${encodeURIComponent(fullAddress)}`

    const attomRes = await fetch(attomUrl, {
      headers: {
        'Accept': 'application/json',
        'apikey': process.env.ATTOM_API_KEY!,
      },
    })

    if (!attomRes.ok) {
      const errBody = await attomRes.text()
      console.error('Attom API error:', attomRes.status, errBody)
      return Errors.externalApi('Attom Data', { status: attomRes.status })
    }

    const attomData = await attomRes.json()
    const prop = attomData?.property?.[0]

    if (!prop) {
      return Errors.notFound('Property')
    }

    // Normalize Attom data
    const normalized = {
      address: prop.address?.oneLine || address,
      city: prop.address?.locality || city || null,
      state: prop.address?.countrySubd || state || null,
      zip: prop.address?.postal1 || zip || null,
      list_price: prop.sale?.amount?.saleAmt || prop.assessment?.assessed?.assdTtlValue || null,
      bedrooms: prop.building?.rooms?.beds || null,
      bathrooms: prop.building?.rooms?.bathsFull || null,
      sqft: prop.building?.size?.livingSize || prop.building?.size?.universalSize || null,
      year_built: prop.summary?.yearBuilt || null,
      lot_size: prop.lot?.lotSize2 || prop.lot?.lotSize1 || null,
      property_type: prop.summary?.propType || prop.summary?.propSubType || null,
      owner_name: prop.owner?.owner1?.fullName || null,
      raw_attom_data: attomData,
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
