export interface SupabaseBrowserEnv {
  anonKey: string
  url: string
}

export interface SupabaseAdminEnv extends SupabaseBrowserEnv {
  serviceRoleKey: string
}

export function getSupabaseBrowserEnv(): SupabaseBrowserEnv | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    return null
  }

  return { url, anonKey }
}

export function getSupabaseAdminEnv(): SupabaseAdminEnv | null {
  const browserEnv = getSupabaseBrowserEnv()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!browserEnv || !serviceRoleKey) {
    return null
  }

  return { ...browserEnv, serviceRoleKey }
}

export function hasSupabaseBrowserEnv() {
  return getSupabaseBrowserEnv() !== null
}
