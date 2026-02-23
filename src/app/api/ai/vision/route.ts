import { NextRequest } from 'next/server'
import { z } from 'zod'
import { withAuth } from '@/lib/auth/middleware'
import { checkRateLimit } from '@/lib/api/rate-limit'
import { apiSuccess, Errors } from '@/lib/api/response'
import { createAdminClient } from '@/lib/supabase/server'
import { analyzeImagesWithGemini, SUBJECT_PHOTO_PROMPT } from '@/lib/ai/gemini-client'
import type { VisionAssessment } from '@/types/schema'

const VisionSchema = z.object({
  propertyId: z.string().uuid(),
  photoIds: z.array(z.string().uuid()).optional(), // If omitted, analyze all photos
})

export const POST = withAuth(async (req: NextRequest, { user }) => {
  try {
    const body = await req.json()
    const parsed = VisionSchema.safeParse(body)

    if (!parsed.success) {
      return Errors.badRequest('Invalid request data.')
    }

    const { propertyId, photoIds } = parsed.data

    // Rate limit
    const { allowed } = await checkRateLimit(user.id, 'ai-vision')
    if (!allowed) return Errors.rateLimited()

    const supabase = createAdminClient()

    // Fetch photos
    let query = supabase
      .from('property_photos')
      .select('id, storage_path, filename')
      .eq('property_id', propertyId)
      .order('display_order', { ascending: true })

    if (photoIds && photoIds.length > 0) {
      query = query.in('id', photoIds)
    }

    const { data: photos, error: fetchError } = await query

    if (fetchError || !photos || photos.length === 0) {
      return Errors.badRequest('No photos found for this property.')
    }

    // Download photos from storage as base64
    const imagePromises = photos.map(async (photo) => {
      const { data: fileData, error: dlError } = await supabase.storage
        .from('property-photos')
        .download(photo.storage_path)

      if (dlError || !fileData) {
        console.error(`Failed to download ${photo.storage_path}:`, dlError)
        return null
      }

      const arrayBuffer = await fileData.arrayBuffer()
      const base64 = Buffer.from(arrayBuffer).toString('base64')
      const ext = photo.filename.split('.').pop()?.toLowerCase() || 'jpg'
      const mimeType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg'

      return { base64, mimeType, id: photo.id }
    })

    const imageResults = (await Promise.all(imagePromises)).filter(Boolean) as Array<{
      base64: string
      mimeType: string
      id: string
    }>

    if (imageResults.length === 0) {
      return Errors.badRequest('Could not download any photos.')
    }

    // Send to Gemini in batches (max 10 images at a time to avoid limits)
    const BATCH_SIZE = 10
    const allAssessments: VisionAssessment[] = []

    for (let i = 0; i < imageResults.length; i += BATCH_SIZE) {
      const batch = imageResults.slice(i, i + BATCH_SIZE)
      const batchImages = batch.map((img) => ({
        base64: img.base64,
        mimeType: img.mimeType,
      }))

      const assessment = (await analyzeImagesWithGemini(
        batchImages,
        SUBJECT_PHOTO_PROMPT
      )) as unknown as VisionAssessment

      allAssessments.push(assessment)

      // Save assessment to each photo in this batch
      const photoIds = batch.map((img) => img.id)
      await supabase
        .from('property_photos')
        .update({ vision_assessment: assessment as unknown as Record<string, unknown> })
        .in('id', photoIds)
    }

    // Compute aggregate
    const aggregate = computeAggregate(allAssessments)

    return apiSuccess({
      assessments: allAssessments,
      aggregate,
      photosAnalyzed: imageResults.length,
    })
  } catch (error) {
    console.error('Vision analysis error:', error)
    return Errors.internal()
  }
})

function computeAggregate(assessments: VisionAssessment[]) {
  if (assessments.length === 0) return null

  const avgCondition =
    Math.round(
      assessments.reduce((sum, a) => sum + (a.condition_rating || 5), 0) / assessments.length
    )

  const allIssues = assessments.flatMap((a) => a.visible_issues || [])
  const allRepairs = assessments.flatMap((a) => a.repair_items || [])

  const totalRepairLow = allRepairs.reduce((s, r) => s + (r.estimated_cost_low || 0), 0)
  const totalRepairHigh = allRepairs.reduce((s, r) => s + (r.estimated_cost_high || 0), 0)

  const avgCurbAppeal =
    assessments.filter((a) => a.curb_appeal_score).length > 0
      ? Math.round(
          assessments
            .filter((a) => a.curb_appeal_score)
            .reduce((s, a) => s + (a.curb_appeal_score || 0), 0) /
            assessments.filter((a) => a.curb_appeal_score).length
        )
      : null

  // Group repairs by category
  const repairsByCategory: Record<string, { low: number; high: number; items: string[] }> = {}
  for (const repair of allRepairs) {
    const cat = repair.category || 'other'
    if (!repairsByCategory[cat]) {
      repairsByCategory[cat] = { low: 0, high: 0, items: [] }
    }
    repairsByCategory[cat].low += repair.estimated_cost_low || 0
    repairsByCategory[cat].high += repair.estimated_cost_high || 0
    repairsByCategory[cat].items.push(repair.item)
  }

  return {
    condition_rating: avgCondition,
    condition_label: getConditionLabel(avgCondition),
    total_repair_low: totalRepairLow,
    total_repair_high: totalRepairHigh,
    repair_midpoint: Math.round((totalRepairLow + totalRepairHigh) / 2),
    unique_issues: [...new Set(allIssues)],
    repairs_by_category: repairsByCategory,
    curb_appeal_score: avgCurbAppeal,
    total_repairs_count: allRepairs.length,
  }
}

function getConditionLabel(rating: number): string {
  if (rating <= 2) return 'poor'
  if (rating <= 4) return 'fair'
  if (rating <= 6) return 'average'
  if (rating <= 8) return 'good'
  return 'excellent'
}
