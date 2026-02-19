import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import {
  downloadAndParseResults,
  matchResultsToProperties,
} from '@/lib/integrations/titanskip'

/**
 * POST /api/webhooks/titanskip
 * Webhook endpoint for TitanSkip completion notifications.
 * Receives: { trace_id, download_url }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { trace_id, download_url } = body

    if (!trace_id) {
      console.error('TitanSkip webhook: missing trace_id')
      return NextResponse.json({ error: 'Missing trace_id' }, { status: 400 })
    }

    console.log('TitanSkip webhook received:', { trace_id, download_url })

    const supabase = createAdminClient()

    // Look up the job
    const { data: job, error: jobError } = await supabase
      .from('skip_trace_jobs')
      .select('*')
      .eq('trace_id', trace_id)
      .single()

    if (jobError || !job) {
      console.error('TitanSkip webhook: job not found for trace_id:', trace_id)
      // Return 200 anyway to acknowledge the webhook
      return NextResponse.json({ received: true, processed: false })
    }

    // If already processed, skip
    if (job.results_processed) {
      console.log('TitanSkip webhook: job already processed for trace_id:', trace_id)
      return NextResponse.json({ received: true, already_processed: true })
    }

    // Download and parse results
    const url = download_url || job.download_url
    if (!url) {
      console.error('TitanSkip webhook: no download_url available')
      await supabase
        .from('skip_trace_jobs')
        .update({ status: 'failed', error_message: 'No download URL' })
        .eq('id', job.id)
      return NextResponse.json({ received: true, processed: false })
    }

    const rows = await downloadAndParseResults(url)
    console.log(`TitanSkip webhook: downloaded ${rows.length} rows for trace ${trace_id}`)

    // Fetch properties for this job
    const { data: properties } = await supabase
      .from('properties')
      .select('id, address, city, state')
      .in('id', job.property_ids)

    if (!properties || properties.length === 0) {
      console.error('TitanSkip webhook: no properties found for job')
      await supabase
        .from('skip_trace_jobs')
        .update({ status: 'failed', error_message: 'No properties found' })
        .eq('id', job.id)
      return NextResponse.json({ received: true, processed: false })
    }

    // Match results to properties
    const contactMap = matchResultsToProperties(rows, properties)
    const contactsToInsert = Array.from(contactMap.values())

    if (contactsToInsert.length > 0) {
      const { error: insertError } = await supabase
        .from('contacts')
        .insert(contactsToInsert)

      if (insertError) {
        console.error('TitanSkip webhook: failed to save contacts:', insertError)
      } else {
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
    }

    // Mark job as completed
    await supabase
      .from('skip_trace_jobs')
      .update({
        status: 'completed',
        results_processed: true,
        download_url: url,
        completed_at: new Date().toISOString(),
      })
      .eq('id', job.id)

    console.log(`TitanSkip webhook processed: ${contactsToInsert.length} contacts saved for trace ${trace_id}`)

    return NextResponse.json({
      received: true,
      processed: true,
      contacts_saved: contactsToInsert.length,
    })
  } catch (error) {
    console.error('TitanSkip webhook error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
