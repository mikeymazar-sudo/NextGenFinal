import { NextRequest } from 'next/server'
import { withAuth } from '@/lib/auth/middleware'
import { apiSuccess, Errors } from '@/lib/api/response'
import { createAdminClient } from '@/lib/supabase/server'
import { resolveMarketingActor } from '@/lib/marketing/actor'
import { requirePropertyOwnership } from '@/lib/marketing/ownership'

export const GET = withAuth(async (req: NextRequest, { user }) => {
    try {
        const { searchParams } = new URL(req.url)
        const propertyId = searchParams.get('propertyId')

        if (!propertyId) {
            return Errors.badRequest('propertyId is required.')
        }

        const supabase = createAdminClient()
        const actor = await resolveMarketingActor(user.id, { supabase, email: user.email })
        const propertyAccess = await requirePropertyOwnership(user.id, propertyId, {
            supabase,
            actor,
        })

        if (!propertyAccess.ok) {
            return propertyAccess.response
        }

        const { data: calls, error } = await supabase
            .from('calls')
            .select('*')
            .eq('property_id', propertyId)
            .order('created_at', { ascending: false })

        if (error) {
            console.error('Fetch calls error:', error)
            return Errors.internal('Failed to fetch calls.')
        }

        // Optional: Filter by user/team access if needed.
        // For now assuming any authenticated user can see calls for a property they have access to.

        return apiSuccess(calls)
    } catch (error) {
        console.error('Fetch calls error:', error)
        return Errors.internal()
    }
})
