import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/auth/middleware'
import { apiSuccess, Errors } from '@/lib/api/response'
import { createAdminClient } from '@/lib/supabase/server'
import {
  getTraceStatus,
  downloadAndParseResults,
  matchResultsToProperties,
} from '@/lib/integrations/titanskip'

/**
 * GET /api/skip-trace/titanskip/[traceId]
 * Poll for TitanSkip trace completion and process results.
 */
export const GET = withAuth(async (req: NextRequest, { user, params }) => {
  try {
    const { traceId } = (await params) as { traceId: string }
    if (!traceId) return Errors.badRequest('Missing traceId')

    const supabase = createAdminClient()

    // Look up the job
    const { data: job } = await supabase
      .from('skip_trace_jobs')
      .select('*')
      .eq('trace_id', traceId)
      .eq('created_by', user.id)
      .single()

    if (!job) {
      return Errors.notFound('Skip trace job')
    }

    // If already processed, return the status
    if (job.results_processed) {
      return apiSuccess({
        status: 'completed',
        traceId,
        message: 'Results already processed',
      })
    }

    // Check TitanSkip status
    const trace = await getTraceStatus(traceId)

    if (!trace) {
      return apiSuccess({ status: 'error', traceId, message: 'Could not reach TitanSkip' })
    }

    if (trace.status !== 'completed' || !trace.download_url) {
      return apiSuccess({
        status: trace.status,
        traceId,
        message: `Trace is ${trace.status}`,
      })
    }

    // Trace is completed — download and process results
    console.log(`TitanSkip trace ${traceId} completed, downloading results...`)

    const rows = await downloadAndParseResults(trace.download_url)
    console.log(`TitanSkip returned ${rows.length} result rows`)

    // Fetch the properties that were part of this batch
    const { data: properties } = await supabase
      .from('properties')
      .select('id, address, city, state')
      .in('id', job.property_ids)

    if (!properties || properties.length === 0) {
      return Errors.internal('No properties found for this job')
    }

    // Match results to properties by address
    const contactMap = matchResultsToProperties(rows, properties)
    console.log(`Matched ${contactMap.size} contacts to properties`)

    // Save TitanSkip contacts
    const contactsToInsert = Array.from(contactMap.values())

    if (contactsToInsert.length > 0) {
      const { error: insertError } = await supabase
        .from('contacts')
        .insert(contactsToInsert)

      if (insertError) {
        console.error('Failed to save TitanSkip contacts:', insertError)
        return Errors.internal(insertError.message)
      }

      // Update owner_phone for each property
      for (const contact of contactsToInsert) {
        if (contact.phone_numbers.length > 0) {
          await supabase
            .from('properties')
            .update({ owner_phone: contact.phone_numbers })
            .eq('id', contact.property_id)
        }
      }
    }

    // ─── BatchData fallback for properties TitanSkip didn't return results for ───
    const propertiesWithTitanSkipResults = new Set(contactsToInsert.map(c => c.property_id))
    const propertiesNeedingBatchData = properties.filter(p => !propertiesWithTitanSkipResults.has(p.id))
    let batchDataContactsFound = 0

    if (propertiesNeedingBatchData.length > 0) {
      console.log(`TitanSkip had no results for ${propertiesNeedingBatchData.length} properties, falling back to BatchData...`)

      // Fetch full property data for BatchData (need zip)
      const { data: fullProperties } = await supabase
        .from('properties')
        .select('id, address, city, state, zip')
        .in('id', propertiesNeedingBatchData.map(p => p.id))

      for (const lead of (fullProperties || propertiesNeedingBatchData)) {
        try {
          const addressObj: Record<string, string> = { street: lead.address }
          if (lead.city) addressObj.city = lead.city
          if (lead.state) addressObj.state = lead.state
          if ('zip' in lead && lead.zip) addressObj.zip = lead.zip as string

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

              const { error: bdInsertError } = await supabase.from('contacts').insert(contacts)
              if (!bdInsertError) {
                batchDataContactsFound++
                // Update owner_phone
                if (contacts[0].phone_numbers.length > 0) {
                  await supabase
                    .from('properties')
                    .update({ owner_phone: contacts[0].phone_numbers })
                    .eq('id', lead.id)
                }
              }
            }
          }
        } catch (err) {
          console.error(`BatchData fallback error for property ${lead.id}:`, err)
        }
      }

      console.log(`BatchData fallback: found contacts for ${batchDataContactsFound} out of ${propertiesNeedingBatchData.length} properties`)
    }

    const totalContactsFound = contactsToInsert.length + batchDataContactsFound

    // Mark job as processed
    await supabase
      .from('skip_trace_jobs')
      .update({
        status: 'completed',
        results_processed: true,
        download_url: trace.download_url,
        completed_at: new Date().toISOString(),
      })
      .eq('id', job.id)

    console.log(`TitanSkip job ${traceId} processed: ${contactsToInsert.length} TitanSkip + ${batchDataContactsFound} BatchData contacts saved`)

    return apiSuccess({
      status: 'completed',
      traceId,
      contactsFound: totalContactsFound,
      totalRows: rows.length,
      message: `Found contacts for ${totalContactsFound} out of ${properties.length} properties (${contactsToInsert.length} TitanSkip, ${batchDataContactsFound} BatchData)`,
    })
  } catch (error) {
    console.error('TitanSkip polling error:', error)
    return Errors.internal()
  }
})
