import { createAdminClient } from '@/lib/supabase/server'

interface RateLimitConfig {
  maxCalls: number
  windowMinutes: number
}

const RATE_LIMITS: Record<string, RateLimitConfig> = {
  'property-lookup': { maxCalls: 50, windowMinutes: 60 },
  'ai-analyze': { maxCalls: 20, windowMinutes: 60 },
  'skip-trace': { maxCalls: 30, windowMinutes: 60 },
  'rental-comps': { maxCalls: 50, windowMinutes: 60 },
  'send-email': { maxCalls: 100, windowMinutes: 60 },
}

export async function checkRateLimit(
  userId: string,
  endpoint: string
): Promise<{ allowed: boolean; remaining?: number }> {
  const config = RATE_LIMITS[endpoint]
  if (!config) return { allowed: true }

  const supabase = createAdminClient()

  const { data } = await supabase.rpc('check_rate_limit', {
    p_user_id: userId,
    p_endpoint: endpoint,
    p_max_calls: config.maxCalls,
    p_window_minutes: config.windowMinutes,
  })

  if (!data) {
    return { allowed: false }
  }

  await supabase.from('api_usage').insert({
    user_id: userId,
    endpoint,
  })

  return { allowed: true }
}
