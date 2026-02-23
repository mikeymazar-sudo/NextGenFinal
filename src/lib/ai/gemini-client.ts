import { GoogleGenerativeAI, type Part } from '@google/generative-ai'

let client: GoogleGenerativeAI | null = null

export function getGeminiClient(): GoogleGenerativeAI {
  if (!client) {
    const key = process.env.GOOGLE_GEMINI_API_KEY
    if (!key) throw new Error('GOOGLE_GEMINI_API_KEY not set')
    client = new GoogleGenerativeAI(key)
  }
  return client
}

/**
 * Analyze one or more images with Gemini 2.5 Flash.
 * Returns structured JSON from the model.
 */
export async function analyzeImagesWithGemini(
  images: Array<{ base64: string; mimeType: string }>,
  prompt: string
): Promise<Record<string, unknown>> {
  const gemini = getGeminiClient()
  const model = gemini.getGenerativeModel({
    model: 'gemini-2.5-flash-preview-05-20',
    generationConfig: {
      temperature: 0.2,
      responseMimeType: 'application/json',
    },
  })

  const parts: Part[] = [
    { text: prompt },
    ...images.map((img) => ({
      inlineData: {
        mimeType: img.mimeType,
        data: img.base64,
      },
    })),
  ]

  const result = await model.generateContent(parts)
  const text = result.response.text()

  try {
    return JSON.parse(text)
  } catch {
    // If Gemini returns non-JSON, wrap it
    return { raw_response: text }
  }
}

/**
 * Prompt for analyzing subject property photos.
 * Returns a VisionAssessment-compatible JSON object.
 */
export const SUBJECT_PHOTO_PROMPT = `You are a real estate property inspector analyzing photos of a property.
Analyze all provided images and return a single JSON object with this exact structure:

{
  "condition_rating": <number 1-10, where 1=uninhabitable, 5=average, 10=pristine>,
  "condition_label": "<one of: poor, fair, average, good, excellent>",
  "visible_issues": ["<list of specific issues you can see, e.g. 'roof shingles curling', 'water stain on ceiling'>"],
  "repair_items": [
    {
      "item": "<specific repair needed>",
      "category": "<one of: structural, roof, plumbing, electrical, hvac, cosmetic, landscaping, other>",
      "estimated_cost_low": <number in USD>,
      "estimated_cost_high": <number in USD>,
      "urgency": "<one of: immediate, short_term, cosmetic>"
    }
  ],
  "overall_notes": "<2-3 sentence summary of property condition>",
  "curb_appeal_score": <number 1-10>
}

Be specific about what you SEE. Don't guess about things not visible. Estimate repair costs conservatively.
If an image shows the exterior, assess curb appeal. If interior, focus on finishes, fixtures, and damage.
Combine all photos into ONE assessment. List ALL visible repair items with cost ranges.`

/**
 * Prompt for analyzing comp property images.
 * Returns a comparison-ready assessment.
 */
export const COMP_PHOTO_PROMPT = `You are a real estate appraiser comparing property conditions.
Analyze the provided comp property images and return a JSON object:

{
  "condition_rating": <number 1-10>,
  "condition_label": "<one of: poor, fair, average, good, excellent>",
  "visible_features": ["<notable features like 'updated kitchen', 'new roof', 'pool'>"],
  "visible_issues": ["<any visible problems>"],
  "overall_notes": "<1-2 sentence condition summary>",
  "price_justified": <boolean - does the condition appear to justify the price?>,
  "price_justification_notes": "<brief explanation of why price is or isn't justified by condition>"
}

Focus on features that would affect market value. Be specific about visible quality indicators.`
