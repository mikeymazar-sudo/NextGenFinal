import { NextRequest, NextResponse } from 'next/server'
import { Errors } from '@/lib/api/response'
import { createServerClient } from '@/lib/supabase/server'

export type AuthenticatedContext = Record<string, unknown> & {
  user: {
    id: string
    email: string | null
  }
}

export type AuthenticatedHandler<TContext extends Record<string, unknown> = Record<string, unknown>> = (
  req: NextRequest,
  context: TContext & AuthenticatedContext
) => Promise<NextResponse>

export function withAuth<TContext extends Record<string, unknown> = Record<string, unknown>>(
  handler: AuthenticatedHandler<TContext>
): (req: NextRequest, context: Record<string, unknown>) => Promise<NextResponse> {
  return async (req: NextRequest, context: Record<string, unknown>) => {
    try {
      const supabase = await createServerClient()
      const { data: { user }, error } = await supabase.auth.getUser()

      if (error || !user) {
        return Errors.unauthorized()
      }

      return handler(req, {
        ...context,
        user: { id: user.id, email: user.email },
      } as TContext & AuthenticatedContext)
    } catch (error) {
      console.error('Auth middleware error:', error)
      return Errors.internal(error)
    }
  }
}
