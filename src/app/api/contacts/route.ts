import { NextRequest } from 'next/server'
import { z } from 'zod'
import { withAuth } from '@/lib/auth/middleware'
import { apiSuccess, Errors } from '@/lib/api/response'
import { createAdminClient } from '@/lib/supabase/server'
import { resolveMarketingActor } from '@/lib/marketing/actor'
import {
    consentMetadataFromFields,
    createDestinationEntry,
    normalizeContactRecord,
    normalizeDestinationEntries,
} from '@/lib/marketing/destination-consent'
import { requirePropertyOwnership } from '@/lib/marketing/ownership'

const AddContactSchema = z.object({
    propertyId: z.string().uuid(),
    type: z.enum(['phone', 'email']),
    value: z.string().min(1),
    label: z.string().optional(),
    consent_status: z.string().optional(),
    consent_source: z.string().optional(),
    consent_updated_at: z.string().nullable().optional(),
    consent_note: z.string().nullable().optional(),
})

export const GET = withAuth(async (req: NextRequest, { user }) => {
    try {
        const { searchParams } = new URL(req.url)
        const propertyId = searchParams.get('propertyId')

        if (!propertyId) {
            return Errors.badRequest('Missing required query param: propertyId')
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

        const { data: contacts, error: contactsError } = await supabase
            .from('contacts')
            .select('*')
            .eq('property_id', propertyId)

        if (contactsError) {
            console.error('Failed to fetch contacts:', contactsError)
            return Errors.internal(contactsError.message)
        }

        return apiSuccess((contacts || []).map((contact) => normalizeContactRecord(contact)))
    } catch (error) {
        console.error('Get contacts error:', error)
        return Errors.internal()
    }
})

export const POST = withAuth(async (req: NextRequest, { user }) => {
    try {
        const body = await req.json()
        const parsed = AddContactSchema.safeParse(body)

        if (!parsed.success) {
            return Errors.badRequest('Missing required fields: propertyId, type, value')
        }

        const { propertyId, type, value, label, consent_status, consent_source, consent_updated_at, consent_note } = parsed.data
        const supabase = createAdminClient()
        const actor = await resolveMarketingActor(user.id, { supabase, email: user.email })
        const now = new Date().toISOString()
        const consent = consentMetadataFromFields(
            {
                consent_status,
                consent_source,
                consent_updated_at,
                consent_note,
            },
            'manual',
            now
        )

        const propertyAccess = await requirePropertyOwnership(user.id, propertyId, {
            supabase,
            actor,
        })

        if (!propertyAccess.ok) {
            return propertyAccess.response
        }

        // Get existing contact for this property, or create a new one
        const { data: existingContact } = await supabase
            .from('contacts')
            .select('*')
            .eq('property_id', propertyId)
            .single()

        if (existingContact) {
            // Update existing contact
            const updateData: Record<string, unknown> = {}

            if (type === 'phone') {
                const currentPhones = normalizeDestinationEntries(existingContact.phone_numbers || [], 'sms')
                const newEntry = createDestinationEntry({
                    channel: 'sms',
                    value,
                    label: label || 'mobile',
                    isPrimary: currentPhones.length === 0,
                    consent,
                    defaultConsentSource: 'manual',
                })
                updateData.phone_numbers = [...currentPhones, newEntry]
            } else {
                const currentEmails = normalizeDestinationEntries(existingContact.emails || [], 'email')
                const newEntry = createDestinationEntry({
                    channel: 'email',
                    value,
                    label: label || 'personal',
                    isPrimary: currentEmails.length === 0,
                    consent,
                    defaultConsentSource: 'manual',
                })
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

            return apiSuccess(normalizeContactRecord(updated))
        } else {
            // Create new contact
            const newContact: Record<string, unknown> = {
                property_id: propertyId,
                name: null,
                phone_numbers:
                    type === 'phone'
                        ? [
                              createDestinationEntry({
                                  channel: 'sms',
                                  value,
                                  label: label || 'mobile',
                                  isPrimary: true,
                                  consent,
                                  defaultConsentSource: 'manual',
                              }),
                          ]
                        : [],
                emails:
                    type === 'email'
                        ? [
                              createDestinationEntry({
                                  channel: 'email',
                                  value,
                                  label: label || 'personal',
                                  isPrimary: true,
                                  consent,
                                  defaultConsentSource: 'manual',
                              }),
                          ]
                        : [],
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

            return apiSuccess(normalizeContactRecord(created))
        }
    } catch (error) {
        console.error('Add contact error:', error)
        return Errors.internal()
    }
})
