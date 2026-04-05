'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  SignalWire,
  type FabricRoomSession,
  type IncomingCallNotification,
  type SignalWireClient,
} from '@signalwire/js'
import { api } from '@/lib/api/client'
import {
  findSignalWireOutboundAddressId,
  type SignalWireAddress,
} from '@/lib/signalwire/shared'
import { normalizePhoneNumber } from '@/lib/utils'

export type TwilioCallState = 'idle' | 'connecting' | 'ringing' | 'live' | 'ended'

type SignalWireCall = Pick<
  FabricRoomSession,
  'id' | 'on' | 'start' | 'hangup' | 'audioMute' | 'audioUnmute'
>
type SignalWireSubscriberInfoResult = {
  fabric_addresses?: SignalWireAddress[]
}

interface UseTwilioReturn {
  callState: TwilioCallState
  device: SignalWireClient | null
  deviceReady: boolean
  assignedPhoneNumber: string | null
  assignedPhoneNumberId: string | null
  makeCall: (toNumber: string) => Promise<string | null>
  hangUp: () => void
  toggleMute: () => void
  isMuted: boolean
  duration: number
  error: string | null
  currentCallSid: string | null
  retry: () => void
  initializing: boolean
}

interface UseTwilioOptions {
  suppressConfigurationErrors?: boolean
}

function getSignalWireErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) {
    if (error.name === 'NotAllowedError') {
      return 'Microphone access is blocked. Allow microphone access and try again.'
    }
    return error.message
  }

  if (typeof error === 'string' && error.trim()) {
    return error
  }

  if (error && typeof error === 'object') {
    const maybeError = error as Record<string, unknown>

    if (maybeError.name === 'NotAllowedError') {
      return 'Microphone access is blocked. Allow microphone access and try again.'
    }

    const candidateKeys = ['message', 'error', 'reason', 'description']
    for (const key of candidateKeys) {
      const value = maybeError[key]
      if (typeof value === 'string' && value.trim()) {
        return value
      }
    }

    const nestedError = maybeError.error
    if (nestedError && typeof nestedError === 'object') {
      const nestedMessage = (nestedError as Record<string, unknown>).message
      if (typeof nestedMessage === 'string' && nestedMessage.trim()) {
        return nestedMessage
      }
    }
  }

  return fallback
}

export function useTwilio({
  suppressConfigurationErrors = false,
}: UseTwilioOptions = {}): UseTwilioReturn {
  const [callState, setCallState] = useState<TwilioCallState>('idle')
  const [device, setDevice] = useState<SignalWireClient | null>(null)
  const [deviceReady, setDeviceReady] = useState(false)
  const [assignedPhoneNumber, setAssignedPhoneNumber] = useState<string | null>(null)
  const [assignedPhoneNumberId, setAssignedPhoneNumberId] = useState<string | null>(null)
  const [isMuted, setIsMuted] = useState(false)
  const [duration, setDuration] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [currentCallSid, setCurrentCallSid] = useState<string | null>(null)
  const [initializing, setInitializing] = useState(true)

  const clientRef = useRef<SignalWireClient | null>(null)
  const activeCallRef = useRef<SignalWireCall | null>(null)
  const outboundAddressIdRef = useRef<string | null>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const tokenRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const mountedRef = useRef(true)

  // Timer helpers
  const startTimer = useCallback(() => {
    setDuration(0)
    timerRef.current = setInterval(() => {
      setDuration((d) => d + 1)
    }, 1000)
  }, [])

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const clearClient = useCallback(async () => {
    if (tokenRefreshRef.current) {
      clearInterval(tokenRefreshRef.current)
      tokenRefreshRef.current = null
    }

    if (clientRef.current) {
      try {
        await clientRef.current.disconnect()
      } catch {
        try {
          await clientRef.current.offline()
        } catch {
          // Ignore cleanup errors while resetting the client state.
        }
      }
    }

    clientRef.current = null
    outboundAddressIdRef.current = null
    setAssignedPhoneNumber(null)
    setAssignedPhoneNumberId(null)
    activeCallRef.current = null

    if (mountedRef.current) {
      setDevice(null)
      setDeviceReady(false)
    }
  }, [])

  // Set up event handlers on a SignalWire call object (FabricRoomSession)
  const setupCallHandlers = useCallback((call: SignalWireCall) => {
    activeCallRef.current = call
    setCurrentCallSid(call.id || null)

    call.on('trying', () => {
      console.log('[SignalWire] Call trying')
      if (mountedRef.current) setCallState('connecting')
    })

    call.on('ringing', () => {
      console.log('[SignalWire] Call ringing')
      if (mountedRef.current) setCallState('ringing')
    })

    call.on('active', () => {
      console.log('[SignalWire] Call active/connected')
      if (mountedRef.current) {
        setCallState('live')
        startTimer()
      }
    })

    call.on('destroy', () => {
      console.log('[SignalWire] Call destroyed/ended')
      stopTimer()
      if (mountedRef.current) {
        setCallState('ended')
        setIsMuted(false)
      }
      activeCallRef.current = null
    })

    call.on('hangup', () => {
      console.log('[SignalWire] Call hung up')
      stopTimer()
      if (mountedRef.current) {
        setCallState('ended')
        setIsMuted(false)
      }
      activeCallRef.current = null
    })
  }, [startTimer, stopTimer])

  // Initialize SignalWire client
  const initDevice = useCallback(async () => {
    try {
      setError(null)
      setInitializing(true)

      console.log('[SignalWire] Fetching voice token...')
      const result = await api.getVoiceToken()

      if (!mountedRef.current) return

      if (result.error || !result.data) {
        const isConfigurationError = result.code === 'VOICE_NOT_CONFIGURED'
        const errorMsg = isConfigurationError
          ? 'Voice calling is not configured for this environment.'
          : result.error || 'Failed to get voice token'

        setError(
          isConfigurationError && suppressConfigurationErrors
            ? null
            : `Voice setup failed: ${errorMsg}`
        )
        setDeviceReady(false)
        setInitializing(false)
        return
      }

      const token = result.data.token
      const phoneNumber = result.data.phoneNumber
      const phoneNumberId = result.data.phoneNumberId || null
      let outboundAddressId = result.data.outboundAddressId || null
      console.log('[SignalWire] Token received, initializing client...')

      // Disconnect existing client if any
      await clearClient()

      const sw = await SignalWire({ token })

      if (!mountedRef.current) {
        try { await sw.offline() } catch {}
        return
      }

      await sw.online({
        incomingCallHandlers: {
          all: async (notification: IncomingCallNotification) => {
            console.log('[SignalWire] Incoming call')
            if (!mountedRef.current) return
            const call = await notification.invite.accept({ audio: true, video: false })
            setupCallHandlers(call)
          }
        }
      })

      if (!mountedRef.current) {
        try { await sw.offline() } catch {}
        return
      }

      if (!outboundAddressId) {
        try {
          const subscriberInfo = await sw.getSubscriberInfo() as SignalWireSubscriberInfoResult
          outboundAddressId = findSignalWireOutboundAddressId(
            subscriberInfo.fabric_addresses || [],
            phoneNumber
          )
        } catch (lookupError) {
          console.error('[SignalWire] Failed to resolve outbound address:', lookupError)
        }
      }

      if (!outboundAddressId) {
        const message =
          'No outbound SignalWire audio address is configured for this environment.'
        await sw.offline().catch(() => {})
        setError(`Voice setup failed: ${message}`)
        setInitializing(false)
        setDeviceReady(false)
        setDevice(null)
        return
      }

      clientRef.current = sw
      outboundAddressIdRef.current = outboundAddressId
      setAssignedPhoneNumber(phoneNumber)
      setAssignedPhoneNumberId(phoneNumberId)
      setDevice(sw)
      setDeviceReady(true)
      setError(null)
      setInitializing(false)
      console.log('[SignalWire] Client online and ready', {
        outboundAddressId,
      })

      // Proactively refresh token every 50 minutes (tokens last 2 hours)
      tokenRefreshRef.current = setInterval(async () => {
        try {
          console.log('[SignalWire] Refreshing token...')
          const refreshResult = await api.getVoiceToken()
          if (refreshResult.data?.token && clientRef.current) {
            outboundAddressIdRef.current =
              refreshResult.data.outboundAddressId || outboundAddressIdRef.current
            setAssignedPhoneNumber(refreshResult.data.phoneNumber || phoneNumber)
            setAssignedPhoneNumberId(refreshResult.data.phoneNumberId || phoneNumberId)
            await clientRef.current.updateToken(refreshResult.data.token)
          }
        } catch (e) {
          console.error('[SignalWire] Token refresh failed:', e)
        }
      }, 50 * 60 * 1000)

    } catch (err: unknown) {
      if (!mountedRef.current) return
      const message = getSignalWireErrorMessage(err, 'Failed to initialize SignalWire')
      console.error('[SignalWire] Init error:', err)
      setError(`Voice setup failed: ${message}`)
      setInitializing(false)
    }
  }, [clearClient, setupCallHandlers, suppressConfigurationErrors])

  // Make a call
  const makeCall = useCallback(async (toNumber: string): Promise<string | null> => {
    if (!clientRef.current || !deviceReady) {
      const message = 'SignalWire device not ready. Click retry to reconnect.'
      setError(message)
      throw new Error(message)
    }

    const normalizedToNumber = normalizePhoneNumber(toNumber)
    if (!normalizedToNumber) {
      const message = 'Invalid phone number. Use a valid 10-digit or E.164 number.'
      setError(message)
      setCallState('idle')
      throw new Error(message)
    }

    if (!outboundAddressIdRef.current) {
      const message =
        'SignalWire outbound caller address is not configured. Retry after reconnecting.'
      setError(message)
      setCallState('idle')
      throw new Error(message)
    }

    try {
      setError(null)
      setCallState('connecting')
      setDuration(0)

      const call = await clientRef.current.dial({
        fromFabricAddressId: outboundAddressIdRef.current,
        to: normalizedToNumber,
        audio: true,
        video: false,
      })

      setupCallHandlers(call)

      if (typeof call.start === 'function') {
        await call.start()
      }

      return call.id || null
    } catch (err: unknown) {
      const message = getSignalWireErrorMessage(err, 'Failed to make call')
      console.error('[SignalWire] makeCall error:', err)
      setError(message)
      setCallState('idle')
      throw err instanceof Error ? err : new Error(message)
    }
  }, [deviceReady, setupCallHandlers])

  // Hang up
  const hangUp = useCallback(() => {
    if (activeCallRef.current) {
      activeCallRef.current.hangup().catch(console.error)
    }
    stopTimer()
  }, [stopTimer])

  // Toggle mute
  const toggleMute = useCallback(() => {
    if (activeCallRef.current) {
      const newMuted = !isMuted
      if (newMuted) {
        activeCallRef.current.audioMute().catch(console.error)
      } else {
        activeCallRef.current.audioUnmute().catch(console.error)
      }
      setIsMuted(newMuted)
    }
  }, [isMuted])

  // Retry connection
  const retry = useCallback(() => {
    console.log('[SignalWire] Retrying initialization...')
    setDeviceReady(false)
    setDevice(null)
    clearClient().finally(() => {
      void initDevice()
    })
  }, [clearClient, initDevice])

  // Initialize on mount
  useEffect(() => {
    mountedRef.current = true
    const initTimer = setTimeout(() => {
      void initDevice()
    }, 0)

    return () => {
      clearTimeout(initTimer)
      mountedRef.current = false
      void clearClient()
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
    }
  }, [clearClient, initDevice])

  return {
    callState,
    device,
    deviceReady,
    assignedPhoneNumber,
    assignedPhoneNumberId,
    makeCall,
    hangUp,
    toggleMute,
    isMuted,
    duration,
    error,
    currentCallSid,
    retry,
    initializing,
  }
}
