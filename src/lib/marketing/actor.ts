import { createAdminClient } from '@/lib/supabase/server'

export type MarketingProfileSource = 'profiles' | 'user_profiles' | 'auth'

export type MarketingActor = {
  id: string
  email: string | null
  fullName: string | null
  role: string | null
  teamId: string | null
  source: MarketingProfileSource
}

type MarketingProfileRow = {
  id: string
  email: string | null
  full_name: string | null
  role: string | null
  team_id: string | null
  source: MarketingProfileSource
}

type MarketingActorOptions = {
  email?: string | null
  supabase?: ReturnType<typeof createAdminClient>
}

async function loadProfile(
  supabase: ReturnType<typeof createAdminClient>,
  table: 'profiles' | 'user_profiles',
  userId: string
): Promise<MarketingProfileRow | null> {
  const { data, error } = await supabase
    .from(table)
    .select('id, email, full_name, role, team_id')
    .eq('id', userId)
    .maybeSingle()

  if (error || !data) {
    return null
  }

  return {
    ...(data as Omit<MarketingProfileRow, 'source'>),
    source: table,
  }
}

export async function resolveMarketingActor(
  userId: string,
  options: MarketingActorOptions = {}
): Promise<MarketingActor> {
  const supabase = options.supabase ?? createAdminClient()

  const profile =
    (await loadProfile(supabase, 'profiles', userId)) ||
    (await loadProfile(supabase, 'user_profiles', userId))

  if (profile) {
    return {
      id: profile.id,
      email: options.email ?? profile.email,
      fullName: profile.full_name,
      role: profile.role,
      teamId: profile.team_id,
      source: profile.source,
    }
  }

  return {
    id: userId,
    email: options.email ?? null,
    fullName: null,
    role: null,
    teamId: null,
    source: 'auth',
  }
}

export function actorHasTeamScope(actor: MarketingActor) {
  return Boolean(actor.teamId && actor.role === 'admin')
}
