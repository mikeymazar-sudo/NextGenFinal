import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

function copySupabaseResponse(targetResponse: NextResponse, sourceResponse: NextResponse) {
  sourceResponse.headers.forEach((value, key) => {
    if (key.toLowerCase() === 'set-cookie') {
      return
    }

    targetResponse.headers.set(key, value)
  })

  sourceResponse.cookies.getAll().forEach((cookie) => {
    targetResponse.cookies.set(cookie)
  })

  return targetResponse
}

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet, headers = {}) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
          const responseHeaders =
            headers instanceof Headers ? headers : new Headers(headers as HeadersInit)
          responseHeaders.forEach((value, key) =>
            supabaseResponse.headers.set(key, value)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // Protected routes
  const protectedPaths = ['/dashboard', '/leads', '/dialer', '/settings']
  const isProtected = protectedPaths.some((path) => request.nextUrl.pathname.startsWith(path))

  if (!user && isProtected) {
    const loginUrl = new URL('/login', request.url)
    return copySupabaseResponse(NextResponse.redirect(loginUrl), supabaseResponse)
  }

  // Redirect authenticated users away from login
  if (user && request.nextUrl.pathname === '/login') {
    const dashboardUrl = new URL('/dashboard', request.url)
    return copySupabaseResponse(NextResponse.redirect(dashboardUrl), supabaseResponse)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api).*)',
  ],
}
