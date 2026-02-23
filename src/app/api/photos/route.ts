import { NextRequest } from 'next/server'
import { z } from 'zod'
import { withAuth } from '@/lib/auth/middleware'
import { checkRateLimit } from '@/lib/api/rate-limit'
import { apiSuccess, Errors } from '@/lib/api/response'
import { createAdminClient } from '@/lib/supabase/server'
import type { PropertyPhoto } from '@/types/schema'

const UploadSchema = z.object({
  propertyId: z.string().uuid(),
  base64: z.string().min(100), // raw base64 image data
  filename: z.string().min(1),
})

// POST: Upload a photo
export const POST = withAuth(async (req: NextRequest, { user }) => {
  try {
    const body = await req.json()
    const parsed = UploadSchema.safeParse(body)

    if (!parsed.success) {
      return Errors.badRequest('Invalid upload data.')
    }

    const { propertyId, base64, filename } = parsed.data

    // Rate limit
    const { allowed } = await checkRateLimit(user.id, 'photo-upload')
    if (!allowed) return Errors.rateLimited()

    const supabase = createAdminClient()

    // Check property exists and belongs to user's team
    const { data: property } = await supabase
      .from('properties')
      .select('id, team_id')
      .eq('id', propertyId)
      .single()

    if (!property) {
      return Errors.notFound('Property')
    }

    // Check photo count limit (50 per property)
    const { count } = await supabase
      .from('property_photos')
      .select('id', { count: 'exact', head: true })
      .eq('property_id', propertyId)

    if ((count || 0) >= 50) {
      return Errors.badRequest('Maximum 50 photos per property.')
    }

    // Decode base64 and determine mime type
    const base64Clean = base64.replace(/^data:image\/\w+;base64,/, '')
    const buffer = Buffer.from(base64Clean, 'base64')
    const sizeBytes = buffer.length

    // Max 10MB
    if (sizeBytes > 10 * 1024 * 1024) {
      return Errors.badRequest('Photo too large. Maximum 10MB.')
    }

    // Determine extension/mime
    const ext = filename.split('.').pop()?.toLowerCase() || 'jpg'
    const mimeType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg'

    // Upload to Supabase Storage
    const storagePath = `${propertyId}/${Date.now()}-${filename}`
    const { error: uploadError } = await supabase.storage
      .from('property-photos')
      .upload(storagePath, buffer, {
        contentType: mimeType,
        upsert: false,
      })

    if (uploadError) {
      console.error('Storage upload error:', uploadError)
      return Errors.internal()
    }

    // Get current max display_order
    const { data: maxOrder } = await supabase
      .from('property_photos')
      .select('display_order')
      .eq('property_id', propertyId)
      .order('display_order', { ascending: false })
      .limit(1)
      .single()

    const displayOrder = (maxOrder?.display_order || 0) + 1

    // Insert DB record
    const { data: photo, error: insertError } = await supabase
      .from('property_photos')
      .insert({
        property_id: propertyId,
        storage_path: storagePath,
        filename,
        size_bytes: sizeBytes,
        display_order: displayOrder,
        created_by: user.id,
      })
      .select('*')
      .single()

    if (insertError) {
      console.error('DB insert error:', insertError)
      // Clean up storage
      await supabase.storage.from('property-photos').remove([storagePath])
      return Errors.internal()
    }

    return apiSuccess(photo as PropertyPhoto)
  } catch (error) {
    console.error('Photo upload error:', error)
    return Errors.internal()
  }
})

// GET: List photos for a property
export const GET = withAuth(async (req: NextRequest) => {
  try {
    const { searchParams } = new URL(req.url)
    const propertyId = searchParams.get('propertyId')

    if (!propertyId) {
      return Errors.badRequest('propertyId required.')
    }

    const supabase = createAdminClient()

    const { data: photos, error } = await supabase
      .from('property_photos')
      .select('*')
      .eq('property_id', propertyId)
      .order('display_order', { ascending: true })

    if (error) {
      console.error('Fetch photos error:', error)
      return Errors.internal()
    }

    // Generate signed URLs for each photo
    const photosWithUrls = await Promise.all(
      (photos || []).map(async (photo: PropertyPhoto) => {
        const { data: urlData } = await supabase.storage
          .from('property-photos')
          .createSignedUrl(photo.storage_path, 3600) // 1 hour expiry

        return {
          ...photo,
          url: urlData?.signedUrl || null,
        }
      })
    )

    return apiSuccess(photosWithUrls)
  } catch (error) {
    console.error('Get photos error:', error)
    return Errors.internal()
  }
})
