'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useSearchParams, usePathname } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog'
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { Textarea } from '@/components/ui/textarea'
import { Phone, PhoneOff, Mic, MicOff, Delete, Loader2, ChevronDown, ChevronUp, User, Zap, CalendarIcon } from 'lucide-react'
import { format } from 'date-fns'
import { useAuth } from '@/providers/auth-provider'
import { createClient } from '@/lib/supabase/client'
import { api } from '@/lib/api/client'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useTwilio } from '@/hooks/use-twilio'
import { usePowerDialer } from '@/hooks/use-power-dialer'
import { PowerDialerSetupDialog } from './power-dialer-setup-dialog'
import { PowerDialerControls } from './power-dialer-controls'
import { PowerDialerSkipTraceDialog } from './power-dialer-skip-trace-dialog'
import { SMSTemplateEditorDialog } from './sms-template-editor-dialog'
import { extractPhoneNumberValue, normalizePhoneNumber } from '@/lib/utils'

const dialPad = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['*', '0', '#'],
]

// Quick note tags used in both manual and power dialer disposition
const QUICK_TAGS = ['No Answer', 'Left Voicemail', 'Interested', 'Not Interested', 'Wrong Number']

export function DialerSidebarWidget() {
    const [number, setNumber] = useState('')
    const [showNotesModal, setShowNotesModal] = useState(false)
    const [callNotes, setCallNotes] = useState('')
    const [currentCallId, setCurrentCallId] = useState<string | null>(null)
    const [savingNotes, setSavingNotes] = useState(false)
    const [isExpanded, setIsExpanded] = useState(true)
    const [contactName, setContactName] = useState<string | null>(null)
    const [propertyAddress, setPropertyAddress] = useState<string | null>(null)
    const [pendingAutoCall, setPendingAutoCall] = useState(false)
    const [propertyId, setPropertyId] = useState<string | null>(null)
    // Track which tag was last clicked for power dialer disposition
    const [lastTag, setLastTag] = useState<string | null>(null)
    const [followUpDate, setFollowUpDate] = useState<Date | undefined>(undefined)
    // Track if the current manual call was answered (went to 'live' state)
    const manualCallAnsweredRef = useRef(false)
    const autoCallProcessedRef = useRef<string | null>(null)
    const { user } = useAuth()

    const searchParams = useSearchParams()
    const pathname = usePathname()

    const {
        callState,
        deviceReady,
        assignedPhoneNumber,
        assignedPhoneNumberId,
        makeCall: twilioMakeCall,
        hangUp: twilioHangUp,
        toggleMute,
        isMuted,
        duration,
        error: twilioError,
        retry,
        initializing,
    } = useTwilio({ suppressConfigurationErrors: true })

    // ─── Power Dialer ────────────────────────────────────────────
    const powerDialer = usePowerDialer({
        callState,
        duration,
        deviceReady,
        assignedPhoneNumber,
        assignedPhoneNumberId,
        makeCall: twilioMakeCall,
        hangUp: twilioHangUp,
        userId: user?.id,
    })

    const isPowerDialerActive = powerDialer.mode !== 'IDLE'

    // Show Twilio errors
    useEffect(() => {
        if (twilioError) {
            toast.error(twilioError)
        }
    }, [twilioError])

    // Clear URL params helper
    const clearDialParams = useCallback(() => {
        const url = new URL(window.location.href)
        url.searchParams.delete('dial_number')
        url.searchParams.delete('auto_call')
        url.searchParams.delete('contact_name')
        url.searchParams.delete('property_address')
        url.searchParams.delete('property_id')
        window.history.replaceState({}, '', url.toString())
    }, [])

    const initiateAutoCall = useCallback(async (phoneNumber: string, associatedPropertyId?: string | null) => {
        // Clear URL params immediately to prevent re-triggers
        clearDialParams()

        // Small delay to let state settle
        await new Promise(r => setTimeout(r, 100))

        const normalizedNumber = normalizePhoneNumber(phoneNumber)
        if (!normalizedNumber) {
            toast.error('Invalid phone number')
            return
        }

        try {
            const supabase = createClient()
            const { data: callRecord } = await supabase
                .from('calls')
                .insert({
                    caller_id: user?.id,
                    user_phone_number_id: assignedPhoneNumberId || null,
                    to_number: normalizedNumber,
                    status: 'initiated',
                    from_number: assignedPhoneNumber || '',
                    property_id: associatedPropertyId || propertyId,
                })
                .select()
                .single()

            if (callRecord) {
                setCurrentCallId(callRecord.id)
            }

            const callSid = await twilioMakeCall(normalizedNumber)
            if (!callSid) {
                throw new Error('SignalWire call did not return an id')
            }

            if (callRecord) {
                await supabase
                    .from('calls')
                    .update({ twilio_call_sid: callSid })
                    .eq('id', callRecord.id)
            }
        } catch {
            toast.error('Failed to connect call')
        }
    }, [assignedPhoneNumber, assignedPhoneNumberId, clearDialParams, propertyId, twilioMakeCall, user?.id])

    // Check for number to dial from URL + auto_call support
    useEffect(() => {
        // Don't process URL params when power dialer is active
        if (isPowerDialerActive) return

        const dialNumber = searchParams.get('dial_number')
        const autoCall = searchParams.get('auto_call')
        const contactNameParam = searchParams.get('contact_name')
        const propertyAddressParam = searchParams.get('property_address')
        const propertyIdParam = searchParams.get('property_id')

        // Try to extract property ID from pathname if not in params
        let derivedPropertyId = propertyIdParam
        if (!derivedPropertyId) {
            const match = pathname?.match(/\/leads\/([0-9a-fA-F-]{36})/)
            if (match) {
                derivedPropertyId = match[1]
            }
        }

        if (derivedPropertyId) {
            setPropertyId(derivedPropertyId)
        }

        if (dialNumber) {
            const callKey = `${dialNumber}-${autoCall}`
            if (autoCallProcessedRef.current === callKey) return

            const cleanedDialNumber = extractPhoneNumberValue(dialNumber)
            setNumber(cleanedDialNumber)
            setIsExpanded(true)

            if (contactNameParam) setContactName(decodeURIComponent(contactNameParam))
            if (propertyAddressParam) setPropertyAddress(decodeURIComponent(propertyAddressParam))

            if (autoCall === 'true') {
                autoCallProcessedRef.current = callKey
                if (deviceReady && callState === 'idle') {
                    initiateAutoCall(cleanedDialNumber, derivedPropertyId)
                } else {
                    setPendingAutoCall(true)
                }
            }
        }
    }, [searchParams, pathname, deviceReady, callState, initiateAutoCall, isPowerDialerActive])

    // Handle pending auto-call when device becomes ready
    useEffect(() => {
        if (pendingAutoCall && deviceReady && callState === 'idle' && number) {
            setPendingAutoCall(false)
            initiateAutoCall(number, propertyId)
        }
    }, [pendingAutoCall, deviceReady, callState, number, propertyId, initiateAutoCall])

    // Track when manual call goes live (answered)
    useEffect(() => {
        if (callState === 'live' && !isPowerDialerActive) {
            manualCallAnsweredRef.current = true
        }
    }, [callState, isPowerDialerActive])

    // When manual call ends: show notes if answered, track unanswered if not
    useEffect(() => {
        if (callState === 'ended' && currentCallId && !isPowerDialerActive) {
            if (manualCallAnsweredRef.current) {
                // Call was answered → show notes modal
                setShowNotesModal(true)
                // Mark lead as answered and move to contacted
                const pid = propertyId
                if (pid) {
                    const supabase = createClient()
                    supabase
                        .from('properties')
                        .update({
                            has_been_answered: true,
                            status: 'contacted',
                            status_changed_at: new Date().toISOString(),
                            last_called_at: new Date().toISOString(),
                        })
                        .eq('id', pid)
                        .then()
                }
            } else {
                // Call was unanswered → silently mark as unanswered
                const pid = propertyId
                if (pid) {
                    const supabase = createClient()
                    supabase.rpc('increment_unanswered', { prop_id: pid }).then(({ error }: { error: unknown }) => {
                        if (error) {
                            // Fallback: do a manual update
                            supabase
                                .from('properties')
                                .select('unanswered_count, status')
                                .eq('id', pid)
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
                                        .eq('id', pid)
                                        .then()
                                })
                        }
                    })
                }
                resetCall()
            }
        }
    }, [callState, currentCallId, isPowerDialerActive, propertyId])

    // Open notes modal when power dialer enters DISPOSITION mode
    useEffect(() => {
        if (isPowerDialerActive && powerDialer.mode === 'DISPOSITION') {
            setCallNotes('')
            setLastTag(null)
            setShowNotesModal(true)
        }
    }, [isPowerDialerActive, powerDialer.mode])

    // Keep dialer expanded when power dialer is active
    useEffect(() => {
        if (isPowerDialerActive) {
            setIsExpanded(true)
        }
    }, [isPowerDialerActive])

    const makeCall = async () => {
        if (!number.trim()) return

        setIsExpanded(true)

        const normalizedNumber = normalizePhoneNumber(number)
        if (!normalizedNumber) {
            toast.error('Enter a valid phone number')
            return
        }

        try {
            const supabase = createClient()
            const { data: callRecord } = await supabase
                .from('calls')
                .insert({
                    caller_id: user?.id,
                    user_phone_number_id: assignedPhoneNumberId || null,
                    to_number: normalizedNumber,
                    status: 'initiated',
                    from_number: assignedPhoneNumber || '',
                    property_id: propertyId,
                })
                .select()
                .single()

            if (callRecord) {
                setCurrentCallId(callRecord.id)
            }

            const callSid = await twilioMakeCall(normalizedNumber)
            if (!callSid) {
                throw new Error('SignalWire call did not return an id')
            }

            if (callRecord) {
                await supabase
                    .from('calls')
                    .update({ twilio_call_sid: callSid })
                    .eq('id', callRecord.id)
            }
        } catch {
            toast.error('Failed to connect call')
        }
    }

    const hangUp = async () => {
        setPendingAutoCall(false)
        twilioHangUp()

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
        } else {
            resetCall()
        }
    }

    const saveCallNotes = async () => {
        if (isPowerDialerActive) {
            // Power dialer mode: save notes then pause for user to review lead
            if (currentCallId) {
                setSavingNotes(true)
                const result = await api.updateCallNotes(currentCallId, callNotes)
                setSavingNotes(false)
                if (result.error) {
                    toast.error('Failed to save notes')
                } else {
                    toast.success('Call notes saved')
                }
            }
            // Move power dialer lead to contacted (only follow_up if user scheduled a follow-up)
            const lead = powerDialer.currentLead
            if (lead) {
                const supabase = createClient()
                await supabase
                    .from('properties')
                    .update({
                        has_been_answered: true,
                        status: followUpDate ? 'follow_up' : 'contacted',
                        status_changed_at: new Date().toISOString(),
                        last_called_at: new Date().toISOString(),
                        follow_up_date: followUpDate ? format(followUpDate, 'yyyy-MM-dd') : null,
                    })
                    .eq('id', lead.propertyId)
            }
            setShowNotesModal(false)
            setCallNotes('')
            setFollowUpDate(undefined)
            setCurrentCallId(null)
            // Record the disposition tag without advancing, then wait for user to press Continue
            if (lastTag) {
                powerDialer.recordDisposition(lastTag)
            }
            powerDialer.pauseAwaitingContinue()
            setLastTag(null)
            return
        }

        // Normal mode
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

        // Save follow-up date if set
        if (propertyId) {
            const supabase = createClient()
            await supabase
                .from('properties')
                .update({
                    follow_up_date: followUpDate ? format(followUpDate, 'yyyy-MM-dd') : null,
                })
                .eq('id', propertyId)
        }

        setShowNotesModal(false)
        setFollowUpDate(undefined)
        resetCall()
    }

    const skipNotesModal = async () => {
        setShowNotesModal(false)
        if (isPowerDialerActive) {
            // On skip, move answered lead to contacted
            const lead = powerDialer.currentLead
            if (lead) {
                const supabase = createClient()
                await supabase
                    .from('properties')
                    .update({
                        has_been_answered: true,
                        status: 'contacted',
                        status_changed_at: new Date().toISOString(),
                        last_called_at: new Date().toISOString(),
                    })
                    .eq('id', lead.propertyId)
            }
            setCallNotes('')
            setFollowUpDate(undefined)
            setCurrentCallId(null)
            powerDialer.advanceToNext(lastTag || undefined)
            setLastTag(null)
        } else {
            setFollowUpDate(undefined)
            resetCall()
        }
    }

    const resetCall = () => {
        setNumber('')
        setIsExpanded(false)
        setCallNotes('')
        setCurrentCallId(null)
        setContactName(null)
        setPropertyAddress(null)
        setPropertyId(null)
        setLastTag(null)
        setFollowUpDate(undefined)
        manualCallAnsweredRef.current = false
        autoCallProcessedRef.current = null
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
                onClick={() => !isPowerDialerActive && setIsExpanded(!isExpanded)}
            >
                <div className="flex items-center gap-2">
                    <div className={cn(
                        "h-2 w-2 rounded-full",
                        callState === 'live' ? "bg-green-500 animate-pulse" :
                            callState === 'ringing' ? "bg-blue-500 animate-pulse" :
                                callState === 'connecting' ? "bg-yellow-500" :
                                    isPowerDialerActive ? "bg-amber-500 animate-pulse" :
                                        deviceReady ? "bg-green-500" :
                                            "bg-zinc-300 dark:bg-zinc-600"
                    )} />
                    <span className="text-sm font-medium">
                        {isPowerDialerActive ? 'Power Dialer' : 'Dialer'}
                    </span>
                    {callState !== 'idle' && !isPowerDialerActive && (
                        <span className="text-xs text-muted-foreground ml-1">
                            {callState === 'live' ? formatDuration(duration) : callState}
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-1">
                    {/* Power Dialer button (only shown when idle and no active call) */}
                    {!isPowerDialerActive && callState === 'idle' && !pendingAutoCall && (
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-amber-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                            onClick={(e) => {
                                e.stopPropagation()
                                powerDialer.openSetup()
                            }}
                            title="Power Dialer"
                        >
                            <Zap className="h-3.5 w-3.5" />
                        </Button>
                    )}
                    {!isPowerDialerActive && (
                        isExpanded ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                            <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        )
                    )}
                </div>
            </div>

            {/* Expanded Content */}
            {isExpanded && (
                <>
                    {/* ─── Power Dialer Mode ──────────────────── */}
                    {isPowerDialerActive ? (
                        <PowerDialerControls
                            mode={powerDialer.mode}
                            currentLead={powerDialer.currentLead}
                            currentIndex={powerDialer.currentIndex}
                            totalLeads={powerDialer.queue.length}
                            currentPhone={powerDialer.currentPhone}
                            dialAttempt={powerDialer.dialAttempt}
                            smsStatus={powerDialer.smsStatus}
                            stats={powerDialer.stats}
                            callState={callState}
                            duration={duration}
                            isMuted={isMuted}
                            toggleMute={toggleMute}
                            hangUp={twilioHangUp}
                            deviceReady={deviceReady}
                            onPause={powerDialer.pauseSession}
                            onResume={powerDialer.resumeSession}
                            onStop={powerDialer.stopSession}
                            onSkip={powerDialer.skipLead}
                            onContinue={powerDialer.continueAfterAnswered}
                        />
                    ) : (
                        /* ─── Normal Manual Dialer Mode ───────── */
                        <div className="px-4 pb-4 animate-in slide-in-from-top-2 duration-200">
                            {/* Contact Info (shown when calling from property) */}
                            {(contactName || propertyAddress) && callState !== 'idle' && (
                                <div className="mb-3 p-2 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/50">
                                    <div className="flex items-center gap-2">
                                        <User className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                                        <div className="min-w-0">
                                            {contactName && (
                                                <p className="text-xs font-medium text-blue-700 dark:text-blue-300 truncate">
                                                    {contactName}
                                                </p>
                                            )}
                                            {propertyAddress && (
                                                <p className="text-xs text-blue-600/70 dark:text-blue-400/70 truncate">
                                                    {propertyAddress}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

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

                            {/* Pending auto-call indicator */}
                            {pendingAutoCall && !deviceReady && (
                                <div className="mb-3 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                    <span>Connecting to phone service...</span>
                                </div>
                            )}

                            {/* Keypad */}
                            {callState === 'idle' && !pendingAutoCall && (
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
                                {callState === 'idle' && !pendingAutoCall ? (
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
                                            disabled={!number.trim() || !deviceReady}
                                        >
                                            <Phone className="h-5 w-5" />
                                        </Button>
                                    </>
                                ) : callState === 'connecting' || pendingAutoCall ? (
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
                                                "h-10 w-10 rounded-full transition-colors",
                                                isMuted
                                                    ? "bg-red-50 border-red-200 text-red-600 dark:bg-red-950/30 dark:border-red-900/50 dark:text-red-400"
                                                    : "hover:bg-zinc-100 dark:hover:bg-zinc-800"
                                            )}
                                            onClick={toggleMute}
                                            title={isMuted ? 'Unmute' : 'Mute'}
                                        >
                                            {isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
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

                            {/* Mute label */}
                            {(callState === 'ringing' || callState === 'live') && (
                                <p className="text-center text-xs text-muted-foreground mt-2">
                                    {isMuted ? 'Muted' : 'Tap mic to mute'}
                                </p>
                            )}

                            {/* Twilio error with retry */}
                            {twilioError && !initializing && (
                                <div className="mt-3 text-center">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="text-xs"
                                        onClick={retry}
                                    >
                                        Retry Connection
                                    </Button>
                                </div>
                            )}
                        </div>
                    )}
                </>
            )}

            {/* ─── Call Notes Modal (shared by both modes) ─── */}
            <Dialog open={showNotesModal} onOpenChange={(open) => {
                if (!open && !savingNotes) {
                    skipNotesModal()
                }
            }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Call Notes</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="text-sm text-muted-foreground">
                            {isPowerDialerActive && powerDialer.currentLead ? (
                                <>
                                    <p>Called: {powerDialer.currentPhone || 'Unknown'}</p>
                                    {powerDialer.currentLead.ownerName && (
                                        <p>Contact: {powerDialer.currentLead.ownerName}</p>
                                    )}
                                    <p>Property: {powerDialer.currentLead.address}</p>
                                    <p>Duration: {formatDuration(duration)}</p>
                                </>
                            ) : (
                                <>
                                    <p>Called: {number}</p>
                                    {contactName && <p>Contact: {contactName}</p>}
                                    {propertyAddress && <p>Property: {propertyAddress}</p>}
                                    <p>Duration: {formatDuration(duration)}</p>
                                </>
                            )}
                        </div>
                        <Textarea
                            placeholder="Add notes about this call..."
                            value={callNotes}
                            onChange={(e) => setCallNotes(e.target.value)}
                            className="min-h-[120px]"
                        />
                        <div className="flex flex-wrap gap-2">
                            {QUICK_TAGS.map((tag) => (
                                <Button
                                    key={tag}
                                    variant="outline"
                                    size="sm"
                                    className={cn(
                                        "text-xs",
                                        lastTag === tag && "border-blue-500 bg-blue-50 dark:bg-blue-950/30"
                                    )}
                                    onClick={() => {
                                        setCallNotes((n) => (n ? `${n}\n${tag}` : tag))
                                        setLastTag(tag)
                                    }}
                                >
                                    {tag}
                                </Button>
                            ))}
                        </div>
                        {/* Follow-Up Date Picker */}
                        <div className="flex items-center gap-3 p-3 rounded-lg border bg-zinc-50/50 dark:bg-zinc-800/30">
                            <CalendarIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                            <div className="flex-1">
                                <p className="text-sm font-medium">Set Follow-Up</p>
                                <p className="text-xs text-muted-foreground">Schedule a date to follow up with this lead</p>
                            </div>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant="outline" size="sm" className="h-8 gap-2">
                                        <CalendarIcon className="h-3.5 w-3.5" />
                                        {followUpDate ? format(followUpDate, 'MMM d, yyyy') : 'Pick date'}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="end">
                                    <Calendar
                                        mode="single"
                                        selected={followUpDate}
                                        onSelect={setFollowUpDate}
                                        disabled={(date) => date < new Date()}
                                        initialFocus
                                    />
                                </PopoverContent>
                            </Popover>
                            {followUpDate && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 px-2 text-xs text-muted-foreground"
                                    onClick={() => setFollowUpDate(undefined)}
                                >
                                    Clear
                                </Button>
                            )}
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={skipNotesModal}>
                            Skip
                        </Button>
                        <Button onClick={saveCallNotes} disabled={savingNotes}>
                            {savingNotes && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Save & Close
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ─── Power Dialer Dialogs ──────────────────── */}
            <PowerDialerSetupDialog
                open={powerDialer.showSetupDialog}
                onOpenChange={(open) => {
                    if (!open) powerDialer.closeSetup()
                }}
                onStart={powerDialer.startSession}
                onEditTemplates={powerDialer.openTemplateEditor}
            />

            <PowerDialerSkipTraceDialog
                open={powerDialer.showSkipTraceDialog}
                lead={powerDialer.currentLead}
                disconnectedNumber={powerDialer.disconnectedNumber}
                onSkip={powerDialer.skipLead}
                onPhoneFound={powerDialer.retryAfterSkipTrace}
                onOpenChange={(open) => {
                    if (!open) powerDialer.closeSkipTrace()
                }}
            />

            <SMSTemplateEditorDialog
                open={powerDialer.showTemplateEditor}
                onOpenChange={(open) => {
                    if (!open) powerDialer.closeTemplateEditor()
                }}
            />
        </div>
    )
}
