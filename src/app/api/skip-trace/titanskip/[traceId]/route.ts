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
    const { traceId } = await params
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

    // Save contacts
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

    console.log(`TitanSkip job ${traceId} processed: ${contactsToInsert.length} contacts saved`)

    return apiSuccess({
      status: 'completed',
      traceId,
      contactsFound: contactsToInsert.length,
      totalRows: rows.length,
      message: `Found contacts for ${contactsToInsert.length} out of ${properties.length} properties`,
    })
  } catch (error) {
    console.error('TitanSkip polling error:', error)
    return Errors.internal()
  }
})
