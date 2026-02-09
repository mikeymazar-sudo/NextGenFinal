'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Phone, PhoneOff, Mic, MicOff, Delete, Loader2 } from 'lucide-react'
import { useAuth } from '@/providers/auth-provider'
import { createClient } from '@/lib/supabase/client'
import { api } from '@/lib/api-client'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'
import type { Call } from '@/types/schema'
import { useSearchParams } from 'next/navigation'

type CallState = 'idle' | 'connecting' | 'ringing' | 'live' | 'ended'

const dialPad = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['*', '0', '#'],
]

export default function DialerPage() {
  const [number, setNumber] = useState('')
  const [callState, setCallState] = useState<CallState>('idle')
  const [muted, setMuted] = useState(false)
  const [duration, setDuration] = useState(0)
  const [calls, setCalls] = useState<Call[]>([])
  const [loadingCalls, setLoadingCalls] = useState(true)
  const [showNotesModal, setShowNotesModal] = useState(false)
  const [callNotes, setCallNotes] = useState('')
  const [currentCallId, setCurrentCallId] = useState<string | null>(null)
  const [savingNotes, setSavingNotes] = useState(false)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const { user } = useAuth()
  const searchParams = useSearchParams()

  // Pre-fill number from URL params
  useEffect(() => {
    const num = searchParams.get('number')
    if (num) setNumber(num)
  }, [searchParams])

  // Fetch call history
  useEffect(() => {
    if (!user) return
    const fetchCalls = async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('calls')
        .select('*')
        .eq('caller_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20)
      setCalls((data as Call[]) || [])
      setLoadingCalls(false)
    }
    fetchCalls()
  }, [user])

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

  const makeCall = async () => {
    if (!number.trim()) return

    setCallState('connecting')

    try {
      // In a full implementation, this would use the Twilio Voice SDK
      // For now, we'll create a call record and simulate
      const supabase = createClient()
      const { data: callRecord } = await supabase
        .from('calls')
        .insert({
          caller_id: user?.id,
          to_number: number,
          status: 'initiated',
          from_number: process.env.NEXT_PUBLIC_TWILIO_PHONE || '',
        })
        .select()
        .single()

      if (callRecord) {
        setCurrentCallId(callRecord.id)
      }

      setCallState('ringing')
      setTimeout(() => {
        setCallState('live')
        startTimer()
      }, 2000)
    } catch {
      toast.error('Failed to connect call')
      setCallState('idle')
    }
  }

  const hangUp = async () => {
    stopTimer()
    setCallState('ended')

    // Update call record
    if (currentCallId) {
      const supabase = createClient()
      await supabase
        .from('calls')
        .update({
          status: 'completed',
          duration,
          ended_at: new Date().toISOString(),
        })
        .eq('id', currentCallId)
    }

    setShowNotesModal(true)
  }

  const saveCallNotes = async () => {
    if (!currentCallId) {
      setShowNotesModal(false)
      resetCall()
      return
    }

    setSavingNotes(true)
    const result = await api.updateCallNotes(currentCallId, callNotes)
    setSavingNotes(false)

    if (result.error) {
      toast.error('Failed to save notes')
    } else {
      toast.success('Call notes saved')
    }

    setShowNotesModal(false)
    resetCall()

    // Refresh call history
    if (user) {
      const supabase = createClient()
      const { data } = await supabase
        .from('calls')
        .select('*')
        .eq('caller_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20)
      setCalls((data as Call[]) || [])
    }
  }

  const resetCall = () => {
    setCallState('idle')
    setDuration(0)
    setCallNotes('')
    setCurrentCallId(null)
    setMuted(false)
  }

  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  const addDigit = (digit: string) => {
    setNumber((n) => n + digit)
  }

  const deleteDigit = () => {
    setNumber((n) => n.slice(0, -1))
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Dialer</h1>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Dialer */}
        <Card className="shadow-sm">
          <CardContent className="p-6">
            {/* Number display */}
            <div className="text-center mb-6">
              <Input
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                placeholder="Enter phone number"
                className="text-center text-2xl font-mono h-14 border-none shadow-none focus-visible:ring-0"
                disabled={callState !== 'idle'}
              />
              {callState === 'live' && (
                <p className="text-sm text-green-600 font-medium mt-2 animate-pulse">
                  {formatDuration(duration)}
                </p>
              )}
              {callState === 'connecting' && (
                <p className="text-sm text-yellow-600 mt-2">Connecting...</p>
              )}
              {callState === 'ringing' && (
                <p className="text-sm text-blue-600 mt-2 animate-pulse">Ringing...</p>
              )}
            </div>

            {/* Number pad */}
            {callState === 'idle' && (
              <div className="grid grid-cols-3 gap-3 mb-6">
                {dialPad.flat().map((digit) => (
                  <Button
                    key={digit}
                    variant="outline"
                    className="h-14 text-xl font-medium"
                    onClick={() => addDigit(digit)}
                  >
                    {digit}
                  </Button>
                ))}
              </div>
            )}

            {/* Action buttons */}
            <div className="flex items-center justify-center gap-4">
              {callState === 'idle' ? (
                <>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-12 w-12 rounded-full"
                    onClick={deleteDigit}
                    disabled={!number}
                  >
                    <Delete className="h-5 w-5" />
                  </Button>
                  <Button
                    size="icon"
                    className="h-16 w-16 rounded-full bg-green-600 hover:bg-green-700"
                    onClick={makeCall}
                    disabled={!number.trim()}
                  >
                    <Phone className="h-6 w-6" />
                  </Button>
                </>
              ) : callState === 'connecting' ? (
                <Button
                  size="icon"
                  className="h-16 w-16 rounded-full bg-red-600 hover:bg-red-700"
                  onClick={hangUp}
                >
                  <Loader2 className="h-6 w-6 animate-spin" />
                </Button>
              ) : (
                <>
                  <Button
                    variant="outline"
                    size="icon"
                    className={`h-12 w-12 rounded-full ${muted ? 'bg-red-50 border-red-200' : ''}`}
                    onClick={() => setMuted(!muted)}
                  >
                    {muted ? <MicOff className="h-5 w-5 text-red-500" /> : <Mic className="h-5 w-5" />}
                  </Button>
                  <Button
                    size="icon"
                    className="h-16 w-16 rounded-full bg-red-600 hover:bg-red-700"
                    onClick={hangUp}
                  >
                    <PhoneOff className="h-6 w-6" />
                  </Button>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Call History */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Call History</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingCalls ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : calls.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No call history yet.
              </p>
            ) : (
              <div className="space-y-2 max-h-[500px] overflow-y-auto">
                {calls.map((call) => (
                  <div
                    key={call.id}
                    className="flex items-center justify-between p-3 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 cursor-pointer transition-colors"
                    onClick={() => {
                      if (callState === 'idle') setNumber(call.to_number || '')
                    }}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-mono font-medium">{call.to_number || 'Unknown'}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDuration(call.duration || 0)} &middot;{' '}
                        {formatDistanceToNow(new Date(call.created_at), { addSuffix: true })}
                      </p>
                      {call.notes && (
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {call.notes}
                        </p>
                      )}
                    </div>
                    <Badge variant="secondary" className="text-xs flex-shrink-0 ml-2">
                      {call.status || 'unknown'}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Call Notes Modal */}
      <Dialog open={showNotesModal} onOpenChange={setShowNotesModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Call Notes</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              <p>Called: {number}</p>
              <p>Duration: {formatDuration(duration)}</p>
            </div>
            <Textarea
              placeholder="Add notes about this call..."
              value={callNotes}
              onChange={(e) => setCallNotes(e.target.value)}
              className="min-h-[120px]"
            />
            <div className="flex flex-wrap gap-2">
              {['No Answer', 'Left Voicemail', 'Interested', 'Not Interested', 'Wrong Number'].map((tag) => (
                <Button
                  key={tag}
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => setCallNotes((n) => (n ? `${n}\n${tag}` : tag))}
                >
                  {tag}
                </Button>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowNotesModal(false); resetCall() }}>
              Skip
            </Button>
            <Button onClick={saveCallNotes} disabled={savingNotes}>
              {savingNotes && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save & Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
