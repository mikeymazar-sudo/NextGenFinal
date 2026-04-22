import { createClient } from '@supabase/supabase-js'
import { createServerClient as createSSRClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getSupabaseAdminEnv, getSupabaseBrowserEnv } from '@/lib/supabase/config'

export function createAdminClient() {
  const supabaseEnv = getSupabaseAdminEnv()

  if (!supabaseEnv) {
    throw new Error(
      'Supabase admin access is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.'
    )
  }

  return createClient(
    supabaseEnv.url,
    supabaseEnv.serviceRoleKey
  )
}

export async function createServerClient() {
  const supabaseEnv = getSupabaseBrowserEnv()

  if (!supabaseEnv) {
    throw new Error(
      'Supabase auth is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.'
    )
  }

  const cookieStore = await cookies()

  return createSSRClient(
    supabaseEnv.url,
    supabaseEnv.anonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // setAll can fail in Server Components where cookies are read-only.
            // This is safe to ignore — the middleware handles cookie refresh.
          }
        },
      },
    }
  )
}
