import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { withAuth } from '@/lib/auth/middleware';
import { Errors, apiSuccess } from '@/lib/api/response';

export const POST = withAuth(async (req: NextRequest, { user }) => {
    try {
        const body = await req.json();
        const { properties, listName } = body;

        if (!properties || !Array.isArray(properties) || properties.length === 0) {
            return Errors.badRequest('No properties provided');
        }

        const supabase = createAdminClient();

        // 1. Get user profile to know who is importing
        const { data: profile } = await supabase
            .from('user_profiles')
            .select('team_id, full_name')
            .eq('id', user.id)
            .single();

        // 2. If listName provided, create the list
        let listId: string | undefined;
        if (listName) {
            const { data: list, error: listError } = await supabase
                .from('lead_lists')
                .insert({
                    name: listName,
                    created_by: user.id,
                    team_id: profile?.team_id,
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
        let skipped = 0;
        let errors = 0;

        const batchSize = 100;
        for (let i = 0; i < properties.length; i += batchSize) {
            const batch = properties.slice(i, i + batchSize);

            const rows = batch.map((p: any) => {
                // Construct the raw_realestate_data JSON to match NormalizedPropertyData structure
                // This will allow the UI to automatically render these fields
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
                            phone: p.owner_phone,
                            email: p.owner_email,
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
                        }
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
                    owner_name: p.owner_name,
                    owner_phone: (() => {
                        const phones = [p.owner_phone, p.phone_1, p.phone_2, p.phone_3].filter(Boolean)
                        return phones.length > 0 ? phones : null
                    })(),

                    status: 'new',
                    created_by: user.id,
                    team_id: profile?.team_id,
                    list_id: listId,
                    raw_realestate_data: rawData, // Store the JSON blob!
                };
            });

            if (rows.length > 0) {
                const { data, error } = await supabase
                    .from('properties')
                    .upsert(rows, { onConflict: 'address,city,state,zip' })
                    .select('id');

                if (error) {
                    console.error('Batch insert error:', error.message, error.code, error.details);
                    errors += rows.length;
                    // If the first batch fails, we can assume something is wrong with the schema or connection
                    return apiSuccess({
                        imported,
                        skipped,
                        errors: errors + (properties.length - (i + batchSize)), // All remaining rows are effectively errors
                        listId,
                        errorDetails: error.message
                    });
                } else {
                    imported += data?.length || 0;

                    // Create contacts for any properties that have phone/email data in the CSV
                    if (data && data.length > 0) {
                        const contactsToInsert: any[] = [];
                        for (let j = 0; j < data.length; j++) {
                            const p = batch[j];
                            const propertyId = data[j].id;

                            // Collect phones: owner_phone + phone_1/2/3, deduplicated, max 3
                            const rawPhones = [p.owner_phone, p.phone_1, p.phone_2, p.phone_3]
                                .filter(Boolean) as string[];
                            const uniquePhones = [...new Set(rawPhones)].slice(0, 3);

                            // Collect emails: owner_email + email_1/2/3, deduplicated, max 3
                            const rawEmails = [p.owner_email, p.email_1, p.email_2, p.email_3]
                                .filter(Boolean) as string[];
                            const uniqueEmails = [...new Set(rawEmails)].slice(0, 3);

                            if (uniquePhones.length === 0 && uniqueEmails.length === 0) continue;

                            contactsToInsert.push({
                                property_id: propertyId,
                                name: p.owner_name || null,
                                phone_numbers: uniquePhones.map((v, i) => ({
                                    value: v,
                                    label: 'mobile',
                                    is_primary: i === 0,
                                })),
                                emails: uniqueEmails.map((v, i) => ({
                                    value: v,
                                    label: 'personal',
                                    is_primary: i === 0,
                                })),
                            });
                        }
                        if (contactsToInsert.length > 0) {
                            await supabase
                                .from('contacts')
                                .upsert(contactsToInsert, { onConflict: 'property_id', ignoreDuplicates: true });
                        }
                    }
                }
            }
        }

        return apiSuccess({ imported, skipped, errors, listId });

    } catch (error) {
        console.error('Import error:', error);
        return Errors.internal();
    }
});
