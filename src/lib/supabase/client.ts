import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        encode: 'tokens-only',
        getAll() {
          if (typeof document === 'undefined') {
            return []
          }

          return document.cookie
            .split('; ')
            .filter(Boolean)
            .map((cookie) => {
              const separatorIndex = cookie.indexOf('=')
              const name = separatorIndex >= 0 ? cookie.slice(0, separatorIndex) : cookie
              const value = separatorIndex >= 0 ? cookie.slice(separatorIndex + 1) : ''

              return { name, value }
            })
        },
        setAll(cookiesToSet) {
          if (typeof document === 'undefined') {
            return
          }

          cookiesToSet.forEach(({ name, value, options }) => {
            const attributes = [
              `${name}=${value}`,
              `Path=${options.path ?? '/'}`,
            ]

            if (typeof options.maxAge === 'number') {
              attributes.push(`Max-Age=${options.maxAge}`)
            }

            if (options.domain) {
              attributes.push(`Domain=${options.domain}`)
            }

            if (options.sameSite) {
              attributes.push(`SameSite=${options.sameSite}`)
            }

            if (options.secure) {
              attributes.push('Secure')
            }

            document.cookie = attributes.join('; ')
          })
        },
      },
    }
  )
}
