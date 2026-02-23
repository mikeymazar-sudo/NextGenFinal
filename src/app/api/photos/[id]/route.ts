import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/auth/middleware'
import { apiSuccess, Errors } from '@/lib/api/response'
import { createAdminClient } from '@/lib/supabase/server'

// DELETE: Remove a photo
export const DELETE = withAuth(async (
  _req: NextRequest,
  { params }: { user: { id: string }; params: Promise<{ id: string }> }
) => {
  try {
    const { id } = await params
    const supabase = createAdminClient()

    // Get photo record
    const { data: photo, error: fetchError } = await supabase
      .from('property_photos')
      .select('id, storage_path')
      .eq('id', id)
      .single()

    if (fetchError || !photo) {
      return Errors.notFound('Photo')
    }

    // Delete from storage
    const { error: storageError } = await supabase.storage
      .from('property-photos')
      .remove([photo.storage_path])

    if (storageError) {
      console.error('Storage delete error:', storageError)
    }

    // Delete DB record
    const { error: deleteError } = await supabase
      .from('property_photos')
      .delete()
      .eq('id', id)

    if (deleteError) {
      console.error('DB delete error:', deleteError)
      return Errors.internal()
    }

    return apiSuccess({ deleted: true })
  } catch (error) {
    console.error('Photo delete error:', error)
    return Errors.internal()
  }
})

// PATCH: Update caption/order
export const PATCH = withAuth(async (
  req: NextRequest,
  { params }: { user: { id: string }; params: Promise<{ id: string }> }
) => {
  try {
    const { id } = await params
    const body = await req.json()
    const { caption, display_order } = body

    const supabase = createAdminClient()

    const updateData: Record<string, unknown> = {}
    if (caption !== undefined) updateData.caption = caption
    if (display_order !== undefined) updateData.display_order = display_order

    if (Object.keys(updateData).length === 0) {
      return Errors.badRequest('No fields to update.')
    }

    const { data: photo, error } = await supabase
      .from('property_photos')
      .update(updateData)
      .eq('id', id)
      .select('*')
      .single()

    if (error) {
      console.error('Photo update error:', error)
      return Errors.internal()
    }

    return apiSuccess(photo)
  } catch (error) {
    console.error('Photo patch error:', error)
    return Errors.internal()
  }
})
