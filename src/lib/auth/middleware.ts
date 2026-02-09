import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export type AuthenticatedHandler = (
  req: NextRequest,
  context: any
) => Promise<NextResponse>

export function withAuth(handler: AuthenticatedHandler) {
  return async (req: NextRequest, context: any) => {
    try {
      const supabase = await createServerClient()
      const { data: { user }, error } = await supabase.auth.getUser()

      if (error || !user) {
        return NextResponse.json(
          { error: 'Unauthorized', code: 'AUTH_REQUIRED' },
          { status: 401 }
        )
      }

      // Merge user into context, or just pass context if handler doesn't need user
      // We pass the context through so params are available
      return handler(req, { ...context, user: { id: user.id, email: user.email! } })
    } catch (error) {
      console.error('Auth middleware error:', error)
      return NextResponse.json(
        { error: 'Authentication failed', code: 'AUTH_ERROR' },
        { status: 500 }
      )
    }
  }
}
