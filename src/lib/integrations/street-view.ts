/**
 * Fetch a Google Street View Static API image for a given address.
 * Returns a base64-encoded JPEG buffer.
 */
export async function fetchStreetViewImage(
  address: string
): Promise<{ base64: string; mimeType: string } | null> {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
  if (!apiKey) {
    console.error('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY not set')
    return null
  }

  const encodedAddress = encodeURIComponent(address)
  const url = `https://maps.googleapis.com/maps/api/streetview?size=800x600&location=${encodedAddress}&key=${apiKey}`

  try {
    const res = await fetch(url)

    if (!res.ok) {
      console.error(`Street View API returned ${res.status} for ${address}`)
      return null
    }

    // Check if we got an actual image (not a "no image available" placeholder)
    const contentType = res.headers.get('content-type') || ''
    if (!contentType.includes('image')) {
      return null
    }

    const arrayBuffer = await res.arrayBuffer()
    const base64 = Buffer.from(arrayBuffer).toString('base64')

    return { base64, mimeType: 'image/jpeg' }
  } catch (error) {
    console.error(`Street View fetch error for ${address}:`, error)
    return null
  }
}

/**
 * Fetch a Google Street View metadata to check if an image is available.
 */
export async function checkStreetViewAvailability(address: string): Promise<boolean> {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
  if (!apiKey) return false

  const encodedAddress = encodeURIComponent(address)
  const url = `https://maps.googleapis.com/maps/api/streetview/metadata?location=${encodedAddress}&key=${apiKey}`

  try {
    const res = await fetch(url)
    const data = await res.json()
    return data.status === 'OK'
  } catch {
    return false
  }
}
