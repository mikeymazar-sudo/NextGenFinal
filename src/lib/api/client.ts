import type {
  Property,
  Contact,
  DealAnalysis,
  RentalEstimate,
  SoldEstimate,
  Note,
  ActivityItem,
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

      const json = await res.json()

      if (!res.ok) {
        return { error: json.error || 'Request failed', code: json.code }
      }

      return { data: json.data, cached: json.cached }
    } catch (error) {
      return { error: 'Network error. Please check your connection.' }
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
  async analyzeProperty(propertyId: string) {
    return this.request<DealAnalysis>('/api/ai/analyze', {
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

  // Voice
  async getVoiceToken() {
    return this.request<{ token: string; identity: string }>('/api/voice/token')
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
    customHtml?: string
  ) {
    return this.request<{ sent: boolean; to: string; subject: string }>('/api/email/send', {
      method: 'POST',
      body: JSON.stringify({ to, template, propertyId, subject, customHtml }),
    })
  }
}

export const api = new ApiClient()
