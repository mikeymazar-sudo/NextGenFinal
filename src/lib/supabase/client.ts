import { createBrowserClient } from '@supabase/ssr'

// Singleton — all components share one client so token refreshes are
// deduplicated and don't hit Supabase rate limits (429).
let _client: ReturnType<typeof createBrowserClient> | null = null

export function createClient() {
  if (_client) return _client
  _client = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  return _client
}
