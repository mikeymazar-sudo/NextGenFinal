import { createAdminClient } from '@/lib/supabase/server'
import type { GlobalSuppressionStatus } from '@/types/schema'

export type MarketingChannel = 'sms' | 'email' | 'voice'

export type GlobalSuppressionRow = {
  id: string
  owner_user_id: string | null
  property_id: string | null
  contact_id: string | null
  channel: MarketingChannel
  destination: string
  reason: string | null
  source: string | null
  status: GlobalSuppressionStatus | null
  suppressed_at: string | null
  resolved_at: string | null
}

export type SuppressionTarget = {
  channel: MarketingChannel
  destination: string
  ownerUserId?: string | null
  propertyId?: string | null
  contactId?: string | null
  supabase?: ReturnType<typeof createAdminClient>
}

export type SuppressionCheck = {
  allowed: boolean
  reason: 'suppressed' | 'missing_destination' | 'invalid_destination' | 'unavailable' | null
  matchedSuppression: GlobalSuppressionRow | null
}

function normalizeDestination(destination: string) {
  return destination.trim()
}

export function normalizeSuppressionStatus(status: string | null | undefined): GlobalSuppressionStatus {
  return status === 'resolved' ? 'resolved' : 'active'
}

export async function checkMarketingSuppression(
  target: SuppressionTarget,
  supabase = createAdminClient()
): Promise<SuppressionCheck> {
  const client = target.supabase ?? supabase
  const destination = normalizeDestination(target.destination)

  if (!destination) {
    return {
      allowed: false,
      reason: 'missing_destination',
      matchedSuppression: null,
    }
  }

  try {
    let query = client
      .from('global_suppressions')
      .select(
        'id, owner_user_id, property_id, contact_id, channel, destination, reason, source, status, suppressed_at, resolved_at'
      )
      .eq('channel', target.channel)
      .eq('destination', destination)
      .is('resolved_at', null)
      .order('suppressed_at', { ascending: false })
      .limit(1)

    if (target.ownerUserId) {
      query = query.eq('owner_user_id', target.ownerUserId)
    }

    if (target.propertyId) {
      query = query.eq('property_id', target.propertyId)
    }

    if (target.contactId) {
      query = query.eq('contact_id', target.contactId)
    }

    const { data, error } = await query.maybeSingle()

    if (error) {
      console.warn('Suppression lookup failed:', error)
      return {
        allowed: true,
        reason: 'unavailable',
        matchedSuppression: null,
      }
    }

    if (!data) {
      return {
        allowed: true,
        reason: null,
        matchedSuppression: null,
      }
    }

    return {
      allowed: false,
      reason: 'suppressed',
      matchedSuppression: {
        ...(data as GlobalSuppressionRow),
        status: normalizeSuppressionStatus((data as GlobalSuppressionRow | null)?.status || null),
      },
    }
  } catch (error) {
    console.error('Suppression lookup error:', error)
    return {
      allowed: true,
      reason: 'unavailable',
      matchedSuppression: null,
    }
  }
}
