import Papa from 'papaparse'

const TITANSKIP_BASE_URL = 'https://fred.titanskip.com'
const TITANSKIP_API_KEY = process.env.TITAN_SKIP_API_KEY || ''

// ─── Types ──────────────────────────────────────────────────────────────────

export interface TitanSkipTrace {
  id: string
  user_id: string
  time_start: string
  time_end: string | null
  status: 'pending' | 'processing' | 'completed' | 'failed'
  amount: number
  columns: Record<string, string>
  worker_id: number | null
  download_url: string | null
}

export interface TitanSkipResultRow {
  address: string
  city: string
  state: string
  zip: string
  first_name: string
  last_name: string
  mail_address: string
  mail_city: string
  mail_state: string
  mailing_zip: string
  primary_phone: string
  primary_phone_type: string
  'Email-1': string
  'Email-2': string
  'Email-3': string
  'Email-4': string
  'Email-5': string
  'Mobile-1': string
  'Mobile-2': string
  'Mobile-3': string
  'Mobile-4': string
  'Mobile-5': string
  'Landline-1': string
  'Landline-2': string
  'Landline-3': string
}

interface LeadForTitanSkip {
  owner_name: string | null
  address: string
  city: string | null
  state: string | null
  raw_realestate_data?: Record<string, any> | null
}

// ─── Compatibility Check ────────────────────────────────────────────────────

/**
 * A lead is TitanSkip-compatible when it has owner_name + address + city + state.
 */
export function isTitanSkipCompatible(lead: LeadForTitanSkip): boolean {
  const hasName = !!lead.owner_name && lead.owner_name.trim().length >= 2
  const hasAddress = !!lead.address && lead.address.trim().length >= 3
  const hasCity = !!lead.city && lead.city.trim().length >= 1
  const hasState = !!lead.state && lead.state.trim().length >= 1
  return hasName && hasAddress && hasCity && hasState
}

// ─── CSV Generation ─────────────────────────────────────────────────────────

function splitOwnerName(ownerName: string): { first: string; last: string } {
  const parts = ownerName.trim().split(/\s+/)
  const first = parts[0] || ''
  const last = parts.length > 1 ? parts.slice(1).join(' ') : ''
  return { first, last }
}

/**
 * Build a CSV string from an array of leads for TitanSkip upload.
 */
export function buildTitanSkipCsv(leads: LeadForTitanSkip[]): string {
  const rows = leads.map((lead) => {
    const { first, last } = splitOwnerName(lead.owner_name || '')
    // Try to extract mailing info from raw_realestate_data if available
    const raw = lead.raw_realestate_data || {}
    const mailingAddress = raw.mailing_address || raw.mailingAddress || ''
    const mailingCity = raw.mailing_city || raw.mailingCity || ''
    const mailingState = raw.mailing_state || raw.mailingState || ''

    return {
      first_name: first,
      last_name: last,
      address: lead.address,
      city: lead.city || '',
      state: lead.state || '',
      mailing_address: mailingAddress,
      mailing_city: mailingCity,
      mailing_state: mailingState,
    }
  })

  return Papa.unparse(rows)
}

// ─── API Calls ──────────────────────────────────────────────────────────────

/**
 * Submit a CSV to TitanSkip and start a trace.
 * Returns the trace ID on success.
 */
export async function submitTrace(csvContent: string): Promise<{ traceId: string } | { error: string }> {
  try {
    // Build multipart form data with the CSV as a file
    const formData = new FormData()
    const blob = new Blob([csvContent], { type: 'text/csv' })
    formData.append('file', blob, 'skip_trace.csv')
    // Map column headers to TitanSkip field names
    formData.append('first_name', 'first_name')
    formData.append('last_name', 'last_name')
    formData.append('address', 'address')
    formData.append('city', 'city')
    formData.append('state', 'state')
    formData.append('mailing_address', 'mailing_address')
    formData.append('mailing_city', 'mailing_city')
    formData.append('mailing_state', 'mailing_state')

    const res = await fetch(`${TITANSKIP_BASE_URL}/traces`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TITANSKIP_API_KEY}`,
      },
      body: formData,
    })

    if (!res.ok) {
      const errText = await res.text()
      console.error('TitanSkip submit error:', res.status, errText)
      return { error: `TitanSkip API error: ${res.status}` }
    }

    const data = await res.json()
    console.log('TitanSkip trace submitted:', data)

    // The response may return the trace directly or in a wrapper
    const traceId = data.id || data.trace_id
    if (!traceId) {
      console.error('TitanSkip: No trace ID in response:', data)
      return { error: 'No trace ID returned from TitanSkip' }
    }

    return { traceId }
  } catch (err) {
    console.error('TitanSkip submit exception:', err)
    return { error: 'Failed to submit trace to TitanSkip' }
  }
}

/**
 * Check the status of a TitanSkip trace.
 */
export async function getTraceStatus(traceId: string): Promise<TitanSkipTrace | null> {
  try {
    const res = await fetch(`${TITANSKIP_BASE_URL}/trace/${traceId}`, {
      headers: {
        'Authorization': `Bearer ${TITANSKIP_API_KEY}`,
      },
    })

    if (!res.ok) {
      console.error('TitanSkip status check error:', res.status)
      return null
    }

    return await res.json()
  } catch (err) {
    console.error('TitanSkip status check exception:', err)
    return null
  }
}

/**
 * Poll TitanSkip trace until completed or timeout.
 * Returns the trace data with download_url on success.
 */
export async function pollTraceUntilComplete(
  traceId: string,
  maxWaitMs = 90000,
  intervalMs = 3000
): Promise<TitanSkipTrace | null> {
  const startTime = Date.now()

  while (Date.now() - startTime < maxWaitMs) {
    const trace = await getTraceStatus(traceId)

    if (!trace) return null

    if (trace.status === 'completed' && trace.download_url) {
      return trace
    }

    if (trace.status === 'failed') {
      console.error('TitanSkip trace failed:', traceId)
      return null
    }

    // Wait before polling again
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }

  console.warn('TitanSkip trace polling timed out:', traceId)
  return null
}

/**
 * Download and parse a TitanSkip result CSV.
 */
export async function downloadAndParseResults(downloadUrl: string): Promise<TitanSkipResultRow[]> {
  try {
    const res = await fetch(downloadUrl)
    if (!res.ok) {
      console.error('TitanSkip download error:', res.status)
      return []
    }

    const csvText = await res.text()
    const parsed = Papa.parse<TitanSkipResultRow>(csvText, {
      header: true,
      skipEmptyLines: true,
    })

    if (parsed.errors.length > 0) {
      console.warn('TitanSkip CSV parse warnings:', parsed.errors)
    }

    return parsed.data
  } catch (err) {
    console.error('TitanSkip download/parse exception:', err)
    return []
  }
}

// ─── Result Mapping ─────────────────────────────────────────────────────────

/**
 * Map a TitanSkip result row to our contact format for DB storage.
 */
export function mapTitanSkipRowToContact(row: TitanSkipResultRow, propertyId: string) {
  // Collect all phone numbers
  const phones: string[] = []
  if (row.primary_phone) phones.push(row.primary_phone)

  // Add mobiles (deduplicate against primary)
  for (let i = 1; i <= 5; i++) {
    const mobile = row[`Mobile-${i}` as keyof TitanSkipResultRow]
    if (mobile && !phones.includes(mobile)) phones.push(mobile)
  }

  // Add landlines (deduplicate)
  for (let i = 1; i <= 3; i++) {
    const landline = row[`Landline-${i}` as keyof TitanSkipResultRow]
    if (landline && !phones.includes(landline)) phones.push(landline)
  }

  // Collect all emails
  const emails: string[] = []
  for (let i = 1; i <= 5; i++) {
    const email = row[`Email-${i}` as keyof TitanSkipResultRow]
    if (email) emails.push(email)
  }

  // Build full name
  const fullName = [row.first_name, row.last_name].filter(Boolean).join(' ') || 'Unknown Owner'

  return {
    property_id: propertyId,
    name: fullName,
    phone_numbers: phones.filter(Boolean),
    emails: emails.filter(Boolean),
    raw_batchdata_response: { source: 'titanskip', ...row },
  }
}

/**
 * Match TitanSkip result rows back to property IDs by address.
 * Returns a map of propertyId → contact data.
 */
export function matchResultsToProperties(
  rows: TitanSkipResultRow[],
  properties: Array<{ id: string; address: string; city: string | null; state: string | null }>
): Map<string, ReturnType<typeof mapTitanSkipRowToContact>> {
  const results = new Map<string, ReturnType<typeof mapTitanSkipRowToContact>>()

  // Build lookup by normalized address
  const propertyByAddress = new Map<string, { id: string }>()
  for (const prop of properties) {
    const key = normalizeAddress(prop.address, prop.city, prop.state)
    propertyByAddress.set(key, prop)
  }

  for (const row of rows) {
    const key = normalizeAddress(row.address, row.city, row.state)
    const prop = propertyByAddress.get(key)
    if (prop) {
      const contact = mapTitanSkipRowToContact(row, prop.id)
      // Only include if we actually got some contact info
      if (contact.phone_numbers.length > 0 || contact.emails.length > 0) {
        results.set(prop.id, contact)
      }
    }
  }

  return results
}

function normalizeAddress(address: string, city: string | null, state: string | null): string {
  return [address, city, state]
    .map((s) => (s || '').trim().toLowerCase().replace(/\s+/g, ' '))
    .join('|')
}
