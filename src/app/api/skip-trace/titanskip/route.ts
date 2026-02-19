import { NextRequest } from 'next/server'
import { z } from 'zod'
import { withAuth } from '@/lib/auth/middleware'
import { apiSuccess, Errors } from '@/lib/api/response'
import { createAdminClient } from '@/lib/supabase/server'
import {
  isTitanSkipCompatible,
  buildTitanSkipCsv,
  submitTrace,
} from '@/lib/integrations/titanskip'

const BatchSkipTraceSchema = z.object({
  propertyIds: z.array(z.string().uuid()).min(1).max(500),
})

/**
 * POST /api/skip-trace/titanskip
 * Batch skip trace: splits leads into TitanSkip-compatible and BatchData groups.
 * TitanSkip-compatible leads are uploaded as a CSV batch.
 * Returns the job info so the frontend can poll for results.
 */
export const POST = withAuth(async (req: NextRequest, { user }) => {
  try {
    const body = await req.json()
    const parsed = BatchSkipTraceSchema.safeParse(body)

    if (!parsed.success) {
      return Errors.badRequest('Provide an array of propertyIds (1-500).')
    }

    const { propertyIds } = parsed.data
    const supabase = createAdminClient()

    // Fetch all properties
    const { data: properties, error: fetchError } = await supabase
      .from('properties')
      .select('id, address, city, state, zip, owner_name, raw_realestate_data')
      .in('id', propertyIds)

    if (fetchError || !properties) {
      console.error('Failed to fetch properties for batch skip trace:', fetchError)
      return Errors.internal('Failed to fetch properties')
    }

    // Filter out properties that already have contacts (unless user wants to force)
    const { data: existingContacts } = await supabase
      .from('contacts')
      .select('property_id')
      .in('property_id', propertyIds)

    const propertiesWithContacts = new Set(
      (existingContacts || []).map((c) => c.property_id)
    )

    const propertiesNeedingTrace = properties.filter(
      (p) => !propertiesWithContacts.has(p.id)
    )

    if (propertiesNeedingTrace.length === 0) {
      return apiSuccess({
        message: 'All selected leads already have contacts',
        titanSkipCount: 0,
        batchDataCount: 0,
        skippedCount: properties.length,
      })
    }

    // Split into TitanSkip-compatible and BatchData groups
    const titanSkipLeads = propertiesNeedingTrace.filter((p) =>
      isTitanSkipCompatible({
        owner_name: p.owner_name,
        address: p.address,
        city: p.city,
        state: p.state,
      })
    )
    const batchDataLeads = propertiesNeedingTrace.filter(
      (p) => !titanSkipLeads.some((t) => t.id === p.id)
    )

    let traceId: string | null = null
    let titanSkipCount = 0
    let batchDataCount = batchDataLeads.length

    // Submit TitanSkip batch if there are compatible leads
    if (titanSkipLeads.length > 0) {
      const csv = buildTitanSkipCsv(
        titanSkipLeads.map((p) => ({
          owner_name: p.owner_name,
          address: p.address,
          city: p.city,
          state: p.state,
          raw_realestate_data: p.raw_realestate_data,
        }))
      )

      const submitResult = await submitTrace(csv)

      if ('traceId' in submitResult) {
        traceId = submitResult.traceId
        titanSkipCount = titanSkipLeads.length

        // Store the job for tracking
        await supabase.from('skip_trace_jobs').insert({
          trace_id: traceId,
          status: 'processing',
          property_ids: titanSkipLeads.map((p) => p.id),
          titan_skip_count: titanSkipCount,
          batch_data_count: batchDataCount,
          created_by: user.id,
        })

        console.log(`TitanSkip batch submitted: ${traceId} with ${titanSkipCount} leads`)
      } else {
        // TitanSkip failed, move all to BatchData
        console.warn('TitanSkip batch submit failed:', submitResult.error)
        batchDataCount += titanSkipLeads.length
        titanSkipCount = 0
      }
    }

    // Process BatchData leads immediately (one by one via the existing skip-trace endpoint pattern)
    // For now, we process them inline. For very large batches, consider a queue.
    let batchDataProcessed = 0
    for (const lead of batchDataLeads) {
      try {
        const addressObj: Record<string, string> = { street: lead.address }
        if (lead.city) addressObj.city = lead.city
        if (lead.state) addressObj.state = lead.state
        if (lead.zip) addressObj.zip = lead.zip

        const batchRes = await fetch('https://api.batchdata.com/api/v1/property/skip-trace', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.BATCH_DATA_API_TOKEN}`,
          },
          body: JSON.stringify({
            requests: [{ propertyAddress: addressObj }],
          }),
        })

        if (batchRes.ok) {
          const batchData = await batchRes.json()
          const persons = batchData?.results?.persons || []

          if (persons.length > 0) {
            const contacts = persons.map((person: Record<string, any>) => {
              const phoneNumbers = person.phoneNumbers || []
              const phones = phoneNumbers
                .map((p: any) => p.number?.toString() || '')
                .filter((v: string) => v && /\d{7,}/.test(v.replace(/\D/g, '')))
                .slice(0, 3)
              const emailList = person.emails || []
              const emails = emailList
                .map((e: any) => e.email || e.address || '')
                .filter((v: string) => v && v.includes('@'))
                .slice(0, 3)
              const nameObj = person.name || {}
              const fullName = nameObj.full || [nameObj.first, nameObj.last].filter(Boolean).join(' ') || 'Unknown Owner'

              return {
                property_id: lead.id,
                name: fullName,
                phone_numbers: phones,
                emails: emails,
                raw_batchdata_response: person,
              }
            })

            await supabase.from('contacts').insert(contacts)
            batchDataProcessed++
          }
        }
      } catch (err) {
        console.error(`BatchData error for property ${lead.id}:`, err)
      }
    }

    console.log(`Batch skip trace: ${titanSkipCount} via TitanSkip, ${batchDataProcessed}/${batchDataCount} via BatchData`)

    return apiSuccess({
      traceId,
      titanSkipCount,
      batchDataCount,
      batchDataProcessed,
      skippedCount: propertiesWithContacts.size,
      message: traceId
        ? `Processing ${titanSkipCount} leads via TitanSkip, ${batchDataProcessed} via BatchData`
        : `Processed ${batchDataProcessed} leads via BatchData`,
    })
  } catch (error) {
    console.error('Batch skip trace error:', error)
    return Errors.internal()
  }
})
