import { randomUUID } from 'crypto';
import { NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { withAuth } from '@/lib/auth/middleware';
import { Errors, apiSuccess } from '@/lib/api/response';
import { resolveMarketingActor } from '@/lib/marketing/actor';
import { buildMarketingImportAudienceMetadata } from '@/lib/marketing/import-audience';

type ImportedPropertyRow = Record<string, string | undefined>;
type ImportedContactEntry = {
    value: string;
    label: string;
    is_primary: boolean;
};
type ImportedContactInsert = {
    property_id: string;
    name: string | null;
    phone_numbers: ImportedContactEntry[];
    emails: ImportedContactEntry[];
};
type UpsertedPropertyRow = {
    id: string;
    address: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
};

function collectUniquePhones(row: ImportedPropertyRow): string[] {
    const rawPhones = [row.owner_phone, row.phone_1, row.phone_2, row.phone_3]
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value));

    const validPhones = rawPhones.filter((value) => {
        const digits = value.replace(/\D/g, '');
        return digits.length >= 7 && digits.length <= 15;
    });

    return [...new Set(validPhones)].slice(0, 3);
}

function collectUniqueEmails(row: ImportedPropertyRow): string[] {
    const rawEmails = [row.owner_email, row.email_1, row.email_2, row.email_3]
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value));

    const validEmails = rawEmails.filter((value) => value.includes('@'));

    return [...new Set(validEmails)].slice(0, 3);
}

export const POST = withAuth(async (req: NextRequest, { user }) => {
	    try {
	        const body = await req.json();
	        const { properties, listName } = body;

        if (!properties || !Array.isArray(properties) || properties.length === 0) {
            return Errors.badRequest('No properties provided');
        }

	        const importedProperties = properties as ImportedPropertyRow[];

	        const supabase = createAdminClient();
	        const actor = await resolveMarketingActor(user.id, {
	            supabase,
	            email: user.email ?? null,
	        });
	        const importBatchId = randomUUID();
	        const importedAt = new Date().toISOString();

	        // 2. If listName provided, create the list
	        let listId: string | undefined;
	        if (listName) {
	            const { data: list, error: listError } = await supabase
	                .from('lead_lists')
	                .insert({
	                    name: listName,
	                    created_by: user.id,
	                    team_id: actor.teamId,
	                })
	                .select('id')
	                .single();

            if (listError) {
                console.error('List creation error:', listError);
                // Continue without list if failing (or you could abort)
            } else {
                listId = list.id;
            }
        }

        // 3. Process in batches
        let imported = 0;
        const skipped = 0;
        let errors = 0;
        const allPropertyIds: string[] = [];

        const batchSize = 100;
	        for (let i = 0; i < importedProperties.length; i += batchSize) {
	            const batch = importedProperties.slice(i, i + batchSize);

	            const rows = batch.map((p: ImportedPropertyRow) => {
	                const uniquePhones = collectUniquePhones(p);
	                const uniqueEmails = collectUniqueEmails(p);
	                const primaryPhone = uniquePhones[0] || null;
	                const primaryEmail = uniqueEmails[0] || null;
	                const marketingImport = buildMarketingImportAudienceMetadata(
	                    p,
	                    {
	                        importBatchId,
	                        ownerUserId: actor.id,
	                        ownerTeamId: actor.teamId,
	                        ownerFullName: actor.fullName,
	                        listId: listId ?? null,
	                        listName: listName ?? null,
	                        importedAt,
	                    },
	                    {
	                        uniquePhones,
	                        uniqueEmails,
	                    }
	                );

	                // Construct the raw_realestate_data JSON to match NormalizedPropertyData structure
	                // This will allow the UI to automatically render these fields and keep the import
	                // source explicit for campaign audience rebuilds.
	                const rawData = {
	                    data: {
	                        propertyInfo: {
                            address: {
                                street: p.address,
                                city: p.city,
                                state: p.state,
                                zip: p.zip,
                            },
                            propertyType: p.property_type,
                            bedrooms: p.bedrooms ? Number(p.bedrooms) : undefined,
                            bathrooms: p.bathrooms ? Number(p.bathrooms) : undefined,
                            livingSquareFeet: p.sqft ? Number(p.sqft) : undefined,
                            yearBuilt: p.year_built ? Number(p.year_built) : undefined,
                            stories: p.stories ? Number(p.stories) : undefined,
                            unitsCount: p.units_count ? Number(p.units_count) : undefined,
                            garageType: p.garage_type,
                            garageSquareFeet: p.garage_sqft ? Number(p.garage_sqft) : undefined,
                            basementType: p.basement_type,
                            pool: p.pool === 'Yes' || p.pool === 'true' || p.pool === '1',
                            construction: p.construction_type,
                            buildingCondition: p.condition,
                            heatingType: p.heating_type,
                            airConditioningType: p.cooling_type,
                            roofType: p.roof_type,
                        },
                        lotInfo: {
                            lotSquareFeet: p.lot_size ? Number(p.lot_size) : undefined,
                            lotAcres: p.lot_acres ? Number(p.lot_acres) : undefined,
                            apn: p.apn,
                            zoning: p.zoning,
                            landUse: p.land_use,
                            subdivision: p.subdivision,
                            legalDescription: p.legal_description,
                        },
                        ownerInfo: {
                            owner1FullName: p.owner_name,
                            owner2FullName: p.owner2_name,
                            phone: primaryPhone,
                            email: primaryEmail,
                            ownerOccupied: p.owner_occupied === 'Yes' || p.owner_occupied === 'true' || p.owner_occupied === '1',
                            absenteeOwner: p.absentee_owner === 'Yes' || p.absentee_owner === 'true' || p.absentee_owner === '1',
                            corporateOwned: p.corporate_owned === 'Yes' || p.corporate_owned === 'true' || p.corporate_owned === '1',
                            mailAddress: {
                                street: p.mailing_street || p.mailing_address, // Fallback if full address provided
                                city: p.mailing_city,
                                state: p.mailing_state,
                                zip: p.mailing_zip,
                            }
                        },
                        taxInfo: {
                            taxAmount: p.tax_amount ? Number(p.tax_amount.replace(/[^0-9.]/g, '')) : undefined,
                            taxYear: p.tax_year ? Number(p.tax_year) : undefined,
                            assessedValue: p.assessed_value ? Number(p.assessed_value.replace(/[^0-9.]/g, '')) : undefined,
                            assessedLand: p.assessed_land ? Number(p.assessed_land.replace(/[^0-9.]/g, '')) : undefined,
                            assessedImprovement: p.assessed_improvement ? Number(p.assessed_improvement.replace(/[^0-9.]/g, '')) : undefined,
                            marketValue: p.market_value ? Number(p.market_value.replace(/[^0-9.]/g, '')) : undefined,
                            marketLand: p.market_land ? Number(p.market_land.replace(/[^0-9.]/g, '')) : undefined,
                            marketImprovement: p.market_improvement ? Number(p.market_improvement.replace(/[^0-9.]/g, '')) : undefined,
                        },
                        lastSale: {
                            saleDate: p.last_sale_date,
                            saleAmount: p.last_sale_price ? Number(p.last_sale_price.replace(/[^0-9.]/g, '')) : undefined,
                        },
                        mortgage: {
                            amount: p.mortgage_amount ? Number(p.mortgage_amount.replace(/[^0-9.]/g, '')) : undefined,
                            lender: p.mortgage_lender,
                            date: p.mortgage_date,
                            rate: p.mortgage_rate ? Number(p.mortgage_rate.replace(/[^0-9.]/g, '')) : undefined,
                            term: p.mortgage_term,
                            type: p.mortgage_type,
                        },
                        estimatedValue: p.estimated_value ? Number(p.estimated_value.replace(/[^0-9.]/g, '')) : undefined,
                        estimatedEquity: p.estimated_equity ? Number(p.estimated_equity.replace(/[^0-9.]/g, '')) : undefined,
	                        demographics: {
	                            suggestedRent: p.suggested_rent ? Number(p.suggested_rent.replace(/[^0-9.]/g, '')) : undefined,
	                        },
	                        marketingImport,
	                    }
	                };

                return {
                    address: p.address,
                    city: p.city,
                    state: p.state,
                    zip: p.zip,
                    // If columns exist, use them. If not, they are in the raw_realestate_data
                    bedrooms: p.bedrooms ? Number(p.bedrooms) : null,
                    bathrooms: p.bathrooms ? Number(p.bathrooms) : null,
                    sqft: p.sqft ? Number(p.sqft) : null,
                    year_built: p.year_built ? Number(p.year_built) : null,
                    lot_size: p.lot_size ? Number(p.lot_size) : null,
                    property_type: p.property_type,
                    list_price: p.list_price ? parseFloat(p.list_price.replace(/[^0-9.]/g, '')) : null,
                    // Owner name: keep full name, and derive first/last if not provided
                    owner_name: p.owner_name
                        || (p.owner_first_name && p.owner_last_name
                            ? `${p.owner_first_name} ${p.owner_last_name}`.trim()
                            : p.owner_first_name || null),
                    owner_first_name: p.owner_first_name
                        || (p.owner_name ? p.owner_name.trim().split(/\s+/)[0] : null),
                    owner_last_name: p.owner_last_name
                        || (p.owner_name ? p.owner_name.trim().split(/\s+/).slice(1).join(' ') || null : null),
                    // Mailing address as direct columns
                    mailing_address: p.mailing_street || p.mailing_address || null,
                    mailing_city: p.mailing_city || null,
                    mailing_state: p.mailing_state || null,
                    mailing_zip: p.mailing_zip || null,
                    owner_phone: uniquePhones.length > 0 ? uniquePhones : null,

	                    status: 'new',
	                    created_by: user.id,
	                    team_id: actor.teamId,
	                    list_id: listId,
	                    raw_realestate_data: rawData, // Store the JSON blob!
	                };
            });

            if (rows.length > 0) {
                const { data, error } = await supabase
                    .from('properties')
                    .upsert(rows, { onConflict: 'address,city,state,zip' })
                    .select('id, address, city, state, zip');

                if (error) {
                    console.error('Batch insert error:', error.message, error.code, error.details);
                    errors += rows.length;
                    // If the first batch fails, we can assume something is wrong with the schema or connection
                    return apiSuccess({
                        imported,
                        skipped,
                        errors: errors + (importedProperties.length - (i + batchSize)), // All remaining rows are effectively errors
                        listId,
                        errorDetails: error.message
                    });
                } else {
                    imported += data?.length || 0;
                    // Collect property IDs for potential batch skip trace
                    if (data) {
                        allPropertyIds.push(...data.map((d: { id: string }) => d.id));
                    }

                    // Create contacts for any properties that have phone/email data in the CSV
                    if (data && data.length > 0) {
                        // Build address→id map to correctly match CSV rows to property IDs
                        // regardless of the order Postgres returns upserted rows.
                        const propertyIdByAddress = new Map<string, string>();
                        for (const prop of data as UpsertedPropertyRow[]) {
                            const key = [
                                (prop.address || '').toLowerCase().trim(),
                                (prop.city || '').toLowerCase().trim(),
                                (prop.state || '').toLowerCase().trim(),
                                (prop.zip || '').trim(),
                            ].join('|');
                            propertyIdByAddress.set(key, prop.id);
                        }

                        const contactsToInsert: ImportedContactInsert[] = [];
                        for (const p of batch) {
                            const addrKey = [
                                (p.address || '').toLowerCase().trim(),
                                (p.city || '').toLowerCase().trim(),
                                (p.state || '').toLowerCase().trim(),
                                (p.zip || '').trim(),
                            ].join('|');
                            const propertyId = propertyIdByAddress.get(addrKey);
                            if (!propertyId) continue;

                            const uniquePhones = collectUniquePhones(p);
                            const uniqueEmails = collectUniqueEmails(p);

                            if (uniquePhones.length === 0 && uniqueEmails.length === 0) continue;

                            contactsToInsert.push({
                                property_id: propertyId,
                                name: p.owner_name || null,
                                phone_numbers: uniquePhones.map((v, idx) => ({
                                    value: v,
                                    label: 'mobile',
                                    is_primary: idx === 0,
                                })),
                                emails: uniqueEmails.map((v, idx) => ({
                                    value: v,
                                    label: 'personal',
                                    is_primary: idx === 0,
                                })),
                            });
                        }
                        if (contactsToInsert.length > 0) {
                            // Check which properties already have a contact, then only insert new ones
                            const propIds = contactsToInsert.map((c) => c.property_id)
                            const { data: existingContacts } = await supabase
                                .from('contacts')
                                .select('property_id')
                                .in('property_id', propIds)
                            const existingPropIds = new Set((existingContacts || []).map((e) => e.property_id))
                            const newContacts = contactsToInsert.filter((c) => !existingPropIds.has(c.property_id))
                            if (newContacts.length > 0) {
                                const { error: contactError } = await supabase.from('contacts').insert(newContacts)
                                if (contactError) {
                                    console.error('Contact insert error:', contactError.message, contactError.details)
                                }
                            }
                        }
                    }
                }
            }
        }

        return apiSuccess({ imported, skipped, errors, listId, propertyIds: allPropertyIds });

    } catch (error) {
        console.error('Import error:', error);
        return Errors.internal();
    }
});
