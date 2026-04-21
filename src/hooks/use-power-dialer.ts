'use client'

import { useReducer, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { api } from '@/lib/api/client'
import { toast } from 'sonner'
import type {
  PowerDialerLead,
  PowerDialerSettings,
  PowerDialerMode,
  PowerDialerSessionStats,
  PhoneEntry,
} from '@/types/schema'

// ─── SMS Template Utilities ───────────────────────────────────────

export const DEFAULT_SMS_TEMPLATES = [
  "Hi {owner_name}, I noticed your property at {address} in {city}. I'm a local real estate investor and I'd love to discuss a potential cash offer. I'll give you a call in just a moment!",
  "Hello {owner_name}, I'm reaching out about your property at {address}, {city}, {state}. I help homeowners sell quickly with fair cash offers. Giving you a quick call now!",
  "Hi {owner_name}, calling you shortly about {address}. I buy homes for cash in {city} - looking forward to chatting!",
]

const SMS_TEMPLATES_KEY = 'powerDialerSmsTemplates'

export function loadSmsTemplates(): string[] {
  if (typeof window === 'undefined') return [...DEFAULT_SMS_TEMPLATES]
  try {
    const stored = localStorage.getItem(SMS_TEMPLATES_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (Array.isArray(parsed) && parsed.length === 3) return parsed
    }
  } catch { /* ignore */ }
  return [...DEFAULT_SMS_TEMPLATES]
}

export function saveSmsTemplates(templates: string[]): void {
  localStorage.setItem(SMS_TEMPLATES_KEY, JSON.stringify(templates))
}

export function resolveTemplate(template: string, lead: PowerDialerLead): string {
  return template
    .replace(/{owner_name}/g, lead.ownerName || 'Homeowner')
    .replace(/{address}/g, lead.address || '')
    .replace(/{city}/g, lead.city || '')
    .replace(/{state}/g, lead.state || '')
    .replace(/{zip}/g, lead.zip || '')
}

export function toE164(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('1') && digits.length === 11) return `+${digits}`
  if (digits.length === 10) return `+1${digits}`
  if (phone.startsWith('+')) return phone
  return `+${digits}`
}

export function resolveBestPhone(lead: PowerDialerLead): string | null {
  // 1. Check contact phones (structured PhoneEntry[])
  if (lead.contactPhones && lead.contactPhones.length > 0) {
    // Try to find primary
    for (const p of lead.contactPhones) {
      if (typeof p === 'object' && (p as PhoneEntry).is_primary) {
        return (p as PhoneEntry).value
      }
    }
    // Take first
    const first = lead.contactPhones[0]
    if (typeof first === 'string') return first
    if (typeof first === 'object' && (first as PhoneEntry).value) return (first as PhoneEntry).value
  }
  // 2. Check owner_phone from property
  if (lead.ownerPhone && lead.ownerPhone.length > 0) {
    return lead.ownerPhone[0]
  }
  return null
}

/** Collect all phone numbers from a lead (contacts + owner_phone) */
export function getAllPhones(lead: PowerDialerLead): string[] {
  const phones: string[] = []
  if (lead.contactPhones && lead.contactPhones.length > 0) {
    for (const p of lead.contactPhones) {
      if (typeof p === 'string' && p.trim()) {
        phones.push(p)
      } else if (typeof p === 'object' && (p as PhoneEntry).value) {
        phones.push((p as PhoneEntry).value)
      }
    }
  }
  if (lead.ownerPhone && lead.ownerPhone.length > 0) {
    for (const p of lead.ownerPhone) {
      if (p.trim() && !phones.includes(p)) {
        phones.push(p)
      }
    }
  }
  return phones
}

// ─── State Machine ────────────────────────────────────────────────

type TwilioCallState = 'idle' | 'connecting' | 'ringing' | 'live' | 'ended'

interface PowerDialerState {
  mode: PowerDialerMode
  queue: PowerDialerLead[]
  currentIndex: number
  settings: PowerDialerSettings
  dialAttempt: number
  smsStatus: 'idle' | 'sending' | 'sent' | 'error'
  showSetupDialog: boolean
  showSkipTraceDialog: boolean
  showTemplateEditor: boolean
  currentPhone: string | null
  stats: PowerDialerSessionStats
  callWasAnswered: boolean
  instantFailCount: number
  disconnectedNumber: string | null
}

type PowerDialerAction =
  | { type: 'OPEN_SETUP' }
  | { type: 'CLOSE_SETUP' }
  | { type: 'OPEN_TEMPLATE_EDITOR' }
  | { type: 'CLOSE_TEMPLATE_EDITOR' }
  | { type: 'START_LOADING'; settings: PowerDialerSettings }
  | { type: 'QUEUE_LOADED'; queue: PowerDialerLead[] }
  | { type: 'PROCESS_LEAD' }
  | { type: 'NO_PHONE_FOUND' }
  | { type: 'CLOSE_SKIP_TRACE' }
  | { type: 'PHONE_RESOLVED'; phone: string; contactPhones?: string[] }
  | { type: 'SMS_SENDING' }
  | { type: 'SMS_SENT' }
  | { type: 'SMS_ERROR' }
  | { type: 'DIALING'; phone: string }
  | { type: 'CALL_LIVE' }
  | { type: 'CALL_ENDED_UNANSWERED' }
  | { type: 'REDIALING' }
  | { type: 'DISPOSITION' }
  | { type: 'RECORD_DISPOSITION'; disposition: string }
  | { type: 'DISPOSITION_COMPLETE'; disposition: string }
  | { type: 'AUTO_ADVANCE_NO_ANSWER' }
  | { type: 'CALL_FAILED_INSTANT' }
  | { type: 'NUMBER_DISCONNECTED'; phone: string; alternatePhones: string[] }
  | { type: 'PAUSE_AWAITING_CONTINUE' }
  | { type: 'SKIP_LEAD' }
  | { type: 'ADVANCE' }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'STOP' }
  | { type: 'SESSION_COMPLETE' }

function computeStats(queue: PowerDialerLead[]): PowerDialerSessionStats {
  return {
    total: queue.length,
    called: queue.filter(l => l.dialStatus === 'called' || l.dialStatus === 'interested' || l.dialStatus === 'not_interested').length,
    noAnswer: queue.filter(l => l.dialStatus === 'no_answer').length,
    interested: queue.filter(l => l.dialStatus === 'interested').length,
    notInterested: queue.filter(l => l.dialStatus === 'not_interested').length,
    skipped: queue.filter(l => l.dialStatus === 'skipped').length,
  }
}

const initialState: PowerDialerState = {
  mode: 'IDLE',
  queue: [],
  currentIndex: 0,
  settings: { listId: null, leadFilter: 'new' as const, doubleDial: false, preSms: false, smsTemplateIndex: 0 },
  dialAttempt: 1,
  smsStatus: 'idle',
  showSetupDialog: false,
  showSkipTraceDialog: false,
  showTemplateEditor: false,
  currentPhone: null,
  stats: { total: 0, called: 0, noAnswer: 0, interested: 0, notInterested: 0, skipped: 0 },
  callWasAnswered: false,
  instantFailCount: 0,
  disconnectedNumber: null,
}

function reducer(state: PowerDialerState, action: PowerDialerAction): PowerDialerState {
  switch (action.type) {
    case 'OPEN_SETUP':
      return { ...state, mode: 'SETUP', showSetupDialog: true }

    case 'CLOSE_SETUP':
      return { ...state, mode: state.queue.length > 0 ? state.mode : 'IDLE', showSetupDialog: false }

    case 'OPEN_TEMPLATE_EDITOR':
      return { ...state, showTemplateEditor: true }

    case 'CLOSE_TEMPLATE_EDITOR':
      return { ...state, showTemplateEditor: false }

    case 'START_LOADING':
      return { ...state, mode: 'LOADING_QUEUE', settings: action.settings, showSetupDialog: false }

    case 'QUEUE_LOADED':
      return {
        ...state,
        mode: 'READY',
        queue: action.queue,
        currentIndex: 0,
        dialAttempt: 1,
        callWasAnswered: false,
        instantFailCount: 0,
        disconnectedNumber: null,
        stats: computeStats(action.queue),
      }

    case 'PROCESS_LEAD':
      return { ...state, mode: 'READY', smsStatus: 'idle', currentPhone: null }

    case 'NO_PHONE_FOUND':
      return { ...state, mode: 'SKIP_TRACING', showSkipTraceDialog: true }

    case 'CLOSE_SKIP_TRACE':
      return { ...state, showSkipTraceDialog: false }

    case 'PHONE_RESOLVED': {
      const updatedQueue = [...state.queue]
      if (action.contactPhones && updatedQueue[state.currentIndex]) {
        updatedQueue[state.currentIndex] = {
          ...updatedQueue[state.currentIndex],
          contactPhones: action.contactPhones,
        }
      }
      return {
        ...state,
        queue: updatedQueue,
        currentPhone: action.phone,
        showSkipTraceDialog: false,
        mode: state.settings.preSms ? 'SENDING_SMS' : 'DIALING',
        smsStatus: state.settings.preSms ? 'sending' : 'idle',
      }

    }

    case 'SMS_SENDING':
      return { ...state, mode: 'SENDING_SMS', smsStatus: 'sending' }

    case 'SMS_SENT':
      return { ...state, smsStatus: 'sent', mode: 'DIALING' }

    case 'SMS_ERROR':
      return { ...state, smsStatus: 'error', mode: 'DIALING' } // Still dial even if SMS fails

    case 'DIALING':
      return { ...state, mode: 'DIALING', currentPhone: action.phone }

    case 'CALL_LIVE':
      return { ...state, mode: 'IN_CALL', callWasAnswered: true }

    case 'CALL_ENDED_UNANSWERED':
      // Sets REDIALING mode — the effect will initiate the actual redial
      return { ...state, mode: 'REDIALING', dialAttempt: 2, callWasAnswered: false }

    case 'REDIALING':
      return { ...state, mode: 'REDIALING' }

    case 'DISPOSITION': {
      // Only reached for answered calls; mark as 'called' until disposition is recorded
      const q = [...state.queue]
      if (q[state.currentIndex]) {
        q[state.currentIndex] = { ...q[state.currentIndex], dialStatus: 'called' }
      }
      return { ...state, mode: 'DISPOSITION', queue: q, stats: computeStats(q) }
    }

    case 'RECORD_DISPOSITION': {
      // Records disposition for the current lead without advancing or changing mode
      const q = [...state.queue]
      const lead = q[state.currentIndex]
      if (lead) {
        const statusMap: Record<string, PowerDialerLead['dialStatus']> = {
          'Interested': 'interested',
          'Not Interested': 'not_interested',
          'No Answer': 'no_answer',
          'Left Voicemail': 'no_answer',
          'Wrong Number': 'skipped',
        }
        q[state.currentIndex] = {
          ...lead,
          dialStatus: statusMap[action.disposition] || 'called',
        }
      }
      return { ...state, queue: q, stats: computeStats(q) }
    }

    case 'DISPOSITION_COMPLETE': {
      const q = [...state.queue]
      const lead = q[state.currentIndex]
      if (lead) {
        const statusMap: Record<string, PowerDialerLead['dialStatus']> = {
          'Interested': 'interested',
          'Not Interested': 'not_interested',
          'No Answer': 'no_answer',
          'Left Voicemail': 'no_answer',
          'Wrong Number': 'skipped',
        }
        q[state.currentIndex] = {
          ...lead,
          dialStatus: statusMap[action.disposition] || 'called',
        }
      }
      return { ...state, queue: q, stats: computeStats(q) }
    }

    case 'AUTO_ADVANCE_NO_ANSWER': {
      // Silently mark as no_answer and move to next lead — no disposition modal
      const q = [...state.queue]
      if (q[state.currentIndex]) {
        q[state.currentIndex] = { ...q[state.currentIndex], dialStatus: 'no_answer' }
      }
      const nextIndex = state.currentIndex + 1
      if (nextIndex >= q.length) {
        return { ...state, queue: q, stats: computeStats(q), mode: 'COMPLETED', currentIndex: nextIndex, dialAttempt: 1, callWasAnswered: false, currentPhone: null, instantFailCount: 0, disconnectedNumber: null }
      }
      return { ...state, queue: q, stats: computeStats(q), mode: 'READY', currentIndex: nextIndex, dialAttempt: 1, callWasAnswered: false, currentPhone: null, smsStatus: 'idle', instantFailCount: 0, disconnectedNumber: null }
    }

    case 'CALL_FAILED_INSTANT':
      // Increment instant fail count, stay in DIALING mode for auto-retry
      return { ...state, instantFailCount: state.instantFailCount + 1, mode: 'DIALING' }

    case 'NUMBER_DISCONNECTED': {
      // Number confirmed not in service after 2 instant fails, show dialog with available numbers
      return {
        ...state,
        mode: 'SKIP_TRACING',
        showSkipTraceDialog: true,
        disconnectedNumber: action.phone,
        instantFailCount: 0,
      }
    }

    case 'PAUSE_AWAITING_CONTINUE':
      return { ...state, mode: 'PAUSED_AWAITING_CONTINUE' }

    case 'SKIP_LEAD': {
      const q = [...state.queue]
      if (q[state.currentIndex]) {
        q[state.currentIndex] = { ...q[state.currentIndex], dialStatus: 'skipped' }
      }
      return { ...state, queue: q, showSkipTraceDialog: false, disconnectedNumber: null, stats: computeStats(q) }
    }

    case 'ADVANCE': {
      const nextIndex = state.currentIndex + 1
      if (nextIndex >= state.queue.length) {
        return { ...state, mode: 'COMPLETED', currentIndex: nextIndex, currentPhone: null, dialAttempt: 1, callWasAnswered: false, instantFailCount: 0, disconnectedNumber: null }
      }
      return { ...state, mode: 'READY', currentIndex: nextIndex, currentPhone: null, dialAttempt: 1, callWasAnswered: false, smsStatus: 'idle', instantFailCount: 0, disconnectedNumber: null }
    }

    case 'PAUSE':
      return { ...state, mode: 'PAUSED' }

    case 'RESUME':
      return { ...state, mode: 'READY' }

    case 'STOP':
      return { ...initialState }

    case 'SESSION_COMPLETE':
      return { ...state, mode: 'COMPLETED' }

    default:
      return state
  }
}

// ─── Hook ─────────────────────────────────────────────────────────

interface UsePowerDialerParams {
  callState: TwilioCallState
  duration: number
  deviceReady: boolean
  assignedPhoneNumber: string | null
  assignedPhoneNumberId: string | null
  makeCall: (to: string) => Promise<string | null>
  hangUp: () => void
  userId: string | undefined
}

type QueuePropertyRow = {
  id: string
  address: string
  city: string | null
  state: string | null
  zip: string | null
  owner_name: string | null
  owner_phone: string[] | null
  contacts: Array<{
    id: string
    phone_numbers: PhoneEntry[] | string[] | null
  }> | null
}

export function usePowerDialer({
  callState,
  duration,
  deviceReady,
  assignedPhoneNumber,
  assignedPhoneNumberId,
  makeCall,
  hangUp,
  userId,
}: UsePowerDialerParams) {
  const [state, dispatch] = useReducer(reducer, initialState)
  const router = useRouter()

  // Refs to track call state transitions without stale closures
  const prevCallStateRef = useRef<TwilioCallState>('idle')
  const durationRef = useRef(0)
  const stateRef = useRef(state)
  const redialTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const smsDelayTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const noAnswerTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const processLeadRef = useRef(false)
  const hangUpRef = useRef(hangUp)

  // Keep refs in sync
  useEffect(() => {
    stateRef.current = state
  }, [state])

  useEffect(() => {
    durationRef.current = duration
  }, [duration])

  useEffect(() => {
    hangUpRef.current = hangUp
  }, [hangUp])

  // ─── Queue Loading ──────────────────────────────────────────────

  const loadQueue = useCallback(async (settings: PowerDialerSettings) => {
    if (!userId) return

    dispatch({ type: 'START_LOADING', settings })

    try {
      const supabase = createClient()

      let query = supabase
        .from('properties')
        .select(`
          id, address, city, state, zip, owner_name, owner_phone, list_id,
          contacts:contacts(id, phone_numbers)
        `)
        .eq('created_by', userId)
        .eq('has_been_answered', false)

      if (settings.listId) {
        query = query.eq('list_id', settings.listId)
      } else if (settings.leadFilter === 'unanswered') {
        // Unanswered leads: status is 'unanswered' (called but never answered)
        query = query.eq('status', 'unanswered')
      } else {
        // "All New Leads" = status is 'new' AND never been called
        query = query.eq('status', 'new').is('last_called_at', null)
      }

      query = query.order('created_at', { ascending: true })

      const { data, error } = await query

      if (error) {
        toast.error('Failed to load leads: ' + error.message)
        dispatch({ type: 'STOP' })
        return
      }

      if (!data || data.length === 0) {
        toast.error('No leads found in this list')
        dispatch({ type: 'STOP' })
        return
      }

      const queue: PowerDialerLead[] = (data as QueuePropertyRow[]).map((p) => {
        const contacts = p.contacts || []
        const firstContact = contacts[0]
        return {
          propertyId: p.id,
          address: p.address,
          city: p.city,
          state: p.state,
          zip: p.zip,
          ownerName: p.owner_name,
          ownerPhone: p.owner_phone,
          contactId: firstContact?.id || null,
          contactPhones: firstContact?.phone_numbers || null,
          dialStatus: 'pending' as const,
        }
      })

      dispatch({ type: 'QUEUE_LOADED', queue })
      toast.success(`Loaded ${queue.length} leads`)
    } catch {
      toast.error('Failed to load queue')
      dispatch({ type: 'STOP' })
    }
  }, [userId])

  // ─── Process Current Lead ───────────────────────────────────────

  const processCurrentLead = useCallback(async () => {
    const s = stateRef.current
    if (s.mode !== 'READY' || processLeadRef.current) return
    if (s.currentIndex >= s.queue.length) {
      dispatch({ type: 'SESSION_COMPLETE' })
      return
    }

    processLeadRef.current = true

    const lead = s.queue[s.currentIndex]
    const phone = resolveBestPhone(lead)

    if (!phone) {
      dispatch({ type: 'NO_PHONE_FOUND' })
      processLeadRef.current = false
      return
    }

    const e164Phone = toE164(phone)

    // If pre-SMS is enabled, send SMS first
    if (s.settings.preSms) {
      dispatch({ type: 'PHONE_RESOLVED', phone: e164Phone })

      const templates = loadSmsTemplates()
      const template = templates[s.settings.smsTemplateIndex] || templates[0]
      const message = resolveTemplate(template, lead)

      dispatch({ type: 'SMS_SENDING' })

      try {
        const result = await api.sendSms(e164Phone, message, lead.contactId || undefined, lead.propertyId)
        if (result.error) {
          dispatch({ type: 'SMS_ERROR' })
          toast.error('SMS failed, proceeding to call')
        } else {
          dispatch({ type: 'SMS_SENT' })
        }
      } catch {
        dispatch({ type: 'SMS_ERROR' })
      }

      // Wait 3 seconds before dialing (whether SMS succeeded or failed)
      await new Promise(resolve => {
        smsDelayTimeoutRef.current = setTimeout(resolve, 3000)
      })
    } else {
      dispatch({ type: 'PHONE_RESOLVED', phone: e164Phone })
    }

    // Initiate the call
    dispatch({ type: 'DIALING', phone: e164Phone })
    try {
      const callId = await makeCall(e164Phone)
      if (!callId) {
        throw new Error('SignalWire call did not return an id')
      }
    } catch {
      toast.error('Failed to place call')
      dispatch({ type: 'DISPOSITION' })
    }

    processLeadRef.current = false
  }, [makeCall])

  // Auto-process lead when mode is READY
  useEffect(() => {
    if (state.mode === 'READY' && deviceReady && state.queue.length > 0) {
      // Delay to let UI update and ensure everything loads
      const timeout = setTimeout(() => {
        processCurrentLead()
      }, 2000)
      return () => clearTimeout(timeout)
    }
  }, [state.mode, state.currentIndex, deviceReady, state.queue.length, processCurrentLead])

  // ─── React to Twilio Call State Changes ─────────────────────────

  useEffect(() => {
    const s = stateRef.current
    const prevCallState = prevCallStateRef.current
    prevCallStateRef.current = callState

    // Only react in power dialer modes
    if (s.mode === 'IDLE' || s.mode === 'SETUP' || s.mode === 'LOADING_QUEUE' || s.mode === 'COMPLETED' || s.mode === 'PAUSED' || s.mode === 'PAUSED_AWAITING_CONTINUE') {
      return
    }

    // Call is ringing → start 25s no-answer timer
    if (callState === 'ringing' && prevCallState !== 'ringing' && (s.mode === 'DIALING' || s.mode === 'REDIALING')) {
      if (noAnswerTimeoutRef.current) clearTimeout(noAnswerTimeoutRef.current)
      noAnswerTimeoutRef.current = setTimeout(() => {
        // Auto-hangup after 25 seconds of ringing
        hangUpRef.current()
      }, 25000)
    }

    // Call connected → cancel ring timer, navigate to lead page
    if (callState === 'live' && prevCallState !== 'live') {
      if (noAnswerTimeoutRef.current) {
        clearTimeout(noAnswerTimeoutRef.current)
        noAnswerTimeoutRef.current = null
      }
      dispatch({ type: 'CALL_LIVE' })
      const lead = s.queue[s.currentIndex]
      if (lead) {
        router.push(`/leads/${lead.propertyId}`)
      }
    }

    // Call ended
    if (callState === 'ended' && prevCallState !== 'ended' && prevCallState !== 'idle') {
      if (noAnswerTimeoutRef.current) {
        clearTimeout(noAnswerTimeoutRef.current)
        noAnswerTimeoutRef.current = null
      }

      const wasAnswered = s.mode === 'IN_CALL'
      // Detect instant-fail: call ended without ever ringing (connecting → ended)
      const wasInstantFail = !wasAnswered && prevCallState === 'connecting' && (s.mode === 'DIALING' || s.mode === 'REDIALING')

      if (wasInstantFail) {
        // Number failed without ringing
        const failCount = s.instantFailCount + 1
        if (failCount < 2) {
          // First instant fail — retry once more after 1.5s
          dispatch({ type: 'CALL_FAILED_INSTANT' })
          toast.info('Call failed — retrying...')
          redialTimeoutRef.current = setTimeout(async () => {
          if (stateRef.current.currentPhone) {
            dispatch({ type: 'DIALING', phone: stateRef.current.currentPhone })
            try {
              const callId = await makeCall(stateRef.current.currentPhone)
              if (!callId) {
                throw new Error('SignalWire call did not return an id')
              }
            } catch {
              // If makeCall itself fails, treat as disconnected
              const lead = stateRef.current.queue[stateRef.current.currentIndex]
                const currentPhone = stateRef.current.currentPhone
                if (lead && currentPhone) {
                  // Find alternate phones (exclude disconnected one)
                  const allPhones = getAllPhones(lead)
                  const alternatePhones = allPhones.filter(p => toE164(p) !== currentPhone && p !== currentPhone)
                  dispatch({ type: 'NUMBER_DISCONNECTED', phone: currentPhone, alternatePhones })
                }
              }
            }
          }, 1500)
        } else {
          // Second instant fail — number is confirmed not in service
          const lead = s.queue[s.currentIndex]
          const currentPhone = s.currentPhone
          if (lead && currentPhone) {
            toast.error('Number not in service')
            // Find alternate phones (exclude disconnected one)
            const allPhones = getAllPhones(lead)
            const alternatePhones = allPhones.filter(p => toE164(p) !== currentPhone && p !== currentPhone)
            dispatch({ type: 'NUMBER_DISCONNECTED', phone: currentPhone, alternatePhones })
          }
        }
      } else if (wasAnswered) {
        // Call was answered — show disposition modal
        dispatch({ type: 'DISPOSITION' })
        // Mark lead as answered in the DB
        const lead = s.queue[s.currentIndex]
        if (lead) {
          const supabase = createClient()
          supabase
            .from('properties')
            .update({
              has_been_answered: true,
              status: 'contacted',
              status_changed_at: new Date().toISOString(),
              last_called_at: new Date().toISOString(),
            })
            .eq('id', lead.propertyId)
            .then()
        }
      } else if (s.settings.doubleDial && s.dialAttempt === 1) {
        // First attempt unanswered with double dial → redial after 2 seconds
        dispatch({ type: 'CALL_ENDED_UNANSWERED' })
        redialTimeoutRef.current = setTimeout(async () => {
          if (stateRef.current.currentPhone) {
            dispatch({ type: 'DIALING', phone: stateRef.current.currentPhone })
            try {
              const callId = await makeCall(stateRef.current.currentPhone)
              if (!callId) {
                throw new Error('SignalWire call did not return an id')
              }
            } catch {
              toast.error('Redial failed')
              dispatch({ type: 'AUTO_ADVANCE_NO_ANSWER' })
              // Track unanswered in DB + create call record
              const failedLead = stateRef.current.queue[stateRef.current.currentIndex]
              if (failedLead) {
                const sb = createClient()
                // Log unanswered call in calls table
                sb.from('calls').insert({
                  caller_id: userId,
                  user_phone_number_id: assignedPhoneNumberId || null,
                  to_number: stateRef.current.currentPhone,
                  status: 'no-answer',
                  duration: 0,
                  from_number: assignedPhoneNumber || '',
                  property_id: failedLead.propertyId,
                  ended_at: new Date().toISOString(),
                }).then()
                sb.rpc('increment_unanswered', { prop_id: failedLead.propertyId }).then(({ error: rpcErr }: { error: unknown }) => {
                  if (rpcErr) {
                    sb.from('properties')
                      .select('unanswered_count, status')
                      .eq('id', failedLead.propertyId)
                      .single()
                      .then(({ data: d }: { data: { unanswered_count?: number; status?: string } | null }) => {
                        const updates: Record<string, unknown> = {
                          unanswered_count: (d?.unanswered_count || 0) + 1,
                          last_called_at: new Date().toISOString(),
                        }
                        if (d?.status === 'new') {
                          updates.status = 'unanswered'
                          updates.status_changed_at = new Date().toISOString()
                        }
                        sb.from('properties')
                          .update(updates)
                          .eq('id', failedLead.propertyId)
                          .then()
                      })
                  }
                })
              }
            }
          }
        }, 8000)
      } else {
        // Unanswered (no double dial, or second attempt failed) → auto-advance silently
        dispatch({ type: 'AUTO_ADVANCE_NO_ANSWER' })
        // Track unanswered in DB + create call record
        const lead = s.queue[s.currentIndex]
        if (lead) {
          const supabase = createClient()
          // Log unanswered call in calls table
          supabase.from('calls').insert({
            caller_id: userId,
            user_phone_number_id: assignedPhoneNumberId || null,
            to_number: s.currentPhone,
            status: 'no-answer',
            duration: 0,
            from_number: assignedPhoneNumber || '',
            property_id: lead.propertyId,
            ended_at: new Date().toISOString(),
          }).then()
          supabase.rpc('increment_unanswered', { prop_id: lead.propertyId }).then(({ error }: { error: unknown }) => {
            if (error) {
              // Fallback: manual update
              supabase
                .from('properties')
                .select('unanswered_count, status')
                .eq('id', lead.propertyId)
                .single()
                .then(({ data }: { data: { unanswered_count?: number; status?: string } | null }) => {
                  const count = (data?.unanswered_count || 0) + 1
                  const updates: Record<string, unknown> = {
                    unanswered_count: count,
                    last_called_at: new Date().toISOString(),
                  }
                  if (data?.status === 'new') {
                    updates.status = 'unanswered'
                    updates.status_changed_at = new Date().toISOString()
                  }
                  supabase
                    .from('properties')
                    .update(updates)
                    .eq('id', lead.propertyId)
                    .then()
                })
            }
          })
        }
      }
    }
  }, [assignedPhoneNumber, assignedPhoneNumberId, callState, makeCall, router, userId])

  // ─── Cleanup ────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      if (redialTimeoutRef.current) clearTimeout(redialTimeoutRef.current)
      if (smsDelayTimeoutRef.current) clearTimeout(smsDelayTimeoutRef.current)
      if (noAnswerTimeoutRef.current) clearTimeout(noAnswerTimeoutRef.current)
    }
  }, [])

  // ─── Actions ────────────────────────────────────────────────────

  const openSetup = useCallback(() => {
    dispatch({ type: 'OPEN_SETUP' })
  }, [])

  const closeSetup = useCallback(() => {
    dispatch({ type: 'CLOSE_SETUP' })
  }, [])

  const startSession = useCallback(async (settings: PowerDialerSettings) => {
    await loadQueue(settings)
  }, [loadQueue])

  const pauseSession = useCallback(() => {
    dispatch({ type: 'PAUSE' })
  }, [])

  const resumeSession = useCallback(() => {
    dispatch({ type: 'RESUME' })
  }, [])

  const stopSession = useCallback(() => {
    if (redialTimeoutRef.current) clearTimeout(redialTimeoutRef.current)
    if (smsDelayTimeoutRef.current) clearTimeout(smsDelayTimeoutRef.current)
    if (noAnswerTimeoutRef.current) clearTimeout(noAnswerTimeoutRef.current)
    processLeadRef.current = false
    dispatch({ type: 'STOP' })
  }, [])

  const skipLead = useCallback(() => {
    dispatch({ type: 'SKIP_LEAD' })
    dispatch({ type: 'ADVANCE' })
  }, [])

  const advanceToNext = useCallback((disposition?: string) => {
    if (disposition) {
      dispatch({ type: 'DISPOSITION_COMPLETE', disposition })
    }
    dispatch({ type: 'ADVANCE' })
  }, [])

  const recordDisposition = useCallback((disposition: string) => {
    dispatch({ type: 'RECORD_DISPOSITION', disposition })
  }, [])

  const pauseAwaitingContinue = useCallback(() => {
    dispatch({ type: 'PAUSE_AWAITING_CONTINUE' })
  }, [])

  const continueAfterAnswered = useCallback(() => {
    dispatch({ type: 'ADVANCE' })
  }, [])

  const retryAfterSkipTrace = useCallback((phones: string[]) => {
    if (phones.length > 0) {
      dispatch({ type: 'PHONE_RESOLVED', phone: toE164(phones[0]), contactPhones: phones })
    } else {
      dispatch({ type: 'SKIP_LEAD' })
      dispatch({ type: 'ADVANCE' })
    }
  }, [])

  const openTemplateEditor = useCallback(() => {
    dispatch({ type: 'OPEN_TEMPLATE_EDITOR' })
  }, [])

  const closeTemplateEditor = useCallback(() => {
    dispatch({ type: 'CLOSE_TEMPLATE_EDITOR' })
  }, [])

  const closeSkipTrace = useCallback(() => {
    dispatch({ type: 'CLOSE_SKIP_TRACE' })
  }, [])

  const currentLead = state.queue[state.currentIndex] || null

  return {
    // State
    mode: state.mode,
    queue: state.queue,
    currentIndex: state.currentIndex,
    currentLead,
    settings: state.settings,
    dialAttempt: state.dialAttempt,
    smsStatus: state.smsStatus,
    currentPhone: state.currentPhone,
    stats: state.stats,
    showSetupDialog: state.showSetupDialog,
    showSkipTraceDialog: state.showSkipTraceDialog,
    showTemplateEditor: state.showTemplateEditor,
    disconnectedNumber: state.disconnectedNumber,

    // Actions
    openSetup,
    closeSetup,
    startSession,
    pauseSession,
    resumeSession,
    stopSession,
    skipLead,
    advanceToNext,
    recordDisposition,
    pauseAwaitingContinue,
    continueAfterAnswered,
    retryAfterSkipTrace,
    openTemplateEditor,
    closeTemplateEditor,
    closeSkipTrace,

    // Derived state
    callWasAnswered: state.callWasAnswered,
  }
}
