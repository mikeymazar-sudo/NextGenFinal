import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/auth/middleware'
import { apiSuccess, Errors } from '@/lib/api/response'
import { createAdminClient } from '@/lib/supabase/server'
import { resolveMarketingActor } from '@/lib/marketing/actor'
import { requirePropertyOwnership } from '@/lib/marketing/ownership'
import type { ActivityItem } from '@/types/schema'

export const GET = withAuth(async (req: NextRequest, { user }) => {
  try {
    const { searchParams } = new URL(req.url)
    const propertyId = searchParams.get('propertyId')

    if (!propertyId) {
      return Errors.badRequest('propertyId is required.')
    }

    const supabase = createAdminClient()
    const actor = await resolveMarketingActor(user.id, { supabase, email: user.email })
    const propertyAccess = await requirePropertyOwnership(user.id, propertyId, {
      supabase,
      actor,
    })

    if (!propertyAccess.ok) {
      return propertyAccess.response
    }

    // Fetch all activity sources in parallel
    const [notesRes, commLogsRes, activityLogRes, callsRes] = await Promise.all([
      supabase
        .from('notes')
        .select('id, content, created_at, user:profiles!notes_user_id_fkey(full_name)')
        .eq('property_id', propertyId)
        .order('created_at', { ascending: false }),
      supabase
        .from('communication_logs')
        .select('id, type, subject, content, status, created_at, user:profiles!communication_logs_user_id_fkey(full_name)')
        .eq('property_id', propertyId)
        .order('created_at', { ascending: false }),
      supabase
        .from('activity_log')
        .select('id, action, old_value, new_value, created_at, user:profiles!activity_log_user_id_fkey(full_name)')
        .eq('property_id', propertyId)
        .order('created_at', { ascending: false }),
      supabase
        .from('calls')
        .select('id, status, duration, to_number, notes, recording_url, created_at, caller:profiles!calls_caller_id_fkey(full_name)')
        .eq('property_id', propertyId)
        .order('created_at', { ascending: false }),
    ])

    const timeline: ActivityItem[] = []

    // Notes
    for (const note of notesRes.data || []) {
      const usr = note.user as unknown as { full_name: string | null } | null
      timeline.push({
        id: note.id,
        type: 'note',
        content: note.content,
        user: usr?.full_name || null,
        created_at: note.created_at,
      })
    }

    // Communication logs
    for (const log of commLogsRes.data || []) {
      const usr = log.user as unknown as { full_name: string | null } | null
      timeline.push({
        id: log.id,
        type: log.type as ActivityItem['type'],
        content: log.subject || log.content || '',
        status: log.status || undefined,
        user: usr?.full_name || null,
        created_at: log.created_at,
      })
    }

    // Activity log (status changes)
    for (const entry of activityLogRes.data || []) {
      const usr = entry.user as unknown as { full_name: string | null } | null
      timeline.push({
        id: entry.id,
        type: 'status_change',
        content: `Status changed from ${entry.old_value || 'none'} to ${entry.new_value || 'none'}`,
        user: usr?.full_name || null,
        created_at: entry.created_at,
      })
    }

    // Calls
    for (const call of callsRes.data || []) {
      const usr = call.caller as unknown as { full_name: string | null } | null
        timeline.push({
        id: call.id,
        type: 'call',
        content: call.notes || `Called ${call.to_number || 'unknown'} (${call.duration || 0}s)`,
        status: call.status || undefined,
        user: usr?.full_name || null,
        created_at: call.created_at,
        callId: call.id,
        recording_url: call.recording_url || null,
        duration: call.duration || 0,
      })
    }

    // Sort by created_at descending
    timeline.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

    return apiSuccess(timeline)
  } catch (error) {
    console.error('Activity timeline error:', error)
    return Errors.internal()
  }
})
