import type {
  Property,
  Contact,
  DealAnalysis,
  RentalEstimate,
  SoldEstimate,
  Note,
  ActivityItem,
  AnalysisSettings,
  PropertyPhoto,
  VisionAssessment,
} from '@/types/schema'

export interface CompFilterOptions {
  radius?: number
  compCount?: number
  daysOld?: number // For sold comps
  force?: boolean // Bypass cache and re-fetch
  beds?: number
  baths?: number
  sqftMin?: number
  sqftMax?: number
  listingStatus?: 'active' | 'closed' | 'all' // Client-side filter for comp status
}

class ApiClient {
  private async request<T>(
    endpoint: string,
    options?: RequestInit
  ): Promise<{ data?: T; cached?: boolean; error?: string; code?: string }> {
    try {
      const res = await fetch(endpoint, {
        headers: {
          'Content-Type': 'application/json',
          ...options?.headers,
        },
        ...options,
      })

      const rawBody = await res.text()
      let json: { data?: T; cached?: boolean; error?: string; code?: string } | null = null

      if (rawBody) {
        try {
          json = JSON.parse(rawBody) as {
            data?: T
            cached?: boolean
            error?: string
            code?: string
          }
        } catch {
          json = null
        }
      }

      if (!res.ok) {
        return {
          error:
            json?.error ||
            rawBody ||
            `Request failed with status ${res.status}`,
          code: json?.code,
        }
      }

      if (json) {
        return { data: json.data, cached: json.cached }
      }

      return { error: `Unexpected response from ${endpoint}` }
    } catch (error) {
      const message =
        error instanceof Error && error.message.trim()
          ? error.message
          : 'Network error. Please check your connection.'

      return { error: message }
    }
  }

  // Properties
  async lookupProperty(address: string, city?: string, state?: string, zip?: string) {
    return this.request<Property>('/api/property/lookup', {
      method: 'POST',
      body: JSON.stringify({ address, city, state, zip }),
    })
  }

  async getProperties(params: {
    status?: string
    view?: 'mine' | 'team'
    limit?: number
    offset?: number
    sortBy?: string
    sortOrder?: string
  }) {
    const searchParams = new URLSearchParams()
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) searchParams.set(key, String(value))
    })
    return this.request<{ properties: Property[]; total: number; limit: number; offset: number }>(
      `/api/properties?${searchParams.toString()}`
    )
  }

  // Analysis
  async analyzeProperty(propertyId: string, overrides?: Partial<AnalysisSettings>, force?: boolean) {
    return this.request<DealAnalysis>('/api/ai/analyze', {
      method: 'POST',
      body: JSON.stringify({ propertyId, overrides, force }),
    })
  }

  async getAnalysisSettings() {
    return this.request<AnalysisSettings>('/api/ai/settings')
  }

  async updateAnalysisSettings(settings: Partial<AnalysisSettings>) {
    return this.request<AnalysisSettings>('/api/ai/settings', {
      method: 'PUT',
      body: JSON.stringify({ settings }),
    })
  }

  // Photos
  async uploadPhoto(propertyId: string, base64: string, filename: string) {
    return this.request<PropertyPhoto>('/api/photos', {
      method: 'POST',
      body: JSON.stringify({ propertyId, base64, filename }),
    })
  }

  async getPhotos(propertyId: string) {
    return this.request<PropertyPhoto[]>(`/api/photos?propertyId=${propertyId}`)
  }

  async deletePhoto(photoId: string) {
    return this.request<{ deleted: boolean }>(`/api/photos/${photoId}`, {
      method: 'DELETE',
    })
  }

  async analyzePropertyPhotos(propertyId: string, photoIds?: string[]) {
    return this.request<{ assessments: VisionAssessment[]; aggregate: Record<string, unknown> }>('/api/ai/vision', {
      method: 'POST',
      body: JSON.stringify({ propertyId, photoIds }),
    })
  }

  // Comp Images
  async fetchCompImages(propertyId: string, comps: Array<{ address: string; type: 'sold' | 'rental' }>) {
    return this.request<Array<{ address: string; street_view: boolean; listing_images: number }>>('/api/comps/images', {
      method: 'POST',
      body: JSON.stringify({ propertyId, comps }),
    })
  }

  async analyzeCompImages(propertyId: string) {
    return this.request<Record<string, unknown>>('/api/ai/vision-comps', {
      method: 'POST',
      body: JSON.stringify({ propertyId }),
    })
  }

  async getRentalComps(
    propertyId: string,
    address: string,
    beds?: number,
    baths?: number,
    sqft?: number,
    filters?: CompFilterOptions
  ) {
    return this.request<RentalEstimate>('/api/rentcast/comps', {
      method: 'POST',
      body: JSON.stringify({
        propertyId,
        address,
        bedrooms: beds,
        bathrooms: baths,
        sqft,
        ...filters,
      }),
    })
  }

  async getSoldComps(
    propertyId: string,
    address: string,
    beds?: number,
    baths?: number,
    sqft?: number,
    filters?: CompFilterOptions
  ) {
    return this.request<SoldEstimate>('/api/rentcast/sold-comps', {
      method: 'POST',
      body: JSON.stringify({
        propertyId,
        address,
        bedrooms: beds,
        bathrooms: baths,
        sqft,
        ...filters,
      }),
    })
  }

  // Contacts
  async skipTrace(propertyId: string, ownerName: string, address: string, city: string, state: string, zip: string, force?: boolean) {
    return this.request<Contact[]>('/api/skip-trace', {
      method: 'POST',
      body: JSON.stringify({ propertyId, ownerName, address, city, state, zip, force }),
    })
  }

  async getContacts(propertyId: string) {
    return this.request<Contact[]>(`/api/contacts?propertyId=${encodeURIComponent(propertyId)}`)
  }

  async addContact(propertyId: string, type: 'phone' | 'email', value: string, label: string) {
    return this.request<Contact>('/api/contacts', {
      method: 'POST',
      body: JSON.stringify({ propertyId, type, value, label }),
    })
  }

  async updateContact(contactId: string, type: 'phone' | 'email', index: number, data: { value?: string; label?: string; is_primary?: boolean }) {
    return this.request<Contact>(`/api/contacts/${contactId}`, {
      method: 'PATCH',
      body: JSON.stringify({ type, index, ...data }),
    })
  }

  async deleteContact(contactId: string, type: 'phone' | 'email', index: number) {
    return this.request<Contact>(`/api/contacts/${contactId}?type=${type}&index=${index}`, {
      method: 'DELETE',
    })
  }

  // Batch Skip Trace
  async batchSkipTrace(propertyIds: string[], force?: boolean) {
    return this.request<{
      traceId: string | null
      titanSkipCount: number
      batchDataCount: number
      batchDataProcessed: number
      skippedCount: number
      message: string
    }>('/api/skip-trace/titanskip', {
      method: 'POST',
      body: JSON.stringify({ propertyIds, force }),
    })
  }

  async pollSkipTraceJob(traceId: string) {
    return this.request<{
      status: string
      traceId: string
      contactsFound?: number
      totalRows?: number
      message: string
    }>(`/api/skip-trace/titanskip/${traceId}`)
  }

  // Voice
  async getVoiceToken() {
    return this.request<{
      token: string
      identity: string
      outboundAddressId: string
      phoneNumber: string
      phoneNumberId: string
    }>('/api/voice/token')
  }

  async updateCallNotes(callId: string, notes: string, propertyId?: string) {
    return this.request<Record<string, unknown>>(`/api/voice/calls/${callId}`, {
      method: 'PATCH',
      body: JSON.stringify({ notes, propertyId }),
    })
  }

  async getCalls(propertyId: string) {
    return this.request<import('@/types/schema').Call[]>(`/api/voice/calls?propertyId=${propertyId}`)
  }

  async transcribeCall(callId: string) {
    return this.request<{ transcript: string; status: string }>('/api/ai/transcribe', {
      method: 'POST',
      body: JSON.stringify({ callId }),
    })
  }

  // Notes
  async getNotes(propertyId: string) {
    return this.request<Note[]>(`/api/notes?propertyId=${propertyId}`)
  }

  async createNote(propertyId: string, content: string) {
    return this.request<Note>('/api/notes', {
      method: 'POST',
      body: JSON.stringify({ propertyId, content }),
    })
  }

  async updateNote(noteId: string, content: string) {
    return this.request<Note>(`/api/notes/${noteId}`, {
      method: 'PATCH',
      body: JSON.stringify({ content }),
    })
  }

  async deleteNote(noteId: string) {
    return this.request<{ deleted: boolean }>(`/api/notes/${noteId}`, {
      method: 'DELETE',
    })
  }

  // Activity
  async getActivityTimeline(propertyId: string) {
    return this.request<ActivityItem[]>(`/api/activity?propertyId=${propertyId}`)
  }

  // SMS
  async sendSms(to: string, message: string, contactId?: string, propertyId?: string) {
    return this.request<{ success: boolean; messageSid?: string; messageId?: string }>('/api/sms/send', {
      method: 'POST',
      body: JSON.stringify({ to, message, contactId, propertyId }),
    })
  }

  // Email
  async sendEmail(
    to: string,
    template: string,
    propertyId?: string,
    subject?: string,
    customHtml?: string,
    replyTo?: string,
    message?: string,
    offerAmount?: number
  ) {
    return this.request<{ sent: boolean; to: string; subject: string }>('/api/email/send', {
      method: 'POST',
      body: JSON.stringify({ to, template, propertyId, subject, customHtml, replyTo, message, offerAmount }),
    })
  }

  // Marketing
  async getMarketingCommandCenter() {
    return this.request<{
      actor: Record<string, unknown>
      campaigns: Record<string, unknown>[]
      queue: Record<string, unknown>
      audience: Record<string, unknown>
      analytics: Record<string, number>
      nextActions: Record<string, number>
    }>('/api/marketing/command-center')
  }

  async getMarketingCampaigns() {
    return this.request<{ campaigns: Record<string, unknown>[] }>('/api/marketing/campaigns')
  }

  async createMarketingCampaign(payload: {
    name: string
    channel: 'sms' | 'email' | 'voice'
    audienceSourceType?: string
    audienceSourceId?: string
    draftPayload?: Record<string, unknown>
    steps?: Record<string, unknown>[]
  }) {
    return this.request<{ campaign: Record<string, unknown>; steps: Record<string, unknown>[] }>('/api/marketing/campaigns', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  }

  async getMarketingCampaign(campaignId: string) {
    return this.request<{
      campaign: Record<string, unknown>
      steps: Record<string, unknown>[]
      enrollments: Record<string, unknown>[]
    }>(`/api/marketing/campaigns/${campaignId}`)
  }

  async updateMarketingCampaign(
    campaignId: string,
    payload: {
      name?: string
      audienceSourceType?: string | null
      audienceSourceId?: string | null
      draftPayload?: Record<string, unknown>
      reviewState?: string
    }
  ) {
    return this.request<{ campaign: Record<string, unknown> }>(`/api/marketing/campaigns/${campaignId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    })
  }

  async reviewMarketingCampaign(campaignId: string) {
    return this.request<{
      reviewState: string
      audienceCount: number
      reviewRows: Record<string, unknown>[]
      counts: Record<string, number>
    }>(`/api/marketing/campaigns/${campaignId}/review`, {
      method: 'POST',
    })
  }

  async launchMarketingCampaign(campaignId: string) {
    return this.request<{
      campaignId: string
      launchState: string
      queued: number
      suppressed: number
      skipped: number
    }>(`/api/marketing/campaigns/${campaignId}/launch`, {
      method: 'POST',
    })
  }

  async getMarketingInbox(params?: { filter?: string; campaignId?: string }) {
    const searchParams = new URLSearchParams()
    if (params?.filter) searchParams.set('filter', params.filter)
    if (params?.campaignId) searchParams.set('campaignId', params.campaignId)

    const suffix = searchParams.toString() ? `?${searchParams.toString()}` : ''
    return this.request<{
      threads: Record<string, unknown>[]
      filters: Record<string, number>
    }>(`/api/marketing/inbox${suffix}`)
  }

  async getMarketingThread(threadId: string) {
    return this.request<{
      threadId: string
      events: Record<string, unknown>[]
    }>(`/api/marketing/inbox/${encodeURIComponent(threadId)}`)
  }

  async getMarketingAnalytics() {
    return this.request<{ analytics: Record<string, number> }>('/api/marketing/analytics')
  }
}

export const api = new ApiClient()
