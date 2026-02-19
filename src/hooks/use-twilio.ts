'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Device, Call } from '@twilio/voice-sdk'
import { api } from '@/lib/api/client'

export type TwilioCallState = 'idle' | 'connecting' | 'ringing' | 'live' | 'ended'

interface UseTwilioReturn {
  callState: TwilioCallState
  device: Device | null
  deviceReady: boolean
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

export function useTwilio(): UseTwilioReturn {
  const [callState, setCallState] = useState<TwilioCallState>('idle')
  const [deviceReady, setDeviceReady] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [duration, setDuration] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [currentCallSid, setCurrentCallSid] = useState<string | null>(null)
  const [initializing, setInitializing] = useState(true)

  const deviceRef = useRef<Device | null>(null)
  const activeCallRef = useRef<Call | null>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const tokenRefreshRef = useRef<NodeJS.Timeout | null>(null)
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

  // Set up event handlers on a Call object
  const setupCallHandlers = useCallback((call: Call) => {
    activeCallRef.current = call
    setCurrentCallSid(call.parameters.CallSid || null)

    call.on('ringing', () => {
      console.log('[Twilio] Call ringing')
      setCallState('ringing')
    })

    call.on('accept', () => {
      console.log('[Twilio] Call accepted/connected')
      setCallState('live')
      startTimer()
    })

    call.on('disconnect', () => {
      console.log('[Twilio] Call disconnected')
      stopTimer()
      setCallState('ended')
      activeCallRef.current = null
      setIsMuted(false)
    })

    call.on('cancel', () => {
      console.log('[Twilio] Call cancelled')
      stopTimer()
      setCallState('ended')
      activeCallRef.current = null
      setIsMuted(false)
    })

    call.on('error', (err) => {
      console.error('[Twilio] Call error:', err)
      stopTimer()
      setError(err.message || 'Call error')
      setCallState('ended')
      activeCallRef.current = null
      setIsMuted(false)
    })
  }, [startTimer, stopTimer])

  // Initialize Device
  const initDevice = useCallback(async () => {
    try {
      setError(null)
      setInitializing(true)

      console.log('[Twilio] Fetching voice token...')
      const result = await api.getVoiceToken()

      if (!mountedRef.current) return

      if (result.error || !result.data) {
        const errorMsg = result.error || 'Failed to get voice token'
        console.error('[Twilio] Token error:', errorMsg, 'Code:', result.code)
        setError(`Voice setup failed: ${errorMsg}`)
        setInitializing(false)
        return
      }

      const token = result.data.token
      console.log('[Twilio] Token received, initializing device...')

      // Destroy existing device if any
      if (deviceRef.current) {
        deviceRef.current.destroy()
      }

      const device = new Device(token, {
        codecPreferences: [Call.Codec.Opus, Call.Codec.PCMU],
        logLevel: 1,
      })

      device.on('registered', () => {
        console.log('[Twilio] Device registered and ready')
        if (mountedRef.current) {
          setDeviceReady(true)
          setError(null)
          setInitializing(false)
        }
      })

      device.on('unregistered', () => {
        console.log('[Twilio] Device unregistered')
        if (mountedRef.current) {
          setDeviceReady(false)
        }
      })

      device.on('error', (err) => {
        console.error('[Twilio] Device error:', err.message)
        if (mountedRef.current) {
          setError(`Twilio: ${err.message}`)
        }
      })

      device.on('tokenWillExpire', async () => {
        console.log('[Twilio] Token expiring, refreshing...')
        try {
          const refreshResult = await api.getVoiceToken()
          if (refreshResult.data?.token) {
            device.updateToken(refreshResult.data.token)
          }
        } catch (e) {
          console.error('[Twilio] Token refresh failed:', e)
        }
      })

      device.on('incoming', (call: Call) => {
        console.log('[Twilio] Incoming call from:', call.parameters.From)
        call.accept()
        setupCallHandlers(call)
      })

      await device.register()
      deviceRef.current = device

    } catch (err: unknown) {
      if (!mountedRef.current) return
      const message = err instanceof Error ? err.message : 'Failed to initialize Twilio'
      console.error('[Twilio] Init error:', err)
      setError(`Voice setup failed: ${message}`)
      setInitializing(false)
    }
  }, [setupCallHandlers])

  // Make a call
  const makeCall = useCallback(async (toNumber: string): Promise<string | null> => {
    if (!deviceRef.current || !deviceReady) {
      setError('Twilio device not ready. Click retry to reconnect.')
      return null
    }

    try {
      setError(null)
      setCallState('connecting')
      setDuration(0)

      const call = await deviceRef.current.connect({
        params: {
          To: toNumber,
        },
      })

      setupCallHandlers(call)
      return call.parameters.CallSid || null
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to make call'
      console.error('[Twilio] makeCall error:', err)
      setError(message)
      setCallState('idle')
      return null
    }
  }, [deviceReady, setupCallHandlers])

  // Hang up
  const hangUp = useCallback(() => {
    if (activeCallRef.current) {
      activeCallRef.current.disconnect()
    }
    stopTimer()
  }, [stopTimer])

  // Toggle mute
  const toggleMute = useCallback(() => {
    if (activeCallRef.current) {
      const newMuted = !isMuted
      activeCallRef.current.mute(newMuted)
      setIsMuted(newMuted)
    }
  }, [isMuted])

  // Retry connection
  const retry = useCallback(() => {
    console.log('[Twilio] Retrying initialization...')
    setDeviceReady(false)
    if (deviceRef.current) {
      deviceRef.current.destroy()
      deviceRef.current = null
    }
    initDevice()
  }, [initDevice])

  // Initialize on mount
  useEffect(() => {
    mountedRef.current = true
    initDevice()

    return () => {
      mountedRef.current = false
      if (deviceRef.current) {
        deviceRef.current.destroy()
        deviceRef.current = null
      }
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
      if (tokenRefreshRef.current) {
        clearTimeout(tokenRefreshRef.current)
      }
    }
  }, [initDevice])

  return {
    callState,
    device: deviceRef.current,
    deviceReady,
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
