import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/auth/middleware'
import { apiSuccess, Errors } from '@/lib/api/response'
import { createAdminClient } from '@/lib/supabase/server'

export const GET = withAuth(async (req: NextRequest, { user }) => {
  try {
    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status')
    const view = searchParams.get('view') || 'mine'
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100)
    const offset = parseInt(searchParams.get('offset') || '0')
    const sortBy = searchParams.get('sortBy') || 'created_at'
    const sortOrder = searchParams.get('sortOrder') === 'asc' ? true : false

    const supabase = createAdminClient()

    // Get user profile for team access
    const { data: profile } = await supabase
      .from('profiles')
      .select('team_id, role')
      .eq('id', user.id)
      .single()

    let query = supabase
      .from('properties')
      .select('*', { count: 'exact' })

    if (view === 'team' && profile?.team_id && profile?.role === 'admin') {
      query = query.eq('team_id', profile.team_id)
    } else {
      query = query.eq('created_by', user.id)
    }

    if (status && status !== 'all') {
      query = query.eq('status', status)
    }

    const allowedSorts = ['created_at', 'list_price', 'address', 'updated_at']
    const safeSort = allowedSorts.includes(sortBy) ? sortBy : 'created_at'

    query = query
      .order(safeSort, { ascending: sortOrder })
      .range(offset, offset + limit - 1)

    const { data, error, count } = await query

    if (error) {
      console.error('Properties list error:', error)
      return Errors.internal(error.message)
    }

    return apiSuccess({ properties: data || [], total: count || 0, limit, offset })
  } catch (error) {
    console.error('Properties list error:', error)
    return Errors.internal()
  }
})
