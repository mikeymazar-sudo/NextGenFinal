import { NextResponse } from 'next/server'
import { Errors } from '@/lib/api/response'
import { createAdminClient } from '@/lib/supabase/server'
import { actorHasTeamScope, resolveMarketingActor, type MarketingActor } from './actor'

type OwnershipResult<T> =
  | { ok: true; actor: MarketingActor; record: T }
  | { ok: false; response: NextResponse }

type PropertyRow = {
  id: string
  created_by: string
  team_id: string | null
}

type ContactRow = {
  id: string
  property_id: string
}

type CallRow = {
  id: string
  caller_id: string
  property_id: string | null
}

function ownsProperty(actor: MarketingActor, property: PropertyRow) {
  if (property.created_by === actor.id) {
    return true
  }

  return actorHasTeamScope(actor) && property.team_id === actor.teamId
}

async function loadActor(
  userId: string,
  supabase: ReturnType<typeof createAdminClient>,
  actor?: MarketingActor
) {
  return actor ?? resolveMarketingActor(userId, { supabase })
}

export async function requirePropertyOwnership(
  userId: string,
  propertyId: string,
  options: {
    supabase?: ReturnType<typeof createAdminClient>
    actor?: MarketingActor
  } = {}
): Promise<OwnershipResult<PropertyRow>> {
  const supabase = options.supabase ?? createAdminClient()
  const actor = await loadActor(userId, supabase, options.actor)

  const { data: property, error } = await supabase
    .from('properties')
    .select('id, created_by, team_id')
    .eq('id', propertyId)
    .maybeSingle()

  if (error) {
    return { ok: false, response: Errors.internal(error.message) }
  }

  if (!property) {
    return { ok: false, response: Errors.notFound('Property') }
  }

  if (!ownsProperty(actor, property as PropertyRow)) {
    return { ok: false, response: Errors.forbidden('Property ownership required') }
  }

  return { ok: true, actor, record: property as PropertyRow }
}

export async function requireContactOwnership(
  userId: string,
  contactId: string,
  options: {
    supabase?: ReturnType<typeof createAdminClient>
    actor?: MarketingActor
  } = {}
): Promise<OwnershipResult<ContactRow>> {
  const supabase = options.supabase ?? createAdminClient()
  const actor = await loadActor(userId, supabase, options.actor)

  const { data: contact, error } = await supabase
    .from('contacts')
    .select('id, property_id')
    .eq('id', contactId)
    .maybeSingle()

  if (error) {
    return { ok: false, response: Errors.internal(error.message) }
  }

  if (!contact) {
    return { ok: false, response: Errors.notFound('Contact') }
  }

  const propertyAccess = await requirePropertyOwnership(userId, contact.property_id, {
    supabase,
    actor,
  })

  if (!propertyAccess.ok) {
    return { ok: false, response: propertyAccess.response }
  }

  return { ok: true, actor: propertyAccess.actor, record: contact as ContactRow }
}

export async function requireCallOwnership(
  userId: string,
  callId: string,
  options: {
    supabase?: ReturnType<typeof createAdminClient>
    actor?: MarketingActor
  } = {}
): Promise<OwnershipResult<CallRow>> {
  const supabase = options.supabase ?? createAdminClient()
  const actor = await loadActor(userId, supabase, options.actor)

  const { data: call, error } = await supabase
    .from('calls')
    .select('id, caller_id, property_id')
    .eq('id', callId)
    .maybeSingle()

  if (error) {
    return { ok: false, response: Errors.internal(error.message) }
  }

  if (!call) {
    return { ok: false, response: Errors.notFound('Call') }
  }

  if ((call as CallRow).caller_id !== actor.id) {
    return { ok: false, response: Errors.forbidden('Call ownership required') }
  }

  if ((call as CallRow).property_id) {
    const propertyAccess = await requirePropertyOwnership(userId, (call as CallRow).property_id as string, {
      supabase,
      actor,
    })

    if (!propertyAccess.ok) {
      return { ok: false, response: propertyAccess.response }
    }
  }

  return { ok: true, actor, record: call as CallRow }
}
