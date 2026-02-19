import { NextRequest } from 'next/server'
import { z } from 'zod'
import { withAuth } from '@/lib/auth/middleware'
import { apiSuccess, Errors } from '@/lib/api/response'
import { createAdminClient } from '@/lib/supabase/server'

const UpdateNoteSchema = z.object({
    content: z.string().min(1),
})

// Update a note
export const PATCH = withAuth(async (req: NextRequest, { user }) => {
    try {
        const noteId = req.nextUrl.pathname.split('/').pop()
        if (!noteId) {
            return Errors.badRequest('Note ID is required.')
        }

        const body = await req.json()
        const parsed = UpdateNoteSchema.safeParse(body)

        if (!parsed.success) {
            return Errors.badRequest('Invalid input. Provide content.')
        }

        const { content } = parsed.data
        const supabase = createAdminClient()

        // Verify ownership
        const { data: existing } = await supabase
            .from('notes')
            .select('user_id')
            .eq('id', noteId)
            .single()

        if (!existing) {
            return Errors.notFound('Note')
        }

        if (existing.user_id !== user.id) {
            return Errors.forbidden('You can only edit your own notes.')
        }

        const { data, error } = await supabase
            .from('notes')
            .update({ content })
            .eq('id', noteId)
            .select(`
        *,
        user:profiles!notes_user_id_fkey(full_name, avatar_url)
      `)
            .single()

        if (error) {
            console.error('Update note error:', error)
            return Errors.internal(error.message)
        }

        return apiSuccess(data)
    } catch (error) {
        console.error('Update note error:', error)
        return Errors.internal()
    }
})

// Delete a note
export const DELETE = withAuth(async (req: NextRequest, { user }) => {
    try {
        const noteId = req.nextUrl.pathname.split('/').pop()
        if (!noteId) {
            return Errors.badRequest('Note ID is required.')
        }

        const supabase = createAdminClient()

        // Verify ownership
        const { data: existing } = await supabase
            .from('notes')
            .select('user_id')
            .eq('id', noteId)
            .single()

        if (!existing) {
            return Errors.notFound('Note')
        }

        if (existing.user_id !== user.id) {
            return Errors.forbidden('You can only delete your own notes.')
        }

        const { error } = await supabase
            .from('notes')
            .delete()
            .eq('id', noteId)

        if (error) {
            console.error('Delete note error:', error)
            return Errors.internal(error.message)
        }

        return apiSuccess({ deleted: true })
    } catch (error) {
        console.error('Delete note error:', error)
        return Errors.internal()
    }
})
