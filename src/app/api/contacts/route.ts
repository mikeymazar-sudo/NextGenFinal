import { NextRequest } from 'next/server'
import { z } from 'zod'
import { withAuth } from '@/lib/auth/middleware'
import { apiSuccess, Errors } from '@/lib/api-response'
import { createAdminClient } from '@/lib/supabase/server'

const AddContactSchema = z.object({
    propertyId: z.string().uuid(),
    type: z.enum(['phone', 'email']),
    value: z.string().min(1),
    label: z.string().optional(),
})

export const POST = withAuth(async (req: NextRequest) => {
    try {
        const body = await req.json()
        const parsed = AddContactSchema.safeParse(body)

        if (!parsed.success) {
            return Errors.badRequest('Missing required fields: propertyId, type, value')
        }

        const { propertyId, type, value, label } = parsed.data
        const supabase = createAdminClient()

        // Verify the property exists
        const { data: property, error: propError } = await supabase
            .from('properties')
            .select('id')
            .eq('id', propertyId)
            .single()

        if (propError || !property) {
            return Errors.notFound('Property')
        }

        // Get existing contact for this property, or create a new one
        const { data: existingContact } = await supabase
            .from('contacts')
            .select('*')
            .eq('property_id', propertyId)
            .single()

        if (existingContact) {
            // Update existing contact
            let updateData: Record<string, unknown> = {}

            if (type === 'phone') {
                const currentPhones = existingContact.phone_numbers || []
                const newEntry = { value, label: label || 'mobile', is_primary: currentPhones.length === 0 }
                updateData.phone_numbers = [...currentPhones, newEntry]
            } else {
                const currentEmails = existingContact.emails || []
                const newEntry = { value, label: label || 'personal', is_primary: currentEmails.length === 0 }
                updateData.emails = [...currentEmails, newEntry]
            }

            const { data: updated, error: updateError } = await supabase
                .from('contacts')
                .update(updateData)
                .eq('id', existingContact.id)
                .select()
                .single()

            if (updateError) {
                console.error('Failed to update contact:', updateError)
                return Errors.internal(updateError.message)
            }

            return apiSuccess(updated)
        } else {
            // Create new contact
            const newContact: Record<string, unknown> = {
                property_id: propertyId,
                name: null,
                phone_numbers: type === 'phone' ? [{ value, label: label || 'mobile', is_primary: true }] : [],
                emails: type === 'email' ? [{ value, label: label || 'personal', is_primary: true }] : [],
            }

            const { data: created, error: createError } = await supabase
                .from('contacts')
                .insert(newContact)
                .select()
                .single()

            if (createError) {
                console.error('Failed to create contact:', createError)
                return Errors.internal(createError.message)
            }

            return apiSuccess(created)
        }
    } catch (error) {
        console.error('Add contact error:', error)
        return Errors.internal()
    }
})
