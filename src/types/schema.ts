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
  status: 'new' | 'unanswered' | 'contacted' | 'warm' | 'follow_up' | 'closed'
  owner_name: string | null
  owner_first_name: string | null
  owner_last_name: string | null
  owner_phone: string[] | null
  mailing_address: string | null
  mailing_city: string | null
  mailing_state: string | null
  mailing_zip: string | null
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
  analysis_overrides?: Partial<AnalysisSettings> | null
  calculator_scenarios?: Record<string, unknown>[]
  unanswered_count: number
  last_called_at: string | null
  has_been_answered: boolean
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
  // Enhanced fields (v2 analysis)
  holding_costs?: number
  assignment_fee?: number
  total_investment?: number
  estimated_profit?: number
  noi?: number
  cap_rate?: number
  cash_on_cash?: number
  monthly_cash_flow?: number
  annual_cash_flow?: number
  grm?: number
  dscr?: number
  data_sources_used?: string[]
  seller_motivation_signals?: string[]
  negotiation_insights?: string[]
  assumptions_used?: Partial<AnalysisSettings>
}

// ─── Analysis Settings ───

export interface AnalysisSettings {
  mao_percentage: number
  repair_buffer_percentage: number
  holding_months: number
  holding_cost_monthly: number
  assignment_fee_target: number
  vacancy_rate: number
  management_fee: number
  maintenance_reserve: number
  capex_reserve: number
  insurance_annual: number
  down_payment_percentage: number
  interest_rate: number
  loan_term_years: number
  closing_costs_percentage: number
  target_cap_rate: number
  target_cash_on_cash: number
}

export const DEFAULT_ANALYSIS_SETTINGS: AnalysisSettings = {
  mao_percentage: 70,
  repair_buffer_percentage: 0,
  holding_months: 3,
  holding_cost_monthly: 1500,
  assignment_fee_target: 10000,
  vacancy_rate: 8,
  management_fee: 10,
  maintenance_reserve: 5,
  capex_reserve: 5,
  insurance_annual: 1200,
  down_payment_percentage: 25,
  interest_rate: 7.5,
  loan_term_years: 30,
  closing_costs_percentage: 3,
  target_cap_rate: 8,
  target_cash_on_cash: 10,
}

// ─── Vision Assessment ───

export interface VisionRepairItem {
  item: string
  category: 'structural' | 'roof' | 'plumbing' | 'electrical' | 'hvac' | 'cosmetic' | 'landscaping' | 'other'
  estimated_cost_low: number
  estimated_cost_high: number
  urgency: 'immediate' | 'short_term' | 'cosmetic'
}

export interface VisionAssessment {
  condition_rating: number
  condition_label: 'poor' | 'fair' | 'average' | 'good' | 'excellent'
  visible_issues: string[]
  repair_items: VisionRepairItem[]
  overall_notes: string
  curb_appeal_score?: number
}

// ─── Property Photos ───

export interface PropertyPhoto {
  id: string
  property_id: string
  storage_path: string
  filename: string
  size_bytes: number
  caption: string | null
  display_order: number
  vision_assessment: VisionAssessment | null
  created_by: string | null
  created_at: string
}

// ─── Comp Images ───

export interface CompImage {
  id: string
  property_id: string
  comp_address: string
  comp_type: 'sold' | 'rental'
  image_type: 'street_view' | 'listing_exterior' | 'listing_interior'
  storage_path: string | null
  source_url: string | null
  vision_assessment: Record<string, unknown> | null
  created_at: string
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
  callId?: string
  recording_url?: string | null
  duration?: number | null
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
  leadFilter: 'new' | 'unanswered' // which leads to dial
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
