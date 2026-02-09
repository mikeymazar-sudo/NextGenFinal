import { NextRequest } from 'next/server'
import { z } from 'zod'
import OpenAI from 'openai'
import { withAuth } from '@/lib/auth/middleware'
import { checkRateLimit } from '@/lib/rate-limit'
import { apiSuccess, Errors } from '@/lib/api-response'
import { createAdminClient } from '@/lib/supabase/server'

const AnalyzeSchema = z.object({
  propertyId: z.string().uuid(),
})

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export const POST = withAuth(async (req: NextRequest, { user }) => {
  try {
    const body = await req.json()
    const parsed = AnalyzeSchema.safeParse(body)

    if (!parsed.success) {
      return Errors.badRequest('Invalid property ID.')
    }

    const { propertyId } = parsed.data

    // Rate limit check
    const { allowed } = await checkRateLimit(user.id, 'ai-analyze')
    if (!allowed) return Errors.rateLimited()

    const supabase = createAdminClient()

    // Fetch property
    const { data: property, error } = await supabase
      .from('properties')
      .select('*')
      .eq('id', propertyId)
      .single()

    if (error || !property) {
      return Errors.notFound('Property')
    }

    // Check cache: return if analysis is <7 days old
    if (property.ai_analysis && property.ai_analyzed_at) {
      const analyzedAt = new Date(property.ai_analyzed_at)
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      if (analyzedAt > sevenDaysAgo) {
        return apiSuccess(property.ai_analysis, true)
      }
    }

    // Build prompt
    const rentalInfo = property.rental_data
      ? `\nRental Data: Estimated rent $${property.rental_data.rent}/month (range: $${property.rental_data.rentRangeLow}-$${property.rental_data.rentRangeHigh})`
      : '\nNo rental data available.'

    const prompt = `You are a conservative real estate wholesale deal analyst. Analyze this property for a wholesale deal.

Property Details:
- Address: ${property.address}, ${property.city}, ${property.state} ${property.zip}
- Listed/Assessed Price: ${property.list_price ? `$${property.list_price}` : 'Unknown'}
- Bedrooms: ${property.bedrooms || 'Unknown'}
- Bathrooms: ${property.bathrooms || 'Unknown'}
- Square Feet: ${property.sqft || 'Unknown'}
- Year Built: ${property.year_built || 'Unknown'}
- Lot Size: ${property.lot_size || 'Unknown'}
- Property Type: ${property.property_type || 'Unknown'}
${rentalInfo}

Provide a JSON analysis with these exact fields:
{
  "arv": <number - After Repair Value estimate>,
  "arv_reasoning": "<string - brief explanation of ARV estimate>",
  ${property.rental_data ? '"rental_arv": <number - value based on rental income using cap rate>,' : ''}
  ${property.rental_data ? '"rental_arv_reasoning": "<string - explanation of rental-based valuation>",' : ''}
  "repair_estimate": <number - total estimated repair cost>,
  "repair_breakdown": { "<category>": <cost>, ... },
  "max_allowable_offer": <number - using 70% rule: ARV * 0.7 - repairs>,
  "deal_grade": "<A|B|C|D|F>",
  "risk_factors": ["<string>", ...],
  "recommendation": "<string - 2-3 sentence recommendation>",
  "confidence": "<low|medium|high>"
}

Be conservative. Only respond with valid JSON, no markdown.`

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

    // Save analysis to property
    const { error: updateError } = await supabase
      .from('properties')
      .update({
        ai_analysis: analysis,
        ai_analyzed_at: new Date().toISOString(),
      })
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
