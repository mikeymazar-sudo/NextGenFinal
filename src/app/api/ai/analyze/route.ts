import { NextRequest } from 'next/server'
import { z } from 'zod'
import { withAuth } from '@/lib/auth/middleware'
import { checkRateLimit } from '@/lib/api/rate-limit'
import { apiSuccess, Errors } from '@/lib/api/response'
import { createAdminClient } from '@/lib/supabase/server'
import { normalizePropertyData } from '@/lib/property/data-utils'
import { buildAnalysisPrompt } from '@/lib/ai/prompt-builder'
import { DEFAULT_ANALYSIS_SETTINGS } from '@/types/schema'
import type { AnalysisSettings } from '@/types/schema'

const AnalyzeSchema = z.object({
  propertyId: z.string().uuid(),
  overrides: z.record(z.string(), z.number()).optional(),
  force: z.boolean().optional(),
})

async function getOpenAIClient() {
  const { default: OpenAI } = await import('openai')
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
}

export const POST = withAuth(async (req: NextRequest, { user }) => {
  try {
    const body = await req.json()
    const parsed = AnalyzeSchema.safeParse(body)

    if (!parsed.success) {
      return Errors.badRequest('Invalid property ID.')
    }

    const { propertyId, overrides, force } = parsed.data

    // Rate limit check
    const { allowed } = await checkRateLimit(user.id, 'ai-analyze')
    if (!allowed) return Errors.rateLimited()

    const supabase = createAdminClient()

    // ─── Fetch ALL data in parallel ───
    const [
      propertyRes,
      settingsRes,
      transcriptsRes,
      messagesRes,
      notesRes,
      photosRes,
    ] = await Promise.all([
      // Property record
      supabase.from('properties').select('*').eq('id', propertyId).single(),
      // User settings
      supabase.from('analysis_settings').select('settings').eq('user_id', user.id).single(),
      // Call transcripts
      supabase
        .from('calls')
        .select('transcript, created_at, duration')
        .eq('property_id', propertyId)
        .not('transcript', 'is', null)
        .order('created_at', { ascending: false })
        .limit(10),
      // SMS messages
      supabase
        .from('messages')
        .select('body, direction, created_at')
        .eq('property_id', propertyId)
        .order('created_at', { ascending: false })
        .limit(50),
      // Notes
      supabase
        .from('notes')
        .select('content, created_at')
        .eq('property_id', propertyId)
        .order('created_at', { ascending: false })
        .limit(20),
      // Property photos with vision assessments
      supabase
        .from('property_photos')
        .select('vision_assessment')
        .eq('property_id', propertyId)
        .not('vision_assessment', 'is', null),
    ])

    if (propertyRes.error || !propertyRes.data) {
      return Errors.notFound('Property')
    }

    const property = propertyRes.data

    // Check cache: return if analysis is <7 days old (unless forced)
    if (!force && property.ai_analysis && property.ai_analyzed_at) {
      const analyzedAt = new Date(property.ai_analyzed_at)
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      if (analyzedAt > sevenDaysAgo) {
        return apiSuccess(property.ai_analysis, true)
      }
    }

    // ─── Merge settings: defaults < user settings < per-deal overrides ───
    const userSettings = settingsRes.data?.settings || {}
    const mergedSettings: AnalysisSettings = {
      ...DEFAULT_ANALYSIS_SETTINGS,
      ...userSettings,
      ...(overrides || {}),
      ...(property.analysis_overrides || {}),
    }

    // ─── Normalize property data ───
    const rawData = property.raw_attom_data || property.raw_realestate_data
    const normalizedData = rawData ? normalizePropertyData(rawData) : null

    // ─── Extract comps ───
    const soldComps = property.sold_data?.comparables || []
    const rentalComps = property.rental_data?.comparables || []

    // ─── Build vision assessment summaries ───
    const visionAssessments: Array<{ type: 'subject' | 'comp'; address?: string; summary: string }> = []

    // Subject property photos
    if (photosRes.data && photosRes.data.length > 0) {
      const assessments = photosRes.data
        .map((p: any) => p.vision_assessment)
        .filter(Boolean)

      if (assessments.length > 0) {
        const avgCondition = Math.round(
          assessments.reduce((s: number, a: any) => s + (a.condition_rating || 5), 0) / assessments.length
        )
        const allIssues = assessments.flatMap((a: any) => a.visible_issues || [])
        const allRepairs = assessments.flatMap((a: any) => a.repair_items || [])
        const totalRepairLow = allRepairs.reduce((s: number, r: any) => s + (r.estimated_cost_low || 0), 0)
        const totalRepairHigh = allRepairs.reduce((s: number, r: any) => s + (r.estimated_cost_high || 0), 0)

        visionAssessments.push({
          type: 'subject',
          summary: `Overall Condition: ${avgCondition}/10 | Issues: ${allIssues.slice(0, 10).join(', ')} | Photo-Based Repair Estimate: $${totalRepairLow.toLocaleString()}-$${totalRepairHigh.toLocaleString()} | ${assessments.length} photos analyzed`,
        })
      }
    }

    // Comp images
    const { data: compImages } = await supabase
      .from('comp_images')
      .select('comp_address, vision_assessment')
      .eq('property_id', propertyId)
      .not('vision_assessment', 'is', null)

    if (compImages && compImages.length > 0) {
      // Group by comp address
      const byAddress = new Map<string, any[]>()
      for (const ci of compImages) {
        const existing = byAddress.get(ci.comp_address) || []
        existing.push(ci.vision_assessment)
        byAddress.set(ci.comp_address, existing)
      }

      for (const [address, assessments] of byAddress) {
        const avgCond = Math.round(
          assessments.reduce((s: number, a: any) => s + (a.condition_rating || 5), 0) / assessments.length
        )
        const features = assessments.flatMap((a: any) => a.visible_features || a.visible_issues || []).slice(0, 5)
        const justified = assessments.some((a: any) => a.price_justified)
        visionAssessments.push({
          type: 'comp',
          address,
          summary: `Condition ${avgCond}/10 | ${features.join(', ')} | Price ${justified ? 'justified' : 'questionable'}`,
        })
      }
    }

    // ─── Build the full prompt ───
    const prompt = buildAnalysisPrompt({
      property,
      normalizedData,
      soldComps,
      rentalComps,
      callTranscripts: (transcriptsRes.data || []).filter((t: any) => t.transcript),
      smsMessages: (messagesRes.data || []).reverse(), // chronological order
      notes: notesRes.data || [],
      settings: mergedSettings,
      visionAssessments: visionAssessments.length > 0 ? visionAssessments : undefined,
    })

    // ─── Call OpenAI ───
    const openai = await getOpenAIClient()
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      response_format: { type: 'json_object' },
    })

    const analysisText = completion.choices[0]?.message?.content
    if (!analysisText) {
      return Errors.externalApi('OpenAI', 'No response from AI')
    }

    const analysis = JSON.parse(analysisText)

    // ─── Save analysis + overrides to property ───
    const updatePayload: Record<string, unknown> = {
      ai_analysis: analysis,
      ai_analyzed_at: new Date().toISOString(),
    }

    if (overrides && Object.keys(overrides).length > 0) {
      updatePayload.analysis_overrides = {
        ...(property.analysis_overrides || {}),
        ...overrides,
      }
    }

    const { error: updateError } = await supabase
      .from('properties')
      .update(updatePayload)
      .eq('id', propertyId)

    if (updateError) {
      console.error('Failed to save analysis:', updateError)
    }

    return apiSuccess(analysis, false)
  } catch (error) {
    console.error('AI analysis error:', error)
    return Errors.internal()
  }
})
