import { NextRequest } from 'next/server'
import { z } from 'zod'
import { withAuth } from '@/lib/auth/middleware'
import { checkRateLimit } from '@/lib/api/rate-limit'
import { apiSuccess, Errors } from '@/lib/api/response'
import { createAdminClient } from '@/lib/supabase/server'
import { analyzeImagesWithGemini, COMP_PHOTO_PROMPT } from '@/lib/ai/gemini-client'

const VisionCompsSchema = z.object({
  propertyId: z.string().uuid(),
})

export const POST = withAuth(async (req: NextRequest, { user }) => {
  try {
    const body = await req.json()
    const parsed = VisionCompsSchema.safeParse(body)

    if (!parsed.success) {
      return Errors.badRequest('Invalid request data.')
    }

    const { propertyId } = parsed.data

    // Rate limit
    const { allowed } = await checkRateLimit(user.id, 'ai-vision')
    if (!allowed) return Errors.rateLimited()

    const supabase = createAdminClient()

    // Fetch all comp images
    const { data: compImages, error: fetchError } = await supabase
      .from('comp_images')
      .select('id, comp_address, comp_type, image_type, storage_path')
      .eq('property_id', propertyId)
      .is('vision_assessment', null) // Only analyze images without assessments

    if (fetchError || !compImages || compImages.length === 0) {
      return Errors.badRequest('No unanalyzed comp images found.')
    }

    // Group by comp address
    const byAddress = new Map<string, typeof compImages>()
    for (const img of compImages) {
      const existing = byAddress.get(img.comp_address) || []
      existing.push(img)
      byAddress.set(img.comp_address, existing)
    }

    const results: Record<string, unknown> = {}

    // Analyze each comp's images
    for (const [address, images] of byAddress) {
      try {
        // Download images from storage
        const imagePromises = images.map(async (img) => {
          if (!img.storage_path) return null

          const { data: fileData, error: dlError } = await supabase.storage
            .from('comp-images')
            .download(img.storage_path)

          if (dlError || !fileData) return null

          const arrayBuffer = await fileData.arrayBuffer()
          const base64 = Buffer.from(arrayBuffer).toString('base64')

          return { base64, mimeType: 'image/jpeg', id: img.id }
        })

        const imageResults = (await Promise.all(imagePromises)).filter(Boolean) as Array<{
          base64: string
          mimeType: string
          id: string
        }>

        if (imageResults.length === 0) continue

        // Send to Gemini
        const assessment = await analyzeImagesWithGemini(
          imageResults.map((img) => ({ base64: img.base64, mimeType: img.mimeType })),
          `${COMP_PHOTO_PROMPT}\n\nThis comp is located at: ${address}`
        )

        // Save assessment to all images for this comp
        const imageIds = imageResults.map((img) => img.id)
        await supabase
          .from('comp_images')
          .update({ vision_assessment: assessment })
          .in('id', imageIds)

        results[address] = assessment
      } catch (error) {
        console.error(`Vision analysis failed for comp ${address}:`, error)
        results[address] = { error: 'Analysis failed' }
      }
    }

    return apiSuccess(results)
  } catch (error) {
    console.error('Vision comps error:', error)
    return Errors.internal()
  }
})
