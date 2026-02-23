import { NextRequest } from 'next/server'
import { z } from 'zod'
import { withAuth } from '@/lib/auth/middleware'
import { apiSuccess, Errors } from '@/lib/api/response'
import { createAdminClient } from '@/lib/supabase/server'
import { DEFAULT_ANALYSIS_SETTINGS } from '@/types/schema'

const UpdateSettingsSchema = z.object({
  settings: z.record(z.string(), z.number()).refine(
    (obj) => Object.keys(obj).every((k) => k in DEFAULT_ANALYSIS_SETTINGS),
    { message: 'Invalid settings keys' }
  ),
})

// GET: Return user's analysis settings (or defaults)
export const GET = withAuth(async (_req: NextRequest, { user }) => {
  try {
    const supabase = createAdminClient()

    const { data } = await supabase
      .from('analysis_settings')
      .select('settings')
      .eq('user_id', user.id)
      .single()

    if (data?.settings) {
      // Merge with defaults so new keys are always present
      return apiSuccess({ ...DEFAULT_ANALYSIS_SETTINGS, ...data.settings })
    }

    return apiSuccess(DEFAULT_ANALYSIS_SETTINGS)
  } catch {
    return apiSuccess(DEFAULT_ANALYSIS_SETTINGS)
  }
})

// PUT: Update user's analysis settings
export const PUT = withAuth(async (req: NextRequest, { user }) => {
  try {
    const body = await req.json()
    const parsed = UpdateSettingsSchema.safeParse(body)

    if (!parsed.success) {
      return Errors.badRequest('Invalid settings data.')
    }

    const supabase = createAdminClient()

    // Get existing settings
    const { data: existing } = await supabase
      .from('analysis_settings')
      .select('settings')
      .eq('user_id', user.id)
      .single()

    const mergedSettings = {
      ...DEFAULT_ANALYSIS_SETTINGS,
      ...(existing?.settings || {}),
      ...parsed.data.settings,
    }

    // Upsert
    const { error } = await supabase
      .from('analysis_settings')
      .upsert(
        {
          user_id: user.id,
          settings: mergedSettings,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      )

    if (error) {
      console.error('Failed to save settings:', error)
      return Errors.internal()
    }

    return apiSuccess(mergedSettings)
  } catch (error) {
    console.error('Settings update error:', error)
    return Errors.internal()
  }
})
