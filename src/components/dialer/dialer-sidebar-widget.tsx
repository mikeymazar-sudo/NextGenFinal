'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Phone, PhoneOff, Mic, MicOff, Delete, Loader2, ChevronDown, ChevronUp } from 'lucide-react'
import { useAuth } from '@/providers/auth-provider'
import { createClient } from '@/lib/supabase/client'
import { api } from '@/lib/api-client'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

type CallState = 'idle' | 'connecting' | 'ringing' | 'live' | 'ended'

const dialPad = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['*', '0', '#'],
]

export function DialerSidebarWidget() {
    const [number, setNumber] = useState('')
    const [callState, setCallState] = useState<CallState>('idle')
    const [muted, setMuted] = useState(false)
    const [duration, setDuration] = useState(0)
    const [showNotesModal, setShowNotesModal] = useState(false)
    const [callNotes, setCallNotes] = useState('')
    const [currentCallId, setCurrentCallId] = useState<string | null>(null)
    const [savingNotes, setSavingNotes] = useState(false)
    const [isExpanded, setIsExpanded] = useState(true)
    const timerRef = useRef<NodeJS.Timeout | null>(null)
    const { user } = useAuth()

    const searchParams = useSearchParams()
    const router = useRouter()
    const pathname = usePathname()

    // Check for number to dial from URL
    useEffect(() => {
        const dialNumber = searchParams.get('dial_number')
        if (dialNumber) {
            setNumber(dialNumber)
            setIsExpanded(true)
            // Optional: clean up URL
            // const params = new URLSearchParams(searchParams)
            // params.delete('dial_number')
            // router.replace(`${pathname}?${params.toString()}`, { scroll: false })
        }
    }, [searchParams, pathname, router])

    // Clean up timer on unmount
    useEffect(() => {
        return () => {
            if (timerRef.current) {
                clearInterval(timerRef.current)
            }
        }
    }, [])

    const startTimer = useCallback(() => {
        setDuration(0)
        if (timerRef.current) clearInterval(timerRef.current)
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
        setIsExpanded(true) // Ensure widget is expanded when call starts

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
        <div className="border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50">
            {/* Header / Toggle */}
            <div
                className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="flex items-center gap-2">
                    <div className={cn(
                        "h-2 w-2 rounded-full",
                        callState === 'live' ? "bg-green-500 animate-pulse" :
                            callState === 'ringing' ? "bg-blue-500 animate-pulse" :
                                callState === 'connecting' ? "bg-yellow-500" :
                                    "bg-zinc-300 dark:bg-zinc-600"
                    )} />
                    <span className="text-sm font-medium">Dialer</span>
                    {callState !== 'idle' && (
                        <span className="text-xs text-muted-foreground ml-1">
                            {callState === 'live' ? formatDuration(duration) : callState}
                        </span>
                    )}
                </div>
                {isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                )}
            </div>

            {/* Expanded Content */}
            {isExpanded && (
                <div className="px-4 pb-4 animate-in slide-in-from-top-2 duration-200">
                    {/* Number Display */}
                    <div className="mb-4">
                        <Input
                            value={number}
                            onChange={(e) => setNumber(e.target.value)}
                            placeholder="Enter number..."
                            className="text-center text-lg font-mono h-10 border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950"
                            disabled={callState !== 'idle'}
                        />
                    </div>

                    {/* Keypad */}
                    {callState === 'idle' && (
                        <div className="grid grid-cols-3 gap-2 mb-4">
                            {dialPad.flat().map((digit) => (
                                <Button
                                    key={digit}
                                    variant="outline"
                                    size="sm"
                                    className="h-10 text-sm font-medium bg-white dark:bg-zinc-950 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                                    onClick={() => addDigit(digit)}
                                >
                                    {digit}
                                </Button>
                            ))}
                        </div>
                    )}

                    {/* Controls */}
                    <div className="flex items-center justify-center gap-3">
                        {callState === 'idle' ? (
                            <>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-10 w-10 text-muted-foreground hover:text-foreground"
                                    onClick={deleteDigit}
                                    disabled={!number}
                                >
                                    <Delete className="h-5 w-5" />
                                </Button>
                                <Button
                                    size="icon"
                                    className="h-12 w-12 rounded-full bg-green-600 hover:bg-green-700 shadow-sm"
                                    onClick={makeCall}
                                    disabled={!number.trim()}
                                >
                                    <Phone className="h-5 w-5" />
                                </Button>
                            </>
                        ) : callState === 'connecting' ? (
                            <Button
                                size="icon"
                                className="h-12 w-12 rounded-full bg-red-600 hover:bg-red-700 shadow-sm"
                                onClick={hangUp}
                            >
                                <Loader2 className="h-5 w-5 animate-spin" />
                            </Button>
                        ) : (
                            <>
                                <Button
                                    variant="outline"
                                    size="icon"
                                    className={cn(
                                        "h-10 w-10 rounded-full",
                                        muted && "bg-red-50 border-red-200 text-red-600 dark:bg-red-950/30 dark:border-red-900/50 dark:text-red-400"
                                    )}
                                    onClick={() => setMuted(!muted)}
                                >
                                    {muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                                </Button>
                                <Button
                                    size="icon"
                                    className="h-12 w-12 rounded-full bg-red-600 hover:bg-red-700 shadow-sm"
                                    onClick={hangUp}
                                >
                                    <PhoneOff className="h-5 w-5" />
                                </Button>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* Call Notes Modal - Reused from page */}
            <Dialog open={showNotesModal} onOpenChange={(open) => {
                if (!open && !savingNotes) {
                    setShowNotesModal(false);
                    resetCall();
                }
            }}>
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
