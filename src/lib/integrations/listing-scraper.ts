/**
 * Find a listing URL for a property address using SerpAPI (Google search).
 * Then scrape listing images using Firecrawl.
 */

/**
 * Search for a real estate listing URL using SerpAPI.
 * Searches Google for "<address> zillow OR redfin OR realtor.com listing"
 */
export async function findListingUrl(address: string): Promise<string | null> {
  const apiKey = process.env.SERPAPI_API_KEY
  if (!apiKey) {
    console.warn('SERPAPI_API_KEY not set, skipping listing search')
    return null
  }

  const query = `${address} zillow OR redfin OR realtor.com property listing`
  const encodedQuery = encodeURIComponent(query)

  try {
    const res = await fetch(
      `https://serpapi.com/search.json?q=${encodedQuery}&api_key=${apiKey}&num=5`
    )

    if (!res.ok) {
      console.error(`SerpAPI returned ${res.status}`)
      return null
    }

    const data = await res.json()
    const results = data.organic_results || []

    // Find listing URLs from known real estate sites
    const listingSites = ['zillow.com', 'redfin.com', 'realtor.com', 'trulia.com']

    for (const result of results) {
      const url = result.link as string
      if (listingSites.some((site) => url.includes(site))) {
        return url
      }
    }

    // Fallback: return first result if it looks like a property page
    if (results.length > 0 && results[0].link) {
      return results[0].link
    }

    return null
  } catch (error) {
    console.error('SerpAPI search error:', error)
    return null
  }
}

/**
 * Scrape listing images from a URL using Firecrawl.
 * Returns up to maxImages image URLs.
 */
export async function scrapeListingImages(
  url: string,
  maxImages: number = 10
): Promise<string[]> {
  const apiKey = process.env.FIRECRAWL_API_KEY
  if (!apiKey) {
    console.warn('FIRECRAWL_API_KEY not set, skipping listing scrape')
    return []
  }

  try {
    const FirecrawlApp = (await import('@mendable/firecrawl-js')).default
    const firecrawl = new FirecrawlApp({ apiKey })

    const result = await firecrawl.scrape(url, {
      formats: ['markdown'],
    }) as { success: boolean; markdown?: string }

    if (!result.success) {
      console.error('Firecrawl scrape failed:', result)
      return []
    }

    // Extract image URLs from the scraped content
    const imageUrls: string[] = []
    const markdown = result.markdown || ''

    // Match markdown image syntax: ![alt](url)
    const markdownImageRegex = /!\[.*?\]\((https?:\/\/[^\s)]+\.(?:jpg|jpeg|png|webp)[^\s)]*)\)/gi
    let match
    while ((match = markdownImageRegex.exec(markdown)) !== null) {
      if (imageUrls.length >= maxImages) break
      const imageUrl = match[1]
      if (isRelevantImage(imageUrl)) {
        imageUrls.push(imageUrl)
      }
    }

    // Also check for plain URLs that look like property images
    const plainUrlRegex = /https?:\/\/[^\s"']+\.(?:jpg|jpeg|png|webp)[^\s"']*/gi
    while ((match = plainUrlRegex.exec(markdown)) !== null) {
      if (imageUrls.length >= maxImages) break
      const imageUrl = match[0]
      if (isRelevantImage(imageUrl) && !imageUrls.includes(imageUrl)) {
        imageUrls.push(imageUrl)
      }
    }

    return imageUrls.slice(0, maxImages)
  } catch (error) {
    console.error('Firecrawl scrape error:', error)
    return []
  }
}

/**
 * Download an image URL and return as base64.
 */
export async function downloadImageAsBase64(
  imageUrl: string
): Promise<{ base64: string; mimeType: string } | null> {
  try {
    const res = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; PropertyAnalyzer/1.0)',
      },
    })

    if (!res.ok) return null

    const contentType = res.headers.get('content-type') || 'image/jpeg'
    if (!contentType.includes('image')) return null

    const arrayBuffer = await res.arrayBuffer()
    const base64 = Buffer.from(arrayBuffer).toString('base64')

    return { base64, mimeType: contentType.split(';')[0] }
  } catch {
    return null
  }
}

/**
 * Filter out irrelevant images (logos, icons, avatars, etc.)
 */
function isRelevantImage(url: string): boolean {
  const lower = url.toLowerCase()

  // Skip small images, logos, icons, avatars
  const skipPatterns = [
    'logo',
    'icon',
    'avatar',
    'profile',
    'favicon',
    'badge',
    'sprite',
    'pixel',
    '1x1',
    'spacer',
    'tracking',
    'analytics',
    'ads',
    'banner',
    'button',
    'arrow',
    'social',
    'facebook',
    'twitter',
    'instagram',
    'pinterest',
    'share',
    'thumb_small',
    '_50_',
    '_75_',
    'tiny',
  ]

  if (skipPatterns.some((pat) => lower.includes(pat))) return false

  // Prefer larger images (Zillow, Redfin patterns for full-size photos)
  const goodPatterns = [
    'uncropped_scaled_within',
    'photos',
    'media',
    'listing',
    'property',
    'home',
    'house',
    'exterior',
    'interior',
    'kitchen',
    'bedroom',
    'bathroom',
    'living',
    '_1280_',
    '_960_',
    '_640_',
    'large',
    'full',
    'originl',
  ]

  // If it matches a good pattern, definitely include
  if (goodPatterns.some((pat) => lower.includes(pat))) return true

  // Default: include if it has a reasonable path length (not a tiny tracking pixel)
  return url.length > 50
}
