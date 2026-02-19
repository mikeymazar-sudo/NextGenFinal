import { NextRequest } from 'next/server'
import { z } from 'zod'
import { withAuth } from '@/lib/auth/middleware'
import { apiSuccess, Errors } from '@/lib/api/response'
import { createAdminClient } from '@/lib/supabase/server'

const UpdateCallSchema = z.object({
  notes: z.string().optional(),
  propertyId: z.string().uuid().optional(),
})

export const PATCH = withAuth(async (req: NextRequest, { user }) => {
  try {
    const id = req.nextUrl.pathname.split('/').pop()
    if (!id) return Errors.badRequest('Call ID required.')

    const body = await req.json()
    const parsed = UpdateCallSchema.safeParse(body)

    if (!parsed.success) {
      return Errors.badRequest('Invalid input.')
    }

    const { notes, propertyId } = parsed.data
    const supabase = createAdminClient()

    const updateData: Record<string, unknown> = {}
    if (notes !== undefined) updateData.notes = notes
    if (propertyId !== undefined) updateData.property_id = propertyId

    const { data, error } = await supabase
      .from('calls')
      .update(updateData)
      .eq('id', id)
      .eq('caller_id', user.id)
      .select()
      .single()

    if (error) {
      console.error('Update call error:', error)
      return Errors.notFound('Call')
    }

    return apiSuccess(data)
  } catch (error) {
    console.error('Update call notes error:', error)
    return Errors.internal()
  }
})
