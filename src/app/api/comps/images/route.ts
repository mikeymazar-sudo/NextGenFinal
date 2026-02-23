import { NextRequest } from 'next/server'
import { z } from 'zod'
import { withAuth } from '@/lib/auth/middleware'
import { checkRateLimit } from '@/lib/api/rate-limit'
import { apiSuccess, Errors } from '@/lib/api/response'
import { createAdminClient } from '@/lib/supabase/server'
import { fetchStreetViewImage } from '@/lib/integrations/street-view'
import {
  findListingUrl,
  scrapeListingImages,
  downloadImageAsBase64,
} from '@/lib/integrations/listing-scraper'

const CompImagesSchema = z.object({
  propertyId: z.string().uuid(),
  comps: z.array(
    z.object({
      address: z.string().min(1),
      type: z.enum(['sold', 'rental']),
    })
  ).max(10),
})

export const POST = withAuth(async (req: NextRequest, { user }) => {
  try {
    const body = await req.json()
    const parsed = CompImagesSchema.safeParse(body)

    if (!parsed.success) {
      return Errors.badRequest('Invalid request data.')
    }

    const { propertyId, comps } = parsed.data

    // Rate limit
    const { allowed } = await checkRateLimit(user.id, 'comp-images')
    if (!allowed) return Errors.rateLimited()

    const supabase = createAdminClient()

    // Check which comps already have images
    const { data: existing } = await supabase
      .from('comp_images')
      .select('comp_address, image_type')
      .eq('property_id', propertyId)

    const existingMap = new Map<string, Set<string>>()
    for (const row of existing || []) {
      if (!existingMap.has(row.comp_address)) {
        existingMap.set(row.comp_address, new Set())
      }
      existingMap.get(row.comp_address)!.add(row.image_type)
    }

    const results: Array<{
      address: string
      street_view: boolean
      listing_images: number
    }> = []

    // Process each comp
    for (const comp of comps) {
      const existingTypes = existingMap.get(comp.address) || new Set()
      let streetViewFetched = existingTypes.has('street_view')
      let listingImageCount = 0

      // 1. Fetch Street View (always, if not already cached)
      if (!streetViewFetched) {
        const streetViewData = await fetchStreetViewImage(comp.address)
        if (streetViewData) {
          // Upload to storage
          const storagePath = `${propertyId}/comps/${encodeURIComponent(comp.address)}/street-view.jpg`
          const buffer = Buffer.from(streetViewData.base64, 'base64')

          const { error: uploadErr } = await supabase.storage
            .from('comp-images')
            .upload(storagePath, buffer, {
              contentType: 'image/jpeg',
              upsert: true,
            })

          if (!uploadErr) {
            await supabase.from('comp_images').insert({
              property_id: propertyId,
              comp_address: comp.address,
              comp_type: comp.type,
              image_type: 'street_view',
              storage_path: storagePath,
            })
            streetViewFetched = true
          }
        }
      }

      // 2. Try to find listing and scrape images (best effort)
      if (!existingTypes.has('listing_exterior') && !existingTypes.has('listing_interior')) {
        try {
          const listingUrl = await findListingUrl(comp.address)

          if (listingUrl) {
            const imageUrls = await scrapeListingImages(listingUrl, 10)

            for (let i = 0; i < imageUrls.length; i++) {
              const imageData = await downloadImageAsBase64(imageUrls[i])
              if (!imageData) continue

              const imageType = i === 0 ? 'listing_exterior' : 'listing_interior'
              const storagePath = `${propertyId}/comps/${encodeURIComponent(comp.address)}/listing-${i}.jpg`
              const buffer = Buffer.from(imageData.base64, 'base64')

              const { error: uploadErr } = await supabase.storage
                .from('comp-images')
                .upload(storagePath, buffer, {
                  contentType: imageData.mimeType,
                  upsert: true,
                })

              if (!uploadErr) {
                await supabase.from('comp_images').insert({
                  property_id: propertyId,
                  comp_address: comp.address,
                  comp_type: comp.type,
                  image_type: imageType as 'listing_exterior' | 'listing_interior',
                  storage_path: storagePath,
                  source_url: imageUrls[i],
                })
                listingImageCount++
              }
            }
          }
        } catch (error) {
          console.error(`Listing scrape failed for ${comp.address}:`, error)
        }
      }

      results.push({
        address: comp.address,
        street_view: streetViewFetched,
        listing_images: listingImageCount,
      })
    }

    return apiSuccess(results)
  } catch (error) {
    console.error('Comp images error:', error)
    return Errors.internal()
  }
})
