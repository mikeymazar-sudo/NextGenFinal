import { NextRequest } from 'next/server'
import { z } from 'zod'
import { withAuth } from '@/lib/auth/middleware'
import { checkRateLimit } from '@/lib/api/rate-limit'
import { apiSuccess, Errors } from '@/lib/api/response'
import { createAdminClient } from '@/lib/supabase/server'

const SkipTraceSchema = z.object({
  propertyId: z.string().uuid(),
  ownerName: z.string().optional(), // Now optional for address-only search
  address: z.string().min(3),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  force: z.boolean().optional(), // Bypass cache and re-fetch
})

export const POST = withAuth(async (req: NextRequest, { user }) => {
  try {
    const body = await req.json()
    const parsed = SkipTraceSchema.safeParse(body)

    if (!parsed.success) {
      return Errors.badRequest('Invalid input. Provide propertyId and address.')
    }

    const { propertyId, ownerName, address, city, state, zip, force } = parsed.data

    // Rate limit check
    const { allowed } = await checkRateLimit(user.id, 'skip-trace')
    if (!allowed) return Errors.rateLimited()

    const supabase = createAdminClient()

    // If force is true, delete existing contacts to re-fetch
    if (force) {
      await supabase.from('contacts').delete().eq('property_id', propertyId)
    } else {
      // Check cache: return if contacts already exist for this property
      const { data: existingContacts } = await supabase
        .from('contacts')
        .select('*')
        .eq('property_id', propertyId)

      if (existingContacts && existingContacts.length > 0) {
        return apiSuccess(existingContacts, true)
      }
    }

    // Get property data to use any existing owner info from imports
    const { data: property } = await supabase
      .from('properties')
      .select('owner_name, city, state, zip')
      .eq('id', propertyId)
      .single()

    // Determine the best name to use for skip trace
    const searchName = ownerName && ownerName.length >= 2
      ? ownerName
      : property?.owner_name || null

    // Use passed city/state/zip or fall back to property data
    const searchCity = city || property?.city || ''
    const searchState = state || property?.state || ''
    const searchZip = zip || property?.zip || ''

    let persons: Record<string, unknown>[] = []

    // Build full address object for BatchData
    const addressObj: Record<string, string> = {
      street: address,
    }
    if (searchCity) addressObj.city = searchCity
    if (searchState) addressObj.state = searchState
    if (searchZip) addressObj.zip = searchZip

    console.log('Skip trace request:', { searchName, addressObj })

    // Waterfall Skip Trace Strategy:
    // 1. Try BatchData with owner name + address (most accurate)
    // 2. Fall back to address-only search if no name available

    if (searchName) {
      // Try with owner name first
      const batchRes = await fetch('https://api.batchdata.com/api/v1/person/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.BATCH_DATA_API_TOKEN}`,
        },
        body: JSON.stringify({
          name: searchName,
          address: addressObj,
        }),
      })

      if (batchRes.ok) {
        const batchData = await batchRes.json()
        console.log('BatchData person search response:', JSON.stringify(batchData, null, 2))
        persons = batchData?.results?.persons || batchData?.persons || []
      } else {
        const errText = await batchRes.text()
        console.error('BatchData API error (name search):', batchRes.status, errText)
      }
    }

    // Fallback: Address-only search if no results yet
    if (persons.length === 0) {
      const addressRes = await fetch('https://api.batchdata.com/api/v1/property/skip-trace', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.BATCH_DATA_API_TOKEN}`,
        },
        body: JSON.stringify({
          requests: [{ propertyAddress: addressObj }],
        }),
      })

      if (addressRes.ok) {
        const addressData = await addressRes.json()
        console.log('BatchData property skip-trace response:', JSON.stringify(addressData, null, 2))
        // BatchData returns results.persons directly, not results.results[0].persons
        if (addressData?.results?.persons) {
          persons = addressData.results.persons
        }
      } else {
        const errText = await addressRes.text()
        console.error('BatchData API error (address search):', addressRes.status, errText)
      }
    }

    if (persons.length === 0) {
      return apiSuccess([], false)
    }

    // Save contacts - BatchData uses phoneNumbers (camelCase) and emails
    const contacts = persons.map((person: Record<string, unknown>) => {
      // Handle phoneNumbers array (BatchData format)
      const phoneNumbers = person.phoneNumbers as Array<Record<string, unknown>> || []
      const phones = phoneNumbers
        .map((p) => p.number?.toString() || '')
        .filter((v) => v && /\d{7,}/.test(v.replace(/\D/g, '')))
        .slice(0, 3)

      // Handle emails array
      const emailList = person.emails as Array<Record<string, string>> || []
      const emails = emailList
        .map((e) => e.email || e.address || '')
        .filter((v) => v && v.includes('@'))
        .slice(0, 3)

      // Get name from nested object
      const nameObj = person.name as Record<string, string> | null
      const fullName = nameObj?.full || 'Unknown Owner'

      return {
        property_id: propertyId,
        name: fullName,
        phone_numbers: phones,
        emails: emails,
        raw_batchdata_response: person,
      }
    })

    const { data: savedContacts, error: saveError } = await supabase
      .from('contacts')
      .insert(contacts)
      .select()

    if (saveError) {
      console.error('Failed to save contacts:', saveError)
      return Errors.internal(saveError.message)
    }

    // Update property owner_phone with first contact's phones
    if (savedContacts && savedContacts.length > 0 && savedContacts[0].phone_numbers?.length > 0) {
      await supabase
        .from('properties')
        .update({ owner_phone: savedContacts[0].phone_numbers })
        .eq('id', propertyId)
    }

    return apiSuccess(savedContacts, false)
  } catch (error) {
    console.error('Skip trace error:', error)
    return Errors.internal()
  }
})

