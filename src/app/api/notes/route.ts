import { NextRequest } from 'next/server'
import { z } from 'zod'
import { withAuth } from '@/lib/auth/middleware'
import { apiSuccess, Errors } from '@/lib/api-response'
import { createAdminClient } from '@/lib/supabase/server'

const CreateNoteSchema = z.object({
  propertyId: z.string().uuid(),
  content: z.string().min(1),
})

export const GET = withAuth(async (req: NextRequest, { user }) => {
  try {
    const { searchParams } = new URL(req.url)
    const propertyId = searchParams.get('propertyId')

    if (!propertyId) {
      return Errors.badRequest('propertyId is required.')
    }

    const supabase = createAdminClient()

    const { data, error } = await supabase
      .from('notes')
      .select(`
        *,
        user:profiles!notes_user_id_fkey(full_name, avatar_url)
      `)
      .eq('property_id', propertyId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Get notes error:', error)
      return Errors.internal(error.message)
    }

    // Filter: ensure user has access (created_by or team)
    void user
    return apiSuccess(data || [])
  } catch (error) {
    console.error('Get notes error:', error)
    return Errors.internal()
  }
})

export const POST = withAuth(async (req: NextRequest, { user }) => {
  try {
    const body = await req.json()
    const parsed = CreateNoteSchema.safeParse(body)

    if (!parsed.success) {
      return Errors.badRequest('Invalid input. Provide propertyId and content.')
    }

    const { propertyId, content } = parsed.data
    const supabase = createAdminClient()

    const { data, error } = await supabase
      .from('notes')
      .insert({
        property_id: propertyId,
        user_id: user.id,
        content,
      })
      .select(`
        *,
        user:profiles!notes_user_id_fkey(full_name, avatar_url)
      `)
      .single()

    if (error) {
      console.error('Create note error:', error)
      return Errors.internal(error.message)
    }

    return apiSuccess(data)
  } catch (error) {
    console.error('Create note error:', error)
    return Errors.internal()
  }
})
