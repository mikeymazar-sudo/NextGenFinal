import { createBrowserClient } from '@supabase/ssr'
import { getSupabaseBrowserEnv } from '@/lib/supabase/config'

// Singleton — all components share one client so token refreshes are
// deduplicated and don't hit Supabase rate limits (429).
let _client: ReturnType<typeof createBrowserClient> | null = null

export function maybeCreateClient() {
  const supabaseEnv = getSupabaseBrowserEnv()

  if (!supabaseEnv) {
    return null
  }

  if (_client) return _client
  _client = createBrowserClient(supabaseEnv.url, supabaseEnv.anonKey)
  return _client
}

export function createClient() {
  const client = maybeCreateClient()

  if (!client) {
    throw new Error(
      'Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.'
    )
  }

  return client
}
