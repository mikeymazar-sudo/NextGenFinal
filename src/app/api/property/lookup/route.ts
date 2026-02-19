import { NextRequest } from 'next/server'
import { z } from 'zod'
import { withAuth } from '@/lib/auth/middleware'
import { checkRateLimit } from '@/lib/api/rate-limit'
import { apiSuccess, Errors } from '@/lib/api/response'
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

    if (existing && existing.raw_attom_data) {
      // Alias raw_attom_data to raw_realestate_data for the frontend
      const { raw_attom_data, ...rest } = existing
      const response = {
        ...rest,
        raw_realestate_data: raw_attom_data
      }
      return apiSuccess(response, true)
    }

    // Call RealEstateAPI PropertyDetail
    const reApiUrl = 'https://api.realestateapi.com/v2/PropertyDetail'

    // RealEstateAPI expects a fully formatted address string
    // e.g. "123 Main St, Arlington VA 22205"
    const fullAddress = [
      address,
      [city, state].filter(Boolean).join(' '),
      zip,
    ].filter(Boolean).join(', ')

    const reApiRes = await fetch(reApiUrl, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'x-api-key': process.env.REAPI_SECRET_KEY!,
      },
      body: JSON.stringify({
        address: fullAddress,
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

    // Normalize RealEstateAPI v2 data for DB storage
    const propInfo = prop.propertyInfo || {}
    const propAddr = propInfo.address || {}
    const apiFields = {
      address: propAddr.address || propAddr.label || address,
      city: propAddr.city || city || null,
      state: propAddr.state || state || null,
      zip: propAddr.zip || zip || null,
      list_price: prop.estimatedValue || prop.lastSalePrice || prop.taxInfo?.assessedValue || null,
      bedrooms: propInfo.bedrooms || null,
      bathrooms: propInfo.bathrooms || null,
      sqft: propInfo.livingSquareFeet || propInfo.buildingSquareFeet || null,
      year_built: propInfo.yearBuilt || null,
      lot_size: propInfo.lotSquareFeet || prop.lotInfo?.lotSquareFeet || null,
      property_type: prop.propertyType || propInfo.propertyUse || null,
      owner_name: prop.ownerInfo?.owner1FullName || null,
      raw_attom_data: reApiData,
    }

    // Save to database — update existing or insert new
    let saved: any
    let saveError: any

    if (existing) {
      // Property exists but had no raw_attom_data — update it without overwriting status/created_by
      const res = await supabase
        .from('properties')
        .update(apiFields)
        .eq('id', existing.id)
        .select()
        .single()
      saved = res.data
      saveError = res.error
    } else {
      const res = await supabase
        .from('properties')
        .upsert({ ...apiFields, created_by: user.id, status: 'new' as const }, { onConflict: 'address,city,state,zip' })
        .select()
        .single()
      saved = res.data
      saveError = res.error
    }

    if (saveError) {
      console.error('Save error:', saveError)
      return Errors.internal(saveError.message)
    }

    // Alias raw_attom_data to raw_realestate_data for the frontend
    const { raw_attom_data, ...rest } = saved
    const response = {
      ...rest,
      raw_realestate_data: raw_attom_data
    }

    return apiSuccess(response, false)
  } catch (error) {
    console.error('Property lookup error:', error)
    return Errors.internal()
  }
})

