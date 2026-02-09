import { NextRequest } from 'next/server'
import { z } from 'zod'
import { withAuth } from '@/lib/auth/middleware'
import { apiSuccess, Errors } from '@/lib/api-response'
import { createAdminClient } from '@/lib/supabase/server'

interface PhoneEntry {
    value: string
    label: string
    is_primary: boolean
}

interface EmailEntry {
    value: string
    label: string
    is_primary: boolean
}

const UpdateContactSchema = z.object({
    type: z.enum(['phone', 'email']),
    index: z.number().int().min(0),
    value: z.string().optional(),
    label: z.string().optional(),
    is_primary: z.boolean().optional(),
})

export const PATCH = withAuth(async (
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) => {
    try {
        const { id } = await params
        const body = await req.json()
        const parsed = UpdateContactSchema.safeParse(body)

        if (!parsed.success) {
            return Errors.badRequest('Missing required fields: type, index')
        }

        const { type, index, value, label, is_primary } = parsed.data
        const supabase = createAdminClient()

        // Get the contact
        const { data: contact, error: fetchError } = await supabase
            .from('contacts')
            .select('*')
            .eq('id', id)
            .single()

        if (fetchError || !contact) {
            return Errors.notFound('Contact')
        }

        let updateData: Record<string, unknown> = {}

        if (type === 'phone') {
            const phones: PhoneEntry[] = [...(contact.phone_numbers || [])]
            if (index < 0 || index >= phones.length) {
                return Errors.badRequest('Invalid index')
            }

            // If setting as primary, unset all others
            if (is_primary) {
                phones.forEach(p => p.is_primary = false)
            }

            phones[index] = {
                ...phones[index],
                ...(value !== undefined && { value }),
                ...(label !== undefined && { label }),
                ...(is_primary !== undefined && { is_primary }),
            }
            updateData.phone_numbers = phones
        } else {
            const emails: EmailEntry[] = [...(contact.emails || [])]
            if (index < 0 || index >= emails.length) {
                return Errors.badRequest('Invalid index')
            }

            // If setting as primary, unset all others
            if (is_primary) {
                emails.forEach(e => e.is_primary = false)
            }

            emails[index] = {
                ...emails[index],
                ...(value !== undefined && { value }),
                ...(label !== undefined && { label }),
                ...(is_primary !== undefined && { is_primary }),
            }
            updateData.emails = emails
        }

        const { data: updated, error: updateError } = await supabase
            .from('contacts')
            .update(updateData)
            .eq('id', id)
            .select()
            .single()

        if (updateError) {
            console.error('Failed to update contact:', updateError)
            return Errors.internal(updateError.message)
        }

        return apiSuccess(updated)
    } catch (error) {
        console.error('Update contact error:', error)
        return Errors.internal()
    }
})

export const DELETE = withAuth(async (
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) => {
    try {
        const { id } = await params
        const { searchParams } = new URL(req.url)
        const type = searchParams.get('type')
        const index = parseInt(searchParams.get('index') || '-1', 10)

        if (!type || (type !== 'phone' && type !== 'email') || index < 0) {
            return Errors.badRequest('Missing required query params: type, index')
        }

        const supabase = createAdminClient()

        // Get the contact
        const { data: contact, error: fetchError } = await supabase
            .from('contacts')
            .select('*')
            .eq('id', id)
            .single()

        if (fetchError || !contact) {
            return Errors.notFound('Contact')
        }

        let updateData: Record<string, unknown> = {}

        if (type === 'phone') {
            const phones: PhoneEntry[] = [...(contact.phone_numbers || [])]
            if (index >= phones.length) {
                return Errors.badRequest('Invalid index')
            }

            const wasDeleted = phones[index]
            phones.splice(index, 1)

            // If we deleted the primary, make the first one primary
            if (wasDeleted.is_primary && phones.length > 0) {
                phones[0].is_primary = true
            }

            updateData.phone_numbers = phones
        } else {
            const emails: EmailEntry[] = [...(contact.emails || [])]
            if (index >= emails.length) {
                return Errors.badRequest('Invalid index')
            }

            const wasDeleted = emails[index]
            emails.splice(index, 1)

            // If we deleted the primary, make the first one primary
            if (wasDeleted.is_primary && emails.length > 0) {
                emails[0].is_primary = true
            }

            updateData.emails = emails
        }

        const { data: updated, error: updateError } = await supabase
            .from('contacts')
            .update(updateData)
            .eq('id', id)
            .select()
            .single()

        if (updateError) {
            console.error('Failed to delete contact entry:', updateError)
            return Errors.internal(updateError.message)
        }

        return apiSuccess(updated)
    } catch (error) {
        console.error('Delete contact error:', error)
        return Errors.internal()
    }
})
