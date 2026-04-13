import { createBrowserClient } from '@supabase/ssr'
import type { CookieMethodsBrowser } from '@supabase/ssr/dist/main/types'
import { parse, serialize } from 'cookie'

// Singleton — reuse the same client instance across all components so token
// refresh requests are deduplicated and don't hit Supabase rate limits (429).
let _client: ReturnType<typeof createBrowserClient> | null = null

export function createClient() {
  if (typeof window !== 'undefined' && _client) return _client

  const cookies: CookieMethodsBrowser = {
    encode: 'tokens-only',
    getAll() {
      if (typeof document === 'undefined') {
        return []
      }

      const parsedCookies = parse(document.cookie)

      return Object.entries(parsedCookies).map(([name, value]) => ({
        name,
        value: value ?? '',
      }))
    },
    setAll(cookiesToSet) {
      if (typeof document === 'undefined') {
        return
      }

      cookiesToSet.forEach(({ name, value, options }) => {
        document.cookie = serialize(name, value, options)
      })
    },
  }

  const client = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies,
    }
  )

  if (typeof window !== 'undefined') {
    _client = client
  }

  return client
}
