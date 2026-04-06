import { createBrowserClient } from '@supabase/ssr'
import type { CookieMethodsBrowser } from '@supabase/ssr/dist/main/types'
import { parse, serialize } from 'cookie'

export function createClient() {
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

  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies,
    }
  )
}
