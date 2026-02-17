export interface Team {
  id: string
  name: string
  slug: string
  owner_id: string | null
  created_at: string
}

export interface UserProfile {
  id: string
  email: string
  role: 'admin' | 'agent'
  team_id: string | null
  full_name: string | null
  avatar_url: string | null
}

export interface Property {
  id: string
  address: string
  city: string | null
  state: string | null
  zip: string | null
  list_price: number | null
  bedrooms: number | null
  bathrooms: number | null
  sqft: number | null
  year_built: number | null
  lot_size: number | null
  property_type: string | null
  status: 'new' | 'warm' | 'reach_out' | 'closed'
  owner_name: string | null
  owner_phone: string[] | null
  rental_data: RentalEstimate | null
  rental_fetched_at: string | null
  sold_data: SoldEstimate | null
  sold_fetched_at: string | null
  ai_analysis: DealAnalysis | null
  ai_analyzed_at: string | null
  team_id: string | null
  created_by: string
  created_at: string
  // New fields for leads overhaul
  follow_up_date: string | null
  priority: 'low' | 'medium' | 'high' | null
  status_changed_at: string | null
  list_id: string | null
  list?: LeadList
  raw_realestate_data?: Record<string, any> | null
}

export interface LeadList {
  id: string
  name: string
  description: string | null
  created_by: string
  team_id: string | null
  created_at: string
}

export interface RentalEstimate {
  rent: number
  rentRangeLow: number
  rentRangeHigh: number
  comparables?: RentalComp[]
}

export interface RentalComp {
  address: string
  rent: number
  bedrooms: number
  bathrooms: number
  sqft: number
  distance: number
  latitude?: number
  longitude?: number
  propertyType?: string
  listedDate?: string
  daysOnMarket?: number
  yearBuilt?: number
  lotSize?: number
  status?: string
}

export interface SoldComp {
  address: string
  price: number
  bedrooms: number
  bathrooms: number
  sqft: number
  distance: number
  soldDate: string
  latitude?: number
  longitude?: number
  propertyType?: string
  yearBuilt?: number
  lotSize?: number
  status?: string
}

export interface SoldEstimate {
  price: number
  priceRangeLow: number
  priceRangeHigh: number
  comparables?: SoldComp[]
}

export interface DealAnalysis {
  arv: number
  arv_reasoning: string
  rental_arv?: number
  rental_arv_reasoning?: string
  repair_estimate: number
  repair_breakdown: Record<string, number>
  max_allowable_offer: number
  deal_grade: 'A' | 'B' | 'C' | 'D' | 'F'
  risk_factors: string[]
  recommendation: string
  confidence: 'low' | 'medium' | 'high'
}

export interface PhoneEntry {
  value: string
  label: 'mobile' | 'work' | 'home'
  is_primary: boolean
}

export interface EmailEntry {
  value: string
  label: 'personal' | 'business'
  is_primary: boolean
}

export interface Contact {
  id: string
  property_id: string
  name: string | null
  phone_numbers: PhoneEntry[] | string[]
  emails: EmailEntry[] | string[]
  raw_batchdata_response?: Record<string, unknown>
  created_at: string
}

export interface Call {
  id: string
  property_id: string | null
  contact_id: string | null
  caller_id: string
  twilio_call_sid: string
  from_number: string | null
  to_number: string | null
  status: string | null
  duration: number | null
  notes: string | null
  recording_sid: string | null
  recording_url: string | null
  transcript: string | null
  transcription_status: 'none' | 'processing' | 'completed' | 'failed'
  created_at: string
  ended_at: string | null
}

export interface Note {
  id: string
  property_id: string
  user_id: string | null
  content: string
  created_at: string
  user?: {
    full_name: string | null
    avatar_url: string | null
  }
}

export interface Message {
  id: string
  created_at: string
  updated_at: string
  body: string
  direction: 'inbound' | 'outbound'
  status: 'pending' | 'queued' | 'sent' | 'delivered' | 'failed' | 'received'
  from_number: string
  to_number: string
  twilio_sid: string | null
  twilio_status: string | null
  error_code: string | null
  error_message: string | null
  contact_id: string | null
  property_id: string | null
  media_urls: string[] | null
  num_segments: number
  price: number | null
  price_unit: string | null
  contact?: Contact
  property?: Property
}

export interface ActivityItem {
  id: string
  type: 'note' | 'email' | 'call' | 'sms' | 'status_change'
  content: string
  status?: string
  user: string | null
  created_at: string
}

// Power Dialer types
export type PowerDialerMode =
  | 'IDLE'
  | 'SETUP'
  | 'LOADING_QUEUE'
  | 'READY'
  | 'SENDING_SMS'
  | 'DIALING'
  | 'REDIALING'
  | 'IN_CALL'
  | 'SKIP_TRACING'
  | 'DISPOSITION'
  | 'PAUSED'
  | 'PAUSED_AWAITING_CONTINUE'
  | 'COMPLETED'

export interface PowerDialerLead {
  propertyId: string
  address: string
  city: string | null
  state: string | null
  zip: string | null
  ownerName: string | null
  ownerPhone: string[] | null
  contactId: string | null
  contactPhones: string[] | null
  dialStatus: 'pending' | 'called' | 'skipped' | 'no_answer' | 'interested' | 'not_interested'
}

export interface PowerDialerSettings {
  listId: string | null // null = "All New Leads"
  doubleDial: boolean
  preSms: boolean
  smsTemplateIndex: number
}

export interface PowerDialerSessionStats {
  total: number
  called: number
  noAnswer: number
  interested: number
  notInterested: number
  skipped: number
}

export interface ApiResponse<T> {
  data?: T
  cached?: boolean
  error?: string
  code?: string
}
